import os
import re
import json
import time
import uuid
import zipfile
import io
import shutil
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Header, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from core.config import ROOT_DIR, SNAPSHOTS_DIR
from core.email import send_smtp_generic
from core.security import get_current_user, is_admin_user

router = APIRouter(tags=['Teams'])

def _create_labels_snapshot(category: str, note: str = "auto_backup") -> Optional[str]:
    """Toplu işlem öncesi labels/ klasörünün anlık yedeğini alır."""
    try:
        labeled_dir = ROOT_DIR / f"{category}_labeled"
        labels_dir = labeled_dir / "labels"
        if not labels_dir.exists():
            return None
        
        SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        snap_name = f"{category}_{timestamp}_{note}"
        target_dir = SNAPSHOTS_DIR / snap_name
        
        shutil.copytree(labels_dir, target_dir / "labels", dirs_exist_ok=True)
        
        meta = {
            "snapshot_id": snap_name,
            "category": category,
            "created_at": datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
            "note": note,
            "label_count": len(list(labels_dir.glob("*.txt")))
        }
        with open(target_dir / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
            
        return snap_name
    except Exception as e:
        print(f"[Snapshot Error] {e}")
        return None

def _invalidate_project_cache(category: str):
    try:
        c_file = ROOT_DIR / f"{category}_labeled" / "project_cache.json"
        if c_file.exists():
            c_file.unlink()
    except Exception:
        pass
# TEAMS_FILE kaldırıldı — tüm takım verisi artık yalnızca Cloudflare D1'de tutulur

# ═════════════════════════════════════════════════════════════════════════════
# GITHUB-STYLE TEAM, CAPTAIN & PROJECT ACCESS ENGINE (ORGANIZATIONS)
# ═════════════════════════════════════════════════════════════════════════════
from core.database import cf_d1_query

def _load_teams() -> Dict[str, Any]:
    """
    Tüm takım verilerini Cloudflare D1'den çeker.
    Yerel dosya fallback'i KASITLI OLARAK kaldırıldı — tek kayıt yeri D1'dir.
    """
    try:
        rows = cf_d1_query("SELECT id, name, captain, members, projects, created_at, pending_invites, workspace_id FROM teams")
        teams_list = []
        for r in (rows or []):
            members = json.loads(r.get("members") or "[]") if isinstance(r.get("members"), str) else (r.get("members") or [])
            projects = json.loads(r.get("projects") or "[]") if isinstance(r.get("projects"), str) else (r.get("projects") or [])
            pending_invites = json.loads(r.get("pending_invites") or "[]") if isinstance(r.get("pending_invites"), str) else (r.get("pending_invites") or [])
            teams_list.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "captain": r.get("captain"),
                "members": members,
                "projects": projects,
                "pending_invites": pending_invites,
                "created_at": r.get("created_at"),
                "workspace_id": r.get("workspace_id")
            })
        return {"teams": teams_list}
    except Exception as e:
        print(f"[D1 Load Teams Error] {e}")
        # D1 erişimi yoksa boş liste dön — yerel dosyaya asla fallback yapma
        return {"teams": []}


def _save_teams(data: Dict[str, Any]):
    """
    Takım verilerini Cloudflare D1'e kaydeder.
    Yerel dosya yazma KASITLI OLARAK kaldırıldı — tek kayıt yeri D1'dir.
    INSERT OR REPLACE yerine ON CONFLICT DO UPDATE kullanılır:
    bu sayede yalnızca değişen alanlar güncellenir, eksik field NULL'a dönmez.
    """
    try:
        for t in data.get("teams", []):
            members_str = json.dumps(t.get("members", []), ensure_ascii=False)
            projects_str = json.dumps(t.get("projects", []), ensure_ascii=False)
            pending_invites_str = json.dumps(t.get("pending_invites", []), ensure_ascii=False)
            cf_d1_query(
                "INSERT INTO teams (id, name, captain, members, projects, created_at, pending_invites, workspace_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET "
                "name=excluded.name, captain=excluded.captain, members=excluded.members, "
                "projects=excluded.projects, pending_invites=excluded.pending_invites, workspace_id=excluded.workspace_id",
                [t.get("id"), t.get("name"), t.get("captain"), members_str, projects_str, t.get("created_at"), pending_invites_str, t.get("workspace_id")]
            )
    except Exception as e:
        print(f"[D1 Save Teams Error] {e}")
        raise  # Kayıt başarısız olursa endpoint hata döndürsün



