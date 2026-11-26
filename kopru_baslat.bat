@echo off
title AutoLabel Studio - Cloudflare Koprusu
chcp 65001 >nul

echo ======================================================
echo       AutoLabel Studio - Cloudflare Koprusu
echo ======================================================
echo.

set "CF_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"

if not exist "%CF_EXE%" (
    where cloudflared >nul 2>&1
    if %errorlevel% equ 0 (
        set "CF_EXE=cloudflared"
    ) else (
        echo [HATA] cloudflared.exe bulunamadi!
        pause
        exit /b 1
    )
)

:start_tunnel
echo [*] Yerel sunucu port 8000 icin Cloudflare koprusu baslatiliyor...
echo [*] Asagida belirecek olan "https://xxxx.trycloudflare.com" linkini paylasabilirsiniz.
echo [*] Baglantiyi sonlandirmak icin bu pencereyi kapatin veya Ctrl+C basiniz.
echo.
echo ------------------------------------------------------

"%CF_EXE%" tunnel --protocol http2 --edge-ip-version 4 --url http://localhost:8000

echo.
echo [!] Baglanti sonlandi veya zaman asimina ugradi.
echo [!] 3 saniye sonra otomatik yeniden baglanacak... (Kapatmak icin pencereyi kapatin)
timeout /t 3 >nul
cls
goto start_tunnel
