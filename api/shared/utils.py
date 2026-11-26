"""
api/shared/utils.py
Proje genelinde paylaşılan dosya adı temizleme, yol güvenlik denetimleri,
görsel ve YOLO doğrulama ile proje konfigürasyon yardımcı fonksiyonları.
"""

import os
import re
import io
import time
import json
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import HTTPException
from PIL import Image

from core.config import ROOT_DIR, CONFIG_FILE
from core.database import cf_d1_query

DEFAULT_CLASS_MAPPING = {
    "bag": {"id": 0, "name": "Bag", "color": "#3b82f6", "prompts": ["bag", "handbag", "backpack"]},
    "belt": {"id": 1, "name": "Belt", "color": "#10b981", "prompts": ["belt", "leather belt"]},
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
MAX_BATCH_UPLOAD_COUNT = 1500


def sanitize_filename(filename: str) -> str:
    """Dosya adını güvenli hale getirir ve zararlı karakterleri temizler."""
    clean_name = os.path.basename(filename)
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.ğüşıöçĞÜŞİÖÇ]', '_', clean_name)
    clean_name = clean_name.strip(' .')
    return clean_name or f"upload_{int(time.time())}.jpg"


def safe_project_path(category: str, filename: Optional[str] = None, subfolder: Optional[str] = None) -> Path:
    """
    Path traversal (Dizin Aşımı) saldırılarını engeller.
    category ve filename parametrelerinin ROOT_DIR dışına çıkmamasını doğrular.
    """
    clean_cat = sanitize_filename(category).strip()
    if not clean_cat or clean_cat in (".", ".."):
        raise HTTPException(status_code=400, detail="Geçersiz proje veya kategori adı.")

    if subfolder:
        clean_sub = sanitize_filename(subfolder).strip()
        target_dir = (ROOT_DIR / clean_cat / clean_sub).resolve()
    else:
        target_dir = (ROOT_DIR / clean_cat).resolve()

    root_resolved = ROOT_DIR.resolve()
    try:
        if not target_dir.is_relative_to(root_resolved):
            raise HTTPException(status_code=400, detail="Güvenlik ihlali: Geçersiz dizin yolu.")
    except AttributeError:
        if not str(target_dir).startswith(str(root_resolved)):
            raise HTTPException(status_code=400, detail="Güvenlik ihlali: Geçersiz dizin yolu.")

    if filename:
        clean_fn = sanitize_filename(filename).strip()
        if not clean_fn or clean_fn in (".", ".."):
            raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")
        final_path = (target_dir / clean_fn).resolve()
        try:
            if not final_path.is_relative_to(root_resolved):
                raise HTTPException(status_code=400, detail="Güvenlik ihlali: Geçersiz dosya yolu.")
        except AttributeError:
            if not str(final_path).startswith(str(root_resolved)):
                raise HTTPException(status_code=400, detail="Güvenlik ihlali: Geçersiz dosya yolu.")
        return final_path

    return target_dir


def validate_image_bytes(data: bytes) -> bool:
    """Yüklenen baytların geçerli bir resim formatı olduğunu ve Pillow ile açılabildiğini doğrular."""
    if len(data) < 12 or len(data) > MAX_FILE_SIZE_BYTES:
        return False
    is_jpeg = data.startswith(b'\xff\xd8\xff')
    is_png = data.startswith(b'\x89PNG\r\n\x1a\n')
    is_webp = data.startswith(b'RIFF') and b'WEBP' in data[:16]
    is_bmp = data.startswith(b'BM')
    if not (is_jpeg or is_png or is_webp or is_bmp):
        return False
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        return True
    except Exception:
        return False


def validate_yolo_label_bytes(data: bytes) -> Optional[List[str]]:
    """YOLO etiket metnini ayrıştırır ve koordinatların 0-1 aralığında olduğunu doğrular."""
    if len(data) > 5 * 1024 * 1024:
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
        n_parts = len(parts)
        if n_parts != 5 and (n_parts < 7 or n_parts % 2 == 0):
            return None
        try:
            cid = int(parts[0])
            if cid < 0 or cid > 10000:
                return None
            coords = [float(p) for p in parts[1:]]
            if not all(0.0 <= c <= 1.0 for c in coords):
                return None
            formatted_coords = " ".join(f"{c:.6f}" for c in coords)
            valid_lines.append(f"{cid} {formatted_coords}\n")
        except ValueError:
            return None
    return valid_lines


def load_project_config() -> Dict[str, Any]:
    """Yerel project_config.json dosyasını yükler."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"projects": {}, "classes": DEFAULT_CLASS_MAPPING}


def save_project_config(config: Dict[str, Any]):
    """Güncel ayarları project_config.json dosyasına atomik/düzenli kaydeder."""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_project_storage_info(category: str) -> Dict[str, str]:
    """
    Projenin ait olduğu kullanıcı ve workspace bilgilerini D1 ve yerel yapıdan çözümler.
    Çok kullanıcılı Cloudflare R2 hiyerarşisi:
    users/{owner_email}/{workspace_id}/{project_id}
    """
    clean_cat = sanitize_filename(category).lower().replace(" ", "_")
    owner_email = "modai.app.dev@gmail.com"
    workspace_id = "ws_default"

    try:
        rows = cf_d1_query("SELECT owner_email, workspace_id FROM projects WHERE id = ? LIMIT 1", [clean_cat])
        if rows and len(rows) > 0:
            if rows[0].get("owner_email"):
                owner_email = rows[0]["owner_email"].strip().lower()
            if rows[0].get("workspace_id"):
                workspace_id = rows[0]["workspace_id"].strip()
    except Exception:
        pass

    safe_owner = owner_email.replace("@", "_at_").replace(".", "_")
    prefix = f"users/{safe_owner}/{workspace_id}/{clean_cat}"
    return {
        "project_id": clean_cat,
        "owner_email": owner_email,
        "workspace_id": workspace_id,
        "safe_owner": safe_owner,
        "r2_prefix": prefix,
        "r2_project_prefix": prefix,
        "r2_images_prefix": f"{prefix}/images",
        "r2_labels_prefix": f"{prefix}/labels",
    }
