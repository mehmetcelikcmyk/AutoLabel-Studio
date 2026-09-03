@echo off
title YOLO Editor - Kurulum

echo ======================================================
echo           YOLO Editor - Kurulum Sihirbazi
echo       AI Destekli Veri Seti Etiketleme Araci
echo ======================================================
echo.

:: Python kontrolu
echo [1/4] Python kontrol ediliyor...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Python bulunamadi!
    echo Lutfen Python 3.10+ kurunuz:
    echo https://www.python.org/downloads/
    echo.
    echo Kurulum iptal edildi.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python %PYVER% bulundu.
echo.

:: pip guncellemesi
echo [2/4] pip guncelleniyor...
python -m pip install --upgrade pip --quiet
echo [OK] pip guncellendi.
echo.

:: Bagimliliklarin kurulumu
echo [3/4] Python kutuphaneleri kuruluyor...
echo      (Bu islem ilk seferde birkac dakika surebilir)
echo.
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Kutuphane kurulumu basarisiz!
    echo Internet baglantinizi kontrol edin.
    pause
    exit /b 1
)
echo.
echo [OK] Tum kutuphaneler kuruldu.
echo.

:: Model dosyalarinin kontrolu
echo [4/4] AI Model dosyalari kontrol ediliyor...
if exist "yolov8n.pt" (
    echo [OK] yolov8n.pt mevcut.
) else (
    echo [!] yolov8n.pt indiriliyor...
    python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" >nul 2>&1
    if exist "yolov8n.pt" (
        echo [OK] yolov8n.pt indirildi.
    ) else (
        echo [UYARI] Model ilk kullanimda otomatik indirilecek.
    )
)

if exist "yolov8s-worldv2.pt" (
    echo [OK] yolov8s-worldv2.pt mevcut.
) else (
    echo [!] yolov8s-worldv2.pt indiriliyor (~25MB)...
    python -c "from ultralytics import YOLOWorld; YOLOWorld('yolov8s-worldv2.pt')" >nul 2>&1
    if exist "yolov8s-worldv2.pt" (
        echo [OK] yolov8s-worldv2.pt indirildi.
    ) else (
        echo [UYARI] YOLOWorld modeli ilk kullanimda otomatik indirilecek.
    )
)

echo.
echo ======================================================
echo    Kurulum tamamlandi!
echo    Uygulamayi baslatmak icin: baslat.bat
echo ======================================================
echo.
pause
