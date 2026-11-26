@echo off
title YOLO Editor

echo ======================================================
echo              YOLO Editor v2.0
echo      AI Destekli Veri Seti Etiketleme Araci
echo ======================================================
echo.

:: Python kontrolu
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [HATA] Python bulunamadi!
    echo  Lutfen once kur.bat dosyasini calistirin.
    pause
    exit /b 1
)

:: requirements.txt kontrolu - kurulmamissa otomatik kur
python -c "import fastapi, uvicorn, ultralytics, cv2" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Bazi kutuphaneler eksik. Otomatik kurulum basliyor...
    python -m pip install -r requirements.txt --quiet
    echo  [OK] Kutuphaneler kuruldu.
    echo.
)

:: Port 8000'i garantile
echo  [*] Port 8000 kontrol ediliyor...
set PORT=8000

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo  [!] Port 8000 mesgul ^(PID: %%a^), eski surec sonlandiriliyor...
    taskkill /F /PID %%a >nul 2>&1
)

echo  [OK] Port %PORT% kullanilacak.
echo.
echo  Uygulama baslatiliyor: http://localhost:%PORT%
echo  Kapatmak icin bu pencereyi kapatin veya Ctrl+C basiniz.
echo.

:: Uygulamayi baslat
python app.py --port %PORT%

