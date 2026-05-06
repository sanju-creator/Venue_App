import pandas as pd
import os

# Final list of 16 venues
venues_data = [
    {"Region": "North", "Type": "DOTC", "Code": "NR1-UP-3465", "Name": "DEXIT GLOBAL LIMITED-LUCKNOW"},
    {"Region": "North", "Type": "DOTC", "Code": "NR1-UP-3466", "Name": "DEXIT GLOBAL LIMITED-VARANASI"},
    {"Region": "North", "Type": "DATC", "Code": "NR2-DL-4161", "Name": "JAMIA MILLIA ISLAMIA"},
    {"Region": "North", "Type": "DATC", "Code": "NR2-HR-4050", "Name": "MANAV RACHNA UNIVERSITY"},
    {"Region": "South", "Type": "DOTC", "Code": "STH-KA-5809", "Name": "DEXIT GLOBAL LIMITED-SHIMOGA"},
    {"Region": "South", "Type": "DOTC", "Code": "STH-KA-5808", "Name": "DEXIT GLOBAL LIMITED-DAVANGERE"},
    {"Region": "South", "Type": "DATC", "Code": "STH-KL-5080", "Name": "NEHRU ARTS & SCIENCE COLLEGE"},
    {"Region": "South", "Type": "DATC", "Code": "STH-TN-5133", "Name": "SSN COLLEGE OF ENGINEERING"},
    {"Region": "East", "Type": "DOTC", "Code": "EST-AS-1424", "Name": "DEXIT GLOBAL LIMITED-DIBRUGARH"},
    {"Region": "East", "Type": "DOTC", "Code": "EST-WB-1439", "Name": "DEXIT GLOBAL LIMITED-SIURI"},
    {"Region": "East", "Type": "DATC", "Code": "EST-OR-1762", "Name": "VSS UNIVERSITY OF TECH, BURLA"},
    {"Region": "East", "Type": "DATC", "Code": "EST-WB-1398", "Name": "JADAVPUR UNIVERSITY"},
    {"Region": "West", "Type": "DOTC", "Code": "WST-MH-2806", "Name": "DEXIT GLOBAL LIMITED-VIRAR"},
    {"Region": "West", "Type": "DOTC", "Code": "WST-MH-2687", "Name": "DEXIT GLOBAL LIMITED-NASHIK"},
    {"Region": "West", "Type": "DATC", "Code": "WST-GJ-2548", "Name": "J. Z. SHAH ARTS & H. P. DESAI COLLEGE"},
    {"Region": "West", "Type": "DATC", "Code": "WST-MH-2287", "Name": "YASHWANTRAO CHAVAN INSTITUTE"}
]

# Fetch full addresses from VMS Master
master_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx"
df_master = pd.read_excel(master_path)

final_list = []
for v in venues_data:
    row = df_master[df_master['VENUE_CODE'] == v['Code']]
    if not row.empty:
        v['Address'] = row['COMPLETE_ADDRESS'].values[0]
        v['City'] = row['CITY'].values[0]
        v['State'] = row['STATE'].values[0]
    else:
        v['Address'] = "Not Found"
    final_list.append(v)

# Save to Excel
df_final = pd.DataFrame(final_list)
output_path = r"c:\Users\DELL\Desktop\VMS Automation\scratch\Final_Venue_List_16.xlsx"
df_final.to_excel(output_path, index=False)

print(f"File saved successfully at: {output_path}")
