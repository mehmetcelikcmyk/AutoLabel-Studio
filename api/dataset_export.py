import os
import re
import json
import shutil
import random
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Query, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image

from core.config import ROOT_DIR
from core.security import check_project_permission
from core.database import cf_r2_upload, cf_r2_generate_presigned_get_url
from services.image_processing import load_image_rgb, save_image_preview

router = APIRouter(tags=["Dataset Export"])

DEFAULT_CLASS_MAPPING = {
    "bag": {"id": 0, "name": "Bag", "color": "#3b82f6", "prompts": ["bag", "handbag", "backpack"]},
    "belt": {"id": 1, "name": "Belt", "color": "#10b981", "prompts": ["belt", "leather belt"]},
}

class ExportZipRequest(BaseModel):
    category: str
    train_ratio: float = 0.80
    test_ratio: float = 0.0
    batch_id: Optional[str] = None

class AugmentedExportRequest(BaseModel):
    category: str
    train_ratio: float = 0.80
    test_ratio: float = 0.0
    augmentations: List[str] = ["flip_h", "brightness", "rotate"]
    copies: int = 2

def load_project_config() -> Dict[str, Any]:
    config_file = ROOT_DIR / "project_config.json"
    if config_file.exists():
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"projects": {}, "classes": DEFAULT_CLASS_MAPPING}

def resolve_cls_list(category: str, config: Dict) -> List[Dict]:
    classes_map = config.get("classes", DEFAULT_CLASS_MAPPING)
    cat_key = category.lower()
    cls_raw = classes_map.get(cat_key)
    if isinstance(cls_raw, list) and cls_raw:
        return cls_raw
    if isinstance(cls_raw, dict):
        return [cls_raw]
    return [{"id": 0, "name": category.capitalize(), "prompts": [cat_key]}]


