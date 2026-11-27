import os
import json
import random
import shutil
import hashlib
import time
from pathlib import Path
from typing import Optional, List, Dict, Any
from collections import Counter

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config import ROOT_DIR, load_settings, SETTINGS_FILE
from core.database import cf_d1_query, cf_r2_list_objects, cf_r2_get_object
from core.security import get_current_user, require_admin, check_project_permission
from api.ai_models import MODEL_REGISTRY, _MODEL_CACHE, _ACTIVE_DEVICE, get_ai_model
from api.projects import get_categories, load_project_config
from api.shared.utils import get_project_storage_info
from services.image_processing import load_image_rgb, save_image_preview

router = APIRouter(tags=["Admin, Settings & Analysis"])


# ─────────────────────────────────────────────────────────────────────────────
# CLOUDFLARE SETTINGS API
# ─────────────────────────────────────────────────────────────────────────────

class CloudflareSettingsRequest(BaseModel):
    cloudflare_account_id: str
    cloudflare_api_token: str
    cloudflare_database_id: str
    cloudflare_r2_bucket: Optional[str] = "yolo-editor"
    use_cloudflare: Optional[bool] = True


@router.post("/api/settings/cloudflare")
def save_cloudflare_settings(req: CloudflareSettingsRequest, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    raise HTTPException(
        status_code=405,
        detail="Cloudflare API/R2 secrets must be configured as deployment secrets; they are never written by the application."
    )


@router.get("/api/settings/cloudflare")
def get_cloudflare_settings(authorization: Optional[str] = Header(None)):
    require_admin(authorization)

    settings = load_settings()
    return {
        "use_cloudflare": settings.get("use_cloudflare", False),
        "configured": bool(settings.get("cloudflare_account_id") and settings.get("cloudflare_api_token")),
    }


@router.get("/api/settings/cloudflare/test")
def test_cloudflare_connection(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    settings = load_settings()
    if not (settings.get("cloudflare_account_id") and settings.get("cloudflare_api_token") and settings.get("cloudflare_database_id")):
        return JSONResponse(status_code=400, content={
            "connected": False,
            "detail": "Cloudflare credentials are not configured. Save your settings first."
        })

    result = cf_d1_query("SELECT 1 AS ping")
    if result is not None:
        return {"connected": True, "message": "Cloudflare D1 connection is working correctly."}
    else:
        return JSONResponse(status_code=503, content={
            "connected": False,
            "detail": "Could not connect to Cloudflare D1. Check your Account ID, Database ID and API Token."
        })


# ─────────────────────────────────────────────────────────────────────────────
# SUPER ADMIN API ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

class UpdateUserRoleRequest(BaseModel):
    email: str
    role: str


class DeleteUserRequest(BaseModel):
    email: str


@router.get("/api/admin/overview")
def admin_overview(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    from core.database import load_users
    users_data = load_users()
    projects = get_categories()

    total_images = sum(p.get("image_count", 0) for p in projects)
    total_labeled = sum(p.get("label_count", 0) for p in projects)
    active_sessions = len(users_data.get("sessions", {}))

    import platform
    cpu_count = os.cpu_count() or 1
    device_info = "GPU (CUDA)" if "cuda" in _ACTIVE_DEVICE else ("Apple MPS" if "mps" in _ACTIVE_DEVICE else "CPU (Standard)")
    
    total_users_count = len(users_data.get("users", []))
    try:
        from core.database import cf_d1_query
        cnt_res = cf_d1_query("SELECT count(*) as cnt FROM users")
        if cnt_res and len(cnt_res) > 0 and cnt_res[0].get("cnt") is not None:
            total_users_count = int(cnt_res[0]["cnt"])
    except Exception:
        pass

    return {
        "status": "ok",
        "stats": {
            "total_users": total_users_count,
            "active_sessions": active_sessions,
            "total_projects": len(projects),
            "total_images": total_images,
            "total_labeled": total_labeled,
            "completion_rate": round((total_labeled / total_images * 100), 1) if total_images > 0 else 0,
            "active_device": device_info,
            "cpu_cores": cpu_count,
            "python_version": platform.python_version(),
            "os_name": platform.system() + " " + platform.release(),
            "cached_models_count": len(_MODEL_CACHE),
            "registered_models_count": len(MODEL_REGISTRY)
        }
    }


@router.get("/api/admin/users")
def admin_get_users(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    from core.database import is_token_valid, cf_d1_query
    from core.security import is_admin_user

    # Cloudflare D1 üzerindeki canlı aktif oturumları al
    active_emails = set()
    try:
        d1_sessions = cf_d1_query(
            "SELECT u.email, s.expires_at FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.revoked_at IS NULL"
        )
        if d1_sessions:
            for s in d1_sessions:
                if is_token_valid(s.get("expires_at", "")):
                    active_emails.add((s.get("email") or "").strip().lower())
    except Exception as e:
        print(f"[Admin active sessions D1 Warning] {e}")

    # Kullanıcı verilerini Cloudflare D1 veritabanından çek (Tek yetkili kaynak)
    users_map = {}
    try:
        d1_users = cf_d1_query("SELECT id, email, display_name, avatar_url, role, auth_provider, created_at FROM users")
        if d1_users:
            for u in d1_users:
                u_email = (u.get("email") or "").strip().lower()
                if u_email:
                    is_adm = is_admin_user(u, u_email)
                    users_map[u_email] = {
                        "id": u.get("id"),
                        "email": u.get("email", ""),
                        "display_name": u.get("display_name") or u_email.split("@")[0],
                        "avatar_url": u.get("avatar_url") or "",
                        "auth_provider": u.get("auth_provider") or "local",
                        "created_at": u.get("created_at") or "",
                        "role": "admin" if is_adm else (u.get("role") or "user"),
                        "is_online": u_email in active_emails
                    }
    except Exception as e:
        print(f"[Admin users D1 Warning] {e}")

    # Liste olarak sıralı döndür
    user_list = sorted(list(users_map.values()), key=lambda x: x.get("created_at") or "", reverse=True)
    return {"status": "ok", "users": user_list}


class AdminCreateUserRequest(BaseModel):
    email: str
    display_name: str
    password: str
    role: Optional[str] = "user"


@router.post("/api/admin/create-user")
def admin_create_user(req: AdminCreateUserRequest, authorization: Optional[str] = Header(None)):
    """Yöneticinin (Admin) yeni bir kullanıcı hesabını doğrudan oluşturmasını sağlar."""
    require_admin(authorization)
    from core.security import hash_password
    from datetime import datetime, timezone
    import secrets
    import re

    email = req.email.strip().lower()
    display_name = req.display_name.strip()
    password = req.password
    role = req.role.strip().lower() if req.role else "user"

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Geçersiz e-posta adresi.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalıdır.")
    if not display_name:
        raise HTTPException(status_code=400, detail="Ad Soyad boş bırakılamaz.")
    if role not in ["user", "admin"]:
        role = "user"

    # Cloudflare D1 kontrolü
    existing = cf_d1_query("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [email])
    if existing and len(existing) > 0:
        raise HTTPException(status_code=409, detail="Bu e-posta adresiyle zaten bir kullanıcı kayıtlı.")

    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        cf_d1_query(
            "INSERT INTO users (email, display_name, password_hash, salt, auth_provider, avatar_url, created_at, role) VALUES (?, ?, ?, ?, 'local', '', ?, ?)",
            [email, display_name, pw_hash, salt, now_iso, role]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kullanıcı veritabanına eklenemedi: {str(e)}")

    return {
        "status": "ok",
        "message": f"'{display_name}' ({email}) kullanıcısı başarıyla oluşturuldu."
    }


@router.post("/api/admin/update-user-role")
def admin_update_user_role(req: UpdateUserRoleRequest, authorization: Optional[str] = Header(None)):
    admin_user = require_admin(authorization)
    target_email = req.email.strip().lower()
    
    if target_email == admin_user.get("email", "").lower():
        raise HTTPException(status_code=400, detail="Kendi yöneticilik rolünüzü değiştiremezsiniz.")

    from core.database import cf_d1_query
    new_role = req.role.strip().lower()

    # Kullanıcının var olduğunu Cloudflare D1'de doğrula
    existing = cf_d1_query("SELECT id, email FROM users WHERE LOWER(email) = ? LIMIT 1", [target_email])
    if not existing:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    user_id = existing[0].get("id")

    # Rol güncellemesi ve oturum temizliği (anında tek oturum yenileme)
    cf_d1_query("UPDATE users SET role = ? WHERE LOWER(email) = ?", [new_role, target_email])
    if user_id is not None:
        cf_d1_query("DELETE FROM sessions WHERE user_id = ?", [user_id])

    return {"status": "ok", "message": f"{target_email} kullanıcısının rolü '{new_role}' olarak güncellendi ve açık oturumları güvenle yenilendi."}


@router.post("/api/admin/delete-user")
def admin_delete_user(req: DeleteUserRequest, authorization: Optional[str] = Header(None)):
    admin_user = require_admin(authorization)
    target_email = req.email.strip().lower()

    if target_email == admin_user.get("email", "").lower():
        raise HTTPException(status_code=400, detail="Kendi hesabınızı yönetici panelinden silemezsiniz.")

    from core.database import cf_d1_query
    existing = cf_d1_query("SELECT id, email FROM users WHERE LOWER(email) = ? LIMIT 1", [target_email])
    if not existing:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    user_id = existing[0].get("id")

    # 1. Kullanıcının aktif oturumlarını temizle (sessions tablosu user_id ile eşleşir)
    if user_id is not None:
        try:
            cf_d1_query("DELETE FROM sessions WHERE user_id = ?", [user_id])
        except Exception:
            pass

    # 2. Kullanıcının AI sohbet ve mesaj kayıtlarını temizle
    try:
        cf_d1_query("DELETE FROM ai_messages WHERE LOWER(user_email) = ?", [target_email])
        cf_d1_query("DELETE FROM ai_chats WHERE LOWER(user_email) = ?", [target_email])
    except Exception:
        pass

    # 3. Kullanıcıya ait boş/varsayılan workspace kayıtlarını temizle
    try:
        cf_d1_query("DELETE FROM workspaces WHERE LOWER(owner_email) = ?", [target_email])
    except Exception:
        pass

    # 4. Kullanıcıyı users tablosundan kalıcı olarak sil
    cf_d1_query("DELETE FROM users WHERE LOWER(email) = ?", [target_email])

    return {"status": "ok", "message": f"{target_email} hesabı ve ilişkili verileri başarıyla silindi."}


@router.get("/api/admin/models")
def admin_get_models(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    models_info = []
    
    for key, info in MODEL_REGISTRY.items():
        fname = info.get("filename", "")
        fpath = ROOT_DIR / fname
        exists = fpath.exists()
        size_actual_mb = round(fpath.stat().st_size / (1024 * 1024), 2) if exists else 0
        cached = any(k.startswith(f"{key}::") for k in _MODEL_CACHE.keys())
        
        models_info.append({
            "key": key,
            "name": info.get("label", key),
            "filename": fname,
            "exists": exists,
            "size_mb": size_actual_mb or info.get("size_mb", 0),
            "type": info.get("type", "standard"),
            "speed": info.get("speed", "orta"),
            "accuracy": info.get("accuracy", "iyi"),
            "is_cached_in_memory": cached,
            "device": _ACTIVE_DEVICE
        })
    return {"status": "ok", "models": models_info}


@router.post("/api/admin/models/preload")
def admin_preload_model(req: Dict[str, str], authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    model_key = req.get("model_key", "yolov8s-worldv2")
    try:
        model, actual_key = get_ai_model(model_key, _ACTIVE_DEVICE, allow_heavy_fallback=False)
        return {"status": "ok", "message": f"'{actual_key}' modeli başarıyla RAM önbelleğine yüklendi."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model yüklenirken hata: {str(e)}")


@router.get("/api/admin/logs")
def admin_get_logs(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    from core.database import load_users
    users_data = load_users()
    logs = []
    
    for u in users_data.get("users", []):
        if u.get("created_at"):
            logs.append({
                "timestamp": u.get("created_at"),
                "level": "INFO",
                "category": "AUTH",
                "message": f"Yeni kullanıcı kaydoldu: {u.get('display_name')} ({u.get('email')}) — Sağlayıcı: {u.get('auth_provider', 'local')}"
            })
    
    from datetime import datetime, timezone
    logs.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "INFO",
        "category": "SYSTEM",
        "message": f"Sistem aktif ve çalışıyor. Aktif hızlandırıcı: {_ACTIVE_DEVICE.upper()}, Bellekteki AI Modelleri: {len(_MODEL_CACHE)}"
    })
    
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"status": "ok", "logs": logs[:50]}


# ─────────────────────────────────────────────────────────────────────────────
# EXPLORE TEMPLATES MANAGEMENT (ADMIN & PUBLIC)
# ─────────────────────────────────────────────────────────────────────────────

class UpdateTemplateStatusRequest(BaseModel):
    template_id: str
    is_active: bool


@router.get("/api/admin/templates")
def admin_get_templates(authorization: Optional[str] = Header(None)):
    """Admin panelinden tüm şablonları ve aktif/pasif vitrin durumlarını getirir."""
    require_admin(authorization)
    try:
        rows = cf_d1_query(
            """
            SELECT id, category, title, description, banner_cls, pill_text, 
                   badge_title, badge_cls, task_type, recommended_model, 
                   classes_json, is_active, created_at
            FROM explore_templates
            ORDER BY category ASC, id ASC
            """
        )
        if rows is not None:
            templates_list = []
            for r in rows:
                classes = []
                if r.get("classes_json"):
                    try:
                        classes = json.loads(r["classes_json"])
                    except Exception:
                        classes = []
                templates_list.append({
                    "id": r.get("id"),
                    "category": r.get("category"),
                    "title": r.get("title"),
                    "description": r.get("description"),
                    "banner_cls": r.get("banner_cls"),
                    "pill_text": r.get("pill_text"),
                    "badge_title": r.get("badge_title"),
                    "badge_cls": r.get("badge_cls"),
                    "task_type": r.get("task_type"),
                    "recommended_model": r.get("recommended_model"),
                    "classes": classes,
                    "is_active": bool(r.get("is_active", 1)),
                    "created_at": r.get("created_at")
                })
            return {"status": "ok", "templates": templates_list}
    except Exception as e:
        print(f"[Admin Get Templates Error] {e}")

    # Fallback to python list in scripts/generate_templates.py if D1 is unreachable
    try:
        from scripts.generate_templates import templates
        return {
            "status": "ok",
            "templates": [
                {
                    "id": t["tmpl"],
                    "category": t["cat"],
                    "title": t["title"],
                    "description": t.get("desc", ""),
                    "banner_cls": t.get("banner", ""),
                    "pill_text": t.get("pill", ""),
                    "badge_title": t.get("badge", ""),
                    "badge_cls": t.get("badge_cls", ""),
                    "task_type": t.get("type", "Nesne Tespiti"),
                    "recommended_model": t.get("hint", ""),
                    "classes": [{"name": c[0], "color": c[1]} for c in t.get("classes", [])] if t.get("classes") else [],
                    "is_active": True,
                    "created_at": ""
                } for t in templates
            ]
        }
    except Exception:
        return {"status": "ok", "templates": []}


@router.post("/api/admin/templates/toggle-status")
def admin_toggle_template_status(req: UpdateTemplateStatusRequest, authorization: Optional[str] = Header(None)):
    """Adminin şablonu vitrinde göster/gizle durumunu Cloudflare D1 üzerinde değiştirmesini sağlar."""
    require_admin(authorization)
    val = 1 if req.is_active else 0
    try:
        res = cf_d1_query(
            "UPDATE explore_templates SET is_active = ? WHERE id = ?",
            [val, req.template_id]
        )
        if res is not None:
            status_text = "vitrine eklendi (aktif)" if req.is_active else "vitrinden kaldırıldı (pasif)"
            return {"status": "ok", "message": f"Şablon başarıyla {status_text}."}
        else:
            raise HTTPException(status_code=500, detail="Cloudflare D1 veritabanı güncellenemedi.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN USER PROJECTS MANAGEMENT API
# ─────────────────────────────────────────────────────────────────────────────

class AdminProjectVisibilityRequest(BaseModel):
    project_id: str
    visibility: str  # 'public' or 'private'


@router.get("/api/admin/projects")
def admin_get_all_projects(authorization: Optional[str] = Header(None)):
    """
    Sistemdeki tüm kullanıcı projelerini hem Cloudflare D1 hem yerel projelerden birleştirerek
    detaylı istatistiklerle (sahibi, görünürlük, görsel sayısı, etiketlenme oranı) admin paneline döndürür.
    """
    require_admin(authorization)

    # 1. Proje config'ini ve kategorileri al
    all_categories = get_categories(force_refresh=True)
    config = load_project_config()
    cfg_projects = config.get("projects", {})

    # 2. Cloudflare D1'deki projeleri al
    d1_projects_map = {}
    try:
        rows = cf_d1_query(
            "SELECT id, display_name, description, project_type, visibility, license, created_at, owner_email FROM projects"
        )
        if rows:
            for r in rows:
                if r.get("id"):
                    d1_projects_map[r["id"].lower()] = r
    except Exception as e:
        print(f"[Admin Projects D1 Sync Warning] {e}")

    # 3. Haritalandır ve zenginleştir
    results = []
    seen_ids = set()

    for cat in all_categories:
        # Gerçek klasör/proje kimliğini al (name görünen ad, id ise asıl klasör kimliğidir)
        pid = (cat.get("id") or cat.get("name") or "").strip().lower()
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)

        meta = cfg_projects.get(pid) or cfg_projects.get(cat.get("name", "")) or {}
        d1_meta = d1_projects_map.get(pid, {})

        # Sahip bilgisi: D1 -> cat -> meta -> admin
        owner_email = (
            d1_meta.get("owner_email")
            or cat.get("owner_email")
            or meta.get("owner_email")
            or "admin"
        )
        visibility = d1_meta.get("visibility") or cat.get("visibility") or meta.get("visibility") or "private"
        display_name = (
            d1_meta.get("display_name")
            or cat.get("display_name")
            or cat.get("name")
            or meta.get("display_name")
            or pid.capitalize()
        )
        created_at = d1_meta.get("created_at") or cat.get("created_at") or meta.get("created_at") or ""
        project_type = d1_meta.get("project_type") or cat.get("project_type") or meta.get("project_type") or "detection"

        img_count = cat.get("image_count", 0)
        lbl_count = cat.get("label_count", 0)
        pct = round((lbl_count / img_count * 100), 1) if img_count > 0 else 0

        results.append({
            "id": pid,
            "display_name": display_name,
            "description": d1_meta.get("description") or cat.get("description") or meta.get("description") or "",
            "project_type": project_type,
            "visibility": visibility,
            "license": d1_meta.get("license") or cat.get("license") or meta.get("license") or "CC BY 4.0",
            "owner_email": owner_email,
            "created_at": created_at,
            "total_images": img_count,
            "total_labeled": lbl_count,
            "percent": pct,
            "classes_count": len(cat.get("classes", []))
        })

    # D1'de olup yerelde henüz klasörü açılmamış projeleri de ekle
    for pid, d1_p in d1_projects_map.items():
        if pid not in seen_ids:
            seen_ids.add(pid)
            results.append({
                "id": pid,
                "display_name": d1_p.get("display_name") or pid.capitalize(),
                "description": d1_p.get("description") or "",
                "project_type": d1_p.get("project_type") or "detection",
                "visibility": d1_p.get("visibility") or "private",
                "license": d1_p.get("license") or "CC BY 4.0",
                "owner_email": d1_p.get("owner_email") or "admin",
                "created_at": d1_p.get("created_at") or "",
                "total_images": 0,
                "total_labeled": 0,
                "percent": 0,
                "classes_count": 0
            })

    # En yeniden eskiye sırala
    results.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"status": "ok", "projects": results, "total_count": len(results)}


@router.post("/api/admin/projects/visibility")
def admin_toggle_project_visibility(req: AdminProjectVisibilityRequest, authorization: Optional[str] = Header(None)):
    """Adminin herhangi bir kullanıcının projesini Public veya Private yapmasını sağlar."""
    require_admin(authorization)
    target_vis = req.visibility.strip().lower()
    if target_vis not in ("public", "private"):
        raise HTTPException(status_code=400, detail="Görünürlük yalnızca 'public' veya 'private' olabilir.")

    pid = req.project_id.strip()
    from api.projects import save_project_config

    # Yerel config güncelle
    config = load_project_config()
    for key in (pid, pid.lower()):
        if key in config.get("projects", {}):
            config["projects"][key]["visibility"] = target_vis
            save_project_config(config)
            break

    # Cloudflare D1 güncelle
    try:
        cf_d1_query("UPDATE projects SET visibility = ? WHERE LOWER(id) = ?", [target_vis, pid.lower()])
    except Exception as e:
        print(f"[Admin project visibility D1 update warning] {e}")

    return {
        "status": "ok",
        "message": f"'{pid}' projesinin görünürlüğü '{target_vis.upper()}' olarak güncellendi.",
        "project_id": pid,
        "visibility": target_vis
    }


@router.delete("/api/admin/projects/{project_id}")
def admin_delete_project(project_id: str, authorization: Optional[str] = Header(None)):
    """Adminin uygunsuz veya istenmeyen bir kullanıcı projesini kalıcı olarak silmesini sağlar."""
    require_admin(authorization)
    clean_id = project_id.strip().lower()

    # Yerel dizinleri sil
    proj_dir = ROOT_DIR / clean_id
    labeled_dir = ROOT_DIR / f"{clean_id}_labeled"

    try:
        if proj_dir.exists():
            shutil.rmtree(proj_dir, ignore_errors=True)
        if labeled_dir.exists():
            shutil.rmtree(labeled_dir, ignore_errors=True)
    except Exception as e:
        print(f"[Admin delete project dir warning] {e}")

    # Config temizle
    from api.projects import save_project_config
    config = load_project_config()
    if clean_id in config.get("projects", {}):
        del config["projects"][clean_id]
    if clean_id in config.get("classes", {}):
        del config["classes"][clean_id]
    save_project_config(config)

    # Cloudflare D1'den temizle
    try:
        cf_d1_query("DELETE FROM projects WHERE LOWER(id) = ?", [clean_id])
    except Exception as e:
        print(f"[Admin delete project D1 warning] {e}")

    return {"status": "ok", "message": f"'{clean_id}' projesi ve ilişkili tüm verileri kalıcı olarak silindi."}



class UpdateTemplateDemoImagesRequest(BaseModel):
    template_id: str
    sample_images: list  # [{url, caption, boxes:[{class_name,x,y,w,h,color}]}]


@router.post("/api/admin/templates/demo-images")
def admin_update_template_demo_images(req: UpdateTemplateDemoImagesRequest, authorization: Optional[str] = Header(None)):
    """Admin panelinden şablona demo görsel listesi (URL + bounding box) ekler/günceller."""
    require_admin(authorization)
    try:
        sample_images_json = json.dumps(req.sample_images, ensure_ascii=False)
        res = cf_d1_query(
            "UPDATE explore_templates SET sample_images_json = ? WHERE id = ?",
            [sample_images_json, req.template_id]
        )
        if res is not None:
            return {
                "status": "ok",
                "message": f"'{req.template_id}' şablonuna {len(req.sample_images)} demo görsel başarıyla kaydedildi."
            }
        else:
            raise HTTPException(status_code=500, detail="Cloudflare D1 güncellenemedi.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demo görsel güncelleme hatası: {str(e)}")


@router.get("/api/templates/active")
def get_active_explore_templates():
    """Explore (Şablonlar) sekmesinde yalnızca admin tarafından aktif edilen şablonları listeler."""
    try:
        rows = cf_d1_query(
            """
            SELECT id, category, title, description, banner_cls, pill_text, 
                   badge_title, badge_cls, task_type, recommended_model, 
                   classes_json, sample_images_json, created_at
            FROM explore_templates
            WHERE is_active = 1
            ORDER BY category ASC, id ASC
            """
        )
        if rows is not None:
            active_list = []
            for r in rows:
                classes = []
                if r.get("classes_json"):
                    try:
                        classes = json.loads(r["classes_json"])
                    except Exception:
                        classes = []
                sample_images = []
                if r.get("sample_images_json"):
                    try:
                        sample_images = json.loads(r["sample_images_json"])
                    except Exception:
                        sample_images = []
                active_list.append({
                    "id": r.get("id"),
                    "category": r.get("category"),
                    "title": r.get("title"),
                    "description": r.get("description"),
                    "banner_cls": r.get("banner_cls"),
                    "pill_text": r.get("pill_text"),
                    "badge_title": r.get("badge_title"),
                    "badge_cls": r.get("badge_cls"),
                    "task_type": r.get("task_type"),
                    "recommended_model": r.get("recommended_model"),
                    "classes": classes,
                    "sample_images": sample_images,
                    "created_at": r.get("created_at")
                })
            return {"status": "ok", "templates": active_list}
        else:
            # D1 boş döndü — fallback'e geç
            pass
    except Exception as e:
        print(f"[Active Templates Error] {e}")

    # Fallback: D1 erişilemiyorsa veya boşsa Python listesini kullan
    try:
        from scripts.generate_templates import templates
        return {
            "status": "ok",
            "templates": [
                {
                    "id": t["tmpl"],
                    "category": t["cat"],
                    "title": t["title"],
                    "description": t.get("desc", ""),
                    "banner_cls": t.get("banner", ""),
                    "pill_text": t.get("pill", ""),
                    "badge_title": t.get("badge", ""),
                    "badge_cls": t.get("badge_cls", ""),
                    "task_type": t.get("type", "Nesne Tespiti"),
                    "recommended_model": t.get("hint", ""),
                    "classes": [{"name": c[0], "color": c[1]} for c in t.get("classes", [])] if t.get("classes") else [],
                    "sample_images": t.get("sample_images", []),
                    "created_at": ""
                } for t in templates
            ]
        }
    except Exception:
        return {"status": "ok", "templates": []}

# DATASET HEALTH, DUPLICATE SCAN & QUALITY STATS
# ─────────────────────────────────────────────────────────────────────────────

class HealthFixRequest(BaseModel):
    category: str
    fix_micro_boxes: bool = True
    fix_duplicates: bool = True
    min_box_pixels: int = 5
    duplicate_iou_thresh: float = 0.85


@router.get("/api/projects/health-check")
def check_project_health(category: str = Query(...)):
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    if not labels_dir.exists():
        if category == "bag":
            labels_dir = ROOT_DIR / "bag_detection_project_labeled" / "labels"
        elif category == "bag_detection_project":
            labels_dir = ROOT_DIR / "bag_labeled" / "labels"

    config = load_project_config()
    cls_list = config.get("classes", {}).get(category.lower(), [])
    cls_names = {c.get("id", i): c.get("name", f"Class_{i}") for i, c in enumerate(cls_list)}

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_image_stems = set()
    if cat_dir.exists():
        with os.scandir(cat_dir) as it:
            for entry in it:
                if entry.is_file():
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in valid_extensions:
                        all_image_stems.add(os.path.splitext(entry.name)[0])

    total_images = len(all_image_stems)
    labeled_stems = set()
    total_boxes = 0

    micro_boxes = []
    duplicate_boxes = []
    class_counts = Counter()

    if labels_dir.exists():
        with os.scandir(labels_dir) as it:
            for entry in it:
                if entry.is_file() and entry.name.endswith(".txt"):
                    stem = entry.name[:-4]
                    if stem in all_image_stems:
                        try:
                            with open(entry.path, "r", encoding="utf-8") as f:
                                content = f.read()
                            if not content.strip():
                                continue
                            labeled_stems.add(stem)
                            boxes_in_img = []
                            for line in content.splitlines():
                                parts = line.strip().split()
                                if len(parts) == 5:
                                    try:
                                        cid = int(parts[0])
                                        xc, yc, w, h = map(float, parts[1:])
                                        class_counts[cid] += 1
                                        total_boxes += 1
                                        boxes_in_img.append((cid, xc, yc, w, h))
                                        if w < 0.006 or h < 0.006:
                                            micro_boxes.append({"file": entry.name, "box": (xc, yc, w, h), "class_id": cid})
                                    except ValueError:
                                        pass

                            for i in range(len(boxes_in_img)):
                                for j in range(i + 1, len(boxes_in_img)):
                                    c1, x1, y1, w1, h1 = boxes_in_img[i]
                                    c2, x2, y2, w2, h2 = boxes_in_img[j]
                                    if c1 == c2:
                                        min_x = max(x1 - w1/2, x2 - w2/2)
                                        min_y = max(y1 - h1/2, y2 - h2/2)
                                        max_x = min(x1 + w1/2, x2 + w2/2)
                                        max_y = min(y1 + h1/2, y2 + h2/2)
                                        inter_w = max(0, max_x - min_x)
                                        inter_h = max(0, max_y - min_y)
                                        inter_area = inter_w * inter_h
                                        union_area = (w1 * h1) + (w2 * h2) - inter_area
                                        if union_area > 0 and (inter_area / union_area) > 0.85:
                                            duplicate_boxes.append({"file": entry.name, "box1": (x1, y1, w1, h1), "box2": (x2, y2, w2, h2)})
                        except Exception:
                            pass

    labeled_images = len(labeled_stems)
    empty_images = max(0, total_images - labeled_images)

    score = 100
    if total_images > 0:
        empty_ratio = empty_images / total_images
        score -= int(empty_ratio * 30)
    if micro_boxes:
        score -= min(25, len(micro_boxes) * 2)
    if duplicate_boxes:
        score -= min(20, len(duplicate_boxes) * 3)
    score = max(15, min(100, score))

    class_distribution = [
        {
            "id": cid,
            "name": cls_names.get(cid, f"Class_{cid}"),
            "count": class_counts.get(cid, 0),
            "percentage": round((class_counts.get(cid, 0) / max(1, total_boxes)) * 100, 1)
        }
        for cid in sorted(list(cls_names.keys()) + list(class_counts.keys()))
    ]

    return {
        "status": "ok",
        "category": category,
        "health_score": score,
        "total_images": total_images,
        "labeled_images": labeled_images,
        "empty_images": empty_images,
        "total_boxes": total_boxes,
        "micro_boxes_count": len(micro_boxes),
        "micro_boxes": micro_boxes[:50],
        "duplicate_boxes_count": len(duplicate_boxes),
        "duplicate_boxes": duplicate_boxes[:50],
        "class_distribution": class_distribution
    }


@router.post("/api/projects/health-fix")
def fix_project_health(req: HealthFixRequest):
    labels_dir = ROOT_DIR / f"{req.category}_labeled" / "labels"
    if not labels_dir.exists():
        if req.category == "bag":
            labels_dir = ROOT_DIR / "bag_detection_project_labeled" / "labels"
        elif req.category == "bag_detection_project":
            labels_dir = ROOT_DIR / "bag_labeled" / "labels"

    if not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Etiket klasörü bulunamadı")

    fixed_files = 0
    removed_micro = 0
    removed_dups = 0

    for txt_path in labels_dir.glob("*.txt"):
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                lines = [l.strip().split() for l in f if l.strip()]

            new_lines = []
            modified = False
            for l in lines:
                if len(l) == 5:
                    cid = l[0]
                    xc, yc, w, h = map(float, l[1:])
                    if req.fix_micro_boxes and (w < 0.006 or h < 0.006):
                        modified = True
                        removed_micro += 1
                        continue
                    new_lines.append((cid, xc, yc, w, h))

            if req.fix_duplicates and len(new_lines) > 1:
                deduped = []
                for b in new_lines:
                    is_dup = False
                    for db in deduped:
                        if b[0] == db[0]:
                            min_x = max(b[1] - b[3]/2, db[1] - db[3]/2)
                            min_y = max(b[2] - b[4]/2, db[2] - db[4]/2)
                            max_x = min(b[1] + b[3]/2, db[1] + db[3]/2)
                            max_y = min(b[2] + b[4]/2, db[2] + db[4]/2)
                            iw = max(0, max_x - min_x)
                            ih = max(0, max_y - min_y)
                            ia = iw * ih
                            ua = (b[3] * b[4]) + (db[3] * db[4]) - ia
                            if ua > 0 and (ia / ua) > req.duplicate_iou_thresh:
                                is_dup = True
                                modified = True
                                removed_dups += 1
                                break
                    if not is_dup:
                        deduped.append(b)
                new_lines = deduped

            if modified:
                with open(txt_path, "w", encoding="utf-8") as f:
                    for b in new_lines:
                        f.write(f"{b[0]} {b[1]:.6f} {b[2]:.6f} {b[3]:.6f} {b[4]:.6f}\n")
                fixed_files += 1
        except Exception:
            pass

    return {
        "status": "ok",
        "fixed_files": fixed_files,
        "removed_micro_boxes": removed_micro,
        "removed_duplicate_boxes": removed_dups
    }


def _compute_dhash(img_path: Path, hash_size: int = 8) -> Optional[int]:
    try:
        from PIL import Image
        with Image.open(img_path) as img:
            img = img.convert('L').resize((hash_size + 1, hash_size), Image.Resampling.BILINEAR)
            pixels = list(img.getdata())
            diff = []
            for row in range(hash_size):
                for col in range(hash_size):
                    left = pixels[row * (hash_size + 1) + col]
                    right = pixels[row * (hash_size + 1) + col + 1]
                    diff.append(1 if left > right else 0)
            decimal_value = 0
            for bit in diff:
                decimal_value = (decimal_value << 1) | bit
            return decimal_value
    except Exception:
        return None

def _hamming_distance(h1: int, h2: int) -> int:
    return bin(h1 ^ h2).count('1')


@router.get("/api/projects/scan-duplicates")
def api_scan_duplicates(category: str = Query(...), filenames: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    check_project_permission(category, authorization, require_edit=False)
    cat_dir = ROOT_DIR / category
    cat_dir.mkdir(parents=True, exist_ok=True)

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    # Cloudflare R2 Source of Truth senkronizasyonu
    try:
        st_info = get_project_storage_info(category)
        r2_objs = cf_r2_list_objects(prefix=st_info["r2_images_prefix"], limit=2500)
        if not r2_objs:
            r2_objs = cf_r2_list_objects(prefix=category, limit=2500)

        for obj in r2_objs:
            k = obj.get("key", "")
            fn = os.path.basename(k)
            ext = os.path.splitext(fn)[1].lower()
            if ext in valid_ext:
                local_p = cat_dir / fn
                if not local_p.exists():
                    data = cf_r2_get_object(k)
                    if data:
                        with open(local_p, "wb") as f:
                            f.write(data)
    except Exception as r2_err:
        print(f"[scan-duplicates R2 sync warning]: {r2_err}")

    img_files = sorted([f for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext])
    if filenames:
        allowed_set = {x.strip() for x in filenames.split(",") if x.strip()}
        img_files = [f for f in img_files if f.name in allowed_set]
    total_scanned = len(img_files)

    if total_scanned == 0:
        return {
            "status": "ok",
            "category": category,
            "total_images": 0,
            "duplicate_count": 0,
            "duplicate_groups": []
        }

    size_map = {}
    for f in img_files:
        try:
            sz = f.stat().st_size
            size_map.setdefault(sz, []).append(f)
        except Exception:
            continue

    duplicate_groups = []
    seen_files = set()

    for sz, flist in size_map.items():
        if len(flist) > 1:
            md5_map = {}
            for f in flist:
                try:
                    with open(f, 'rb') as fp:
                        head = fp.read(65536)
                        h = hashlib.md5(head).hexdigest()
                    md5_map.setdefault(h, []).append(f.name)
                except Exception:
                    continue

            for h, group in md5_map.items():
                if len(group) > 1:
                    duplicate_groups.append({
                        "type": "exact",
                        "similarity_pct": 100,
                        "original": group[0],
                        "duplicates": group[1:]
                    })
                    seen_files.update(group)

    cache_file = ROOT_DIR / f"{category}_labeled" / "dhash_cache.json"
    dhash_cache = {}
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                dhash_cache = json.load(f)
        except Exception:
            pass

    uncomputed = [f for f in img_files if f.name not in dhash_cache and f.name not in seen_files][:250]
    if uncomputed:
        for f in uncomputed:
            dh = _compute_dhash(f)
            if dh is not None:
                dhash_cache[f.name] = dh
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(dhash_cache, f)
        except Exception:
            pass

    cached_items = [(k, v) for k, v in dhash_cache.items() if k not in seen_files][:600]
    for i in range(len(cached_items)):
        name1, h1 = cached_items[i]
        if name1 in seen_files:
            continue
        near_dups = []
        for j in range(i + 1, min(len(cached_items), i + 100)):
            name2, h2 = cached_items[j]
            if name2 in seen_files:
                continue
            dist = _hamming_distance(h1, h2)
            if dist <= 3:
                sim_pct = round((64 - dist) / 64 * 100, 1)
                near_dups.append((name2, sim_pct))
                seen_files.add(name2)

        if near_dups:
            seen_files.add(name1)
            duplicate_groups.append({
                "type": "visual_near",
                "similarity_pct": near_dups[0][1],
                "original": name1,
                "duplicates": [d[0] for d in near_dups]
            })

    total_duplicates = sum(len(g["duplicates"]) for g in duplicate_groups)

    return {
        "status": "ok",
        "category": category,
        "total_images": total_scanned,
        "duplicate_count": total_duplicates,
        "duplicate_groups": duplicate_groups
    }


@router.get("/api/projects/quality-stats")
def project_quality_stats(category: str = Query(...), authorization: Optional[str] = Header(None)):
    check_project_permission(category, authorization, require_edit=False)
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    img_files = [f for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext]
    total_images = len(img_files)

    config = load_project_config()
    cls_list = config.get("classes", {}).get(category.lower(), [])
    cls_names = {c.get("id", i): c.get("name", f"Class_{i}") for i, c in enumerate(cls_list)}

    class_counts: Dict[int, int] = {}
    box_areas: list = []
    box_widths: list = []
    box_heights: list = []
    labeled_count = 0
    empty_count = 0
    multi_class_count = 0

    if labels_dir.exists():
        for img_f in img_files:
            txt_path = labels_dir / (img_f.stem + ".txt")
            if not txt_path.exists() or txt_path.stat().st_size == 0:
                empty_count += 1
                continue
            labeled_count += 1
            lines = txt_path.read_text(encoding="utf-8").strip().splitlines()
            classes_in_image = set()
            for line in lines:
                parts = line.split()
                if len(parts) == 5:
                    try:
                        cid = int(parts[0])
                        w = float(parts[3])
                        h = float(parts[4])
                        class_counts[cid] = class_counts.get(cid, 0) + 1
                        box_areas.append(round(w * h * 100, 4))
                        box_widths.append(round(w * 100, 2))
                        box_heights.append(round(h * 100, 2))
                        classes_in_image.add(cid)
                    except ValueError:
                        pass
            if len(classes_in_image) > 1:
                multi_class_count += 1
    else:
        empty_count = total_images

    def _histogram(values, buckets=8):
        if not values:
            return []
        mn, mx = min(values), max(values)
        if mn == mx:
            return [{"range": f"{mn:.1f}%", "count": len(values)}]
        step = (mx - mn) / buckets
        hist = []
        for i in range(buckets):
            lo = mn + i * step
            hi = lo + step
            cnt = sum(1 for v in values if lo <= v < hi)
            hist.append({"range": f"{lo:.1f}–{hi:.1f}%", "count": cnt})
        return hist

    total_boxes = sum(class_counts.values())
    class_dist = [
        {
            "id": cid,
            "name": cls_names.get(cid, f"Class_{cid}"),
            "count": cnt,
            "pct": round(cnt / total_boxes * 100, 1) if total_boxes else 0,
        }
        for cid, cnt in sorted(class_counts.items())
    ]

    label_ratio = labeled_count / total_images if total_images else 0
    balance_score = 0
    if class_dist:
        max_cnt = max(d["count"] for d in class_dist)
        min_cnt = min(d["count"] for d in class_dist)
        balance_score = (min_cnt / max_cnt) if max_cnt else 1
    quality_score = int((label_ratio * 0.6 + balance_score * 0.4) * 100)

    warnings = []
    if label_ratio < 0.5:
        warnings.append(f"Görsellerin yalnızca %{round(label_ratio*100)}'i etiketlenmiş. Daha fazla etiketleme önerilir.")
    if class_dist:
        max_cls = max(class_dist, key=lambda x: x["count"])
        min_cls = min(class_dist, key=lambda x: x["count"])
        if max_cls["count"] > min_cls["count"] * 5 and len(class_dist) > 1:
            warnings.append(f"Sınıf dengesizliği: '{max_cls['name']}' ({max_cls['count']}) ile '{min_cls['name']}' ({min_cls['count']}) arasında büyük fark var.")
    if total_images < 50:
        warnings.append("Toplam görsel sayısı 50'nin altında. Daha fazla veri model kalitesini artırır.")

    return {
        "status": "ok",
        "category": category,
        "total_images": total_images,
        "labeled_count": labeled_count,
        "empty_count": empty_count,
        "label_ratio_pct": round(label_ratio * 100, 1),
        "total_boxes": total_boxes,
        "multi_class_images": multi_class_count,
        "quality_score": quality_score,
        "class_distribution": class_dist,
        "box_area_histogram": _histogram(box_areas),
        "avg_box_area_pct": round(sum(box_areas) / len(box_areas), 3) if box_areas else 0,
        "avg_box_w_pct": round(sum(box_widths) / len(box_widths), 2) if box_widths else 0,
        "avg_box_h_pct": round(sum(box_heights) / len(box_heights), 2) if box_heights else 0,
        "warnings": warnings,
    }


# ─────────────────────────────────────────────────────────────────────────────
# VISUAL SIMILARITY, SHORTCUTS & PROMPT SUGGESTER
# ─────────────────────────────────────────────────────────────────────────────

_PROMPT_VOCAB = {
    "bag": ["bag", "handbag", "backpack", "tote bag", "shoulder bag", "purse", "clutch", "suitcase"],
    "belt": ["belt", "leather belt", "waist belt", "strap", "buckle belt"],
    "shoe": ["shoe", "sneaker", "boot", "sandal", "heel", "loafer"],
    "person": ["person", "human", "man", "woman", "pedestrian"],
    "car": ["car", "vehicle", "automobile", "sedan", "suv"],
}

class SuggestPromptsRequest(BaseModel):
    category: str
    class_name: str
    existing_prompts: Optional[List[str]] = None


@router.post("/api/suggest-prompts")
def suggest_prompts(req: SuggestPromptsRequest):
    from api.shared.utils import enrich_class_prompts
    query = req.class_name.strip().lower()
    existing = set(p.strip().lower() for p in (req.existing_prompts or []))
    suggestions = _PROMPT_VOCAB.get(query)
    if not suggestions:
        suggestions = enrich_class_prompts(req.class_name, [])

    new_suggestions = [p for p in suggestions if p not in existing]
    return {
        "status": "ok",
        "category": req.category,
        "class_name": req.class_name,
        "suggestions": new_suggestions[:15],
        "all_suggestions": suggestions[:15],
    }


class BoundingBox(BaseModel):
    class_id: int
    class_name: Optional[str] = ""
    x_center: Optional[float] = None
    y_center: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None


class FindSimilarRequest(BaseModel):
    category: str
    ref_image: str
    box: BoundingBox
    min_similarity: float = 0.65
    max_results: int = 200
    method: str = "orb"


@router.post("/api/find-similar")
def find_similar_instances(req: FindSimilarRequest):
    cat_dir = ROOT_DIR / req.category
    ref_path = cat_dir / req.ref_image
    if not ref_path.exists():
        raise HTTPException(status_code=404, detail="Referans görsel bulunamadı.")

    ref_img = load_image_rgb(ref_path)
    if ref_img is None:
        raise HTTPException(status_code=400, detail="Referans görsel yüklenemedi.")

    img_h, img_w = ref_img.shape[:2]
    x1 = max(0, int((req.box.x_center - req.box.width / 2) * img_w))
    y1 = max(0, int((req.box.y_center - req.box.height / 2) * img_h))
    x2 = min(img_w, int((req.box.x_center + req.box.width / 2) * img_w))
    y2 = min(img_h, int((req.box.y_center + req.box.height / 2) * img_h))

    if (x2 - x1) < 10 or (y2 - y1) < 10:
        raise HTTPException(status_code=400, detail="Referans kutu çok küçük.")

    template = ref_img[y1:y2, x1:x2]
    t_h, t_w = template.shape[:2]
    template_gray = cv2.cvtColor(template, cv2.COLOR_RGB2GRAY)

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_files = sorted([f for f in os.listdir(cat_dir) if os.path.splitext(f)[1].lower() in valid_extensions])
    scan_files = all_files if req.max_results <= 0 else all_files[:max(req.max_results, 50)]

    matches = []
    for fname in scan_files:
        t_path = cat_dir / fname
        target_img = load_image_rgb(t_path)
        if target_img is None:
            continue
        target_h, target_w = target_img.shape[:2]
        target_gray = cv2.cvtColor(target_img, cv2.COLOR_RGB2GRAY)

        sw, sh = min(t_w, target_w - 1), min(t_h, target_h - 1)
        if sw < 10 or sh < 10:
            continue
        scaled_t = cv2.resize(template_gray, (sw, sh))
        res = cv2.matchTemplate(target_gray, scaled_t, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)

        if max_val >= req.min_similarity:
            mx1, my1 = max_loc
            mx2, my2 = mx1 + sw, my1 + sh
            matches.append({
                "filename": fname,
                "class_id": req.box.class_id,
                "class_name": req.box.class_name,
                "x_center": round(((mx1 + mx2) / 2.0) / target_w, 6),
                "y_center": round(((my1 + my2) / 2.0) / target_h, 6),
                "width": round(sw / target_w, 6),
                "height": round(sh / target_h, 6),
                "similarity": round(float(max_val), 3)
            })

    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return {
        "status": "ok",
        "reference_image": req.ref_image,
        "scanned_count": len(scan_files),
        "matched_count": len(matches),
        "matches": matches
    }


@router.get("/api/shortcuts")
def get_shortcuts():
    return {
        "status": "ok",
        "groups": [
            {
                "title": "Gezinme",
                "shortcuts": [
                    {"keys": ["←", "→"], "desc": "Önceki / Sonraki görsel"},
                    {"keys": ["Ctrl+←/→"], "desc": "İlk / Son görsele git"},
                    {"keys": ["G"], "desc": "Görsele git (numara gir)"},
                ]
            },
            {
                "title": "Çizim & Düzenleme",
                "shortcuts": [
                    {"keys": ["D"], "desc": "Çizim modu"},
                    {"keys": ["S"], "desc": "Seçim modu"},
                    {"keys": ["Space"], "desc": "Kaydırma (pan) modu"},
                    {"keys": ["Ctrl+Z"], "desc": "Geri al"},
                    {"keys": ["Ctrl+Y"], "desc": "Yeniden yap"},
                    {"keys": ["Ctrl+A"], "desc": "Tümünü seç"},
                    {"keys": ["Delete"], "desc": "Seçili kutuları sil"},
                    {"keys": ["Ctrl+C"], "desc": "Kutuları kopyala"},
                    {"keys": ["Ctrl+V"], "desc": "Kutuları yapıştır"},
                ]
            },
            {
                "title": "Görünüm",
                "shortcuts": [
                    {"keys": ["Z (basılı tut)"], "desc": "Büyüteç (loupe)"},
                    {"keys": ["H (basılı tut)"], "desc": "Kutuları gizle"},
                    {"keys": ["+", "-"], "desc": "Yakınlaş / Uzaklaş"},
                    {"keys": ["Ctrl+0"], "desc": "Ekrana sığdır"},
                ]
            },
            {
                "title": "Kaydetme & Diğer",
                "shortcuts": [
                    {"keys": ["Ctrl+S"], "desc": "Manuel kaydet"},
                    {"keys": ["F"], "desc": "Görseli işaretle (flag)"},
                    {"keys": ["Escape"], "desc": "Seçimi temizle / Modal kapat"},
                ]
            }
        ]
    }


@router.post("/api/projects/extract-video")
async def extract_video_frames(
    background_tasks: BackgroundTasks,
    category: str = Form(...),
    fps: float = Form(1.0),
    max_frames: int = Form(300),
    video: UploadFile = File(...),
):
    cat_dir = ROOT_DIR / category
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje klasörü bulunamadı.")

    video_bytes = await video.read()
    if len(video_bytes) > 500 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Video boyutu 500 MB'ı aşıyor.")

    tmp_video = ROOT_DIR / "exports" / f"_tmp_video_{int(time.time())}.mp4"
    tmp_video.parent.mkdir(exist_ok=True)
    tmp_video.write_bytes(video_bytes)

    try:
        cap = cv2.VideoCapture(str(tmp_video))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Video açılamadı.")

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_step = max(1, int(video_fps / max(fps, 0.1)))
        total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        max_frames = min(max_frames, 500)

        saved_count = 0
        frame_idx = 0
        timestamp = int(time.time())

        while cap.isOpened() and saved_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % frame_step == 0:
                fname = f"video_{timestamp}_f{frame_idx:05d}.jpg"
                out_path = cat_dir / fname
                cv2.imwrite(str(out_path), frame)
                saved_count += 1
            frame_idx += 1

        cap.release()
    finally:
        try:
            tmp_video.unlink(missing_ok=True)
        except Exception:
            pass

    return {
        "status": "ok",
        "category": category,
        "saved_frames": saved_count,
        "video_frames": total_video_frames,
        "message": f"{saved_count} kare '{category}' projesine eklendi.",
    }


class AugmentedExportRequest(BaseModel):
    category: str
    train_ratio: float = 0.80
    test_ratio: float = 0.0
    augmentations: Optional[List[str]] = None
    aug_types: Optional[List[str]] = None
    copies: int = 2


@router.post("/api/projects/export-augmented")
def export_augmented_dataset(req: AugmentedExportRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=False)
    cat = req.category
    cat_dir = ROOT_DIR / cat
    labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
    if not cat_dir.exists() or not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Proje veya etiket klasörü bulunamadı.")

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    pairs = []
    for txt_f in labels_dir.glob("*.txt"):
        if txt_f.stat().st_size == 0:
            continue
        stem = txt_f.stem
        for ext in valid_ext:
            cand = cat_dir / f"{stem}{ext}"
            if cand.exists():
                pairs.append((cand, txt_f))
                break

    if not pairs:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak etiketli görsel bulunamadı.")

    random.seed(42)
    random.shuffle(pairs)
    total = len(pairs)
    n_train = int(total * req.train_ratio)
    train_pairs = pairs[:n_train]
    val_pairs = pairs[n_train:]

    export_dir = ROOT_DIR / "exports" / f"{cat}_aug_export"
    if export_dir.exists():
        shutil.rmtree(export_dir)
    for split in ["train", "val"]:
        (export_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (export_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    aug_list = req.aug_types or req.augmentations or ["flip_h", "brightness", "rotate"]
    copies = max(1, min(req.copies, 5))
    generated = 0

    for split_name, split_pairs in [("train", train_pairs), ("val", val_pairs)]:
        for img_path, txt_path in split_pairs:
            shutil.copy2(img_path, export_dir / "images" / split_name / img_path.name)
            shutil.copy2(txt_path, export_dir / "labels" / split_name / (img_path.stem + ".txt"))

            if split_name == "val":
                continue

            rgb = load_image_rgb(img_path)
            if rgb is None:
                continue

            raw_boxes = []
            for line in txt_path.read_text(encoding="utf-8").strip().splitlines():
                pts = line.split()
                if len(pts) == 5:
                    try:
                        raw_boxes.append([int(pts[0])] + [float(x) for x in pts[1:]])
                    except ValueError:
                        pass

            for i in range(copies):
                aug = random.choice(aug_list)
                new_rgb = rgb.copy()
                new_boxes = [b[:] for b in raw_boxes]
                if aug == "flip_h":
                    new_rgb = np.fliplr(rgb)
                    new_boxes = [[b[0], 1.0 - b[1], b[2], b[3], b[4]] for b in raw_boxes]
                elif aug == "brightness":
                    arr = rgb.astype(np.float32) * random.uniform(0.7, 1.3)
                    new_rgb = np.clip(arr, 0, 255).astype(np.uint8)
                elif aug == "rotate":
                    # 180 derece döndürme ile kutu geometrisini bozmadan artır
                    new_rgb = np.rot90(rgb, 2)
                    new_boxes = [[b[0], 1.0 - b[1], 1.0 - b[2], b[3], b[4]] for b in raw_boxes]

                new_stem = f"{img_path.stem}_aug{i}"
                new_img_path = export_dir / "images" / split_name / f"{new_stem}.jpg"
                save_image_preview(new_img_path, new_rgb)
                new_lbl_path = export_dir / "labels" / split_name / f"{new_stem}.txt"
                lines = [f"{int(b[0])} {b[1]:.6f} {b[2]:.6f} {b[3]:.6f} {b[4]:.6f}\n" for b in new_boxes]
                new_lbl_path.write_text("".join(lines), encoding="utf-8")
                generated += 1

    config = load_project_config()
    cls_list = config.get("classes", {}).get(cat.lower(), [])
    names_yaml = "\n".join([f"  {c.get('id',i)}: {c.get('name',f'Class_{i}')}" for i, c in enumerate(cls_list)])
    yaml_content = f"path: {cat}_aug_dataset\ntrain: images/train\nval: images/val\n\nnames:\n{names_yaml}\n"
    (export_dir / "data.yaml").write_text(yaml_content, encoding="utf-8")

    zip_base = ROOT_DIR / "exports" / f"{cat}_augmented_dataset"
    zip_path = shutil.make_archive(str(zip_base), "zip", export_dir)
    zip_filename = os.path.basename(zip_path)
    file_size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 2)

    return {
        "status": "ok",
        "format": "YOLO + Augmented",
        "original_count": len(pairs),
        "augmented_count": generated,
        "total_count": len(pairs) + generated,
        "file_size_mb": file_size_mb,
        "download_url": f"/api/download-zip?filename={zip_filename}",
    }


@router.post("/api/projects/model-test")
async def model_test(
    category: str = Form(...),
    model_key: Optional[str] = Form(None),
    conf: float = Form(0.25),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    import base64
    from PIL import Image
    import io

    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş gerekli.")

    data = await file.read()
    try:
        img_pil = Image.open(io.BytesIO(data)).convert("RGB")
        img_rgb = np.array(img_pil)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Görsel açılamadı: {e}")

    img_h, img_w = img_rgb.shape[:2]
    config = load_project_config()
    cls_list = config.get("classes", {}).get(category.lower(), [])
    class_names = [c["name"] for c in sorted(cls_list, key=lambda x: x["id"])]
    class_colors = {c["name"]: c.get("color", "#3b82f6") for c in cls_list}

    try:
        from api.ai_models import set_classes_if_changed, run_model_predict, _MODEL_LOCK
        with _MODEL_LOCK:
            model, used_key = get_ai_model(model_key or "yolov8s-worldv2")
            if class_names:
                set_classes_if_changed(model, class_names)
            results = run_model_predict(model, img_rgb, conf=max(0.05, min(0.95, conf)), verbose=False)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model çalıştırılamadı: {e}")

    detections = []
    preview_rgb = img_rgb.copy()

    if results and len(results) > 0:
        for box in results[0].boxes:
            try:
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                conf_val = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = class_names[cls_id] if cls_id < len(class_names) else f"class_{cls_id}"
                color_hex = class_colors.get(cls_name, "#3b82f6")
                h = color_hex.lstrip("#")
                rc, gc, bc = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
                cv2.rectangle(preview_rgb, (int(x1), int(y1)), (int(x2), int(y2)), (rc, gc, bc), 2)
                label = f"{cls_name} {conf_val:.0%}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(preview_rgb, (int(x1), int(y1) - th - 6), (int(x1) + tw + 4, int(y1)), (rc, gc, bc), -1)
                cv2.putText(preview_rgb, label, (int(x1) + 2, int(y1) - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                detections.append({
                    "class_id": cls_id, "class_name": cls_name,
                    "confidence": round(conf_val, 3), "color": color_hex,
                    "box_px": [round(x1), round(y1), round(x2), round(y2)],
                })
            except Exception:
                continue

    preview_bgr = cv2.cvtColor(preview_rgb, cv2.COLOR_RGB2BGR)
    _, buf = cv2.imencode(".jpg", preview_bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
    preview_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode()

    return {
        "status": "ok", "category": category, "model_used": used_key,
        "image_size": [img_w, img_h],
        "detection_count": len(detections),
        "detections": sorted(detections, key=lambda x: -x["confidence"]),
        "preview_b64": preview_b64,
    }
