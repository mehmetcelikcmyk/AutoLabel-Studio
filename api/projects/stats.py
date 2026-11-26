"""
api/projects/stats.py
İstatistik ve çalışma alanı metrik endpoints:
- /api/projects/labeling-stats (GET)
- /api/workspace/stats (GET)
- /api/stats (GET)
"""

import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.security import (
    get_current_user,
    check_project_permission,
    user_can_access_project,
)
from api.shared.utils import (
    DEFAULT_CLASS_MAPPING,
    load_project_config,
)

router = APIRouter(tags=["Projects Stats"])


def get_categories_ref():
    from api.projects.core import get_categories
    return get_categories()


@router.get("/api/projects/labeling-stats")
def get_labeling_stats(category: str = Query(...), authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmanız gerekiyor.")
    check_project_permission(category, authorization, require_edit=False)
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    total_images = 0
    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    try:
        with os.scandir(cat_dir) as it:
            for entry in it:
                if entry.is_file():
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in valid_ext:
                        total_images += 1
    except Exception:
        pass

    if not labels_dir.exists():
        return {
            "status": "ok", "category": category,
            "total_images": total_images, "labeled": 0, "unlabeled": total_images,
            "total_boxes": 0, "avg_boxes_per_image": 0,
            "completion_pct": 0, "recent_activity": [],
        }

    valid_entries = []
    try:
        with os.scandir(labels_dir) as it:
            for entry in it:
                if entry.name.endswith(".txt") and entry.is_file():
                    try:
                        st = entry.stat()
                        if st.st_size > 0:
                            valid_entries.append((entry.name, st.st_size, st.st_mtime, entry.path))
                    except Exception:
                        pass
    except Exception:
        pass

    labeled_count = len(valid_entries)
    valid_entries.sort(key=lambda x: x[2], reverse=True)
    recent_activity = []
    total_boxes = 0

    def _human_time_ago(ts: float) -> str:
        diff = time.time() - ts
        if diff < 60: return "az önce"
        if diff < 3600: return f"{int(diff/60)} dakika önce"
        if diff < 86400: return f"{int(diff/3600)} saat önce"
        return f"{int(diff/86400)} gün önce"

    for idx, (name, sz, mtime, fpath) in enumerate(valid_entries):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                lines = f.read().strip().splitlines()
            cnt = len([l for l in lines if len(l.split()) == 5])
            total_boxes += cnt
            if idx < 10:
                recent_activity.append({
                    "filename": os.path.splitext(name)[0],
                    "box_count": cnt,
                    "time_ago": _human_time_ago(mtime),
                })
        except Exception:
            pass

    return {
        "status": "ok",
        "category": category,
        "total_images": total_images,
        "labeled": labeled_count,
        "unlabeled": total_images - labeled_count,
        "total_boxes": total_boxes,
        "avg_boxes_per_image": round(total_boxes / labeled_count, 2) if labeled_count else 0,
        "completion_pct": round(labeled_count / total_images * 100, 1) if total_images else 0,
        "recent_activity": recent_activity,
    }


@router.get("/api/workspace/stats")
def get_workspace_stats(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    user_email = user.get("email", "").lower() if user else None
    user_role = user.get("role", "") if user else None

    cats = get_categories_ref()
    accessible_cats = [c for c in cats if user_can_access_project(c, user_email, user_role)]

    total_projects = len(accessible_cats)
    total_images = sum(c.get("image_count", 0) for c in accessible_cats)
    total_labeled = sum(c.get("label_count", 0) for c in accessible_cats)
    pct = round((total_labeled / total_images * 100), 1) if total_images > 0 else 0

    return {
        "total_projects": total_projects,
        "total_images": total_images,
        "total_labeled": total_labeled,
        "completion_rate": pct,
        "workspace_name": f"{user.get('display_name', 'Kullanıcı')} Alanı" if user else "Misafir Alanı",
        "plan": "Community Plan",
        "credits": "16 / 15 Credits",
        "storage": f"{total_images * 0.4:.1f} MB / 10 GB"
    }


@router.get("/api/stats")
def get_stats():
    config = load_project_config()
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    return {"stats": get_categories_ref(), "classes": classes_map}
