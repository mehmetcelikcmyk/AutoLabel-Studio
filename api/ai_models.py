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

_MODEL_LOCK = threading.Lock()
_MODEL_CACHE: Dict[str, Any] = {}
_ACTIVE_DEVICE: str = "cpu"
_LAST_CLASSES: List[str] = []

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

def get_ai_model(model_key: Optional[str] = None, device: Optional[str] = None):
    """
    Thread-safe model loader with cache.
    Returns (model, model_key) tuple.
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
            if info["type"] == "world":
                if not model_path.exists():
                    YOLOWorld(info["filename"])
                model = YOLOWorld(str(model_path))
            else:
                if not model_path.exists():
                    YOLO(info["filename"])
                model = YOLO(str(model_path))

            try:
                model.to(device)
            except Exception:
                pass

            _MODEL_CACHE[cache_key] = model
            _LAST_CLASSES = []
            return model, model_key
        except Exception as ex:
            logger.error(f"Error loading model {model_key}: {ex}")
            raise HTTPException(status_code=500, detail=f"Model yüklenemedi: {ex}")


def set_classes_if_changed(model, classes: List[str]):
    """Only call set_classes when class list actually changed (avoids GPU overhead)."""
    global _LAST_CLASSES
    with _MODEL_LOCK:
        if hasattr(model, "set_classes") and classes != _LAST_CLASSES:
            try:
                model.set_classes(classes)
                _LAST_CLASSES = list(classes)
            except Exception:
                pass



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
        model, _ = get_ai_model(model_key)
        res = model.predict(img_rgb, conf=conf, verbose=False)[0]

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
        model, used_key = get_ai_model(model_key)
        res = model.predict(img_rgb, conf=conf, verbose=False)[0]

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

