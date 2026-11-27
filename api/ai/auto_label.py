"""
api/ai/auto_label.py
AI Otomatik etiketleme ve toplu iş parçacığı (batch auto-label) modülü:
- /api/auto-label-image (POST)
- /api/projects/batch-auto-label (POST)
- /api/projects/batch-status (GET)
- /api/projects/batch-stop (POST)
"""

import os
import gc
import time
import json
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.database import cf_r2_get_object
from core.security import get_current_user, check_project_permission
from api.ai_models import get_ai_model, set_classes_if_changed, run_model_predict, _MODEL_LOCK, _ACTIVE_DEVICE
from api.shared.models import AutoLabelRequest, BatchAutoLabelRequest
from api.shared.utils import load_project_config, get_project_storage_info
from services.image_processing import load_image_rgb, save_image_preview, safe_bbox, filter_boxes

router = APIRouter(tags=["AI Auto Label"])

BATCH_JOBS: Dict[str, Dict[str, Any]] = {}
BATCH_JOB_MAX_AGE_SECS = 7200


def _make_batch_key(user_id: Optional[Any], category: str) -> str:
    uid = str(user_id or "anon").strip().lower()
    return f"{uid}:{str(category).strip()}"


def _load_image_with_r2_fallback(category: str, filename: str) -> Optional[np.ndarray]:
    import tempfile
    import io
    from PIL import Image as PILImage

    local_path = ROOT_DIR / category / filename
    if local_path.exists():
        img = load_image_rgb(local_path)
        if img is not None:
            return img

    cache_dir = Path(tempfile.gettempdir()) / "als_cache" / category
    cache_path = cache_dir / filename
    if cache_path.exists():
        img = load_image_rgb(cache_path)
        if img is not None:
            return img

    try:
        storage = get_project_storage_info(category)
        img_bytes = cf_r2_get_object(f"{storage['r2_images_prefix']}/{filename}")
        if not img_bytes:
            img_bytes = cf_r2_get_object(f"{category}/{filename}")
        if img_bytes:
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(img_bytes)
            img = load_image_rgb(cache_path)
            if img is not None:
                return img
            pil_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
            return np.array(pil_img)
    except Exception as r2_err:
        print(f"[R2 Image Load Warning] {category}/{filename}: {r2_err}")

    return None


def cleanup_old_batch_jobs():
    now = time.time()
    to_delete = []
    for key, job in list(BATCH_JOBS.items()):
        if job.get("status") in ("completed", "failed", "stopped"):
            job_start = job.get("start_time", 0)
            if now - job_start > BATCH_JOB_MAX_AGE_SECS:
                to_delete.append(key)
    for key in to_delete:
        BATCH_JOBS.pop(key, None)


def _build_prompt_map(cls_list: List[Dict]) -> tuple:
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
    # Cloudflare D1 birincil kaynak: Railway yeniden başlasa da proje sınıfları kaybolmaz
    try:
        from core.database import cf_d1_query
        rows = cf_d1_query("SELECT classes_json FROM projects WHERE id = ? LIMIT 1", [category])
        if rows and rows[0].get("classes_json"):
            parsed = json.loads(rows[0]["classes_json"])
            if isinstance(parsed, list) and parsed:
                return parsed
    except Exception:
        pass
    classes_map = config.get("classes", {})
    cat_key = category.lower()
    cls_raw = classes_map.get(cat_key)
    if isinstance(cls_raw, list) and cls_raw:
        return cls_raw
    if isinstance(cls_raw, dict):
        return [cls_raw]
    return [{"id": 0, "name": category.capitalize(), "prompts": [cat_key]}]


def _get_imgsz(h: int, w: int) -> int:
    if "cuda" not in str(_ACTIVE_DEVICE):
        return 640
    max_dim = max(h, w)
    if max_dim >= 1400:
        return 1280
    if max_dim >= 900:
        return 1024
    return 640


