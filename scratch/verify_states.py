import pandas as pd
import re
import os

STATE_NAME_ALIASES = {
    "NCT OF DELHI": "DELHI",
    "NCT DELHI": "DELHI",
    "DELHI NCR": "DELHI",
    "ORISSA": "ODISHA",
    "UTTARANCHAL": "UTTARAKHAND",
    "JAMMU KASHMIR": "JAMMU AND KASHMIR",
    "JAMMU & KASHMIR": "JAMMU AND KASHMIR",
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "DADRA AND NAGAR HAVELI DAMAN AND DIU",
    "ANDAMAN NICOBAR": "ANDAMAN AND NICOBAR ISLANDS",
    "PONDICHERRY": "PUDUCHERRY",
}

FOREIGN_LOCATIONS = ["NEPAL", "UAE"]

def normalize_state_name(value: str) -> str:
    name = str(value or "").upper()
    name = name.replace("&", " AND ")
    name = re.sub(r"[^A-Z0-9]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return STATE_NAME_ALIASES.get(name, name)

def verify():
    excel_path = 'Data/VMS Master.xlsx'
    if not os.path.exists(excel_path):
        print(f"File not found: {excel_path}")
        return

    df = pd.read_excel(excel_path)
    # Match the column name check in Venue_app.py
    df.columns = df.columns.str.lower()
    
    if 'state' in df.columns:
        df['state'] = df['state'].fillna("").astype(str).apply(normalize_state_name)
        uncleaned_count = len(df['state'].unique())
        
        # Filter out Foreign Locations
        df = df[~df['state'].isin(FOREIGN_LOCATIONS)]
        df = df[df['state'] != '']
        
        states = sorted(df['state'].unique())
        print(f"Cleaned States: {states}")
        print(f"Count: {len(states)}")
        
        if "DELHI NCR" in states and "DELHI" in states:
            print("Verified: DELHI and DELHI NCR are separate.")
        if "JAMMU & KASHMIR" in states or "JAMMU KASHMIR" in states:
             print("Error: Variations of J&K still present.")
        if "NEPAL" in states or "UAE" in states:
            print("Error: Foreign locations still present.")
    else:
        print("Column 'state' not found in normalized columns.")

if __name__ == "__main__":
    verify()
