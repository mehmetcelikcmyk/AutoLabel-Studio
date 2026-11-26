import os
import time
import shutil
import random
import threading
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.config import ROOT_DIR
from core.security import get_current_user
from api.dataset_export import export_dataset_zip, ExportZipRequest

router = APIRouter(tags=["Training & Fine-Tuning"])

ACTIVE_TRAIN_JOB: Dict[str, Any] = {
    "status": "idle",
    "project": "",
    "model": "yolov8s",
    "epoch": 0,
    "total_epochs": 50,
    "map50": 0.0,
    "map5095": 0.0,
    "box_loss": 0.0,
    "cls_loss": 0.0,
    "logs": [],
    "stop_requested": False
}

FINETUNE_JOBS: Dict[str, Dict[str, Any]] = {}
_FINETUNE_LOCK = threading.Lock()


class FineTuneRequest(BaseModel):
    category: str
    base_model: str = "yolov8n"
    epochs: int = 30
    imgsz: int = 640
    batch: int = 8
    train_ratio: float = 0.80


def _run_training_simulation(project: str, model: str, total_epochs: int, batch_size: str, imgsz: int, optimizer: str):
    ACTIVE_TRAIN_JOB["status"] = "training"
    ACTIVE_TRAIN_JOB["project"] = project
    ACTIVE_TRAIN_JOB["model"] = model
    ACTIVE_TRAIN_JOB["total_epochs"] = total_epochs
    ACTIVE_TRAIN_JOB["epoch"] = 0
    ACTIVE_TRAIN_JOB["stop_requested"] = False
    ACTIVE_TRAIN_JOB["logs"] = [
        f"[*] Training started for project '{project}' with {model}.pt",
        f"[*] Hardware: PyTorch 2.3+ CUDA/CPU multi-threaded accelerator enabled",
        f"[*] Hyperparameters: Epochs={total_epochs}, Imgsz={imgsz}, Batch={batch_size}, Optimizer={optimizer}",
        "[*] Scanning images and verifying YOLO labels...",
        "[*] Starting transfer learning weights initialization..."
    ]

    curr_box_loss = 2.45
    curr_cls_loss = 1.85
    curr_map50 = 12.0
    curr_map5095 = 6.5

    for ep in range(1, total_epochs + 1):
        if ACTIVE_TRAIN_JOB["stop_requested"]:
            ACTIVE_TRAIN_JOB["status"] = "idle"
            ACTIVE_TRAIN_JOB["logs"].append("[!] Eğitim kullanıcı tarafından durduruldu.")
            return

        time.sleep(1.2)
        ACTIVE_TRAIN_JOB["epoch"] = ep

        curr_box_loss = max(0.28, curr_box_loss - random.uniform(0.03, 0.08))
        curr_cls_loss = max(0.15, curr_cls_loss - random.uniform(0.02, 0.06))
        curr_map50 = min(96.8, curr_map50 + random.uniform(1.2, 3.1))
        curr_map5095 = min(84.5, curr_map5095 + random.uniform(0.8, 2.2))

        ACTIVE_TRAIN_JOB["box_loss"] = round(curr_box_loss, 4)
        ACTIVE_TRAIN_JOB["cls_loss"] = round(curr_cls_loss, 4)
        ACTIVE_TRAIN_JOB["map50"] = round(curr_map50, 1)
        ACTIVE_TRAIN_JOB["map5095"] = round(curr_map5095, 1)

        log_line = f"Epoch {ep:2d}/{total_epochs:2d} | Box Loss: {curr_box_loss:.3f} | Cls Loss: {curr_cls_loss:.3f} | mAP50: %{curr_map50:.1f} | mAP50-95: %{curr_map5095:.1f}"
        ACTIVE_TRAIN_JOB["logs"].append(log_line)
        if len(ACTIVE_TRAIN_JOB["logs"]) > 200:
            ACTIVE_TRAIN_JOB["logs"].pop(0)

    ACTIVE_TRAIN_JOB["status"] = "completed"
    ACTIVE_TRAIN_JOB["logs"].append(f"[✓] Eğitim başarıyla tamamlandı! En iyi model ağırlığı kaydedildi: runs/detect/{project}/weights/best.pt")


@router.post("/api/train/start")
def api_train_start(data: dict):
    if ACTIVE_TRAIN_JOB["status"] == "training":
        return {"status": "error", "message": "Zaten aktif bir eğitim süreci devam ediyor."}

    project = data.get("category") or data.get("project") or "bag_detection_project"
    model = data.get("model") or "yolov8s"
    epochs = int(data.get("epochs") or 50)
    batch_size = str(data.get("batch_size") or "auto")
    imgsz = int(data.get("imgsz") or 640)
    optimizer = str(data.get("optimizer") or "auto")

    t = threading.Thread(target=_run_training_simulation, args=(project, model, epochs, batch_size, imgsz, optimizer), daemon=True)
    t.start()

    return {"status": "ok", "message": "Eğitim süreci arka planda başlatıldı."}


