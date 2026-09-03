import os
import glob
import json
import shutil
import random
import socket
import re
import argparse
import threading
import time
import hashlib
import secrets
import urllib.parse
import urllib.request as _urllib_req
from datetime import datetime, timedelta, timezone
from pathlib import Path

from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, UploadFile, File, Form, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
import uvicorn
import cv2
import numpy as np

from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True


# Workspace Root Directory — always resolves relative to this script,
# so the app works regardless of which folder it is placed in.
ROOT_DIR = Path(__file__).resolve().parent

app = FastAPI(title="YOLO Editor — AI Dataset Hub")

# Static files directory
STATIC_DIR = ROOT_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Config file for dynamic project and class settings
CONFIG_FILE = ROOT_DIR / "project_config.json"

# =====================================================
# AUTH SYSTEM — Users, Sessions, Passwords
# =====================================================
USERS_FILE = ROOT_DIR / "users.json"
SETTINGS_FILE = ROOT_DIR / "settings.json"

# Token lifetime: 30 days
TOKEN_LIFETIME_DAYS = 30


def _load_users() -> Dict[str, Any]:
    if USERS_FILE.exists():
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"users": [], "sessions": {}}


def _save_users(data: Dict[str, Any]):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _load_settings() -> Dict[str, Any]:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "google_client_id": "",
        "google_client_secret": "",
        "cloudflare_account_id": "",
        "cloudflare_database_id": "",
        "cloudflare_r2_bucket": "yolo-editor",
        "cloudflare_api_token": "",
        "use_cloudflare": False
    }


# =====================================================
# CLOUDFLARE D1 (DATABASE) & R2 (STORAGE) CLIENT
# =====================================================

def cf_d1_query(sql: str, params: Optional[List[Any]] = None) -> Optional[List[Dict[str, Any]]]:
    """Execute SQL query on Cloudflare D1 SQL Database."""
    settings = _load_settings()
    token = settings.get("cloudflare_api_token")
    account_id = settings.get("cloudflare_account_id")
    db_id = settings.get("cloudflare_database_id")
    if not (token and account_id and db_id):
        return None

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_id}/query"
    payload = {"sql": sql}
    if params:
        payload["params"] = params

    try:
        req = _urllib_req.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        )
        with _urllib_req.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success") and data.get("result"):
                return data["result"][0].get("results", [])
    except Exception as e:
        print(f"[Cloudflare D1 Warning] {e}")
    return None


def cf_r2_upload(file_bytes: bytes, object_key: str, content_type: str = "image/jpeg") -> bool:
    """Upload a file or image directly to Cloudflare R2 Object Storage."""
    settings = _load_settings()
    token = settings.get("cloudflare_api_token")
    account_id = settings.get("cloudflare_account_id")
    bucket = settings.get("cloudflare_r2_bucket", "yolo-editor")
    if not (token and account_id and bucket):
        return False

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/{bucket}/objects/{urllib.parse.quote(object_key)}"
    try:
        req = _urllib_req.Request(
            url,
            data=file_bytes,
            method="PUT",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": content_type
            }
        )
        with _urllib_req.urlopen(req, timeout=15) as resp:
            return resp.getcode() in [200, 201]
    except Exception as e:
        print(f"[Cloudflare R2 Warning] {e}")
    return False


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def _make_token() -> str:
    return secrets.token_urlsafe(48)


def _token_expires() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=TOKEN_LIFETIME_DAYS)).isoformat()


def _is_token_valid(expires_at: str) -> bool:
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < exp
    except Exception:
        return False



def _find_user_by_email(users_data: Dict, email: str) -> Optional[Dict]:
    email_lower = email.strip().lower()
    # 1. Check local users first (fast in-memory)
    if not users_data:
        users_data = _load_users()
    for u in users_data.get("users", []):
        if u.get("email", "").lower() == email_lower:
            return u

    # 2. Check Cloudflare D1
    d1_res = cf_d1_query("SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1", [email_lower])
    if d1_res and len(d1_res) > 0:
        return d1_res[0]

    return None


def _get_current_user(authorization: Optional[str]) -> Optional[Dict]:
    """Extract and validate bearer token (local-first with Cloudflare D1 backup)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]

    # 1. Check local session first (instant 0.1ms)
    users_data = _load_users()
    session = users_data.get("sessions", {}).get(token)
    if session and _is_token_valid(session.get("expires_at", "")):
        return _find_user_by_email(users_data, session["email"])

    # 2. Check Cloudflare D1 sessions backup
    d1_session = cf_d1_query("SELECT * FROM sessions WHERE token = ? LIMIT 1", [token])
    if d1_session and len(d1_session) > 0:
        sess = d1_session[0]
        if _is_token_valid(sess.get("expires_at", "")):
            return _find_user_by_email(users_data, sess["email"])

    return None




DEFAULT_CLASS_MAPPING = {
    "bag": {"id": 0, "name": "Bag", "color": "#3b82f6", "prompts": ["bag", "handbag", "backpack", "suitcase", "purse", "tote bag", "shoulder bag", "clutch"]},
    "belt": {"id": 1, "name": "Belt", "color": "#10b981", "prompts": ["belt", "leather belt", "waist belt", "strap belt"]},
    "gloves": {"id": 2, "name": "Gloves", "color": "#f59e0b", "prompts": ["gloves", "glove", "pair of gloves", "mittens", "winter gloves"]},
    "necklace": {"id": 3, "name": "Necklace", "color": "#ec4899", "prompts": ["necklace", "pendant", "chain necklace", "jewelry necklace", "choker"]},
    "scarf": {"id": 4, "name": "Scarf", "color": "#8b5cf6", "prompts": ["scarf", "shawl", "muffler", "neck scarf", "winter scarf"]},
    "tie": {"id": 5, "name": "Tie", "color": "#06b6d4", "prompts": ["necktie", "tie", "bow tie", "suit tie"]},
    "watch": {"id": 6, "name": "Watch", "color": "#f97316", "prompts": ["wristwatch", "watch", "smartwatch", "wrist watch"]},
}

# Robust Image Reader & Writer for Windows & Truncated Web Images
def load_image_rgb(path: Path) -> Optional[np.ndarray]:
    """Robustly load any image format (including truncated or non-ASCII paths) as RGB numpy array."""
    try:
        with Image.open(path) as img:
            img = img.convert("RGB")
            return np.array(img)
    except Exception:
        try:
            with open(path, "rb") as f:
                bytes_data = bytearray(f.read())
                arr = np.asarray(bytes_data, dtype=np.uint8)
                bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if bgr is not None:
                    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        except Exception:
            pass
        return None

def save_image_preview(path: Path, rgb_img: np.ndarray, ext: str = ".jpg") -> bool:
    """Save preview image safely on Windows with non-ASCII paths."""
    try:
        bgr = cv2.cvtColor(rgb_img, cv2.COLOR_RGB2BGR) if len(rgb_img.shape) == 3 else rgb_img
        is_success, buffer = cv2.imencode(ext, bgr)
        if is_success:
            with open(path, "wb") as f:
                f.write(buffer)
            return True
    except Exception:
        pass
    return False

# =====================================================
# SECURITY & DEEP FILE SCANNING HELPERS
# =====================================================
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # Max 25 MB per file
MAX_BATCH_UPLOAD_COUNT = 150            # Max 150 files per single upload request

def _sanitize_filename(filename: str) -> str:
    """Strip path traversal characters and sanitize filename to prevent directory traversal attacks."""
    clean_name = os.path.basename(filename)
    # Remove any dangerous characters except alphanumeric, underscore, dash, and dot
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.ğüşıöçĞÜŞİÖÇ]', '_', clean_name)
    clean_name = clean_name.strip(' .')
    return clean_name or f"upload_{int(time.time())}.jpg"

def _validate_image_bytes(data: bytes) -> bool:
    """
    Deep scan image data:
    1. Check magic bytes
    2. Deep PIL verification against Decompression Bombs & malformed image payloads
    """
    if len(data) < 12 or len(data) > MAX_FILE_SIZE_BYTES:
        return False

    # Magic byte signatures
    is_jpeg = data.startswith(b'\xff\xd8\xff')
    is_png = data.startswith(b'\x89PNG\r\n\x1a\n')
    is_webp = data.startswith(b'RIFF') and b'WEBP' in data[:16]
    is_bmp = data.startswith(b'BM')

    if not (is_jpeg or is_png or is_webp or is_bmp):
        return False

    # Deep decode check with PIL
    try:
        import io
        with Image.open(io.BytesIO(data)) as img:
            img.verify()  # Verifies integrity without decoding entire raster
        return True
    except Exception:
        return False

def _validate_yolo_label_bytes(data: bytes) -> Optional[List[str]]:
    """
    Strict YOLO label parser and sanitizer:
    Ensures every line is strictly `<class_id:int> <xc:float> <yc:float> <w:float> <h:float>`
    within bounds [0.0, 1.0]. Rejects files with shell scripts, code, or corrupt lines.
    """
    if len(data) > 2 * 1024 * 1024:  # Labels shouldn't exceed 2 MB
        return None

    try:
        text = data.decode("utf-8", errors="ignore")
    except Exception:
        return None

    valid_lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            return None  # Malformed YOLO line
        try:
            cid = int(parts[0])
            xc, yc, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
            if cid < 0 or cid > 10000:
                return None
            if not (0.0 <= xc <= 1.0 and 0.0 <= yc <= 1.0 and 0.0 <= w <= 1.0 and 0.0 <= h <= 1.0):
                return None
            valid_lines.append(f"{cid} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
        except ValueError:
            return None  # Contains non-numerical malicious payload

    return valid_lines


def load_project_config() -> Dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"projects": {}, "classes": DEFAULT_CLASS_MAPPING}

def save_project_config(config: Dict[str, Any]):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

# =====================================================
# AI MODEL REGISTRY — supported models
# =====================================================
MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "yolov8s-worldv2": {
        "filename": "yolov8s-worldv2.pt",
        "type": "world",
        "label": "YOLOv8s-World v2 (Önerilen)",
        "size_mb": 26,
        "speed": "orta",
        "accuracy": "yüksek",
    },
    "yolov8m-worldv2": {
        "filename": "yolov8m-worldv2.pt",
        "type": "world",
        "label": "YOLOv8m-World v2 (Daha Güçlü)",
        "size_mb": 87,
        "speed": "yavaş",
        "accuracy": "çok yüksek",
    },
    "yolov8l-worldv2": {
        "filename": "yolov8l-worldv2.pt",
        "type": "world",
        "label": "YOLOv8l-World v2 (En Güçlü)",
        "size_mb": 196,
        "speed": "çok yavaş",
        "accuracy": "en yüksek",
    },
    "yolov8n": {
        "filename": "yolov8n.pt",
        "type": "standard",
        "label": "YOLOv8n (Hızlı, COCO 80 sınıf)",
        "size_mb": 6,
        "speed": "çok hızlı",
        "accuracy": "orta",
    },
    "yolov8s": {
        "filename": "yolov8s.pt",
        "type": "standard",
        "label": "YOLOv8s (Hızlı, COCO 80 sınıf)",
        "size_mb": 22,
        "speed": "hızlı",
        "accuracy": "iyi",
    },
}
DEFAULT_MODEL_KEY = "yolov8s-worldv2"

# =====================================================
# THREAD-SAFE MODEL CACHE
# =====================================================
_MODEL_LOCK = threading.Lock()
_MODEL_CACHE: Dict[str, Any] = {}   # key: (model_key, device) → model instance
_ACTIVE_DEVICE: str = "cpu"          # auto-detected at startup
_LAST_CLASSES: List[str] = []        # cached classes to avoid redundant set_classes calls

def _detect_device() -> str:
    """Auto-detect best available compute device."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"

def _ensure_model_file(filename: str, loader_fn):
    """Download model file if not present, print progress."""
    path = ROOT_DIR / filename
    if not path.exists():
        print(f"  [Model] '{filename}' bulunamadi, indiriliyor...")
        try:
            loader_fn()
            if path.exists():
                print(f"  [Model] '{filename}' indirildi. ✓")
        except Exception as e:
            print(f"  [Model] '{filename}' indirilemedi: {e}")
    else:
        print(f"  [Model] '{filename}' mevcut. ✓")