def _is_invite_expired(expires_at_str: Optional[str]) -> bool:
    """Verilen expires_at tarih dizesinin dolup dolmadığını kontrol eder (7 Gün Kuralı). UTC-aware."""
    if not expires_at_str:
        return False
    try:
        clean_str = expires_at_str.strip()
        now_utc = datetime.now(timezone.utc)
        # Önce ISO format (UTC-aware veya naive)
        try:
            exp_dt = datetime.fromisoformat(clean_str)
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            return now_utc > exp_dt
        except ValueError:
            pass
        # Legacy format desteği (eski kayıtlar için)
        for fmt in ("%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                exp_dt = datetime.strptime(clean_str, fmt).replace(tzinfo=timezone.utc)
                return now_utc > exp_dt
            except ValueError:
                continue
    except Exception:
        pass
    return False


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    initial_projects: Optional[List[str]] = None
    workspace_id: Optional[str] = None
    # Not: captain fieldı kaldırıldı. Takımı oluşturan kişi otomatik olarak kaptan olur.
    # Dışarıdan kaptan atanamaz — bu takım sahipliği güvenliğini garantiler.

@router.get("/api/teams/list")
def list_teams(scope: Optional[str] = Query(None), workspace_id: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    """Kullanıcının aktif takımlarını ve bekleyen davetlerini listeler."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    email = (user.get("email") or "").lower().strip()
    username = (user.get("username") or user.get("display_name") or "").lower().strip()
    is_adm = is_admin_user(user, email)
    all_data = _load_teams()

    # Davetlerin 7 günlük süre aşımı durumunu dinamik olarak güncelle
    for t in all_data.get("teams", []):
        for inv in t.get("pending_invites", []):
            inv["is_expired"] = _is_invite_expired(inv.get("expires_at"))
            if inv["is_expired"] and inv.get("status") != "declined":
                inv["status"] = "expired"

    # Eğer admin panelinden açıkça sistemdeki tüm takımlar istenmişse (scope=all)
    if is_adm and scope == "all":
        return all_data

    if not workspace_id:
        try:
            ws_rows = cf_d1_query("SELECT id FROM workspaces WHERE owner_email = ? ORDER BY created_at ASC LIMIT 1", [email])
            if ws_rows and ws_rows[0].get("id"):
                workspace_id = ws_rows[0]["id"]
        except Exception:
            pass

    filtered_teams = []
    my_invitations = []

    for t in all_data.get("teams", []):
        captain = (t.get("captain") or "").lower().strip()
        is_captain = bool(email and email == captain) or bool(username and username == captain)

        # Resmi üyelik kontrolü (daveti kabul edip takıma dahil olmuş üyeler)
        is_member = False
        for m in t.get("members", []):
            m_email = (m.get("email") or "").lower().strip()
            m_user = (m.get("username") or "").lower().strip()
            if (email and m_email == email) or (username and m_user == username) or (email and m_user == email):
                is_member = True
                break

        # Kaptan veya resmi üye ise çalışma alanı filtresine göre ekle
        if is_captain or is_member:
            if workspace_id:
                if workspace_id.startswith("ws_team_"):
                    # Takım Workspace'inde sadece o takımın kendisi görünür
                    target_tid = workspace_id.replace("ws_team_", "")
                    if t.get("id") != target_tid:
                        continue
                else:
                    # Kişisel/Özel Workspace'te yalnızca kullanıcının kurduğu/kaptanı olduğu takımlar görünür
                    # Başkalarının kurduğu (kullanıcının sadece üye olduğu) takımlar kişisel çalışma alanına sızamaz
                    if not is_captain:
                        continue
                    t_ws = t.get("workspace_id")
                    if t_ws and t_ws != workspace_id:
                        continue
            filtered_teams.append(t)

        # Bekleyen davet kontrolü: Kullanıcı henüz takıma katılmamış ama bekleyen daveti var mı?
        for inv in t.get("pending_invites", []):
            inv_email = (inv.get("email") or "").lower().strip()
            inv_user = (inv.get("invitee") or "").lower().strip().lstrip("@")
            inv_status = inv.get("status", "pending")
            is_expired = inv.get("is_expired", False)

            target_matches = bool(
                (email and inv_email and email == inv_email) or
                (username and inv_user and username == inv_user) or
                (email and inv_user and email == inv_user)
            )

            # Davet bu kullanıcıya ait, süresi dolmamış, reddedilmemiş ve henüz takıma katılmamışsa
            if target_matches and not is_member and not is_captain and inv_status == "pending" and not is_expired:
                my_invitations.append({
                    "invite_id": inv.get("invite_id"),
                    "team_id": t.get("id"),
                    "team_name": t.get("name"),
                    "captain": t.get("captain", "Yönetici"),
                    "role": inv.get("role", "annotator"),
                    "invited_by": inv.get("invited_by", t.get("captain")),
                    "invited_at": inv.get("invited_at"),
                    "expires_at": inv.get("expires_at"),
                    "token": inv.get("token")
                })

    return {
        "teams": filtered_teams,
        "my_invitations": my_invitations
    }

@router.post("/api/teams/create")
def create_team(req: CreateTeamRequest, authorization: Optional[str] = Header(None)):
    """GitHub Organizasyonu gibi yeni bir takım oluşturur. Oluşturan kaptan olur."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    user_email = (user.get("email") or "").lower().strip()
    user_username = (user.get("username") or user.get("display_name") or user_email.split('@')[0] or "user").strip()
    user_display = (user.get("display_name") or user_username or user_email).strip()

    # Takımı oluşturan kişi, platform admini de olsa normal kullanıcı da olsa o takımın kurucu Kaptanıdır.
    # captain alanı DAIMA email ile saklanır — username değil. Bu, tüm permission check'lerini basitleştirir.
    captain_identifier = user_email  # email standart kimlik alanı

    data = _load_teams()
    # Zaman tabanlı ID yerine UUID — çakışma riski sıfır
    team_id = f"team_{uuid.uuid4().hex[:16]}"
    new_team = {
        "id": team_id,
        "name": req.name,
        "captain": captain_identifier,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "members": [
            {
                "email": user_email,
                "username": user_username,
                "display_name": f"{user_display} (Kaptan)",
                "role": "captain",
                "joined_at": datetime.now(timezone.utc).isoformat()
            }
        ],
        "projects": req.initial_projects or [],
        "workspace_id": req.workspace_id or None
    }
    data["teams"].append(new_team)
    _save_teams(data)
    return {"status": "ok", "message": f"'{req.name}' takımı başarıyla oluşturuldu!", "team": new_team}


class AddMemberRequest(BaseModel):
    team_id: str
    username: str
    email: Optional[str] = None        # BUG-1: email artık şemada
    display_name: Optional[str] = None
    role: str = "annotator"   # "captain" | "reviewer" | "annotator"

@router.post("/api/teams/add-member")
def add_team_member(req: AddMemberRequest, authorization: Optional[str] = Header(None)):
    """Takım kaptanının veya yöneticinin takıma yeni üye eklemesini sağlar."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    # BUG-1: Eklenecek kullanıcının e-postasını D1'den çek (check_project_permission için zorunlu)
    resolved_email = (req.email or "").strip().lower()
    if not resolved_email:
        try:
            from core.security import cf_d1_query
            rows = cf_d1_query(
                "SELECT email FROM users WHERE LOWER(display_name) = ? OR LOWER(email) = ? LIMIT 1",
                [req.username.lower(), req.username.lower()]
            )
            if rows:
                resolved_email = (rows[0].get("email") or "").strip().lower()
        except Exception as e:
            print(f"[add_team_member D1 lookup] {e}")

    data = _load_teams()
    for team in data.get("teams", []):
        if team.get("id") == req.team_id:
            captain = (team.get("captain") or "").lower()
            if not is_adm and user_email != captain:
                raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya yönetici üye ekleyebilir.")

            # Kullanıcı zaten var mı? → rolünü güncelle, email'i de düzelt
            for m in team.get("members", []):
                if m.get("username", "").lower() == req.username.lower():
                    m["role"] = req.role
                    if resolved_email and not m.get("email"):
                        m["email"] = resolved_email  # Eksik email'i tamamla
                    _save_teams(data)
                    return {"status": "ok", "message": f"'{req.username}' kullanıcısının rolü '{req.role}' olarak güncellendi."}

            # Yeni üye ekle — email dahil
            team.setdefault("members", []).append({
                "username": req.username,
                "email": resolved_email or req.username,
                "display_name": req.display_name or req.username.capitalize(),
                "role": req.role,
                "joined_at": datetime.now().strftime("%d.%m.%Y")
            })
            _save_teams(data)
            return {"status": "ok", "message": f"'{req.username}' takıma başarıyla eklendi."}

    raise HTTPException(status_code=404, detail="Takım bulunamadı.")


# ─────────────────────────────────────────────────────────────────────────────
# GITHUB-STYLE EMAIL & INVITATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────


def _send_invitation_email(to_address: str, team_name: str, role: str, inviter: str, invite_link: str) -> bool:
    """T-Sistem altyapısını kullanarak şık HTML davet e-postası gönderir."""
    role_tr = {"captain": "Kaptan Yardımcısı", "reviewer": "Denetçi (Reviewer)", "annotator": "Etiketleyici (Annotator)"}.get(role, role)

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 30px; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }}
        .logo {{ font-size: 1.2rem; font-weight: 800; color: #38bdf8; margin-bottom: 20px; letter-spacing: -0.02em; }}
        h1 {{ font-size: 1.3rem; color: #f8fafc; margin-top: 0; }}
        p {{ font-size: 0.92rem; color: #94a3b8; line-height: 1.6; }}
        .role-badge {{ display: inline-block; background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 4px 12px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; margin: 10px 0; }}
        .btn {{ display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 0.95rem; margin: 20px 0; }}
        .footer {{ margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; font-size: 0.75rem; color: #64748b; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚡ YOLO Dataset Platform</div>
        <h1>Takım Daveti</h1>
        <p>Merhaba,</p>
        <p><strong>@{inviter}</strong>, sizi <strong>"{team_name}"</strong> etiketleme ve yapay zeka geliştirme takımına katılmaya davet etti.</p>
        <p>Atanan Rol: <br><span class="role-badge">{role_tr}</span></p>
        <p>Bu daveti kabul ederek projelerdeki görselleri etiketlemeye, denetlemeye ve takımla ortak çalışmaya hemen başlayabilirsiniz.</p>
        <a href="{invite_link}" class="btn">Daveti Kabul Et ve Takıma Katıl</a>
        <div class="footer">
          <p>Eğer bu daveti beklemiyorsanız bu e-postayı görmezden gelebilirsiniz.<br>Bağlantı: <a href="{invite_link}" style="color:#38bdf8;">{invite_link}</a></p>
        </div>
      </div>
    </body>
    </html>
    """

    ok, msg = send_smtp_generic(to_address, f"Davet: '{team_name}' takımına davet edildiniz", html_content)
    return ok


class TestEmailRequest(BaseModel):
    to_email: str

@router.post("/api/teams/test-email")
def test_send_email(req: TestEmailRequest, authorization: Optional[str] = Header(None)):
    """T-Sistem SMTP altyapısının test edilmesini sağlar. Sadece admin yetkilidir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    if not is_admin_user(user, user_email):
        raise HTTPException(status_code=403, detail="Yalnızca sistem yöneticisi SMTP testi yapabilir.")

    subject = "⚡ YOLO Platformu — SMTP Test E-Postası"
    html = f"""
    <div style="font-family:sans-serif; background:#090d16; color:#fff; padding:24px; border-radius:12px; border:1px solid #38bdf8;">
      <h2 style="color:#38bdf8; margin-top:0;">T-Sistem SMTP Altyapısı Başarıyla Bağlandı! ✓</h2>
      <p>Bu e-posta, yapılandırılmış olan Gmail SMTP sunucusu üzerinden gönderilmiştir.</p>
      <p style="color:#94a3b8; font-size:0.85rem;">Tarih: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}</p>
    </div>
    """
    ok, msg = send_smtp_generic(req.to_email, subject, html)
    if not ok:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "ok", "message": f"Test e-postası '{req.to_email}' adresine başarıyla gönderildi!"}


class InviteMemberRequest(BaseModel):
    team_id: str
    invitee: str               # E-posta (örn: ali@ornek.com) veya kullanıcı adı (@alican)
    role: str = "annotator"    # "captain" | "reviewer" | "annotator"
    invited_by: Optional[str] = "admin"

@router.post("/api/teams/invite-member")
def invite_team_member(req: InviteMemberRequest, request: Request, authorization: Optional[str] = Header(None)):
    """GitHub gibi kullanıcı adı veya e-posta ile takıma davet gönderir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    data = _load_teams()
    target_team = None
    for team in data.get("teams", []):
        if team.get("id") == req.team_id:
            target_team = team
            break

    if not target_team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı.")

    captain = (target_team.get("captain") or "").lower()
    if not is_adm and user_email != captain:
        raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya sistem yöneticisi davet gönderebilir.")

    invitee_clean = req.invitee.strip().lstrip("@")
    is_email = "@" in invitee_clean

    # Sistemde kayıtlı kullanıcı mı kontrolü (Cloudflare D1 / Local DB)
    from core.security import find_user_by_email
    target_user = find_user_by_email(None, invitee_clean) if is_email else None
    if not target_user:
        # Email değilse veya bulunamadıysa D1 kullanıcı adı / email üzerinden tekrar ara
        try:
            from core.security import cf_d1_query
            user_rows = cf_d1_query(
                "SELECT id, email, display_name FROM users WHERE LOWER(email) = ? OR LOWER(display_name) = ? LIMIT 1",
                [invitee_clean.lower(), invitee_clean.lower()]
            )
            if user_rows and len(user_rows) > 0:
                target_user = user_rows[0]
        except Exception as e:
            print(f"[D1 User Search Error] {e}")

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail=f"'{invitee_clean}' sistemde kayıtlı bir kullanıcı değildir. Takıma yalnızca platformda kayıtlı üyeler eklenebilir."
        )

    # Hedef kullanıcının gerçek e-posta ve adı
    target_email = target_user.get("email") or invitee_clean
    target_display_name = target_user.get("display_name") or target_email.split("@")[0]

    # Zaten üye mi?
    for m in target_team.get("members", []):
        if (m.get("username", "").lower() in (invitee_clean.lower(), target_email.lower()) or 
            m.get("email", "").lower() in (invitee_clean.lower(), target_email.lower())):
            raise HTTPException(status_code=400, detail=f"'{target_display_name}' zaten bu takımın aktif bir üyesidir.")

    # Zaten bekleyen aktif daveti var mı? (Reddedilenler yeniden davet edilebilir)
    pending = target_team.setdefault("pending_invites", [])
    active_inv = None
    for inv in pending:
        if (inv.get("invitee", "").lower() in (invitee_clean.lower(), target_email.lower()) or 
            inv.get("email", "").lower() in (invitee_clean.lower(), target_email.lower())):
            if inv.get("status") != "declined":
                raise HTTPException(status_code=400, detail=f"'{target_display_name}' için zaten gönderilmiş ve bekleyen bir davet bulunmaktadır.")
            else:
                active_inv = inv

    token = str(uuid.uuid4())
    invite_id = f"inv_{int(time.time())}_{token[:8]}"
    now = datetime.now()
    expires_at = (now + timedelta(days=7)).strftime("%d.%m.%Y %H:%M")

    # Invite link (İsteğin geldiği gerçek Cloudflare veya yerel adres)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
    base_url = f"{proto}://{host}"
    invite_link = f"{base_url}/?accept_invite={token}&team={target_team['id']}"

    # E-posta gönderim denemesi
    email_target = target_email
    email_sent = _send_invitation_email(
        to_address=email_target,
        team_name=target_team.get("name", "Etiketleme Takımı"),
        role=req.role,
        inviter=user_email or req.invited_by or "admin",
        invite_link=invite_link
    )

    new_invite = {
        "invite_id": invite_id,
        "invitee": target_display_name,
        "email": target_email,
        "is_email": True,
        "role": req.role,
        "status": "pending",
        "token": token,
        "invited_by": user_email or req.invited_by or "admin",
        "invited_at": now.strftime("%d.%m.%Y %H:%M"),
        "expires_at": expires_at,
        "email_sent": email_sent,
        "invite_link": invite_link
    }

    if active_inv:
        # Daha önce reddedilen davetin yerine yeni aktif daveti koy
        pending.remove(active_inv)
    pending.append(new_invite)
    _save_teams(data)

    msg = f"'{target_display_name}' ({target_email}) kullanıcısına davet e-postası iletildi." if email_sent else f"'{target_display_name}' için davet oluşturuldu."
    return {
        "status": "ok",
        "message": msg,
        "invite": new_invite,
        "email_sent": email_sent,
        "invite_link": invite_link
    }