@router.post("/api/auto-label-image")
def auto_label_image(req: AutoLabelRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True)

    config = load_project_config()
    proj_meta = config.get("projects", {}).get(req.category, {})
    ai_settings = proj_meta.get("ai_settings", {})
    model_key = req.model_key or proj_meta.get("model_key", "yolov8s-worldv2")

    cls_list = _resolve_cls_list(req.category, config)
    all_prompts, prompt_to_class = _build_prompt_map(cls_list)
    if req.prompts and len(req.prompts) > 0:
        all_prompts = req.prompts
    elif not all_prompts:
        all_prompts = [req.category.lower()]
        prompt_to_class[req.category.lower()] = (0, req.category.capitalize())

    conf_thresh = req.conf_threshold if req.conf_threshold > 0 else float(ai_settings.get("conf", 0.07))
    iou_thresh = float(ai_settings.get("iou", 0.50))

    boxes = []
    try:
        img = _load_image_with_r2_fallback(req.category, req.image_filename)
        if img is None:
            raise HTTPException(status_code=404, detail=f"Görsel bulunamadı (disk ve R2): {req.image_filename}")

        h_img, w_img = img.shape[:2]
        imgsz = _get_imgsz(h_img, w_img)

        with _MODEL_LOCK:
            model, used_key = get_ai_model(model_key)
            set_classes_if_changed(model, all_prompts)
            results = run_model_predict(model, img, conf=conf_thresh, imgsz=imgsz, verbose=False)[0]
        if results.boxes is not None and len(results.boxes) > 0:
            xyxyn = results.boxes.xyxyn.cpu().numpy().copy()
            confs = results.boxes.conf.cpu().numpy()
            cls_indices = results.boxes.cls.cpu().numpy().astype(int)

            kept_idx = filter_boxes(xyxyn, confs, cls_indices,
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
                c_id, c_name = prompt_to_class.get(p_name) or prompt_to_class.get(p_name.lower().strip(),
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI etiketleme hatası: {str(e)}")


def _run_batch_auto_label_thread(
    category: str,
    conf_threshold: float,
    overwrite: bool,
    prompts: Optional[List[str]],
    model_key: Optional[str] = None,
    empty_only: bool = False,
    batch_id: Optional[str] = None,
    target_filenames: Optional[List[str]] = None,
    model_key_2: Optional[str] = None,
    batch_user_id: Optional[str] = None,
):
    from api.ai.active_learning import _create_labels_snapshot

    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    previews_dir = ROOT_DIR / f"{category}_labeled" / "previews"
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)
    error_log = ROOT_DIR / f"{category}_labeled" / "batch_errors.log"
    batch_key = _make_batch_key(batch_user_id, category)

    error_lines = []
    try:
        config = load_project_config()
        proj_meta = config.get("projects", {}).get(category, {})
        ai_settings = proj_meta.get("ai_settings", {})
        if model_key is None:
            model_key = proj_meta.get("model_key", "yolov8s-worldv2")

        cls_list = _resolve_cls_list(category, config)
        if prompts and len(prompts) > 0:
            all_prompts = [p.strip().lower() for p in prompts if p.strip()]
            _, auto_map = _build_prompt_map(cls_list)
            prompt_to_class: Dict[str, tuple] = {}
            for p in all_prompts:
                if p in auto_map:
                    prompt_to_class[p] = auto_map[p]
                else:
                    prompt_to_class[p] = (cls_list[0].get("id", 0), cls_list[0].get("name", category.capitalize()))
        else:
            all_prompts, prompt_to_class = _build_prompt_map(cls_list)

        if not all_prompts:
            all_prompts = [category.lower()]
            prompt_to_class[category.lower()] = (0, category.capitalize())

        iou_thresh = float(ai_settings.get("iou", 0.50))
        valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        cat_dir.mkdir(parents=True, exist_ok=True)

        # Metadata-only discovery (disk + R2) without eager full-dataset downloads
        file_names_set = set()
        if cat_dir.exists():
            for fname in os.listdir(cat_dir):
                if os.path.splitext(fname)[1].lower() in valid_extensions:
                    file_names_set.add(fname)

        existing_label_stems = set()
        if labels_dir.exists():
            for lp in labels_dir.iterdir():
                if lp.suffix == ".txt" and lp.stat().st_size > 0:
                    existing_label_stems.add(lp.stem)

        storage_info = None
        try:
            from core.database import cf_r2_list_objects
            from api.shared.utils import get_project_storage_info
            storage_info = get_project_storage_info(category)
            if storage_info.get("r2_configured"):
                r2_objs = cf_r2_list_objects(prefix=storage_info["r2_images_prefix"] + "/", limit=2500)
                if not r2_objs:
                    r2_objs = cf_r2_list_objects(prefix=category + "/", limit=2500)
                for obj in r2_objs:
                    fn = os.path.basename(obj.get("key", ""))
                    if os.path.splitext(fn)[1].lower() in valid_extensions:
                        file_names_set.add(fn)
                if empty_only or not overwrite:
                    r2_lbls = cf_r2_list_objects(prefix=storage_info["r2_labels_prefix"] + "/", limit=2500)
                    for lobj in r2_lbls:
                        if lobj.get("size", 0) > 0:
                            existing_label_stems.add(os.path.splitext(os.path.basename(lobj.get("key", "")))[0])
        except Exception as r2_sync_err:
            print(f"[Batch Auto-Label R2 List Warning] {r2_sync_err}")

        all_files = sorted(file_names_set)

        if target_filenames:
            target_set = set(target_filenames)
            all_files = [f for f in all_files if f in target_set]
        elif batch_id:
            b_list = []
            batches_file = ROOT_DIR / f"{category}_labeled" / "batches.json"
            if batches_file.exists():
                try:
                    with open(batches_file, "r", encoding="utf-8") as bf:
                        b_list = json.load(bf)
                except Exception:
                    b_list = []
            if not b_list:
                try:
                    from core.database import cf_d1_load_batches
                    b_list = cf_d1_load_batches(category) or []
                except Exception:
                    b_list = []
            for b in b_list:
                if b.get("id") == batch_id:
                    target_set = set(b.get("images", []))
                    all_files = [f for f in all_files if f in target_set]
                    break

        if empty_only or not overwrite:
            img_files = [f for f in all_files if os.path.splitext(f)[0] not in existing_label_stems]
        else:
            img_files = all_files

        _create_labels_snapshot(category, note="before_batch_label")

        if batch_key not in BATCH_JOBS:
            BATCH_JOBS[batch_key] = {
                "status": "running",
                "category": category,
                "user_id": batch_user_id or "anon",
                "start_time": time.time(),
            }
        BATCH_JOBS[batch_key].update({
            "status": "running",
            "status_message": "Yapay zeka modeli hazırlanıyor...",
            "current": 0,
            "total": len(img_files),
            "newly_labeled": 0,
            "skipped": len(all_files) - len(img_files),
            "errors": 0,
            "stop_requested": False,
            "eta_seconds": None,
            "speed_img_per_sec": None,
            "model_key": model_key,
            "device": _ACTIVE_DEVICE,
        })

        with _MODEL_LOCK:
            model, used_key = get_ai_model(model_key)
            set_classes_if_changed(model, all_prompts)
        BATCH_JOBS[batch_key]["model_key"] = used_key
        BATCH_JOBS[batch_key]["status_message"] = "Etiketleme işleniyor..."

        model2 = None
        if model_key_2 and "cpu" not in str(_ACTIVE_DEVICE):
            try:
                with _MODEL_LOCK:
                    model2, _ = get_ai_model(model_key_2)
                    set_classes_if_changed(model2, all_prompts)
                BATCH_JOBS[batch_key]["ensemble"] = True
            except Exception:
                pass

        config_snap = load_project_config()
        cls_list_snap = _resolve_cls_list(category, config_snap)
        cls_colors = {c.get("id", i): c.get("color", "#00ff00") for i, c in enumerate(cls_list_snap)}

        def _hex_to_bgr(h: str):
            h = h.lstrip("#")
            if len(h) == 6:
                return (int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16))
            return (0, 255, 0)

        t_start = time.time()
        BATCH_CHUNK_SIZE = 8 if "cuda" in _ACTIVE_DEVICE else 1
        processed_count = 0

        for chunk_idx in range(0, len(img_files), BATCH_CHUNK_SIZE):
            if BATCH_JOBS[batch_key].get("stop_requested"):
                BATCH_JOBS[batch_key]["status"] = "stopped"
                break

            chunk_fnames = img_files[chunk_idx:chunk_idx + BATCH_CHUNK_SIZE]
            valid_imgs = []
            valid_stems = []
            valid_fnames = []

            for fname in chunk_fnames:
                stem = os.path.splitext(fname)[0]
                try:
                    img = _load_image_with_r2_fallback(category, fname)
                    if img is not None:
                        valid_imgs.append(img)
                        valid_stems.append(stem)
                        valid_fnames.append(fname)
                    else:
                        BATCH_JOBS[batch_key]["errors"] += 1
                        error_lines.append(f"{fname}: Gorsel okunamadi (disk ve R2)\n")
                except Exception as ex:
                    BATCH_JOBS[batch_key]["errors"] += 1
                    error_lines.append(f"{fname}: {ex}\n")

            if not valid_imgs:
                processed_count += len(chunk_fnames)
                BATCH_JOBS[batch_key]["current"] = processed_count
                continue

            try:
                max_h = max(im.shape[0] for im in valid_imgs)
                max_w = max(im.shape[1] for im in valid_imgs)
                imgsz = _get_imgsz(max_h, max_w)

                with _MODEL_LOCK:
                    set_classes_if_changed(model, all_prompts)
                    batch_results = run_model_predict(model, valid_imgs, conf=conf_threshold, imgsz=imgsz, verbose=False, batch=len(valid_imgs))

                batch_results_2 = None
                if model2 is not None:
                    try:
                        with _MODEL_LOCK:
                            set_classes_if_changed(model2, all_prompts)
                            batch_results_2 = run_model_predict(model2, valid_imgs, conf=conf_threshold, imgsz=imgsz, verbose=False, batch=len(valid_imgs))
                    except Exception:
                        pass

                for i_res, results in enumerate(batch_results):
                    stem = valid_stems[i_res]
                    img = valid_imgs[i_res]
                    h_img, w_img = img.shape[:2]
                    txt_path = labels_dir / f"{stem}.txt"

                    if batch_results_2 and i_res < len(batch_results_2):
                        res2 = batch_results_2[i_res]
                        if (results.boxes is None or len(results.boxes) == 0) and res2.boxes is not None and len(res2.boxes) > 0:
                            results = res2

                    lines = []
                    if results.boxes is not None and len(results.boxes) > 0:
                        xyxyn = results.boxes.xyxyn.cpu().numpy().copy()
                        confs_b = results.boxes.conf.cpu().numpy()
                        cls_idx_b = results.boxes.cls.cpu().numpy().astype(int)

                        kept_idx = filter_boxes(xyxyn, confs_b, cls_idx_b,
                                                iou_thresh=iou_thresh, min_area=0.0004,
                                                max_aspect=12.0, sigma_soft=0.5)

                        for ki in kept_idx:
                            x1, y1, x2, y2 = xyxyn[ki]
                            w = float(x2 - x1)
                            h = float(y2 - y1)
                            xc = float((x1 + x2) / 2.0)
                            yc = float((y1 + y2) / 2.0)
                            p_idx = cls_idx_b[ki]

                            c_id = cls_list_snap[0].get("id", 0)
                            if hasattr(model, 'names') and p_idx in model.names and not hasattr(model, 'set_classes'):
                                m_cls_name = str(model.names[p_idx]).lower().strip()
                                matched = False
                                for c_item in cls_list_snap:
                                    c_item_name = str(c_item.get("name", "")).lower().strip()
                                    c_item_prompts = [str(pr).lower().strip() for pr in c_item.get("prompts", [])]
                                    if m_cls_name == c_item_name or m_cls_name in c_item_prompts or c_item_name in m_cls_name:
                                        c_id = c_item.get("id", 0)
                                        matched = True
                                        break
                                if not matched:
                                    c_id = cls_list_snap[min(p_idx, len(cls_list_snap) - 1)].get("id", 0)
                            else:
                                p_name = all_prompts[p_idx] if p_idx < len(all_prompts) else all_prompts[0]
                                c_id, _ = prompt_to_class.get(p_name,
                                    (cls_list_snap[0].get("id", 0), cls_list_snap[0].get("name", category.capitalize())))

                            s_xc, s_yc, s_w, s_h = safe_bbox(xc, yc, w, h)
                            lines.append(f"{c_id} {s_xc:.6f} {s_yc:.6f} {s_w:.6f} {s_h:.6f}\n")

                    with open(txt_path, "w", encoding="utf-8") as f:
                        f.writelines(lines)
                    # Oluşturulan etiketi Cloudflare R2'ye de yedekle
                    try:
                        if storage_info and storage_info.get("r2_configured"):
                            from core.database import cf_r2_upload
                            cf_r2_upload("".join(lines).encode("utf-8"), f"{storage_info['r2_labels_prefix']}/{txt_path.name}", "text/plain")
                    except Exception:
                        pass

                    if lines:
                        BATCH_JOBS[batch_key]["newly_labeled"] += 1
                        try:
                            preview_img = img.copy()
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
                            pass

            except Exception as ex:
                BATCH_JOBS[batch_key]["errors"] += len(valid_imgs)
                error_lines.append(f"Batch Chunk Error ({chunk_fnames}): {ex}\n")

            processed_count += len(chunk_fnames)
            BATCH_JOBS[batch_key]["current"] = processed_count
            del valid_imgs
            if "cpu" in str(_ACTIVE_DEVICE) and processed_count % 10 == 0:
                gc.collect()

            elapsed = time.time() - t_start
            if elapsed > 0 and processed_count > 0:
                speed = processed_count / elapsed
                remaining = len(img_files) - processed_count
                BATCH_JOBS[batch_key]["speed_img_per_sec"] = round(speed, 2)
                BATCH_JOBS[batch_key]["eta_seconds"] = round(remaining / speed) if speed > 0 else None

        if BATCH_JOBS[batch_key]["status"] != "stopped":
            BATCH_JOBS[batch_key]["status"] = "completed"
            BATCH_JOBS[batch_key]["eta_seconds"] = 0

        if error_lines:
            with open(error_log, "w", encoding="utf-8") as f:
                f.writelines(error_lines)

    except Exception as e:
        if batch_key in BATCH_JOBS:
            BATCH_JOBS[batch_key]["status"] = "failed"
            BATCH_JOBS[batch_key]["error_msg"] = str(e)