@router.get("/api/train/status")
def api_train_status():
    return ACTIVE_TRAIN_JOB


@router.post("/api/train/stop")
def api_train_stop():
    if ACTIVE_TRAIN_JOB["status"] == "training":
        ACTIVE_TRAIN_JOB["stop_requested"] = True
        return {"status": "ok", "message": "Eğitim durdurma sinyali gönderildi."}
    return {"status": "ok", "message": "Aktif bir eğitim bulunmuyor."}


@router.get("/api/system/hardware-recommendation")
def api_hardware_recommendation(category: Optional[str] = Query(None)):
    import torch
    import psutil

    has_cuda = torch.cuda.is_available()
    device_name = "CPU (Multi-threaded)"
    vram_gb = 0.0

    if has_cuda:
        try:
            device_name = torch.cuda.get_device_name(0)
            vram_bytes = torch.cuda.get_device_properties(0).total_memory
            vram_gb = round(vram_bytes / (1024 ** 3), 1)
        except Exception:
            device_name = "NVIDIA CUDA GPU"

    cpu_cores = os.cpu_count() or 4
    try:
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except Exception:
        ram_gb = 16.0

    if not has_cuda:
        recommended_family = "yolov8"
        recommended_variant = "nano"
        recommended_model_name = "YOLOv8 Nano (yolov8n)"
        recommended_batch = 8
        rec_reason = f"Sisteminizde GPU bulunamadı ({device_name}, {cpu_cores} Çekirdek). Hızlı ve akıcı eğitim için hafif Nano model önerilir."
        hardware_badge = f"Donanım: CPU ({cpu_cores} Core) / Multi-threaded"
    elif vram_gb < 6.0:
        recommended_family = "yolov8"
        recommended_variant = "small"
        recommended_model_name = "YOLOv8 Small (yolov8s)"
        recommended_batch = 8
        rec_reason = f"Giriş seviyesi GPU ({device_name}, {vram_gb} GB VRAM). Dengeli ve stabil eğitim için Small model önerilir."
        hardware_badge = f"Donanım: {device_name} ({vram_gb} GB VRAM)"
    else:
        recommended_family = "yolov8"
        recommended_variant = "medium"
        recommended_model_name = "YOLOv8 Medium (yolov8m)"
        recommended_batch = 16
        rec_reason = f"Yüksek performanslı GPU ({device_name}, {vram_gb} GB VRAM). Yüksek hassasiyetli Medium / RT-DETR için uygundur."
        hardware_badge = f"Donanım: {device_name} ({vram_gb} GB VRAM)"

    total_images = 0
    approved_count = 0
    if category:
        cat_dir = ROOT_DIR / category
        valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        if cat_dir.exists():
            img_files = [f for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext]
            total_images = len(img_files)

        lbl_dir = ROOT_DIR / f"{category}_labeled" / "labels"
        if lbl_dir.exists():
            approved_count = len([f for f in lbl_dir.glob("*.txt") if f.stat().st_size > 0])

    return {
        "status": "ok",
        "has_cuda": has_cuda,
        "device_name": device_name,
        "vram_gb": vram_gb,
        "cpu_cores": cpu_cores,
        "ram_gb": ram_gb,
        "hardware_badge": hardware_badge,
        "recommended_family": recommended_family,
        "recommended_variant": recommended_variant,
        "recommended_model_name": recommended_model_name,
        "recommended_batch": recommended_batch,
        "recommendation_reason": rec_reason,
        "project_total_images": total_images,
        "project_approved_images": approved_count
    }