def get_ai_model(model_key: Optional[str] = None, device: Optional[str] = None):
    """
    Thread-safe model loader with cache.
    Returns (model, model_key) tuple.
    Falls back gracefully if requested model unavailable.
    """
    global _ACTIVE_DEVICE, _LAST_CLASSES
    if device is None:
        device = _ACTIVE_DEVICE
    if model_key is None:
        model_key = DEFAULT_MODEL_KEY

    cache_key = f"{model_key}::{device}"
    with _MODEL_LOCK:
        if cache_key in _MODEL_CACHE:
            return _MODEL_CACHE[cache_key], model_key

        info = MODEL_REGISTRY.get(model_key)
        if info is None:
            model_key = DEFAULT_MODEL_KEY
            info = MODEL_REGISTRY[model_key]
            cache_key = f"{model_key}::{device}"
            if cache_key in _MODEL_CACHE:
                return _MODEL_CACHE[cache_key], model_key

        model_path = ROOT_DIR / info["filename"]
        try:
            from ultralytics import YOLOWorld, YOLO
            if info["type"] == "world":
                if not model_path.exists():
                    YOLOWorld(info["filename"])  # auto-download to CWD / ultralytics cache
                model = YOLOWorld(str(model_path))
            else:
                if not model_path.exists():
                    YOLO(info["filename"])
                model = YOLO(str(model_path))

            # Move to device if possible
            try:
                model.to(device)
            except Exception:
                pass

            _MODEL_CACHE[cache_key] = model
            _LAST_CLASSES = []
            return model, model_key
        except Exception as e:
            # Fallback chain: worldv2 → yolov8n
            if model_key != DEFAULT_MODEL_KEY:
                return get_ai_model(DEFAULT_MODEL_KEY, device)
            try:
                fallback_path = ROOT_DIR / "yolov8n.pt"
                from ultralytics import YOLO
                model = YOLO(str(fallback_path))
                fk = "yolov8n"
                _MODEL_CACHE[f"{fk}::{device}"] = model
                return model, fk
            except Exception as e2:
                raise RuntimeError(f"Hicbir AI modeli yuklenemedi: {e2}")

def _set_classes_if_changed(model, classes: List[str]):
    """Only call set_classes when class list actually changed (avoids GPU overhead)."""
    global _LAST_CLASSES
    if hasattr(model, "set_classes") and classes != _LAST_CLASSES:
        model.set_classes(classes)
        _LAST_CLASSES = list(classes)

# =====================================================
# ADVANCED NMS HELPERS
# =====================================================

def _soft_nms(
    boxes: np.ndarray,   # (N, 4) xyxy normalized
    scores: np.ndarray,  # (N,)
    sigma: float = 0.5,
    score_threshold: float = 0.01,
    iou_method: str = "gaussian",
) -> np.ndarray:
    """
    Soft-NMS: decays scores of overlapping boxes instead of hard removal.
    Returns kept indices (above score_threshold after decay).
    """
    N = len(scores)
    scores = scores.copy()
    order = np.argsort(-scores)
    boxes = boxes[order]
    scores = scores[order]
    orig_indices = order.copy()

    kept = []
    for i in range(N):
        if scores[i] < score_threshold:
            continue
        kept.append(orig_indices[i])
        xi1, yi1, xi2, yi2 = boxes[i]
        ai = (xi2 - xi1) * (yi2 - yi1)
        for j in range(i + 1, N):
            if scores[j] < score_threshold:
                continue
            xj1, yj1, xj2, yj2 = boxes[j]
            ix1 = max(xi1, xj1); iy1 = max(yi1, yj1)
            ix2 = min(xi2, xj2); iy2 = min(yi2, yj2)
            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
            aj = (xj2 - xj1) * (yj2 - yj1)
            union = ai + aj - inter
            iou = inter / union if union > 0 else 0.0
            if iou_method == "gaussian":
                scores[j] *= np.exp(-(iou ** 2) / sigma)
            else:  # linear
                if iou > sigma:
                    scores[j] *= (1.0 - iou)
    return np.array(kept, dtype=np.int64)


def _filter_boxes(
    boxes_xyxyn: np.ndarray,  # (N, 4) normalized xyxy
    confs: np.ndarray,        # (N,)
    cls_indices: np.ndarray,  # (N,)
    iou_thresh: float = 0.5,
    min_area: float = 0.0001,   # min fraction of image area
    max_aspect: float = 15.0,   # max width/height or height/width ratio
    sigma_soft: float = 0.5,
) -> List[int]:
    """
    Full filtering pipeline:
    1. Remove degenerate boxes (too small, extreme aspect ratio)
    2. Soft-NMS across all boxes
    3. Clip to [0,1]
    Returns list of kept original indices.
    """
    N = len(confs)
    if N == 0:
        return []

    valid = []
    for i in range(N):
        x1, y1, x2, y2 = boxes_xyxyn[i]
        x1, y1 = max(0.0, x1), max(0.0, y1)
        x2, y2 = min(1.0, x2), min(1.0, y2)
        w = x2 - x1
        h = y2 - y1
        if w <= 0 or h <= 0:
            continue
        area = w * h
        if area < min_area:
            continue
        aspect = max(w / max(h, 1e-6), h / max(w, 1e-6))
        if aspect > max_aspect:
            continue
        boxes_xyxyn[i] = [x1, y1, x2, y2]
        valid.append(i)

    if not valid:
        return []

    valid = np.array(valid)
    kept_rel = _soft_nms(boxes_xyxyn[valid], confs[valid], sigma=sigma_soft)
    return valid[kept_rel].tolist()


def _build_prompt_map(cls_list: List[Dict]) -> tuple:
    """Build (all_prompts, prompt_to_class) from class definition list."""
    all_prompts: List[str] = []
    prompt_to_class: Dict[str, tuple] = {}
    for cls in cls_list:
        c_id = cls.get("id", 0)
        c_name = cls.get("name", "object")
        c_prompts = cls.get("prompts") or [c_name.lower()]
        for p in c_prompts:
            p_clean = p.strip().lower()
            if p_clean and p_clean not in all_prompts:
                all_prompts.append(p_clean)
                prompt_to_class[p_clean] = (c_id, c_name)
    return all_prompts, prompt_to_class


def _resolve_cls_list(category: str, config: Dict) -> List[Dict]:
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    cat_key = category.lower()
    cls_raw = classes_map.get(cat_key)
    if isinstance(cls_raw, list) and cls_raw:
        return cls_raw
    if isinstance(cls_raw, dict):
        return [cls_raw]
    return [{"id": 0, "name": category.capitalize(), "prompts": [cat_key]}]


def _get_imgsz(h: int, w: int) -> int:
    max_dim = max(h, w)
    if max_dim >= 1400:
        return 1280
    if max_dim >= 900:
        return 1024
    return 640

# Background Batch Auto-Labeling State Tracker
BATCH_JOBS: Dict[str, Dict[str, Any]] = {}

# =====================================================
# HEALTH CHECK
# =====================================================

@app.get("/api/health")
def health_check():
    """Simple health check for the app."""
    return {
        "status": "ok",
        "app": "YOLO Editor",
        "version": "2.0",
        "root_dir": str(ROOT_DIR)
    }

# Pydantic Schemas
class BoundingBox(BaseModel):
    class_id: int
    class_name: Optional[str] = ""
    x_center: float
    y_center: float
    width: float
    height: float
    confidence: Optional[float] = 1.0

class SaveLabelRequest(BaseModel):
    category: str
    image_filename: str
    boxes: List[BoundingBox]
    update_preview: bool = True

class AutoLabelRequest(BaseModel):
    category: str
    image_filename: str
    conf_threshold: float = 0.07

class CreateProjectRequest(BaseModel):
    folder_name: str
    display_name: str
    description: Optional[str] = ""
    classes: Optional[List[Dict[str, Any]]] = None
    visibility: str = "public"      # "public" or "private"
    license: str = "CC BY 4.0"      # e.g. "MIT", "Public Domain", "Proprietary"
    project_type: str = "detection" # "detection" or "classification"

class UpdateClassesRequest(BaseModel):
    category: str
    classes: List[Dict[str, Any]]

class ProjectSettingsSaveRequest(BaseModel):
    category: str
    display_name: str
    description: Optional[str] = ""
    classes: List[Dict[str, Any]]
    ai_conf: Optional[float] = 0.25
    ai_iou: Optional[float] = 0.45

class DeleteProjectRequest(BaseModel):
    category: str
    delete_files: bool = True

class DeleteImageRequest(BaseModel):
    category: str
    filename: str

class BatchAutoLabelRequest(BaseModel):
    category: str
    conf_threshold: float = 0.07
    overwrite_existing: bool = False
    prompts: Optional[List[str]] = None
    model_key: Optional[str] = None      # None = use default
    empty_only: bool = False             # only label images without existing labels

class ExportZipRequest(BaseModel):
    category: str
    train_ratio: float = 0.80

class FindSimilarRequest(BaseModel):
    category: str
    ref_image: str
    box: BoundingBox
    min_similarity: float = 0.65
    max_results: int = 200               # scan limit (0 = all)
    method: str = "orb"                  # "orb", "hog", "template", "combined"

class SuggestPromptsRequest(BaseModel):
    category: str
    class_name: str
    existing_prompts: Optional[List[str]] = None

class ModelSelectRequest(BaseModel):
    category: str
    model_key: str

# ─────────────────────────────────────────────────────────────────────────────
# AUTH PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    display_name: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str

class GoogleSettingsRequest(BaseModel):
    google_client_id: str
    google_client_secret: str

# ─────────────────────────────────────────────────────────────────────────────
# AUTH API ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    """Register a new user with email + password."""
    email = req.email.strip().lower()
    # Basic email format check
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Geçersiz e-posta adresi.")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalıdır.")
    if not req.display_name.strip():
        raise HTTPException(status_code=400, detail="Ad Soyad boş olamaz.")

    users_data = _load_users()
    existing = _find_user_by_email(users_data, email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Bu e-posta adresiyle zaten bir kayıt mevcut. Lütfen giriş yapın."
        )

    salt = secrets.token_hex(16)
    new_user = {
        "email": email,
        "display_name": req.display_name.strip(),
        "password_hash": _hash_password(req.password, salt),
        "salt": salt,
        "auth_provider": "local",
        "avatar_url": f"https://ui-avatars.com/api/?name={urllib.parse.quote(req.display_name)}&background=3b82f6&color=fff&size=128",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reset_code": None,
        "reset_expires": None,
    }
    users_data["users"].append(new_user)

    # Create session token
    token = _make_token()
    users_data.setdefault("sessions", {})[token] = {
        "email": email,
        "expires_at": _token_expires(),
    }
    _save_users(users_data)

    # Sync to Cloudflare D1
    cf_d1_query(
        "INSERT OR REPLACE INTO users (email, display_name, password_hash, salt, auth_provider, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [new_user["email"], new_user["display_name"], new_user["password_hash"], new_user["salt"], new_user["auth_provider"], new_user["avatar_url"], new_user["created_at"]]
    )
    cf_d1_query(
        "INSERT OR REPLACE INTO sessions (token, email, expires_at) VALUES (?, ?, ?)",
        [token, email, _token_expires()]
    )

    return {
        "status": "ok",
        "token": token,
        "user": {
            "email": email,
            "display_name": new_user["display_name"],
            "avatar_url": new_user["avatar_url"],
        }
    }


@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    """Login with email + password."""
    email = req.email.strip().lower()
    users_data = _load_users()
    user = _find_user_by_email(users_data, email)

    if not user:
        raise HTTPException(status_code=401, detail="Bu e-posta adresiyle kayıtlı hesap bulunamadı.")

    if user.get("auth_provider") == "google":
        raise HTTPException(
            status_code=400,
            detail="Bu hesap Google ile oluşturulmuştur. Lütfen 'Google ile Giriş Yap' seçeneğini kullanın."
        )

    expected = _hash_password(req.password, user.get("salt", ""))
    if expected != user.get("password_hash", ""):
        raise HTTPException(status_code=401, detail="Şifre hatalı. Lütfen tekrar deneyin.")

    token = _make_token()
    users_data.setdefault("sessions", {})[token] = {
        "email": email,
        "expires_at": _token_expires(),
    }
    _save_users(users_data)

    # Sync session to Cloudflare D1
    cf_d1_query(
        "INSERT OR REPLACE INTO sessions (token, email, expires_at) VALUES (?, ?, ?)",
        [token, email, _token_expires()]
    )

    return {
        "status": "ok",
        "token": token,
        "user": {
            "email": email,
            "display_name": user.get("display_name", email.split("@")[0]),
            "avatar_url": user.get("avatar_url", ""),
        }
    }


@app.post("/api/auth/logout")
def auth_logout(authorization: Optional[str] = Header(None)):
    """Invalidate the current session token."""
    if not authorization or not authorization.startswith("Bearer "):
        return {"status": "ok"}
    token = authorization[7:]
    users_data = _load_users()
    users_data.get("sessions", {}).pop(token, None)
    _save_users(users_data)

    # Invalidate in Cloudflare D1
    cf_d1_query("DELETE FROM sessions WHERE token = ?", [token])

    return {"status": "ok"}


@app.get("/api/auth/me")
def auth_me(authorization: Optional[str] = Header(None)):
    """Return current authenticated user info including admin role."""
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum geçersiz veya süresi dolmuş.")
    email = user.get("email", "").lower()
    # Check if admin by role in json or known admin emails/prefixes
    is_admin = user.get("role") == "admin" or email in ["admin@test.com", "celikcelik156@gmail.com", "teknofestgibtu@gmail.com"] or email.startswith("admin@")
    return {
        "status": "ok",
        "user": {
            "email": user.get("email", ""),
            "display_name": user.get("display_name", ""),
            "avatar_url": user.get("avatar_url", ""),
            "auth_provider": user.get("auth_provider", "local"),
            "role": "admin" if is_admin else "user",
            "is_admin": is_admin
        }
    }