@router.post("/api/projects/export-zip")
@router.post("/api/projects/export-yolo")
def export_dataset_zip(req: ExportZipRequest, authorization: Optional[str] = Header(None)):
    """Split dataset into Train/Val/Test splits, generate data.yaml, and package into a ZIP file."""
    cat = req.category
    check_project_permission(cat, authorization, require_edit=False)
    cat_dir = ROOT_DIR / cat
    labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
    
    if not cat_dir.exists() or not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Kategori veya etiket klasörü bulunamadı.")

    batch_img_set = None
    batch_name_clean = None
    if req.batch_id:
        batches_path = ROOT_DIR / f"{cat}_labeled" / "batches.json"
        if batches_path.exists():
            try:
                b_list = json.loads(batches_path.read_text(encoding="utf-8"))
                for b in b_list:
                    if b.get("id") == req.batch_id:
                        batch_img_set = set(b.get("images") or [])
                        batch_name_clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', (b.get("name") or req.batch_id).strip())
                        break
            except Exception:
                pass

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
                if batch_img_set is not None and found_img.name not in batch_img_set:
                    continue
                pairs.append((found_img, txt_file))

    if len(pairs) == 0:
        if batch_img_set:
            raw_export_dir = ROOT_DIR / "exports" / f"{cat}_{batch_name_clean or 'batch'}_raw"
            if raw_export_dir.exists():
                shutil.rmtree(raw_export_dir, ignore_errors=True)
            (raw_export_dir / "images").mkdir(parents=True, exist_ok=True)
            for fn in batch_img_set:
                p = cat_dir / fn
                if p.exists():
                    shutil.copy2(p, raw_export_dir / "images" / p.name)
            zip_base = ROOT_DIR / "exports" / f"{cat}_{batch_name_clean or 'batch'}_dataset"
            zip_path = shutil.make_archive(str(zip_base), "zip", raw_export_dir)
            zip_filename = os.path.basename(zip_path)
            file_size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 2)
            return {
                "status": "ok",
                "format": "Raw Images",
                "zip_file": zip_filename,
                "download_url": f"/api/download-zip?filename={zip_filename}",
                "file_size_mb": file_size_mb,
                "total_images": len(batch_img_set),
                "train_count": 0,
                "val_count": 0,
                "test_count": 0
            }
        raise HTTPException(status_code=400, detail="Dışa aktarılacak etiketli görsel bulunamadı.")

    random.seed(42)
    random.shuffle(pairs)

    test_r = max(0.0, min(req.test_ratio, 0.30))
    train_r = req.train_ratio
    total = len(pairs)
    n_test  = int(total * test_r)
    n_train = int(total * train_r)
    n_val   = total - n_train - n_test
    if n_val < 0:
        n_val = 0
        n_train = total - n_test

    train_pairs = pairs[:n_train]
    val_pairs   = pairs[n_train:n_train + n_val]
    test_pairs  = pairs[n_train + n_val:]

    export_dir = ROOT_DIR / "exports" / f"{cat}_yolo_export"
    if export_dir.exists():
        try:
            shutil.rmtree(export_dir)
        except Exception:
            pass

    splits_to_create = ["train", "val"]
    if n_test > 0:
        splits_to_create.append("test")

    for split in splits_to_create:
        (export_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (export_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    for img_p, lbl_p in train_pairs:
        shutil.copy2(img_p, export_dir / "images/train" / img_p.name)
        shutil.copy2(lbl_p, export_dir / "labels/train" / lbl_p.name)

    for img_p, lbl_p in val_pairs:
        shutil.copy2(img_p, export_dir / "images/val" / img_p.name)
        shutil.copy2(lbl_p, export_dir / "labels/val" / lbl_p.name)

    for img_p, lbl_p in test_pairs:
        shutil.copy2(img_p, export_dir / "images/test" / img_p.name)
        shutil.copy2(lbl_p, export_dir / "labels/test" / lbl_p.name)

    config = load_project_config()
    cls_list = resolve_cls_list(cat, config)
    names_lines = [f"  {c.get('id', i)}: {c.get('name', f'Class_{i}')}" for i, c in enumerate(cls_list)]
    names_yaml = "\n".join(names_lines)

    test_yaml_line = "\ntest: images/test" if n_test > 0 else ""
    yaml_content = f"""# YOLO Dataset Configuration
path: {cat}_dataset
train: images/train
val: images/val{test_yaml_line}

# Split info: {n_train} train / {n_val} val{f' / {n_test} test' if n_test > 0 else ''}
names:
{names_yaml}
"""
    with open(export_dir / "data.yaml", "w", encoding="utf-8") as f:
        f.write(yaml_content)

    zip_base = ROOT_DIR / "exports" / f"{cat}_yolo_dataset"
    zip_path = shutil.make_archive(str(zip_base), "zip", export_dir)
    zip_filename = os.path.basename(zip_path)
    file_size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 2)

    r2_download_url = None
    try:
        r2_key = f"exports/{zip_filename}"
        if cf_r2_upload(Path(zip_path).read_bytes(), r2_key, "application/zip"):
            r2_download_url = cf_r2_generate_presigned_get_url(r2_key, expires_in=7200)
    except Exception as e:
        print(f"[R2 Export Warning] {e}")

    return {
        "status": "ok",
        "format": "YOLO TXT",
        "zip_file": zip_filename,
        "download_url": f"/api/download-zip?filename={zip_filename}",
        "r2_download_url": r2_download_url,
        "file_size_mb": file_size_mb,
        "total_images": total,
        "train_count": n_train,
        "val_count": n_val,
        "test_count": n_test,
    }


@router.get("/api/projects/export-zip")
@router.get("/api/projects/export_zip")
def export_dataset_zip_get(
    category: str = Query(...),
    train_ratio: float = Query(0.80),
    test_ratio: float = Query(0.0),
    batch_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Tarayıcıdan doğrudan tek tıkla ZIP indirme desteği."""
    check_project_permission(category, authorization, require_edit=False, query_token=token)
    req = ExportZipRequest(category=category, train_ratio=train_ratio, test_ratio=test_ratio, batch_id=batch_id)
    # Auth header yoksa token'dan auth oluştur
    auth_header = authorization or (f"Bearer {token}" if token else None)
    res = export_dataset_zip(req, auth_header)
    zip_filename = res.get("zip_file")
    zip_path = ROOT_DIR / "exports" / zip_filename
    if zip_path.exists():
        return FileResponse(
            path=str(zip_path),
            filename=zip_filename,
            media_type="application/zip"
        )
    return res


@router.post("/api/projects/export-coco")
def export_coco_json(req: ExportZipRequest, authorization: Optional[str] = Header(None)):
    """Veri setini COCO JSON formatında dışa aktarır."""
    cat = req.category
    check_project_permission(cat, authorization, require_edit=False)
    cat_dir = ROOT_DIR / cat
    labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
    if not cat_dir.exists() or not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Proje veya etiket klasörü bulunamadı.")

    config = load_project_config()
    cls_list = resolve_cls_list(cat, config)

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    pairs = []
    for txt in labels_dir.glob("*.txt"):
        if txt.stat().st_size > 0:
            stem = txt.stem
            for ext in valid_ext:
                cand = cat_dir / f"{stem}{ext}"
                if cand.exists():
                    pairs.append((cand, txt))
                    break

    if not pairs:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak etiketli görsel bulunamadı.")

    random.seed(42)
    random.shuffle(pairs)

    test_r = max(0.0, min(req.test_ratio, 0.30))
    train_r = req.train_ratio
    total = len(pairs)
    n_test  = int(total * test_r)
    n_train = int(total * train_r)
    n_val   = total - n_train - n_test
    if n_val < 0:
        n_val = 0
        n_train = total - n_test

    splits = {
        "train": pairs[:n_train],
        "val":   pairs[n_train:n_train + n_val],
        "test":  pairs[n_train + n_val:]
    }

    export_dir = ROOT_DIR / "exports" / f"{cat}_coco_export"
    if export_dir.exists():
        try:
            shutil.rmtree(export_dir)
        except Exception:
            pass

    for split_name, split_pairs in splits.items():
        if not split_pairs and split_name == "test":
            continue

        split_img_dir = export_dir / split_name
        split_img_dir.mkdir(parents=True, exist_ok=True)
        ann_dir = export_dir / "annotations"
        ann_dir.mkdir(parents=True, exist_ok=True)

        coco_data = {
            "info": {
                "description": f"{cat} COCO Dataset",
                "version": "1.0",
                "year": datetime.now().year,
                "date_created": datetime.now().strftime("%Y/%m/%d")
            },
            "licenses": [{"id": 1, "name": "Unknown"}],
            "categories": [{"id": c["id"] + 1, "name": c["name"], "supercategory": "none"} for c in cls_list],
            "images": [],
            "annotations": []
        }

        ann_id = 1
        for img_id, (img_path, txt_path) in enumerate(split_pairs, start=1):
            shutil.copy2(img_path, split_img_dir / img_path.name)
            try:
                with Image.open(img_path) as im:
                    w, h = im.size
            except Exception:
                continue

            coco_data["images"].append({
                "id": img_id,
                "file_name": img_path.name,
                "width": w,
                "height": h
            })

            try:
                with open(txt_path, "r", encoding="utf-8") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) == 5:
                            cid = int(parts[0])
                            xc, yc, bw, bh = map(float, parts[1:])
                            abs_w = bw * w
                            abs_h = bh * h
                            abs_x = (xc * w) - (abs_w / 2.0)
                            abs_y = (yc * h) - (abs_h / 2.0)
                            area = abs_w * abs_h

                            coco_data["annotations"].append({
                                "id": ann_id,
                                "image_id": img_id,
                                "category_id": cid + 1,
                                "bbox": [round(abs_x, 2), round(abs_y, 2), round(abs_w, 2), round(abs_h, 2)],
                                "area": round(area, 2),
                                "segmentation": [],
                                "iscrowd": 0
                            })
                            ann_id += 1
            except Exception:
                pass

        ann_file = ann_dir / f"instances_{split_name}.json"
        with open(ann_file, "w", encoding="utf-8") as f:
            json.dump(coco_data, f, indent=2, ensure_ascii=False)

    zip_filename = f"{cat}_coco_export.zip"
    zip_path = ROOT_DIR / "exports" / zip_filename
    if zip_path.exists():
        try:
            zip_path.unlink()
        except Exception:
            pass

    shutil.make_archive(str(export_dir), 'zip', export_dir)

    try:
        shutil.rmtree(export_dir)
    except Exception:
        pass

    file_size_mb = round(zip_path.stat().st_size / (1024 * 1024), 2) if zip_path.exists() else 0.0

    r2_download_url = None
    try:
        r2_key = f"exports/{zip_filename}"
        if zip_path.exists() and cf_r2_upload(zip_path.read_bytes(), r2_key, "application/zip"):
            r2_download_url = cf_r2_generate_presigned_get_url(r2_key, expires_in=7200)
    except Exception as e:
        print(f"[R2 COCO Export Warning] {e}")

    return {
        "status": "ok",
        "format": "COCO JSON",
        "total_exported": len(pairs),
        "train_count": n_train,
        "val_count": n_val,
        "test_count": n_test,
        "file_size_mb": file_size_mb,
        "download_url": f"/api/download-zip?filename={zip_filename}",
        "r2_download_url": r2_download_url,
    }


@router.post("/api/projects/export-voc")
def export_pascal_voc(req: ExportZipRequest, authorization: Optional[str] = Header(None)):
    """Veri setini Pascal VOC XML formatında dışa aktarır."""
    cat = req.category
    check_project_permission(cat, authorization, require_edit=False)
    cat_dir = ROOT_DIR / cat
    labels_dir = ROOT_DIR / f"{cat}_labeled" / "labels"
    if not cat_dir.exists() or not labels_dir.exists():
        raise HTTPException(status_code=404, detail="Proje veya etiket klasörü bulunamadı.")

    config = load_project_config()
    cls_list = resolve_cls_list(cat, config)
    cls_names = {c["id"]: c["name"] for c in cls_list}

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    pairs = []
    for txt_f in labels_dir.glob("*.txt"):
        if txt_f.stat().st_size == 0:
            continue
        stem = txt_f.stem
        for ext in valid_ext:
            cand = cat_dir / f"{stem}{ext}"
            if cand.exists():
                pairs.append((cand, txt_f))
                break

    if not pairs:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak etiketli görsel bulunamadı.")

    random.seed(42)
    random.shuffle(pairs)
    total = len(pairs)
    test_r = max(0.0, min(req.test_ratio, 0.30))
    n_test  = int(total * test_r)
    n_train = int(total * req.train_ratio)
    n_val   = total - n_train - n_test
    if n_val < 0:
        n_val = 0
        n_train = total - n_test

    train_pairs = pairs[:n_train]
    val_pairs   = pairs[n_train:n_train + n_val]
    test_pairs  = pairs[n_train + n_val:]

    export_dir = ROOT_DIR / "exports" / f"{cat}_voc_export"
    if export_dir.exists():
        shutil.rmtree(export_dir)
    for sub in ["JPEGImages", "Annotations", "ImageSets/Main"]:
        (export_dir / sub).mkdir(parents=True, exist_ok=True)

    train_names, val_names, test_names = [], [], []
    train_set = {p for p, _ in train_pairs}
    val_set   = {p for p, _ in val_pairs}

    for img_path, txt_path in (train_pairs + val_pairs + test_pairs):
        try:
            with Image.open(img_path) as pil_img:
                iw, ih = pil_img.size
        except Exception:
            iw, ih = 640, 640

        shutil.copy2(img_path, export_dir / "JPEGImages" / img_path.name)
        root_el = ET.Element("annotation")
        ET.SubElement(root_el, "folder").text    = "JPEGImages"
        ET.SubElement(root_el, "filename").text  = img_path.name
        size_el = ET.SubElement(root_el, "size")
        ET.SubElement(size_el, "width").text     = str(iw)
        ET.SubElement(size_el, "height").text    = str(ih)
        ET.SubElement(size_el, "depth").text     = "3"

        for line in txt_path.read_text(encoding="utf-8").strip().splitlines():
            parts = line.split()
            if len(parts) == 5:
                try:
                    cid = int(parts[0])
                    xc  = float(parts[1]) * iw
                    yc  = float(parts[2]) * ih
                    bw  = float(parts[3]) * iw
                    bh  = float(parts[4]) * ih
                    obj_el = ET.SubElement(root_el, "object")
                    ET.SubElement(obj_el, "name").text       = cls_names.get(cid, f"class_{cid}")
                    ET.SubElement(obj_el, "difficult").text  = "0"
                    bndbox = ET.SubElement(obj_el, "bndbox")
                    ET.SubElement(bndbox, "xmin").text = str(int(xc - bw / 2))
                    ET.SubElement(bndbox, "ymin").text = str(int(yc - bh / 2))
                    ET.SubElement(bndbox, "xmax").text = str(int(xc + bw / 2))
                    ET.SubElement(bndbox, "ymax").text = str(int(yc + bh / 2))
                except ValueError:
                    pass

        xml_str = ET.tostring(root_el, encoding="unicode", xml_declaration=False)
        (export_dir / "Annotations" / (img_path.stem + ".xml")).write_text('<?xml version="1.0"?>\n' + xml_str, encoding="utf-8")

        if img_path in train_set:
            train_names.append(img_path.stem)
        elif img_path in val_set:
            val_names.append(img_path.stem)
        else:
            test_names.append(img_path.stem)

    (export_dir / "ImageSets" / "Main" / "train.txt").write_text("\n".join(train_names))
    (export_dir / "ImageSets" / "Main" / "val.txt").write_text("\n".join(val_names))
    if n_test > 0:
        (export_dir / "ImageSets" / "Main" / "test.txt").write_text("\n".join(test_names))

    zip_base = ROOT_DIR / "exports" / f"{cat}_voc_dataset"
    zip_path = shutil.make_archive(str(zip_base), "zip", export_dir)
    zip_filename = os.path.basename(zip_path)
    file_size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 2)

    return {
        "status": "ok",
        "format": "Pascal VOC XML",
        "total_exported": len(pairs),
        "train_count": n_train,
        "val_count": n_val,
        "test_count": n_test,
        "file_size_mb": file_size_mb,
        "download_url": f"/api/download-zip?filename={zip_filename}",
    }


@router.get("/api/download-zip")
def download_zip_file(filename: str):
    """Downloads an exported dataset zip file securely."""
    safe_name = os.path.basename(filename)
    zip_path = ROOT_DIR / "exports" / safe_name
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="İndirilecek ZIP dosyası bulunamadı.")
    return FileResponse(str(zip_path), filename=safe_name, media_type="application/zip")