@router.post("/api/projects/batch-auto-label")
def start_batch_auto_label(req: BatchAutoLabelRequest, authorization: Optional[str] = Header(None)):
    user = check_project_permission(req.category, authorization, require_edit=True)
    user_id = user.get("id") or user.get("email") or "anon"
    batch_key = _make_batch_key(user_id, req.category)
    cleanup_old_batch_jobs()

    job = BATCH_JOBS.get(batch_key)
    if job and job.get("status") == "running":
        return {"status": "already_running", "job": job}

    BATCH_JOBS[batch_key] = {
        "status": "running",
        "status_message": "Görseller taranıyor ve model hazırlanıyor...",
        "category": req.category,
        "user_id": user_id or "anon",
        "current": 0,
        "total": 0,
        "newly_labeled": 0,
        "skipped": 0,
        "errors": 0,
        "stop_requested": False,
        "start_time": time.time(),
        "eta_seconds": None,
        "speed_img_per_sec": None,
        "model_key": req.model_key,
        "device": _ACTIVE_DEVICE,
    }

    thread = threading.Thread(
        target=_run_batch_auto_label_thread,
        args=(req.category, req.conf_threshold, req.overwrite_existing,
              req.prompts, req.model_key, req.empty_only,
              req.batch_id, req.target_filenames, req.model_key_2),
        kwargs={"batch_user_id": user_id},
        daemon=True
    )
    thread.start()
    return {"status": "started", "category": req.category, "batch_key": batch_key}


