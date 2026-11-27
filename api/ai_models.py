import os
import re
import cv2
import time
import base64
import threading
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from pydantic import BaseModel

from core.config import ROOT_DIR
from core.security import require_admin

logger = logging.getLogger("AutoLabel")

router = APIRouter(tags=["AI Models"])

# ─────────────────────────────────────────────────────────────────────────────
# AI MODEL REGISTRY
# ─────────────────────────────────────────────────────────────────────────────
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
        "label": "YOLOv8l-World v2 (Çok Güçlü)",
        "size_mb": 196,
        "speed": "çok yavaş",
        "accuracy": "çok yüksek",
    },
    "yolov8x-worldv2": {
        "filename": "yolov8x-worldv2.pt",
        "type": "world",
        "label": "YOLOv8x-World v2 (En Güçlü)",
        "size_mb": 140,
        "speed": "en yavaş",
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

# ─────────────────────────────────────────────────────────────────────────────
# CUSTOM MODELS STORAGE & CACHE
# ─────────────────────────────────────────────────────────────────────────────
CUSTOM_MODELS_DIR = ROOT_DIR / "custom_models"
CUSTOM_MODELS_FILE = CUSTOM_MODELS_DIR / "models_meta.json"

_MODEL_LOCK = threading.RLock()
_MODEL_CACHE: Dict[str, Any] = {}
_ACTIVE_DEVICE: str = "cpu"
_LAST_CLASSES: List[str] = []
_MODEL_LAST_CLASSES: Dict[int, List[str]] = {}
_TEXT_EMBED_CACHE: Dict[str, Any] = {}
_TEXT_EMBED_CACHE_MAX = 1000
_CLIP_TEXT_ENCODER: Any = None
_CLIP_TEXT_WEIGHTS_PATH = ROOT_DIR / "clip_vitb32_text_fp16.pt"


def _get_container_mem_limit_mb() -> float:
    """Detect Linux container memory limit (cgroup v2/v1) in MB, or 0.0 if unlimited/unknown."""
    for cg_path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            with open(cg_path, "r", encoding="utf-8") as f:
                raw = f.read().strip()
            if raw and raw != "max":
                val = int(raw)
                if 0 < val < (1 << 50):
                    return val / (1024.0 * 1024.0)
        except Exception:
            pass
    return 0.0


def _trim_process_memory() -> None:
    """Run Python GC and release freed glibc heap pages back to Linux kernel."""
    import gc
    gc.collect()
    try:
        if os.name == "posix":
            import ctypes
            ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


def _resolve_safe_model_key(model_key: Optional[str], allow_heavy_fallback: bool = True) -> str:
    """Resolve requested model key and guard against OOM on 1 GB RAM containers."""
    resolved = model_key or DEFAULT_MODEL_KEY
    mem_mb = _get_container_mem_limit_mb()
    if 0 < mem_mb <= 1400.0:
        if resolved in ("yolov8x-worldv2", "yolov8l-worldv2"):
            if not allow_heavy_fallback:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sunucu bellek limiti ({int(mem_mb)} MB) nedeniyle '{resolved}' yüklenemiyor. yolov8s-worldv2 seçin.",
                )
            logger.warning(f"Low-RAM container ({mem_mb:.0f} MB): downgrading '{resolved}' to 'yolov8s-worldv2' to avoid OOM.")
            return "yolov8s-worldv2"
        if allow_heavy_fallback and resolved == "yolov8m-worldv2":
            logger.warning(f"Low-RAM container ({mem_mb:.0f} MB): downgrading 'yolov8m-worldv2' to 'yolov8s-worldv2' for sustained batch stability.")
            return "yolov8s-worldv2"
    return resolved


def _quick_gelu(t):
    import torch
    return t * torch.sigmoid(1.702 * t)


