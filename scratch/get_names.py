import pandas as pd
import os

file_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx"

def load_smart_data(file_path):
    if not os.path.exists(file_path): return pd.DataFrame()
    try:
        preview = pd.read_excel(file_path, header=None, nrows=10)
        header_idx = 0
        for i, row in preview.iterrows():
            row_str = " ".join([str(x) for x in row.values])
            if any(key in row_str.upper() for key in ["ROW LABELS", "VENUE_TYPE", "CODE", "ACTIVE", "DMS_CODE", "STATUS"]):
                header_idx = i; break
        return pd.read_excel(file_path, header=header_idx)
    except: return pd.DataFrame()

df = load_smart_data(file_path)

codes = [
    'NR1-BR-3469', 'NR1-BR-3468', 'NR1-BR-3386', 'NR1-BR-3002',
    'STH-AP-5757', 'STH-AP-5762', 'STH-AP-5764', 'STH-AP-5739',
    'EST-AN-1159', 'EST-AR-1165', 'EST-AN-1149', 'EST-AN-1150',
    'WST-CG-2545', 'WST-CG-2546', 'WST-CG-2531', 'WST-CG-2001'
]

# Find name column
name_col = next((c for c in df.columns if c.lower() in ['venue_name', 'name', 'updated_venue_name', 'venue name']), None)
code_col = next((c for c in df.columns if c.lower() in ['venue_code', 'dms_code', 'code']), None)

if code_col and name_col:
    subset = df[df[code_col].isin(codes)]
    for _, row in subset.iterrows():
        print(f"{row[code_col]} | {row[name_col]} | {row['REGION']} | {row['VENUE_TYPE']}")
else:
    print(f"Columns not found. Code Col: {code_col}, Name Col: {name_col}")
    print("Available columns:", df.columns.tolist())