def _require_admin(authorization: Optional[str]) -> Dict[str, Any]:
    """Helper to require admin privileges."""
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")
    email = user.get("email", "").lower()
    is_admin = user.get("role") == "admin" or email in ["admin@test.com", "celikcelik156@gmail.com", "teknofestgibtu@gmail.com"] or email.startswith("admin@")
    if not is_admin:
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici (Admin) yetkisi gereklidir.")
    return user


@app.post("/api/auth/forgot-password")
def auth_forgot(req: ForgotPasswordRequest):
    """Generate a 6-digit reset code (stored locally; shown in response for local apps)."""
    email = req.email.strip().lower()
    users_data = _load_users()
    user = _find_user_by_email(users_data, email)

    # Always return success to prevent email enumeration
    if not user or user.get("auth_provider") == "google":
        return {"status": "ok", "message": "Eğer bu e-posta kayıtlıysa sıfırlama kodu gönderildi."}

    code = str(random.randint(100000, 999999))
    user["reset_code"] = code
    user["reset_expires"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    _save_users(users_data)

    # Sync reset code to Cloudflare D1
    cf_d1_query(
        "UPDATE users SET reset_code = ?, reset_expires = ? WHERE LOWER(email) = ?",
        [code, user["reset_expires"], email]
    )

    # For local desktop apps: return code directly (no email server)
    return {
        "status": "ok",
        "message": "Sıfırlama kodu oluşturuldu.",
        "reset_code": code,  # In production, this would be sent via email
        "note": "Bu yerel bir uygulama olduğundan kod doğrudan döndürülmektedir."
    }


@app.post("/api/auth/reset-password")
def auth_reset(req: ResetPasswordRequest):
    """Verify reset code and set new password."""
    email = req.email.strip().lower()
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Yeni şifre en az 8 karakter olmalıdır.")

    users_data = _load_users()
    user = _find_user_by_email(users_data, email)

    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if user.get("reset_code") != req.code:
        raise HTTPException(status_code=400, detail="Sıfırlama kodu hatalı.")
    if not _is_token_valid(user.get("reset_expires", "")):
        raise HTTPException(status_code=400, detail="Sıfırlama kodunun süresi dolmuştur. Lütfen tekrar isteyin.")

    salt = secrets.token_hex(16)
    user["password_hash"] = _hash_password(req.new_password, salt)
    user["salt"] = salt
    user["reset_code"] = None
    user["reset_expires"] = None
    _save_users(users_data)

    # Sync password reset to Cloudflare D1
    cf_d1_query(
        "UPDATE users SET password_hash = ?, salt = ?, reset_code = NULL, reset_expires = NULL WHERE LOWER(email) = ?",
        [user["password_hash"], salt, email]
    )

    return {"status": "ok", "message": "Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz."}


@app.get("/api/auth/google")
def auth_google(request: Request):
    """Redirect user to Google OAuth login page."""
    settings = _load_settings()
    client_id = settings.get("google_client_id")
    if not client_id:
        return JSONResponse(status_code=400, content={
            "detail": "Google OAuth yapılandırılmamış.",
            "message": "Google OAuth henüz yapılandırılmamış. Ayarlar > Google OAuth bölümünden Client ID girin."
        })

    # Dynamic redirect URI based on actual host / port / scheme (handles reverse proxies & localhost)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", f"localhost:{request.url.port or 8000}"))
    redirect_uri = f"{proto}://{host}/api/auth/google/callback"

    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@app.get("/api/auth/google/callback")
def auth_google_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None):
    """Handle Google OAuth callback, create or login user."""
    if error or not code:
        return RedirectResponse("/?auth_error=google_denied")

    settings = _load_settings()
    client_id = settings.get("google_client_id", "")
    client_secret = settings.get("google_client_secret", "")

    # Dynamic redirect URI based on actual host / port / scheme
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", f"localhost:{request.url.port or 8000}"))
    redirect_uri = f"{proto}://{host}/api/auth/google/callback"

    try:
        # Exchange code for token
        token_data = urllib.parse.urlencode({
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }).encode()
        req = _urllib_req.Request("https://oauth2.googleapis.com/token", data=token_data)
        with _urllib_req.urlopen(req, timeout=10) as resp:
            token_resp = json.loads(resp.read())
        access_token = token_resp.get("access_token", "")

        # Fetch user info
        user_req = _urllib_req.Request(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        with _urllib_req.urlopen(user_req, timeout=10) as resp:
            guser = json.loads(resp.read())

        email = guser.get("email", "").lower()
        display_name = guser.get("name", email.split("@")[0])
        avatar_url = guser.get("picture", "")

        if not email:
            return RedirectResponse("/?auth_error=google_no_email")

        users_data = _load_users()
        existing = _find_user_by_email(users_data, email)

        if existing:
            # Update display_name & avatar
            if not existing.get("display_name") or existing.get("display_name") == email.split("@")[0]:
                existing["display_name"] = display_name
            if avatar_url:
                existing["avatar_url"] = avatar_url
            if not existing.get("auth_provider") or existing.get("auth_provider") == "local":
                existing["auth_provider"] = "google"
        else:
            # New Google user
            users_data["users"].append({
                "email": email,
                "display_name": display_name,
                "password_hash": "",
                "salt": "",
                "auth_provider": "google",
                "avatar_url": avatar_url,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "reset_code": None,
                "reset_expires": None,
            })

        token = _make_token()
        users_data.setdefault("sessions", {})[token] = {
            "email": email,
            "expires_at": _token_expires(),
        }
        _save_users(users_data)

        # Sync Google user to Cloudflare D1
        cf_d1_query(
            "INSERT OR REPLACE INTO users (email, display_name, password_hash, salt, auth_provider, avatar_url, created_at) VALUES (?, ?, '', '', 'google', ?, ?)",
            [email, display_name, avatar_url, datetime.now(timezone.utc).isoformat()]
        )
        cf_d1_query(
            "INSERT OR REPLACE INTO sessions (token, email, expires_at) VALUES (?, ?, ?)",
            [token, email, _token_expires()]
        )

        # Redirect back to app with token
        return RedirectResponse(f"/?google_token={token}&display_name={urllib.parse.quote(display_name)}")

    except Exception as ex:
        print(f"[Google OAuth Error] {ex}")
        return RedirectResponse(f"/?auth_error=google_failed")



@app.post("/api/auth/google-settings")
def save_google_settings(req: GoogleSettingsRequest):
    """Save Google OAuth credentials to settings.json."""
    settings = _load_settings()
    settings["google_client_id"] = req.google_client_id.strip()
    settings["google_client_secret"] = req.google_client_secret.strip()
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
    return {"status": "ok"}


@app.get("/api/auth/google-settings")
def get_google_settings():
    settings = _load_settings()
    return {
        "configured": bool(settings.get("google_client_id")),
        "client_id_preview": settings.get("google_client_id", "")[:10] + "..." if settings.get("google_client_id") else ""
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLOUDFLARE SETTINGS API
# ─────────────────────────────────────────────────────────────────────────────

class CloudflareSettingsRequest(BaseModel):
    cloudflare_account_id: str
    cloudflare_api_token: str
    cloudflare_database_id: str
    cloudflare_r2_bucket: Optional[str] = "yolo-editor"
    use_cloudflare: Optional[bool] = True


@app.post("/api/settings/cloudflare")
def save_cloudflare_settings(req: CloudflareSettingsRequest, authorization: Optional[str] = Header(None)):
    """Save Cloudflare D1 and R2 credentials to settings.json."""
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    settings = _load_settings()
    settings["cloudflare_account_id"] = req.cloudflare_account_id.strip()
    settings["cloudflare_api_token"] = req.cloudflare_api_token.strip()
    settings["cloudflare_database_id"] = req.cloudflare_database_id.strip()
    settings["cloudflare_r2_bucket"] = (req.cloudflare_r2_bucket or "yolo-editor").strip()
    settings["use_cloudflare"] = req.use_cloudflare

    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)

    # Clear model cache for D1 to take effect
    return {"status": "ok", "message": "Cloudflare settings saved. Cloud sync is now active."}


@app.get("/api/settings/cloudflare")
def get_cloudflare_settings(authorization: Optional[str] = Header(None)):
    """Return current Cloudflare settings (redacts secret tokens)."""
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    settings = _load_settings()
    return {
        "cloudflare_account_id": settings.get("cloudflare_account_id", ""),
        "cloudflare_database_id": settings.get("cloudflare_database_id", ""),
        "cloudflare_r2_bucket": settings.get("cloudflare_r2_bucket", "yolo-editor"),
        "google_client_id": settings.get("google_client_id", ""),
        "use_cloudflare": settings.get("use_cloudflare", False),
        "configured": bool(settings.get("cloudflare_account_id") and settings.get("cloudflare_api_token")),
    }


@app.get("/api/settings/cloudflare/test")
def test_cloudflare_connection(authorization: Optional[str] = Header(None)):
    """Test Cloudflare D1 connectivity by running a simple query."""
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    settings = _load_settings()
    if not (settings.get("cloudflare_account_id") and settings.get("cloudflare_api_token") and settings.get("cloudflare_database_id")):
        return JSONResponse(status_code=400, content={
            "connected": False,
            "detail": "Cloudflare credentials are not configured. Save your settings first."
        })

    result = cf_d1_query("SELECT 1 AS ping")
    if result is not None:
        return {"connected": True, "message": "Cloudflare D1 connection is working correctly."}
    else:
        return JSONResponse(status_code=503, content={
            "connected": False,
            "detail": "Could not connect to Cloudflare D1. Check your Account ID, Database ID and API Token."
        })


# =====================================================
# SUPER ADMIN API ENDPOINTS (Yönetici & Sistem Kontrol)
# =====================================================

class UpdateUserRoleRequest(BaseModel):
    email: str
    role: str  # "admin" | "user"

class DeleteUserRequest(BaseModel):
    email: str

@app.get("/api/admin/overview")
def admin_overview(authorization: Optional[str] = Header(None)):
    """Return consolidated stats for the Admin Dashboard."""
    _require_admin(authorization)
    users_data = _load_users()
    config = load_project_config()
    projects = get_categories()

    total_images = sum(p.get("image_count", 0) for p in projects)
    total_labeled = sum(p.get("label_count", 0) for p in projects)
    active_sessions = len(users_data.get("sessions", {}))

    # Detect system resources
    import sys, platform
    cpu_count = os.cpu_count() or 1
    
    device_info = "GPU (CUDA)" if "cuda" in _ACTIVE_DEVICE else ("Apple MPS" if "mps" in _ACTIVE_DEVICE else "CPU (Standard)")
    
    # Models info
    loaded_models_count = len(_MODEL_CACHE)
    registered_models_count = len(MODEL_REGISTRY)

    return {
        "status": "ok",
        "stats": {
            "total_users": len(users_data.get("users", [])),
            "active_sessions": active_sessions,
            "total_projects": len(projects),
            "total_images": total_images,
            "total_labeled": total_labeled,
            "completion_rate": round((total_labeled / total_images * 100), 1) if total_images > 0 else 0,
            "active_device": device_info,
            "cpu_cores": cpu_count,
            "python_version": platform.python_version(),
            "os_name": platform.system() + " " + platform.release(),
            "cached_models_count": loaded_models_count,
            "registered_models_count": registered_models_count
        }
    }

@app.get("/api/admin/users")
def admin_get_users(authorization: Optional[str] = Header(None)):
    """List all registered users with metadata and roles."""
    _require_admin(authorization)
    users_data = _load_users()
    user_list = []
    
    sessions = users_data.get("sessions", {})
    # Active user emails
    active_emails = {s.get("email", "").lower() for s in sessions.values() if _is_token_valid(s.get("expires_at", ""))}

    for u in users_data.get("users", []):
        u_email = u.get("email", "").lower()
        is_adm = u.get("role") == "admin" or u_email in ["admin@test.com", "celikcelik156@gmail.com", "teknofestgibtu@gmail.com"] or u_email.startswith("admin@")
        user_list.append({
            "email": u.get("email", ""),
            "display_name": u.get("display_name", u.get("email", "").split("@")[0]),
            "avatar_url": u.get("avatar_url", ""),
            "auth_provider": u.get("auth_provider", "local"),
            "created_at": u.get("created_at", ""),
            "role": "admin" if is_adm else "user",
            "is_online": u_email in active_emails
        })
    return {"status": "ok", "users": user_list}

@app.post("/api/admin/update-user-role")
def admin_update_user_role(req: UpdateUserRoleRequest, authorization: Optional[str] = Header(None)):
    """Change a user's role (admin / user)."""
    admin_user = _require_admin(authorization)
    target_email = req.email.strip().lower()
    
    if target_email == admin_user.get("email", "").lower():
        raise HTTPException(status_code=400, detail="Kendi yöneticilik rolünüzü değiştiremezsiniz.")

    users_data = _load_users()
    user = _find_user_by_email(users_data, target_email)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    user["role"] = req.role.strip().lower()
    _save_users(users_data)
    return {"status": "ok", "message": f"{target_email} kullanıcısının rolü '{req.role}' olarak güncellendi."}

@app.post("/api/admin/delete-user")
def admin_delete_user(req: DeleteUserRequest, authorization: Optional[str] = Header(None)):
    """Delete a user and terminate their sessions."""
    admin_user = _require_admin(authorization)
    target_email = req.email.strip().lower()

    if target_email == admin_user.get("email", "").lower():
        raise HTTPException(status_code=400, detail="Kendi hesabınızı yönetici panelinden silemezsiniz.")

    users_data = _load_users()
    initial_count = len(users_data.get("users", []))
    users_data["users"] = [u for u in users_data.get("users", []) if u.get("email", "").lower() != target_email]
    
    # Remove user's sessions
    sessions = users_data.get("sessions", {})
    users_data["sessions"] = {tok: sess for tok, sess in sessions.items() if sess.get("email", "").lower() != target_email}
    
    if len(users_data["users"]) == initial_count:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    _save_users(users_data)
    cf_d1_query("DELETE FROM users WHERE LOWER(email) = ?", [target_email])
    cf_d1_query("DELETE FROM sessions WHERE LOWER(email) = ?", [target_email])
    return {"status": "ok", "message": f"{target_email} hesabı başarıyla silindi."}

@app.get("/api/admin/models")
def admin_get_models(authorization: Optional[str] = Header(None)):
    """List all AI models with file existence, cache status, and weights info."""
    _require_admin(authorization)
    models_info = []
    
    for key, info in MODEL_REGISTRY.items():
        fname = info.get("filename", "")
        fpath = ROOT_DIR / fname
        exists = fpath.exists()
        size_actual_mb = round(fpath.stat().st_size / (1024 * 1024), 2) if exists else 0
        cached = any(k.startswith(f"{key}::") for k in _MODEL_CACHE.keys())
        
        models_info.append({
            "key": key,
            "name": info.get("label", key),
            "filename": fname,
            "exists": exists,
            "size_mb": size_actual_mb or info.get("size_mb", 0),
            "type": info.get("type", "standard"),
            "speed": info.get("speed", "orta"),
            "accuracy": info.get("accuracy", "iyi"),
            "is_cached_in_memory": cached,
            "device": _ACTIVE_DEVICE
        })
    return {"status": "ok", "models": models_info}

@app.post("/api/admin/models/preload")
def admin_preload_model(req: Dict[str, str], authorization: Optional[str] = Header(None)):
    """Preload an AI model into RAM cache."""
    _require_admin(authorization)
    model_key = req.get("model_key", DEFAULT_MODEL_KEY)
    try:
        model, actual_key = get_ai_model(model_key, _ACTIVE_DEVICE)
        return {"status": "ok", "message": f"'{actual_key}' modeli başarıyla RAM önbelleğine yüklendi."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model yüklenirken hata: {str(e)}")

@app.get("/api/admin/logs")
def admin_get_logs(authorization: Optional[str] = Header(None)):
    """Return recent operational and system audit logs."""
    _require_admin(authorization)
    # Generate live operational events log
    users_data = _load_users()
    config = load_project_config()
    logs = []
    
    # 1. User registration events
    for u in users_data.get("users", []):
        if u.get("created_at"):
            logs.append({
                "timestamp": u.get("created_at"),
                "level": "INFO",
                "category": "AUTH",
                "message": f"Yeni kullanıcı kaydoldu: {u.get('display_name')} ({u.get('email')}) — Sağlayıcı: {u.get('auth_provider', 'local')}"
            })
    
    # 2. System startup and runtime events
    logs.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "INFO",
        "category": "SYSTEM",
        "message": f"Sistem aktif ve çalışıyor. Aktif hızlandırıcı: {_ACTIVE_DEVICE.upper()}, Bellekteki AI Modelleri: {len(_MODEL_CACHE)}"
    })
    
    # Sort descending by timestamp
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"status": "ok", "logs": logs[:50]}