class CancelInviteRequest(BaseModel):
    team_id: str
    invite_id: str

@router.post("/api/teams/cancel-invite")
def cancel_team_invitation(req: CancelInviteRequest, authorization: Optional[str] = Header(None)):
    """Bekleyen bir daveti iptal eder (Revoke invitation)."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    data = _load_teams()
    for team in data.get("teams", []):
        if team.get("id") == req.team_id:
            captain = (team.get("captain") or "").lower()
            if not is_adm and user_email != captain:
                raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya yönetici daveti iptal edebilir.")
            pending = team.get("pending_invites", [])
            orig_len = len(pending)
            team["pending_invites"] = [i for i in pending if i.get("invite_id") != req.invite_id]
            if len(team["pending_invites"]) < orig_len:
                _save_teams(data)
                return {"status": "ok", "message": "Davet başarıyla iptal edildi."}
            else:
                raise HTTPException(status_code=404, detail="Belirtilen davet kaydı bulunamadı.")

    raise HTTPException(status_code=404, detail="Takım bulunamadı.")


class AcceptInviteRequest(BaseModel):
    token: str
    username: Optional[str] = None
    display_name: Optional[str] = None

@router.get("/api/teams/invite-info")
def get_invite_info(token: str):
    """Davet token'ına ait takım ve rol bilgilerini oturum gerektirmeden doğrular (GitHub Davet Karşılama Kartı için)."""
    if not token or not token.strip():
        raise HTTPException(status_code=400, detail="Davet kodu belirtilmedi.")
    
    clean_token = token.strip()
    data = _load_teams()
    for team in data.get("teams", []):
        for inv in team.get("pending_invites", []):
            if inv.get("token") == clean_token:
                is_expired = _is_invite_expired(inv.get("expires_at"))
                raw_status = inv.get("status", "pending")
                current_status = "expired" if is_expired else raw_status
                is_valid = (not is_expired) and (current_status != "declined")

                return {
                    "status": "ok",
                    "valid": is_valid,
                    "is_expired": is_expired,
                    "invite_status": current_status,
                    "team_id": team.get("id"),
                    "team_name": team.get("name"),
                    "captain": team.get("captain", "admin"),
                    "role": inv.get("role", "annotator"),
                    "invitee": inv.get("invitee"),
                    "email": inv.get("email"),
                    "invited_by": inv.get("invited_by"),
                    "invited_at": inv.get("invited_at"),
                    "declined_at": inv.get("declined_at"),
                    "expires_at": inv.get("expires_at")
                }
    raise HTTPException(status_code=404, detail="Geçersiz, süresi dolmuş veya daha önce kullanılmış bir davet bağlantısı.")


@router.post("/api/teams/accept-invite")
def accept_team_invitation(req: AcceptInviteRequest, authorization: Optional[str] = Header(None)):
    """Davet bağlantısına tıklayan kullanıcının takıma resmi katılımını onaylar."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Daveti kabul edebilmek için lütfen önce hesabınıza giriş yapınız.")

    current_email = (user.get("email") or "").lower()
    current_username = (user.get("username") or user.get("display_name") or current_email.split("@")[0]).lower()

    data = _load_teams()
    for team in data.get("teams", []):
        pending = team.get("pending_invites", [])
        for inv in pending:
            if inv.get("token") == req.token:
                # 1. SÜRE AŞIMI KONTROLÜ (7 Günlük Güvenlik Sınırı)
                if _is_invite_expired(inv.get("expires_at")):
                    raise HTTPException(
                        status_code=410,
                        detail="Bu davet bağlantısının 7 günlük geçerlilik süresi dolmuştur. Lütfen takım kaptanınızdan yeni bir davet talep ediniz."
                    )

                # 2. REDDEDİLME DURUMU
                if inv.get("status") == "declined":
                    raise HTTPException(
                        status_code=400,
                        detail="Bu davet daha önce reddedilmiştir. Takıma katılabilmek için takım kaptanınızın yeni bir davet göndermesi gerekir."
                    )

                # 3. GÜVENLİK KONTROLÜ (GitHub Standartı): Davet edilen hesap ile oturum açan hesap birebir uyuşmalıdır!
                inv_email = (inv.get("email") or "").lower()
                inv_user = (inv.get("invitee") or "").lower().lstrip("@")

                email_matches = bool(current_email and inv_email and current_email == inv_email)
                user_matches = bool(current_username and inv_user and current_username == inv_user)
                direct_matches = bool(current_email and inv_user and current_email == inv_user)

                if not (email_matches or user_matches or direct_matches):
                    target_display = inv_email or inv_user
                    raise HTTPException(
                        status_code=403,
                        detail=f"Bu davet '{target_display}' hesabına gönderilmiştir. Şu anda '{current_email}' olarak oturum açtınız. Daveti kabul edebilmek için lütfen '{target_display}' hesabınızla giriş yapınız."
                    )

                # Davet geçerli ve hesap doğrulandı! Üyeler arasına ekle
                uname = user.get("username") or current_username or inv.get("invitee")
                display = user.get("display_name") or req.display_name or uname.capitalize()
                
                # pending'den çıkar
                team["pending_invites"] = [i for i in pending if i.get("token") != req.token]
                
                # member olarak ekle
                member_email = current_email or inv_email
                team.setdefault("members", []).append({
                    "username": uname,
                    "email": member_email,
                    "display_name": display,
                    "role": inv.get("role", "annotator"),
                    "joined_at": datetime.now().strftime("%d.%m.%Y")
                })
                _save_teams(data)
                return {
                    "status": "ok",
                    "message": f"'{team.get('name')}' takımına başarıyla katıldınız!",
                    "team_id": team.get("id"),
                    "team_name": team.get("name")
                }

    raise HTTPException(status_code=404, detail="Geçersiz veya süresi dolmuş davet bağlantısı.")


class DeclineInviteRequest(BaseModel):
    token: str

@router.post("/api/teams/decline-invite")
def decline_team_invitation(req: DeclineInviteRequest, authorization: Optional[str] = Header(None)):
    """Kullanıcının daveti reddetmesini sağlar. Yalnızca davet edilen hesabın sahibi bu daveti reddedebilir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Daveti reddedebilmek için lütfen önce ilgili hesabınızla oturum açınız.")

    current_email = (user.get("email") or "").lower()
    current_username = (user.get("username") or user.get("display_name") or current_email.split("@")[0]).lower()

    data = _load_teams()
    for team in data.get("teams", []):
        pending = team.get("pending_invites", [])
        for inv in pending:
            if inv.get("token") == req.token:
                # GÜVENLİK KONTROLÜ: Davet edilen hesap ile oturum açan hesap eşleşmeli
                inv_email = (inv.get("email") or "").lower()
                inv_user = (inv.get("invitee") or "").lower().lstrip("@")

                email_matches = bool(current_email and inv_email and current_email == inv_email)
                user_matches = bool(current_username and inv_user and current_username == inv_user)
                direct_matches = bool(current_email and inv_user and current_email == inv_user)

                if not (email_matches or user_matches or direct_matches):
                    target_display = inv_email or inv_user
                    raise HTTPException(
                        status_code=403,
                        detail=f"Bu davet '{target_display}' hesabına gönderilmiştir. '{current_email}' olarak bu daveti reddedemezsiniz. Lütfen ilgili hesapla giriş yapınız."
                    )

                inv["status"] = "declined"
                inv["declined_at"] = datetime.now().strftime("%d.%m.%Y %H:%M")
                inv["declined_by"] = current_email or current_username
                _save_teams(data)
                return {
                    "status": "ok",
                    "message": f"'{team.get('name')}' takımına ait davet reddedildi."
                }
    raise HTTPException(status_code=404, detail="Davet bulunamadı.")



class RemoveMemberRequest(BaseModel):
    team_id: str
    email: str  # Birincil kimlik her zaman email. Username fallback — eski kayıtlar için.

@router.post("/api/teams/remove-member")
def remove_team_member(req: RemoveMemberRequest, authorization: Optional[str] = Header(None)):
    """Takımdan üye çıkarır. Kaptan kendini çıkaramaz; önce kapta nlığı devretmesi gerekir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    target_email = req.email.strip().lower()

    data = _load_teams()
    for team in data.get("teams", []):
        if team.get("id") == req.team_id:
            captain = (team.get("captain") or "").lower()
            if not is_adm and user_email != captain:
                raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya yönetici üye çıkarabilir.")

            # Kaptan email ile kontrol ediliyor — kaptana ayrı işlem
            if captain == target_email:
                raise HTTPException(
                    status_code=400,
                    detail="Takım kaptanı takımdan çıkarılamaz. Önce 'Kapta nlığı Devret' işlemini yapınız."
                )

            orig_len = len(team.get("members", []))
            # İlk email eşleşmesine bak, bulamazsa username fallback (eski kayıtlar)
            team["members"] = [
                m for m in team.get("members", [])
                if not (
                    (m.get("email") or "").lower() == target_email or
                    (not m.get("email") and (m.get("username") or "").lower() == target_email)
                )
            ]
            if len(team["members"]) < orig_len:
                _save_teams(data)
                return {"status": "ok", "message": f"'{target_email}' takımdan çıkarıldı."}
            else:
                raise HTTPException(status_code=404, detail="Kullanıcı bu takımda bulunamadı.")

    raise HTTPException(status_code=404, detail="Takım bulunamadı.")


class AssignProjectTeamRequest(BaseModel):
    team_id: str
    project_category: str
    action: str = "add"  # "add" | "remove"

@router.post("/api/teams/assign-project")
def assign_project_to_team(req: AssignProjectTeamRequest, authorization: Optional[str] = Header(None)):
    """GitHub Repository Collaborator gibi bir projeyi takıma atar veya erişimini kaldırır."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    data = _load_teams()
    for team in data.get("teams", []):
        if team.get("id") == req.team_id:
            captain = (team.get("captain") or "").strip().lower()
            # BUG-3: Admin de proje atayabilmeli; yoksa admin kendi takımlarını yönetemez
            if not is_adm and user_email != captain:
                raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya sistem yöneticisi projenin takım erişimini değiştirebilir.")

            projects = team.setdefault("projects", [])
            if req.action == "add":
                if req.project_category not in projects:
                    projects.append(req.project_category)
                    _save_teams(data)
                return {"status": "ok", "message": f"'{req.project_category}' projesine takım erişim izni verildi."}
            elif req.action == "remove":
                if req.project_category in projects:
                    projects.remove(req.project_category)
                    _save_teams(data)
                return {"status": "ok", "message": f"'{req.project_category}' projesinden takım erişim izni kaldırıldı."}

    raise HTTPException(status_code=404, detail="Takım bulunamadı.")


