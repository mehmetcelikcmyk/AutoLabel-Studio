"""
api/projects/core.py
Proje çekirdek CRUD ve yönetim endpoints:
- get_categories() (Merkezi kategori & proje listesi üretici)
- /api/projects (GET)
- /api/categories (GET)
- /api/projects/create (POST)
- /api/projects/delete (POST)
- /api/projects/rename (POST)
- /api/project-settings (GET)
- /api/project-settings/save (POST)
"""

import os
import re
import shutil
import time
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR, MAX_PROJECTS_PER_USER
from core.database import cf_d1_query, cf_r2_delete_prefix
from core.security import (
    get_current_user,
    is_admin_user,
    check_project_permission,
    user_can_access_project,
)
from api.shared.models import (
    CreateProjectRequest,
    DeleteProjectRequest,
    RenameProjectRequest,
    ProjectSettingsSaveRequest,
)
from api.shared.utils import (
    DEFAULT_CLASS_MAPPING,
    load_project_config,
    save_project_config,
    safe_project_path,
    sanitize_filename,
)

router = APIRouter(tags=["Projects Core"])

_CATEGORIES_CACHE: List[Dict[str, Any]] = []
_CATEGORIES_CACHE_TIME: float = 0.0
_CATEGORIES_CACHE_TTL: float = 30.0


