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
powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ssh.exe' -and $_.CommandLine -match 'localhost\\.run' }; foreach($p in $procs){ try { Stop-Process -Id $p.ProcessId -Force } catch {} }" >nul 2>&1

for %%F in (
  mobile-fast-url.txt
  mobile-photo-url.txt
  mobile-https-tunnel.log
  localhost-run-tunnel.log
  mobile-https-status.log
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
set "MOBILE_PHOTO_URL="
set "MOBILE_PHOTO_CANDIDATE="
set "TUNNEL_OK="
set "TUNNEL_PROVIDER="
for /L %%R in (1,1,3) do (
  echo   Tunnel attempt %%R/3...
  if exist mobile-https-tunnel.log del /f /q mobile-https-tunnel.log >nul 2>&1
  if exist mobile-https-status.log del /f /q mobile-https-status.log >nul 2>&1
  taskkill /IM cloudflared.exe /F >nul 2>&1
  start "CuringGuard-Mobile-Photo" cmd /k "cd /d %~dp0 && tools\cloudflared.exe tunnel --url http://127.0.0.1:5173 --no-autoupdate > mobile-https-tunnel.log 2>&1"

  echo [8/8] Waiting for secure mobile photo URL...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$deadline=(Get-Date).AddSeconds(90); $url=''; while((Get-Date) -lt $deadline){ if(Test-Path 'mobile-https-tunnel.log'){ $matches=Select-String -Path 'mobile-https-tunnel.log' -Pattern 'https://[-0-9a-z]+\.trycloudflare\.com' | ForEach-Object { [regex]::Match($_.Line,'https://[-0-9a-z]+\.trycloudflare\.com').Value } | Where-Object { $_ -and $_ -notmatch 'https://api\.trycloudflare\.com' } | Select-Object -Unique; foreach($candidate in $matches){ try { $r=Invoke-WebRequest -Uri ($candidate + '/login') -UseBasicParsing -TimeoutSec 8; if($r.StatusCode -ge 200){ $url=$candidate; break } } catch {} }; if($url){ break } }; Start-Sleep -Seconds 1 }; if(-not $url){ exit 1 }; Set-Content -Path 'mobile-photo-url.txt' -Value $url; Write-Output $url"
  if not errorlevel 1 (
    for /f "usebackq delims=" %%U in (`type "mobile-photo-url.txt"`) do set "MOBILE_PHOTO_URL=%%U"
    set "TUNNEL_OK=1"
    set "TUNNEL_PROVIDER=Cloudflare"
    goto :after_tunnel
  )
  echo   Tunnel attempt %%R failed.
)

if not defined TUNNEL_OK (
  echo   Cloudflare quick tunnel failed. Trying localhost.run fallback...
  if exist localhost-run-tunnel.log del /f /q localhost-run-tunnel.log >nul 2>&1
  start "CuringGuard-Mobile-Photo" cmd /k "cd /d %~dp0 && ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:5173 nokey@localhost.run > localhost-run-tunnel.log 2>&1"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$deadline=(Get-Date).AddSeconds(45); $url=''; while((Get-Date) -lt $deadline){ if(Test-Path 'localhost-run-tunnel.log'){ $matches=Select-String -Path 'localhost-run-tunnel.log' -Pattern 'https://[A-Za-z0-9.-]+\.life' | ForEach-Object { [regex]::Match($_.Line,'https://[A-Za-z0-9.-]+\.life').Value } | Select-Object -Unique; foreach($candidate in $matches){ try { $r=Invoke-WebRequest -Uri ($candidate + '/login') -UseBasicParsing -TimeoutSec 8; if($r.StatusCode -ge 200){ $url=$candidate; break } } catch {} }; if($url){ break } }; Start-Sleep -Seconds 1 }; if(-not $url){ exit 1 }; Set-Content -Path 'mobile-photo-url.txt' -Value $url; Write-Output $url"
  if not errorlevel 1 (
    for /f "usebackq delims=" %%U in (`type "mobile-photo-url.txt"`) do set "MOBILE_PHOTO_URL=%%U"
    set "TUNNEL_OK=1"
    set "TUNNEL_PROVIDER=localhost.run"
    goto :after_tunnel
  )
)

:after_tunnel
if not defined TUNNEL_OK (
  set "MOBILE_PHOTO_URL="
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$m=Select-String -Path 'mobile-https-tunnel.log' -Pattern 'https://[-0-9a-z]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | ForEach-Object { [regex]::Match($_.Line,'https://[-0-9a-z]+\.trycloudflare\.com').Value } | Where-Object { $_ -and $_ -notmatch 'https://api\.trycloudflare\.com' } | Select-Object -First 1; if($m){ Write-Output $m }"` ) do set "MOBILE_PHOTO_CANDIDATE=%%U"
  if not defined MOBILE_PHOTO_CANDIDATE (
    for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$m=Select-String -Path 'localhost-run-tunnel.log' -Pattern 'https://[A-Za-z0-9.-]+\.life' -ErrorAction SilentlyContinue | ForEach-Object { [regex]::Match($_.Line,'https://[A-Za-z0-9.-]+\.life').Value } | Select-Object -First 1; if($m){ Write-Output $m }"` ) do set "MOBILE_PHOTO_CANDIDATE=%%U"
  )
  if defined MOBILE_PHOTO_CANDIDATE (
    > mobile-photo-url.txt echo(!MOBILE_PHOTO_CANDIDATE!
  )
  echo Failed to detect a fully verified secure mobile photo URL.
)

if not defined MOBILE_PHOTO_URL (
  if exist mobile-photo-url.txt (
    for /f "usebackq delims=" %%U in (`type "mobile-photo-url.txt"`) do set "MOBILE_PHOTO_URL=%%U"
  )
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
  echo   !MOBILE_PHOTO_URL!
  if defined TUNNEL_PROVIDER echo   Provider: !TUNNEL_PROVIDER!
 ) else if defined MOBILE_PHOTO_CANDIDATE (
  echo   !MOBILE_PHOTO_CANDIDATE!
  echo   ^(tunnel created; URL may need a short moment before first load^)
) else (
  echo   Secure tunnel did not return a usable URL.
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
