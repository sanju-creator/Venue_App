import pandas as pd
import os

files_to_check = [
    r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx",
    r"c:\Users\DELL\Desktop\VMS Automation\Raw Files\VMS Master.xlsx"
]

for file_path in files_to_check:
    if not os.path.exists(file_path): continue
    print(f"\nChecking: {file_path}")
    try:
        # Load all sheets
        xl = pd.ExcelFile(file_path)
        for sheet in xl.sheet_names:
            df = xl.parse(sheet, nrows=50) # check first 50 rows
            # Check for columns containing 'http' or 'www' Or 'Link' or 'Photo'
            for col in df.columns:
                col_str = str(col).lower()
                if 'photo' in col_str or 'image' in col_str or 'link' in col_str or 'url' in col_str:
                    print(f"Found interesting column in {sheet}: {col}")
                    print(df[col].dropna().head())
                
                # Check actual content for http
                if df[col].dtype == object:
                    mask = df[col].astype(str).str.contains('http', case=False, na=False)
                    if mask.any():
                        print(f"Found URL in column {col} of {sheet}")
                        print(df[col][mask].head())
    except Exception as e:
        print(f"Error checking {file_path}: {e}")
