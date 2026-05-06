@echo off
echo ==============================================
echo Starting VMS Node.js Website (Frontend + API)
echo ==============================================
echo.

REM Navigate to the actual project directory
cd /d "%~dp0vms-nodejs\vms-nodejs"

echo [1/2] Starting API Server (Backend) on Port 5000...
start "VMS API Server" cmd /k "node server.js"

echo [2/2] Starting Next.js Dev Server (Frontend) on Port 3000...
echo.
echo The website will be available at: http://localhost:3000
echo.
npm run dev

pause
