"""
api/labeling.py
Geriye dönük tam uyumluluk (backward compatibility) sağlayan ince wrapper modül.
Tüm iş mantığı sorumluluklarına göre alt modüllere ayrılmıştır:
- api.batches.management  → Yığın (batch) CRUD, aşama taşıma, atama
- api.batches.review      → İnceleme kuyruğu, tamamlama, onay sıfırlama
- api.ai.auto_label       → Tekli ve toplu AI otomatik etiketleme
- api.ai.segment          → Akıllı segmentasyon ve kutu daraltma (refine)
- api.ai.active_learning  → Aktif öğrenme önceliklendirme ve anlık yedekler (snapshots)
- api.shared.models       → Pydantic veri modelleri
"""

from fastapi import APIRouter

from api.batches import router as batches_router
from api.ai import router as ai_router

from api.ai.auto_label import (
    BATCH_JOBS,
    BATCH_JOB_MAX_AGE_SECS,
    _make_batch_key,
    _load_image_with_r2_fallback,
    cleanup_old_batch_jobs,
    _build_prompt_map,
    _resolve_cls_list,
    _get_imgsz,
)
from api.ai.segment import _segment_by_click_cv
from api.ai.active_learning import (
    SNAPSHOTS_DIR,
    _create_labels_snapshot,
    _rollback_labels_snapshot,
)
from api.batches.review import (
    _review_file,
    _load_reviews,
    _save_reviews,
)
from api.shared.models import (
    AutoLabelRequest,
    BatchAutoLabelRequest,
    RefineBoxItem,
    RefineBoundingBoxRequest,
    SmartSegmentRequest,
    MarkReviewRequest,
    ApproveAllReviewsRequest,
    CreateSnapshotRequest,
    RollbackSnapshotRequest,
    TeamAssignBatchRequest,
)

router = APIRouter(tags=["Labeling & Batches"])
router.include_router(batches_router)
router.include_router(ai_router)

__all__ = [
    "router",
    "BATCH_JOBS",
    "BATCH_JOB_MAX_AGE_SECS",
    "SNAPSHOTS_DIR",
    "_make_batch_key",
    "_load_image_with_r2_fallback",
    "cleanup_old_batch_jobs",
    "_build_prompt_map",
    "_resolve_cls_list",
    "_get_imgsz",
    "_segment_by_click_cv",
    "_create_labels_snapshot",
    "_rollback_labels_snapshot",
    "_review_file",
    "_load_reviews",
    "_save_reviews",
    "AutoLabelRequest",
    "BatchAutoLabelRequest",
    "RefineBoxItem",
    "RefineBoundingBoxRequest",
    "SmartSegmentRequest",
    "MarkReviewRequest",
    "ApproveAllReviewsRequest",
    "CreateSnapshotRequest",
    "RollbackSnapshotRequest",
    "TeamAssignBatchRequest",
]
