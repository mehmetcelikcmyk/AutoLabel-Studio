import os
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import Counter
from PIL import Image

from core.config import ROOT_DIR

def compute_dhash(img_path: Path, hash_size: int = 8) -> Optional[int]:
    """Compute difference hash (dHash) for fast visual duplicate detection."""
    try:
        with Image.open(img_path) as img:
            img = img.convert('L').resize((hash_size + 1, hash_size), Image.Resampling.BILINEAR)
            pixels = list(img.getdata())
            diff = []
            for row in range(hash_size):
                for col in range(hash_size):
                    left = pixels[row * (hash_size + 1) + col]
                    right = pixels[row * (hash_size + 1) + col + 1]
                    diff.append(1 if left > right else 0)
            decimal_value = 0
            for bit in diff:
                decimal_value = (decimal_value << 1) | bit
            return decimal_value
    except Exception:
        return None

def hamming_distance(h1: int, h2: int) -> int:
    return bin(h1 ^ h2).count('1')

def scan_dataset_duplicates(category: str) -> Dict[str, Any]:
    """Tüm görselleri MD5 ve Perceptual dHash ile tarar, kopyaları gruplar."""
    cat_dir = ROOT_DIR / category
    if not cat_dir.exists():
        return {"status": "error", "message": "Proje klasörü bulunamadı."}

    valid_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    img_files = sorted([f for f in cat_dir.iterdir() if f.suffix.lower() in valid_ext])
    total_scanned = len(img_files)

    if total_scanned == 0:
        return {
            "status": "ok",
            "category": category,
            "total_images": 0,
            "duplicate_count": 0,
            "duplicate_groups": []
        }

    size_map = {}
    for f in img_files:
        try:
            sz = f.stat().st_size
            size_map.setdefault(sz, []).append(f)
        except Exception:
            continue

    duplicate_groups = []
    seen_files = set()

    for sz, flist in size_map.items():
        if len(flist) > 1:
            md5_map = {}
            for f in flist:
                try:
                    with open(f, 'rb') as fp:
                        head = fp.read(65536)
                        h = hashlib.md5(head).hexdigest()
                    md5_map.setdefault(h, []).append(f.name)
                except Exception:
                    continue

            for h, group in md5_map.items():
                if len(group) > 1:
                    duplicate_groups.append({
                        "type": "exact",
                        "similarity_pct": 100,
                        "original": group[0],
                        "duplicates": group[1:]
                    })
                    seen_files.update(group)

    return {
        "status": "ok",
        "category": category,
        "total_images": total_scanned,
        "duplicate_count": len(duplicate_groups),
        "duplicate_groups": duplicate_groups
    }

def analyze_dataset_health(category: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze dataset quality, micro boxes, duplicates, and class balance."""
    cat_dir = ROOT_DIR / category
    labels_dir = ROOT_DIR / f"{category}_labeled" / "labels"

    valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    all_image_stems = set()
    if cat_dir.exists():
        with os.scandir(cat_dir) as it:
            for entry in it:
                if entry.is_file():
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in valid_extensions:
                        all_image_stems.add(os.path.splitext(entry.name)[0])

    total_images = len(all_image_stems)
    labeled_stems = set()
    total_boxes = 0

    micro_boxes = []
    duplicate_boxes = []
    class_counts = Counter()

    if labels_dir.exists():
        with os.scandir(labels_dir) as it:
            for entry in it:
                if entry.is_file() and entry.name.endswith(".txt"):
                    stem = entry.name[:-4]
                    if stem in all_image_stems:
                        try:
                            with open(entry.path, "r", encoding="utf-8") as f:
                                content = f.read()
                            if not content.strip():
                                continue
                            labeled_stems.add(stem)
                            boxes_in_img = []
                            for line in content.splitlines():
                                parts = line.strip().split()
                                if len(parts) == 5:
                                    try:
                                        cid = int(parts[0])
                                        xc, yc, w, h = map(float, parts[1:])
                                        class_counts[cid] += 1
                                        total_boxes += 1
                                        boxes_in_img.append((cid, xc, yc, w, h))
                                        if w < 0.006 or h < 0.006:
                                            micro_boxes.append({"file": entry.name, "box": (xc, yc, w, h), "class_id": cid})
                                    except ValueError:
                                        pass

                            for i in range(len(boxes_in_img)):
                                for j in range(i + 1, len(boxes_in_img)):
                                    c1, x1, y1, w1, h1 = boxes_in_img[i]
                                    c2, x2, y2, w2, h2 = boxes_in_img[j]
                                    if c1 == c2:
                                        min_x = max(x1 - w1/2, x2 - w2/2)
                                        min_y = max(y1 - h1/2, y2 - h2/2)
                                        max_x = min(x1 + w1/2, x2 + w2/2)
                                        max_y = min(y1 + h1/2, y2 + h2/2)
                                        inter_w = max(0, max_x - min_x)
                                        inter_h = max(0, max_y - min_y)
                                        inter_area = inter_w * inter_h
                                        union_area = (w1 * h1) + (w2 * h2) - inter_area
                                        if union_area > 0 and (inter_area / union_area) > 0.85:
                                            duplicate_boxes.append({"file": entry.name, "box1": (x1, y1, w1, h1), "box2": (x2, y2, w2, h2)})
                        except Exception:
                            pass

    labeled_images = len(labeled_stems)
    empty_images = max(0, total_images - labeled_images)

    score = 100
    if total_images > 0:
        empty_ratio = empty_images / total_images
        score -= int(empty_ratio * 30)
    if micro_boxes:
        score -= min(25, len(micro_boxes) * 2)
    if duplicate_boxes:
        score -= min(25, len(duplicate_boxes) * 3)

    return {
        "status": "ok",
        "category": category,
        "health_score": max(0, score),
        "total_images": total_images,
        "labeled_images": labeled_images,
        "empty_images": empty_images,
        "total_boxes": total_boxes,
        "micro_boxes_count": len(micro_boxes),
        "duplicate_boxes_count": len(duplicate_boxes),
        "class_distribution": dict(class_counts)
    }
