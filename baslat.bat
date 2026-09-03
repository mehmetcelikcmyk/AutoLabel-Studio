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

:: Mevcut portu bul (8000'den basla)
echo  [*] Port kontrol ediliyor...
set PORT=8000

netstat -an 2>nul | find ":%PORT% " | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    set PORT=8001
    netstat -an 2>nul | find ":8001 " | find "LISTENING" >nul 2>&1
    if %errorlevel% equ 0 (
        set PORT=8002
    )
)

echo  [OK] Port %PORT% kullanilacak.
echo.
echo  Uygulama baslatiliyor: http://localhost:%PORT%
echo  Kapatmak icin bu pencereyi kapatin veya Ctrl+C basiniz.
echo.

:: Uygulamayi baslat
python app.py --port %PORT%
if %errorlevel% neq 0 (
    echo.
    echo  [HATA] Uygulama baslatilirken bir hata olustu.
    echo  Lutfen once kur.bat dosyasini calistirip bagimliliklari kurun.
    pause
)
