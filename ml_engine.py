import pandas as pd
import numpy as np
import os
import json
import joblib
import re
from datetime import datetime
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.multioutput import MultiOutputClassifier
import re as _re


def clean_project_name(series: pd.Series) -> pd.Series:
    """Clean project names by removing special chars, normalizing spacing, and filtering blanks."""
    s = series.fillna("").astype(str).str.strip()
    s_upper = s.str.upper()
    is_blank = (s == "") | (s == "-") | (s_upper == "NAN") | (s_upper == "NONE")
    s = s.mask(is_blank, "")
    s = s.str.replace(r"[^A-Za-z ]+", " ", regex=True)
    s = s.str.replace(r"\s+", " ", regex=True).str.strip()
    return s.str.upper()

BASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Data")
MODEL_PATH = os.path.join(BASE_PATH, "ml_model.pkl")
CACHE_PATH = os.path.join(BASE_PATH, "mapping_cache.json")
REQ_FIELDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Raw Files", "Call Logs", "Required_fields.xlsx")
OUTPUT_DIR = os.path.join(BASE_PATH, "Output")
TRAIN_SNAPSHOT_PATH = os.path.join(BASE_PATH, "ml_training_last.xlsx")
TRAIN_META_PATH = os.path.join(BASE_PATH, "ml_training_last_meta.json")

TARGET_COLS = [
    "UPDATED_CATEGORY",
    "UPDATED_SUBCATEGORY",
    "UPDATED_ITEM",
    "ISSUE_REMARK_BY_PRAFULL",
    "FINAL_ISSUE_REMARK_BY_PRAFULL",
    "ISSUE_CATEGORY"
]

DEFAULT_AUTO_APPROVE_THRESHOLD = 0.95

def load_tabular(path: str) -> pd.DataFrame:
    ext = os.path.splitext(path)[1].lower()
    if ext in [".xlsx", ".xls"]:
        if ext == ".xls":
            try:
                import xlrd  # noqa: F401
            except Exception as e:
                raise RuntimeError("Input is .xls. Install dependency `xlrd>=2.0.1` or convert the file to .xlsx.") from e
        return pd.read_excel(path)
    if ext == ".csv":
        # Try a couple of common encodings; keep everything as-is (no aggressive dtype coercion)
        last_err = None
        for enc in ["utf-8-sig", "utf-8", "cp1252"]:
            try:
                return pd.read_csv(path, encoding=enc)
            except Exception as e:
                last_err = e
        raise last_err
    # Fallback: try excel first, then csv
    try:
        return pd.read_excel(path)
    except Exception:
        return pd.read_csv(path, encoding="utf-8-sig")

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    # Strip whitespace and normalize consecutive spaces in column names
    df = df.copy()
    df.columns = [str(c).strip().replace("\u00a0", " ") for c in df.columns]
    return df

def ensure_columns_case_insensitive(df: pd.DataFrame, wanted_cols: list[str]) -> pd.DataFrame:
    # Rename columns so we can reference them with canonical names (case/spacing-insensitive match)
    df = df.copy()
    upper_map = {}
    for c in df.columns:
        key = str(c).strip().upper().replace(" ", "_")
        if key not in upper_map:
            upper_map[key] = c
    rename = {}
    for w in wanted_cols:
        key = str(w).strip().upper().replace(" ", "_")
        if key in upper_map and upper_map[key] != w:
            rename[upper_map[key]] = w
    if rename:
        df = df.rename(columns=rename)
    return df

def normalize_feature_key(text: str) -> str:
    s = "" if text is None else str(text)
    s = s.strip().upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def load_auto_approve_threshold() -> float:
    try:
        if os.path.exists(TRAIN_META_PATH):
            with open(TRAIN_META_PATH, "r", encoding="utf-8") as f:
                meta = json.load(f)
            val = meta.get("auto_approve_threshold", None)
            if isinstance(val, (int, float)) and 0 <= float(val) <= 1:
                return float(val)
    except Exception:
        pass
    return DEFAULT_AUTO_APPROVE_THRESHOLD

