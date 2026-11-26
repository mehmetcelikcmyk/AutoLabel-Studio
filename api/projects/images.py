"""
api/projects/images.py
Görsel yönetimi, yükleme, listeleme, dosya servis etme, thumbnail ve silme endpoints:
- /api/projects/upload-images (POST)
- /api/images (GET)
- /api/image-file (GET)
- /api/preview-file (GET)
- /api/projects/thumbnail (GET)
- /api/workspace/assets (GET)
- /api/delete-image & /api/delete-file (POST)
- /api/projects/delete-duplicates-bulk (POST)
"""

import os
import cv2
import json
import time
import uuid
import threading
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Header
from fastapi.responses import FileResponse, Response

from pydantic import BaseModel, Field

from core.config import (
    ROOT_DIR,
    MAX_IMAGES_PER_PROJECT,
    MAX_IMAGE_DIMENSION,
    WEBP_OPTIMIZE_QUALITY,
)
from core.database import (
    cf_d1_query,
    cf_d1_save_batches,
    cf_d1_load_batches,
    cf_r2_upload,
    cf_r2_get_object,
    cf_r2_delete_object,
    cf_r2_list_objects,
    cf_r2_generate_presigned_put_url,
    cf_r2_generate_presigned_get_url,
)
from core.security import (
    get_current_user,
    is_admin_user,
    check_project_permission,
)
from services.image_processing import (
    get_or_create_thumbnail,
    optimize_uploaded_image,
)
from api.shared.models import (
    DeleteImageRequest,
    BulkDeleteDuplicatesRequest,
)
from api.shared.utils import (
    MAX_FILE_SIZE_BYTES,
    MAX_BATCH_UPLOAD_COUNT,
    safe_project_path,
    sanitize_filename,
    validate_image_bytes,
    validate_yolo_label_bytes,
    get_project_storage_info,
)

router = APIRouter(tags=["Projects Images & Assets"])

# In-Memory Cache for fast zero-latency /api/images responses
_PROJECT_IMAGES_CACHE: Dict[str, Any] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 30.0

def invalidate_images_cache(category: Optional[str] = None):
    """Belirli bir kategori veya tüm kategoriler için backend resim listesi önbelleğini temizler."""
    with _CACHE_LOCK:
        if category:
            clean = category.strip().lower()
            keys_to_del = [k for k in _PROJECT_IMAGES_CACHE if k.startswith(f"{clean}:")]
            for k in keys_to_del:
                _PROJECT_IMAGES_CACHE.pop(k, None)
        else:
            _PROJECT_IMAGES_CACHE.clear()


def get_categories_ref():
    from api.projects.core import get_categories
    return get_categories()


class PresignedUploadItem(BaseModel):
    filename: str
    content_type: str = "image/jpeg"
    size: Optional[int] = None


class PresignedUploadRequest(BaseModel):
    category: str
    files: List[PresignedUploadItem]


class ConfirmR2UploadFileItem(BaseModel):
    filename: str
    object_key: str
    content_type: Optional[str] = "image/jpeg"
    size: Optional[int] = None


class ConfirmR2UploadRequest(BaseModel):
    category: str
    uploaded_files: List[ConfirmR2UploadFileItem]
    batch_name: Optional[str] = None
    batch_tags: Optional[str] = None


@router.post("/api/projects/presigned-upload-urls")
def get_presigned_upload_urls(
    req: PresignedUploadRequest,
    authorization: Optional[str] = Header(None)
):
    """
    İstemcinin Cloudflare R2'ye doğrudan dosya yükleyebilmesi için
    imzalı S3 PUT URL'leri (Presigned URLs) üretir.
    R2 yapılandırılmamışsa direct_r2_available=False dönerek standart yüklemeye yönlendirir.
    """
    check_project_permission(req.category, authorization, require_edit=True)
    clean_category = sanitize_filename(req.category).lower().replace(" ", "_")
    storage = get_project_storage_info(clean_category)

    if not storage.get("r2_configured"):
        return {
            "status": "fallback",
            "direct_r2_available": False,
            "message": "Cloudflare R2 yapılandırılmamış. Yerel yükleme akışını kullanın."
        }

    valid_img_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    urls = []

    for item in req.files:
        raw_name = item.filename or "upload"
        fname = sanitize_filename(raw_name)
        ext = Path(fname).suffix.lower()

        if ext not in valid_img_extensions:
            continue

        safe_obj_key = f"{storage['r2_images_prefix']}/{fname}"
        ct = item.content_type or ("image/webp" if ext == ".webp" else "image/jpeg")
        presigned_put = cf_r2_generate_presigned_put_url(safe_obj_key, content_type=ct, expires_in=900)

        if presigned_put:
            urls.append({
                "filename": fname,
                "object_key": safe_obj_key,
                "upload_url": presigned_put,
                "content_type": ct
            })

    if not urls:
        return {
            "status": "fallback",
            "direct_r2_available": False,
            "message": "Presigned URL üretilemedi. Standart yüklemeye geçiliyor."
        }

    return {
        "status": "ok",
        "direct_r2_available": True,
        "category": clean_category,
        "files": urls
    }


