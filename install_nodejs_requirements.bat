@echo off
setlocal

echo ==============================================
echo Installing Node.js Requirements (vms-nodejs)
echo ==============================================
echo.

cd /d "%~dp0vms-nodejs"
if errorlevel 1 (
  echo [ERROR] vms-nodejs folder not found.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Please install Node.js first: https://nodejs.org
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [SUCCESS] Requirements installed successfully.
echo.
pause
