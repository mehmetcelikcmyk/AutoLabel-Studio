"""
AutoLabel Studio — Main Application Server
Modular Clean Code Architecture
"""

import sys
import os
import time
import socket
import argparse
import threading
from pathlib import Path

# Ensure ROOT_DIR is in sys.path for robust modular imports
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from core.config import ROOT_DIR, STATIC_DIR, CONFIG_FILE, APP_ENV
from core.security import get_current_user, is_admin_user
from core.static_assets import VersionedIndex, StaticCacheHeadersMiddleware

# Initialize FastAPI application
app = FastAPI(
    title="AutoLabel Studio",
    description="AI-Powered Object Detection, Segmentation & Dataset Management Studio",
    version="2.0"
)

# ----------------------------------------------------------------------
# Security & CORS Middleware
# ----------------------------------------------------------------------
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
_allowed_origins = [o.strip() for o in _allowed_origins_raw.split(",") if o.strip()]
if not _allowed_origins:
    _allowed_origins = ["http://localhost:8000", "http://127.0.0.1:8000"]
if APP_ENV == "production" and "*" in _allowed_origins:
    raise RuntimeError("ALLOWED_ORIGINS must be explicit in production; wildcard origins are forbidden.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)

_allowed_hosts = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]
if APP_ENV == "production":
    if not _allowed_hosts or "*" in _allowed_hosts:
        raise RuntimeError("ALLOWED_HOSTS must be explicit in production.")
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts)


class ApiAccessGate(BaseHTTPMiddleware):
    """Fail closed while legacy routes are migrated to D1/R2 repositories.

    Every API is authenticated by default.  Privileged legacy routes are
    additionally administrator-only, which prevents an authenticated user from
    invoking an endpoint that has not yet been converted to project-member ACLs.
    """

    public_paths = {
        # Gerçekten anonim erişim gerektiren endpoint'ler
        "/api/health", "/api/ext/activate",
        "/api/auth/register", "/api/auth/login",
        "/api/auth/forgot-password", "/api/auth/reset-password",
        "/api/auth/google", "/api/auth/google/callback",
        "/api/projects/public",
        "/api/templates/active",
        "/api/teams/accept-invite",
        "/api/teams/invite-info",
        "/api/teams/decline-invite",
        # Görsel ve önizleme endpoint'leri (Yetkilendirme check_project_permission ile fonksiyon içinde yapılır)
        "/api/images",
        "/api/categories",
        "/api/label-data",
        "/api/projects/batches",
        "/api/image-file",
        "/api/preview-file",
        "/api/projects/thumbnail",
        "/api/system/hardware-recommendation",
    }
    public_path_suffixes = (
        "/public-summary",
    )
    admin_prefixes = (
        "/api/admin/",
    )

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or path in self.public_paths or path.endswith(self.public_path_suffixes):
            return await call_next(request)

        authorization = request.headers.get("authorization")
        if not authorization:
            q_tok = request.query_params.get("token")
            if q_tok:
                authorization = f"Bearer {q_tok}"
        try:
            user = get_current_user(authorization)
        except RuntimeError:
            return JSONResponse(status_code=503, content={"detail": "Kimlik servisi geçici olarak kullanılamıyor."})
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Kimlik doğrulama gerekli."})
        request.state.user = user

        if path.startswith(self.admin_prefixes) and not is_admin_user(user, user.get("email")):
            return JSONResponse(status_code=403, content={"detail": "Bu işlem yönetici yetkisi gerektirir."})
        return await call_next(request)


app.add_middleware(ApiAccessGate)




class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'"
        )
        if APP_ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ----------------------------------------------------------------------
# Health & Extension Activation
# ----------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    """Simple health check endpoint."""
    return {
        "status": "ok",
        "app": "AutoLabel Studio",
        "version": "2.0"
    }


@app.api_route("/api/ext/activate", methods=["GET", "POST"])
def ext_activate():
    """Browser extension activation heartbeat."""
    return {"status": "ok"}


# ----------------------------------------------------------------------
# Modular API Routers
# ----------------------------------------------------------------------
from api.auth import router as auth_router
from api.teams import router as teams_router
from api.ai_models import router as ai_models_router, get_ai_model, MODEL_REGISTRY, _ACTIVE_DEVICE, _MODEL_CACHE, detect_device
from api.dataset_export import router as export_router
from api.projects import router as projects_router
from api.labeling import router as labeling_router
from api.training import router as training_router
from api.assistant import router as assistant_router
from api.analysis_admin import router as analysis_admin_router
from api.workspaces import router as workspaces_router

