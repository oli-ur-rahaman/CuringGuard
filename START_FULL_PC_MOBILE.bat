@echo off
setlocal
title CuringGuard: Full PC + Mobile Launcher

echo ===================================================
echo   CuringGuard: Full PC + Mobile Launcher
echo   Fresh reset + local browser + secure mobile URL
echo ===================================================

cd /d %~dp0

echo [1/7] Stopping old backend/frontend/tunnel processes...
for %%P in (8000 5173 5174) do (
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)
taskkill /IM cloudflared.exe /F >nul 2>&1

if exist mobile-https-url.txt del /f /q mobile-https-url.txt >nul 2>&1
if exist mobile-https-tunnel.log del /f /q mobile-https-tunnel.log >nul 2>&1
if exist backend-mobile.log del /f /q backend-mobile.log >nul 2>&1
if exist frontend-mobile.log del /f /q frontend-mobile.log >nul 2>&1

echo [2/7] Ensuring mobile tunnel tool exists...
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

echo [3/7] Starting backend...
start "CuringGuard-Backend" cmd /k "cd /d %~dp0 && set PYTHONPATH=.&& uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000 > backend-mobile.log 2>&1"

echo [4/7] Starting frontend...
start "CuringGuard-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort > ..\\frontend-mobile.log 2>&1"

echo [5/7] Waiting for frontend to come online...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(45); $ready=$false; while((Get-Date) -lt $deadline){ try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:5173/login' -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -ge 200){ $ready=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if(-not $ready){ exit 1 }"
if errorlevel 1 (
  echo Frontend did not start on port 5173.
  echo Check the CuringGuard-Frontend window.
  pause
  exit /b 1
)

echo [6/7] Starting secure mobile tunnel...
start "CuringGuard-Mobile-HTTPS" cmd /k "cd /d %~dp0 && tools\cloudflared.exe tunnel --url http://127.0.0.1:5173 --no-autoupdate > mobile-https-tunnel.log 2>&1"

echo [7/7] Waiting for secure mobile URL...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(90); $url=''; while((Get-Date) -lt $deadline){ if(Test-Path 'mobile-https-tunnel.log'){ $match=Select-String -Path 'mobile-https-tunnel.log' -Pattern 'https://[-0-9a-z]+\.trycloudflare\.com' | Select-Object -Last 1; if($match){ $m=[regex]::Match($match.Line,'https://[-0-9a-z]+\.trycloudflare\.com'); if($m.Success){ $url=$m.Value; break } } }; Start-Sleep -Seconds 1 }; if(-not $url -and (Test-Path 'mobile-https-url.txt')){ $url=(Get-Content 'mobile-https-url.txt' -ErrorAction SilentlyContinue | Select-Object -First 1).Trim() }; if(-not $url){ exit 1 }; Set-Content -Path 'mobile-https-url.txt' -Value $url; Set-Clipboard -Value $url; Write-Host ''; Write-Host '===================================================' -ForegroundColor Green; Write-Host ' MOBILE HTTPS URL ' -ForegroundColor Green; Write-Host '===================================================' -ForegroundColor Green; Write-Host $url -ForegroundColor Cyan; Write-Host '===================================================' -ForegroundColor Green"
if errorlevel 1 (
  echo Tunnel URL not detected yet.
  echo Check mobile-https-tunnel.log or the CuringGuard-Mobile-HTTPS window.
) else (
  echo.
  echo Mobile URL saved to mobile-https-url.txt and copied to clipboard.
)

echo Opening project on this PC...
start http://localhost:5173/login

echo.
echo ===================================================
echo   DONE
echo ===================================================
echo PC URL:
echo   http://localhost:5173/login
if exist mobile-https-url.txt (
  echo.
  echo ===================================================
  echo MOBILE URL:
  type mobile-https-url.txt
  echo ===================================================
  echo.
  echo The mobile URL is also copied to clipboard.
)
echo.
echo Keep these 3 windows running:
echo   - CuringGuard-Backend
echo   - CuringGuard-Frontend
echo   - CuringGuard-Mobile-HTTPS
echo.
pause
