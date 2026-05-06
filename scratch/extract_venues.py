import pandas as pd
import os

file_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx"

def load_smart_data(file_path):
    if not os.path.exists(file_path): return pd.DataFrame()
    try:
        # Mimic the app's loader
        preview = pd.read_excel(file_path, header=None, nrows=10)
        header_idx = 0
        for i, row in preview.iterrows():
            row_str = " ".join([str(x) for x in row.values])
            if any(key in row_str.upper() for key in ["ROW LABELS", "VENUE_TYPE", "CODE", "ACTIVE", "DMS_CODE", "STATUS"]):
                header_idx = i; break
        return pd.read_excel(file_path, header=header_idx)
    except Exception as e:
        print(f"Error loading: {e}")
        return pd.DataFrame()

df = load_smart_data(file_path)

if not df.empty:
    # Required columns
    # VENUE_CODE, VENUE_TYPE, REGION, VENUE_NAME (assuming names exist)
    
    # Standardize Regions
    def map_region(r):
        r = str(r).upper().strip()
        if "NORTH" in r: return "NORTH"
        if "SOUTH" in r: return "SOUTH"
        if "EAST" in r: return "EAST"
        if "WEST" in r: return "WEST"
        return r

    df['SIMPLE_REGION'] = df['REGION'].apply(map_region)
    
    # Filter Types
    df = df[df['VENUE_TYPE'].isin(['DOTC', 'DATC'])]
    
    results = []
    for region in ['NORTH', 'SOUTH', 'EAST', 'WEST']:
        for vtype in ['DOTC', 'DATC']:
            subset = df[(df['SIMPLE_REGION'] == region) & (df['VENUE_TYPE'] == vtype)]
            # Take top 2
            sample = subset.head(2)
            results.append(sample)
    
    final_df = pd.concat(results)
    
    # Select key columns
    cols = ['VENUE_CODE', 'VENUE_NAME', 'REGION', 'VENUE_TYPE']
    # Check if VENUE_NAME exists, if not use Code
    actual_cols = [c for c in cols if c in df.columns]
    
    print("VENUE_CODE | VENUE_NAME | REGION | VENUE_TYPE")
    print("-" * 60)
    for _, row in final_df[actual_cols].iterrows():
        line = " | ".join([str(row[c]) for c in actual_cols])
        print(line)
else:
    print("DataFrame is empty.")
