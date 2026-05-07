@echo off
title CuringGuard: Mobile HTTPS
echo ===================================================
echo   CuringGuard: Mobile HTTPS Launcher
echo ===================================================

echo [1/5] Clearing previous instances...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
)

if exist mobile-https-url.txt del /f /q mobile-https-url.txt >nul 2>&1
if exist mobile-https-tunnel.log del /f /q mobile-https-tunnel.log >nul 2>&1

echo [2/5] Starting Backend Server...
start "CuringGuard-Backend" cmd /k "cd /d %~dp0 && set PYTHONPATH=.&& uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"

echo [3/5] Starting Frontend Server with API proxy...
start "CuringGuard-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo [4/5] Starting HTTPS tunnel...
start "CuringGuard-Mobile-HTTPS" cmd /k "cd /d %~dp0 && tools\cloudflared.exe tunnel --url http://127.0.0.1:5173 --no-autoupdate 2>&1 | powershell -Command \"$input | Tee-Object -FilePath mobile-https-tunnel.log -Append\""

echo [5/5] Waiting for HTTPS URL...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(45); $url=''; while((Get-Date) -lt $deadline){ if(Test-Path 'mobile-https-tunnel.log'){ $match=Select-String -Path 'mobile-https-tunnel.log' -Pattern 'https://[-0-9a-z]+\.trycloudflare\.com' | Select-Object -Last 1; if($match){ $m=[regex]::Match($match.Line,'https://[-0-9a-z]+\.trycloudflare\.com'); if($m.Success){ $url=$m.Value; break } } }; Start-Sleep -Seconds 1 }; if($url){ Set-Content -Path 'mobile-https-url.txt' -Value $url; Write-Host ''; Write-Host 'OPEN THIS ON YOUR MOBILE:' -ForegroundColor Green; Write-Host $url -ForegroundColor Cyan; Set-Clipboard -Value $url } else { Write-Host ''; Write-Host 'Tunnel URL not detected yet. Check the CuringGuard-Mobile-HTTPS window.' -ForegroundColor Yellow }"

if exist mobile-https-url.txt (
  echo.
  echo Mobile HTTPS URL saved in mobile-https-url.txt and copied to clipboard.
) else (
  echo.
  echo Tunnel is still starting. Check the CuringGuard-Mobile-HTTPS window for the URL.
)

pause