@router.post("/api/projects/confirm-r2-upload")
def confirm_r2_upload(
    req: ConfirmR2UploadRequest,
    authorization: Optional[str] = Header(None)
):
    """
    İstemcinin Cloudflare R2'ye doğrudan yüklediği dosyaları doğrular,
    proje metadata'sına ve batch kayıtlarına işler.
    """
    check_project_permission(req.category, authorization, require_edit=True)
    clean_category = sanitize_filename(req.category).lower().replace(" ", "_")
    cat_dir = ROOT_DIR / clean_category
    cat_dir.mkdir(parents=True, exist_ok=True)

    storage = get_project_storage_info(clean_category)
    saved_img_names = [f.filename for f in req.uploaded_files if f.filename]

    if not saved_img_names:
        return {"status": "ok", "confirmed_count": 0}

    # Batches JSON ve D1 senkronizasyonu
    current_user = get_current_user(authorization)
    batch_name_val = req.batch_name.strip() if req.batch_name else None
    tags_list = [t.strip() for t in req.batch_tags.split(",") if t.strip()] if req.batch_tags else []

    labeled_dir = ROOT_DIR / f"{clean_category}_labeled"
    labeled_dir.mkdir(parents=True, exist_ok=True)
    batches_file = labeled_dir / "batches.json"
    existing_batches = []
    if batches_file.exists():
        try:
            existing_batches = json.loads(batches_file.read_text(encoding="utf-8"))
        except Exception:
            existing_batches = []
    if not existing_batches:
        try:
            existing_batches = cf_d1_load_batches(clean_category) or []
        except Exception:
            existing_batches = []
    if not existing_batches:
        try:
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                existing_batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            existing_batches = []

    new_batch = {
        "id": f"batch_{int(time.time())}_{uuid.uuid4().hex[:6]}",
        "name": batch_name_val or f"R2 Batch - {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("email") if current_user else "anonymous",
        "tags": ", ".join(tags_list),
        "image_count": len(saved_img_names),
        "label_count": 0,
        "images": saved_img_names,
        "storage": "cloudflare_r2"
    }
    existing_batches.append(new_batch)

    try:
        batches_file.write_text(json.dumps(existing_batches, ensure_ascii=False, indent=2), encoding="utf-8")
        if storage.get("r2_configured"):
            cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        cf_d1_save_batches(clean_category, existing_batches)
    except Exception as e:
        print(f"[Confirm R2 Upload Warning] batches sync error: {e}")

    invalidate_images_cache(clean_category)

    return {
        "status": "ok",
        "confirmed_count": len(saved_img_names),
        "batch_id": new_batch["id"]
    }


