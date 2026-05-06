import pandas as pd
import pyodbc
import os
import re
from datetime import datetime, timedelta

# --- 1. SETTINGS & TIMESTAMP ---
folder_path = r"D:\Venue Performance\Timely Delivery Data\Excel"
timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
output_file = f"D:\\Venue Performance\\Timely Delivery Data\\Date_wise_Performance_{timestamp}.xlsx"

core_keywords = ['NIA', 'Denver', 'MFIN', 'Manchester', 'Mudra SPMT']

def clean_exam_name(name):
    name = str(name).strip()
    parts = re.split(r'\s+\d|\s+\(', name)
    return parts[0].strip()

def extract_dms_code(center_text):
    text = str(center_text)
    try:
        first_hyphen = text.find("-")
        second_hyphen = text.find("-", first_hyphen + 1)
        if second_hyphen != -1:
            start_index = second_hyphen - 3
            return text[start_index : start_index + 11].strip()
    except:
        pass
    return ""

def determine_department(exam_name):
    if exam_name == "Mudra": return "Core"
    if any(keyword in exam_name for keyword in core_keywords): return "Core"
    return "Gateway"

all_frames = []

# --- 2. DATA EXTRACTION ---
print("Extracting data...")
for file in os.listdir(folder_path):
    file_path = os.path.join(folder_path, file)
    
    if file.endswith(('.accdb', '.mdb')):
        try:
            conn_str = f'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={file_path};'
            conn = pyodbc.connect(conn_str)
            cursor = conn.cursor()
            all_tables = [t.table_name for t in cursor.tables(tableType='TABLE')]
            if all_tables:
                target_table = all_tables[0]
                cursor.execute(f"SELECT * FROM [{target_table}]")
                rows = cursor.fetchall()
                cols = [column[0] for column in cursor.description]
                df_access = pd.DataFrame.from_records(rows, columns=cols)
                df_access.columns = [c.lower().replace(" ", "").replace("_", "") for c in df_access.columns]
                
                mapping = {
                    'examname': 'Exam Name', 'examdate': 'exam_date', 
                    'examcenter': 'exam_center', 'actualstarttime': 'Actual Start Time', 
                    'startgracetime': 'Start Grace Time'
                }
                df_access = df_access.rename(columns=mapping)
                valid_cols = [c for c in mapping.values() if c in df_access.columns]
                all_frames.append(df_access[valid_cols].copy())
            conn.close()
        except Exception as e:
            print(f"Access error in {file}: {e}")

    elif file.endswith(('.xlsx', '.xls')):
        try:
            df_temp = pd.read_excel(file_path)
            df_temp.columns = [c.lower().replace(" ", "").replace("_", "") for c in df_temp.columns]
            mapping = {
                'examname': 'Exam Name', 'examdate': 'exam_date', 
                'examcenter': 'exam_center', 'actualstarttime': 'Actual Start Time', 
                'startgracetime': 'Start Grace Time'
            }
            df_temp = df_temp.rename(columns=mapping)
            valid_cols = [c for c in mapping.values() if c in df_temp.columns]
            all_frames.append(df_temp[valid_cols])
        except Exception as e:
            print(f"Excel error in {file}: {e}")

# --- 3. TRANSFORMATION ---
if all_frames:
    df = pd.concat(all_frames, ignore_index=True)
    
    df['Exam Name'] = df['Exam Name'].apply(clean_exam_name)
    df['Department'] = df['Exam Name'].apply(determine_department)
    df['DMS Code'] = df['exam_center'].apply(extract_dms_code)
    df['exam_date'] = pd.to_datetime(df['exam_date'], errors='coerce')
    
    df['Actual Start Time'] = pd.to_datetime(df['Actual Start Time'], errors='coerce')
    df['Start Grace Time'] = pd.to_datetime(df['Start Grace Time'], errors='coerce')
    df['Delay_Flag_Internal'] = (df['Actual Start Time'] > (df['Start Grace Time'] + timedelta(minutes=1))).astype(int)

    # --- 4. GROUPING (DATE + CENTER LEVEL) ---
    print("Grouping records...")
    # By including exam_center and DMS Code here, they will show up in the output
    final_grouped = df.groupby(['Department', 'Exam Name', 'exam_date', 'exam_center', 'DMS Code']).agg(
        Candidate_Appeared_Count=('Delay_Flag_Internal', 'count'),
        Candidate_Delayed_Count=('Delay_Flag_Internal', 'sum')
    ).reset_index()

    # --- 5. FINAL COLUMNS ---
    final_grouped['%'] = (final_grouped['Candidate_Delayed_Count'] / final_grouped['Candidate_Appeared_Count'] * 100).round(2)
    final_grouped['exam_date|Exam_Name|DMS Code'] = (
        final_grouped['exam_date'].dt.strftime('%m-%d-%Y') + "|" + 
        final_grouped['Exam Name'].astype(str) + "|" + 
        final_grouped['DMS Code'].astype(str)
    )
    final_grouped['Delay Flag'] = (final_grouped['Candidate_Delayed_Count'] > 0).astype(int)

    # Final Order for Date-wise with Center details
    cols_order = [
        'Department', 'Exam Name', 'exam_date', 'exam_center', 'DMS Code', 
        'exam_date|Exam_Name|DMS Code', 'Candidate_Appeared_Count', 
        'Candidate_Delayed_Count', 'Delay Flag', '%'
    ]
    
    # --- 6. EXPORT ---
    print("Generating Excel file...")
    with pd.ExcelWriter(output_file, engine='xlsxwriter', datetime_format='mm-dd-yyyy') as writer:
        final_grouped.reindex(columns=cols_order).to_excel(writer, index=False, sheet_name='Date-Center Analysis')
        
        worksheet = writer.sheets['Date-Center Analysis']
        for i, col in enumerate(cols_order):
            worksheet.set_column(i, i, 20)

    print(f"Success! Report saved as: {output_file}")