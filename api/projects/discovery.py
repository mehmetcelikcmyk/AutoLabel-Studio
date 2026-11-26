"""
api/projects/discovery.py
Topluluk ve keşfet endpoints:
- /api/projects/public
- /api/projects/{project_id}/public-summary
- /api/projects/fork
- /api/templates/launch-project
- /api/projects/import-url
- /api/templates/custom
"""

import os
import re
import json
import time
import shutil
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.database import cf_d1_query
from core.security import get_current_user, is_admin_user
from api.shared.models import (
    ForkProjectRequest,
    LaunchTemplateProjectRequest,
    ImportDatasetUrlRequest,
    CreateCustomTemplateRequest,
)
from api.shared.utils import (
    safe_project_path,
    sanitize_filename,
    load_project_config,
    save_project_config,
)

router = APIRouter(tags=["Projects Discovery & Templates"])


def get_categories_ref(force_refresh: bool = False):
    from api.projects.core import get_categories
    return get_categories(force_refresh=force_refresh)


@router.get("/api/projects/public")
def get_public_projects():
    cats = get_categories_ref()
    public_cats = [c for c in cats if (c.get("visibility") or "").lower() != "private"]
    return {"projects": public_cats}


@router.get("/api/projects/{project_id}/public-summary")
def get_public_project_summary(
    project_id: str,
    limit: int = Query(50, ge=1, le=500),
    authorization: Optional[str] = Header(None)
):
    """
    Herkese açık (public) veya admin kontrolüyle projenin özetini ve görsellerini döndürür.
    Proje özel (private) ise ve kullanıcı sahibi/admin değilse erişim engellenir.
    """
    clean_id = project_id.strip()
    config = load_project_config()
    proj_info = config.get("projects", {}).get(clean_id) or config.get("projects", {}).get(clean_id.lower())
    if not proj_info:
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    user = get_current_user(authorization)
    user_email = user.get("email", "").lower() if user else None
    is_admin = is_admin_user(user, user_email)

    vis = (proj_info.get("visibility") or "private").lower()
    owner_email = (proj_info.get("owner_email") or "admin").lower()

    if vis == "private" and not is_admin and user_email != owner_email:
        raise HTTPException(status_code=403, detail="Bu proje gizlidir ve yalnızca sahibi veya sistem yöneticisi tarafından incelenebilir.")

    classes_map = config.get("classes", {}).get(clean_id.lower(), [])
    cat_dir = ROOT_DIR / clean_id
    labeled_dir = ROOT_DIR / f"{clean_id}_labeled"
    labels_dir = labeled_dir / "labels"

    img_files = []
    valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    if cat_dir.exists():
        img_files = [f.name for f in cat_dir.iterdir() if f.is_file() and f.suffix.lower() in valid_exts]

    total_images = len(img_files)
    label_count = 0
    if labels_dir.exists():
        label_count = len([f for f in labels_dir.iterdir() if f.is_file() and f.suffix.lower() == ".txt" and f.stat().st_size > 0])

    sample_previews = []
    cls_dict = {c.get("id", i): c for i, c in enumerate(classes_map)}
    for img_name in img_files[:limit]:
        stem = os.path.splitext(img_name)[0]
        txt_path = labels_dir / f"{stem}.txt"
        boxes = []
        if txt_path.exists():
            try:
                with open(txt_path, "r", encoding="utf-8") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 5:
                            cid = int(parts[0])
                            xc, yc, bw, bh = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                            c_info = cls_dict.get(cid, {"name": f"Class {cid}", "color": "#3b82f6"})
                            boxes.append({
                                "class_id": cid,
                                "class_name": c_info.get("name", f"Class {cid}"),
                                "color": c_info.get("color", "#3b82f6"),
                                "x": round(xc - bw / 2, 4),
                                "y": round(yc - bh / 2, 4),
                                "w": round(bw, 4),
                                "h": round(bh, 4)
                            })
            except Exception:
                pass

        sample_previews.append({
            "filename": img_name,
            "image_url": f"/api/image-file?category={clean_id}&filename={urllib.parse.quote(img_name)}",
            "preview_url": f"/api/preview-file?category={clean_id}&filename={urllib.parse.quote(img_name)}" if boxes else f"/api/image-file?category={clean_id}&filename={urllib.parse.quote(img_name)}",
            "boxes": boxes
        })

    owner_email = proj_info.get("owner_email", "admin")
    return {
        "status": "ok",
        "project": {
            "id": clean_id,
            "display_name": proj_info.get("display_name", clean_id.capitalize()),
            "description": proj_info.get("description", ""),
            "visibility": vis,
            "license": proj_info.get("license", "CC BY 4.0"),
            "project_type": proj_info.get("project_type", "detection"),
            "owner_email": owner_email,
            "owner_name": owner_email.split("@")[0] if "@" in owner_email else owner_email,
            "total_images": total_images,
            "total_labeled": label_count,
            "percent": round((label_count / total_images * 100), 1) if total_images > 0 else 0,
            "classes": classes_map,
            "samples": sample_previews
        }
    }


