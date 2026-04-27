@echo off
title CuringGuard: RUN & RESET
echo ===================================================
echo   CuringGuard: Structural Monitoring System
echo ===================================================

echo [1/4] Clearing previous instances...
:: Kill Backend on port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /F /PID %%a >nul 2>&1
)
:: Kill Frontend on port 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/4] Starting Backend Server (FastAPI)...
start "CuringGuard-Backend" cmd /k "cd /d %~dp0 && set PYTHONPATH=.&& uvicorn backend.app.main:app --reload --port 8000"

echo [3/4] Starting Frontend Server (Vite)...
start "CuringGuard-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo [4/4] Launching Browser...
timeout /t 5 >nul
start http://localhost:5173/login

echo.
echo All systems operational and reset.
echo.
pause
