@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CuringGuard Launcher

echo ===================================================
echo   CuringGuard: PC + Mobile Launcher
echo   Fresh reset + PC + fast mobile + photo mobile
echo ===================================================

cd /d %~dp0

echo [1/8] Stopping old backend/frontend/tunnel processes...
for %%P in (8000 5173 5174) do (
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)
taskkill /IM cloudflared.exe /F >nul 2>&1

for %%F in (
  mobile-fast-url.txt
  mobile-photo-url.txt
  mobile-https-tunnel.log
  backend-mobile.log
  frontend-mobile.log
) do (
  if exist %%F del /f /q %%F >nul 2>&1
)

echo [2/8] Detecting local Wi-Fi/LAN IP...
set "LAN_IP="
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress); if($ip){ Write-Output $ip }"') do (
  set "LAN_IP=%%I"
)
if not defined LAN_IP (
  echo Failed to detect a LAN IP address.
  pause
  exit /b 1
)

echo [3/8] Ensuring secure mobile tunnel tool exists...
if not exist tools mkdir tools >nul 2>&1
if not exist tools\cloudflared.exe (
  echo Downloading cloudflared...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'tools\\cloudflared.exe'"
  if errorlevel 1 (
    echo Failed to download cloudflared.
    pause
    exit /b 1
  )
)

echo [4/8] Starting backend...
start "CuringGuard-Backend" cmd /k "cd /d %~dp0 && set PYTHONPATH=.&& uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000 > backend-mobile.log 2>&1"

echo [5/8] Starting frontend...
start "CuringGuard-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort > ..\\frontend-mobile.log 2>&1"

echo [6/8] Waiting for frontend to come online...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(45); $ready=$false; while((Get-Date) -lt $deadline){ try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:5173/login' -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -ge 200){ $ready=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if(-not $ready){ exit 1 }"
if errorlevel 1 (
  echo Frontend did not start on port 5173.
  echo Check the CuringGuard-Frontend window.
  pause
  exit /b 1
)

set "PC_URL=http://localhost:5173/login"
set "MOBILE_FAST_URL=http://%LAN_IP%:5173/login"
> mobile-fast-url.txt echo %MOBILE_FAST_URL%

echo [7/8] Starting secure mobile tunnel for camera/location testing...
start "CuringGuard-Mobile-Photo" cmd /k "cd /d %~dp0 && tools\cloudflared.exe tunnel --url http://127.0.0.1:5173 --no-autoupdate > mobile-https-tunnel.log 2>&1"

echo [8/8] Waiting for secure mobile photo URL...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(90); $url=''; while((Get-Date) -lt $deadline){ if(Test-Path 'mobile-https-tunnel.log'){ $match=Select-String -Path 'mobile-https-tunnel.log' -Pattern 'https://[-0-9a-z]+\.trycloudflare\.com' | Select-Object -Last 1; if($match){ $m=[regex]::Match($match.Line,'https://[-0-9a-z]+\.trycloudflare\.com'); if($m.Success){ $url=$m.Value; break } } }; Start-Sleep -Seconds 1 }; if(-not $url){ exit 1 }; Set-Content -Path 'mobile-photo-url.txt' -Value $url; Write-Output $url"
if errorlevel 1 (
  set "MOBILE_PHOTO_URL="
  echo Failed to detect the secure mobile photo URL.
) else (
  for /f "usebackq delims=" %%U in ("mobile-photo-url.txt") do set "MOBILE_PHOTO_URL=%%U"
)

echo Opening project on this PC...
start %PC_URL%

echo.
echo ===================================================
echo   DONE
echo ===================================================
echo PC:
echo   %PC_URL%
echo.
echo MOBILE_FAST:
echo   %MOBILE_FAST_URL%
echo.
echo MOBILE_PHOTO:
if defined MOBILE_PHOTO_URL (
  echo   %MOBILE_PHOTO_URL%
) else (
  echo   Check mobile-https-tunnel.log
)
echo ===================================================
echo.
echo URL files:
echo   mobile-fast-url.txt
if exist mobile-photo-url.txt echo   mobile-photo-url.txt
echo.
echo Use:
echo   PC            = normal work on this computer
echo   MOBILE_FAST   = fast same-Wi-Fi mobile access
echo   MOBILE_PHOTO  = secure mobile access for camera/location testing
echo.
echo Keep these windows running:
echo   - CuringGuard-Backend
echo   - CuringGuard-Frontend
echo   - CuringGuard-Mobile-Photo
echo.
pause