@router.post("/api/projects/upload-images")
async def upload_project_images(
    category: str = Form(...),
    files: List[UploadFile] = File(...),
    batch_name: Optional[str] = Form(None),
    batch_tags: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None)
):
    check_project_permission(category, authorization, require_edit=True)

    clean_category = sanitize_filename(category).lower().replace(" ", "_")
    cat_dir = ROOT_DIR / clean_category
    cat_dir.mkdir(parents=True, exist_ok=True)

    labeled_dir = ROOT_DIR / f"{clean_category}_labeled"
    labels_dir = labeled_dir / "labels"
    previews_dir = labeled_dir / "previews"
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    if len(files) > MAX_BATCH_UPLOAD_COUNT:
        raise HTTPException(status_code=400, detail=f"Tek seferde en fazla {MAX_BATCH_UPLOAD_COUNT} dosya yükleyebilirsiniz.")

    valid_img_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    current_img_count = len([f for f in cat_dir.iterdir() if f.is_file() and f.suffix.lower() in valid_img_extensions]) if cat_dir.exists() else 0
    if current_img_count + len(files) > MAX_IMAGES_PER_PROJECT:
        remaining = max(0, MAX_IMAGES_PER_PROJECT - current_img_count)
        raise HTTPException(
            status_code=400,
            detail=f"Proje görsel kotası aşıldı! Projede {current_img_count}/{MAX_IMAGES_PER_PROJECT} görsel mevcut. En fazla {remaining} görsel daha yükleyebilirsiniz."
        )

    saved_images = 0
    saved_labels = 0
    rejected_files = 0
    saved_img_names: List[str] = []
    r2_upload_queue = []

    for file in files:
        raw_name = file.filename or "upload"
        fname = sanitize_filename(raw_name)
        ext = Path(fname).suffix.lower()

        try:
            content = await file.read()
            if len(content) > MAX_FILE_SIZE_BYTES or len(content) == 0:
                rejected_files += 1
                continue

            if ext in valid_img_extensions:
                if validate_image_bytes(content):
                    if ext == ".webp":
                        content_to_save = content
                        final_ext = ".webp"
                        final_fname = fname
                    else:
                        opt_content, new_ext = optimize_uploaded_image(
                            content,
                            max_dim=MAX_IMAGE_DIMENSION,
                            quality=WEBP_OPTIMIZE_QUALITY
                        )
                        content_to_save = opt_content if opt_content else content
                        final_ext = new_ext if new_ext else ext
                        final_fname = f"{Path(fname).stem}{final_ext}"

                    target_path = cat_dir / final_fname
                    with open(target_path, "wb") as buffer:
                        buffer.write(content_to_save)

                    ct = "image/webp" if final_ext == ".webp" else "image/jpeg"
                    r2_upload_queue.append((content_to_save, final_fname, ct))

                    saved_images += 1
                    saved_img_names.append(final_fname)
                else:
                    rejected_files += 1

            elif ext == ".txt":
                if fname.lower() not in {"readme.txt", "requirements.txt", "notes.txt"}:
                    validated_lines = validate_yolo_label_bytes(content)
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

    if saved_img_names:
        batches_file = labeled_dir / "batches.json"
        batches = []
        if batches_file.exists():
            try:
                with open(batches_file, "r", encoding="utf-8") as f:
                    batches = json.load(f)
            except Exception:
                batches = []
        if not batches:
            try:
                batches = cf_d1_load_batches(clean_category) or []
            except Exception:
                batches = []
        if not batches:
            try:
                st_tmp = get_project_storage_info(clean_category)
                r2_b = cf_r2_get_object(f"{st_tmp['r2_project_prefix']}/batches.json")
                if r2_b:
                    batches = json.loads(r2_b.decode("utf-8"))
            except Exception:
                batches = []

        now_dt = datetime.now()
        dt_str = now_dt.strftime("%d.%m.%Y at %H:%M")
        b_title = (batch_name or f"Uploaded on {dt_str}").strip()

        annotated_cnt = 0
        annotated_fnames = []
        unassigned_fnames = []
        for s_fname in saved_img_names:
            stem = Path(s_fname).stem
            txt_path = labels_dir / f"{stem}.txt"
            if txt_path.exists() and txt_path.stat().st_size > 0:
                annotated_cnt += 1
                annotated_fnames.append(s_fname)
            else:
                unassigned_fnames.append(s_fname)

        total_cnt = len(saved_img_names)
        unassigned_cnt = total_cnt - annotated_cnt
        initial_status = "annotating" if annotated_cnt > 0 else "unassigned"

        new_batch = {
            "id": f"batch_{uuid.uuid4().hex[:12]}",
            "name": b_title,
            "created_at": dt_str,
            "images": saved_img_names,
            "tags": (batch_tags or "").strip(),
            "total_count": total_cnt,
            "annotated_count": annotated_cnt,
            "unassigned_count": unassigned_cnt,
            "approved_count": 0,
            "approved_filenames": [],
            "status": initial_status
        }
        batches.append(new_batch)
        try:
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)
            cf_d1_save_batches(clean_category, batches)
            st_info = get_project_storage_info(clean_category)
            if st_info.get("r2_configured"):
                cf_r2_upload(batches_file.read_bytes(), f"{st_info['r2_project_prefix']}/batches.json", "application/json")
        except Exception:
            pass

    if r2_upload_queue:
        def _sync_r2_background(queue_items, cat_name):
            try:
                st_info = get_project_storage_info(cat_name)
                for item_bytes, item_fname, item_ct in queue_items:
                    try:
                        cf_r2_upload(item_bytes, f"{st_info['r2_images_prefix']}/{item_fname}", content_type=item_ct)
                        cf_r2_upload(item_bytes, f"{cat_name}/{item_fname}", content_type=item_ct)
                    except Exception:
                        pass
            except Exception:
                pass

        threading.Thread(
            target=_sync_r2_background,
            args=(r2_upload_queue, clean_category),
            daemon=True
        ).start()

    invalidate_images_cache(clean_category)

    return {
        "status": "ok",
        "category": clean_category,
        "uploaded_count": saved_images,
        "uploaded_labels": saved_labels,
        "rejected_count": rejected_files,
        "message": f"{saved_images} resim ve {saved_labels} etiket güvenle tarandı ve kaydedildi."
    }


