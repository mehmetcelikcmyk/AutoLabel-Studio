# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

BASE_DIR = Path(SPECPATH).resolve()

# Ultralytics & PyTorch & FastAPI data files
datas = [
    (str(BASE_DIR / "static"), "static"),
]
datas += collect_data_files("ultralytics")
datas += collect_data_files("uvicorn")

# Hidden imports for dynamic runtime loading
hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "starlette",
    "starlette.middleware",
    "starlette.middleware.cors",
    "starlette.middleware.trustedhost",
    "starlette.staticfiles",
    "ultralytics",
    "torch",
    "torchvision",
    "cv2",
    "PIL",
    "numpy",
    "dotenv",
    "pydantic",
    "boto3",
    "botocore",
    "requests",
    "core",
    "core.config",
    "core.security",
    "core.cloudflare_client",
    "api",
    "api.auth",
    "api.teams",
    "api.ai_models",
    "api.dataset_export",
    "api.projects",
    "api.labeling",
    "api.training",
    "api.assistant",
    "api.analysis_admin",
    "api.workspaces",
    "services",
]
hiddenimports += collect_submodules("ultralytics")

a = Analysis(
    [str(BASE_DIR / "app.py")],
    pathex=[str(BASE_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "IPython", "jupyter"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AutoLabelStudio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="AutoLabelStudio",
)
