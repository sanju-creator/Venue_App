@echo off
echo Installing PyInstaller and making sure Streamlit is ready...
python -m pip install pyinstaller streamlit pandas numpy plotly streamlit-autorefresh openpyxl xlrd --quiet

echo.
echo Cleaning up previous builds...
rmdir /s /q build
rmdir /s /q dist

echo.
echo Building PyInstaller Executable (Folder Mode)...
python -m PyInstaller --noconfirm --onedir ^
  --name "Venue_App" ^
  --add-data "Venue_app.py;." ^
  --add-data "ml_engine.py;." ^
  --add-data "photo_manager.py;." ^
  --add-data "logo.png;." ^
  --add-data "ui;ui" ^
  --add-data "india-maps-data-main;india-maps-data-main" ^
  --add-data "Data;Data" ^
  --copy-metadata streamlit ^
  --collect-data streamlit ^
  --collect-data plotly ^
  --collect-data pandas ^
  --collect-data numpy ^
  --hidden-import streamlit ^
  run_main.py

echo.
echo Build Completed. The final app is in the "dist\Venue_App" folder.
