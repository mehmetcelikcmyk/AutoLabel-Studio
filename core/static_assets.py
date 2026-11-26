"""
Statik dosya sunumu ve önbellek politikası.

index.html içindeki yerel script ve stil adreslerine dosyanın değişiklik zamanından
üretilen bir sürüm parametresi eklenir. Böylece dosya değiştiğinde tarayıcı yenisini
indirir, değişmediğinde ise uzun süreli önbellekten okur. Elle ?v= güncellemeye gerek kalmaz.
"""

from __future__ import annotations

import hashlib
import re
import threading
from pathlib import Path
from typing import Optional, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, Response

# src="..." ya da href="..." içindeki yerel .js / .css adreslerini yakalar, harici adresleri atlar
_ASSET_PATTERN = re.compile(
    r'(?P<attr>\b(?:src|href))="(?P<path>(?!https?:|//|data:)[^"?#]+\.(?:js|css))(?:\?[^"#]*)?"'
)

_LONG_CACHE = "public, max-age=31536000, immutable"
_NO_CACHE = "no-cache"
_STATIC_EXTENSIONS = (".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2")


class VersionedIndex:
    """index.html dosyasını sürüm parametreleri eklenmiş halde, mtime tabanlı önbellekle sunar."""

    def __init__(self, static_dir: Path) -> None:
        self._static_dir = static_dir
        self._index_path = static_dir / "index.html"
        self._lock = threading.Lock()
        self._cache: Optional[Tuple[float, str]] = None

    def _asset_version(self, rel_path: str) -> Optional[str]:
        asset = (self._static_dir / rel_path.lstrip("/")).resolve()
        try:
            # static klasörü dışına çıkan yolları sürümleme
            asset.relative_to(self._static_dir.resolve())
            stat = asset.stat()
        except (ValueError, OSError):
            return None
        raw = f"{stat.st_mtime_ns}:{stat.st_size}".encode()
        return hashlib.md5(raw).hexdigest()[:10]

    def _signature(self) -> float:
        # index.html ya da herhangi bir JS/CSS değiştiğinde yeniden üretmek için en yeni mtime kullanılır
        latest = self._index_path.stat().st_mtime
        for pattern in ("*.js", "*.css", "js/modules/*.js", "css/*.css"):
            for f in self._static_dir.glob(pattern):
                try:
                    latest = max(latest, f.stat().st_mtime)
                except OSError:
                    continue
        return latest

    def render(self) -> str:
        signature = self._signature()
        with self._lock:
            if self._cache and self._cache[0] == signature:
                return self._cache[1]

        html = self._index_path.read_text(encoding="utf-8")

        def _replace(match: re.Match) -> str:
            path = match.group("path")
            version = self._asset_version(path)
            if not version:
                return match.group(0)
            return f'{match.group("attr")}="{path}?v={version}"'

        rendered = _ASSET_PATTERN.sub(_replace, html)
        with self._lock:
            self._cache = (signature, rendered)
        return rendered

    def response(self) -> Response:
        if not self._index_path.exists():
            return Response("index.html bulunamadı", status_code=404)
        return HTMLResponse(self.render(), headers={"Cache-Control": _NO_CACHE})


class StaticCacheHeadersMiddleware(BaseHTTPMiddleware):
    """Sürümlü statik dosyalara uzun önbellek, sürümsüzlere doğrulamalı önbellek uygular."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/") or response.status_code != 200 or "cache-control" in response.headers:
            return response
        if path.lower().endswith(_STATIC_EXTENSIONS):
            versioned = "v" in request.query_params
            response.headers["Cache-Control"] = _LONG_CACHE if versioned else "public, max-age=3600"
        return response