def _encode_classes_lightweight(classes: List[str], device: str = "cpu"):
    """
    Encode text prompts for YOLO-World using streaming FP16->FP32 functional CLIP text forward
    plus an LRU prompt embedding cache (~2 MB total). Keeps peak RAM ~550 MB instead of 900+ MB
    and avoids repeat encoding overhead on subsequent requests.
    """
    import gc
    import torch
    import torch.nn.functional as F
    import clip

    if "cpu" in str(device):
        try:
            torch.set_num_threads(1)
        except Exception:
            pass

    missing: List[str] = []
    seen_missing = set()
    for c in classes:
        if c not in _TEXT_EMBED_CACHE and c not in seen_missing:
            missing.append(c)
            seen_missing.add(c)

    if missing:
        if not _CLIP_TEXT_WEIGHTS_PATH.exists():
            url = clip.clip._MODELS["ViT-B/32"]
            mp = clip.clip._download(url, os.path.expanduser("~/.cache/clip"))
            jm = torch.jit.load(mp, map_location="cpu").eval()
            sd_half = {
                k: v.half()
                for k, v in jm.state_dict().items()
                if not k.startswith("visual.") and k not in ("input_resolution", "context_length", "vocab_size", "logit_scale")
            }
            del jm
            gc.collect()
            try:
                torch.save(sd_half, str(_CLIP_TEXT_WEIGHTS_PATH))
            except Exception:
                pass
        else:
            sd_half = torch.load(str(_CLIP_TEXT_WEIGHTS_PATH), map_location="cpu", weights_only=True)

        attn_mask = torch.empty(77, 77, dtype=torch.float32)
        attn_mask.fill_(float("-inf"))
        attn_mask.triu_(1)

        tokens = clip.tokenize(missing, truncate=True)
        with torch.inference_mode():
            pos_emb = sd_half["positional_embedding"].float()
            tok_emb_w = sd_half["token_embedding.weight"].float()
            ln_final_w = sd_half["ln_final.weight"].float()
            ln_final_b = sd_half["ln_final.bias"].float()
            proj_w = sd_half["text_projection"].float()

            for start_i in range(0, len(missing), 64):
                chunk_names = missing[start_i:start_i + 64]
                tok_chunk = tokens[start_i:start_i + 64]

                x = F.embedding(tok_chunk, tok_emb_w) + pos_emb
                x = x.permute(1, 0, 2)  # (77, B, 512)

                for i in range(12):
                    p = f"transformer.resblocks.{i}."
                    ln1_x = F.layer_norm(x, (512,), sd_half[p + "ln_1.weight"].float(), sd_half[p + "ln_1.bias"].float(), eps=1e-5)
                    attn_out, _ = F.multi_head_attention_forward(
                        ln1_x,
                        ln1_x,
                        ln1_x,
                        embed_dim_to_check=512,
                        num_heads=8,
                        in_proj_weight=sd_half[p + "attn.in_proj_weight"].float(),
                        in_proj_bias=sd_half[p + "attn.in_proj_bias"].float(),
                        bias_k=None,
                        bias_v=None,
                        add_zero_attn=False,
                        dropout_p=0.0,
                        out_proj_weight=sd_half[p + "attn.out_proj.weight"].float(),
                        out_proj_bias=sd_half[p + "attn.out_proj.bias"].float(),
                        training=False,
                        key_padding_mask=None,
                        need_weights=False,
                        attn_mask=attn_mask,
                    )
                    x = x + attn_out

                    ln2_x = F.layer_norm(x, (512,), sd_half[p + "ln_2.weight"].float(), sd_half[p + "ln_2.bias"].float(), eps=1e-5)
                    m = F.linear(ln2_x, sd_half[p + "mlp.c_fc.weight"].float(), sd_half[p + "mlp.c_fc.bias"].float())
                    m = _quick_gelu(m)
                    m = F.linear(m, sd_half[p + "mlp.c_proj.weight"].float(), sd_half[p + "mlp.c_proj.bias"].float())
                    x = x + m

                x = x.permute(1, 0, 2)  # (B, 77, 512)
                x = F.layer_norm(x, (512,), ln_final_w, ln_final_b, eps=1e-5)
                x = x[torch.arange(x.shape[0]), tok_chunk.argmax(dim=-1)] @ proj_w
                x = x / x.norm(p=2, dim=-1, keepdim=True)

                for row_i, cname in enumerate(chunk_names):
                    if len(_TEXT_EMBED_CACHE) >= _TEXT_EMBED_CACHE_MAX:
                        try:
                            oldest_key = next(iter(_TEXT_EMBED_CACHE))
                            _TEXT_EMBED_CACHE.pop(oldest_key, None)
                        except StopIteration:
                            break
                    _TEXT_EMBED_CACHE[cname] = x[row_i].detach().cpu().clone()

        del sd_half, attn_mask, tokens
        _trim_process_memory()

    stacked = __import__("torch").stack([_TEXT_EMBED_CACHE[c] for c in classes], dim=0).unsqueeze(0).to(device)
    return stacked

