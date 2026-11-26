import sys
import os
import json
import threading
from pathlib import Path
from typing import Dict, Any

# PyInstaller (.exe) veya standart Python çalışma ortamı uyumluluğu
if getattr(sys, "frozen", False):
    # Exe olarak çalıştırılıyorsa
    ROOT_DIR = Path(sys.executable).resolve().parent
    _BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", ROOT_DIR))
    STATIC_DIR = _BUNDLE_DIR / "static" if (_BUNDLE_DIR / "static").exists() else ROOT_DIR / "static"
else:
    ROOT_DIR = Path(__file__).resolve().parent.parent
    STATIC_DIR = ROOT_DIR / "static"

# .env otomatik yukle
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env", override=False)
except ImportError:
    pass

STATIC_DIR.mkdir(exist_ok=True)

CONFIG_FILE = ROOT_DIR / "project_config.json"
USERS_FILE = ROOT_DIR / "users.json"
SETTINGS_FILE = ROOT_DIR / "settings.json"

# Production data is Cloudflare-only.  Local JSON is intentionally not a fallback
# because a partial outage must never create a second, divergent source of truth.
APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
ALLOW_LEGACY_LOCAL_STORAGE = os.environ.get("ALLOW_LEGACY_LOCAL_STORAGE", "false").lower() == "true"

# Session Güvenlik Parametreleri:
# - Sliding Session: Aktif kullanıcı işlem yaptıkça süresi uzatılır (örn: 60 dakika).
# - Maksimum Oturum Ömrü: 4 saat
SLIDING_SESSION_MINUTES = int(os.environ.get("SLIDING_SESSION_MINUTES", "60"))
TOKEN_LIFETIME_HOURS = int(os.environ.get("TOKEN_LIFETIME_HOURS", "4"))
TOKEN_LIFETIME_DAYS = 1  # Geriye dönük uyumluluk için

# Kota ve Limit Standartları (SaaS / Çok Kullanıcılı Güvenlik)
MAX_PROJECTS_PER_USER = int(os.environ.get("MAX_PROJECTS_PER_USER", "5"))
MAX_IMAGES_PER_PROJECT = int(os.environ.get("MAX_IMAGES_PER_PROJECT", "100000"))
MAX_IMAGE_DIMENSION = int(os.environ.get("MAX_IMAGE_DIMENSION", "1920")) # Full HD Max Uzun Kenar
WEBP_OPTIMIZE_QUALITY = int(os.environ.get("WEBP_OPTIMIZE_QUALITY", "90")) # %90 Yüksek Kalite

SNAPSHOTS_DIR = ROOT_DIR / ".snapshots"
SNAPSHOTS_DIR.mkdir(exist_ok=True)
CACHE_DIR = ROOT_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)
THUMBNAILS_DIR = CACHE_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(exist_ok=True)

_SETTINGS_CACHE: Dict[str, Any] = {}
_SETTINGS_LOCK = threading.Lock()

def load_settings(force_reload: bool = False) -> Dict[str, Any]:
    global _SETTINGS_CACHE
    with _SETTINGS_LOCK:
        if not force_reload and _SETTINGS_CACHE:
            return dict(_SETTINGS_CACHE)

        # Secrets are injected only through the runtime environment.  In
        # particular, never read/write settings.json on an application node.
        data: Dict[str, Any] = {}

        def _env_list(key: str, json_key: str) -> list:
            raw = os.environ.get(key, "").strip()
            if raw:
                return [x.strip() for x in raw.split(",") if x.strip()]
            return []

        data["google_client_id"]       = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        data["google_client_secret"]   = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
        data["cloudflare_account_id"]  = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
        data["cloudflare_database_id"] = (os.environ.get("CLOUDFLARE_DATABASE_ID", "").strip() or os.environ.get("CLOUDFLARE_D1_DATABASE_ID", "").strip())
        data["cloudflare_r2_bucket"]   = (os.environ.get("CLOUDFLARE_R2_BUCKET", "").strip() or os.environ.get("CLOUDFLARE_R2_BUCKET_NAME", "").strip())
        data["cloudflare_r2_access_key_id"] = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID", "").strip()
        data["cloudflare_r2_secret_access_key"] = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "").strip()
        data["cloudflare_api_token"]   = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
        _uc = os.environ.get("USE_CLOUDFLARE", "")
        data["use_cloudflare"]         = _uc.lower() in ("1", "true", "yes") if _uc else True
        data["gemini_api_key"]         = os.environ.get("GEMINI_API_KEY", "").strip()
        data["gemini_backup_keys"]     = _env_list("GEMINI_BACKUP_KEYS",  "gemini_backup_keys")
        data["openai_api_key"]         = os.environ.get("OPENAI_API_KEY", "").strip()
        data["openai_backup_keys"]     = _env_list("OPENAI_BACKUP_KEYS",  "openai_backup_keys")
        data["groq_api_key"]           = os.environ.get("GROQ_API_KEY", "").strip()
        data["groq_backup_keys"]       = _env_list("GROQ_BACKUP_KEYS",   "groq_backup_keys")
        data["claude_api_keys"]        = _env_list("CLAUDE_API_KEYS",    "claude_api_keys")
        data["active_ai_provider"]     = os.environ.get("ACTIVE_AI_PROVIDER", "").strip()     or "gemini"
        data.setdefault("available_ai_providers", ["gemini", "openai", "groq_llama", "claude", "local_yolo"])

        _SETTINGS_CACHE = data
        return dict(_SETTINGS_CACHE)
