import os
import sys
import threading
import time
import webbrowser
from streamlit.web import cli as stcli

def open_browser():
    # Wait for the Streamlit server to boot up
    time.sleep(3)
    # Streamlit typically launches on 8501
    webbrowser.open_new("http://localhost:8501")

if __name__ == '__main__':
    # Determine absolute base path (handles pyinstaller single-dir/sys._MEIPASS issues)
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    app_path = os.path.join(base_path, 'Venue_app.py')
    
    # Force headless and no-stats to prevent browser auto-opening from crashing inside pyinstaller
    sys.argv = [
        "streamlit", 
        "run", 
        app_path, 
        "--global.developmentMode=false", 
        "--server.headless=true",
        "--browser.gatherUsageStats=false"
    ]
    
    # Launch background thread to open the local browser window
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Override Streamlit config dir (sometimes prevents read-only errors on target machines)
    os.environ['STREAMLIT_CONFIG_DIR'] = os.path.join(base_path, '.streamlit')
    
    sys.exit(stcli.main())
