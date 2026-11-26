@echo off
title AutoLabel Studio Derleme Araci
chcp 65001 >nul

echo ======================================================
echo           AutoLabel Studio - EXE Derleme Araci
echo ======================================================
echo.

set "PROJECT_DIR=%~dp0"
set "DIST_DIR=%PROJECT_DIR%..\AutoLabel-Studio-Dist"
set "BUILD_DIR=%PROJECT_DIR%..\AutoLabel-Studio-Build"

echo [*] Derleme baslatiliyor...
echo [*] Cikti dizini: %DIST_DIR%
echo.

python -m PyInstaller autolabel_studio.spec --distpath "%DIST_DIR%" --workpath "%BUILD_DIR%" --noconfirm

if %errorlevel% neq 0 (
    echo.
    echo [HATA] Derleme sirasinda hata meydana geldi!
    pause
    exit /b %errorlevel%
)

echo.
echo [*] Model ve ayar dosyalari kopyalaniyor...
if exist "%PROJECT_DIR%yolov8n.pt" copy /y "%PROJECT_DIR%yolov8n.pt" "%DIST_DIR%\AutoLabelStudio\"
if exist "%PROJECT_DIR%yolov8s-worldv2.pt" copy /y "%PROJECT_DIR%yolov8s-worldv2.pt" "%DIST_DIR%\AutoLabelStudio\"
if exist "%PROJECT_DIR%.env.example" copy /y "%PROJECT_DIR%.env.example" "%DIST_DIR%\AutoLabelStudio\"

echo.
echo ======================================================
echo [BASARILI] EXE paketi olusturuldu!
echo Konum: %DIST_DIR%\AutoLabelStudio\AutoLabelStudio.exe
echo ======================================================
echo.
pause
