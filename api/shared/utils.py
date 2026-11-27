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

from core.config import ROOT_DIR, CONFIG_FILE, load_settings
from core.database import cf_d1_query

DEFAULT_CLASS_MAPPING = {
    "bag": {"id": 0, "name": "Bag", "color": "#3b82f6", "prompts": ["bag", "handbag", "backpack"]},
    "belt": {"id": 1, "name": "Belt", "color": "#10b981", "prompts": ["belt", "leather belt"]},
}

RICH_PROMPT_PRESETS: Dict[str, List[str]] = {
    "t-shirt": ["t-shirt", "short sleeve t-shirt", "tee shirt", "cotton tee", "crew neck t-shirt"],
    "shirt": ["shirt", "button-down shirt", "dress shirt", "collared shirt", "blouse"],
    "sweater": ["sweater", "knit sweater", "pullover sweater", "jumper", "cardigan"],
    "sweatshirt": ["sweatshirt", "hoodie", "pullover sweatshirt", "fleece sweatshirt"],
    "tunic": ["tunic", "long tunic top", "tunic blouse", "loose long top"],
    "jacket": ["jacket", "denim jacket", "leather jacket", "bomber jacket", "zip jacket"],
    "coat": ["coat", "winter coat", "trench coat", "overcoat", "long coat"],
    "pants": ["pants", "trousers", "jeans", "slacks", "chinos"],
    "skirt": ["skirt", "mini skirt", "midi skirt", "pleated skirt", "long skirt"],
    "leggings": ["leggings", "black leggings", "yoga pants", "tight pants", "tights"],
    "shorts": ["shorts", "denim shorts", "casual shorts", "athletic shorts"],
    "tracksuit": ["tracksuit", "jogger set", "sweatsuit", "athletic tracksuit"],
    "dress": ["dress", "summer dress", "evening gown", "midi dress", "maxi dress"],
    "suit": ["suit", "business suit", "blazer and trousers", "tailored suit"],
    "sneakers": ["sneakers", "running shoes", "athletic shoes", "trainers", "canvas sneakers"],
    "dress shoes": ["dress shoes", "oxford shoes", "loafers", "formal leather shoes", "derby shoes"],
    "heels": ["heels", "high heels", "stiletto heels", "pumps", "heeled shoes"],
    "boots": ["boots", "ankle boots", "leather boots", "knee-high boots", "chelsea boots"],
    "sandals": ["sandals", "summer sandals", "strappy sandals", "open-toe sandals", "flip-flops"],
    "flats": ["flats", "ballet flats", "women flat shoes", "slip-on flat shoes", "mary jane flats"],
    "slippers": ["slippers", "house slippers", "slides", "mules", "fuzzy slippers"],
    "socks": ["socks", "ankle socks", "crew socks", "cotton socks"],
    "headscarf": ["headscarf", "hijab", "head wrap", "head scarf", "bandana"],
    "hat": ["hat", "baseball cap", "beanie", "sun hat", "fedora hat"],
    "glasses": ["glasses", "eyeglasses", "sunglasses", "optical frames", "reading glasses"],
    "ring": ["ring", "finger ring", "wedding band", "gold ring", "silver ring"],
    "bracelet": ["bracelet", "wristlet", "bangle", "chain bracelet", "wrist cuff"],
    "earrings": ["earrings", "stud earrings", "hoop earrings", "drop earrings"],
    "necklace": ["necklace", "pendant necklace", "chain necklace", "choker"],
    "watch": ["watch", "wristwatch", "smartwatch", "analog watch", "luxury watch"],
    "scarf": ["scarf", "neck scarf", "winter scarf", "silk scarf", "shawl"],
    "gloves": ["gloves", "leather gloves", "winter gloves", "knit gloves"],
    "belt": ["belt", "leather belt", "waist belt", "buckle belt"],
    "tie": ["tie", "necktie", "bow tie", "silk tie"],
    "bag": ["bag", "handbag", "shoulder bag", "tote bag", "backpack", "purse", "clutch"],
    "person": ["person", "human", "man", "woman", "pedestrian"],
    "car": ["car", "sedan", "suv", "automobile", "vehicle"],
    "shoe": ["shoe", "sneaker", "boot", "sandal", "flat shoe", "heel"],
}


def enrich_class_prompts(class_name: str, existing_prompts: Optional[List[str]] = None) -> List[str]:
    """Ensure every class has rich CLIP/YOLO-World visual descriptor prompts (at least 4 when possible)."""
    cleaned: List[str] = []
    seen = set()
    for p in (existing_prompts or []):
        ps = str(p).strip().lower()
        if ps and ps not in seen:
            cleaned.append(ps)
            seen.add(ps)

    base = str(class_name or "").strip().lower()
    if not cleaned and base:
        cleaned.append(base)
        seen.add(base)

    if len(cleaned) >= 3:
        return cleaned

    candidates: List[str] = []
    if base in RICH_PROMPT_PRESETS:
        candidates = RICH_PROMPT_PRESETS[base]
    else:
        for k, vals in RICH_PROMPT_PRESETS.items():
            if base == k or f" {k}" in f" {base}" or f"{k} " in f"{base} ":
                candidates = vals
                break

    if not candidates and base:
        words = base.replace("_", " ").replace("-", " ").strip()
        candidates = [words, f"{words} item", f"{words} object", f"close-up {words}"]

    for cand in candidates:
        c_norm = cand.strip().lower()
        if c_norm and c_norm not in seen:
            cleaned.append(c_norm)
            seen.add(c_norm)
            if len(cleaned) >= 6:
                break

    return cleaned

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
    settings = load_settings()
    r2_configured = all(
        settings.get(k)
        for k in (
            "cloudflare_account_id",
            "cloudflare_r2_bucket",
            "cloudflare_r2_access_key_id",
            "cloudflare_r2_secret_access_key",
        )
    )
    return {
        "project_id": clean_cat,
        "owner_email": owner_email,
        "workspace_id": workspace_id,
        "safe_owner": safe_owner,
        "r2_prefix": prefix,
        "r2_project_prefix": prefix,
        "r2_images_prefix": f"{prefix}/images",
        "r2_labels_prefix": f"{prefix}/labels",
        "r2_configured": r2_configured,
    }
