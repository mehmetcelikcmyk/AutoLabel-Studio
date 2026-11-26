"""
api/projects/__init__.py
Tüm proje alt router'larını (core, images, labels, classes, stats, discovery)
tek bir FastAPI router altında birleştirir ve dışa aktarır.
Ayrıca geriye dönük uyumluluk için load_project_config, save_project_config,
get_project_storage_info, get_categories gibi fonksiyonları export eder.
"""

from fastapi import APIRouter

from api.shared.utils import (
    DEFAULT_CLASS_MAPPING,
    safe_project_path,
    sanitize_filename,
    validate_image_bytes,
    validate_yolo_label_bytes,
    load_project_config,
    save_project_config,
    get_project_storage_info,
)
from api.shared.models import (
    CreateProjectRequest,
    ForkProjectRequest,
    LaunchTemplateProjectRequest,
    DeleteProjectRequest,
    RenameProjectRequest,
    ProjectSettingsSaveRequest,
    UpdateClassesRequest,
    SaveLabelRequest,
    DeleteImageRequest,
    BulkDeleteDuplicatesRequest,
    ImportDatasetUrlRequest,
    CreateCustomTemplateRequest,
)

from api.projects.core import router as core_router, get_categories
from api.projects.images import router as images_router
from api.projects.labels import router as labels_router
from api.projects.classes import router as classes_router
from api.projects.stats import router as stats_router
from api.projects.discovery import router as discovery_router

router = APIRouter(tags=["Projects & Dataset"])

router.include_router(core_router)
router.include_router(images_router)
router.include_router(labels_router)
router.include_router(classes_router)
router.include_router(stats_router)
router.include_router(discovery_router)

__all__ = [
    "router",
    "get_categories",
    "load_project_config",
    "save_project_config",
    "get_project_storage_info",
    "safe_project_path",
    "sanitize_filename",
    "DEFAULT_CLASS_MAPPING",
]
