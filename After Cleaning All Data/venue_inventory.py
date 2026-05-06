import pandas as pd
import os
import numpy as np
from datetime import datetime

# ==============================
# 1. Base Paths & Folder Setup
# ==============================
base_path = r"C:\Users\07781\Downloads\Project Master"
outputpath = r"C:\Users\07781\Downloads\Project Master\Output"

os.makedirs(outputpath, exist_ok=True)

# ==============================
# 2. Read All Files
# ==============================
try:
    vms = pd.read_csv(os.path.join(base_path, "VMS.csv"))
    blacklisted = pd.read_csv(os.path.join(base_path, "Blacklisted.csv"))
    ffa = pd.read_csv(os.path.join(base_path, "ffa.csv"))
    deo = pd.read_csv(os.path.join(base_path, "day_end_observations.csv"))
    suspicious = pd.read_csv(os.path.join(base_path, "suspicious_venues.csv"))
    market_review = pd.read_csv(os.path.join(base_path, "Google review and ratings.csv"))
    call_logs = pd.read_csv(os.path.join(base_path, "Master Call Logs.csv"))
except Exception as e:
    print(f"Error reading files: {e}")
    exit()

# ==============================
# 3. Standardize Column Names
# ==============================
for df in [vms, blacklisted, ffa, deo, suspicious, market_review, call_logs]:
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")

# ==============================
# 4. Aggressive DMS Code Cleaning
# ==============================
def clean_dms(df, col_name):
    if col_name in df.columns:
        df[col_name] = (
            df[col_name]
            .astype(str)
            .str.replace(r'\.0$', '', regex=True)
            .str.replace(r'\s+', '', regex=True)
            .str.strip()
            .str.upper()
        )
    return df

vms = clean_dms(vms, "dms_code")
blacklisted = clean_dms(blacklisted, "dms_code")
ffa = clean_dms(ffa, "dms_code")
deo = clean_dms(deo, "dms_code")
suspicious = clean_dms(suspicious, "dms_code")
call_logs = clean_dms(call_logs, "dms_code")

if "updated_dms_code" in call_logs.columns:
    call_logs = clean_dms(call_logs, "updated_dms_code")
    call_logs = call_logs.rename(columns={"updated_dms_code": "dms_code"})

vms = vms[vms["dms_code"].notna() & (vms["dms_code"] != "NAN") & (vms["dms_code"] != "")]

# ==============================
# 5. Data Merging
# ==============================

# Blacklist Info
blacklisted["blacklist_info"] = (
    blacklisted["remark"].fillna("").astype(str)
    + " by "
    + blacklisted["blacklisted_by"].fillna("").astype(str)
)

merged = vms.merge(
    blacklisted[["dms_code", "blacklist_info"]],
    on="dms_code",
    how="left"
).fillna({"blacklist_info": ""})

# FFA Count
ffa_count = ffa.groupby("dms_code").size().reset_index(name="ffa_frequency")
merged = merged.merge(ffa_count, on="dms_code", how="left").fillna({"ffa_frequency": 0})

# DEO Summary
deo["remark"] = deo["remark"].fillna("").astype(str).str.strip()

deo_summary = (
    deo.groupby(["dms_code", "remark"])
    .size()
    .reset_index(name="count")
    .groupby("dms_code")
    .apply(lambda x: ", ".join(f"{r}({c})" for r, c in zip(x["remark"], x["count"])))
    .reset_index(name="deo_remarks_summary")
)

merged = merged.merge(deo_summary, on="dms_code", how="left").fillna({"deo_remarks_summary": ""})

# Suspicious Summary
susp_summary = (
    suspicious.groupby(["dms_code", "issue_type"])
    .size()
    .reset_index(name="count")
    .groupby("dms_code")
    .apply(lambda x: ", ".join(f"{r}({c})" for r, c in zip(x["issue_type"], x["count"])))
    .reset_index(name="suspicious_summary")
)

merged = merged.merge(susp_summary, on="dms_code", how="left").fillna({"suspicious_summary": ""})

# Call Logs Summary
if "final_issue_remark_by_prafull" in call_logs.columns:

    call_logs = call_logs[
        call_logs["final_issue_remark_by_prafull"].str.lower() != "other low impact issues"
    ]

    call_summary = (
        call_logs.groupby(["dms_code", "final_issue_remark_by_prafull"])
        .size()
        .reset_index(name="count")
        .groupby("dms_code")
        .apply(lambda x: ", ".join(
            f"{r}({c})" for r, c in zip(x["final_issue_remark_by_prafull"], x["count"])
        ))
        .reset_index(name="call_log_summary")
    )

    merged = merged.merge(call_summary, on="dms_code", how="left").fillna({"call_log_summary": ""})