app.include_router(auth_router)
app.include_router(teams_router)
app.include_router(ai_models_router)
app.include_router(export_router)
app.include_router(projects_router)
app.include_router(labeling_router)
app.include_router(training_router)
app.include_router(assistant_router)
app.include_router(analysis_admin_router)
app.include_router(workspaces_router)

# ----------------------------------------------------------------------
# Static Files Mount & SPA Fallback Middleware
# ----------------------------------------------------------------------
STATIC_DIR.mkdir(exist_ok=True)
versioned_index = VersionedIndex(STATIC_DIR)
app.add_middleware(StaticCacheHeadersMiddleware)


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def serve_index():
    """index.html dosyasını JS/CSS adreslerine otomatik sürüm eklenmiş halde döndürür."""
    return versioned_index.response()


@app.middleware("http")
async def spa_fallback_middleware(request: Request, call_next):
    path_lower = request.url.path.lower()
    # Yedek ve gizli dosyaların statik sunucudan servis edilmesini engelle
    if ".bak" in path_lower or path_lower.endswith((".db", ".sqlite", ".env")):
        return JSONResponse(status_code=404, content={"detail": "Bulunamadı."})
    response = await call_next(request)
    if response.status_code == 404 and request.method == "GET":
        path = request.url.path
        # API veya uzantılı dosya istekleri (.js, .css, .png vs.) hariç tutulur
        if not path.startswith("/api/") and "." not in path.split("/")[-1]:
            return versioned_index.response()
    return response

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


# ----------------------------------------------------------------------
# Server Port Resolution & Main Startup
# ----------------------------------------------------------------------
def _find_free_port(start: int = 8000, end: int = 8010) -> int:
    """Find the first available TCP port in [start, end]."""
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start


def _ensure_model_file(filename: str, loader_fn):
    """Download model file if not present, print progress."""
    path = ROOT_DIR / filename
    if not path.exists():
        print(f"  [Model] '{filename}' bulunamadı, indiriliyor...")
        try:
            loader_fn()
            if path.exists():
                print(f"  [Model] '{filename}' indirildi. ✓")
        except Exception as e:
            print(f"  [Model] '{filename}' indirilemedi: {e}")
    else:
        print(f"  [Model] '{filename}' mevcut. ✓")


if __name__ == "__main__":
    import webbrowser

    parser = argparse.ArgumentParser(description="AutoLabel Studio — AI Dataset Labeling Tool")
    parser.add_argument("--host", type=str, default=None,
                        help="Sunucu host adresi (varsayılan: .env HOST veya 127.0.0.1)")
    parser.add_argument("--port", type=int, default=None,
                        help="Sunucu portu (varsayılan: otomatik tespit)")
    parser.add_argument("--no-browser", action="store_true",
                        help="Tarayıcıyı otomatik açma")
    args = parser.parse_args()

    host = args.host or os.getenv("HOST", "127.0.0.1")
    port = args.port if args.port else _find_free_port(8000, 8010)

    device = detect_device()

    print()
    print("  +======================================================+")
    print("  |              AutoLabel Studio v2.0                   |")
    print("  |      AI Destekli Veri Seti Etiketleme Aracı          |")
    print("  +======================================================+")
    print()
    device_str = "GPU" if "cuda" in device or "mps" in device else "CPU"
    print(f"  [*] Cihaz: {device_str} ({device})")
    print("  [*] Model dosyaları kontrol ediliyor...")
    try:
        from ultralytics import YOLOWorld, YOLO
        _ensure_model_file("yolov8s-worldv2.pt",
                           lambda: YOLOWorld(str(ROOT_DIR / "yolov8s-worldv2.pt")))
        _ensure_model_file("yolov8n.pt",
                           lambda: YOLO(str(ROOT_DIR / "yolov8n.pt")))
    except ImportError:
        print("  [UYARI] ultralytics kurulamadı. Lütfen pip install ultralytics çalıştırın.")

    display_host = "localhost" if host in ["127.0.0.1", "0.0.0.0"] else host
    print()
    print(f"  [*] Sunucu başlatılıyor → http://{display_host}:{port} (Dinlenen: {host}:{port})")
    print(f"  [*] Durdurmak için Ctrl+C basınız.")
    print()

    if not args.no_browser and host in ["127.0.0.1", "localhost"]:
        def _open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(f"http://localhost:{port}")
            except Exception:
                pass
        threading.Thread(target=_open_browser, daemon=True).start()

    uvicorn.run(app, host=host, port=port, log_level="warning")