def cv2_imread_utf8(path: Path) -> Optional[np.ndarray]:
    """Safely read image on Windows systems with non-ASCII / Turkish directory paths."""
    try:
        with open(path, "rb") as f:
            bytes_data = bytearray(f.read())
            arr = np.asarray(bytes_data, dtype=np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None

def cv2_imwrite_utf8(path: Path, img: np.ndarray, ext: str = ".jpg") -> bool:
    """Safely write image on Windows systems with non-ASCII / Turkish directory paths."""
    try:
        is_success, buffer = cv2.imencode(ext, img)
        if is_success:
            with open(path, "wb") as f:
                f.write(buffer)
            return True
    except Exception:
        pass
    return False

def get_categories():
    """Find all image/labeled folder pairs in root directory."""
    config = load_project_config()
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    projects_meta = config.get("projects", {})
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    ignored_names = {
        "static", "exports", "tmp", "venv", ".venv", "node_modules", ".gemini", 
        ".git", ".idea", ".vscode", "weights", "models", "checkpoints", "logs", 
        "runs", "__pycache__", "docs", "assets", "backup", "datasets"
    }

    categories = []
    for item in os.listdir(ROOT_DIR):
        item_path = ROOT_DIR / item
        if (
            item_path.is_dir()
            and not item.startswith(".")
            and not item.startswith("__")
            and item.lower() not in ignored_names
            and not item.endswith("_labeled")
        ):
            labeled_path = ROOT_DIR / f"{item}_labeled"
            labels_dir = labeled_path / "labels"
            
            img_files = [f for f in os.listdir(item_path) if os.path.splitext(f)[1].lower() in valid_extensions]
            img_count = len(img_files)
            
            # If a folder has 0 images and is not explicitly created in config projects, ignore it
            if img_count == 0 and item not in projects_meta and item.lower() not in projects_meta:
                continue
            
            label_count = 0
            if labels_dir.exists():
                for txt in labels_dir.iterdir():
                    if txt.suffix == ".txt" and txt.stat().st_size > 0:
                        label_count += 1

            cat_key = item.lower()
            cls_data = classes_map.get(cat_key)
            if not cls_data:
                cls_list = [{"id": 0, "name": item.capitalize(), "color": "#6366f1", "prompts": [cat_key]}]
            elif isinstance(cls_data, dict):
                cls_list = [cls_data]
            elif isinstance(cls_data, list):
                cls_list = cls_data
            else:
                cls_list = [{"id": 0, "name": item.capitalize(), "color": "#6366f1", "prompts": [cat_key]}]

            primary_cls = cls_list[0] if cls_list else {"id": 0, "name": item.capitalize(), "color": "#6366f1"}
            proj_info = projects_meta.get(item, {})
            display_name = proj_info.get("display_name", primary_cls.get("name", item.capitalize()))
            sample_img = f"/api/image-file?category={item}&filename={img_files[0]}" if img_files else None

            categories.append({
                "id": item,
                "name": display_name,
                "description": proj_info.get("description", f"{item.capitalize()} nesne tespit veri seti"),
                "default_class_id": primary_cls.get("id", 0),
                "color": primary_cls.get("color", "#6366f1"),
                "image_count": img_count,
                "label_count": label_count,
                "percent": round((label_count / img_count * 100), 1) if img_count > 0 else 0,
                "sample_image": sample_img,
                "classes": cls_list,
                "visibility": proj_info.get("visibility", "public"),
                "license": proj_info.get("license", "CC BY 4.0"),
                "project_type": proj_info.get("project_type", "detection"),
            })
    return sorted(categories, key=lambda x: x["id"])

# =====================================================
# API ROUTES
# =====================================================

@app.api_route("/api/ext/activate", methods=["GET", "POST"])
def ext_activate():
    return {"status": "ok"}

@app.get("/api/projects")
def get_projects():
    """Return all projects/datasets with full statistics and metadata for the Dashboard."""
    cats = get_categories()
    config = load_project_config()
    return {
        "projects": cats,
        "classes": config.get("classes", DEFAULT_CLASS_MAPPING)
    }

# ─────────────────────────────────────────────────────────────────────────────
# WORKSPACE ASSET LIBRARY & AI AGENT ASSISTANT ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

# =====================================================
# MULTI-PROVIDER AI LLM CALLERS (GEMINI 3.6 FLASH, OPENAI GPT-4o, GROQ QWEN)
# =====================================================

def _call_gemini_llm(user_prompt: str, image_bytes: Optional[bytes] = None) -> Optional[str]:
    """Call Google Gemini 3.6 Flash using primary + backup keys."""
    settings = _load_settings()
    primary = settings.get("gemini_api_key", "")
    backups = settings.get("gemini_backup_keys", [])
    keys = [k for k in [primary] + backups if k]
    if not keys:
        return None

    for key in keys:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={key}"
            parts = []
            if image_bytes:
                import base64
                parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64.b64encode(image_bytes).decode("utf-8")
                    }
                })
            parts.append({"text": user_prompt})

            req_data = json.dumps({"contents": [{"parts": parts}]}).encode("utf-8")
            req = _urllib_req.Request(url, data=req_data, headers={"Content-Type": "application/json"})
            with _urllib_req.urlopen(req, timeout=14) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"]
        except Exception:
            continue
    return None

def _call_openai_llm(user_prompt: str, image_bytes: Optional[bytes] = None) -> Optional[str]:
    """Call OpenAI GPT-4o-mini using primary + backup keys."""
    settings = _load_settings()
    primary = settings.get("openai_api_key", "")
    backups = settings.get("openai_backup_keys", [])
    keys = [k for k in [primary] + backups if k]
    if not keys:
        return None

    for key in keys:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            msg_content = []
            if image_bytes:
                import base64
                b64_str = base64.b64encode(image_bytes).decode("utf-8")
                msg_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64_str}"}
                })
            msg_content.append({"type": "text", "text": user_prompt})

            req_data = json.dumps({
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": msg_content}],
                "max_tokens": 1024
            }).encode("utf-8")

            req = _urllib_req.Request(url, data=req_data, headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            })
            with _urllib_req.urlopen(req, timeout=14) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except Exception:
            continue
    return None

def _call_groq_llm(user_prompt: str) -> Optional[str]:
    """Call Groq Qwen 3.6 27B Versatile using primary + backup keys."""
    settings = _load_settings()
    primary = settings.get("groq_api_key", "")
    backups = settings.get("groq_backup_keys", [])
    keys = [k for k in [primary] + backups if k]
    if not keys:
        return None

    for key in keys:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            req_data = json.dumps({
                "model": "qwen/qwen3.6-27b",
                "messages": [{"role": "user", "content": user_prompt}],
                "max_tokens": 1024
            }).encode("utf-8")

            req = _urllib_req.Request(url, data=req_data, headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            })
            with _urllib_req.urlopen(req, timeout=14) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except Exception:
            continue
    return None

def query_multi_ai_chat(prompt: str, image_bytes: Optional[bytes] = None) -> tuple[Optional[str], str]:
    """
    Intelligent LLM Router with failover across API key pools:
    1. Google Gemini 3.6 Flash (Primary)
    2. OpenAI GPT-4o-mini
    3. Groq Qwen 3.6 27B
    """
    system_instruction = (
        "Sen 'YOLO AI Asistan'sın. Bilgisayarlı görü (Computer Vision), YOLOv8, YOLOWorld ve nesne tespiti konularında uzman bir yapay zekasın.\n"
        "Kurallar:\n"
        "1. Kullanıcı selam verdiğinde, sohbet ettiğinde veya genel soru sorduğunda ASLA zorla proje/sınıf üretme. Doğal, samimi ve yardımsever Türkçe konuş.\n"
        "2. Kullanıcı bir görsel yüklediyse görseli detaylıca incele, gördüğün nesneleri ve detayları açıkla.\n"
        "3. Kullanıcı AÇIKÇA bir nesne tespit veya etiketleme projesi oluşturmak istediğini belirtirse yanıtının sonunda şu JSON bloğunu ekle:\n"
        "```json_blueprint\n"
        "{\n"
        "  \"name\": \"Proje Adı\",\n"
        "  \"description\": \"Açıklama\",\n"
        "  \"classes\": [{\"name\": \"Person\", \"color\": \"#3b82f6\", \"prompts\": [\"person\"]}]\n"
        "}\n"
        "```\n"
        "Eğer kullanıcı sadece sohbet ediyorsa veya bilgi istiyorsa json_blueprint bloğunu EKLEME."
    )
    full_prompt = f"{system_instruction}\n\nKullanıcı: {prompt}"

    # Try 1: Gemini 3.6 Flash
    res = _call_gemini_llm(full_prompt, image_bytes)
    if res: return res, "Google Gemini 3.6 Flash"

    # Try 2: OpenAI GPT-4o
    res = _call_openai_llm(full_prompt, image_bytes)
    if res: return res, "OpenAI GPT-4o"

    # Try 3: Groq Qwen
    res = _call_groq_llm(full_prompt)
    if res: return res, "Groq Qwen 3.6"

    return None, "local_ai"

# ─────────────────────────────────────────────────────────────────────────────
# WORKSPACE ASSET LIBRARY & AI AGENT ASSISTANT ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

