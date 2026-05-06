import os
import sys
import subprocess

# --- AUTO-INSTALLER FOR LIBRARIES ---
def install_dependencies():
    required = {'openai', 'pandas', 'tqdm', 'openpyxl'}
    for lib in required:
        try:
            __import__(lib)
        except ImportError:
            print(f"Installing missing library: {lib}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", lib])

install_dependencies()

import pandas as pd
import tkinter as tk
from tkinter import filedialog, messagebox
from tqdm import tqdm
from openai import OpenAI
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# ================== CONFIGURATION ==================

# 1. API Key - Use a fresh key from https://platform.openai.com/api-keys
API_KEY = "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" 

# 2. Settings
TARGET_COL  = "CALL LOG"
SHEET_NAME  = "Sheet1"
AI_MODEL    = "gpt-4o-mini"
MAX_WORKERS = 10 

client = OpenAI(api_key=API_KEY)

# ================== CATEGORY MASTER ==================
CATEGORIES = [
    "Exam application issue", "Exam module / exam system issue", "Exam login / URL / portal issue",
    "Exam schedule / batch / start-stop / password issue", "Auto seat allocation issue",
    "Question / content / translation / font / symbol error", "Question bank (QB) pull / push / cache issue",
    "Result / database / exam data related issue", "Candidate details / document / photo mismatch",
    "Candidate reporting / late reporting / wrong batch / wrong module", "Candidate behaviour / malpractice / debarred",
    "Candidate language / PWD / bio break / medical issue", "Wrong candidate allowed / extra candidate allowed / disallowed candidate",
    "CP application login / access issue", "CP application data / document upload / project / venue / app failure issue",
    "CP application device / platform specific issue (iOS / tablet / PAT SAFE)", "DCVD / verification dashboard / link / failure issue",
    "DCVD / verification details mismatch / exception / unauthorised activity", "DCVD / verification PC / asset shortage issue",
    "Power / electricity related issue", "Network / internet / VPN related issue",
    "Server / primary-secondary / time / Postgres / JJT / NTS / Spark issue",
    "Firewall / SSID / D-Mapping / MAC binding / CAARC / node / FTP / laptop backup issue",
    "IT infra error codes (E001 / E002 / SBT / other infra errors)",
    "IT asset / PC / laptop / printer / CCTV / camera / jammer related issue",
    "Venue open / denied / cleaning / other venue facility issue",
    "Venue exam delay / centre delay / other venue operational issue",
    "Venue payment / police validation / PWD friendly / forms / undertaking issue",
    "Venue asset damage / candidate damage / courier / security issue",
    "Venue staff / invigilator / observer / IT technician shortage",
    "Observer link / feedback / observer related issue", "Helpdesk / general query / operation scheduling issue",
    "Data / SSID / Postgress / logs / other data related issue", "Other IT issue (uncategorised)",
    "Other venue issue (uncategorised)", "Other / not defined"
]

SYSTEM_PROMPT = f"""
You are an expert Operations Analyst. Classify the call log into EXACTLY ONE category.
Categories: {", ".join(CATEGORIES)}
Return ONLY the category name. No other text.
"""

# ================== FUNCTIONS ==================

def show_error(title, message):
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(title, message)
    root.destroy()
    sys.exit(1)

def classify_row(text):
    text = str(text).strip() if pd.notna(text) else ""
    if not text or text.lower() == "nan":
        return "Other / not defined"

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text}
            ],
            temperature=0,
            timeout=20
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise RuntimeError(str(e))

def main():
    root = tk.Tk()
    root.withdraw()

    # 1. Select File
    input_file = filedialog.askopenfilename(
        title="Select Call Log Excel File",
        filetypes=[("Excel files", "*.xlsx *.xls")]
    )
    
    if not input_file:
        return

    # 2. Load and Validate
    try:
        # We try to read the sheet. If SHEET_NAME fails, we try reading the first sheet (index 0)
        try:
            df = pd.read_excel(input_file, sheet_name=SHEET_NAME)
        except:
            df = pd.read_excel(input_file, sheet_name=0)
            
        # Clean column names (remove hidden spaces)
        df.columns = [str(c).strip() for c in df.columns]

        if TARGET_COL not in df.columns:
            show_error("Column Error", f"Could not find '{TARGET_COL}'.\nAvailable: {list(df.columns)}")
    except Exception as e:
        show_error("File Read Error", f"Error: {e}")

    # 3. Connection Test
    print("--- [VERIFYING] Testing OpenAI Connection ---")
    try:
        classify_row("Test")
    except Exception as e:
        show_error("API Error", f"Check your API Key or Internet.\nDetails: {e}")

    # 4. Processing
    logs = df[TARGET_COL].tolist()
    print(f"--- [PROCESSING] {len(logs)} Rows ---")

    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # We use list(tqdm(...)) to ensure the progress bar updates correctly
            results = list(tqdm(executor.map(classify_row, logs), total=len(logs), desc="Classifying"))
    except Exception as e:
        show_error("Processing Error", f"Stopped to prevent loop. Error: {e}")

    # 5. Save Output
    df["AI_Assigned_Category"] = results
    
    output_dir = os.path.join(os.path.dirname(input_file), "Output_Files")
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = os.path.join(output_dir, f"Classified_Data_{timestamp}.xlsx")
    
    df.to_excel(out_file, index=False)
    
    messagebox.showinfo("Success", f"Done! File saved in the 'Output_Files' folder:\n\n{out_file}")

if __name__ == "__main__":
    main()