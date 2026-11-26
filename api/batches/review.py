"""
api/batches/review.py
Etiket inceleme, onaylama, tamamlama ve kalite kontrol endpoints:
- /api/projects/complete-batch (POST)
- /api/projects/reset-batch-approval (POST)
- /api/projects/mark-review (POST)
- /api/projects/approve-all-reviews (POST)
- /api/projects/review-queue (GET)
"""

import os
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.database import (
    cf_d1_save_batches,
    cf_d1_load_batches,
    cf_r2_upload,
)
from core.security import get_current_user, check_project_permission
from api.shared.models import (
    MarkReviewRequest,
    ApproveAllReviewsRequest,
)
from api.shared.utils import (
    get_project_storage_info,
    safe_project_path,
    sanitize_filename,
)

router = APIRouter(tags=["Batches Review"])


def _review_file(category: str) -> Path:
    cat = sanitize_filename(category).strip()
    return safe_project_path(f"{cat}_labeled") / "reviews.json"


def _load_reviews(category: str) -> Dict[str, Any]:
    p = _review_file(category)
    if not p.exists():
        # Railway yeniden başlasa da inceleme kayıtlarını Cloudflare R2'den geri yükle
        try:
            from core.database import cf_r2_get_object
            from api.shared.utils import get_project_storage_info
            st = get_project_storage_info(category)
            if st.get("r2_configured"):
                raw = cf_r2_get_object(f"{st['r2_project_prefix']}/reviews.json")
                if raw:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(raw)
        except Exception:
            pass
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_reviews(category: str, data: Dict[str, Any]):
    p = _review_file(category)
    p.parent.mkdir(parents=True, exist_ok=True)
    raw_str = json.dumps(data, ensure_ascii=False, indent=2)
    with open(p, "w", encoding="utf-8") as f:
        f.write(raw_str)
    try:
        from core.database import cf_r2_upload
        from api.shared.utils import get_project_storage_info
        st = get_project_storage_info(category)
        if st.get("r2_configured"):
            cf_r2_upload(raw_str.encode("utf-8"), f"{st['r2_project_prefix']}/reviews.json", "application/json")
    except Exception:
        pass