def get_categories(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Tüm projelerin istatistik ve meta verilerini D1 ve yerel yapılandırma ile birleştirip döndürür."""
    global _CATEGORIES_CACHE, _CATEGORIES_CACHE_TIME
    now = time.time()
    if not force_refresh and _CATEGORIES_CACHE and (now - _CATEGORIES_CACHE_TIME < _CATEGORIES_CACHE_TTL):
        return [dict(c) for c in _CATEGORIES_CACHE]

    config = load_project_config()
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    projects_meta = dict(config.get("projects", {}))
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    try:
        d1_projects = cf_d1_query("SELECT id, display_name, description, project_type, visibility, license, created_at, owner_email, workspace_id FROM projects")
        if d1_projects:
            for p in d1_projects:
                pid = p.get("id")
                if pid:
                    if pid not in projects_meta:
                        projects_meta[pid] = {
                            "display_name": p.get("display_name") or pid.capitalize(),
                            "description": p.get("description") or "",
                            "visibility": p.get("visibility") or "private",
                            "license": p.get("license") or "CC BY 4.0",
                            "project_type": p.get("project_type") or "detection",
                            "owner_email": p.get("owner_email") or "admin",
                            "workspace_id": p.get("workspace_id") or "ws_default"
                        }
                    else:
                        if p.get("owner_email"):
                            projects_meta[pid]["owner_email"] = p["owner_email"]
                        if p.get("visibility"):
                            projects_meta[pid]["visibility"] = p["visibility"]
                        if p.get("workspace_id"):
                            projects_meta[pid]["workspace_id"] = p["workspace_id"]
    except Exception as e:
        print(f"[get_categories D1 sync error] {e}")

    categories = []
    for item, proj_info in projects_meta.items():
        item_path = ROOT_DIR / item
        labeled_path = ROOT_DIR / f"{item}_labeled"
        labels_dir = labeled_path / "labels"

        try:
            item_path.mkdir(parents=True, exist_ok=True)
            labels_dir.mkdir(parents=True, exist_ok=True)
            (labeled_path / "previews").mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

        try:
            img_files = [f for f in os.listdir(item_path) if os.path.splitext(f)[1].lower() in valid_extensions]
        except Exception:
            img_files = []
        img_count = len(img_files)

        label_count = 0
        if labels_dir.exists():
            try:
                for txt in labels_dir.iterdir():
                    if txt.suffix == ".txt" and txt.stat().st_size > 0:
                        label_count += 1
            except Exception:
                pass

        cat_key = item.lower()
        cls_data = classes_map.get(cat_key)
        if not cls_data:
            cls_list = [{"id": 0, "name": item.capitalize(), "color": "#6366f1", "prompts": [cat_key]}]
        elif isinstance(cls_data, dict):
            cls_list = [cls_data]
        elif isinstance(cls_data, list):
            cls_list = cls_data
        else:
            cls_list = [{"id": 0, "name": item.capitalize(), "color": "#6366f1", "prompts": [cat_key]}]

        primary_cls = cls_list[0] if cls_list else {"id": 0, "name": item.capitalize(), "color": "#6366f1"}
        display_name = proj_info.get("display_name", primary_cls.get("name", item.capitalize()))
        sample_img = f"/api/image-file?category={item}&filename={img_files[0]}" if img_files else None
        owner_email = proj_info.get("owner_email", "admin") or "admin"
        visibility = proj_info.get("visibility", "private") or "private"
        workspace_id = proj_info.get("workspace_id") or "ws_default"

        categories.append({
            "id": item,
            "name": display_name,
            "description": proj_info.get("description", f"{item.capitalize()} nesne tespit veri seti"),
            "default_class_id": primary_cls.get("id", 0),
            "color": primary_cls.get("color", "#6366f1"),
            "image_count": img_count,
            "label_count": label_count,
            "percent": round((label_count / img_count * 100), 1) if img_count > 0 else 0,
            "sample_image": sample_img,
            "classes": cls_list,
            "visibility": visibility,
            "owner_email": owner_email,
            "license": proj_info.get("license", "CC BY 4.0"),
            "project_type": proj_info.get("project_type", "detection"),
            "workspace_id": workspace_id,
        })

    res = sorted(categories, key=lambda x: x["id"])
    _CATEGORIES_CACHE = res
    _CATEGORIES_CACHE_TIME = now
    return res


@router.get("/api/projects")
def get_projects(workspace_id: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    """
    Kullanıcının kendi projelerini listeler.
    - Admin: Tüm projeleri görebilir (veya seçili workspace'e göre).
    - Normal Kullanıcı: SADECE kendi sahip olduğu veya ekip üyesi olduğu projeler.
    - workspace_id parametresi verildiğinde sadece o çalışma alanındaki projeler döner.
    """
    user = get_current_user(authorization)
    user_email = user.get("email", "").lower() if user else None

    if not user_email:
        return {"projects": [], "classes": {}, "auth_required": True}


    cats = get_categories()
    config = load_project_config()

    user_team_projects = set()
    user_team_meta = {}
    try:
        from api.teams import _load_teams
        td = _load_teams()
        user_uname = (user.get("username") or user.get("display_name") or user_email.split("@")[0]).strip().lower()
        user_dname = (user.get("display_name") or "").strip().lower()
        for tm in td.get("teams", []):
            t_members = tm.get("members", [])
            t_cap = (tm.get("captain") or "").strip().lower()

            is_in_team = (t_cap == user_email) or (t_cap == user_uname)
            member_role = "captain" if is_in_team else None
            if not is_in_team:
                for m in t_members:
                    m_email = (m.get("email") or "").strip().lower()
                    m_user = (m.get("username") or "").strip().lower()
                    m_dname = (m.get("display_name") or "").strip().lower()
                    if (user_email and m_email == user_email) or \
                       (user_email and m_user == user_email) or \
                       (user_uname and m_user == user_uname) or \
                       (user_dname and m_dname == user_dname):
                        is_in_team = True
                        member_role = m.get("role", "annotator")
                        break

            if is_in_team:
                for pr in tm.get("projects", []):
                    pr_norm = pr.strip().lower()
                    user_team_projects.add(pr_norm)
                    user_team_meta[pr_norm] = {
                        "team_id": tm.get("id"),
                        "team_name": tm.get("name"),
                        "captain": tm.get("captain"),
                        "my_role": member_role or "annotator"
                    }
    except Exception as te_err:
        print(f"[get_projects team load error] {te_err}")

    def _is_mine(proj: dict) -> bool:
        pid = (proj.get("id") or proj.get("name") or "").strip().lower()
        owner = (proj.get("owner_email") or "").strip().lower()
        if owner == user_email:
            return True
        if not owner or owner == "admin":
            return is_admin_user(user, user_email)
        team_emails = [e.strip().lower() for e in (proj.get("team_emails") or [])]
        if user_email in team_emails:
            return True
        if pid in user_team_projects:
            return True
        return False

    if not workspace_id:
        try:
            ws_rows = cf_d1_query("SELECT id FROM workspaces WHERE owner_email = ? ORDER BY created_at ASC LIMIT 1", [user_email])
            if ws_rows and ws_rows[0].get("id"):
                workspace_id = ws_rows[0]["id"]
        except Exception:
            pass

    filtered = []
    is_target_team_ws = bool(workspace_id and workspace_id.startswith("ws_team_"))
    target_team_id = workspace_id.replace("ws_team_", "") if is_target_team_ws else None

    for p in cats:
        if _is_mine(p):
            pid = (p.get("id") or p.get("name") or "").strip().lower()
            p_ws = p.get("workspace_id") or "ws_default"
            t_meta = user_team_meta.get(pid)
            proj_team_id = t_meta.get("team_id") if t_meta else None

            # 1. Eğer Takım Workspace'i seçiliyse:
            if is_target_team_ws:
                # Proje bu takıma aitse göster
                if proj_team_id != target_team_id and p_ws != workspace_id:
                    continue
            # 2. Eğer Kişisel/Özel Workspace seçiliyse:
            elif workspace_id:
                # Takım projeleri kişisel çalışma alanına kesinlikle sızmasın
                if proj_team_id or p_ws.startswith("ws_team_"):
                    if p_ws != workspace_id:
                        continue
                # Eğer proje spesifik başka bir kişisel workspace'e aitse gösterme
                if p_ws != workspace_id:
                    if p_ws == "ws_default":
                        owner = (p.get("owner_email") or "").strip().lower()
                        if owner != user_email:
                            continue
                    else:
                        continue

            p_copy = dict(p)
            if t_meta:
                p_copy["is_team_project"] = True
                p_copy["team_name"] = t_meta["team_name"]
                p_copy["team_id"] = t_meta["team_id"]
                p_copy["team_role"] = t_meta["my_role"]
                p_copy["team_captain"] = t_meta["captain"]
            filtered.append(p_copy)

    return {
        "projects": filtered,
        "classes": config.get("classes", DEFAULT_CLASS_MAPPING),
        "workspace_id": workspace_id
    }



@router.get("/api/categories")
def list_categories(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    user_email = user.get("email", "").lower() if user else None
    user_role = user.get("role", "") if user else None
    config = load_project_config()
    all_cats = get_categories()
    visible = [c for c in all_cats if user_can_access_project(c, user_email, user_role)]
    return {"categories": visible, "classes": config.get("classes", DEFAULT_CLASS_MAPPING)}


@router.post("/api/projects/create")
def create_project(req: CreateProjectRequest, authorization: Optional[str] = Header(None)):
    raw_folder = sanitize_filename(req.folder_name).strip().lower().replace(" ", "_")
    folder_name = re.sub(r'[^a-z0-9_\-]', '', raw_folder)
    if not folder_name:
        raise HTTPException(status_code=400, detail="Geçerli bir klasör adı giriniz.")

    user = get_current_user(authorization)
    if not user or not user.get("email"):
        raise HTTPException(status_code=401, detail="Proje oluşturmak için oturum açmanız gerekmektedir.")
    owner_email = user.get("email").strip().lower()

    if not is_admin_user(user, owner_email):
        user_proj_count = 0
        try:
            p_rows = cf_d1_query("SELECT COUNT(*) as cnt FROM projects WHERE LOWER(owner_email) = ?", [owner_email])
            if p_rows:
                user_proj_count = int(p_rows[0].get("cnt", 0))
        except Exception:
            cfg = load_project_config()
            user_proj_count = sum(1 for p in cfg.get("projects", {}).values() if (p.get("owner_email") or "").lower() == owner_email)

        if user_proj_count >= MAX_PROJECTS_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=f"Maksimum proje sınırına ulaştınız ({user_proj_count}/{MAX_PROJECTS_PER_USER}). Yeni proje oluşturmak için mevcut projelerinizden birini silebilirsiniz."
            )

    proj_dir = safe_project_path(folder_name)
    labeled_dir = safe_project_path(f"{folder_name}_labeled")
    labels_dir = labeled_dir / "labels"
    previews_dir = labeled_dir / "previews"

    proj_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    visibility = req.visibility if req.visibility in ("public", "private") else "private"
    workspace_id = (req.workspace_id or "").strip()
    if not workspace_id:
        # Kullanıcının aktif/varsayılan ilk workspace'ini bul
        try:
            ws_rows = cf_d1_query("SELECT id FROM workspaces WHERE owner_email = ? ORDER BY created_at ASC LIMIT 1", [owner_email])
            if ws_rows and ws_rows[0].get("id"):
                workspace_id = ws_rows[0]["id"]
        except Exception:
            pass
        if not workspace_id:
            workspace_id = "ws_default"

    config = load_project_config()
    config.setdefault("projects", {})[folder_name] = {
        "display_name": req.display_name or folder_name.replace("_", " ").capitalize(),
        "description": req.description or "",
        "visibility": visibility,
        "license": req.license or "CC BY 4.0",
        "project_type": req.project_type if req.project_type in ("detection", "classification") else "detection",
        "owner_email": owner_email,
        "workspace_id": workspace_id,
        "ai_settings": {"conf": 0.15, "iou": 0.50},
    }

    if req.classes:
        cls_list = req.classes if isinstance(req.classes, list) else [req.classes]
        normalized = []
        for i, cls in enumerate(cls_list):
            normalized.append({
                "id": i,
                "name": cls.get("name", f"Class_{i}"),
                "color": cls.get("color", ["#3b82f6","#10b981","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316"][i % 7]),
                "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()],
            })
        config.setdefault("classes", {})[folder_name] = normalized
    else:
        config.setdefault("classes", {})[folder_name] = [{
            "id": 0,
            "name": folder_name.replace("_", " ").capitalize(),
            "color": "#6366f1",
            "prompts": [folder_name.replace("_", " ").lower()],
        }]

    save_project_config(config)

    try:
        from datetime import datetime, timezone
        created_at = datetime.now(timezone.utc).isoformat()
        d1_display = config["projects"][folder_name]["display_name"]
        d1_desc = config["projects"][folder_name]["description"]
        d1_type = config["projects"][folder_name]["project_type"]
        d1_lic = config["projects"][folder_name]["license"]
        cf_d1_query(
            "INSERT OR REPLACE INTO projects (id, display_name, description, project_type, visibility, license, created_at, owner_email, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [folder_name, d1_display, d1_desc, d1_type, visibility, d1_lic, created_at, owner_email, workspace_id]
        )

        if workspace_id and workspace_id.startswith("ws_team_"):
            target_tid = workspace_id.replace("ws_team_", "")
            from api.teams import _load_teams, _save_teams
            t_data = _load_teams()
            for tm in t_data.get("teams", []):
                if tm.get("id") == target_tid:
                    if folder_name not in tm.get("projects", []):
                        tm.setdefault("projects", []).append(folder_name)
                        _save_teams(t_data)
                    break
    except Exception as e:
        print(f"[D1 Project Sync Warning] {e}")

    return {
        "status": "ok",
        "project_id": folder_name,
        "owner_email": owner_email,
        "workspace_id": workspace_id,
        "visibility": visibility,
        "classes": config["classes"][folder_name],
    }



@router.post("/api/projects/delete")
def delete_project(req: DeleteProjectRequest, authorization: Optional[str] = Header(None)):
    cat_name = req.category.strip()
    if not cat_name:
        raise HTTPException(status_code=400, detail="Geçerli bir kategori adı belirtiniz.")

    check_project_permission(cat_name, authorization, require_edit=True, require_owner=True)
    config = load_project_config()
    cat_key = cat_name.lower()

    if "projects" in config and cat_name in config["projects"]:
        del config["projects"][cat_name]
    if "classes" in config and cat_key in config["classes"]:
        del config["classes"][cat_key]
    save_project_config(config)

    try:
        cf_d1_query("DELETE FROM projects WHERE id = ?", [cat_name])
        cf_d1_query("DELETE FROM project_batches WHERE project_id = ?", [cat_name])
        cf_d1_query("DELETE FROM project_members WHERE project_id = ?", [cat_name])
    except Exception as e:
        print(f"[D1 Project Delete Warning] {e}")

    r2_deleted = 0
    if req.delete_files:
        # Bulut (Cloudflare R2) kalıntılarını da tamamen temizle ki aynı isimle yeni proje açılınca eski veriler dönmesin
        try:
            from api.shared.utils import get_project_storage_info
            st = get_project_storage_info(cat_name)
            r2_deleted += cf_r2_delete_prefix(st["r2_project_prefix"])
            if st["r2_project_prefix"].strip("/") != cat_name.strip("/"):
                r2_deleted += cf_r2_delete_prefix(cat_name)
        except Exception as r2_err:
            print(f"[R2 Project Delete Warning] {r2_err}")

        try:
            cat_dir = safe_project_path(cat_name)
            labeled_dir = safe_project_path(f"{cat_name}_labeled")
            if cat_dir.exists() and cat_dir.is_dir():
                shutil.rmtree(cat_dir, ignore_errors=True)
            if labeled_dir.exists() and labeled_dir.is_dir():
                shutil.rmtree(labeled_dir, ignore_errors=True)
        except Exception:
            pass

    try:
        from api.projects.images import invalidate_images_cache
        invalidate_images_cache(cat_name)
    except Exception:
        pass

    return {"status": "ok", "deleted_category": cat_name, "r2_deleted_count": r2_deleted}


@router.post("/api/projects/rename")
def rename_project(req: RenameProjectRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True, require_owner=True)
    new_name = req.new_name.strip()
    if not new_name or len(new_name) > 80:
        raise HTTPException(status_code=400, detail="Geçersiz proje adı.")
    config = load_project_config()
    if req.category not in config.get("projects", {}):
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")
    config["projects"][req.category]["display_name"] = new_name
    save_project_config(config)
    try:
        cf_d1_query("UPDATE projects SET display_name = ? WHERE id = ?", [new_name, req.category])
    except Exception:
        pass
    return {"status": "ok", "category": req.category, "new_name": new_name}


@router.get("/api/project-settings")
def get_project_settings(
    category: str = Query(...),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    user = check_project_permission(category, authorization, require_edit=False, query_token=token)
    project_role = (user.get("project_role") or user.get("role") or "member").strip().lower()
    is_owner_or_captain = project_role in ("admin", "owner", "captain")

    cat_dir = ROOT_DIR / category
    if not cat_dir.exists():
        if category == "bag" and (ROOT_DIR / "bag_detection_project").exists():
            category = "bag_detection_project"
            cat_dir = ROOT_DIR / "bag_detection_project"
        elif category == "bag_detection_project" and (ROOT_DIR / "bag").exists():
            category = "bag"
            cat_dir = ROOT_DIR / "bag"
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje klasörü bulunamadı.")

    config = load_project_config()
    projects_meta = config.get("projects", {})
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)

    cat_key = category.lower()
    proj_info = projects_meta.get(category, {}) or projects_meta.get(cat_key, {})

    cls_data = classes_map.get(cat_key) or classes_map.get(category)
    if not cls_data:
        if cat_key == "bag":
            cls_data = classes_map.get("bag_detection_project")
        elif cat_key == "bag_detection_project":
            cls_data = classes_map.get("bag")
    if not cls_data and "classes" in proj_info:
        cls_data = proj_info.get("classes")

    SMART_PROMPTS = {
        "bag": ["bag", "handbag", "backpack", "shoulder bag", "purse", "çanta"],
        "car": ["car", "automobile", "vehicle", "sedan", "araba"],
        "person": ["person", "human", "man", "woman", "insan"],
        "dog": ["dog", "puppy", "canine", "köpek"],
        "cat": ["cat", "kitten", "feline", "kedi"]
    }

    clean_name = category.replace("_", " ").title()
    suggested_prompts = SMART_PROMPTS.get(cat_key, [cat_key, clean_name.lower()])

    if not cls_data:
        cls_data = [{"id": 0, "name": clean_name, "color": "#10b981", "prompts": suggested_prompts}]
    elif isinstance(cls_data, dict):
        cls_data = [cls_data]
    else:
        for c in cls_data:
            if not c.get("name") or c.get("name") == "Yeni Sınıf":
                c["name"] = clean_name
            if not c.get("prompts") or len(c.get("prompts", [])) == 0:
                c["prompts"] = suggested_prompts

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    img_files = [f for f in os.listdir(cat_dir) if os.path.splitext(f)[1].lower() in valid_extensions]

    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    label_count = 0
    box_total = 0
    class_distribution = {}

    if labels_dir.exists():
        for txt in labels_dir.iterdir():
            try:
                if txt.suffix == ".txt" and txt.stat().st_size > 0:
                    label_count += 1
                    with open(txt, "r", encoding="utf-8") as f:
                        for l in f:
                            parts = l.strip().split()
                            if parts:
                                c_id = int(parts[0])
                                box_total += 1
                                class_distribution[c_id] = class_distribution.get(c_id, 0) + 1
            except Exception:
                pass

    vis_val = (proj_info.get("visibility") or "private").lower()
    owner_val = proj_info.get("owner_email", "admin")

    return {
        "status": "ok",
        "category": category,
        "display_name": proj_info.get("display_name", category.capitalize()),
        "description": proj_info.get("description", f"{category.capitalize()} nesne tespit veri seti"),
        "visibility": vis_val,
        "owner_email": owner_val,
        "total_images": len(img_files),
        "labeled_images": label_count,
        "empty_images": len(img_files) - label_count,
        "total_boxes": box_total,
        "classes": cls_data,
        "class_distribution": class_distribution,
        "all_global_classes": classes_map,
        "ai_settings": proj_info.get("ai_settings", {"conf": 0.25, "iou": 0.45}),
        "project_role": project_role,
        "can_manage": is_owner_or_captain,
    }


@router.post("/api/project-settings/save")
def save_project_settings(req: ProjectSettingsSaveRequest, authorization: Optional[str] = Header(None)):
    user = check_project_permission(req.category, authorization, require_edit=True, require_owner=True)

    config = load_project_config()
    cat_key = req.category.lower()
    existing_meta = config.get("projects", {}).get(req.category, {}) or config.get("projects", {}).get(cat_key, {})

    owner_email = existing_meta.get("owner_email", user.get("email", "admin"))
    visibility = req.visibility if req.visibility in ("public", "private") else existing_meta.get("visibility", "private")
    license_val = existing_meta.get("license", "CC BY 4.0")
    proj_type = existing_meta.get("project_type", "detection")

    config.setdefault("projects", {})[req.category] = {
        "display_name": req.display_name,
        "description": req.description or "",
        "owner_email": owner_email,
        "visibility": visibility,
        "license": license_val,
        "project_type": proj_type,
        "ai_settings": {
            "conf": req.ai_conf or 0.15,
            "iou": req.ai_iou or 0.50,
        },
        "model_key": req.model_key or existing_meta.get("model_key", "yolov8s-worldv2"),
    }

    try:
        cf_d1_query(
            "UPDATE projects SET display_name = ?, description = ?, visibility = ? WHERE id = ?",
            [req.display_name, req.description or "", visibility, req.category]
        )
    except Exception as e:
        print(f"[D1 Update Settings Warning] {e}")

    if not config.get("classes"):
        config["classes"] = DEFAULT_CLASS_MAPPING.copy()

    cls_list = req.classes if isinstance(req.classes, list) else [req.classes]
    id_map: Dict[int, int] = {}
    normalized = []
    for i, cls in enumerate(cls_list):
        orig_id = cls.get("original_id")
        if orig_id is not None:
            try:
                orig_int = int(orig_id)
                if orig_int != i:
                    id_map[orig_int] = i
            except (ValueError, TypeError):
                pass

        normalized.append({
            "id": i,
            "name": cls.get("name", f"Class_{i}"),
            "color": cls.get("color", "#6366f1"),
            "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()],
        })
    config["classes"][cat_key] = normalized
    if cat_key == "bag":
        config["classes"]["bag_detection_project"] = normalized
    elif cat_key == "bag_detection_project":
        config["classes"]["bag"] = normalized

    save_project_config(config)

    remapped_count = 0
    if req.remap_labels and id_map:
        cat = req.category
        labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
        if not labels_dir.exists():
            if cat == "bag":
                labels_dir = ROOT_DIR / "bag_detection_project_labeled" / "labels"
            elif cat == "bag_detection_project":
                labels_dir = ROOT_DIR / "bag_labeled" / "labels"

        if labels_dir.exists():
            for txt_path in labels_dir.glob("*.txt"):
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    modified = False
                    new_lines = []
                    for line in lines:
                        parts = line.strip().split()
                        if parts:
                            try:
                                cid = int(parts[0])
                                if cid in id_map:
                                    parts[0] = str(id_map[cid])
                                    modified = True
                            except ValueError:
                                pass
                        new_lines.append(" ".join(parts) + "\n")
                    if modified:
                        with open(txt_path, "w", encoding="utf-8") as f:
                            f.writelines(new_lines)
                        remapped_count += 1
                except Exception:
                    pass

    return {
        "status": "ok",
        "category": req.category,
        "classes": normalized,
        "remapped_files": remapped_count,
        "id_map": {str(k): v for k, v in id_map.items()}
    }
