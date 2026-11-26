import os
import cv2
import shutil
import numpy as np
from PIL import Image, ImageFile
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any

from core.config import ROOT_DIR, THUMBNAILS_DIR

ImageFile.LOAD_TRUNCATED_IMAGES = True

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

def safe_bbox(xc: float, yc: float, w: float, h: float) -> Tuple[float, float, float, float]:
    """Koordinatların [0.0, 1.0] aralığında kalmasını garanti eder, taşmaları önler."""
    w = max(0.001, min(1.0, float(w)))
    h = max(0.001, min(1.0, float(h)))
    half_w = w / 2.0
    half_h = h / 2.0
    xc = max(half_w, min(1.0 - half_w, float(xc)))
    yc = max(half_h, min(1.0 - half_h, float(yc)))
    return round(xc, 6), round(yc, 6), round(w, 6), round(h, 6)

def get_or_create_thumbnail(img_path: Path, max_size: int = 280) -> Optional[Path]:
    """Büyük resimler için anında 280px thumbnail üretir ve önbellekler."""
    try:
        if not img_path.exists():
            return None
        THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
        mtime = int(img_path.stat().st_mtime)
        thumb_name = f"{img_path.stem}_{mtime}_{max_size}.jpg"
        thumb_path = THUMBNAILS_DIR / thumb_name
        if thumb_path.exists():
            return thumb_path

        with Image.open(img_path) as img:
            img = img.convert("RGB")
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            img.save(thumb_path, "JPEG", quality=80, optimize=True)
            return thumb_path
    except Exception:
        return img_path

def soft_nms(
    boxes: np.ndarray,
    scores: np.ndarray,
    sigma: float = 0.5,
    score_threshold: float = 0.01,
    iou_method: str = "gaussian",
) -> np.ndarray:
    """Soft-NMS: decays scores of overlapping boxes instead of hard removal."""
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
            else:
                if iou > sigma:
                    scores[j] *= (1.0 - iou)
    return np.array(kept, dtype=np.int64)

def filter_boxes(
    boxes_xyxyn: np.ndarray,
    confs: np.ndarray,
    cls_indices: np.ndarray,
    iou_thresh: float = 0.5,
    min_area: float = 0.0001,
    max_aspect: float = 15.0,
    sigma_soft: float = 0.5,
) -> List[int]:
    """Tam filtreleme boru hattı: boyutsal denetim + Soft-NMS."""
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

    sub_boxes = boxes_xyxyn[valid]
    sub_confs = confs[valid]
    sub_cls = cls_indices[valid]

    kept_indices = []
    for c in np.unique(sub_cls):
        mask = (sub_cls == c)
        c_orig = np.array(valid)[mask]
        c_boxes = sub_boxes[mask]
        c_confs = sub_confs[mask]

        if len(c_boxes) == 1:
            kept_indices.append(c_orig[0])
            continue

        nms_kept = soft_nms(c_boxes, c_confs, sigma=sigma_soft, score_threshold=0.05)
        for idx in nms_kept:
            kept_indices.append(c_orig[idx])

    return sorted(kept_indices)

def optimize_uploaded_image(raw_bytes: bytes, max_dim: int = 1920, quality: int = 90) -> Tuple[bytes, str]:
    """
    Görseli profesyonel standartta kayıpsız/yüksek kaliteli WebP formatına optimize eder:
    - EXIF yönünü (telefondan çekilen yatay/dikey dönmüş fotoğraflar) otomatik düzeltir.
    - En uzun kenar 1920px'ten büyükse oranını koruyarak Full HD sınırına (LANCZOS) çeker.
    - 1920px'ten küçükse çözünürlüğe hiç dokunmaz (orijinal pikseli korur).
    - WebP formatında %90 kalite ile kaydeder (gözle görülür hiçbir kalite kaybı olmadan %70-%80 dosya tasarrufu).
    Dönüş: (optimize_bytes, ".webp")
    """
    import io
    from PIL import ImageOps

    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            # 1. EXIF rotasyonunu düzelt
            img = ImageOps.exif_transpose(img)
            
            # 2. Renk modunu RGBA veya RGB'ye normalize et
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            
            # 3. Orantılı yeniden boyutlandırma (Sadece 1920px'ten büyükse)
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / float(max(w, h))
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # 4. Yüksek kaliteli WebP olarak kaydet
            out_buf = io.BytesIO()
            img.save(out_buf, format="WEBP", quality=quality, method=4)
            return out_buf.getvalue(), ".webp"
    except Exception:
        # Hata durumunda orijinal baytları koru
        return raw_bytes, ""
