@echo off
setlocal

echo ==============================================
echo Starting VMS Node.js Website (Frontend + API)
echo ==============================================
echo.

cd /d "%~dp0vms-nodejs"
if errorlevel 1 (
  echo Project folder not found: vms-nodejs
  pause
  exit /b 1
)

if not exist node_modules (
  echo [Setup] node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Please check Node.js / npm setup.
    pause
    exit /b 1
  )
)

echo [1/2] Starting API Server on Port 5001...
start "VMS API Server" cmd /k "cd /d %CD% && set PORT=5001 && npm run api"

echo [2/2] Starting Frontend on Port 3000...
start "VMS Frontend Server" cmd /k "cd /d %CD% && npm run dev"

echo.
echo Done. Open: http://localhost:3000
echo You can close this window.
echo.
pause
