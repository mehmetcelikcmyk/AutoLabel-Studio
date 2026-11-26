# -*- coding: utf-8 -*-
"""
Workspace Management API (Roboflow-Style Workspaces & Onboarding)
==================================================================
Handles user workspaces, onboarding wizard completion, and active workspace selection.
Persisted directly to Cloudflare D1.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from core.database import cf_d1_query
from core.security import get_current_user, is_admin_user

router = APIRouter(prefix="/api/workspaces", tags=["Workspaces"])


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    plan: Optional[str] = Field("free", pattern="^(free|premium_trial|public)$")
    vision_goal: Optional[str] = None
    output_target: Optional[str] = None
    data_sources: Optional[str] = None


@router.get("")
def list_user_workspaces(authorization: Optional[str] = Header(None)):
    """Kullanıcının sahip olduğu veya erişebildiği tüm çalışma alanlarını döner."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")

    user_email = user.get("email", "").lower()
    is_admin = is_admin_user(user, user_email)

    # D1'den kullanıcının çalışma alanlarını çek
    rows = cf_d1_query(
        "SELECT id, name, plan, created_at, vision_goal, output_target, data_sources FROM workspaces WHERE owner_email = ? ORDER BY created_at ASC",
        [user_email]
    ) or []

    # Kullanıcının çalışma alanları (Kişisel/Özel)
    # NOT: Silinen workspace'lerin tekrar zombi gibi otomatik üretilmemesi için
    # zoraki INSERT kaldırıldı. Kullanıcı dilediğinde "Yeni Çalışma Alanı" butonuyla oluşturabilir.

    # Kullanıcının üyesi olduğu takımların Workspace'lerini ekle (Cloudflare D1 Entegrasyonu)
    try:
        from api.teams import _load_teams
        t_data = _load_teams()
        username = (user.get("username") or user.get("display_name") or "").lower()
        for team in t_data.get("teams", []):
            captain = (team.get("captain") or "").lower()
            is_member = False
            user_role = "annotator"
            for m in team.get("members", []):
                m_email = (m.get("email") or "").lower()
                m_user = (m.get("username") or "").lower()
                if (user_email and m_email == user_email) or (username and m_user == username):
                    is_member = True
                    user_role = m.get("role", "annotator")
                    break
            
            # Eğer üye ise veya kaptan ise ve bu takım workspace'i henüz rows içinde yoksa ekle
            if is_member or (captain and (captain == user_email or captain == username)):
                team_ws_id = f"ws_team_{team.get('id')}"
                if not any(r.get("id") == team_ws_id for r in rows):
                    rows.append({
                        "id": team_ws_id,
                        "name": f"{team.get('name')} (Takım Workspace)",
                        "plan": "premium_trial",
                        "created_at": team.get("created_at", ""),
                        "is_team_workspace": True,
                        "team_id": team.get("id"),
                        "role": "captain" if (captain == user_email or captain == username) else user_role,
                        "vision_goal": f"{team.get('name')} ekibi işbirliği ve etiketleme alanı",
                        "output_target": "Takım Konsolu",
                        "data_sources": "Takım Projeleri"
                    })
    except Exception as e:
        print(f"[Workspace Team Integration Error] {e}")

    return {
        "status": "ok",
        "workspaces": rows,
        "total_count": len(rows),
        "has_workspace": len(rows) > 0
    }


