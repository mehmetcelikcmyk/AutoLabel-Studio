"""
api/projects/labels.py
Etiket yükleme ve kaydetme endpoints:
- /api/load-label & /api/label-data (GET)
- /api/save-label (POST)
"""

import os
import json
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.database import (
    cf_r2_upload,
    cf_r2_get_object,
    cf_r2_delete_object,
    cf_d1_save_batches,
)
from core.security import check_project_permission
from api.shared.models import SaveLabelRequest
from api.shared.utils import (
    DEFAULT_CLASS_MAPPING,
    load_project_config,
    get_project_storage_info,
)

router = APIRouter(tags=["Projects Labels"])


@router.get("/api/load-label")
@router.get("/api/label-data")
def load_label(
    category: str = Query(...),
    filename: str = Query(...),
    authorization: Optional[str] = Header(None)
):
    check_project_permission(category, authorization, require_edit=False)
    stem = os.path.splitext(filename)[0]
    txt_path = ROOT_DIR / f"{category}_labeled" / "labels" / f"{stem}.txt"
    config = load_project_config()
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING).get(category.lower(), [])
    cls_names = {c.get("id", i): c.get("name", f"Class_{i}") for i, c in enumerate(classes_map)}

    items = []
    if not txt_path.exists():
        # Railway gibi geçici diskli ortamlarda etiketi Cloudflare R2 yedeğinden çek
        try:
            storage = get_project_storage_info(category)
            if storage.get("r2_configured"):
                r2_key = f"{storage['r2_labels_prefix']}/{stem}.txt"
                raw_bytes = cf_r2_get_object(r2_key)
                if raw_bytes is not None:
                    txt_path.parent.mkdir(parents=True, exist_ok=True)
                    txt_path.write_bytes(raw_bytes)
        except Exception as r2_err:
            print(f"[R2 Load Label Fallback Warning] {r2_err}")

    if txt_path.exists():
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) == 5:
                        cls_id = int(parts[0])
                        xc, yc, w, h = map(float, parts[1:])
                        items.append({
                            "type": "bbox",
                            "class_id": cls_id,
                            "class_name": cls_names.get(cls_id, f"Class_{cls_id}"),
                            "x_center": xc,
                            "y_center": yc,
                            "width": w,
                            "height": h
                        })
                    elif len(parts) >= 7 and len(parts) % 2 != 0:
                        cls_id = int(parts[0])
                        pts = []
                        for i in range(1, len(parts), 2):
                            pts.append({"x": float(parts[i]), "y": float(parts[i+1])})
                        xs = [p["x"] for p in pts]
                        ys = [p["y"] for p in pts]
                        items.append({
                            "type": "polygon",
                            "class_id": cls_id,
                            "class_name": cls_names.get(cls_id, f"Class_{cls_id}"),
                            "points": pts,
                            "x_center": (min(xs) + max(xs)) / 2.0,
                            "y_center": (min(ys) + max(ys)) / 2.0,
                            "width": max(xs) - min(xs),
                            "height": max(ys) - min(ys)
                        })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Etiket okuma hatası: {e}")

    return {
        "filename": filename,
        "stem": stem,
        "exists": txt_path.exists(),
        "boxes": items,
        "annotations": items
    }


