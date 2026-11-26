"""
api/ai/active_learning.py
Aktif öğrenme (Active Learning) önceliklendirme ve etiket anlık görüntüleri (Snapshots) endpoints:
- /api/projects/active-learning (GET)
- /api/projects/snapshots (GET)
- /api/projects/create-snapshot (POST)
- /api/projects/rollback-snapshot (POST)
"""

import json
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.security import check_project_permission
from api.shared.models import (
    CreateSnapshotRequest,
    RollbackSnapshotRequest,
)

router = APIRouter(tags=["AI Active Learning & Snapshots"])

SNAPSHOTS_DIR = ROOT_DIR / ".snapshots"


def _create_labels_snapshot(category: str, note: str = "auto_backup") -> Optional[str]:
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

        all_snaps = sorted([p for p in SNAPSHOTS_DIR.iterdir() if p.is_dir() and p.name.startswith(f"{category}_")], key=lambda x: x.stat().st_mtime)
        if len(all_snaps) > 10:
            for old in all_snaps[:-10]:
                try:
                    shutil.rmtree(old)
                except Exception:
                    pass
        return snap_name
    except Exception:
        return None


def _rollback_labels_snapshot(category: str, snapshot_id: Optional[str] = None) -> bool:
    try:
        labeled_dir = ROOT_DIR / f"{category}_labeled"
        labels_dir = labeled_dir / "labels"
        if not SNAPSHOTS_DIR.exists():
            return False

        if snapshot_id:
            snap_dir = SNAPSHOTS_DIR / snapshot_id
        else:
            cat_snaps = sorted([p for p in SNAPSHOTS_DIR.iterdir() if p.is_dir() and p.name.startswith(f"{category}_")], key=lambda x: x.stat().st_mtime, reverse=True)
            if not cat_snaps:
                return False
            snap_dir = cat_snaps[0]

        src_labels = snap_dir / "labels"
        if not src_labels.exists():
            return False

        labels_dir.mkdir(parents=True, exist_ok=True)
        for f in labels_dir.glob("*.txt"):
            try:
                f.unlink()
            except Exception:
                pass

        for sf in src_labels.glob("*.txt"):
            shutil.copy2(sf, labels_dir / sf.name)
        return True
    except Exception:
        return False


@router.get("/api/projects/active-learning")
def get_active_learning_priority(category: str = Query(...)):
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    img_files = [f for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext]

    result = []
    for img_f in img_files:
        txt_path = labels_dir / (img_f.stem + ".txt") if labels_dir.exists() else None
        if txt_path is None or not txt_path.exists() or txt_path.stat().st_size == 0:
            box_count = 0
            priority = "high"
        else:
            lines = txt_path.read_text(encoding="utf-8").strip().splitlines()
            box_count = len([l for l in lines if len(l.split()) == 5])
            priority = "medium" if box_count <= 2 else "low"

        result.append({
            "filename": img_f.name,
            "box_count": box_count,
            "priority": priority,
        })

    priority_order = {"high": 0, "medium": 1, "low": 2}
    result.sort(key=lambda x: (priority_order[x["priority"]], x["box_count"]))

    high_count = sum(1 for r in result if r["priority"] == "high")
    medium_count = sum(1 for r in result if r["priority"] == "medium")

    return {
        "status": "ok",
        "category": category,
        "total": len(result),
        "high_priority": high_count,
        "medium_priority": medium_count,
        "images": result[:200],
    }


@router.get("/api/projects/snapshots")
def get_project_snapshots(category: str = Query(...), authorization: Optional[str] = Header(None)):
    check_project_permission(category, authorization, require_edit=False)
    snaps = []
    if SNAPSHOTS_DIR.exists():
        for d in sorted(SNAPSHOTS_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if not d.is_dir() or not d.name.startswith(f"{category}_"):
                continue
            meta_file = d / "meta.json"
            meta = {}
            if meta_file.exists():
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    pass
            snaps.append({
                "snapshot_id": d.name,
                "created_at": meta.get("created_at", datetime.fromtimestamp(d.stat().st_mtime).strftime("%d.%m.%Y %H:%M")),
                "note": meta.get("note", ""),
                "label_count": meta.get("label_count", len(list((d / "labels").glob("*.txt"))))
            })
    return {"status": "ok", "category": category, "snapshots": snaps}


@router.post("/api/projects/create-snapshot")
def create_project_snapshot(req: CreateSnapshotRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True, require_owner=True)
    snap_id = _create_labels_snapshot(req.category, req.note or "manual")
    if not snap_id:
        raise HTTPException(status_code=500, detail="Snapshot oluşturulamadı.")
    return {"status": "ok", "snapshot_id": snap_id, "message": "Anlık yedek başarıyla oluşturuldu."}


@router.post("/api/projects/rollback-snapshot")
def rollback_project_snapshot(req: RollbackSnapshotRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True, require_owner=True)
    ok = _rollback_labels_snapshot(req.category, req.snapshot_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Geri yüklenecek snapshot bulunamadı veya işlem başarısız.")
    return {"status": "ok", "message": "Etiketler önceki yedeğe başarıyla geri döndürüldü."}
