@echo off
echo ==============================================
echo Starting Venue Inventory Application
echo ==============================================
echo.

REM ---------------------------------
REM Move to project folder (Dynamic Path)
REM ---------------------------------
cd /d "%~dp0"

echo [1/3] Checking and installing required packages (this may take a minute if first time)...
python -m pip install streamlit pandas numpy plotly streamlit-autorefresh openpyxl xlrd --quiet

echo [2/3] Cleaning up old sessions...
taskkill /f /im streamlit.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1

echo [3/3] Launching App Dashboard in Your Browser...
echo.
python -m streamlit run Venue_app.py

if %errorlevel% neq 0 (
    echo.
    echo -------------------------------------------------------------------
    echo [ERROR] The application crashed or couldn't start!
    echo Please read the red error lines above to identify the problem.
    echo -------------------------------------------------------------------
    pause
)