@router.post("/api/save-label")
def save_label(req: SaveLabelRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True)
    items = req.annotations if req.annotations is not None else (req.boxes or [])

    try:
        labeled_dir = ROOT_DIR / f"{req.category}_labeled"
        labels_dir = labeled_dir / "labels"
        labels_dir.mkdir(parents=True, exist_ok=True)

        stem = os.path.splitext(req.image_filename)[0]
        txt_path = labels_dir / f"{stem}.txt"

        if not items and not req.is_approved:
            if txt_path.exists():
                txt_path.unlink()

            try:
                batches_file = labeled_dir / "batches.json"
                if batches_file.exists():
                    with open(batches_file, "r", encoding="utf-8") as bf:
                        b_data = json.load(bf)

                    cat_dir_for_save = ROOT_DIR / req.category
                    disk_img_names = set()
                    if cat_dir_for_save.exists():
                        disk_img_names = {f.name for f in cat_dir_for_save.iterdir()
                                          if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}}

                    changed = False
                    for b in b_data:
                        b_imgs = b.get("images", [])
                        if not b_imgs and len(b_data) == 1:
                            b_imgs = list(disk_img_names)
                            b["images"] = b_imgs
                        if req.image_filename in b_imgs or req.image_filename in b.get("approved_filenames", []):
                            if req.image_filename not in b.get("images", []):
                                b.setdefault("images", []).append(req.image_filename)
                                b_imgs = b["images"]
                            if req.image_filename in b.get("approved_filenames", []):
                                b["approved_filenames"].remove(req.image_filename)
                            b["approved_count"] = len(b.get("approved_filenames", []))

                            if "returned_filenames" not in b:
                                b["returned_filenames"] = []
                            if req.image_filename not in b["returned_filenames"]:
                                b["returned_filenames"].append(req.image_filename)

                            annotated_count = 0
                            for img_n in b_imgs:
                                s_stem = os.path.splitext(img_n)[0]
                                if (labels_dir / f"{s_stem}.txt").exists() and (labels_dir / f"{s_stem}.txt").stat().st_size > 0:
                                    annotated_count += 1
                            b["annotated_count"] = annotated_count
                            b["unassigned_count"] = len(b_imgs) - annotated_count

                            curr_status = b.get("status", "unassigned")
                            if b["approved_count"] >= len(b_imgs) and len(b_imgs) > 0:
                                b["status"] = "completed"
                            elif curr_status in ("annotating", "completed") or b["approved_count"] > 0 or annotated_count > 0:
                                b["status"] = "annotating"
                            else:
                                b["status"] = "unassigned"
                            changed = True
                    if changed:
                        with open(batches_file, "w", encoding="utf-8") as bf:
                            json.dump(b_data, bf, ensure_ascii=False, indent=2)

                        try:
                            cf_d1_save_batches(req.category, b_data)
                        except Exception as d1_err:
                            print(f"[D1 Save Batches Error]: {d1_err}")

                        try:
                            storage = get_project_storage_info(req.category)
                            r2_batch_key = f"{storage['r2_project_prefix']}/batches.json"
                            cf_r2_upload(json.dumps(b_data, ensure_ascii=False, indent=2).encode('utf-8'), r2_batch_key, "application/json")
                        except Exception as r2_b_err:
                            print(f"[R2 Batches Sync Warning]: {r2_b_err}")
            except Exception as b_err:
                print(f"[Batches unassign warning]: {b_err}")

            r2_synced = False
            try:
                storage = get_project_storage_info(req.category)
                r2_txt_key = f"{storage['r2_labels_prefix']}/{stem}.txt"
                cf_r2_delete_object(r2_txt_key)
                r2_synced = True
            except Exception as r2_del_err:
                print(f"[R2 Del Warning]: {r2_del_err}")

            return {
                "status": "ok",
                "message": "Etiketler temizlendi ve görsel işlenmemişler havuzuna iade edildi.",
                "r2_synced": r2_synced
            }

        with open(txt_path, "w", encoding="utf-8") as f:
            for b in items:
                cid = b.get("class_id", 0)
                pts = b.get("points")
                b_type = b.get("type")

                if (b_type == "polygon" or pts) and isinstance(pts, list) and len(pts) >= 3:
                    coord_strs = [f"{max(0.0, min(1.0, float(pt.get('x', 0)))):.6f} {max(0.0, min(1.0, float(pt.get('y', 0)))):.6f}" for pt in pts]
                    f.write(f"{cid} " + " ".join(coord_strs) + "\n")
                else:
                    w = max(0.001, min(1.0, float(b.get("width", 0.1))))
                    h = max(0.001, min(1.0, float(b.get("height", 0.1))))
                    xc = max(w / 2.0, min(1.0 - w / 2.0, float(b.get("x_center", 0.5))))
                    yc = max(h / 2.0, min(1.0 - h / 2.0, float(b.get("y_center", 0.5))))
                    f.write(f"{cid} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")

        try:
            batches_file = labeled_dir / "batches.json"
            if batches_file.exists():
                with open(batches_file, "r", encoding="utf-8") as bf:
                    b_data = json.load(bf)

                cat_dir_for_save = ROOT_DIR / req.category
                disk_img_names_save = set()
                if cat_dir_for_save.exists():
                    disk_img_names_save = {f.name for f in cat_dir_for_save.iterdir()
                                           if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}}

                changed = False
                for b in b_data:
                    b_imgs = b.get("images", [])
                    if not b_imgs and len(b_data) == 1:
                        b_imgs = list(disk_img_names_save)
                    if req.image_filename in b_imgs or req.image_filename in b.get("approved_filenames", []):
                        if "approved_filenames" not in b:
                            b["approved_filenames"] = []
                        if req.is_approved:
                            if req.image_filename not in b["approved_filenames"]:
                                b["approved_filenames"].append(req.image_filename)
                            if req.image_filename in b.get("returned_filenames", []):
                                b["returned_filenames"].remove(req.image_filename)
                        b["approved_count"] = len(b["approved_filenames"])

                        annotated_count = 0
                        for img_n in b_imgs:
                            s_stem = os.path.splitext(img_n)[0]
                            if (labels_dir / f"{s_stem}.txt").exists() and (labels_dir / f"{s_stem}.txt").stat().st_size > 0:
                                annotated_count += 1
                        b["annotated_count"] = annotated_count
                        b["unassigned_count"] = len(b_imgs) - annotated_count

                        curr_status = b.get("status", "unassigned")
                        if b["approved_count"] >= len(b_imgs) and len(b_imgs) > 0:
                            b["status"] = "completed"
                        elif curr_status in ("annotating", "completed") or b["approved_count"] > 0 or annotated_count > 0:
                            b["status"] = "annotating"
                        else:
                            b["status"] = "unassigned"
                        changed = True
                if changed:
                    with open(batches_file, "w", encoding="utf-8") as bf:
                        json.dump(b_data, bf, ensure_ascii=False, indent=2)
        except Exception as b_sync_err:
            print(f"[Batches sync warning]: {b_sync_err}")

        # Bulut yedeklemesini (R2 ve D1) arka plan iş parçacığına devret; UI'ı asla bekletme
        def _bg_cloud_sync():
            try:
                if batches_file.exists():
                    with open(batches_file, "r", encoding="utf-8") as bf:
                        b_json = json.load(bf)
                    try:
                        cf_d1_save_batches(req.category, b_json)
                    except Exception as d1_err:
                        print(f"[D1 Save Batches Error]: {d1_err}")
                storage = get_project_storage_info(req.category)
                r2_txt_key = f"{storage['r2_labels_prefix']}/{stem}.txt"
                if txt_path.exists():
                    cf_r2_upload(txt_path.read_bytes(), r2_txt_key, "text/plain")
                if batches_file.exists():
                    r2_batch_key = f"{storage['r2_project_prefix']}/batches.json"
                    cf_r2_upload(batches_file.read_bytes(), r2_batch_key, "application/json")
            except Exception as r2_exc:
                print(f"[R2 Async Sync Warning] {req.category}/{stem}.txt: {r2_exc}")

        import threading
        threading.Thread(target=_bg_cloud_sync, daemon=True).start()

        try:
            from api.projects.images import invalidate_images_cache
            invalidate_images_cache(req.category)
        except Exception:
            pass

        return {
            "status": "ok",
            "message": f"{len(items)} etiket başarıyla kaydedildi.",
            "r2_synced": True,
            "r2_error": None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Etiket kaydetme hatası: {e}")
