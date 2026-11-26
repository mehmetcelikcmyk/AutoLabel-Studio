@echo off
title AutoLabel Studio - ngrok Koprusu (Kopmayan Sabit Link)
chcp 65001 >nul

echo ======================================================
echo    AutoLabel Studio - Sabit & Ucretsiz ngrok Koprusu
echo ======================================================
echo.

set "NGROK_EXE=%~dp0tools\ngrok.exe"

if not exist "%NGROK_EXE%" (
    where ngrok >nul 2>&1
    if %errorlevel% equ 0 (
        set "NGROK_EXE=ngrok"
    ) else (
        echo [HATA] ngrok.exe bulunamadi!
        pause
        exit /b 1
    )
)

echo [*] Yerel sunucu port 8000 icin sabit ngrok koprusu baslatiliyor...
echo.
echo [*] KALICI CANLI LINKINIZ:
echo     https://entrench-showgirl-cardinal.ngrok-free.dev
echo.
echo [*] Baglantiyi kapatmak icin bu pencereyi kapatin veya Ctrl+C basiniz.
echo ------------------------------------------------------

"%NGROK_EXE%" http 8000 --url https://entrench-showgirl-cardinal.ngrok-free.dev --traffic-policy-file "%~dp0ngrok_policy.yml"

pause
