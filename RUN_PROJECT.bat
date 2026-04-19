@echo off
echo Starting CuringGuard Frontend Server...
cd /d "d:\CuringGuard\frontend"
start http://localhost:5173
npm run dev
pause
