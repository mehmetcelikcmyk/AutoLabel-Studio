"""
api/shared/models.py
Tüm API'lerde kullanılan Pydantic istek/yanıt modelleri.
Merkezi tutmak sayesinde her router dosyasının bu sınıfları yeniden tanımlamasına gerek kalmaz.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ─── Proje Yönetimi ────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    folder_name: str = Field(..., min_length=1, max_length=100)
    display_name: Optional[str] = Field(None, max_length=150)
    classes: Optional[List[Dict[str, Any]]] = None
    visibility: Optional[str] = Field("private", max_length=20)
    description: Optional[str] = Field("", max_length=2000)
    license: Optional[str] = Field("CC BY 4.0", max_length=100)
    project_type: Optional[str] = Field("detection", max_length=50)
    workspace_id: Optional[str] = Field(None, max_length=100)


class WorkspaceUpdateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    plan: Optional[str] = Field(None, pattern="^(free|premium_trial|public)$")
    vision_goal: Optional[str] = None
    output_target: Optional[str] = None
    data_sources: Optional[str] = None



class ForkProjectRequest(BaseModel):
    source_project_id: str = Field(..., min_length=1, max_length=100)
    new_folder_name: Optional[str] = Field(None, max_length=100)
    new_display_name: Optional[str] = Field(None, max_length=150)


class LaunchTemplateProjectRequest(BaseModel):
    template_id: str = Field(..., min_length=1, max_length=100)
    folder_name: Optional[str] = Field(None, max_length=100)
    display_name: Optional[str] = Field(None, max_length=150)
    include_demo_data: bool = True


class DeleteProjectRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    delete_files: bool = True


class RenameProjectRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    new_name: str = Field(..., min_length=1, max_length=100)
    new_display_name: Optional[str] = Field(None, max_length=150)


class ProjectSettingsSaveRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    display_name: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    visibility: Optional[str] = Field(None, max_length=20)
    classes: Optional[List[Dict[str, Any]]] = None
    ai_conf: Optional[float] = None
    ai_iou: Optional[float] = None
    model_key: Optional[str] = Field(None, max_length=100)


# ─── Sınıf Yönetimi ───────────────────────────────────────────────────────────

class UpdateClassesRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    classes: List[Dict[str, Any]]
    remap_labels: bool = True


# ─── Etiket Okuma / Yazma ─────────────────────────────────────────────────────

class SaveLabelRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    image_filename: str = Field(..., min_length=1, max_length=255)
    boxes: Optional[List[Dict[str, Any]]] = None
    annotations: Optional[List[Dict[str, Any]]] = None
    is_approved: Optional[bool] = False


# ─── Görsel / Dosya Yönetimi ─────────────────────────────────────────────────

class DeleteImageRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    filename: str = Field(..., min_length=1, max_length=255)


class BulkDeleteDuplicatesRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    filenames: List[str]


# ─── Keşfet / Import ─────────────────────────────────────────────────────────

class ImportDatasetUrlRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=1000)
    display_name: Optional[str] = Field(None, max_length=150)
    folder_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field("", max_length=2000)
    visibility: Optional[str] = Field("public", max_length=20)
    license: Optional[str] = Field("CC BY 4.0", max_length=100)
    project_type: Optional[str] = Field("detection", max_length=50)


class CreateCustomTemplateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    category: str = Field("custom", max_length=50)
    description: Optional[str] = Field("", max_length=2000)
    classes: List[Dict[str, Any]]
    recommended_model: Optional[str] = Field("YOLOv8", max_length=50)
    task_type: Optional[str] = Field("Nesne Tespiti", max_length=50)


# ─── AI Etiketleme ────────────────────────────────────────────────────────────

class AutoLabelRequest(BaseModel):
    category: str
    image_filename: str
    conf_threshold: float = 0.07
    model_key: Optional[str] = None
    prompts: Optional[List[str]] = None


class BatchAutoLabelRequest(BaseModel):
    category: str
    conf_threshold: float = 0.07
    overwrite_existing: bool = False
    prompts: Optional[List[str]] = None
    model_key: Optional[str] = None
    model_key_2: Optional[str] = None
    empty_only: bool = False
    batch_id: Optional[str] = None
    target_filenames: Optional[List[str]] = None


class RefineBoxItem(BaseModel):
    x_center: float
    y_center: float
    width: float
    height: float
    class_id: Optional[int] = 0


class RefineBoundingBoxRequest(BaseModel):
    category: str
    image_filename: str
    boxes: List[RefineBoxItem]


class SmartSegmentRequest(BaseModel):
    category: str
    image_filename: str
    click_x: float
    click_y: float
    class_id: Optional[int] = 0


# ─── Batch Yönetimi ──────────────────────────────────────────────────────────

class TeamAssignBatchRequest(BaseModel):
    category: str
    batch_id: str
    assigned_user: str
    lock_hours: int = 24


# ─── Review / QA ─────────────────────────────────────────────────────────────

class MarkReviewRequest(BaseModel):
    category: str
    filename: str
    status: str  # "needs_review" | "approved" | "rejected" | "clear"
    note: Optional[str] = ""


class ApproveAllReviewsRequest(BaseModel):
    category: str
    scope: str = "all"


# ─── Snapshot ─────────────────────────────────────────────────────────────────

class CreateSnapshotRequest(BaseModel):
    category: str
    note: Optional[str] = "Manuel Yedek"


class RollbackSnapshotRequest(BaseModel):
    category: str
    snapshot_id: Optional[str] = None