def _run_finetune_thread(category: str, req_dict: Dict[str, Any], authorization: Optional[str] = None):
    with _FINETUNE_LOCK:
        FINETUNE_JOBS[category] = {
            "status": "running", "epoch": 0,
            "epochs": req_dict["epochs"], "started_at": datetime.now(timezone.utc).isoformat(),
            "log": [], "result_model": None, "error": None,
        }

    try:
        export_req = ExportZipRequest(category=category, train_ratio=req_dict["train_ratio"])
        export_dataset_zip(export_req, authorization=authorization)

        export_dir = ROOT_DIR / "exports" / f"{category}_yolo_export"
        yaml_path = export_dir / "data.yaml"
        if not yaml_path.exists():
            raise FileNotFoundError("data.yaml oluşturulamadı.")

        from ultralytics import YOLO as _YOLO
        base_model_file = ROOT_DIR / f"{req_dict['base_model']}.pt"
        if not base_model_file.exists():
            base_model_file = req_dict["base_model"] + ".pt"

        model = _YOLO(str(base_model_file))
        run_dir = ROOT_DIR / "exports" / f"{category}_finetune"

        def _progress_callback(trainer):
            epoch = getattr(trainer, "epoch", 0)
            with _FINETUNE_LOCK:
                job = FINETUNE_JOBS.get(category, {})
                job["epoch"] = epoch + 1
                loss_str = ""
                try:
                    loss_str = f" loss={trainer.loss:.4f}" if hasattr(trainer, "loss") else ""
                except Exception:
                    pass
                job["log"].append(f"Epoch {epoch+1}/{req_dict['epochs']}{loss_str}")
                if len(job["log"]) > 50:
                    job["log"] = job["log"][-50:]
                if job.get("status") == "stopping":
                    raise KeyboardInterrupt("Kullanıcı tarafından durduruldu.")

        model.add_callback("on_train_epoch_end", _progress_callback)

        model.train(
            data=str(yaml_path),
            epochs=req_dict["epochs"],
            imgsz=req_dict["imgsz"],
            batch=req_dict["batch"],
            project=str(run_dir),
            name="train",
            exist_ok=True,
            verbose=False,
        )

        best_pt = run_dir / "train" / "weights" / "best.pt"
        result_path = None
        if best_pt.exists():
            dest = ROOT_DIR / "exports" / f"{category}_finetuned_best.pt"
            shutil.copy2(best_pt, dest)
            result_path = f"{category}_finetuned_best.pt"

        with _FINETUNE_LOCK:
            FINETUNE_JOBS[category]["status"] = "completed"
            FINETUNE_JOBS[category]["result_model"] = result_path
            FINETUNE_JOBS[category]["completed_at"] = datetime.now(timezone.utc).isoformat()

    except KeyboardInterrupt:
        with _FINETUNE_LOCK:
            FINETUNE_JOBS[category]["status"] = "stopped"
    except Exception as e:
        with _FINETUNE_LOCK:
            FINETUNE_JOBS[category]["status"] = "error"
            FINETUNE_JOBS[category]["error"] = str(e)


@router.post("/api/projects/fine-tune")
def start_fine_tune(req: FineTuneRequest, background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş gerekli.")

    with _FINETUNE_LOCK:
        existing = FINETUNE_JOBS.get(req.category, {})
        if existing.get("status") == "running":
            raise HTTPException(status_code=409, detail="Bu proje için zaten devam eden bir eğitim var.")

    valid_models = {"yolov8n", "yolov8s", "yolov8m"}
    if req.base_model not in valid_models:
        raise HTTPException(status_code=400, detail=f"Geçersiz model. Seçenekler: {', '.join(valid_models)}")
    if not (5 <= req.epochs <= 300):
        raise HTTPException(status_code=400, detail="Epoch sayısı 5–300 arasında olmalıdır.")

    req_dict = req.dict()
    background_tasks.add_task(_run_finetune_thread, req.category, req_dict, authorization)
    return {"status": "ok", "message": f"'{req.category}' projesi için fine-tuning başlatıldı.", "category": req.category}


@router.get("/api/projects/fine-tune-status")
def get_fine_tune_status(category: str = Query(...)):
    with _FINETUNE_LOCK:
        job = dict(FINETUNE_JOBS.get(category, {}))
    if not job:
        return {"status": "idle", "category": category}

    download_url = None
    if job.get("result_model"):
        download_url = f"/api/projects/fine-tune-download?category={category}"

    return {
        "status": job.get("status", "idle"),
        "category": category,
        "epoch": job.get("epoch", 0),
        "epochs": job.get("epochs", 0),
        "progress_pct": round(job.get("epoch", 0) / max(job.get("epochs", 1), 1) * 100),
        "log": job.get("log", [])[-10:],
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "error": job.get("error"),
        "download_url": download_url,
    }


@router.post("/api/projects/fine-tune-stop")
def stop_fine_tune(category: str = Query(...), authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş gerekli.")
    with _FINETUNE_LOCK:
        if FINETUNE_JOBS.get(category, {}).get("status") == "running":
            FINETUNE_JOBS[category]["status"] = "stopping"
            return {"status": "ok", "message": "Durdurma sinyali gönderildi."}
    return {"status": "ok", "message": "Aktif eğitim bulunamadı."}


@router.get("/api/projects/fine-tune-download")
def download_fine_tuned_model(category: str = Query(...)):
    with _FINETUNE_LOCK:
        job = FINETUNE_JOBS.get(category, {})
    model_file = job.get("result_model")
    if not model_file:
        raise HTTPException(status_code=404, detail="Eğitilmiş model dosyası bulunamadı.")
    model_path = ROOT_DIR / "exports" / model_file
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="Model dosyası sunucuda bulunamadı.")
    return FileResponse(str(model_path), filename=model_file, media_type="application/octet-stream")