@router.post("/api/projects/fork")
def fork_public_project(req: ForkProjectRequest, authorization: Optional[str] = Header(None)):
    """
    Herkese açık bir projeyi kullanıcının kendi çalışma alanına yeni bir proje olarak klonlar (Fork).
    Orijinal proje asla değiştirilmez; kullanıcının hesabında bağımsız bir kopya oluşur.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Projeyi klonlamak için lütfen giriş yapınız.")

    user_email = user.get("email", "unknown").lower()
    source_id = req.source_project_id.strip()

    config = load_project_config()
    source_meta = config.get("projects", {}).get(source_id) or config.get("projects", {}).get(source_id.lower())
    if not source_meta:
        raise HTTPException(status_code=404, detail="Klonlanacak kaynak proje bulunamadı.")

    src_vis = (source_meta.get("visibility") or "private").lower()
    src_owner = (source_meta.get("owner_email") or "admin").lower()
    if src_vis != "public" and not is_admin_user(user, user_email) and src_owner != user_email:
        raise HTTPException(status_code=403, detail="Yalnızca herkese açık (public) projeler klonlanabilir.")

    safe_prefix = re.sub(r'[^a-zA-Z0-9_]', '', user_email.split('@')[0])
    target_name = (req.new_folder_name or f"{source_id}_{safe_prefix}").strip().lower().replace(" ", "_")
    target_name = re.sub(r'[^a-zA-Z0-9_-]', '_', target_name)

    base_name = target_name
    counter = 1
    while target_name in config.get("projects", {}):
        target_name = f"{base_name}_{counter}"
        counter += 1

    target_display = req.new_display_name or f"{source_meta.get('display_name', source_id)} (Klon)"

    src_dir = ROOT_DIR / source_id
    src_labeled = ROOT_DIR / f"{source_id}_labeled"
    dst_dir = safe_project_path(target_name)
    dst_labeled = safe_project_path(f"{target_name}_labeled")

    dst_dir.mkdir(parents=True, exist_ok=True)
    dst_labels = dst_labeled / "labels"
    dst_previews = dst_labeled / "previews"
    dst_labels.mkdir(parents=True, exist_ok=True)
    dst_previews.mkdir(parents=True, exist_ok=True)

    copied_images = 0
    if src_dir.exists():
        valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        for f in src_dir.iterdir():
            if f.is_file() and f.suffix.lower() in valid_exts:
                shutil.copy2(f, dst_dir / f.name)
                copied_images += 1

    copied_labels = 0
    src_labels_dir = src_labeled / "labels"
    if src_labels_dir.exists():
        for lf in src_labels_dir.iterdir():
            if lf.is_file() and lf.suffix.lower() == ".txt":
                shutil.copy2(lf, dst_labels / lf.name)
                copied_labels += 1

    config.setdefault("projects", {})[target_name] = {
        "display_name": target_display,
        "description": f"@{source_meta.get('owner_email', 'topluluk')} projesinden klonlandı. {source_meta.get('description', '')}",
        "visibility": "private",
        "license": source_meta.get("license", "CC BY 4.0"),
        "project_type": source_meta.get("project_type", "detection"),
        "owner_email": user_email,
        "forked_from": source_id,
        "ai_settings": {"conf": 0.15, "iou": 0.50},
    }

    source_classes = config.get("classes", {}).get(source_id.lower(), [])
    config.setdefault("classes", {})[target_name] = source_classes
    save_project_config(config)

    try:
        created_at = datetime.now(timezone.utc).isoformat()
        cf_d1_query(
            "INSERT OR REPLACE INTO projects (id, display_name, description, project_type, visibility, license, created_at, owner_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [target_name, target_display, config["projects"][target_name]["description"], "detection", "private", "CC BY 4.0", created_at, user_email]
        )
    except Exception as e:
        print(f"[D1 Fork Project Sync Warning] {e}")

    return {
        "status": "ok",
        "message": f"'{source_meta.get('display_name', source_id)}' projesi çalışma alanınıza başarıyla klonlandı.",
        "project_id": target_name,
        "display_name": target_display,
        "copied_images": copied_images,
        "copied_labels": copied_labels
    }


@router.post("/api/templates/launch-project")
def launch_template_project(req: LaunchTemplateProjectRequest, authorization: Optional[str] = Header(None)):
    """
    Bir sektörel şablondan yeni proje oluşturur.
    include_demo_data=True ise şablonun zengin demo görselleri ve etiketleri indirilir ve projeye otomatik eklenir.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Şablondan proje başlatmak için oturum açmanız gerekmektedir.")
    owner_email = user.get("email")

    t_id = req.template_id.strip()
    template_data = None
    try:
        rows = cf_d1_query("SELECT * FROM explore_templates WHERE id = ? LIMIT 1", [t_id])
        if rows and len(rows) > 0:
            template_data = rows[0]
    except Exception as e:
        print(f"[Template lookup error] {e}")

    if not template_data:
        try:
            from scripts.generate_templates import templates
            for t in templates:
                if t["tmpl"] == t_id:
                    template_data = {
                        "id": t["tmpl"],
                        "title": t["title"],
                        "description": t.get("desc", ""),
                        "classes_json": json.dumps([{"id": i, "name": c[0], "color": c[1], "prompts": [c[0].lower()]} for i, c in enumerate(t["classes"])]),
                        "sample_images_json": "[]"
                    }
                    break
        except Exception:
            pass

    if not template_data:
        raise HTTPException(status_code=404, detail="Belirtilen şablon bulunamadı.")

    raw_folder = (req.folder_name or f"{t_id}_projesi").strip().lower().replace(" ", "_")
    folder_name = re.sub(r'[^a-zA-Z0-9_-]', '_', raw_folder)

    config = load_project_config()
    base_name = folder_name
    counter = 1
    while folder_name in config.get("projects", {}):
        folder_name = f"{base_name}_{counter}"
        counter += 1

    display_name = req.display_name or template_data.get("title", folder_name.capitalize())

    proj_dir = ROOT_DIR / folder_name
    labels_dir = ROOT_DIR / f"{folder_name}_labeled" / "labels"
    previews_dir = ROOT_DIR / f"{folder_name}_labeled" / "previews"
    proj_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    classes_list = []
    if template_data.get("classes_json"):
        try:
            classes_list = json.loads(template_data["classes_json"])
        except Exception:
            classes_list = []

    normalized_classes = []
    for i, cls in enumerate(classes_list):
        normalized_classes.append({
            "id": i,
            "name": cls.get("name", f"Class_{i}"),
            "color": cls.get("color", "#3b82f6"),
            "prompts": cls.get("prompts") or [cls.get("name", f"class_{i}").lower()]
        })

    config.setdefault("projects", {})[folder_name] = {
        "display_name": display_name,
        "description": template_data.get("description", ""),
        "visibility": "private",
        "license": "CC BY 4.0",
        "project_type": "detection",
        "owner_email": owner_email,
        "template_id": t_id,
        "ai_settings": {"conf": 0.15, "iou": 0.50},
    }
    config.setdefault("classes", {})[folder_name] = normalized_classes
    save_project_config(config)

    try:
        created_at = datetime.now(timezone.utc).isoformat()
        cf_d1_query(
            "INSERT OR REPLACE INTO projects (id, display_name, description, project_type, visibility, license, created_at, owner_email, classes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [folder_name, display_name, template_data.get("description", ""), "detection", "private", "CC BY 4.0", created_at, owner_email, json.dumps(normalized_classes, ensure_ascii=False)]
        )
    except Exception as e:
        print(f"[D1 Project Sync from Template Warning] {e}")

    seeded_count = 0
    seeded_filenames = []
    if req.include_demo_data and template_data.get("sample_images_json"):
        try:
            import base64
            import cv2
            import numpy as np
            from core.database import cf_r2_upload, cf_d1_save_batches
            from api.shared.utils import get_project_storage_info

            storage = get_project_storage_info(folder_name)
            sample_images = json.loads(template_data["sample_images_json"])
            class_name_to_id = {c["name"].lower(): c["id"] for c in normalized_classes}

            for idx, sample in enumerate(sample_images):
                img_url = sample.get("image_url")
                if not img_url:
                    continue
                safe_img_name = f"demo_{t_id}_{idx + 1}.jpg"
                img_dest = proj_dir / safe_img_name
                txt_dest = labels_dir / f"demo_{t_id}_{idx + 1}.txt"

                try:
                    if img_url.startswith("data:image/"):
                        # Şablona özel sahneyi gerçek 800x600 JPEG görsele dönüştür
                        canvas = np.zeros((600, 800, 3), dtype=np.uint8)
                        canvas[:] = (30, 23, 15)
                        for gx in range(80, 800, 80):
                            cv2.line(canvas, (gx, 0), (gx, 600), (45, 38, 28), 1)
                        for gy in range(60, 600, 60):
                            cv2.line(canvas, (0, gy), (800, gy), (45, 38, 28), 1)
                        cv2.rectangle(canvas, (20, 18), (780, 62), (18, 12, 8), -1)
                        cv2.putText(canvas, f"{t_id.upper()} DEMO #{idx + 1}", (36, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (240, 240, 240), 2)

                        for box in sample.get("boxes", []):
                            bx = int(float(box.get("x", 0.1)) * 800)
                            by = int(float(box.get("y", 0.1)) * 600)
                            bw = int(float(box.get("w", 0.2)) * 800)
                            bh = int(float(box.get("h", 0.2)) * 600)
                            hex_c = (box.get("color") or "#3b82f6").lstrip("#")
                            bgr = (int(hex_c[4:6], 16), int(hex_c[2:4], 16), int(hex_c[0:2], 16)) if len(hex_c) == 6 else (246, 130, 59)
                            overlay = canvas.copy()
                            cv2.rectangle(overlay, (bx + 4, by + 4), (bx + bw - 4, by + bh - 4), bgr, -1)
                            cv2.addWeighted(overlay, 0.28, canvas, 0.72, 0, canvas)
                            cv2.rectangle(canvas, (bx + 4, by + 4), (bx + bw - 4, by + bh - 4), bgr, 2)
                            cx_p, cy_p = bx + bw // 2, by + bh // 2
                            cv2.circle(canvas, (cx_p, cy_p), max(14, min(bw, bh) // 4), bgr, -1)
                            cname_ascii = str(box.get("class_name", "obj"))
                            cv2.putText(canvas, cname_ascii, (max(10, bx + 12), max(28, by + 28)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

                        cv2.imwrite(str(img_dest), canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                    else:
                        req_headers = {"User-Agent": "AutoLabelStudio/2.0"}
                        request_obj = urllib.request.Request(img_url, headers=req_headers)
                        with urllib.request.urlopen(request_obj, timeout=10) as response, open(img_dest, 'wb') as out_file:
                            shutil.copyfileobj(response, out_file)

                    lines = []
                    for box in sample.get("boxes", []):
                        cname = box.get("class_name", "").lower()
                        cid = class_name_to_id.get(cname, 0)
                        bx = float(box.get("x", 0.1))
                        by = float(box.get("y", 0.1))
                        bw = float(box.get("w", 0.2))
                        bh = float(box.get("h", 0.2))
                        cx = round(min(max(bx + bw / 2.0, 0.0), 1.0), 6)
                        cy = round(min(max(by + bh / 2.0, 0.0), 1.0), 6)
                        cw = round(min(max(bw, 0.001), 1.0), 6)
                        ch = round(min(max(bh, 0.001), 1.0), 6)
                        lines.append(f"{cid} {cx} {cy} {cw} {ch}\n")

                    if lines:
                        with open(txt_dest, "w", encoding="utf-8") as tf:
                            tf.writelines(lines)

                    if storage.get("r2_configured"):
                        if img_dest.exists():
                            cf_r2_upload(img_dest.read_bytes(), f"{storage['r2_images_prefix']}/{safe_img_name}", "image/jpeg")
                        if txt_dest.exists():
                            cf_r2_upload(txt_dest.read_bytes(), f"{storage['r2_labels_prefix']}/{txt_dest.name}", "text/plain")

                    seeded_filenames.append(safe_img_name)
                    seeded_count += 1
                except Exception as dl_err:
                    print(f"[Demo Download Error for {safe_img_name}] {dl_err}")

            if seeded_filenames:
                dt_str = datetime.now().strftime("%d.%m.%Y at %H:%M")
                demo_batch = [{
                    "id": f"batch_demo_{t_id}",
                    "name": f"{display_name} Demo Veri Seti",
                    "created_at": dt_str,
                    "images": seeded_filenames,
                    "tags": "Hazır Şablon",
                    "status": "completed",
                    "approved_filenames": list(seeded_filenames),
                    "approved_count": len(seeded_filenames),
                    "annotated_count": len(seeded_filenames),
                    "unassigned_count": 0,
                    "total_count": len(seeded_filenames),
                }]
                batches_file = ROOT_DIR / f"{folder_name}_labeled" / "batches.json"
                with open(batches_file, "w", encoding="utf-8") as bf:
                    json.dump(demo_batch, bf, ensure_ascii=False, indent=2)
                cf_d1_save_batches(folder_name, demo_batch)
                if storage.get("r2_configured"):
                    cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        except Exception as parse_err:
            print(f"[Demo parse error] {parse_err}")

    return {
        "status": "ok",
        "message": f"'{display_name}' projesi {seeded_count} adet etiketli demo görsel ile başarıyla oluşturuldu.",
        "project_id": folder_name,
        "seeded_images_count": seeded_count,
        "classes": normalized_classes
    }


@router.post("/api/projects/import-url")
def import_dataset_from_url(req: ImportDatasetUrlRequest, authorization: Optional[str] = Header(None)):
    """
    Açık topluluk veri setini (Roboflow, Kaggle, HuggingFace, doğrudan ZIP veya web URL)
    sisteme yeni bir veri seti projesi olarak kaydeder ve Cloudflare D1'e senkronize eder.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Veri seti içe aktarmak için lütfen giriş yapınız.")

    owner_email = user.get("email", "admin").lower()
    url = req.url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Geçerli bir HTTP veya HTTPS URL adresi giriniz.")

    if req.folder_name:
        clean_folder = sanitize_filename(req.folder_name).strip().lower().replace(" ", "_")
    else:
        base = req.display_name or url.rstrip("/").split("/")[-1] or "imported_dataset"
        clean_folder = sanitize_filename(base).strip().lower().replace(" ", "_")

    clean_folder = re.sub(r'[^a-zA-Z0-9_-]', '_', clean_folder)
    if not clean_folder:
        clean_folder = f"dataset_{int(time.time())}"

    config = load_project_config()
    target_folder = clean_folder
    counter = 1
    while target_folder in config.get("projects", {}):
        target_folder = f"{clean_folder}_{counter}"
        counter += 1

    display_name = req.display_name or clean_folder.replace("_", " ").capitalize()
    description = req.description or f"Açık veri seti URL kaynağından aktarıldı: {url}"
    visibility = (req.visibility or "public").lower()
    if visibility not in ("public", "private"):
        visibility = "public"
    license_type = req.license or "CC BY 4.0"
    project_type = (req.project_type or "detection").lower()

    proj_dir = ROOT_DIR / target_folder
    labeled_dir = ROOT_DIR / f"{target_folder}_labeled"
    labels_dir = labeled_dir / "labels"
    previews_dir = labeled_dir / "previews"

    proj_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    default_classes = [
        {"id": 0, "name": target_folder.replace("_", " ").capitalize(), "color": "#3b82f6", "prompts": [target_folder.replace("_", " ").lower()]}
    ]

    config.setdefault("projects", {})[target_folder] = {
        "display_name": display_name,
        "description": description,
        "visibility": visibility,
        "license": license_type,
        "project_type": project_type,
        "owner_email": owner_email,
        "source_url": url,
        "ai_settings": {"conf": 0.15, "iou": 0.50}
    }
    config.setdefault("classes", {})[target_folder] = default_classes
    save_project_config(config)

    try:
        created_at = datetime.now(timezone.utc).isoformat()
        cf_d1_query(
            """
            INSERT OR REPLACE INTO projects 
            (id, display_name, description, project_type, visibility, license, created_at, owner_email) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [target_folder, display_name, description, project_type, visibility, license_type, created_at, owner_email]
        )
    except Exception as d1_err:
        print(f"[Import URL D1 Warning] {d1_err}")

    get_categories_ref(force_refresh=True)

    return {
        "status": "ok",
        "message": f"'{display_name}' veri seti URL üzerinden başarıyla kaydedildi ve Cloudflare D1 ile senkronize edildi.",
        "project_id": target_folder,
        "display_name": display_name,
        "visibility": visibility,
        "owner_email": owner_email,
        "source_url": url
    }


@router.post("/api/templates/custom")
def create_custom_template(req: CreateCustomTemplateRequest, authorization: Optional[str] = Header(None)):
    """
    Yeni hazır sektörel şablon oluşturur ve Cloudflare D1 explore_templates tablosuna
    aktif (is_active = 1) olarak kaydeder.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Şablon oluşturmak için oturum açmanız gerekmektedir.")

    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Şablon başlığı boş olamaz.")

    clean_base = re.sub(r'[^a-zA-Z0-9_]', '_', title.lower().replace(" ", "_")).strip('_')
    t_id = f"tpl_{clean_base}_{int(time.time()) % 100000}"

    cat = req.category.strip().lower() or "custom"
    desc = req.description or ""
    rec_model = req.recommended_model or "YOLOv8"
    task_type = req.task_type or "Nesne Tespiti"

    normalized_classes = []
    color_palette = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6"]
    for i, c in enumerate(req.classes or []):
        cname = (c.get("name") or f"Sınıf_{i}").strip()
        ccolor = c.get("color") or color_palette[i % len(color_palette)]
        cprompts = c.get("prompts") or [cname.lower()]
        normalized_classes.append({
            "id": i,
            "name": cname,
            "color": ccolor,
            "prompts": cprompts
        })

    if not normalized_classes:
        normalized_classes = [{"id": 0, "name": title, "color": "#3b82f6", "prompts": [title.lower()]}]

    classes_json = json.dumps(normalized_classes, ensure_ascii=False)
    now_iso = datetime.now(timezone.utc).isoformat()

    sql = """
    INSERT OR REPLACE INTO explore_templates 
    (id, category, title, description, banner_cls, pill_text, badge_title, badge_cls, task_type, recommended_model, classes_json, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    """
    params = [
        t_id, cat, title, desc,
        f"banner-{cat}" if cat in ("safety", "traffic", "industry", "retail") else "banner-safety",
        "Kullanıcı Şablonu",
        "Özel Şablon",
        "badge-custom",
        task_type,
        rec_model,
        classes_json,
        now_iso
    ]

    try:
        cf_d1_query(sql, params)
    except Exception as e:
        print(f"[Create Custom Template D1 Warning] {e}")

    return {
        "status": "ok",
        "message": f"'{title}' şablonu başarıyla oluşturuldu ve hazır şablonlar vitrinine eklendi.",
        "template": {
            "id": t_id,
            "title": title,
            "category": cat,
            "description": desc,
            "classes": normalized_classes,
            "recommended_model": rec_model,
            "is_active": 1
        }
    }
