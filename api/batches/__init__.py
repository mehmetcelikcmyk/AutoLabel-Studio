"""
api/batches/__init__.py
Yığın (Batch) yönetimi ve review alt modüllerini birleştiren FastAPI router'ı.
"""

from fastapi import APIRouter
from api.batches.management import router as management_router
from api.batches.review import router as review_router

router = APIRouter(tags=["Batches"])

router.include_router(management_router)
router.include_router(review_router)

__all__ = ["router"]