class AgentSuggestRequest(BaseModel):
    prompt: str
    image_base64: Optional[str] = None
    image_name: Optional[str] = None
    provider: Optional[str] = None

@app.post("/api/agent/suggest")
def agent_suggest(req: AgentSuggestRequest):
    """
    AI Agent powered by Gemini 3.6 Flash, OpenAI & Groq APIs.
    """
    p = req.prompt.strip()
    img_bytes = None
    if req.image_base64:
        try:
            import base64
            img_data = req.image_base64
            if "," in img_data:
                img_data = img_data.split(",")[1]
            img_bytes = base64.b64decode(img_data)
        except Exception:
            pass

    # 1. Ask Multi-Provider LLM Engine
    llm_response, engine_name = query_multi_ai_chat(p or "Yüklediğim görseli incele ve içinde neler gördüğünü açıkla.", img_bytes)
    
    if not llm_response:
        # Fallback if API offline
        llm_response = f"Merhaba! Ben YOLO AI Asistan. Size nesne tespiti, veri seti hazırlama ve etiketleme konularında nasıl yardımcı olabilirim?"
        engine_name = "YOLO AI Asistan"

    # 2. Check if LLM included a json_blueprint block
    if "```json_blueprint" in llm_response:
        try:
            parts = llm_response.split("```json_blueprint")
            text_reply = parts[0].strip()
            json_str = parts[1].split("```")[0].strip()
            bp_data = json.loads(json_str)

            folder_slug = re.sub(r'[^a-z0-9_]', '_', bp_data.get("name", "custom_project").lower()).strip('_')
            classes = []
            palette = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"]
            for idx, c in enumerate(bp_data.get("classes", [])):
                classes.append({
                    "id": idx,
                    "name": c.get("name", f"Class_{idx}"),
                    "color": c.get("color", palette[idx % len(palette)]),
                    "prompts": c.get("prompts", [c.get("name", "").lower()])
                })

            blueprint = {
                "name": bp_data.get("name", "AI Nesne Tespiti"),
                "folder": folder_slug or "ai_project",
                "type": "detection",
                "classes": classes,
                "description": bp_data.get("description", "Yapay zeka tarafından hazırlanan proje.")
            }

            return {
                "status": "ok",
                "type": "blueprint",
                "source": engine_name,
                "blueprint": blueprint,
                "message": text_reply or f"Harika! İsteğinizi inceledim ve projeniz için uygun sınıfları hazırladım:"
            }
        except Exception:
            pass

    # 3. Standard natural chat response (No forced blueprint)
    return {
        "status": "ok",
        "type": "chat",
        "source": engine_name,
        "message": llm_response
    }


@app.get("/api/workspace/assets")
def get_workspace_assets(
    category: Optional[str] = None,
    filter_status: str = "all",  # "all", "labeled", "unlabeled"
    search: Optional[str] = None,
    limit: int = 200
):
    """Return all images across the entire workspace for Asset Library."""
    cats = get_categories()
    valid_cats = [c["id"] for c in cats]
    target_cats = [category] if category and category in valid_cats else valid_cats

    all_assets = []
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    for cat_id in target_cats:
        cat_dir = ROOT_DIR / cat_id
        labels_dir = ROOT_DIR / f"{cat_id}_labeled" / "labels"
        if not cat_dir.exists() or not cat_dir.is_dir():
            continue

        cat_name = next((c["name"] for c in cats if c["id"] == cat_id), cat_id)

        for f in os.listdir(cat_dir):
            ext = os.path.splitext(f)[1].lower()
            if ext not in valid_extensions:
                continue

            if search and search.lower() not in f.lower():
                continue

            txt_file = labels_dir / f"{os.path.splitext(f)[0]}.txt"
            has_labels = False
            box_count = 0
            if txt_file.exists() and txt_file.stat().st_size > 0:
                try:
                    with open(txt_file, "r") as tf:
                        lines = [l.strip() for l in tf if l.strip()]
                        box_count = len(lines)
                        has_labels = box_count > 0
                except Exception:
                    pass

            if filter_status == "labeled" and not has_labels:
                continue
            if filter_status == "unlabeled" and has_labels:
                continue

            all_assets.append({
                "filename": f,
                "project_id": cat_id,
                "project_name": cat_name,
                "has_labels": has_labels,
                "box_count": box_count,
                "preview_url": f"/api/preview-file?category={cat_id}&filename={urllib.parse.quote(f)}" if has_labels else f"/api/image-file?category={cat_id}&filename={urllib.parse.quote(f)}",
                "image_url": f"/api/image-file?category={cat_id}&filename={urllib.parse.quote(f)}"
            })

            if len(all_assets) >= limit:
                break
        if len(all_assets) >= limit:
            break

    return {
        "status": "ok",
        "total": len(all_assets),
        "assets": all_assets
    }


@app.get("/api/workspace/stats")
def get_workspace_stats():
    """Return aggregate statistics for the entire workspace."""
    cats = get_categories()
    total_projects = len(cats)
    total_images = sum(c.get("image_count", 0) for c in cats)
    total_labeled = sum(c.get("label_count", 0) for c in cats)
    pct = round((total_labeled / total_images * 100), 1) if total_images > 0 else 0

    return {
        "total_projects": total_projects,
        "total_images": total_images,
        "total_labeled": total_labeled,
        "completion_rate": pct,
        "workspace_name": "MODAIs Workspace",
        "plan": "Community Plan",
        "credits": "16 / 15 Credits",
        "storage": f"{total_images * 0.4:.1f} MB / 10 GB"
    }


@app.post("/api/projects/create")
def create_project(req: CreateProjectRequest):
    """Create a new dataset project folder with standardized class definitions."""
    folder_name = req.folder_name.strip().lower().replace(" ", "_")
    if not folder_name:
        raise HTTPException(status_code=400, detail="Gecerli bir klasor adi giriniz.")

    proj_dir = ROOT_DIR / folder_name
    labels_dir = ROOT_DIR / f"{folder_name}_labeled" / "labels"
    previews_dir = ROOT_DIR / f"{folder_name}_labeled" / "previews"

    proj_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    config = load_project_config()
    config.setdefault("projects", {})[folder_name] = {
        "display_name": req.display_name or folder_name.replace("_", " ").capitalize(),
        "description": req.description or "",
        "visibility": req.visibility if req.visibility in ("public", "private") else "public",
        "license": req.license or "CC BY 4.0",
        "project_type": req.project_type if req.project_type in ("detection", "classification") else "detection",
        "ai_settings": {"conf": 0.15, "iou": 0.50},
        "model_key": DEFAULT_MODEL_KEY,
    }

    # Always store classes as list[dict] with IDs normalized from 0
    if req.classes:
        cls_list = req.classes if isinstance(req.classes, list) else [req.classes]
        # Normalize IDs to 0,1,2...
        normalized = []
        for i, cls in enumerate(cls_list):
            normalized.append({
                "id": i,
                "name": cls.get("name", f"Class_{i}"),
                "color": cls.get("color", ["#3b82f6","#10b981","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316"][i % 7]),
                "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()],
            })
        config.setdefault("classes", {})[folder_name] = normalized
    else:
        # Default: single class named after folder
        config.setdefault("classes", {})[folder_name] = [{
            "id": 0,
            "name": folder_name.replace("_", " ").capitalize(),
            "color": "#6366f1",
            "prompts": [folder_name.replace("_", " ").lower()],
        }]

    save_project_config(config)
    return {
        "status": "ok",
        "project_id": folder_name,
        "classes": config["classes"][folder_name],
    }

@app.post("/api/projects/upload-images")
async def upload_project_images(
    category: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """
    Securely upload and deeply validate images and YOLO label files (.txt).
    Blocks malformed images, decompression bombs, script injections, and path traversal.
    """
    clean_category = _sanitize_filename(category).lower().replace(" ", "_")
    cat_dir = ROOT_DIR / clean_category
    cat_dir.mkdir(parents=True, exist_ok=True)
    
    labels_dir = ROOT_DIR / f"{clean_category}_labeled" / "labels"
    previews_dir = ROOT_DIR / f"{clean_category}_labeled" / "previews"
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    if len(files) > MAX_BATCH_UPLOAD_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Tek seferde en fazla {MAX_BATCH_UPLOAD_COUNT} dosya yukleyebilirsiniz."
        )

    valid_img_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    saved_images = 0
    saved_labels = 0
    rejected_files = 0

    for file in files:
        raw_name = file.filename or "upload"
        fname = _sanitize_filename(raw_name)
        ext = Path(fname).suffix.lower()

        try:
            content = await file.read()
            if len(content) > MAX_FILE_SIZE_BYTES or len(content) == 0:
                rejected_files += 1
                continue

            if ext in valid_img_extensions:
                # Deep image verification
                if _validate_image_bytes(content):
                    target_path = cat_dir / fname
                    with open(target_path, "wb") as buffer:
                        buffer.write(content)
                    saved_images += 1
                else:
                    rejected_files += 1

            elif ext == ".txt":
                # Strict YOLO label verification
                if fname.lower() not in {"readme.txt", "requirements.txt", "notes.txt"}:
                    validated_lines = _validate_yolo_label_bytes(content)
                    if validated_lines is not None:
                        target_path = labels_dir / fname
                        with open(target_path, "w", encoding="utf-8") as buffer:
                            buffer.writelines(validated_lines)
                        saved_labels += 1
                    else:
                        rejected_files += 1
            else:
                rejected_files += 1

        except Exception:
            rejected_files += 1
        finally:
            await file.close()

    return {
        "status": "ok",
        "category": clean_category,
        "uploaded_count": saved_images,
        "uploaded_labels": saved_labels,
        "rejected_count": rejected_files,
        "message": f"{saved_images} resim ve {saved_labels} etiket guvenle tarandi ve kaydedildi."
    }

@app.post("/api/projects/delete")
def delete_project(req: DeleteProjectRequest):
    """Delete a project metadata and optionally its images & labels from disk."""
    cat_name = req.category.strip()
    if not cat_name:
        raise HTTPException(status_code=400, detail="Geçerli bir kategori/proje adı belirtiniz.")
        
    config = load_project_config()
    cat_key = cat_name.lower()
    
    if "projects" in config and cat_name in config["projects"]:
        del config["projects"][cat_name]
    if "classes" in config and cat_key in config["classes"]:
        del config["classes"][cat_key]
    save_project_config(config)
    
    if req.delete_files:
        cat_dir = ROOT_DIR / cat_name
        labeled_dir = ROOT_DIR / f"{cat_name}_labeled"
        try:
            if cat_dir.exists() and cat_dir.is_dir():
                shutil.rmtree(cat_dir, ignore_errors=True)
            if labeled_dir.exists() and labeled_dir.is_dir():
                shutil.rmtree(labeled_dir, ignore_errors=True)
        except Exception:
            pass
            
    return {"status": "ok", "deleted_category": cat_name}

@app.post("/api/projects/update-classes")
def update_project_classes(req: UpdateClassesRequest):
    """Update class names, colors, and AI prompts for a project (always list[dict])."""
    config = load_project_config()
    if not config.get("classes"):
        config["classes"] = DEFAULT_CLASS_MAPPING.copy()

    cls_list = req.classes if isinstance(req.classes, list) else [req.classes]
    # Re-normalize IDs
    normalized = []
    for i, cls in enumerate(cls_list):
        normalized.append({
            "id": i,
            "name": cls.get("name", f"Class_{i}"),
            "color": cls.get("color", "#6366f1"),
            "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()],
        })
    config["classes"][req.category.lower()] = normalized
    save_project_config(config)
    return {"status": "ok", "category": req.category, "classes": normalized}

@app.get("/api/project-settings")
def get_project_settings(category: str = Query(...)):
    cat_dir = ROOT_DIR / category
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje klasörü bulunamadı.")
    
    config = load_project_config()
    projects_meta = config.get("projects", {})
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    
    cat_key = category.lower()
    proj_info = projects_meta.get(category, {})
    
    cls_data = classes_map.get(cat_key)
    if not cls_data:
        cls_data = [{"id": 0, "name": category.capitalize(), "color": "#6366f1", "prompts": [cat_key]}]
    elif isinstance(cls_data, dict):
        cls_data = [cls_data]
        
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    img_files = [f for f in os.listdir(cat_dir) if os.path.splitext(f)[1].lower() in valid_extensions]
    
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    label_count = 0
    box_total = 0
    class_distribution = {}
    
    if labels_dir.exists():
        for txt in labels_dir.iterdir():
            if txt.suffix == ".txt" and txt.stat().st_size > 0:
                label_count += 1
                try:
                    with open(txt, "r", encoding="utf-8") as f:
                        for l in f:
                            parts = l.strip().split()
                            if parts:
                                c_id = int(parts[0])
                                box_total += 1
                                class_distribution[c_id] = class_distribution.get(c_id, 0) + 1
                except Exception:
                    pass

    return {
        "status": "ok",
        "category": category,
        "display_name": proj_info.get("display_name", category.capitalize()),
        "description": proj_info.get("description", f"{category.capitalize()} nesne tespit veri seti"),
        "total_images": len(img_files),
        "labeled_images": label_count,
        "empty_images": len(img_files) - label_count,
        "total_boxes": box_total,
        "classes": cls_data,
        "class_distribution": class_distribution,
        "all_global_classes": classes_map,
        "ai_settings": proj_info.get("ai_settings", {"conf": 0.25, "iou": 0.45})
    }

