"""
api/ai/__init__.py
Yapay zeka (AI) otomatik etiketleme, segmentasyon ve aktif öğrenme alt modüllerini
birleştiren FastAPI router'ı.
"""

from fastapi import APIRouter
from api.ai.auto_label import router as auto_label_router
from api.ai.segment import router as segment_router
from api.ai.active_learning import router as active_learning_router

router = APIRouter(tags=["AI Auto Labeling & Segmentation"])

router.include_router(auto_label_router)
router.include_router(segment_router)
router.include_router(active_learning_router)

__all__ = ["router"]
