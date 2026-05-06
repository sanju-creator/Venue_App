import pandas as pd
import os

file_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx"
if os.path.exists(file_path):
    try:
        # The app uses a smart data loader that looks for headers. 
        # Let's try to mimic that or just read the first few rows.
        df = pd.read_excel(file_path, nrows=20)
        print("Columns:", df.columns.tolist())
        print("\nFirst 5 rows:")
        print(df.head())
        
        # Also check unique values for Region and Venue Type if columns exist
        potential_region_cols = [c for c in df.columns if 'region' in c.lower() or 'direction' in c.lower() or 'zone' in c.lower()]
        potential_type_cols = [c for c in df.columns if 'type' in c.lower() or 'category' in c.lower()]
        
        for col in potential_region_cols:
            print(f"\nUnique values in {col}:", df[col].unique().tolist())
        for col in potential_type_cols:
            print(f"\nUnique values in {col}:", df[col].unique().tolist())
            
    except Exception as e:
        print(f"Error reading file: {e}")
else:
    print(f"File not found: {file_path}")