def choose_threshold_for_target(desired_accuracy: float, conf: np.ndarray, correct: np.ndarray) -> tuple[float, float, float]:
    # Returns: (threshold, achieved_accuracy, coverage)
    conf = np.asarray(conf, dtype="float64")
    correct = np.asarray(correct, dtype=bool)
    if conf.size == 0 or correct.size == 0 or conf.size != correct.size:
        return (1.0, 0.0, 0.0)

    order = np.argsort(-conf)  # descending confidence
    conf_sorted = conf[order]
    correct_sorted = correct[order]

    cum_correct = np.cumsum(correct_sorted)
    cum_total = np.arange(1, len(conf_sorted) + 1)
    cum_acc = cum_correct / cum_total

    ok = np.where(cum_acc >= desired_accuracy)[0]
    if ok.size == 0:
        return (1.0, 0.0, 0.0)

    k = int(ok.max()) + 1  # largest prefix meeting accuracy
    threshold = float(conf_sorted[k - 1])
    achieved_accuracy = float(cum_acc[k - 1])
    coverage = float(k / len(conf_sorted))
    return (threshold, achieved_accuracy, coverage)

def combine_text(row):
    # Combines input columns for text processing, mostly the descriptive ones
    cols = ["CATEGORY", "SUBCATEGORY", "ITEM", "SUBJECT", "DESCRIPTION", "RESOLUTION"]
    text = []
    for c in cols:
        if c in row and pd.notna(row[c]):
            val = str(row[c]).strip()
            if val and val.lower() not in ["none", "nan", "na", "-"]:
                text.append(val)
    return " | ".join(text)