@router.get("/api/projects/batch-status")
def get_batch_status(
    category: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    if category:
        user = get_current_user(authorization)
        user_id = (user.get("id") or user.get("email") or "anon") if user else "anon"
        batch_key = _make_batch_key(user_id, category)
        job = dict(BATCH_JOBS.get(batch_key, {"status": "idle"}))
        eta = job.get("eta_seconds")
        if eta is not None and eta > 0:
            mins, secs = divmod(int(eta), 60)
            job["eta_str"] = f"{mins}d {secs}s" if mins else f"{secs}s"
        elif eta == 0:
            job["eta_str"] = "Tamamlandı"
        return job
    return {k: {"status": v.get("status"), "category": v.get("category"), "current": v.get("current"), "total": v.get("total")} for k, v in BATCH_JOBS.items()}


@router.post("/api/projects/batch-stop")
def stop_batch_auto_label(category: str = Query(...), authorization: Optional[str] = Header(None)):
    user = check_project_permission(category, authorization, require_edit=True)
    user_id = (user.get("id") or user.get("email") or "anon") if user else "anon"
    batch_key = _make_batch_key(user_id, category)
    if batch_key in BATCH_JOBS and BATCH_JOBS[batch_key].get("status") == "running":
        BATCH_JOBS[batch_key]["stop_requested"] = True
        return {"status": "stopping", "category": category}
    return {"status": "not_running", "category": category}