@app.post("/api/project-settings/save")
def save_project_settings(req: ProjectSettingsSaveRequest):
    config = load_project_config()
    cat_key = req.category.lower()

    config.setdefault("projects", {})[req.category] = {
        "display_name": req.display_name,
        "description": req.description or "",
        "ai_settings": {
            "conf": req.ai_conf or 0.15,
            "iou": req.ai_iou or 0.50,
        },
        "model_key": config.get("projects", {}).get(req.category, {}).get("model_key", DEFAULT_MODEL_KEY),
    }

    if not config.get("classes"):
        config["classes"] = DEFAULT_CLASS_MAPPING.copy()

    # Always save as list[dict] with normalized IDs
    cls_list = req.classes if isinstance(req.classes, list) else [req.classes]
    normalized = []
    for i, cls in enumerate(cls_list):
        normalized.append({
            "id": i,
            "name": cls.get("name", f"Class_{i}"),
            "color": cls.get("color", "#6366f1"),
            "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()],
        })
    config["classes"][cat_key] = normalized
    save_project_config(config)
    return {"status": "ok", "category": req.category, "classes": normalized}

@app.get("/api/categories")
def list_categories():
    config = load_project_config()
    return {"categories": get_categories(), "classes": config.get("classes", DEFAULT_CLASS_MAPPING)}

@app.get("/api/images")
def list_images(category: str = Query(...)):
    cat_dir = ROOT_DIR / category
    if not cat_dir.exists() or not cat_dir.is_dir():
        raise HTTPException(status_code=404, detail="Kategori klasoru bulunamadi.")

    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    images = []

    # Build a case-insensitive stem → label path lookup
    label_map: Dict[str, Path] = {}
    if labels_dir.exists():
        for txt in labels_dir.iterdir():
            if txt.suffix == ".txt":
                label_map[txt.stem.lower()] = txt

    all_files = sorted(os.listdir(cat_dir))
    for fname in all_files:
        ext = os.path.splitext(fname)[1].lower()
        if ext in valid_extensions:
            stem = os.path.splitext(fname)[0]
            txt_path = label_map.get(stem.lower())  # case-insensitive

            has_label = False
            box_count = 0
            if txt_path is not None and txt_path.exists():
                has_label = True
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = [line.strip() for line in f if line.strip()]
                        box_count = len(lines)
                except Exception:
                    pass

            images.append({
                "filename": fname,
                "stem": stem,
                "has_label_file": has_label,
                "box_count": box_count,
            })
            
    labeled_count = sum(1 for img in images if img["box_count"] > 0)
    return {
        "category": category,
        "total_images": len(images),
        "labeled_count": labeled_count,
        "images": images
    }

@app.get("/api/image-file")
def get_image_file(category: str = Query(...), filename: str = Query(...)):
    img_path = ROOT_DIR / category / filename
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Resim bulunamadı.")
    return FileResponse(str(img_path))

@app.get("/api/label-data")
def get_label_data(category: str = Query(...), filename: str = Query(...)):
    stem = os.path.splitext(filename)[0]
    txt_path = ROOT_DIR / f"{category}_labeled" / "labels" / f"{stem}.txt"
    
    config = load_project_config()
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)

    boxes = []
    if txt_path.exists():
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cls_id = int(parts[0])
                        xc = float(parts[1])
                        yc = float(parts[2])
                        w = float(parts[3])
                        h = float(parts[4])
                        
                        cls_name = f"Class {cls_id}"
                        for k, v in classes_map.items():
                            if isinstance(v, dict) and v.get("id") == cls_id:
                                cls_name = v.get("name", cls_name)
                                break
                        
                        boxes.append({
                            "class_id": cls_id,
                            "class_name": cls_name,
                            "x_center": xc,
                            "y_center": yc,
                            "width": w,
                            "height": h
                        })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Etiket okuma hatası: {str(e)}")
            
    return {
        "filename": filename,
        "stem": stem,
        "exists": txt_path.exists(),
        "boxes": boxes
    }