@router.post("/create")
def create_workspace(req: WorkspaceCreateRequest, authorization: Optional[str] = Header(None)):
    """Yeni çalışma alanı ve 4 adımlı Roboflow onboarding sihirbazı tamamlandığında çağrılır."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")

    user_email = user.get("email", "").lower()
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Geçerli bir çalışma alanı adı giriniz.")

    # Unique slug / id oluştur
    ws_id = f"ws_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        cf_d1_query(
            "INSERT INTO workspaces (id, owner_email, name, plan, created_at, vision_goal, output_target, data_sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ws_id,
                user_email,
                name,
                req.plan or "free",
                now_iso,
                req.vision_goal or "",
                req.output_target or "",
                req.data_sources or ""
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Çalışma alanı kaydedilemedi: {e}")

    return {
        "status": "ok",
        "workspace": {
            "id": ws_id,
            "name": name,
            "plan": req.plan or "free",
            "created_at": now_iso,
            "vision_goal": req.vision_goal or "",
            "output_target": req.output_target or "",
            "data_sources": req.data_sources or ""
        }
    }


class WorkspaceUpdateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    plan: Optional[str] = Field(None, pattern="^(free|premium_trial|public)$")
    vision_goal: Optional[str] = None
    output_target: Optional[str] = None
    data_sources: Optional[str] = None


@router.put("/{workspace_id}")
def update_workspace(workspace_id: str, req: WorkspaceUpdateRequest, authorization: Optional[str] = Header(None)):
    """Çalışma alanının adını ve temel ayarlarını günceller."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")

    user_email = user.get("email", "").lower()
    is_admin = is_admin_user(user, user_email)

    # Workspace kontrolü
    ws_rows = cf_d1_query("SELECT id, owner_email, name, plan FROM workspaces WHERE id = ?", [workspace_id])
    if not ws_rows:
        raise HTTPException(status_code=404, detail="Çalışma alanı bulunamadı.")

    ws = ws_rows[0]
    if ws.get("owner_email", "").lower() != user_email and not is_admin:
        raise HTTPException(status_code=403, detail="Bu çalışma alanını düzenleme yetkiniz yok.")

    new_name = req.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Geçerli bir çalışma alanı adı giriniz.")

    try:
        cf_d1_query(
            "UPDATE workspaces SET name = ?, plan = COALESCE(?, plan), vision_goal = COALESCE(?, vision_goal), output_target = COALESCE(?, output_target), data_sources = COALESCE(?, data_sources) WHERE id = ?",
            [
                new_name,
                req.plan,
                req.vision_goal,
                req.output_target,
                req.data_sources,
                workspace_id
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Çalışma alanı güncellenemedi: {e}")

    return {
        "status": "ok",
        "workspace": {
            "id": workspace_id,
            "name": new_name,
            "plan": req.plan or ws.get("plan", "free")
        }
    }


@router.delete("/{workspace_id}")
def delete_workspace(workspace_id: str, authorization: Optional[str] = Header(None)):
    """Çalışma alanını ve içerisindeki projeleri siler."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")

    user_email = user.get("email", "").lower()
    is_admin = is_admin_user(user, user_email)

    ws_rows = cf_d1_query("SELECT id, owner_email, name FROM workspaces WHERE id = ?", [workspace_id])
    if not ws_rows:
        raise HTTPException(status_code=404, detail="Çalışma alanı bulunamadı.")

    ws = ws_rows[0]
    owner_email = ws.get("owner_email", "").lower()
    if owner_email != user_email and not is_admin:
        raise HTTPException(status_code=403, detail="Bu çalışma alanını silme yetkiniz yok.")

    # 1. KORUMA: Kullanıcının hiç çalışma alanı kalmayacaksa silmeyi engelle
    owner_workspaces = cf_d1_query("SELECT id FROM workspaces WHERE owner_email = ?", [owner_email]) or []
    # Kullanıcının üye olduğu takımları da kontrol et
    has_teams = False
    try:
        from api.teams import _load_teams
        t_data = _load_teams()
        username = (user.get("username") or user.get("display_name") or "").lower()
        for t in t_data.get("teams", []):
            capt = (t.get("captain") or "").lower()
            if capt and (capt == user_email or capt == username):
                has_teams = True
                break
            for tm in t.get("members", []):
                if (user_email and (tm.get("email") or "").lower() == user_email) or \
                   (username and (tm.get("username") or "").lower() == username):
                    has_teams = True
                    break
            if has_teams:
                break
    except Exception:
        pass

    if len(owner_workspaces) <= 1 and not has_teams:
        raise HTTPException(
            status_code=400,
            detail="Hesabınızdaki son kalan çalışma alanını silemezsiniz. Sistemde en az bir aktif çalışma alanı bulunmalıdır."
        )

    # 2. Bu workspace altındaki projeleri bul
    projs = cf_d1_query("SELECT id FROM projects WHERE workspace_id = ?", [workspace_id]) or []
    deleted_pids = {p.get("id") for p in projs if p.get("id")}
    
    # 3. Projeleri ve diskteki dosyaları temizle
    from api.shared.utils import load_project_config, save_project_config, safe_project_path
    import shutil
    import json
    from pathlib import Path

    cfg = load_project_config()
    cfg_dirty = False

    for pid in deleted_pids:
        if "projects" in cfg and pid in cfg["projects"]:
            del cfg["projects"][pid]
            cfg_dirty = True
        if "classes" in cfg and pid.lower() in cfg["classes"]:
            del cfg["classes"][pid.lower()]
            cfg_dirty = True
        try:
            p_dir = safe_project_path(pid)
            pl_dir = safe_project_path(f"{pid}_labeled")
            if p_dir.exists(): shutil.rmtree(p_dir, ignore_errors=True)
            if pl_dir.exists(): shutil.rmtree(pl_dir, ignore_errors=True)
        except Exception:
            pass

    if cfg_dirty:
        save_project_config(cfg)

    # 4. Takım ve Görev referanslarını D1 üzerinden temizle (Orphan kayıtları önle)
    # Not: Tüm takım ve görev verisi Cloudflare D1'de tutulur.
    # Silinen projelerin takım referanslarını D1 üzerinden temizle.
    try:
        from api.teams import _load_teams, _save_teams
        teams_data = _load_teams()
        teams_dirty = False
        for team in teams_data.get("teams", []):
            old_projects = team.get("projects", [])
            new_projects = [p for p in old_projects if p not in deleted_pids]
            if len(new_projects) != len(old_projects):
                team["projects"] = new_projects
                teams_dirty = True
        if teams_dirty:
            _save_teams(teams_data)  # D1'e yazar, yerel dosyaya değil
    except Exception as e:
        print(f"[delete_workspace] Takım referansları temizlenirken uyarı: {e}")

    # Görev referanslarını D1 üzerinden temizle
    try:
        for pid in deleted_pids:
            cf_d1_query(
                "UPDATE team_tasks SET status = 'cancelled' WHERE category = ? AND status NOT IN ('approved', 'cancelled')",
                [pid]
            )
    except Exception as e:
        print(f"[delete_workspace] Görev referansları temizlenirken uyarı: {e}")

    # 5. D1'den projeleri ve workspace'i sil
    try:
        cf_d1_query("DELETE FROM projects WHERE workspace_id = ?", [workspace_id])
        cf_d1_query("DELETE FROM workspaces WHERE id = ?", [workspace_id])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Çalışma alanı silinemedi: {e}")

    return {
        "status": "ok",
        "deleted_workspace_id": workspace_id,
        "deleted_projects_count": len(projs)
    }


@router.get("/{workspace_id}/stats")
def get_workspace_detail_stats(workspace_id: str, authorization: Optional[str] = Header(None)):
    """Seçili çalışma alanının proje, görsel ve etiket metriklerini döner."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")

    user_email = user.get("email", "").lower()
    is_admin = is_admin_user(user, user_email)

    ws_rows = cf_d1_query("SELECT id, name, plan, owner_email FROM workspaces WHERE id = ?", [workspace_id])
    if not ws_rows:
        raise HTTPException(status_code=404, detail="Çalışma alanı bulunamadı.")
    ws = ws_rows[0]

    from api.projects.core import get_categories
    cats = get_categories()
    ws_cats = [c for c in cats if c.get("workspace_id") == workspace_id]

    total_images = sum(c.get("image_count", 0) for c in ws_cats)
    total_labeled = sum(c.get("label_count", 0) for c in ws_cats)
    pct = round((total_labeled / total_images * 100), 1) if total_images > 0 else 0

    return {
        "status": "ok",
        "workspace_id": workspace_id,
        "workspace_name": ws.get("name"),
        "plan": ws.get("plan", "free"),
        "total_projects": len(ws_cats),
        "total_images": total_images,
        "total_labeled": total_labeled,
        "completion_rate": pct,
        "storage": f"{total_images * 0.4:.1f} MB"
    }