def detect_device() -> str:
    """Auto-detect best available compute device (CUDA > MPS > CPU)."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"

_ACTIVE_DEVICE = detect_device()

def load_custom_models() -> Dict[str, Any]:
    import json
    if CUSTOM_MODELS_FILE.exists():
        try:
            with open(CUSTOM_MODELS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_custom_models(data: Dict[str, Any]):
    import json
    CUSTOM_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(CUSTOM_MODELS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_custom_model_info(model_key: str) -> Optional[Dict[str, Any]]:
    customs = load_custom_models()
    return customs.get(model_key)

def get_ai_model(model_key: Optional[str] = None, device: Optional[str] = None, allow_heavy_fallback: bool = True):
    """
    Thread-safe model loader with single-model eviction on CPU / low-RAM containers.
    Returns (model, model_key) tuple.
    """
    global _ACTIVE_DEVICE, _LAST_CLASSES
    import gc

    if device is None:
        device = _ACTIVE_DEVICE
    model_key = _resolve_safe_model_key(model_key, allow_heavy_fallback=allow_heavy_fallback)

    cache_key = f"{model_key}::{device}"
    with _MODEL_LOCK:
        if cache_key in _MODEL_CACHE:
            return _MODEL_CACHE[cache_key], model_key

        # Keep at most 1 model resident on CPU / <=2 GB RAM containers to prevent OOM kills
        mem_mb = _get_container_mem_limit_mb()
        if "cpu" in str(device) or (0 < mem_mb <= 2048.0):
            if _MODEL_CACHE:
                _MODEL_CACHE.clear()
                _MODEL_LAST_CLASSES.clear()
                _LAST_CLASSES = []
                gc.collect()

        custom_info = get_custom_model_info(model_key)
        if custom_info:
            c_path = CUSTOM_MODELS_DIR / custom_info["filename"]
            if c_path.exists():
                try:
                    from ultralytics import YOLO
                    model = YOLO(str(c_path))
                    try:
                        model.to(device)
                    except Exception:
                        pass
                    _MODEL_CACHE[cache_key] = model
                    return model, model_key
                except Exception as ex:
                    logger.error(f"Error loading custom model {model_key}: {ex}")

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
            from ultralytics.utils.downloads import attempt_download_asset
            if not model_path.exists():
                try:
                    attempt_download_asset(str(model_path))
                except Exception:
                    pass
            load_target = str(model_path) if model_path.exists() else info["filename"]
            if info["type"] == "world":
                model = YOLOWorld(load_target)
            else:
                model = YOLO(load_target)

            try:
                model.to(device)
            except Exception:
                pass

            _MODEL_CACHE[cache_key] = model
            _LAST_CLASSES = []
            _trim_process_memory()
            return model, model_key
        except Exception as ex:
            logger.error(f"Error loading model {model_key}: {ex}")
            raise HTTPException(status_code=500, detail=f"Model yüklenemedi: {ex}")


def set_classes_if_changed(model, classes: List[str]):
    """Only re-encode prompts when class list changed for this model; uses streaming lightweight CLIP."""
    global _LAST_CLASSES
    if not classes:
        return
    with _MODEL_LOCK:
        m_id = id(model)
        if _MODEL_LAST_CLASSES.get(m_id) == classes:
            inner = getattr(model, "model", None)
            if inner is not None and getattr(inner, "txt_feats", None) is not None:
                return
        try:
            inner = getattr(model, "model", None)
            if hasattr(model, "set_classes") and inner is not None and hasattr(inner, "model"):
                device = next(inner.model.parameters()).device
                inner.txt_feats = _encode_classes_lightweight(classes, device=device)
                inner.model[-1].nc = len(classes)
                names_dict = {i: c for i, c in enumerate(classes)}
                if hasattr(inner, "names"):
                    inner.names = names_dict
                predictor = getattr(model, "predictor", None)
                if predictor is not None and getattr(predictor, "model", None) is not None:
                    predictor.model.names = names_dict
                _MODEL_LAST_CLASSES[m_id] = list(classes)
                _LAST_CLASSES = list(classes)
            elif hasattr(model, "set_classes"):
                model.set_classes(classes)
                _MODEL_LAST_CLASSES[m_id] = list(classes)
                _LAST_CLASSES = list(classes)
        except Exception as e:
            logger.warning(f"set_classes warning: {e}")


def run_model_predict(model, *args, **kwargs):
    """Thread-safe model.predict wrapper using torch.inference_mode() under _MODEL_LOCK."""
    import torch
    with _MODEL_LOCK:
        try:
            if "cpu" in str(_ACTIVE_DEVICE):
                torch.set_num_threads(1)
        except Exception:
            pass
        with torch.inference_mode():
            res = model.predict(*args, **kwargs)
        _trim_process_memory()
        return res



# ─────────────────────────────────────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/models/list")
def list_all_models():
    """Sistemdeki yerleşik, kullanıcı tarafından yüklenen ve eğitilen tüm modelleri listeler."""
    models = []

    models.append({
        "key": "yolov8s-worldv2",
        "name": "YOLOv8s-Worldv2 (Open-Vocabulary)",
        "type": "built_in",
        "format": "PyTorch (.pt)",
        "file_size_mb": 44.5,
        "classes": ["Açık Sözlük - İstediğiniz her nesneyi metinle tanır"],
        "class_count": "Sınırsız",
        "description": "Metinle arama yapabilen sıfır-örnek açık sözlük yapay zeka modeli.",
        "can_delete": False,
        "is_default": True
    })

    models.append({
        "key": "yolov8n",
        "name": "YOLOv8n (Nano - Hızlı)",
        "type": "built_in",
        "format": "PyTorch (.pt)",
        "file_size_mb": 6.2,
        "classes": ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"],
        "class_count": 80,
        "description": "Ultra hafif ve son derece hızlı genel nesne tanıma modeli.",
        "can_delete": False,
        "is_default": False
    })

    custom_models = load_custom_models()
    for m_key, m_info in custom_models.items():
        file_path = CUSTOM_MODELS_DIR / m_info["filename"]
        sz_mb = round(file_path.stat().st_size / (1024 * 1024), 2) if file_path.exists() else 0.0
        models.append({
            "key": m_key,
            "name": m_info.get("name", m_key),
            "type": "custom",
            "format": m_info.get("format", "PyTorch (.pt)"),
            "file_size_mb": sz_mb,
            "classes": m_info.get("classes", []),
            "class_count": len(m_info.get("classes", [])),
            "description": m_info.get("description", "Kullanıcı tarafından yüklenmiş özel model."),
            "created_at": m_info.get("created_at", ""),
            "can_delete": True,
            "is_default": False
        })

    runs_dir = ROOT_DIR / "runs" / "detect"
    if runs_dir.exists():
        for train_dir in runs_dir.iterdir():
            if train_dir.is_dir():
                best_pt = train_dir / "weights" / "best.pt"
                if best_pt.exists():
                    sz_mb = round(best_pt.stat().st_size / (1024 * 1024), 2)
                    models.append({
                        "key": f"trained_{train_dir.name}",
                        "name": f"Eğitilmiş Model: {train_dir.name}",
                        "type": "trained",
                        "format": "PyTorch (.pt)",
                        "file_size_mb": sz_mb,
                        "classes": ["Proje Eğitilmiş Sınıfları"],
                        "class_count": "Eğitim Sınıfları",
                        "description": f"Bu platformda eğitilmiş model ({train_dir.name}).",
                        "can_delete": False,
                        "is_default": False
                    })

    return {"status": "ok", "models": models}


@router.post("/api/models/upload")
async def upload_custom_model(
    file: UploadFile = File(...),
    model_name: str = Form(...),
    description: str = Form(""),
    authorization: Optional[str] = Header(None)
):
    """Kullanıcının kendi YOLO/PyTorch (.pt / .onnx) modelini yükler ve sınıflarını çıkarır."""
    require_admin(authorization)
    fname = file.filename or "custom_model.pt"
    ext = os.path.splitext(fname)[1].lower()
    if ext not in [".pt", ".onnx"]:
        raise HTTPException(status_code=400, detail="Sadece .pt veya .onnx model dosyaları desteklenmektedir.")

    safe_stem = re.sub(r'[^a-zA-Z0-9_\-]', '_', os.path.splitext(fname)[0])
    model_key = f"custom_{safe_stem}_{int(time.time())}"
    save_filename = f"{model_key}{ext}"
    save_path = CUSTOM_MODELS_DIR / save_filename

    CUSTOM_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    classes = []
    try:
        from ultralytics import YOLO
        y_model = YOLO(str(save_path))
        if hasattr(y_model, 'names') and y_model.names:
            if isinstance(y_model.names, dict):
                classes = [str(v) for v in y_model.names.values()]
            elif isinstance(y_model.names, list):
                classes = [str(v) for v in y_model.names]
    except Exception as e:
        if save_path.exists():
            try:
                save_path.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=f"Model dosyası doğrulanamadı veya hasarlı: {e}")

    custom_models = load_custom_models()
    custom_models[model_key] = {
        "key": model_key,
        "name": model_name or fname,
        "filename": save_filename,
        "format": "ONNX" if ext == ".onnx" else "PyTorch (.pt)",
        "classes": classes,
        "description": description or f"{len(classes)} sınıf tanıyan özel model.",
        "created_at": datetime.now().strftime("%d.%m.%Y %H:%M")
    }
    save_custom_models(custom_models)

    return {
        "status": "ok",
        "model_key": model_key,
        "model_name": model_name,
        "classes": classes,
        "class_count": len(classes),
        "message": f"Model başarıyla yüklendi! {len(classes)} sınıf algılandı."
    }


@router.delete("/api/models/{model_key}")
def delete_custom_model(model_key: str, authorization: Optional[str] = Header(None)):
    """Özel modeli sistemden ve diskten siler."""
    require_admin(authorization)
    custom_models = load_custom_models()
    if model_key not in custom_models:
        raise HTTPException(status_code=404, detail="Model bulunamadı.")

    info = custom_models.pop(model_key)
    save_custom_models(custom_models)

    file_path = CUSTOM_MODELS_DIR / info.get("filename", "")
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    return {"status": "ok", "message": f"'{info.get('name', model_key)}' modeli silindi."}


@router.post("/api/models/test-predict")
async def test_model_predict(
    model_key: str = Form(...),
    conf: float = Form(0.20),
    file: UploadFile = File(...)
):
    """Seçilen model ile yüklenen tek bir görseli canlı test eder (Playground)."""
    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Görsel okunamadı.")

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    try:
        with _MODEL_LOCK:
            model, _ = get_ai_model(model_key)
            res = run_model_predict(model, img_rgb, conf=conf, verbose=False)[0]

        boxes_out = []
        annotated = img_bgr.copy()

        neon_colors = [
            (0, 255, 128), (255, 128, 0), (255, 0, 128),
            (0, 200, 255), (160, 0, 255), (255, 230, 0),
            (0, 255, 255), (255, 50, 50)
        ]

        if res.boxes is not None and len(res.boxes) > 0:
            for i, box in enumerate(res.boxes):
                xyxy = box.xyxy[0].cpu().numpy().astype(int)
                bx1, by1, bx2, by2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])
                score = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id] if hasattr(model, 'names') and cls_id in model.names else f"Class_{cls_id}"

                color = neon_colors[cls_id % len(neon_colors)]
                cv2.rectangle(annotated, (bx1, by1), (bx2, by2), color, 3)

                label_txt = f"{cls_name} %{int(score*100)}"
                (tw, th), _ = cv2.getTextSize(label_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(annotated, (bx1, max(0, by1 - th - 8)), (bx1 + tw + 6, max(0, by1)), color, -1)
                cv2.putText(annotated, label_txt, (bx1 + 3, max(0, by1 - 4)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

                boxes_out.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(score, 4),
                    "bbox": [bx1, by1, bx2, by2]
                })

        _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
        b64 = base64.b64encode(buf).decode("utf-8")

        return {
            "status": "ok",
            "model_key": model_key,
            "total_detections": len(boxes_out),
            "detections": boxes_out,
            "image_base64": f"data:image/jpeg;base64,{b64}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model test işlemi başarısız: {e}")


@router.post("/api/predict")
async def run_inference_api(
    model_key: str = Form("yolov8s-worldv2"),
    conf: float = Form(0.25),
    file: UploadFile = File(...)
):
    """Genel Nesne Tespiti Inference API (Roboflow / Ultralytics Cloud benzeri)."""
    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Görsel okunamadı.")

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h_img, w_img = img_rgb.shape[:2]

    try:
        with _MODEL_LOCK:
            model, used_key = get_ai_model(model_key)
            res = run_model_predict(model, img_rgb, conf=conf, verbose=False)[0]

        predictions = []
        if res.boxes is not None and len(res.boxes) > 0:
            for box in res.boxes:
                xyxy = box.xyxy[0].cpu().numpy().tolist()
                xywhn = box.xywhn[0].cpu().numpy().tolist()
                score = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id] if hasattr(model, 'names') and cls_id in model.names else f"class_{cls_id}"

                predictions.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(score, 4),
                    "box_xyxy": [int(v) for v in xyxy],
                    "box_yolo": [round(v, 6) for v in xywhn]
                })

        return {
            "status": "success",
            "model_used": used_key,
            "image_size": {"width": w_img, "height": h_img},
            "detection_count": len(predictions),
            "predictions": predictions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")


@router.get("/api/ai-info")
def get_ai_info():
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