@app.post("/api/save-label")
def save_label(req: SaveLabelRequest):
    try:
        labeled_dir = ROOT_DIR / f"{req.category}_labeled"
        labels_dir = labeled_dir / "labels"
        labels_dir.mkdir(parents=True, exist_ok=True)
        
        stem = os.path.splitext(req.image_filename)[0]
        txt_path = labels_dir / f"{stem}.txt"
        
        with open(txt_path, "w", encoding="utf-8") as f:
            for b in req.boxes:
                w = max(0.001, min(1.0, float(b.width)))
                h = max(0.001, min(1.0, float(b.height)))
                xc = max(w / 2.0, min(1.0 - w / 2.0, float(b.x_center)))
                yc = max(h / 2.0, min(1.0 - h / 2.0, float(b.y_center)))
                f.write(f"{b.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                
        # Update preview image if requested
        if req.update_preview:
            previews_dir = labeled_dir / "previews"
            previews_dir.mkdir(parents=True, exist_ok=True)
            img_path = ROOT_DIR / req.category / req.image_filename
            if img_path.exists():
                img = load_image_rgb(img_path)
                if img is not None:
                    img_h, img_w = img.shape[:2]
                    for b in req.boxes:
                        x1 = int((b.x_center - b.width / 2) * img_w)
                        y1 = int((b.y_center - b.height / 2) * img_h)
                        x2 = int((b.x_center + b.width / 2) * img_w)
                        y2 = int((b.y_center + b.height / 2) * img_h)
                        
                        x1 = max(0, min(img_w - 1, x1))
                        y1 = max(0, min(img_h - 1, y1))
                        x2 = max(0, min(img_w - 1, x2))
                        y2 = max(0, min(img_h - 1, y2))
                        
                        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.putText(img, f"{b.class_id}", (x1, max(20, y1 - 6)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    preview_file = previews_dir / f"{stem}.jpg"
                    save_image_preview(preview_file, img)
                    
        return {"status": "ok", "saved_boxes": len(req.boxes), "file": str(txt_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Etiket kaydetme hatası: {str(e)}")

@app.post("/api/delete-image")
def delete_image(req: DeleteImageRequest):
    """Delete an image file and its corresponding label (.txt) and preview (.jpg) files if labeled."""
    cat = req.category
    fname = req.filename
    stem = os.path.splitext(fname)[0]

    img_path = ROOT_DIR / cat / fname
    txt_path = ROOT_DIR / f"{cat}_labeled" / "labels" / f"{stem}.txt"
    preview_path = ROOT_DIR / f"{cat}_labeled" / "previews" / f"{stem}.jpg"

    deleted_files = []
    if img_path.exists():
        try:
            img_path.unlink()
            deleted_files.append(str(img_path))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Resim dosyası silinemedi: {str(e)}")

    if txt_path.exists():
        try:
            txt_path.unlink()
            deleted_files.append(str(txt_path))
        except Exception:
            pass

    if preview_path.exists():
        try:
            preview_path.unlink()
            deleted_files.append(str(preview_path))
        except Exception:
            pass

    return {
        "status": "ok",
        "category": cat,
        "filename": fname,
        "deleted_count": len(deleted_files)
    }

@app.get("/api/stats")
def get_stats():
    """Return per-category dataset statistics."""
    config = load_project_config()
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    return {"stats": get_categories(), "classes": classes_map}

# =====================================================
# AI INFO ENDPOINT
# =====================================================

@app.get("/api/ai-info")
def get_ai_info():
    """Return active AI model info, device, and available models."""
    active_models = []
    for k, cached in _MODEL_CACHE.items():
        model_key = k.split("::")[0]
        info = MODEL_REGISTRY.get(model_key, {})
        active_models.append({"key": model_key, "label": info.get("label", model_key)})

    device_label = _ACTIVE_DEVICE
    gpu_info = None
    try:
        import torch
        if torch.cuda.is_available():
            gpu_info = {
                "name": torch.cuda.get_device_name(0),
                "vram_total_mb": round(torch.cuda.get_device_properties(0).total_memory / 1024**2),
                "vram_free_mb": round((torch.cuda.get_device_properties(0).total_memory
                                       - torch.cuda.memory_allocated(0)) / 1024**2),
            }
    except Exception:
        pass

    return {
        "status": "ok",
        "device": device_label,
        "gpu_info": gpu_info,
        "loaded_models": active_models,
        "available_models": [
            {"key": k, **{f: v for f, v in info.items() if f != "filename"},
             "downloaded": (ROOT_DIR / info["filename"]).exists()}
            for k, info in MODEL_REGISTRY.items()
        ],
        "default_model": DEFAULT_MODEL_KEY,
    }


# =====================================================
# AI AUTO-LABELING ENDPOINTS (Single & Batch)
# =====================================================

@app.post("/api/auto-label-image")
def auto_label_image(req: AutoLabelRequest):
    """Run AI detection on a single image using Soft-NMS and return predicted boxes."""
    img_path = ROOT_DIR / req.category / req.image_filename
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Resim bulunamadi.")

    config = load_project_config()
    proj_meta = config.get("projects", {}).get(req.category, {})
    ai_settings = proj_meta.get("ai_settings", {})
    model_key = proj_meta.get("model_key", DEFAULT_MODEL_KEY)

    cls_list = _resolve_cls_list(req.category, config)
    all_prompts, prompt_to_class = _build_prompt_map(cls_list)
    if not all_prompts:
        all_prompts = [req.category.lower()]
        prompt_to_class[req.category.lower()] = (0, req.category.capitalize())

    conf_thresh = min(req.conf_threshold, float(ai_settings.get("conf", 0.07)))
    iou_thresh = float(ai_settings.get("iou", 0.50))

    boxes = []
    try:
        img = load_image_rgb(img_path)
        if img is None:
            raise ValueError(f"Gorsel acilamadi: {img_path}")

        h_img, w_img = img.shape[:2]
        imgsz = _get_imgsz(h_img, w_img)

        model, used_key = get_ai_model(model_key)
        _set_classes_if_changed(model, all_prompts)

        results = model.predict(img, conf=conf_thresh, imgsz=imgsz, verbose=False)[0]
        if results.boxes is not None and len(results.boxes) > 0:
            xyxyn = results.boxes.xyxyn.cpu().numpy().copy()
            confs = results.boxes.conf.cpu().numpy()
            cls_indices = results.boxes.cls.cpu().numpy().astype(int)

            kept_idx = _filter_boxes(xyxyn, confs, cls_indices,
                                     iou_thresh=iou_thresh, min_area=0.0004,
                                     max_aspect=12.0, sigma_soft=0.5)

            for i in kept_idx:
                x1, y1, x2, y2 = xyxyn[i]
                w = float(x2 - x1)
                h = float(y2 - y1)
                xc = float((x1 + x2) / 2.0)
                yc = float((y1 + y2) / 2.0)
                w = max(0.001, min(1.0, w))
                h = max(0.001, min(1.0, h))
                xc = max(w / 2.0, min(1.0 - w / 2.0, xc))
                yc = max(h / 2.0, min(1.0 - h / 2.0, yc))
                p_idx = cls_indices[i]
                p_name = all_prompts[p_idx] if p_idx < len(all_prompts) else all_prompts[0]
                c_id, c_name = prompt_to_class.get(p_name,
                    (cls_list[0].get("id", 0), cls_list[0].get("name", req.category.capitalize())))
                boxes.append({
                    "class_id": c_id,
                    "class_name": c_name,
                    "x_center": round(xc, 6),
                    "y_center": round(yc, 6),
                    "width": round(w, 6),
                    "height": round(h, 6),
                    "confidence": round(float(confs[i]), 3)
                })

        return {
            "status": "ok",
            "category": req.category,
            "filename": req.image_filename,
            "model_used": used_key,
            "device": _ACTIVE_DEVICE,
            "detected_count": len(boxes),
            "boxes": boxes
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI etiketleme hatasi: {str(e)}")


def _run_batch_auto_label_thread(
    category: str,
    conf_threshold: float,
    overwrite: bool,
    prompts: Optional[List[str]],
    model_key: Optional[str] = None,
    empty_only: bool = False,
):
    """Background worker thread for batch auto-labeling a category."""
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    previews_dir = ROOT_DIR / f"{category}_labeled" / "previews"
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    # Error log file
    error_log = ROOT_DIR / f"{category}_labeled" / "batch_errors.log"

    config = load_project_config()
    proj_meta = config.get("projects", {}).get(category, {})
    ai_settings = proj_meta.get("ai_settings", {})
    if model_key is None:
        model_key = proj_meta.get("model_key", DEFAULT_MODEL_KEY)

    cls_list = _resolve_cls_list(category, config)

    if prompts and len(prompts) > 0:
        all_prompts = [p.strip().lower() for p in prompts if p.strip()]
        prompt_to_class = {p: (cls_list[0].get("id", 0), cls_list[0].get("name", category.capitalize()))
                           for p in all_prompts}
    else:
        all_prompts, prompt_to_class = _build_prompt_map(cls_list)

    if not all_prompts:
        all_prompts = [category.lower()]
        prompt_to_class[category.lower()] = (0, category.capitalize())

    iou_thresh = float(ai_settings.get("iou", 0.50))

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_files = sorted([f for f in os.listdir(cat_dir)
                        if os.path.splitext(f)[1].lower() in valid_extensions])

    # Filter list based on options
    if empty_only:
        img_files = [f for f in all_files
                     if not (labels_dir / f"{os.path.splitext(f)[0]}.txt").exists()
                     or (labels_dir / f"{os.path.splitext(f)[0]}.txt").stat().st_size == 0]
    elif not overwrite:
        img_files = [f for f in all_files
                     if not (labels_dir / f"{os.path.splitext(f)[0]}.txt").exists()
                     or (labels_dir / f"{os.path.splitext(f)[0]}.txt").stat().st_size == 0]
    else:
        img_files = all_files

    BATCH_JOBS[category] = {
        "status": "running",
        "current": 0,
        "total": len(img_files),
        "newly_labeled": 0,
        "skipped": len(all_files) - len(img_files),
        "errors": 0,
        "stop_requested": False,
        "start_time": time.time(),
        "eta_seconds": None,
        "speed_img_per_sec": None,
        "model_key": model_key,
        "device": _ACTIVE_DEVICE,
    }

    error_lines = []
    try:
        model, used_key = get_ai_model(model_key)
        _set_classes_if_changed(model, all_prompts)
        BATCH_JOBS[category]["model_key"] = used_key

        t_start = time.time()
        for idx, fname in enumerate(img_files):
            if BATCH_JOBS[category].get("stop_requested"):
                BATCH_JOBS[category]["status"] = "stopped"
                break

            stem = os.path.splitext(fname)[0]
            txt_path = labels_dir / f"{stem}.txt"
            img_path = cat_dir / fname

            try:
                img = load_image_rgb(img_path)
                if img is None:
                    raise ValueError("Gorsel yuklenemedi")

                h_img, w_img = img.shape[:2]
                imgsz = _get_imgsz(h_img, w_img)

                results = model.predict(img, conf=conf_threshold, imgsz=imgsz, verbose=False)[0]
                lines = []
                if results.boxes is not None and len(results.boxes) > 0:
                    xyxyn = results.boxes.xyxyn.cpu().numpy().copy()
                    confs_b = results.boxes.conf.cpu().numpy()
                    cls_idx_b = results.boxes.cls.cpu().numpy().astype(int)

                    kept_idx = _filter_boxes(xyxyn, confs_b, cls_idx_b,
                                             iou_thresh=iou_thresh, min_area=0.0004,
                                             max_aspect=12.0, sigma_soft=0.5)

                    for ki in kept_idx:
                        x1, y1, x2, y2 = xyxyn[ki]
                        w = float(x2 - x1)
                        h = float(y2 - y1)
                        xc = float((x1 + x2) / 2.0)
                        yc = float((y1 + y2) / 2.0)
                        p_idx = cls_idx_b[ki]
                        p_name = all_prompts[p_idx] if p_idx < len(all_prompts) else all_prompts[0]
                        c_id, _ = prompt_to_class.get(p_name,
                            (cls_list[0].get("id", 0), cls_list[0].get("name", category.capitalize())))
                        lines.append(f"{c_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")

                with open(txt_path, "w", encoding="utf-8") as f:
                    f.writelines(lines)

                if lines:
                    BATCH_JOBS[category]["newly_labeled"] += 1

                    # Generate preview image with bounding boxes
                    try:
                        preview_img = img.copy()
                        config_snap = load_project_config()
                        cls_list_snap = _resolve_cls_list(category, config_snap)
                        cls_colors = {c.get("id", i): c.get("color", "#00ff00")
                                      for i, c in enumerate(cls_list_snap)}

                        def _hex_to_bgr(h: str):
                            h = h.lstrip("#")
                            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
                            return (b, g, r)

                        for line in lines:
                            parts = line.strip().split()
                            if len(parts) == 5:
                                c_id_p = int(parts[0])
                                xc_p, yc_p, w_p, h_p = map(float, parts[1:])
                                bx1 = int((xc_p - w_p / 2) * w_img)
                                by1 = int((yc_p - h_p / 2) * h_img)
                                bx2 = int((xc_p + w_p / 2) * w_img)
                                by2 = int((yc_p + h_p / 2) * h_img)
                                color_hex = cls_colors.get(c_id_p, "#00ff00")
                                bgr = _hex_to_bgr(color_hex)
                                cv2.rectangle(preview_img, (bx1, by1), (bx2, by2), bgr, 2)
                                cv2.putText(preview_img, str(c_id_p),
                                            (bx1 + 3, max(by1 + 18, 18)),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, bgr, 2)

                        preview_path = previews_dir / f"{stem}.jpg"
                        save_image_preview(preview_path, preview_img)
                    except Exception:
                        pass  # Preview failure never blocks labeling

            except Exception as ex:
                BATCH_JOBS[category]["errors"] += 1
                error_lines.append(f"{fname}: {ex}\n")

            BATCH_JOBS[category]["current"] = idx + 1

            # ETA calculation
            elapsed = time.time() - t_start
            if elapsed > 0 and (idx + 1) > 0:
                speed = (idx + 1) / elapsed
                remaining = len(img_files) - (idx + 1)
                BATCH_JOBS[category]["speed_img_per_sec"] = round(speed, 2)
                BATCH_JOBS[category]["eta_seconds"] = round(remaining / speed) if speed > 0 else None

        if BATCH_JOBS[category]["status"] != "stopped":
            BATCH_JOBS[category]["status"] = "completed"
            BATCH_JOBS[category]["eta_seconds"] = 0

        # Write error log
        if error_lines:
            with open(error_log, "w", encoding="utf-8") as f:
                f.writelines(error_lines)

    except Exception as e:
        BATCH_JOBS[category]["status"] = "failed"
        BATCH_JOBS[category]["error_msg"] = str(e)


@app.post("/api/projects/batch-auto-label")
def start_batch_auto_label(req: BatchAutoLabelRequest):
    """Start background asynchronous batch auto-labeling for a category."""
    cat_dir = ROOT_DIR / req.category
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Kategori klasoru bulunamadi.")

    job = BATCH_JOBS.get(req.category)
    if job and job.get("status") == "running":
        return {"status": "already_running", "job": job}

    thread = threading.Thread(
        target=_run_batch_auto_label_thread,
        args=(req.category, req.conf_threshold, req.overwrite_existing,
              req.prompts, req.model_key, req.empty_only),
        daemon=True
    )
    thread.start()
    return {"status": "started", "category": req.category}


@app.get("/api/projects/batch-status")
def get_batch_status(category: Optional[str] = None):
    """Return status of background batch auto-labeling jobs."""
    if category:
        job = dict(BATCH_JOBS.get(category, {"status": "idle"}))
        # Add human-readable ETA string
        eta = job.get("eta_seconds")
        if eta is not None and eta > 0:
            mins, secs = divmod(int(eta), 60)
            job["eta_str"] = f"{mins}d {secs}s" if mins else f"{secs}s"
        elif eta == 0:
            job["eta_str"] = "Tamamlandi"
        return job
    return BATCH_JOBS


@app.post("/api/projects/batch-stop")
def stop_batch_auto_label(category: str = Query(...)):
    """Request stopping a running batch auto-labeling job."""
    if category in BATCH_JOBS and BATCH_JOBS[category].get("status") == "running":
        BATCH_JOBS[category]["stop_requested"] = True
        return {"status": "stopping", "category": category}
    return {"status": "not_running", "category": category}


# =====================================================
# PROMPT SUGGESTER
# =====================================================

# Built-in prompt vocabulary for common object categories
_PROMPT_VOCAB: Dict[str, List[str]] = {
    "bag": ["bag", "handbag", "backpack", "tote bag", "shoulder bag", "purse",
            "clutch", "suitcase", "duffel bag", "messenger bag", "fanny pack"],
    "belt": ["belt", "leather belt", "waist belt", "strap", "buckle belt"],
    "shoe": ["shoe", "sneaker", "boot", "sandal", "heel", "loafer", "slipper",
             "running shoe", "oxford shoe", "dress shoe"],
    "hat": ["hat", "cap", "beanie", "fedora", "baseball cap", "beret", "helmet"],
    "watch": ["watch", "wristwatch", "smartwatch", "luxury watch", "digital watch"],
    "glasses": ["glasses", "sunglasses", "eyeglasses", "spectacles", "goggles"],
    "necklace": ["necklace", "pendant", "chain", "choker", "pearl necklace"],
    "ring": ["ring", "wedding ring", "engagement ring", "gold ring", "silver ring"],
    "scarf": ["scarf", "shawl", "muffler", "neck scarf", "winter scarf"],
    "tie": ["tie", "necktie", "bow tie", "suit tie"],
    "jacket": ["jacket", "coat", "blazer", "hoodie", "windbreaker", "leather jacket"],
    "shirt": ["shirt", "t-shirt", "blouse", "polo shirt", "dress shirt"],
    "pants": ["pants", "trousers", "jeans", "shorts", "leggings"],
    "dress": ["dress", "gown", "skirt", "midi dress", "maxi dress"],
    "phone": ["phone", "smartphone", "mobile phone", "cellphone", "iphone"],
    "laptop": ["laptop", "notebook", "computer", "macbook"],
    "bottle": ["bottle", "water bottle", "glass bottle", "plastic bottle"],
    "cup": ["cup", "mug", "coffee cup", "glass"],
    "chair": ["chair", "seat", "armchair", "office chair", "bar stool"],
    "table": ["table", "desk", "dining table", "coffee table"],
    "car": ["car", "vehicle", "automobile", "sedan", "suv"],
    "person": ["person", "human", "man", "woman", "pedestrian"],
    "cat": ["cat", "kitten", "feline"],
    "dog": ["dog", "puppy", "canine"],
}

@app.post("/api/suggest-prompts")
def suggest_prompts(req: SuggestPromptsRequest):
    """Suggest YOLOWorld-compatible prompts for a class based on its name."""
    query = req.class_name.strip().lower()
    existing = set(p.strip().lower() for p in (req.existing_prompts or []))

    suggestions = []

    # 1. Direct match in vocab
    if query in _PROMPT_VOCAB:
        suggestions = _PROMPT_VOCAB[query]
    else:
        # 2. Partial match
        for key, prompts in _PROMPT_VOCAB.items():
            if key in query or query in key:
                suggestions = prompts
                break

        # 3. No match: generate basic synonyms from class name
        if not suggestions:
            suggestions = [
                query,
                f"{query} object",
                f"a {query}",
                f"single {query}",
                f"{query} item",
            ]

    # Filter out already existing prompts
    new_suggestions = [p for p in suggestions if p not in existing]

    return {
        "status": "ok",
        "category": req.category,
        "class_name": req.class_name,
        "suggestions": new_suggestions[:15],
        "all_suggestions": suggestions[:15],
    }

# =====================================================
# DATASET EXPORT & ZIP
# =====================================================

@app.post("/api/projects/export-zip")
def export_dataset_zip(req: ExportZipRequest):
    """Split dataset into Train/Val splits, generate data.yaml, and package into a ZIP file."""
    cat = req.category
    cat_dir = ROOT_DIR / cat
    labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
    
    if not cat_dir.exists() or not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Kategori veya etiket klasörü bulunamadı.")

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    pairs = []
    
    for txt_file in labels_dir.glob("*.txt"):
        if txt_file.stat().st_size > 0:
            stem = txt_file.stem
            found_img = None
            for ext in valid_extensions:
                cand = cat_dir / f"{stem}{ext}"
                if cand.exists():
                    found_img = cand
                    break
            if found_img:
                pairs.append((found_img, txt_file))

    if len(pairs) == 0:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak etiketli görsel bulunamadı.")

    random.seed(42)
    random.shuffle(pairs)
    split_idx = int(len(pairs) * req.train_ratio)
    train_pairs = pairs[:split_idx]
    val_pairs = pairs[split_idx:]

    export_dir = ROOT_DIR / "exports" / f"{cat}_yolo_export"
    if export_dir.exists():
        shutil.rmtree(export_dir)

    for sub in ["images/train", "images/val", "labels/train", "labels/val"]:
        (export_dir / sub).mkdir(parents=True, exist_ok=True)

    for img_p, lbl_p in train_pairs:
        shutil.copy2(img_p, export_dir / "images/train" / img_p.name)
        shutil.copy2(lbl_p, export_dir / "labels/train" / lbl_p.name)

    for img_p, lbl_p in val_pairs:
        shutil.copy2(img_p, export_dir / "images/val" / img_p.name)
        shutil.copy2(lbl_p, export_dir / "labels/val" / lbl_p.name)

    # Generate data.yaml
    config = load_project_config()
    cls_raw = config.get("classes", DEFAULT_CLASS_MAPPING).get(cat.lower(), {"id": 0, "name": cat.capitalize()})
    if isinstance(cls_raw, list) and len(cls_raw) > 0:
        cls_list = cls_raw
    elif isinstance(cls_raw, dict):
        cls_list = [cls_raw]
    else:
        cls_list = [{"id": 0, "name": cat.capitalize()}]

    names_lines = [f"  {c.get('id', i)}: {c.get('name', f'Class_{i}')}" for i, c in enumerate(cls_list)]
    names_yaml = "\n".join(names_lines)

    yaml_content = f"""# YOLO Dataset Configuration
path: {cat}_dataset
train: images/train
val: images/val

names:
{names_yaml}
"""
    with open(export_dir / "data.yaml", "w", encoding="utf-8") as f:
        f.write(yaml_content)

    # Create ZIP archive
    zip_base = ROOT_DIR / "exports" / f"{cat}_yolo_dataset"
    zip_path = shutil.make_archive(str(zip_base), "zip", export_dir)
    zip_filename = os.path.basename(zip_path)
    file_size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 2)

    return {
        "status": "ok",
        "category": cat,
        "total_exported": len(pairs),
        "train_count": len(train_pairs),
        "val_count": len(val_pairs),
        "file_size_mb": file_size_mb,
        "download_url": f"/api/download-zip?filename={zip_filename}"
    }

@app.get("/api/download-zip")
def download_zip(filename: str = Query(...)):
    zip_path = ROOT_DIR / "exports" / filename
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP dosyası bulunamadı.")
    return FileResponse(str(zip_path), filename=filename, media_type="application/zip")

# =====================================================
# ADVANCED VISUAL SIMILARITY MATCHER (ORB + HOG + Template)
# =====================================================

def _orb_similarity(template_gray: np.ndarray, target_gray: np.ndarray) -> float:
    """ORB keypoint matching similarity (rotation & scale invariant)."""
    try:
        orb = cv2.ORB_create(nfeatures=500)
        kp1, des1 = orb.detectAndCompute(template_gray, None)
        kp2, des2 = orb.detectAndCompute(target_gray, None)
        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            return 0.0
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(des1, des2)
        if not matches:
            return 0.0
        matches = sorted(matches, key=lambda x: x.distance)
        good = [m for m in matches if m.distance < 64]
        score = len(good) / max(len(kp1), 1)
        return min(1.0, score)
    except Exception:
        return 0.0


def _hog_similarity(template_gray: np.ndarray, target_gray: np.ndarray) -> float:
    """HOG histogram similarity (illumination robust)."""
    try:
        size = (64, 64)
        t = cv2.resize(template_gray, size)
        c = cv2.resize(target_gray, size)
        h1 = cv2.calcHist([t], [0], None, [64], [0, 256])
        h2 = cv2.calcHist([c], [0], None, [64], [0, 256])
        cv2.normalize(h1, h1)
        cv2.normalize(h2, h2)
        score = float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))
        return max(0.0, score)
    except Exception:
        return 0.0


def _template_best_match(template_gray: np.ndarray, target_gray: np.ndarray,
                          target_w: int, target_h: int,
                          t_w: int, t_h: int,
                          threshold: float) -> Optional[Dict]:
    """Multi-scale template matching. Returns best match dict or None."""
    best_score = -1.0
    best_box = None
    for scale in [0.6, 0.75, 1.0, 1.25, 1.5]:
        sw = int(t_w * scale)
        sh = int(t_h * scale)
        if sw >= target_w or sh >= target_h or sw < 8 or sh < 8:
            continue
        scaled_t = cv2.resize(template_gray, (sw, sh))
        res = cv2.matchTemplate(target_gray, scaled_t, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)
        if max_val > best_score and max_val >= threshold:
            best_score = max_val
            mx1, my1 = max_loc
            mx2, my2 = mx1 + sw, my1 + sh
            best_box = {
                "x_center": round(((mx1 + mx2) / 2.0) / target_w, 6),
                "y_center": round(((my1 + my2) / 2.0) / target_h, 6),
                "width": round(sw / target_w, 6),
                "height": round(sh / target_h, 6),
                "template_score": round(max_val, 3),
            }
    return best_box


@app.post("/api/find-similar")
def find_similar_instances(req: FindSimilarRequest):
    """Find visually similar instances using ORB + HOG + template matching."""
    cat_dir = ROOT_DIR / req.category
    ref_path = cat_dir / req.ref_image
    if not ref_path.exists():
        raise HTTPException(status_code=404, detail="Referans gorsel bulunamadi.")

    ref_img = load_image_rgb(ref_path)
    if ref_img is None:
        raise HTTPException(status_code=400, detail="Referans gorsel yuklenemedi.")

    img_h, img_w = ref_img.shape[:2]
    x1 = max(0, int((req.box.x_center - req.box.width / 2) * img_w))
    y1 = max(0, int((req.box.y_center - req.box.height / 2) * img_h))
    x2 = min(img_w, int((req.box.x_center + req.box.width / 2) * img_w))
    y2 = min(img_h, int((req.box.y_center + req.box.height / 2) * img_h))

    if (x2 - x1) < 10 or (y2 - y1) < 10:
        raise HTTPException(status_code=400, detail="Referans kutu cok kucuk.")

    template = ref_img[y1:y2, x1:x2]
    t_h, t_w = template.shape[:2]
    template_gray = cv2.cvtColor(template, cv2.COLOR_RGB2GRAY)
    template_resized = cv2.resize(template_gray, (128, 128))  # for ORB

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_files = sorted([f for f in os.listdir(cat_dir)
                        if os.path.splitext(f)[1].lower() in valid_extensions])

    # Limit scan if max_results=0 means all, otherwise cap at max_results
    scan_files = all_files if req.max_results <= 0 else all_files[:max(req.max_results, 50)]

    matches = []
    method = req.method  # "orb", "hog", "template", "combined"

    for fname in scan_files:
        t_path = cat_dir / fname
        target_img = load_image_rgb(t_path)
        if target_img is None:
            continue

        target_h, target_w = target_img.shape[:2]
        target_gray = cv2.cvtColor(target_img, cv2.COLOR_RGB2GRAY)

        # --- Template matching (find location in target) ---
        tmpl_match = _template_best_match(
            template_gray, target_gray, target_w, target_h,
            t_w, t_h, threshold=req.min_similarity * 0.7
        )
        if tmpl_match is None:
            continue

        # --- Crop candidate region from target ---
        cx = tmpl_match["x_center"]
        cy = tmpl_match["y_center"]
        cw = tmpl_match["width"]
        ch = tmpl_match["height"]
        rx1 = max(0, int((cx - cw / 2) * target_w))
        ry1 = max(0, int((cy - ch / 2) * target_h))
        rx2 = min(target_w, int((cx + cw / 2) * target_w))
        ry2 = min(target_h, int((cy + ch / 2) * target_h))

        if (rx2 - rx1) < 8 or (ry2 - ry1) < 8:
            continue

        candidate_gray = target_gray[ry1:ry2, rx1:rx2]
        candidate_resized = cv2.resize(candidate_gray, (128, 128))

        # --- Compute scores based on method ---
        orb_sc = 0.0
        hog_sc = 0.0
        tmpl_sc = tmpl_match["template_score"]

        if method in ("orb", "combined"):
            orb_sc = _orb_similarity(template_resized, candidate_resized)
        if method in ("hog", "combined"):
            hog_sc = _hog_similarity(template_resized, candidate_resized)

        if method == "orb":
            final_score = orb_sc * 0.6 + tmpl_sc * 0.4
        elif method == "hog":
            final_score = hog_sc * 0.6 + tmpl_sc * 0.4
        elif method == "template":
            final_score = tmpl_sc
        else:  # combined
            final_score = orb_sc * 0.35 + hog_sc * 0.30 + tmpl_sc * 0.35

        if final_score < req.min_similarity:
            continue

        matches.append({
            "filename": fname,
            "class_id": req.box.class_id,
            "class_name": req.box.class_name,
            "x_center": tmpl_match["x_center"],
            "y_center": tmpl_match["y_center"],
            "width": tmpl_match["width"],
            "height": tmpl_match["height"],
            "similarity": round(final_score, 3),
            "orb_score": round(orb_sc, 3),
            "hog_score": round(hog_sc, 3),
            "template_score": tmpl_sc,
        })

    # Sort by similarity descending
    matches.sort(key=lambda x: x["similarity"], reverse=True)

    return {
        "status": "ok",
        "reference_image": req.ref_image,
        "method": method,
        "scanned_count": len(scan_files),
        "matched_count": len(matches),
        "matches": matches
    }



@app.get("/api/workspace/assets")
def api_workspace_assets():
    """Aggregate images from all projects in the workspace."""
    config = _load_config()
    projects = config.get("projects", {})
    all_assets = []

    for p_id, p_data in projects.items():
        folder = ROOT_DIR / p_data.get("folder", p_id)
        if not folder.exists():
            continue
        exts = ["*.jpg", "*.jpeg", "*.png", "*.bmp", "*.webp"]
        img_files = []
        for ext in exts:
            img_files.extend(folder.glob(ext))

        for img_path in img_files:
            txt_path = img_path.with_suffix(".txt")
            box_count = 0
            has_labels = False
            if txt_path.exists():
                has_labels = True
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = [line.strip() for line in f if line.strip()]
                        box_count = len(lines)
                except Exception:
                    pass

            all_assets.append({
                "project_id": p_id,
                "project_name": p_data.get("name", p_id),
                "filename": img_path.name,
                "url": f"/api/image-file?category={urllib.parse.quote(p_id)}&filename={urllib.parse.quote(img_path.name)}",
                "box_count": box_count,
                "has_label_file": has_labels
            })

    return {
        "status": "ok",
        "total": len(all_assets),
        "assets": all_assets
    }


@app.get("/api/workspace/stats")
def api_workspace_stats():
    """Return workspace overview metrics."""
    config = _load_config()
    projects = config.get("projects", {})
    total_projects = len(projects)
    total_images = 0
    total_labeled = 0

    for p_id, p_data in projects.items():
        folder = ROOT_DIR / p_data.get("folder", p_id)
        if not folder.exists():
            continue
        for ext in ["*.jpg", "*.jpeg", "*.png", "*.bmp", "*.webp"]:
            for img in folder.glob(ext):
                total_images += 1
                txt = img.with_suffix(".txt")
                if txt.exists() and txt.stat().st_size > 0:
                    total_labeled += 1

    percent = round((total_labeled / total_images * 100), 1) if total_images > 0 else 0
    return {
        "total_projects": total_projects,
        "total_images": total_images,
        "total_labeled": total_labeled,
        "completion_rate": percent,
        "image_quota": 10000,
        "training_credits": 3
    }


# Mount static files
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")



def _find_free_port(start: int = 8000, end: int = 8010) -> int:
    """Find the first available TCP port in [start, end]."""
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start  # fallback — uvicorn will raise its own error


if __name__ == "__main__":
    import webbrowser

    # --- CLI argument: --port (used by baslat.bat) ---
    parser = argparse.ArgumentParser(description="YOLO Editor — AI Dataset Labeling Tool")
    parser.add_argument("--port", type=int, default=None,
                        help="Sunucu portu (varsayilan: otomatik tespit)")
    parser.add_argument("--no-browser", action="store_true",
                        help="Tarayıcıyı otomatik açma")
    args = parser.parse_args()

    # --- Port resolution ---
    port = args.port if args.port else _find_free_port(8000, 8010)

    # --- GPU / device detection ---
    _ACTIVE_DEVICE = _detect_device()

    # --- Pre-flight model check ---
    print()
    print("  +======================================================+")
    print("  |              YOLO Editor v2.0                       |")
    print("  |      AI Destekli Veri Seti Etiketleme Araci         |")
    print("  +======================================================+")
    print()
    device_str = "GPU" if "cuda" in _ACTIVE_DEVICE or "mps" in _ACTIVE_DEVICE else "CPU"
    print(f"  [*] Cihaz: {device_str} ({_ACTIVE_DEVICE})")
    print("  [*] Model dosyalari kontrol ediliyor...")
    try:
        from ultralytics import YOLOWorld, YOLO
        _ensure_model_file("yolov8s-worldv2.pt",
                           lambda: YOLOWorld(str(ROOT_DIR / "yolov8s-worldv2.pt")))
        _ensure_model_file("yolov8n.pt",
                           lambda: YOLO(str(ROOT_DIR / "yolov8n.pt")))
    except ImportError:
        print("  [UYARI] ultralytics kurulamadi. Lutfen kur.bat calistirin.")

    print()
    print(f"  [*] Sunucu baslatiliyor → http://localhost:{port}")
    print(f"  [*] Durdurmak icin Ctrl+C basiniz.")
    print()

    if not args.no_browser:
        def _open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(f"http://localhost:{port}")
            except Exception:
                pass
        threading.Thread(target=_open_browser, daemon=True).start()

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
