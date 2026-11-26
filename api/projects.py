"""
api/projects.py
Geriye dönük tam uyumluluk (backward compatibility) sağlayan ince wrapper modül.
Tüm iş mantığı sorumluluklarına göre alt modüllere ayrılmıştır:
- api.projects.core       → Proje CRUD, ayarlar, listeleme
- api.projects.images     → Görsel yükleme, listeleme, servis, silme
- api.projects.labels     → YOLO etiket yükleme ve kaydetme
- api.projects.classes    → Sınıf tanımları ve yeniden eşleme
- api.projects.stats      → İstatistikler ve çalışma alanı metrikleri
- api.projects.discovery  → Keşfet, şablonlar, fork ve import
- api.shared.models       → Pydantic veri modelleri
- api.shared.utils        → Güvenlik, doğrulama ve depolama fonksiyonları
"""

from api.projects import router
from api.projects.core import get_categories
from api.shared.utils import (
    DEFAULT_CLASS_MAPPING,
    MAX_FILE_SIZE_BYTES,
    MAX_BATCH_UPLOAD_COUNT,
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

__all__ = [
    "router",
    "get_categories",
    "load_project_config",
    "save_project_config",
    "get_project_storage_info",
    "safe_project_path",
    "sanitize_filename",
    "validate_image_bytes",
    "validate_yolo_label_bytes",
    "DEFAULT_CLASS_MAPPING",
    "CreateProjectRequest",
    "ForkProjectRequest",
    "LaunchTemplateProjectRequest",
    "DeleteProjectRequest",
    "RenameProjectRequest",
    "ProjectSettingsSaveRequest",
    "UpdateClassesRequest",
    "SaveLabelRequest",
    "DeleteImageRequest",
    "BulkDeleteDuplicatesRequest",
    "ImportDatasetUrlRequest",
    "CreateCustomTemplateRequest",
]
