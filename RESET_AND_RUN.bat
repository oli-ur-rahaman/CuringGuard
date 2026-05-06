@echo off
title CuringGuard System Reset
echo ===================================================
echo   CuringGuard: Structural Monitoring System
echo          FULL SYSTEM RESET & RESTART
echo ===================================================

echo [1/4] Killing existing Backend processes (Port 8000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    echo Terminating PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/4] Killing existing Frontend processes (Port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    echo Terminating PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [3/4] Starting Backend Server (FastAPI)...
start "CuringGuard-Backend" cmd /k "cd /d %~dp0 && set PYTHONPATH=.&& uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"

echo [4/4] Starting Frontend Server (Vite)...
start "CuringGuard-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Waiting for servers to initialize...
timeout /t 5 >nul

echo Launching CuringGuard Login...
start http://localhost:5173/login

echo.
echo ===================================================
echo   RESET COMPLETE - ALL SYSTEMS RUNNING FRESH
echo ===================================================
echo - Backend: http://localhost:8000
echo - Frontend: http://localhost:5173
echo.
pause