# ==============================
# 6. Market Review Processing
# ==============================
market_review["google_ratings_num"] = pd.to_numeric(
    market_review["google_ratings"], errors="coerce"
)

market_review["google_review_count_num"] = pd.to_numeric(
    market_review["google_review_count"], errors="coerce"
)

conditions = [
    market_review["google_review_count_num"] < 10,
    (market_review["google_ratings_num"] >= 4) & (market_review["google_review_count_num"] >= 10),
    (market_review["google_ratings_num"] <= 2) & (market_review["google_review_count_num"] >= 10),
    (market_review["google_ratings_num"] < 4) & (market_review["google_review_count_num"] >= 10),
]

choices = [
    "Doubtful (Reviews < 10)",
    "Good (Rating >=4 & Reviews >=10)",
    "Poor (Rating <=2 & Reviews >=10)",
    "Average (Rating <4 & Reviews >=10)"
]

market_review["market_remark"] = np.select(conditions, choices, default="")

merged = merged.merge(
    market_review[["dms_code", "market_remark"]],
    on="dms_code",
    how="left"
).fillna({"market_remark": ""})

# ==============================
# 7. FINAL ANALYSIS ENGINE
# ==============================

merged["final_analysis"] = "Good"
merged["reason"] = "Good"

# -------- BLACKLIST PRIORITY --------

mask_complete = merged["blacklist_info"].str.startswith(
    "Completely Blacklisted", na=False, case=False
)

mask_customer = merged["blacklist_info"].str.startswith(
    "Customer Specific Blacklisted", na=False, case=False
)

merged.loc[mask_complete, "final_analysis"] = "COMPLETELY BLACKLISTED"
merged.loc[mask_complete, "reason"] = merged.loc[mask_complete, "blacklist_info"]

merged.loc[mask_customer, "final_analysis"] = "CUSTOMER SPECIFIC BLACKLISTED"
merged.loc[mask_customer, "reason"] = merged.loc[mask_customer, "blacklist_info"]

# Separate non-blacklisted venues
non_blacklisted = merged[~(mask_complete | mask_customer)].copy()

# -------- FFA --------
mask = non_blacklisted["ffa_frequency"] >= 1
non_blacklisted.loc[mask, "final_analysis"] = "Sensitive Venue"
non_blacklisted.loc[mask, "reason"] = "Found in FFA"

# -------- DEO --------
mask = (non_blacklisted["deo_remarks_summary"] != "") & (non_blacklisted["final_analysis"] == "Good")
non_blacklisted.loc[mask, "final_analysis"] = "Sensitive Venue"
non_blacklisted.loc[mask, "reason"] = non_blacklisted.loc[mask, "deo_remarks_summary"]

# -------- Suspicious --------
mask = (non_blacklisted["suspicious_summary"] != "") & (non_blacklisted["final_analysis"] == "Good")
non_blacklisted.loc[mask, "final_analysis"] = "Sensitive Venue"
non_blacklisted.loc[mask, "reason"] = non_blacklisted.loc[mask, "suspicious_summary"]

# -------- Call Logs --------
mask = (non_blacklisted["call_log_summary"] != "") & (non_blacklisted["final_analysis"] == "Good")
non_blacklisted.loc[mask, "final_analysis"] = "Average"
non_blacklisted.loc[mask, "reason"] = non_blacklisted.loc[mask, "call_log_summary"]

# -------- Market Review --------
mask = (non_blacklisted["market_remark"] != "") & (non_blacklisted["final_analysis"] == "Good")
non_blacklisted.loc[mask, "final_analysis"] = non_blacklisted.loc[mask, "market_remark"]
non_blacklisted.loc[mask, "reason"] = non_blacklisted.loc[mask, "market_remark"]

# Combine results
blacklisted_only = merged[mask_complete | mask_customer]
final_result = pd.concat([blacklisted_only, non_blacklisted], ignore_index=True)

# ==============================
# 8. Save Output
# ==============================

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

output_file_name = f"VMS_Analysis_{timestamp}.csv"

output_full_path = os.path.join(outputpath, output_file_name)

final_result.to_csv(output_full_path, index=False)

print("-" * 30)
print("PROCESS COMPLETE")
print(f"File Saved: {output_full_path}")
print("-" * 30)

print("Analysis Summary:")
print(final_result["final_analysis"].value_counts())