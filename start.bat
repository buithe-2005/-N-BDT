@echo off
chcp 65001 >nul
title STRIDEX Launcher
echo ========================================================
echo   KHOI DONG HE THONG STRIDEX (Node.js + Python AI)
echo ========================================================
echo.

echo [1/2] Dang chay Backend Node.js tai http://localhost:3000 ...
start "STRIDEX Backend (Port 3000)" cmd /k "cd /d "%~dp0" && node server/index.js"

echo [2/2] Dang chay Dịch vu AI Python tai http://127.0.0.1:8001 ...
start "STRIDEX AI Service (Port 8001)" cmd /k "cd /d "%~dp0" && python ai-service/app.py"

echo.
echo ========================================================
echo Da khoi dong thanh cong ca 2 dich vu!
echo - Website:    http://localhost:3000
echo - AI Service: http://127.0.0.1:8001
echo ========================================================
echo Dang tu dong mo website tren trinh duyet...
timeout /t 2 >nul
start http://localhost:3000