def train_ml_model(master_file_path):
    try:
        if not os.path.exists(master_file_path):
            return False, f"Master file not found at {master_file_path}"

        df = normalize_columns(load_tabular(master_file_path))
        df = ensure_columns_case_insensitive(df, TARGET_COLS + ["CATEGORY", "SUBCATEGORY", "ITEM", "SUBJECT", "DESCRIPTION", "RESOLUTION"])
        
        # We need historical data where FINAL_ISSUE_REMARK_BY_PRAFULL is specified
        if "FINAL_ISSUE_REMARK_BY_PRAFULL" not in df.columns:
            return False, "Target column 'FINAL_ISSUE_REMARK_BY_PRAFULL' missing in Master Call Logs."

        df_train = df.dropna(subset=["FINAL_ISSUE_REMARK_BY_PRAFULL"])
        
        if df_train.empty:
            return False, "No tagged records found for training."

        # Create combined string features
        df_train["FEATURES"] = df_train.apply(combine_text, axis=1)
        df_train["FEATURES_NORM"] = df_train["FEATURES"].map(normalize_feature_key)
        X = df_train["FEATURES"].astype(str)
        
        # TARGET_COLS might be missing some in Master? 
        actual_targets = [c for c in TARGET_COLS if c in df_train.columns]
        
        if not actual_targets:
            return False, "No target columns found in Master Call Logs."

        Y = df_train[actual_targets].fillna("Unknown").astype(str)

        # Snapshot last training dataset for transparency/debugging (used by process output)
        # Save ALL columns so dates and master fields are preserved when concatenating with output
        try:
            df_train.to_excel(TRAIN_SNAPSHOT_PATH, index=False)
            with open(TRAIN_META_PATH, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "trained_on": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "source_file": os.path.abspath(master_file_path),
                        "rows_used": int(len(df_train)),
                        "targets": actual_targets,
                    },
                    f,
                    ensure_ascii=False,
                )
        except Exception:
            # Snapshot is optional; do not fail training if it can't be saved
            pass

        # Build pipeline
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(max_features=5000, ngram_range=(1,2))),
            # NOTE: keep n_jobs=1 to avoid permission issues on restricted Windows environments
            ('clf', MultiOutputClassifier(RandomForestClassifier(n_estimators=50, max_depth=20, random_state=42, n_jobs=1)))
        ])

        pipeline.fit(X, Y)

        # Estimate a confidence threshold for auto-approval (based on FINAL_ISSUE_REMARK_BY_PRAFULL if present)
        auto_approve_threshold = DEFAULT_AUTO_APPROVE_THRESHOLD
        try:
            from sklearn.model_selection import GroupShuffleSplit

            max_rows = 20000
            if len(df_train) > max_rows:
                df_eval = df_train.sample(max_rows, random_state=42).copy()
                X_eval = df_eval["FEATURES"].astype(str)
                Y_eval = df_eval[actual_targets].fillna("Unknown").astype(str)
            else:
                X_eval = X
                Y_eval = Y

            splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
            _, te_idx = next(splitter.split(X_eval, Y_eval, groups=X_eval))
            X_test = X_eval.iloc[te_idx]
            Y_test = Y_eval.iloc[te_idx]

            target_for_conf = "FINAL_ISSUE_REMARK_BY_PRAFULL" if "FINAL_ISSUE_REMARK_BY_PRAFULL" in actual_targets else actual_targets[0]
            t_idx = actual_targets.index(target_for_conf)

            preds = pipeline.predict(X_test)
            correct = (preds[:, t_idx].astype(str) == Y_test[target_for_conf].values.astype(str))

            probas = pipeline.predict_proba(X_test)
            conf_target = np.max(probas[t_idx], axis=1)

            thr, acc, cov = choose_threshold_for_target(0.95, conf_target, correct)
            if 0 <= thr <= 1 and cov > 0:
                auto_approve_threshold = float(thr)
        except Exception:
            auto_approve_threshold = DEFAULT_AUTO_APPROVE_THRESHOLD

        # Create exact mapping dictionary for 100% accuracy on previously seen inputs
        # Store both raw and normalized feature keys to increase cache hit-rate.
        cache = {}
        target_indices = {col: i for i, col in enumerate(actual_targets)}
        for _, row in df_train.iterrows():
            feat_raw = row["FEATURES"]
            feat_norm = row["FEATURES_NORM"]
            payload = {col: str(row[col]) if pd.notna(row[col]) else "" for col in actual_targets}

            if feat_raw and feat_raw not in cache:
                cache[feat_raw] = payload
            if feat_norm and feat_norm not in cache:
                cache[feat_norm] = payload

        # Save model & cache
        os.makedirs(BASE_PATH, exist_ok=True)
        joblib.dump(pipeline, MODEL_PATH)
        joblib.dump(actual_targets, os.path.join(BASE_PATH, "ml_targets.pkl"))
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)

        # Update training meta with the chosen threshold
        try:
            meta = {}
            if os.path.exists(TRAIN_META_PATH):
                with open(TRAIN_META_PATH, "r", encoding="utf-8") as f:
                    meta = json.load(f) or {}
            meta["auto_approve_threshold"] = auto_approve_threshold
            with open(TRAIN_META_PATH, "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False)
        except Exception:
            pass

        return True, f"ML Model successfully trained on {len(df_train)} unique historical records! Auto-approve threshold: {auto_approve_threshold:.2f}"

    except Exception as e:
        return False, f"Training Failed: {str(e)}"


def process_call_logs(raw_file_path):
    try:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(CACHE_PATH):
            return {"success": False, "msg": "Model not trained. Ask Admin to 'Train ML Model' first."}
            
        if not os.path.exists(REQ_FIELDS_PATH):
            return {"success": False, "msg": f"Mapping dictionary missing at {REQ_FIELDS_PATH}"}

        # Load resources
        pipeline = joblib.load(MODEL_PATH)
        actual_targets = joblib.load(os.path.join(BASE_PATH, "ml_targets.pkl"))
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            cache = json.load(f)

        # Safety: force single-threaded inference to avoid WinError 5 on restricted environments
        try:
            clf = pipeline.named_steps.get("clf", None)
            if clf is not None:
                if hasattr(clf, "n_jobs"):
                    clf.n_jobs = 1
                if hasattr(clf, "estimators_"):
                    for est in clf.estimators_:
                        if hasattr(est, "n_jobs"):
                            est.n_jobs = 1
        except Exception:
            pass

        # Load Required file mappings
        req_df = pd.read_excel(REQ_FIELDS_PATH)
        mapping = {}
        for _, row in req_df.iterrows():
            c_raw = str(row.get("Col_name_call-logs", "")).strip()
            c_fin = str(row.get("Master_call-log_final_columns", "")).strip()
            if c_raw and c_fin and c_raw.lower() != "nan" and c_fin.lower() != "nan":
                mapping[c_raw] = c_fin

        # Load Raw Data
        raw_df = normalize_columns(load_tabular(raw_file_path))
        
        # Rename Raw Columns -> Master Columns
        raw_df.rename(columns=mapping, inplace=True)
        raw_df = raw_df.loc[:, ~raw_df.columns.duplicated(keep='first')]
        
        # Build features for inference
        raw_df["FEATURES"] = raw_df.apply(combine_text, axis=1)
        raw_df["FEATURES_NORM"] = raw_df["FEATURES"].map(normalize_feature_key)
        
        results_df = pd.DataFrame(index=raw_df.index, columns=actual_targets)
        
        # Optimization: Apply known strings from cache
        cache_keys = set(cache.keys())
        mask_known_raw = raw_df["FEATURES"].isin(cache_keys)
        mask_known_norm = (~mask_known_raw) & raw_df["FEATURES_NORM"].isin(cache_keys)
        mask_known = mask_known_raw | mask_known_norm
        mask_unknown = ~mask_known

        if mask_known.sum() > 0:
            known_feats = raw_df.loc[mask_known, "FEATURES"]
            known_feats_norm = raw_df.loc[mask_known, "FEATURES_NORM"]
            lookup_key = known_feats.where(known_feats.isin(cache_keys), known_feats_norm)
            for col in actual_targets:
                results_df.loc[mask_known, col] = lookup_key.map(lambda x: cache.get(x, {}).get(col, ""))

        # Machine Learning Inference for unseen rows
        auto_approve_threshold = load_auto_approve_threshold()
        confidence_final = pd.Series(np.nan, index=raw_df.index, dtype="float64")
        prediction_source = pd.Series("ML", index=raw_df.index, dtype="object")
        prediction_source.loc[mask_known_raw] = "CACHED"
        prediction_source.loc[mask_known_norm] = "CACHED"
        confidence_final.loc[mask_known] = 1.0

        if mask_unknown.sum() > 0:
            X_new = raw_df.loc[mask_unknown, "FEATURES"].astype(str)
            preds = pipeline.predict(X_new)
            for i, col in enumerate(actual_targets):
                results_df.loc[mask_unknown, col] = preds[:, i]

            # Confidence for unseen rows (if available)
            try:
                probas = pipeline.predict_proba(X_new)
                target_for_conf = "FINAL_ISSUE_REMARK_BY_PRAFULL" if "FINAL_ISSUE_REMARK_BY_PRAFULL" in actual_targets else actual_targets[0]
                t_idx = actual_targets.index(target_for_conf)
                conf_unknown = np.max(probas[t_idx], axis=1)
                confidence_final.loc[mask_unknown] = conf_unknown
            except Exception:
                pass

        # Merge Results back
        for col in actual_targets:
            raw_df[col] = results_df[col]

        raw_df["PREDICTION_SOURCE"] = prediction_source
        raw_df["CONFIDENCE_FINAL"] = confidence_final.round(4)
        raw_df["NEEDS_REVIEW"] = np.where(
            (raw_df["PREDICTION_SOURCE"] == "ML")
            & (raw_df["CONFIDENCE_FINAL"].isna() | (raw_df["CONFIDENCE_FINAL"] < auto_approve_threshold)),
            "YES",
            "NO",
        )

        # Extra Computed Columns Formatting
        if "CREATED_TIME" in raw_df.columns:
            dt_series = pd.to_datetime(raw_df["CREATED_TIME"], errors='coerce')
            raw_df["UPDATED_DATE"] = dt_series.dt.strftime("%Y-%m-%d 00:00:00")
            raw_df["MONTH"] = dt_series.dt.strftime("%b")
            raw_df["YEAR"] = dt_series.dropna().dt.year.astype('Int64').astype(str)
            # Financial quarter mapping (India FY): Apr-Jun=Q1, Jul-Sep=Q2, Oct-Dec=Q3, Jan-Mar=Q4
            month_num = dt_series.dt.month
            fiscal_quarter = (((month_num + 8) % 12) // 3 + 1).astype("Int64")
            raw_df["QUARTER"] = np.where(
                dt_series.notna(),
                "Q" + fiscal_quarter.astype(str),
                ""
            )

        if "VENUE_NUMBER" in raw_df.columns and "CENTER_CODE" not in raw_df.columns:
            # Maybe derive DMS code? If CENTER_CODE provided, use it.
            pass
            
        if "CENTER_CODE" in raw_df.columns:
            raw_df["UPDATED_DMS_CODE"] = (
                raw_df["CENTER_CODE"]
                .astype(str)
                .str.replace(r"\.0$", "", regex=True)
                .str.replace(r"\s+", "", regex=True)
                .str.strip()
                .str.upper()
            )
            project_raw = (
                raw_df["PROJECT_NAME"].fillna("").astype(str).str.strip()
                if "PROJECT_NAME" in raw_df.columns
                else pd.Series([""] * len(raw_df), index=raw_df.index)
            )
            raw_df["CONCATE FOR PIVOT"] = (
                "45447|"
                + project_raw.astype(str)
                + "|"
                + raw_df["UPDATED_DMS_CODE"].astype(str)
                + "|"
                + raw_df.get("FINAL_ISSUE_REMARK_BY_PRAFULL", "").astype(str)
            )

        # Build Output Data matching exactly values in Master columns.
        # NOTE: project/address/venue enrichment is intentionally handled in central analysis engine.
        master_cols = list(mapping.values()) + actual_targets + [
            "UPDATED_DATE", "MONTH", "YEAR", "QUARTER",
            "UPDATED_DMS_CODE",
            "CONCATE", "CONCATE FOR PIVOT"
        ]
        master_cols = [c for c in master_cols if c in raw_df.columns]
        
        # De-duplicate to preserve order
        seen = set()
        final_cols = []
        for c in master_cols:
            if c not in seen:
                seen.add(c)
                final_cols.append(c)

        out_df = raw_df[final_cols].copy()

        # Add prediction QA columns to output
        for col_name in ["NEEDS_REVIEW", "CONFIDENCE_FINAL", "PREDICTION_SOURCE"]:
            if col_name in raw_df.columns and col_name not in out_df.columns:
                out_df.insert(0, col_name, raw_df[col_name].values)

        # Drop internal/temporary columns that should never appear in output
        _internal_cols = ["FEATURES", "FEATURES_NORM"]
        out_df.drop(columns=[c for c in _internal_cols if c in out_df.columns], inplace=True)
        
        # Clean "nan", "Unknown" before export 
        out_df.replace(["nan", "Unknown", "<NA>"], "", inplace=True)

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_file_btn1 = os.path.join(OUTPUT_DIR, f"ML_AutoTagged_CallLogs_{ts}_NEW_THEN_TRAINING.xlsx")
        out_file_btn2 = os.path.join(OUTPUT_DIR, f"ML_AutoTagged_CallLogs_{ts}_TRAINING_THEN_NEW.xlsx")

        # Export two combined variants:
        # 1) NEW first, then TRAINING
        # 2) TRAINING first, then NEW
        try:
            # --- Section 1: New analysis data (sorted by date, oldest first) ---
            new_df = out_df.copy()
            new_df.insert(0, "DATA_SOURCE", "NEW_ANALYSIS")
            if "CREATED_TIME" in new_df.columns:
                try:
                    new_df["_sort_date"] = pd.to_datetime(
                        new_df["CREATED_TIME"], errors="coerce", dayfirst=True
                    )
                    new_df.sort_values("_sort_date", ascending=True, na_position="last", inplace=True)
                    new_df.drop(columns=["_sort_date"], inplace=True)
                    new_df.reset_index(drop=True, inplace=True)
                except Exception:
                    pass

            # --- Section 2: Training data (sorted by date, oldest first) ---
            train_section = None
            if os.path.exists(TRAIN_SNAPSHOT_PATH):
                try:
                    train_df = pd.read_excel(TRAIN_SNAPSHOT_PATH)
                    train_df = train_df.copy()
                    # Normalize training column names to UPPER to match output columns
                    train_df.columns = [str(c).strip().upper().replace(" ", "_") for c in train_df.columns]
                    # Drop internal columns from training data too
                    train_df.drop(columns=[c for c in _internal_cols if c in train_df.columns], inplace=True)
                    train_df.insert(0, "DATA_SOURCE", "TRAINING_DATA")

                    if "CREATED_TIME" in train_df.columns:
                        try:
                            train_df["_sort_date"] = pd.to_datetime(
                                train_df["CREATED_TIME"], errors="coerce", dayfirst=True
                            )
                            train_df.sort_values("_sort_date", ascending=True, na_position="last", inplace=True)
                            train_df.drop(columns=["_sort_date"], inplace=True)
                            train_df.reset_index(drop=True, inplace=True)
                        except Exception:
                            pass
                    train_section = train_df
                except Exception:
                    pass

            # Standardize new_df columns to match train schema logic
            new_df.columns = [str(c).strip().upper().replace(" ", "_") for c in new_df.columns]

            if train_section is not None:
                # Define the columns to keep: common ones + essential ML prediction columns
                common_cols = [c for c in new_df.columns if c in train_section.columns]
                ensure_cols = ["NEEDS_REVIEW", "CONFIDENCE_FINAL", "PREDICTION_SOURCE"]

                for ec in ensure_cols:
                    if ec in new_df.columns and ec not in common_cols:
                        common_cols.append(ec)

                # Fill ML prediction columns in train_section with valid default values
                if "NEEDS_REVIEW" in new_df.columns:
                    train_section["NEEDS_REVIEW"] = "N/A"
                if "CONFIDENCE_FINAL" in new_df.columns:
                    train_section["CONFIDENCE_FINAL"] = 1.0
                if "PREDICTION_SOURCE" in new_df.columns:
                    train_section["PREDICTION_SOURCE"] = "HISTORICAL"

                new_aligned = new_df[common_cols].copy()
                train_aligned = train_section[common_cols].copy()
                combined_new_then_training = pd.concat([new_aligned, train_aligned], ignore_index=True, sort=False)
                combined_training_then_new = pd.concat([train_aligned, new_aligned], ignore_index=True, sort=False)
            else:
                combined_new_then_training = new_df.copy()
                combined_training_then_new = new_df.copy()

            # Ensure DATA_SOURCE is the first column
            def _data_source_first(df_variant: pd.DataFrame) -> pd.DataFrame:
                if "DATA_SOURCE" not in df_variant.columns:
                    return df_variant
                cols = df_variant.columns.tolist()
                cols.insert(0, cols.pop(cols.index("DATA_SOURCE")))
                return df_variant[cols]

            combined_new_then_training = _data_source_first(combined_new_then_training)
            combined_training_then_new = _data_source_first(combined_training_then_new)

            with pd.ExcelWriter(out_file_btn1, engine="openpyxl") as writer:
                combined_new_then_training.to_excel(writer, index=False, sheet_name="Sheet1")
            with pd.ExcelWriter(out_file_btn2, engine="openpyxl") as writer:
                combined_training_then_new.to_excel(writer, index=False, sheet_name="Sheet1")
        except Exception:
            # Fallback to simple export
            out_df.to_excel(out_file_btn1, index=False)
            out_df.to_excel(out_file_btn2, index=False)
        
        return {
            "success": True,
            "output_file_btn1": os.path.basename(out_file_btn1),
            "output_path_btn1": out_file_btn1,
            "output_file_btn2": os.path.basename(out_file_btn2),
            "output_path_btn2": out_file_btn2,
            # Backward compatibility
            "output_file": os.path.basename(out_file_btn1),
            "output_path": out_file_btn1,
            "total_rows": len(raw_df),
            "cached": int(mask_known.sum()),
            "ml_predicted": int(mask_unknown.sum()),
            "auto_approved_threshold": float(auto_approve_threshold),
            "auto_approved": int((raw_df["NEEDS_REVIEW"] == "NO").sum()),
            "needs_review": int((raw_df["NEEDS_REVIEW"] == "YES").sum()),
        }

    except Exception as e:
        return {"success": False, "msg": f"An error occurred: {str(e)}"}
