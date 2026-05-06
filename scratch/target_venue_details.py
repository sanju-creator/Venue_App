import pandas as pd
import os

master_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx"
df_master = pd.read_excel(master_path)

target_codes = [
    "NR1-UP-3161", "NR1-UP-3506", "NR1-BR-3613", "NR1-BR-3234",
    "STH-AP-5028", "STH-KL-5914", "STH-AP-5470", "STH-KA-5035",
    "EST-JH-1519", "EST-AR-1165", "EST-WB-1450", "EST-JH-1513",
    "WST-MH-2507", "WST-CG-2009", "WST-MP-2400", "WST-MH-2243"
]

col_code = 'VENUE_CODE'
col_name = 'NAME'
col_addr = 'COMPLETE_ADDRESS'

results = []
for code in target_codes:
    row = df_master[df_master[col_code] == code]
    if not row.empty:
        results.append({
            "code": code,
            "name": row[col_name].values[0],
            "address": row[col_addr].values[0]
        })
    else:
        results.append({"code": code, "name": "Not Found", "address": "Not Found"})

for res in results:
    print(f"Code: {res['code']} | Name: {res['name']} | Address: {res['address']}")
