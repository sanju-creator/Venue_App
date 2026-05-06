import pandas as pd
import os

filepath = os.path.join("Data", "0 Final_Manpower_20260404_1559.xlsx")
df_manpower = pd.read_excel(filepath, sheet_name="Data")

dms_code_input = "EST-AS-1420"
dms_mask = df_manpower['DMS_CODE'].astype(str).str.contains(dms_code_input, case=False, na=False)
df_filtered = df_manpower[dms_mask].copy()

if df_filtered.empty:
    print("No data found")
else:
    df_filtered['Exam Days'] = pd.to_numeric(df_filtered.get('Exam Days', 1), errors='coerce').fillna(1)

    def agg_emp(grp):
        proj_grp = grp.groupby('Project Name', dropna=False)
        return pd.Series({
            'Project Count': proj_grp['Exam Days'].max().fillna(1).sum(),
            'Call Logs Issue Count': proj_grp['Call Logs Issue Count'].max().fillna(0).sum(),
            'FFA': proj_grp['FFA'].max().fillna(0).sum(),
            'Full Batch Delay': proj_grp['Full Batch Delay'].max().fillna(0).sum(),
            'Partially Batch Delay': proj_grp['Partially Batch Delay'].max().fillna(0).sum(),
            'No Delay': proj_grp['No Delay'].max().fillna(0).sum()
        })
        
    df_agg = df_filtered.groupby(['Emp_ID', 'Name', 'Tenure'], dropna=False).apply(agg_emp, include_groups=False).reset_index()

    overall_proj = df_filtered.groupby('Project Name', dropna=False)
    total_project_count = int(overall_proj['Exam Days'].max().fillna(1).sum())
    total_ffa = float(overall_proj['FFA'].max().fillna(0).sum())
    total_call_logs = int(overall_proj['Call Logs Issue Count'].max().fillna(0).sum())

    print(f"DMS Code: {dms_code_input}")
    print(f"Total Project Count (Sum of Exam Days): {total_project_count}")
    print(f"Total FFA: {total_ffa}")
    print(f"Total Call Logs: {total_call_logs}")
    print("\nAggregated Table (First 10 rows):")
    print(df_agg.head(10))