@router.get("/api/images")
def list_images(
    category: str = Query(...),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    clean_cat = urllib.parse.unquote(category).strip()
    auth_header = authorization or (f"Bearer {token}" if token else None)
    user = check_project_permission(clean_cat, authorization=auth_header, require_edit=False)

    user_email = (user.get("email") or "").strip().lower()
    cache_key = f"{clean_cat.lower()}:{user_email}"

    import time
    now_ts = time.time()
    with _CACHE_LOCK:
        cached = _PROJECT_IMAGES_CACHE.get(cache_key)
        if cached and (now_ts - cached.get("ts", 0) < _CACHE_TTL_SECONDS):
            return cached["data"]

    cat_dir = safe_project_path(clean_cat)
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    images = []

    label_map: Dict[str, Path] = {}
    if labels_dir.exists():
        for txt in labels_dir.iterdir():
            if txt.suffix == ".txt":
                label_map[txt.stem.lower()] = txt

    file_names_set = set()
    if cat_dir.exists() and cat_dir.is_dir():
        for fname in os.listdir(cat_dir):
            ext = os.path.splitext(fname)[1].lower()
            if ext in valid_extensions:
                file_names_set.add(fname)

    # SADECE yerel diskte hiç görsel yoksa R2 bulut depolamaya ağ sorgusu at (büyük performans kazancı!)
    if not file_names_set:
        st_info = get_project_storage_info(category)
        r2_objs = cf_r2_list_objects(prefix=st_info["r2_images_prefix"], limit=2500)
        if not r2_objs:
            r2_objs = cf_r2_list_objects(prefix=category, limit=2500)

        for obj in r2_objs:
            key = obj.get("key", "")
            fn = os.path.basename(key)
            ext = os.path.splitext(fn)[1].lower()
            if ext in valid_extensions:
                file_names_set.add(fn)

    all_files = sorted(list(file_names_set))
    is_owner_or_captain_or_admin = is_admin_user(user, user_email)

    if not is_owner_or_captain_or_admin and user_email:
        # Projenin public olup olmadığını kontrol et
        is_public_proj = False
        try:
            from core.database import cf_d1_query
            p_rows = cf_d1_query("SELECT visibility FROM projects WHERE id = ? LIMIT 1", [clean_cat])
            if p_rows and p_rows[0].get("visibility") == "public":
                is_public_proj = True
        except Exception:
            pass
        if not is_public_proj:
            try:
                from core.config import CONFIG_FILE
                if CONFIG_FILE.exists():
                    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    if cfg.get("projects", {}).get(clean_cat, {}).get("visibility") == "public":
                        is_public_proj = True
            except Exception:
                pass

        if not is_public_proj:
            st_info = get_project_storage_info(category)
            proj_owner = (st_info.get("owner_email") or "").strip().lower()
            if user_email != proj_owner:
                is_captain = False
                try:
                    from api.teams import _load_teams
                    td = _load_teams()
                    for tm in td.get("teams", []):
                        if clean_cat.lower() in [p.lower() for p in tm.get("projects", [])]:
                            if (tm.get("captain") or "").strip().lower() == user_email:
                                is_captain = True
                                break
                except Exception:
                    pass

                if not is_captain:
                    assigned_images = set()
                    try:
                        from api.teams import _load_team_tasks
                        t_list = _load_team_tasks()
                        for t in t_list:
                            if t.get("category", "").lower() == clean_cat.lower():
                                assigned_to = (t.get("assigned_to") or "").strip().lower()
                                my_username = (user.get("username") or user.get("display_name") or user_email.split("@")[0]).strip().lower()
                                if assigned_to in (user_email, my_username):
                                    for im in t.get("images", []):
                                        assigned_images.add(im)
                    except Exception:
                        pass

                    try:
                        b_file = ROOT_DIR / f"{category}_labeled" / "batches.json"
                        if b_file.exists():
                            with open(b_file, "r", encoding="utf-8") as bf:
                                b_list = json.load(bf)
                            for b in b_list:
                                b_assigned = (b.get("assigned_to") or "").strip().lower()
                                my_username = (user.get("username") or user.get("display_name") or user_email.split("@")[0]).strip().lower()
                                if b_assigned in (user_email, my_username):
                                    for im in b.get("images", []):
                                        assigned_images.add(im)
                    except Exception:
                        pass

                    # Yalnızca kullanıcıya özel atanmış görevler tanımlanmışsa filtrele
                    # Herhangi bir özel atama yoksa proje havuzundaki görseller üyeye açıktır
                    if assigned_images:
                        all_files = [f for f in all_files if f in assigned_images]

    for fname in all_files:
        ext = os.path.splitext(fname)[1].lower()
        if ext in valid_extensions:
            stem = os.path.splitext(fname)[0]
            txt_path = label_map.get(stem.lower())
            has_label = False
            box_count = 0
            if txt_path is not None and txt_path.exists():
                has_label = True
                class_ids = []
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = [line.strip() for line in f if line.strip()]
                        box_count = len(lines)
                        for l in lines:
                            parts = l.split()
                            if parts and parts[0].isdigit():
                                class_ids.append(int(parts[0]))
                except Exception:
                    pass

            images.append({
                "filename": fname,
                "stem": stem,
                "has_label_file": has_label,
                "box_count": box_count,
                "class_ids": list(set(class_ids)) if has_label else []
            })

    labeled_count = sum(1 for img in images if img["box_count"] > 0)
    response_data = {
        "category": category,
        "total_images": len(images),
        "labeled_count": labeled_count,
        "images": images
    }

    # Önbelleğe kaydet
    with _CACHE_LOCK:
        _PROJECT_IMAGES_CACHE[cache_key] = {
            "ts": time.time(),
            "data": response_data
        }

    return response_data


@router.get("/api/image-file")
def get_image_file(
    category: str = Query(...),
    filename: str = Query(...),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    clean_cat = urllib.parse.unquote(category).strip()
    clean_fn = urllib.parse.unquote(filename).strip()
    check_project_permission(clean_cat, authorization=authorization, require_edit=False, query_token=token)

    img_path = safe_project_path(clean_cat, clean_fn)
    if img_path.exists() and img_path.is_file():
        return FileResponse(str(img_path), headers={"Cache-Control": "private, max-age=86400"})

    cat_dir = safe_project_path(clean_cat)
    if cat_dir.exists() and cat_dir.is_dir():
        for f in cat_dir.iterdir():
            if f.name.lower() == clean_fn.lower():
                return FileResponse(str(f), headers={"Cache-Control": "private, max-age=86400"})

    st_info = get_project_storage_info(clean_cat)
    r2_bytes = cf_r2_get_object(f"{st_info['r2_images_prefix']}/{clean_fn}")
    if not r2_bytes:
        r2_bytes = cf_r2_get_object(f"{clean_cat}/{clean_fn}")

    if r2_bytes:
        ext = Path(clean_fn).suffix.lower()
        media_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "application/octet-stream"
        return Response(content=r2_bytes, media_type=media_type, headers={"Cache-Control": "private, max-age=86400"})

    raise HTTPException(status_code=404, detail="Resim bulunamadı.")


@router.get("/api/preview-file")
def get_preview_file(
    category: str = Query(...),
    filename: str = Query(...),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    clean_cat = urllib.parse.unquote(category).strip()
    clean_fn = urllib.parse.unquote(filename).strip()
    check_project_permission(clean_cat, authorization=authorization, require_edit=False, query_token=token)
    stem = os.path.splitext(clean_fn)[0]

    cat_dir = safe_project_path(clean_cat)
    labeled_dir = safe_project_path(f"{clean_cat}_labeled")
    previews_dir = labeled_dir / "previews"
    labels_dir = labeled_dir / "labels"
    previews_dir.mkdir(parents=True, exist_ok=True)

    preview_path = previews_dir / f"{stem}.jpg"
    txt_path = labels_dir / f"{stem}.txt"

    img_path = safe_project_path(clean_cat, clean_fn)
    if not img_path.exists():
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
            alt_path = cat_dir / f"{stem}{ext}"
            if alt_path.exists():
                img_path = alt_path
                break

    if txt_path.exists() and txt_path.stat().st_size > 0 and img_path.exists():
        try:
            with open(img_path, "rb") as f:
                img_bytes = np.frombuffer(f.read(), np.uint8)
                img = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

            if img is not None:
                h, w = img.shape[:2]
                with open(txt_path, "r", encoding="utf-8") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) == 5:
                            cid, xc, yc, bw, bh = int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                            x1 = int((xc - bw / 2) * w)
                            y1 = int((yc - bh / 2) * h)
                            x2 = int((xc + bw / 2) * w)
                            y2 = int((yc + bh / 2) * h)
                            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.imwrite(str(preview_path), img)
                return FileResponse(str(preview_path))
        except Exception:
            pass

    if img_path.exists():
        return FileResponse(str(img_path))

    raise HTTPException(status_code=404, detail="Önizleme oluşturulamadı.")


@router.get("/api/projects/thumbnail")
def get_project_thumbnail(category: str = Query(...), filename: str = Query(...), size: int = Query(280), authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmanız gerekiyor.")
    check_project_permission(category, authorization, require_edit=False)

    clean_filename = os.path.basename(filename)
    if not clean_filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")

    cat_dir = (ROOT_DIR / category).resolve()
    if not cat_dir.exists():
        if category == "bag" and (ROOT_DIR / "bag_detection_project").exists():
            cat_dir = (ROOT_DIR / "bag_detection_project").resolve()
        elif category == "bag_detection_project" and (ROOT_DIR / "bag").exists():
            cat_dir = (ROOT_DIR / "bag").resolve()

    img_path = (cat_dir / clean_filename).resolve()
    if not str(img_path).startswith(str(cat_dir)) or not img_path.exists():
        raise HTTPException(status_code=404, detail="Görsel bulunamadı.")

    thumb_path = get_or_create_thumbnail(img_path, max_size=size)
    if thumb_path and thumb_path.exists():
        return FileResponse(thumb_path, media_type="image/jpeg")
    return FileResponse(img_path)


@router.get("/api/workspace/assets")
def get_workspace_assets(
    category: Optional[str] = None,
    workspace_id: Optional[str] = None,
    filter_status: str = "all",
    search: Optional[str] = None,
    limit: int = 200,
    authorization: Optional[str] = Header(None)
):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")

    user_email = (user.get("email") or "").strip().lower()

    member_proj_ids = set()
    try:
        m_rows = cf_d1_query(
            "SELECT pm.project_id FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE LOWER(u.email) = ?",
            [user_email]
        ) or []
        member_proj_ids = {r["project_id"] for r in m_rows if r.get("project_id")}
    except Exception:
        pass

    cats = get_categories_ref()
    accessible_cats = []

    for c in cats:
        c_id = c.get("id")
        c_owner = (c.get("owner_email") or "").strip().lower()
        c_ws = c.get("workspace_id")

        is_owner = bool(c_owner and c_owner == user_email)
        is_member = c_id in member_proj_ids

        ws_match = True
        if workspace_id:
            ws_match = (c_ws == workspace_id)

        if (is_owner or is_member) and ws_match:
            accessible_cats.append(c)

    valid_cats = [c["id"] for c in accessible_cats]
    target_cats = [category] if category and category in valid_cats else valid_cats

    all_assets = []
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    for cat_id in target_cats:
        cat_dir = ROOT_DIR / cat_id
        labels_dir = ROOT_DIR / f"{cat_id}_labeled" / "labels"
        if not cat_dir.exists() or not cat_dir.is_dir():
            continue

        cat_name = next((c["name"] for c in accessible_cats if c["id"] == cat_id), cat_id)

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


@router.post("/api/delete-image")
@router.post("/api/delete-file")
def delete_image(req: DeleteImageRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True, require_owner=False)

    cat = sanitize_filename(req.category).strip()
    fname = sanitize_filename(req.filename).strip()
    if not cat or not fname:
        raise HTTPException(status_code=400, detail="Geçersiz kategori veya dosya adı.")
    stem = os.path.splitext(fname)[0]

    img_path = safe_project_path(cat, fname)
    labeled_dir = safe_project_path(f"{cat}_labeled")
    txt_path = (labeled_dir / "labels" / f"{stem}.txt").resolve()
    preview_path = (labeled_dir / "previews" / f"{stem}.jpg").resolve()

    deleted_files = []
    if img_path.exists() and img_path.is_file():
        try:
            img_path.unlink()
            deleted_files.append(str(img_path))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Resim dosyası silinemedi: {str(e)}")

    if txt_path.exists() and txt_path.is_file():
        try:
            txt_path.unlink()
            deleted_files.append(str(txt_path))
        except Exception:
            pass

    if preview_path.exists() and preview_path.is_file():
        try:
            preview_path.unlink()
            deleted_files.append(str(preview_path))
        except Exception:
            pass

    # R2 silme
    try:
        storage = get_project_storage_info(cat)
        cf_r2_delete_object(f"{storage['r2_images_prefix']}/{fname}")
        cf_r2_delete_object(f"{cat}/{fname}")
        cf_r2_delete_object(f"{storage['r2_labels_prefix']}/{stem}.txt")
        cf_r2_delete_object(f"{cat}_labeled/labels/{stem}.txt")
    except Exception as r2_err:
        print(f"[R2 delete warning]: {r2_err}")

    try:
        cache_file = ROOT_DIR / f"{cat}_labeled" / "dhash_cache.json"
        if cache_file.exists():
            with open(cache_file, "r", encoding="utf-8") as fp:
                dhash_cache = json.load(fp)
            if fname in dhash_cache:
                del dhash_cache[fname]
                with open(cache_file, "w", encoding="utf-8") as fp:
                    json.dump(dhash_cache, fp)
    except Exception:
        pass

    try:
        batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
        if batches_file.exists():
            with open(batches_file, "r", encoding="utf-8") as bf:
                batches = json.load(bf)
            batch_changed = False
            for b in batches:
                b_imgs = b.get("images", [])
                if fname in b_imgs:
                    b_imgs.remove(fname)
                    b["images"] = b_imgs
                    batch_changed = True

                app_imgs = b.get("approved_filenames", [])
                if fname in app_imgs:
                    app_imgs.remove(fname)
                    b["approved_filenames"] = app_imgs
                    batch_changed = True

                ret_imgs = b.get("returned_filenames", [])
                if fname in ret_imgs:
                    ret_imgs.remove(fname)
                    b["returned_filenames"] = ret_imgs
                    batch_changed = True

                if batch_changed:
                    b["total_count"] = len(b_imgs)
                    b["approved_count"] = len(b.get("approved_filenames", []))

            if batch_changed:
                with open(batches_file, "w", encoding="utf-8") as bf:
                    json.dump(batches, bf, ensure_ascii=False, indent=2)
                cf_d1_save_batches(cat, batches)
                try:
                    storage = get_project_storage_info(cat)
                    cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
                except Exception:
                    pass
    except Exception as batch_err:
        print(f"[Batches sync warning on delete]: {batch_err}")

    invalidate_images_cache(cat)

    return {
        "status": "ok",
        "category": cat,
        "filename": fname,
        "deleted_count": len(deleted_files)
    }


@router.post("/api/projects/delete-duplicates-bulk")
def delete_duplicates_bulk(req: BulkDeleteDuplicatesRequest, authorization: Optional[str] = Header(None)):
    cat = sanitize_filename(req.category).strip()
    check_project_permission(cat, authorization, require_edit=True, require_owner=False)

    cat_dir = safe_project_path(cat)
    if not cat_dir.exists():
        raise HTTPException(status_code=404, detail="Proje klasörü bulunamadı.")

    to_delete = [sanitize_filename(f).strip() for f in req.filenames if sanitize_filename(f).strip()] if req.filenames else []
    if not to_delete:
        return {"status": "ok", "category": cat, "deleted_count": 0, "message": "Silinecek görsel belirtilmedi."}

    to_delete_set = set(to_delete)
    labeled_dir = safe_project_path(f"{cat}_labeled")
    labels_dir = (labeled_dir / "labels").resolve()
    previews_dir = (labeled_dir / "previews").resolve()
    cache_file = (labeled_dir / "dhash_cache.json").resolve()

    deleted_count = 0
    dhash_cache = {}
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as fp:
                dhash_cache = json.load(fp)
        except Exception:
            pass

    storage = None
    try:
        storage = get_project_storage_info(cat)
    except Exception:
        pass

    for fname in to_delete:
        stem = os.path.splitext(fname)[0]
        img_p = safe_project_path(cat, fname)
        txt_p = (labels_dir / f"{stem}.txt").resolve()
        prv_p = (previews_dir / f"{stem}.jpg").resolve()

        if img_p.exists():
            try:
                img_p.unlink()
                deleted_count += 1
            except Exception:
                pass

        if txt_p.exists():
            try:
                txt_p.unlink()
            except Exception:
                pass

        if prv_p.exists():
            try:
                prv_p.unlink()
            except Exception:
                pass

        if storage:
            try:
                # 1. Kullanıcı bazlı R2 dizini: users/{owner}/{ws}/{cat}/images/{fname}
                r2_img_del = cf_r2_delete_object(f"{storage['r2_images_prefix']}/{fname}")
                # 2. Kök proje dizini fallback: {cat}/{fname}
                cf_r2_delete_object(f"{cat}/{fname}")
                # 3. R2 etiketleri
                cf_r2_delete_object(f"{storage['r2_labels_prefix']}/{stem}.txt")
                cf_r2_delete_object(f"{cat}_labeled/labels/{stem}.txt")
                print(f"[R2 BULK DELETE] {fname} silindi mi: {r2_img_del}")
            except Exception as r2_del_err:
                print(f"[R2 BULK DELETE ERROR] {fname}: {r2_del_err}")

        if fname in dhash_cache:
            del dhash_cache[fname]

    try:
        if cache_file.exists():
            with open(cache_file, "w", encoding="utf-8") as fp:
                json.dump(dhash_cache, fp)
    except Exception:
        pass

    # batches.json, Cloudflare D1 ve R2 batches senkronizasyonu
    try:
        batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
        if batches_file.exists():
            with open(batches_file, "r", encoding="utf-8") as bf:
                batches = json.load(bf)
            batch_changed = False
            for b in batches:
                b_imgs = b.get("images", [])
                initial_len = len(b_imgs)
                new_imgs = [img for img in b_imgs if img not in to_delete_set]
                if len(new_imgs) != initial_len:
                    b["images"] = new_imgs
                    batch_changed = True

                app_imgs = b.get("approved_filenames", [])
                new_app = [img for img in app_imgs if img not in to_delete_set]
                if len(new_app) != len(app_imgs):
                    b["approved_filenames"] = new_app
                    batch_changed = True

                ret_imgs = b.get("returned_filenames", [])
                new_ret = [img for img in ret_imgs if img not in to_delete_set]
                if len(new_ret) != len(ret_imgs):
                    b["returned_filenames"] = new_ret
                    batch_changed = True

                if batch_changed:
                    b["total_count"] = len(b.get("images", []))
                    b["approved_count"] = len(b.get("approved_filenames", []))

            if batch_changed:
                with open(batches_file, "w", encoding="utf-8") as bf:
                    json.dump(batches, bf, ensure_ascii=False, indent=2)
                cf_d1_save_batches(cat, batches)
                if storage:
                    try:
                        cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
                    except Exception:
                        pass
    except Exception as batch_err:
        print(f"[Batches sync warning on bulk duplicates delete]: {batch_err}")

    return {
        "status": "ok",
        "category": cat,
        "deleted_count": deleted_count,
        "message": f"Toplam {deleted_count} adet mükerrer kopya görsel veritabanı ve diskten başarıyla temizlendi."
    }
