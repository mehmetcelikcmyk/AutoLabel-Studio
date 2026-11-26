"""
api/projects/classes.py
Sınıf yapılandırma ve yeniden eşleme (remapping) endpoints:
- /api/projects/update-classes (POST)
"""

from typing import Optional, Dict

from fastapi import APIRouter, Header

from core.config import ROOT_DIR
from core.security import check_project_permission
from api.shared.models import UpdateClassesRequest
from api.shared.utils import (
    DEFAULT_CLASS_MAPPING,
    load_project_config,
    save_project_config,
)

router = APIRouter(tags=["Projects Classes"])


@router.post("/api/projects/update-classes")
def update_project_classes(req: UpdateClassesRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True, require_owner=True)
    config = load_project_config()
    if not config.get("classes"):
        config["classes"] = DEFAULT_CLASS_MAPPING.copy()

    cat = req.category
    cat_lower = cat.lower()
    cls_list = req.classes if isinstance(req.classes, list) else [req.classes]

    id_map: Dict[int, int] = {}
    normalized = []
    for i, cls in enumerate(cls_list):
        old_id = cls.get("id")
        if old_id is not None and old_id != i:
            id_map[int(old_id)] = i
        normalized.append({
            "id": i,
            "name": cls.get("name", f"Class_{i}"),
            "color": cls.get("color", ["#3b82f6","#10b981","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316"][i % 7]),
            "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()],
        })

    config["classes"][cat_lower] = normalized
    if cat in config.get("projects", {}):
        config["projects"][cat]["classes"] = normalized
    save_project_config(config)

    remapped_count = 0
    if req.remap_labels and id_map:
        labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
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