class TransferCaptaincyRequest(BaseModel):
    team_id: str
    new_captain_email: str  # Email kesin kimlik. Username artık kabul edilmiyor.

@router.post("/api/teams/transfer-captaincy")
def transfer_team_captaincy(req: TransferCaptaincyRequest, authorization: Optional[str] = Header(None)):
    """Takım kaptanlığını başka bir üyeye devreder. Yeni kaptan email ile belirtilir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    new_captain_email = req.new_captain_email.strip().lower()
    if not new_captain_email or "@" not in new_captain_email:
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi giriniz.")

    data = _load_teams()
    for team in data.get("teams", []):
        if team.get("id") == req.team_id:
            captain = (team.get("captain") or "").lower()
            if not is_adm and user_email != captain:
                raise HTTPException(status_code=403, detail="Yalnızca mevcut takım kaptanı veya yönetici kaptanlığı devredebilir.")

            if new_captain_email == captain:
                raise HTTPException(status_code=400, detail="Bu kişi zaten takım kaptanıdır.")

            # Yeni kaptan takım üyeleri arasında email ile ara
            member_found = False
            new_captain_display = new_captain_email  # fallback
            for m in team.get("members", []):
                m_email = (m.get("email") or "").lower()
                m_user = (m.get("username") or "").lower()
                # Email eşleşmesi birincil, username fallback (eski kayıtlar)
                if m_email == new_captain_email or (not m_email and m_user == new_captain_email):
                    m["role"] = "captain"
                    new_captain_display = m.get("display_name") or m_email
                    member_found = True
                elif m.get("role") == "captain":
                    # Eski kaptan üye kalıyor, rolü reviewer'a düşür
                    m["role"] = "reviewer"

            if not member_found:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{new_captain_email}' takım üyeleri arasında bulunamadı. Kaptanlık devredilebilmek için kişinin önce takıma üye olması gerekir."
                )

            # captain alanı her zaman email ile güncelleniyor
            team["captain"] = new_captain_email
            _save_teams(data)
            return {
                "status": "ok",
                "message": f"Takım kaptanlığı '{new_captain_display}' kullanıcısına devredildi.",
                "new_captain_email": new_captain_email
            }

    raise HTTPException(status_code=404, detail="Takım bulunamadı.")


# ═════════════════════════════════════════════════════════════════════════════
# ADMIN TASK DISPATCH, WORKFLOW & SUBMISSION ENGINE (YÖNETİCİ GÖREV DAĞITIM & ONAY)
# ═════════════════════════════════════════════════════════════════════════════
# TEAM_TASKS_FILE kaldırıldı — tüm görev verisi artık yalnızca Cloudflare D1'de tutulur

def _load_team_tasks() -> List[Dict[str, Any]]:
    """
    Görev verilerini Cloudflare D1'den çeker.
    Yerel dosya fallback'i KASITLI OLARAK kaldırıldı — tek kayıt yeri D1'dir.
    """
    try:
        rows = cf_d1_query(
            "SELECT id, team_id, category, assigned_to, status, images, created_at, "
            "submitted_at, reviewed_at, admin_feedback, user_note FROM team_tasks"
        )
        task_list = []
        for r in (rows or []):
            imgs = json.loads(r.get("images") or "[]") if isinstance(r.get("images"), str) else (r.get("images") or [])
            task_list.append({
                "id": r.get("id"),
                "team_id": r.get("team_id"),
                "category": r.get("category"),
                "assigned_to": r.get("assigned_to"),
                "status": r.get("status", "assigned"),
                "images": imgs,
                "created_at": r.get("created_at"),
                "submitted_at": r.get("submitted_at"),
                "reviewed_at": r.get("reviewed_at"),
                "admin_feedback": r.get("admin_feedback"),
                "user_note": r.get("user_note")
            })
        return task_list
    except Exception as e:
        print(f"[D1 Load Tasks Error] {e}")
        # D1 erişimi yoksa boş liste dön — yerel dosyaya asla fallback yapma
        return []


def _save_team_task(task: Dict[str, Any]):
    """
    Tek bir görevi Cloudflare D1'e kaydeder (upsert).
    Yerel dosya yazma KASITLI OLARAK kaldırıldı — tek kayıt yeri D1'dir.
    """
    imgs_str = json.dumps(task.get("images", []), ensure_ascii=False)
    cf_d1_query(
        "INSERT OR REPLACE INTO team_tasks "
        "(id, team_id, category, assigned_to, status, images, created_at, submitted_at, reviewed_at, admin_feedback, user_note) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            task.get("id"), task.get("team_id"), task.get("category"),
            task.get("assigned_to"), task.get("status", "assigned"), imgs_str,
            task.get("created_at"), task.get("submitted_at"), task.get("reviewed_at"),
            task.get("admin_feedback"), task.get("user_note")
        ]
    )


def _save_team_tasks(tasks: List[Dict[str, Any]]):
    """
    Görev listesini toplu olarak Cloudflare D1'e kaydeder.
    Yerel dosya yazma KASITLI OLARAK kaldırıldı — tek kayıt yeri D1'dir.
    """
    for t in tasks:
        try:
            _save_team_task(t)
        except Exception as e:
            print(f"[D1 Save Task Error] task_id={t.get('id')} → {e}")


@router.get("/api/team/dataset-dispatch-stats")
def get_dataset_dispatch_stats(category: str, team_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """
    Veri setinin gerçek yapısına (toplam, etiketli, boşta kalan, kilitli) göre
    dinamik ve akıllı görev dağıtım metrikleri üretir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_imgs = [f.name for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext]
    total_imgs = len(all_imgs)

    # Başkasına atanmış aktif görevler
    tasks = _load_team_tasks()
    assigned_imgs = set()
    for t in tasks:
        if t.get("status") in ["assigned", "submitted"] and t.get("category") == category:
            assigned_imgs.update(t.get("images", []))

    # Etiketli vs Etiketsiz Ayrımı
    labeled_count = 0
    unlabeled_imgs = []
    for img_name in all_imgs:
        stem = os.path.splitext(img_name)[0]
        txt_path = labels_dir / f"{stem}.txt"
        if txt_path.exists() and txt_path.stat().st_size > 0:
            labeled_count += 1
        else:
            if img_name not in assigned_imgs:
                unlabeled_imgs.append(img_name)

    available_unlabeled = len(unlabeled_imgs)

    # Takım üye sayısını bul (eşit paylaştırma için)
    team_members_count = 1
    if team_id:
        teams_data = _load_teams()
        for t in teams_data.get("teams", []):
            if t.get("id") == team_id:
                team_members_count = max(1, len(t.get("members", [])))
                break

    equal_share = max(1, available_unlabeled // team_members_count) if available_unlabeled > 0 else 0

    return {
        "status": "ok",
        "category": category,
        "total_images": total_imgs,
        "labeled_count": labeled_count,
        "assigned_in_progress": len(assigned_imgs),
        "available_unlabeled": available_unlabeled,
        "team_members_count": team_members_count,
        "suggestions": {
            "equal_share": equal_share,
            "percent_10": max(1, int(available_unlabeled * 0.10)) if available_unlabeled > 0 else 0,
            "percent_25": max(1, int(available_unlabeled * 0.25)) if available_unlabeled > 0 else 0,
            "percent_50": max(1, int(available_unlabeled * 0.50)) if available_unlabeled > 0 else 0,
            "all_remaining": available_unlabeled,
            "qa_sample": max(1, min(50, int(labeled_count * 0.10))) if labeled_count > 0 else 0
        }
    }


class DispatchTaskRequest(BaseModel):
    category: str
    assigned_to: str              # Gönderilecek çalışan (örn: "ahmet")
    assigned_by: Optional[str] = "admin"
    count: int = 50               # Gönderilecek görsel adedi
    is_qa_review: bool = False    # True ise etiketlenmişlerden denetim/QA örneklemi seçer
    note: Optional[str] = "Lütfen nesneleri kenarlara tam oturacak şekilde sıkı etiketleyiniz."

@router.post("/api/team/dispatch-task")
def dispatch_task_to_user(req: DispatchTaskRequest, authorization: Optional[str] = Header(None)):
    """
    Admin veya Takım Kaptanı projedeki boş/etiketsiz görselleri veya denetçi için QA örneklemini
    personele kilitler.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = (user.get("email") or "").lower().strip()
    user_username = (user.get("username") or user.get("display_name") or (user_email.split("@")[0] if user_email else "")).lower().strip()
    is_adm = is_admin_user(user, user_email)

    # İlgili projenin atandığı takımlarda veya genel projede kaptan/admin/yetkili mi kontrol et
    teams_data = _load_teams()
    is_cap = False
    for t in teams_data.get("teams", []):
        t_captain = (t.get("captain") or "").lower().strip()
        captain_matches = bool(user_email and t_captain == user_email) or bool(user_username and t_captain == user_username)
        # Proje bu takıma atanmış mı veya kullanıcı bu takımın kaptanı mı?
        if req.category in t.get("projects", []) or not t.get("projects"):
            if captain_matches:
                is_cap = True
                break
            for m in t.get("members", []):
                m_email = (m.get("email") or "").lower().strip()
                m_user = (m.get("username") or "").lower().strip()
                if (user_email and m_email == user_email) or (user_username and m_user == user_username):
                    if m.get("role") in ["captain", "owner", "admin"]:
                        is_cap = True
                        break
            if is_cap:
                break
        elif captain_matches:
            # Kullanıcı herhangi bir takımın kaptanıysa projeyi otomatik olarak o takıma da bağla
            if req.category not in t.get("projects", []):
                t.setdefault("projects", []).append(req.category)
                _save_teams(teams_data)
            is_cap = True
            break

    if not is_adm and not is_cap:
        raise HTTPException(status_code=403, detail="Yalnızca proje yöneticisi veya takım kaptanı görev dağıtabilir.")

    cat_dir = ROOT_DIR / req.category
    labels_dir = ROOT_DIR / f"{req.category}_labeled" / "labels"
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    # Güvenlik: assigned_to bu projeye atanmış bir takımın üyesi veya kaptan olmalı.
    # Admin bypass: admin herhangi birine atayabilir.
    if not is_adm:
        assigned_lower = req.assigned_to.strip().lower()
        is_valid_assignee = False
        for t in teams_data.get("teams", []):
            if req.category in t.get("projects", []) or not t.get("projects"):
                if (t.get("captain") or "").lower() == assigned_lower:
                    is_valid_assignee = True
                    break
                for m in t.get("members", []):
                    m_email = (m.get("email") or "").lower()
                    m_user = (m.get("username") or "").lower()
                    if assigned_lower in (m_email, m_user):
                        is_valid_assignee = True
                        break
            if is_valid_assignee:
                break
        if not is_valid_assignee:
            raise HTTPException(
                status_code=400,
                detail=f"'{req.assigned_to}' bu projeye atanmış bir takımın üyesi değil. Önce takıma eklenmesi gerekiyor."
            )

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_imgs = sorted([f.name for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext])

    # Hali hazırda başkasına atanmış görevlerdeki resimleri bul
    tasks = _load_team_tasks()
    already_assigned = set()
    for t in tasks:
        if t.get("status") in ["assigned", "submitted"] and t.get("category") == req.category:
            already_assigned.update(t.get("images", []))

    selected_imgs = []

    if req.is_qa_review:
        # DENETÇİ (QA) MODU: Zaten etiketlenmiş görsellerden örneklem seç (Audit Sample)
        labeled_pool = []
        for img_name in all_imgs:
            stem = os.path.splitext(img_name)[0]
            txt_path = labels_dir / f"{stem}.txt"
            if txt_path.exists() and txt_path.stat().st_size > 0:
                labeled_pool.append(img_name)
        
        import random
        random.seed(int(time.time()))
        sample_size = min(req.count, len(labeled_pool))
        selected_imgs = random.sample(labeled_pool, sample_size) if labeled_pool else []
    else:
        # ETİKETLEYİCİ MODU: Gerçek ham ve boş görselleri seç
        for img_name in all_imgs:
            if img_name in already_assigned:
                continue
            stem = os.path.splitext(img_name)[0]
            txt_path = labels_dir / f"{stem}.txt"
            if not txt_path.exists() or txt_path.stat().st_size == 0:
                selected_imgs.append(img_name)
                if len(selected_imgs) >= req.count:
                    break

        # Eğer etiketsiz kalmadıysa genel görsellerden seç (fallback)
        if not selected_imgs:
            for img_name in all_imgs:
                if img_name not in already_assigned:
                    selected_imgs.append(img_name)
                    if len(selected_imgs) >= req.count:
                        break

    if not selected_imgs:
        detail_msg = "Denetlenebilecek etiketli görsel bulunamadı." if req.is_qa_review else "Atanabilecek boş ham görsel kalmadı."
        raise HTTPException(status_code=400, detail=detail_msg)

    task_type_label = "Denetim (QA)" if req.is_qa_review else "Etiketleme"
    # UUID tabanlı task_id: zaman bazlı çakışma riski sıfırlanıyor
    task_id = f"task_{uuid.uuid4().hex}"
    new_task = {
        "id": task_id,
        "title": f"{task_type_label}: {len(selected_imgs)} Görsel ({req.assigned_to})",
        "category": req.category,
        "assigned_to": req.assigned_to,
        "assigned_by": req.assigned_by,
        "is_qa_review": req.is_qa_review,
        "created_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "status": "assigned",  # "assigned" | "submitted" | "approved" | "rejected"
        "note": req.note,
        "images": selected_imgs,
        "submitted_at": None,
        "reviewed_at": None,
        "admin_feedback": None
    }

    tasks.append(new_task)
    _save_team_tasks(tasks)

    # Otomatik Batch / Kilit Entegrasyonu (Distributed Lock Sync)
    try:
        batches_file = ROOT_DIR / f"{req.category}_labeled" / "batches.json"
        batches = []
        if batches_file.exists():
            try:
                with open(batches_file, "r", encoding="utf-8") as f:
                    batches = json.load(f)
            except Exception:
                batches = []

        now_ts = datetime.now()
        locked_until = (now_ts + timedelta(hours=24)).strftime("%d.%m.%Y %H:%M")
        batches.append({
            "id": f"batch_{task_id}",
            "name": f"Görev Kilidi: {task_type_label} ({len(selected_imgs)} Görsel)",
            "assigned_to": req.assigned_to,
            "locked_until": locked_until,
            "images": selected_imgs,
            "task_id": task_id
        })
        batches_file.parent.mkdir(parents=True, exist_ok=True)
        with open(batches_file, "w", encoding="utf-8") as f:
            json.dump(batches, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Warning] Kilit senkronizasyonu yapılamadı: {e}")

    return {
        "status": "ok",
        "task_id": task_id,
        "assigned_to": req.assigned_to,
        "image_count": len(selected_imgs),
        "message": f"{len(selected_imgs)} adet görsel başarıyla '{req.assigned_to}' personeline kilitlendi ve atandı."
    }


@router.get("/api/team/my-tasks")
def get_my_tasks(username: str = Query(...), authorization: Optional[str] = Header(None)):
    """
    Çalışan sisteme girdiğinde üzerine atanmış görevleri ve bu görevlerdeki
    canlı etiketleme ilerleme oranını (Progress) hesaplayarak döner.
    """
    # Giriş yapan kullanıcı bilgilerinden ve parametreden alias kümesi oluştur
    raw_un = (username or "").strip().lower()
    user_aliases = set()
    if raw_un:
        user_aliases.add(raw_un)
        if "@" in raw_un:
            user_aliases.add(raw_un.split("@")[0])
        # Noktalı kullanıcı adlarını da (örn. modai.app.dev -> modai) kapsayacak şekilde ekle
        if "." in raw_un:
            user_aliases.add(raw_un.split(".")[0])

    try:
        user = get_current_user(authorization)
        if user:
            u_email = (user.get("email") or "").strip().lower()
            u_username = (user.get("username") or "").strip().lower()
            u_dn = (user.get("display_name") or "").strip().lower()
            for val in (u_email, u_username, u_dn):
                if val:
                    user_aliases.add(val)
                    if "@" in val:
                        user_aliases.add(val.split("@")[0])
                    if "." in val:
                        user_aliases.add(val.split(".")[0])
    except Exception:
        pass

    # Takım üyeleri listesinden ek alias'ları topla
    try:
        t_data = _load_teams()
        for tm in t_data.get("teams", []):
            for mm in tm.get("members", []):
                m_em = (mm.get("email") or "").strip().lower()
                m_un = (mm.get("username") or "").strip().lower()
                m_dn = (mm.get("display_name") or "").strip().lower()
                if (m_em and m_em in user_aliases) or (m_un and m_un in user_aliases) or (m_dn and m_dn in user_aliases):
                    if m_em: user_aliases.add(m_em)
                    if m_un: user_aliases.add(m_un)
                    if m_dn: user_aliases.add(m_dn)
    except Exception:
        pass

    tasks = _load_team_tasks()
    user_tasks = []
    for t in tasks:
        t_assigned = (t.get("assigned_to") or "").strip().lower()
        if not t_assigned:
            continue
        # Doğrudan eşleşme veya alias alt-kümesi eşleşmesi
        matched = False
        if t_assigned in user_aliases:
            matched = True
        else:
            # t_assigned "modai", alias "modai.app.dev" veya tam tersi
            for alias in user_aliases:
                if alias == t_assigned or alias.startswith(t_assigned) or t_assigned.startswith(alias):
                    matched = True
                    break
        if matched:
            user_tasks.append(t)

    # Her görev için canlı etiketleme ilerlemesini hesapla
    for t in user_tasks:
        cat = t.get("category", "")
        labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
        imgs = t.get("images", [])
        total_imgs = len(imgs)
        labeled_count = 0

        if labels_dir.exists() and total_imgs > 0:
            for img in imgs:
                stem = os.path.splitext(img)[0]
                txt_path = labels_dir / f"{stem}.txt"
                if txt_path.exists() and txt_path.stat().st_size > 0:
                    labeled_count += 1

        t["labeled_count"] = labeled_count
        t["total_count"] = total_imgs
        t["progress_percent"] = int((labeled_count / total_imgs) * 100) if total_imgs > 0 else 0

    return {"status": "ok", "username": username, "tasks": user_tasks}


class SubmitTaskRequest(BaseModel):
    task_id: str
    user_name: str
    user_note: Optional[str] = "Etiketleme tamamlandı, incelemenize hazırdır."

@router.post("/api/team/submit-task")
def submit_task_to_admin(req: SubmitTaskRequest, authorization: Optional[str] = Header(None)):
    """
    Çalışan etiketlemeyi bitirdiğinde görevi yöneticiye teslim eder (Submit).
    Görev 'submitted' durumuna geçer ve onay kuyruğuna / gelen paketler havuzuna düşer.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    
    current_email = user.get("email", "").lower()
    current_username = (user.get("username") or user.get("display_name") or current_email.split("@")[0]).lower()
    is_adm = is_admin_user(user, current_email)

    tasks = _load_team_tasks()
    found_task = None
    for t in tasks:
        if t.get("id") == req.task_id:
            assigned = (t.get("assigned_to") or "").lower()
            # E-posta, kullanıcı adı veya admin eşleşmesi
            is_assigned_user = (
                assigned == current_email or 
                assigned == current_username or 
                assigned.lstrip("@") == current_username.lstrip("@") or 
                (req.user_name and assigned == req.user_name.lower())
            )
            if not is_assigned_user and not is_adm:
                raise HTTPException(status_code=403, detail="Bu görevi yalnızca atanan çalışan teslim edebilir.")
            found_task = t
            break

    if not found_task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı.")

    # Görevdeki etiket durumunu kontrol et
    cat = found_task.get("category", "")
    labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
    imgs = found_task.get("images", [])
    labeled_count = 0
    if labels_dir.exists():
        for img in imgs:
            stem = os.path.splitext(img)[0]
            txt_path = labels_dir / f"{stem}.txt"
            if txt_path.exists() and txt_path.stat().st_size > 0:
                labeled_count += 1

    found_task["status"] = "submitted"
    found_task["submitted_at"] = datetime.now().strftime("%d.%m.%Y %H:%M")
    found_task["user_note"] = req.user_note
    found_task["submission_meta"] = {
        "labeled_count": labeled_count,
        "total_count": len(imgs)
    }

    _save_team_tasks(tasks)
    return {
        "status": "ok",
        "message": f"Göreviniz ({labeled_count}/{len(imgs)} etiketli görsel) başarıyla kontrole gönderildi! Yönetici onayı bekleniyor. ✓"
    }


@router.get("/api/team/pending-reviews")
def get_pending_reviews(authorization: Optional[str] = Header(None)):
    """Admin veya takım kaptanı için onay bekleyen görevlerin listesini döner."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = (user.get("email") or "").lower()
    is_adm = is_admin_user(user, user_email)
    tasks = _load_team_tasks()
    if not is_adm:
        # Kaptan kendi takımının görevlerini görebilir
        teams_data = _load_teams()
        captained_team_ids = {
            t.get("id") for t in teams_data.get("teams", [])
            if (t.get("captain") or "").lower() == user_email
        }
        tasks = [t for t in tasks if t.get("team_id") in captained_team_ids]
    pending = [t for t in tasks if t.get("status") == "submitted"]
    all_recent = sorted(tasks, key=lambda x: x.get("created_at", ""), reverse=True)[:25]
    return {
        "status": "ok",
        "pending_count": len(pending),
        "pending_tasks": pending,
        "all_tasks": all_recent
    }


def _is_team_captain_or_reviewer(team: dict, user_email: str, username: str) -> bool:
    """Kullanıcının takım kaptanı veya reviewer (denetçi) olup olmadığını kontrol eder."""
    c_email = (user_email or "").lower().strip()
    c_user = (username or "").lower().strip()
    capt = (team.get("captain") or "").lower().strip()
    if capt and (capt == c_email or capt == c_user or capt == "admin"):
        return True
    for m in team.get("members", []):
        m_email = (m.get("email") or "").lower().strip()
        m_user = (m.get("username") or "").lower().strip()
        role = (m.get("role") or "").lower().strip()
        if (m_email and m_email == c_email) or (m_user and m_user == c_user) or (m_email and m_email == c_user):
            if role in ["captain", "reviewer", "admin"]:
                return True
    return False


class ReviewTaskRequest(BaseModel):
    task_id: str
    action: str               # "approve" | "reject"
    feedback: Optional[str] = "Harika çalışma, onaylandı."

@router.post("/api/team/review-task")
def review_task_submission(req: ReviewTaskRequest, authorization: Optional[str] = Header(None)):
    """
    Admin, Takım Kaptanı veya Denetçi (Reviewer) inceleme motoru:
    - 'approve': Otomatik snapshot alır, etiketleri resmi ana projeye mühürler, kilitleri çözer.
    - 'reject': Görevi 'assigned' durumuna çevirir, personelin ekranına revizyon notunu yansıtır.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    
    current_email = user.get("email", "").lower()
    current_username = (user.get("username") or user.get("display_name") or current_email.split("@")[0]).lower()
    is_adm = is_admin_user(user, current_email)

    tasks = _load_team_tasks()
    found_task = None
    for t in tasks:
        if t.get("id") == req.task_id:
            found_task = t
            break

    if not found_task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı.")

    # Sadece takım kaptanı, reviewer veya admin onaylayabilir
    if not is_adm:
        teams_data = _load_teams()
        t_id = found_task.get("team_id")
        target_team = next((t for t in teams_data.get("teams", []) if t.get("id") == t_id), None)
        if not target_team or not _is_team_captain_or_reviewer(target_team, current_email, current_username):
            raise HTTPException(status_code=403, detail="Bu görevi yalnızca takım kaptanı, denetçi (reviewer) veya sistem yöneticisi inceleyip onaylayabilir.")

    cat = found_task.get("category", "")

    if req.action == "approve":
        # 1. Otomatik Güvenlik Yedeği
        author = found_task.get("assigned_to", "member")
        _create_labels_snapshot(cat, note=f"approved_task_{author}")

        # 2. İlgili Batch Kilidini Kaldır
        try:
            batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
            if batches_file.exists():
                with open(batches_file, "r", encoding="utf-8") as f:
                    batches = json.load(f)
                batches = [b for b in batches if b.get("task_id") != req.task_id and b.get("id") != f"batch_{req.task_id}"]
                with open(batches_file, "w", encoding="utf-8") as f:
                    json.dump(batches, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Warning] Kilit kaldırılamadı: {e}")

        # 3. Görevi Onayla
        found_task["status"] = "approved"
        found_task["reviewed_at"] = datetime.now().strftime("%d.%m.%Y %H:%M")
        found_task["admin_feedback"] = req.feedback or "Onaylandı"
        _save_team_tasks(tasks)
        _invalidate_project_cache(cat)

        return {"status": "ok", "message": f"'{found_task['title']}' onaylandı ve ana veri setine başarıyla katıldı! ✓"}

    elif req.action == "reject":
        found_task["status"] = "assigned"  # Çalışana revizyon olarak geri gönder
        found_task["reviewed_at"] = datetime.now().strftime("%d.%m.%Y %H:%M")
        found_task["admin_feedback"] = req.feedback or "Eksiklikler tespit edildi, lütfen düzeltiniz."
        _save_team_tasks(tasks)
        return {"status": "ok", "message": f"Görev revizyon talebiyle '{found_task['assigned_to']}' çalışanına geri iletildi."}

    raise HTTPException(status_code=400, detail="Geçersiz aksiyon. 'approve' veya 'reject' olmalıdır.")


class ExportSyncPackRequest(BaseModel):
    category: str
    user_name: Optional[str] = "Takım Üyesi"
    batch_id: Optional[str] = None

@router.post("/api/team/export-sync-pack")
def export_sync_pack(req: ExportSyncPackRequest, authorization: Optional[str] = Header(None)):
    """
    GitHub 'Push' benzeri: Ekip üyesinin etiketlerini tek bir .syncpack (zip)
    olarak dışa aktarır. Başka bilgisayara kolayca aktarılabilir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    # Path traversal koruması: category yalnızca alfanumerik + alt çizgi/tire içerebilir
    safe_category = re.sub(r'[^a-zA-Z0-9_\-]', '', req.category)
    if not safe_category or safe_category != req.category:
        raise HTTPException(status_code=400, detail="Geçersiz proje adı.")
    labels_dir = ROOT_DIR / f"{safe_category}_labeled" / "labels"
    if not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Etiket klasörü bulunamadı.")

    # Target files determination
    txt_files = list(labels_dir.glob("*.txt"))
    if not txt_files:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak etiket bulunamadı.")

    # In-memory zip creation
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        sync_meta = {
            "category": req.category,
            "exported_by": req.user_name,
            "exported_at": datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
            "file_count": len(txt_files),
            "app_version": "3.0.1"
        }
        zf.writestr("sync_meta.json", json.dumps(sync_meta, ensure_ascii=False, indent=2))
        for tf in txt_files:
            if tf.stat().st_size > 0:
                zf.write(tf, arcname=f"labels/{tf.name}")

    zip_buf.seek(0)
    safe_user = re.sub(r'[^a-zA-Z0-9_\-]', '_', req.user_name or 'team')
    pack_name = f"syncpack_{req.category}_{safe_user}_{int(time.time())}.syncpack.zip"
    
    # Save to temp exports
    export_dir = ROOT_DIR / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    out_file = export_dir / pack_name
    with open(out_file, "wb") as f:
        f.write(zip_buf.getvalue())

    return {
        "status": "ok",
        "pack_filename": pack_name,
        "download_url": f"/api/download-zip?filename={pack_name}",
        "file_count": len(txt_files),
        "message": f"{len(txt_files)} adet etiket paketi başarıyla hazırlandı."
    }


@router.post("/api/team/merge-sync-pack")
async def merge_sync_pack(
    request: Request,
    category: str = Form(...),
    imported_by: str = Form("Admin"),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    """
    GitHub 'Merge' benzeri: Ekip üyesinden gelen etiket paketini ana projeyle
    çakışmasız olarak birleştirir (Merge). Çakışanları otomatik tespit eder.
    Sadece admin veya takım kaptanı yapabilir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = (user.get("email") or "").lower()
    is_adm = is_admin_user(user, user_email)
    if not is_adm:
        # Kaptan mı kontrolü
        teams_data = _load_teams()
        is_cap = any(
            (t.get("captain") or "").lower() == user_email
            for t in teams_data.get("teams", [])
        )
        if not is_cap:
            raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya sistem yöneticisi paket birleştirebilir.")
    # Path traversal koruması
    safe_category = re.sub(r'[^a-zA-Z0-9_\-]', '', category)
    if not safe_category or safe_category != category:
        raise HTTPException(status_code=400, detail="Geçersiz proje adı.")
    labeled_dir = ROOT_DIR / f"{safe_category}_labeled"
    labels_dir = labeled_dir / "labels"
    labels_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:  # 100 MB limit
        raise HTTPException(status_code=413, detail="Yüklenen dosya çok büyük (maksimum 100 MB).")
    zip_buf = io.BytesIO(content)

    # Otomatik snapshot (Birleştirmeden hemen önce güvenlik yedeği)
    _create_labels_snapshot(category, note=f"before_merge_from_{imported_by}")

    merged_new = 0
    updated_better = 0
    conflicts = []

    reviews = _load_reviews(category)

    try:
        with zipfile.ZipFile(zip_buf, "r") as zf:
            for item in zf.namelist():
                if item.startswith("labels/") and item.endswith(".txt"):
                    base_name = os.path.basename(item)
                    if not base_name:
                        continue
                    # ZIP Slip koruması: dosya adı yalnızca alfanumerik + _ - . içerebilir
                    if not re.match(r'^[a-zA-Z0-9_\-\.]+\.txt$', base_name) or '..' in base_name:
                        print(f"[Security] Şüpheli zip girdisi atlandı: {item}")
                        continue
                    # Hedef path labels_dir dışına çıkmamalı (double-check)
                    target_candidate = (labels_dir / base_name).resolve()
                    if not str(target_candidate).startswith(str(labels_dir.resolve())):
                        print(f"[Security] Path traversal girişimi engellendi: {item}")
                        continue
                    new_txt_content = zf.read(item).decode("utf-8", errors="ignore").strip()
                    new_box_count = len([l for l in new_txt_content.splitlines() if len(l.split()) == 5])

                    target_file = labels_dir / base_name
                    if not target_file.exists() or target_file.stat().st_size == 0:
                        # Tamamen yeni dosya
                        target_file.write_text(new_txt_content + "\n", encoding="utf-8")
                        merged_new += 1
                    else:
                        # Çakışma kontrolü
                        old_txt_content = target_file.read_text(encoding="utf-8").strip()
                        old_box_count = len([l for l in old_txt_content.splitlines() if len(l.split()) == 5])

                        if old_txt_content != new_txt_content:
                            conflicts.append(base_name)
                            # Daha çok kutu içeren veya yeni olanı tercih et
                            if new_box_count >= old_box_count:
                                target_file.write_text(new_txt_content + "\n", encoding="utf-8")
                                updated_better += 1
                            # Review Queue'ya çakışma notu düş
                            img_stem = os.path.splitext(base_name)[0]
                            reviews[f"{img_stem}.jpg"] = {
                                "status": "needs_review",
                                "note": f"Takım Çakışması ({imported_by} ile birleştirildi, {new_box_count} kutu)",
                                "updated_by": imported_by,
                                "updated_at": datetime.now().strftime("%d.%m.%Y %H:%M")
                            }

        _save_reviews(category, reviews)
        _invalidate_project_cache(category)

        return {
            "status": "ok",
            "merged_new": merged_new,
            "updated_better": updated_better,
            "conflicts_count": len(conflicts),
            "message": f"Birleştirme tamamlandı! {merged_new} yeni etiket eklendi, {updated_better} etiket güncellendi."
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync paketi açılamadı veya hasarlı: {e}")


@router.get("/api/team/sync-status")
def get_team_sync_status(category: str = Query(...), authorization: Optional[str] = Header(None)):
    """Takım üyelerinin durumunu, kilitli yığınları ve son birleştirmeleri döner."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    labeled_dir = ROOT_DIR / f"{category}_labeled"
    batches_file = labeled_dir / "batches.json"
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            pass

    # Süresi dolmuş kilitleri otomatik temizle (Garbage Collection)
    now_dt = datetime.now()
    has_expired = False
    assigned_summary = []

    for b in batches:
        assigned = b.get("assigned_to")
        locked_until_str = b.get("locked_until")
        if assigned and locked_until_str:
            try:
                lock_dt = datetime.strptime(locked_until_str, "%d.%m.%Y %H:%M")
                if lock_dt < now_dt:
                    b["assigned_to"] = None
                    b["locked_until"] = None
                    has_expired = True
                    assigned = None
            except Exception:
                pass

        if assigned:
            assigned_summary.append({
                "batch_id": b.get("id"),
                "batch_name": b.get("name"),
                "assigned_to": b.get("assigned_to"),
                "locked_until": b.get("locked_until"),
                "image_count": len(b.get("images", []))
            })

    if has_expired:
        try:
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    # Son snapshot'lar
    snaps = []
    if SNAPSHOTS_DIR.exists():
        for d in sorted(SNAPSHOTS_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True)[:5]:
            if d.is_dir() and d.name.startswith(f"{category}_"):
                snaps.append(d.name)

    return {
        "status": "ok",
        "category": category,
        "assigned_batches": assigned_summary,
        "recent_backups": snaps
    }


@router.get("/api/team/incoming-packs")
def get_incoming_sync_packs(category: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """
    Ekip üyelerinin etiketlemeyi bitirip yöneticiye/merkeze gönderdiği
    onay ve birleştirme (Pull Request) bekleyen paketleri listeler.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    tasks = _load_team_tasks()
    incoming = []
    for t in tasks:
        # Belirtilen kategoriye ait (veya kategori verilmemişse tümü) ve çalışanın gönderdiği paketler
        if t.get("status") == "submitted":
            if not category or category == "all" or t.get("category") == category:
                imgs = t.get("images", [])
                incoming.append({
                    "pack_id": t.get("id"),
                    "category": t.get("category", category or "accessory_detection_project"),
                    "author": t.get("assigned_to", "Ekip Üyesi"),
                    "title": t.get("title", "Etiket Paketi"),
                    "image_count": len(imgs),
                    "preview_images": imgs[:6],
                    "all_images": imgs,
                    "submitted_at": t.get("submitted_at") or t.get("created_at"),
                    "user_note": t.get("user_note", ""),
                    "status": "pending_merge"
                })

    return {
        "status": "ok",
        "category": category,
        "count": len(incoming),
        "incoming_packs": incoming
    }


class QuickMergeTaskRequest(BaseModel):
    category: Optional[str] = None
    task_id: str
    feedback: Optional[str] = "Ekip paketiniz başarıyla ana veri setine birleştirildi."

@router.post("/api/team/quick-merge-task")
def quick_merge_task_pack(req: QuickMergeTaskRequest, authorization: Optional[str] = Header(None)):
    """
    Yöneticinin veya Takım Kaptanının ekip üyesinden gelen paketi tek tıkla ana projeye (Main)
    çakışmasız birleştirmesini (Git Merge) ve onaylamasını sağlar.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").lower()
    is_adm = is_admin_user(user, user_email)

    tasks = _load_team_tasks()
    found_task = None
    for t in tasks:
        # Öncelik task_id eşleşmesidir (UUID/benzersiz id)
        if t.get("id") == req.task_id:
            found_task = t
            break

    if not found_task:
        raise HTTPException(status_code=404, detail="Belirtilen paket veya görev bulunamadı.")

    actual_category = found_task.get("category") or req.category or "accessory_detection_project"

    if not is_adm:
        teams_data = _load_teams()
        t_id = found_task.get("team_id")
        user_uname = (user.get("username") or user.get("display_name") or user_email.split("@")[0]).lower()
        target_team = next((team for team in teams_data.get("teams", []) if team.get("id") == t_id), None)
        if not target_team or not _is_team_captain_or_reviewer(target_team, user_email, user_uname):
            raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı, denetçi (reviewer) veya sistem yöneticisi bu paketi birleştirebilir.")

    # 1. Otomatik Güvenlik Yedeği (Snapshot) Al
    author = found_task.get("assigned_to", "member")
    _create_labels_snapshot(actual_category, note=f"before_merge_from_{author}")

    # 2. Görevi 'approved' (Onaylandı ve Birleştirildi) Yap
    found_task["status"] = "approved"
    found_task["reviewed_at"] = datetime.now().strftime("%d.%m.%Y %H:%M")
    found_task["admin_feedback"] = req.feedback or "Onaylandı ve birleştirildi"
    _save_team_task(found_task)

    # 3. İlgili Batch Kilidini Kaldır ve Görselleri Ana Batch'e 'approved' Olarak Birleştir
    try:
        from core.database import cf_d1_load_batches, cf_d1_save_batches, cf_r2_upload
        from api.shared.utils import get_project_storage_info

        batches_file = ROOT_DIR / f"{actual_category}_labeled" / "batches.json"
        batches = cf_d1_load_batches(actual_category) or []
        if not batches and batches_file.exists():
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)

        task_imgs_set = set(found_task.get("images", []))

        # Geçici görev kilit batch'ini temizle
        batches = [b for b in batches if b.get("task_id") != req.task_id and b.get("id") != f"batch_{req.task_id}" and b.get("id") != req.task_id]

        # Ana batch'in approved_filenames listesine bu görselleri ekle
        for b in batches:
            b_imgs = set(b.get("images", []))
            overlap = task_imgs_set.intersection(b_imgs)
            if overlap:
                app_set = set(b.get("approved_filenames", []))
                app_set.update(overlap)
                b["approved_filenames"] = sorted(list(app_set))
                b["approved_count"] = len(b["approved_filenames"])
                b["annotated_count"] = len(b["approved_filenames"])
                b["returned_filenames"] = [fn for fn in b.get("returned_filenames", []) if fn not in app_set]
                b["unassigned_count"] = max(0, len(b.get("images", [])) - len(b["approved_filenames"]))
                if len(b["approved_filenames"]) >= len(b.get("images", [])):
                    b["status"] = "completed"
                else:
                    b["status"] = "annotating"

        batches_file.parent.mkdir(parents=True, exist_ok=True)
        with open(batches_file, "w", encoding="utf-8") as f:
            json.dump(batches, f, ensure_ascii=False, indent=2)

        cf_d1_save_batches(actual_category, batches)
        try:
            storage = get_project_storage_info(actual_category)
            cf_r2_upload(json.dumps(batches, ensure_ascii=False, indent=2).encode('utf-8'), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        except Exception:
            pass
    except Exception as e:
        print(f"[Warning] Batch birleştirme ve kilit kaldırma hatası: {e}")

    # 4. Proje önbelleğini tazele
    _invalidate_project_cache(actual_category)

    img_count = len(found_task.get("images", []))
    return {
        "status": "ok",
        "message": f"'{author}' tarafından gönderilen {img_count} etiketli görsel ana veri setine başarıyla birleştirildi! ✓",
        "task_id": req.task_id,
        "category": actual_category,
        "merged_count": img_count
    }


class UnlockBatchRequest(BaseModel):
    category: str
    batch_id: Optional[str] = None
    unlock_all: bool = False

@router.post("/api/team/unlock-batch")
def unlock_batch(req: UnlockBatchRequest, authorization: Optional[str] = Header(None)):
    """Kilitli bir yığını veya tüm kilitleri serbest bırakır. Admin veya takım kaptanı yetkilidir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = (user.get("email") or "").lower()
    is_adm = is_admin_user(user, user_email)
    if not is_adm:
        teams_data = _load_teams()
        is_cap = any(
            (t.get("captain") or "").lower() == user_email
            for t in teams_data.get("teams", [])
        )
        if not is_cap:
            raise HTTPException(status_code=403, detail="Kilitleri yalnızca takım kaptanı veya sistem yöneticisi kaldırabilir.")
    # Path traversal koruması
    safe_category = re.sub(r'[^a-zA-Z0-9_\-]', '', req.category)
    if not safe_category or safe_category != req.category:
        raise HTTPException(status_code=400, detail="Geçersiz proje adı.")
    batches_file = ROOT_DIR / f"{safe_category}_labeled" / "batches.json"
    if not batches_file.exists():
        return {"status": "ok", "message": "Kilit bulunamadı."}
    try:
        with open(batches_file, "r", encoding="utf-8") as f:
            batches = json.load(f)
        unlocked = 0
        for b in batches:
            if req.unlock_all or (req.batch_id and b.get("id") == req.batch_id):
                b["assigned_to"] = None
                b["locked_until"] = None
                unlocked += 1
        with open(batches_file, "w", encoding="utf-8") as f:
            json.dump(batches, f, ensure_ascii=False, indent=2)
        return {"status": "ok", "message": f"{unlocked} adet yığının kilidi başarıyla kaldırıldı."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kilit kaldırılamadı: {str(e)}")


class CreateSnapshotRequest(BaseModel):
    category: str
    note: Optional[str] = "manual_backup"

@router.post("/api/team/create-snapshot")
def manual_create_snapshot(req: CreateSnapshotRequest, authorization: Optional[str] = Header(None)):
    """Kullanıcının tek tıkla anlık sistem güvenlik yedeği almasını sağlar. Admin veya kaptan yetkisi gerekir."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = (user.get("email") or "").lower()
    is_adm = is_admin_user(user, user_email)
    if not is_adm:
        teams_data = _load_teams()
        is_cap = any(
            (t.get("captain") or "").lower() == user_email
            for t in teams_data.get("teams", [])
        )
        if not is_cap:
            raise HTTPException(status_code=403, detail="Yedek almak için takım kaptanı veya sistem yöneticisi yetkisi gerekir.")
    # Path traversal koruması
    safe_category = re.sub(r'[^a-zA-Z0-9_\-]', '', req.category)
    if not safe_category or safe_category != req.category:
        raise HTTPException(status_code=400, detail="Geçersiz proje adı.")
    try:
        snap_id = _create_labels_snapshot(safe_category, note=req.note)
        return {"status": "ok", "message": "Güvenlik yedeği (snapshot) başarıyla oluşturuldu.", "snapshot_id": snap_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yedek oluşturulamadı: {str(e)}")



class ClaimNextBatchRequest(BaseModel):
    category: str
    user_name: str
    count: int = 50
    lock_hours: int = 24

@router.post("/api/team/claim-next-batch")
def claim_next_batch(req: ClaimNextBatchRequest, authorization: Optional[str] = Header(None)):
    """
    Ekip üyesine projedeki boş ve başkasına kilitlenmemiş
    sıradaki N görseli otomatik kilitler. İki kişinin çakışmasını kesin engeller.
    Kullanıcı yalnızca kendi adına claim yapabilir; admin/kaptan başkası adına claim yapabilir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = (user.get("email") or "").lower()
    user_username = (user.get("username") or user.get("display_name") or user_email.split("@")[0]).lower()
    is_adm = is_admin_user(user, user_email)
    # Güvenlik: normal kullanıcı yalnızca kendi adına claim yapabilir
    req_name_lower = req.user_name.lower()
    if not is_adm:
        teams_data = _load_teams()
        is_cap = any(
            (t.get("captain") or "").lower() == user_email
            for t in teams_data.get("teams", [])
        )
        if not is_cap and req_name_lower not in (user_email, user_username):
            raise HTTPException(status_code=403, detail="Yalnızca kendi adınıza görev claim edebilirsiniz.")
    # Path traversal koruması
    safe_category = re.sub(r'[^a-zA-Z0-9_\-]', '', req.category)
    if not safe_category or safe_category != req.category:
        raise HTTPException(status_code=400, detail="Geçersiz proje adı.")
    cat_dir = ROOT_DIR / safe_category
    labels_dir = ROOT_DIR / f"{safe_category}_labeled" / "labels"
    batches_file = ROOT_DIR / f"{safe_category}_labeled" / "batches.json"

    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_imgs = sorted([f.name for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext])

    locked_imgs = set()
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
            now_str = datetime.now().strftime("%d.%m.%Y %H:%M")
            for b in batches:
                if b.get("assigned_to") and b.get("assigned_to") != req.user_name:
                    if b.get("locked_until", "") >= now_str:
                        locked_imgs.update(b.get("images", []))
        except Exception:
            pass

    claimed_imgs = []
    for img_name in all_imgs:
        if img_name in locked_imgs:
            continue
        stem = os.path.splitext(img_name)[0]
        txt_path = labels_dir / f"{stem}.txt"
        if not txt_path.exists() or txt_path.stat().st_size == 0:
            claimed_imgs.append(img_name)
            if len(claimed_imgs) >= req.count:
                break

    if not claimed_imgs:
        return {
            "status": "empty",
            "message": "Tebrikler! Etiketlenecek boş görsel kalmadı veya tümü diğer ekip üyelerine atanmış durumda.",
            "claimed_count": 0,
            "images": []
        }

    batch_id = f"batch_{req.user_name}_{int(time.time())}"
    expires_at = (datetime.now() + timedelta(hours=req.lock_hours)).strftime("%d.%m.%Y %H:%M")
    new_batch = {
        "id": batch_id,
        "name": f"Görev: {req.user_name} ({len(claimed_imgs)} Görsel)",
        "created_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "assigned_to": req.user_name,
        "locked_until": expires_at,
        "images": claimed_imgs
    }
    batches.append(new_batch)
    batches_file.parent.mkdir(parents=True, exist_ok=True)
    with open(batches_file, "w", encoding="utf-8") as f:
        json.dump(batches, f, ensure_ascii=False, indent=2)

    return {
        "status": "ok",
        "batch_id": batch_id,
        "batch_name": new_batch["name"],
        "assigned_to": req.user_name,
        "locked_until": expires_at,
        "claimed_count": len(claimed_imgs),
        "images": claimed_imgs,
        "message": f"{len(claimed_imgs)} adet görsel '{req.user_name}' adına başarıyla kilitlendi."
    }


# ─────────────────────────────────────────────────────────────────────────────
# KAPTANLIK DEVRETME (TRANSFER CAPTAINCY)
# ─────────────────────────────────────────────────────────────────────────────

class TransferCaptaincyRequest(BaseModel):
    team_id: str
    new_captain_email: str

@router.post("/api/teams/transfer-captaincy")
def transfer_captaincy(req: TransferCaptaincyRequest, authorization: Optional[str] = Header(None)):
    """
    Takım kaptanlığını başka bir aktif üyeye devreder.
    Sadece mevcut takım kaptanı veya süper yönetici devir yapabilir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    email = (user.get("email") or "").lower().strip()
    is_adm = is_admin_user(user, email)

    data = _load_teams()
    team = None
    for t in data.get("teams", []):
        if t.get("id") == req.team_id:
            team = t
            break

    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı.")

    cur_capt = (team.get("captain") or "").lower().strip()
    if not is_adm and cur_capt != email:
        raise HTTPException(status_code=403, detail="Yalnızca mevcut takım kaptanı veya sistem yöneticisi kaptanlığı devredebilir.")

    target_email = req.new_captain_email.lower().strip()
    if cur_capt == target_email:
        raise HTTPException(status_code=400, detail="Belirtilen kullanıcı zaten takımın kaptanı.")

    # Yeni kaptanın mevcut bir üye olduğunu doğrula
    target_member = None
    for m in team.get("members", []):
        m_email = (m.get("email") or "").lower().strip()
        m_user = (m.get("username") or "").lower().strip()
        if (m_email and m_email == target_email) or (m_user and m_user == target_email):
            target_member = m
            break

    if not target_member:
        raise HTTPException(status_code=400, detail="Kaptanlık devredilecek kullanıcı bu takımın kayıtlı bir üyesi değil.")

    old_captain = team.get("captain")
    # Yeni kaptanı ata
    team["captain"] = target_email
    target_member["role"] = "captain"

    # Eski kaptanı takım üyesi (reviewer) olarak güncelle
    for m in team.get("members", []):
        m_email = (m.get("email") or "").lower().strip()
        if m_email == cur_capt and m_email != target_email:
            m["role"] = "reviewer"

    _save_teams(data)

    return {
        "status": "ok",
        "message": f"Takım kaptanlığı başarıyla '{target_email}' kullanıcısına devredildi.",
        "old_captain": old_captain,
        "new_captain": target_email
    }


# ─────────────────────────────────────────────────────────────────────────────
# TAKIM SİLME (DELETE TEAM)
# ─────────────────────────────────────────────────────────────────────────────

class DeleteTeamRequest(BaseModel):
    team_id: str

@router.post("/api/teams/delete-team")
def delete_team(req: DeleteTeamRequest, authorization: Optional[str] = Header(None)):
    """
    Takımı tamamen siler.
    Yalnızca takım kaptanı veya sistem yöneticisi (admin) silebilir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    email = (user.get("email") or "").lower().strip()
    is_adm = is_admin_user(user, email)

    data = _load_teams()
    team = None
    for t in data.get("teams", []):
        if t.get("id") == req.team_id:
            team = t
            break

    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı.")

    cur_capt = (team.get("captain") or "").lower().strip()
    if not is_adm and cur_capt != email:
        raise HTTPException(status_code=403, detail="Yalnızca takım kaptanı veya sistem yöneticisi takımı silebilir.")

    team_name = team.get("name", "Bilinmeyen Takım")

    # Cloudflare D1'den sil
    try:
        cf_d1_query("DELETE FROM teams WHERE id = ?", [req.team_id])
    except Exception as e:
        print(f"[D1 Delete Team Error] {e}")
        raise HTTPException(status_code=500, detail="Takım veritabanından silinirken hata oluştu.")

    return {
        "status": "ok",
        "message": f"'{team_name}' takımı başarıyla silindi."
    }


# ─────────────────────────────────────────────────────────────────────────────
# SNAPSHOT GERİ YÜKLEME (RESTORE LABELS SNAPSHOT)
# ─────────────────────────────────────────────────────────────────────────────

class RestoreSnapshotRequest(BaseModel):
    category: str
    snapshot_id: str

@router.post("/api/team/restore-snapshot")
def restore_labels_snapshot(req: RestoreSnapshotRequest, authorization: Optional[str] = Header(None)):
    """
    Alınan bir snapshot yedeğini aktif projenin labels/ klasörüne geri yükler.
    Geri yüklemeden önce güvenlik amacıyla mevcut etiketlerin otomatik yedeğini alır.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    category = req.category.strip()
    snapshot_id = os.path.basename(req.snapshot_id.strip())

    if not category or not snapshot_id:
        raise HTTPException(status_code=400, detail="Kategori ve snapshot kimliği zorunludur.")

    target_snap_dir = SNAPSHOTS_DIR / snapshot_id
    snap_labels_dir = target_snap_dir / "labels"

    if not target_snap_dir.exists() or not snap_labels_dir.exists():
        raise HTTPException(status_code=404, detail=f"'{snapshot_id}' yedeği bulunamadı.")

    project_dir = ROOT_DIR / f"{category}_labeled"
    active_labels_dir = project_dir / "labels"

    # Güvenlik Adımı: Geri yüklemeden önce mevcut etiketleri otomatik yedekle
    pre_restore_backup = None
    if active_labels_dir.exists() and any(active_labels_dir.glob("*.txt")):
        pre_restore_backup = _create_labels_snapshot(category, note="pre_restore_safety_backup")

    try:
        # Mevcut labels klasörünü temizle ve snapshot içeriğini aktar
        if active_labels_dir.exists():
            shutil.rmtree(active_labels_dir)
        active_labels_dir.mkdir(parents=True, exist_ok=True)

        copied_count = 0
        for txt_file in snap_labels_dir.glob("*.txt"):
            shutil.copy2(txt_file, active_labels_dir / txt_file.name)
            copied_count += 1

        _invalidate_project_cache(category)

        return {
            "status": "ok",
            "message": f"'{snapshot_id}' yedeği başarıyla geri yüklendi ({copied_count} etiket).",
            "restored_count": copied_count,
            "safety_backup": pre_restore_backup
        }
    except Exception as e:
        print(f"[Restore Snapshot Error] {e}")
        raise HTTPException(status_code=500, detail=f"Yedek geri yüklenirken hata oluştu: {str(e)}")