@router.post("/api/projects/complete-batch")
def complete_batch(data: dict, authorization: Optional[str] = Header(None)):
    cat = data.get("category")
    batch_id = data.get("batch_id")
    if not cat or not batch_id:
        raise HTTPException(status_code=400, detail="Eksik parametre")
    check_project_permission(cat, authorization, require_edit=True)

    orig_batch_id = str(batch_id).replace("_completed", "").replace("_unassigned", "")

    batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            batches = []

    if not batches:
        try:
            batches = cf_d1_load_batches(cat) or []
        except Exception:
            batches = []

    if not batches:
        try:
            storage = get_project_storage_info(cat)
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            batches = []

    if batches:
        try:
            new_batches = []
            for b in batches:
                b_id = str(b.get("id"))
                if b_id in (str(batch_id), orig_batch_id):
                    b_imgs = list(b.get("images", []))
                    ret_set = set(b.get("returned_filenames", []))
                    approved_set = set(b.get("approved_filenames", []))
                    for img_name in b_imgs:
                        if img_name not in ret_set:
                            approved_set.add(img_name)

                    approved_list = [f for f in b_imgs if f in approved_set]
                    returned_list = [f for f in b_imgs if f in ret_set]

                    dt_str = datetime.now().strftime("%d.%m.%Y at %H:%M")

                    if approved_list and returned_list:
                        c_batch = {
                            "id": f"batch_{int(time.time()*1000)}_ds",
                            "name": b.get("name", "Default Batch"),
                            "created_at": b.get("created_at", dt_str),
                            "images": approved_list,
                            "tags": b.get("tags", ""),
                            "status": "completed",
                            "approved_filenames": approved_list,
                            "approved_count": len(approved_list),
                            "returned_filenames": [],
                            "unassigned_count": 0,
                            "annotated_count": len(approved_list),
                            "total_count": len(approved_list),
                            "completed_at": dt_str
                        }
                        u_batch = {
                            "id": f"batch_{int(time.time()*1000)}_un",
                            "name": f"{b.get('name', 'Default Batch')} (İadeler)",
                            "created_at": b.get("created_at", dt_str),
                            "images": returned_list,
                            "tags": b.get("tags", ""),
                            "status": "unassigned",
                            "approved_filenames": [],
                            "approved_count": 0,
                            "returned_filenames": list(returned_list),
                            "unassigned_count": len(returned_list),
                            "annotated_count": 0,
                            "total_count": len(returned_list)
                        }
                        new_batches.append(c_batch)
                        new_batches.append(u_batch)
                    else:
                        b["images"] = approved_list or b_imgs
                        b["approved_filenames"] = approved_list or b_imgs
                        b["approved_count"] = len(b["approved_filenames"])
                        b["returned_filenames"] = []
                        b["unassigned_count"] = 0
                        b["annotated_count"] = len(b["approved_filenames"])
                        b["total_count"] = len(b["images"])
                        b["status"] = "completed"
                        b["completed_at"] = dt_str
                        new_batches.append(b)
                else:
                    new_batches.append(b)

            batches = new_batches
            batches_file.parent.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)

            cf_d1_save_batches(cat, batches)
            try:
                storage = get_project_storage_info(cat)
                cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
            except Exception as r2_err:
                print(f"[R2 Sync Warning]: {r2_err}")
            return {"status": "ok", "message": "Batch marked as completed and split cleanly"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.post("/api/projects/reset-batch-approval")
def reset_batch_approval(data: dict, authorization: Optional[str] = Header(None)):
    cat = data.get("category")
    batch_id = data.get("batch_id")
    if not cat or not batch_id:
        raise HTTPException(status_code=400, detail="Eksik parametre")
    check_project_permission(cat, authorization, require_edit=True, require_owner=True)

    orig_batch_id = str(batch_id).replace("_completed", "").replace("_unassigned", "")

    batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            batches = []

    if not batches:
        try:
            batches = cf_d1_load_batches(cat) or []
        except Exception:
            batches = []

    if not batches:
        try:
            storage = get_project_storage_info(cat)
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            batches = []

    if batches:
        try:
            for b in batches:
                if b.get("id") in (batch_id, orig_batch_id):
                    b["approved_count"] = 0
                    b["approved_filenames"] = []
                    b["status"] = "annotating"
                    if "completed_at" in b:
                        del b["completed_at"]
            batches_file.parent.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)

            cf_d1_save_batches(cat, batches)
            try:
                storage = get_project_storage_info(cat)
                cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
            except Exception as r2_err:
                print(f"[R2 Sync Warning]: {r2_err}")
            return {"status": "ok", "message": "Batch approval reset"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.post("/api/projects/mark-review")
def mark_for_review(req: MarkReviewRequest, authorization: Optional[str] = Header(None)):
    user = check_project_permission(req.category, authorization, require_edit=True)

    reviews = _load_reviews(req.category)
    if req.status == "clear":
        reviews.pop(req.filename, None)
    else:
        reviews[req.filename] = {
            "status": req.status,
            "note": req.note or "",
            "updated_by": user.get("email", ""),
            "updated_at": datetime.now().isoformat(),
        }
    _save_reviews(req.category, reviews)
    return {"status": "ok", "filename": req.filename, "review_status": req.status}


@router.post("/api/projects/approve-all-reviews")
def approve_all_reviews(req: ApproveAllReviewsRequest, authorization: Optional[str] = Header(None)):
    cat = sanitize_filename(req.category).strip()
    check_project_permission(cat, authorization, require_edit=True)

    cat_dir = safe_project_path(cat)
    labeled_dir = safe_project_path(f"{cat}_labeled")
    labels_dir = labeled_dir / "labels"
    reviews = _load_reviews(cat)

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    now_iso = datetime.now().isoformat()
    approved_count = 0

    if cat_dir.exists() and cat_dir.is_dir():
        with os.scandir(cat_dir) as it:
            for entry in it:
                if entry.is_file():
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in valid_ext:
                        stem = os.path.splitext(entry.name)[0]
                        txt_path = labels_dir / f"{stem}.txt"
                        has_label = txt_path.exists() and txt_path.stat().st_size > 0
                        current_status = reviews.get(entry.name, {}).get("status")
                        if current_status != "rejected" and (has_label or entry.name in reviews):
                            reviews[entry.name] = {
                                "status": "approved",
                                "note": "Toplu onaylandı",
                                "updated_at": now_iso
                            }
                            approved_count += 1

    _save_reviews(cat, reviews)
    return {
        "status": "ok",
        "category": cat,
        "approved_count": approved_count,
        "total_approved": len([k for k, v in reviews.items() if v.get("status") == "approved"])
    }


@router.get("/api/projects/review-queue")
def get_review_queue(
    category: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=10, le=500),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    cat = sanitize_filename(category).strip()
    check_project_permission(cat, authorization=authorization, require_edit=False, query_token=token)

    cat_dir = safe_project_path(cat)
    labeled_dir = safe_project_path(f"{cat}_labeled")
    labels_dir = labeled_dir / "labels"
    reviews = _load_reviews(cat)

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    queue = []
    approved = 0
    rejected = 0

    if cat_dir.exists() and cat_dir.is_dir():
        with os.scandir(cat_dir) as it:
            for entry in it:
                if not entry.is_file():
                    continue
                ext = os.path.splitext(entry.name)[1].lower()
                if ext not in valid_ext:
                    continue

                meta = reviews.get(entry.name)
                stem = os.path.splitext(entry.name)[0]
                txt_path = labels_dir / f"{stem}.txt" if labels_dir.exists() else None
                has_boxes = txt_path and txt_path.exists() and txt_path.stat().st_size > 0

                if meta:
                    status = meta.get("status", "needs_review")
                    if status == "approved":
                        approved += 1
                    elif status == "rejected":
                        rejected += 1
                    else:
                        queue.append({
                            "filename": entry.name,
                            "box_count": 0,
                            "status": status,
                            "note": meta.get("note", "İnceleme bekliyor"),
                            "updated_at": meta.get("updated_at", "")
                        })
                elif has_boxes:
                    queue.append({
                        "filename": entry.name,
                        "box_count": 0,
                        "status": "needs_review",
                        "note": "Otomatik etiketleme sonrası onay bekliyor",
                        "updated_at": ""
                    })

    total_in_queue = len(queue)
    total_pages = max(1, (total_in_queue + page_size - 1) // page_size)
    start_idx = (page - 1) * page_size
    paged_queue = queue[start_idx : start_idx + page_size]

    return {
        "status": "ok",
        "category": cat,
        "queue_count": total_in_queue,
        "approved": approved,
        "rejected": rejected,
        "page": page,
        "total_pages": total_pages,
        "page_size": page_size,
        "queue": paged_queue
    }
