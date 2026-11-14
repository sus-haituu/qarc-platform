import pandas as pd
from sklearn.model_selection import train_test_split
import re

import numpy as np

def validate_row(row):
    """
    Validates a row based on required fields and LLM output formatting.
    Returns (is_valid, reason_if_invalid)
    """
    # 1. Technical fields must not be NaN/Inf
    technical_cols = ['rsi_14', 'macd', 'bollinger_position', 'vwap_deviation_pct']
    for col in technical_cols:
        val = row.get(col)
        if pd.isna(val) or (isinstance(val, (int, float)) and np.isinf(val)):
            return False, f"Invalid technical field: {col}"
            
    output = row.get('output', '')
    if pd.isna(output) or not isinstance(output, str):
        return False, "Missing output"
        
    # 2. Must contain all 7 required fields
    required_keys = [
        "Primary Seller Archetype:",
        "Seller Motivation:",
        "Seller Time Horizon:",
        "Primary Buyer Archetype:",
        "Buyer Motivation:",
        "Buyer Time Horizon:",
        "Confidence Score:"
    ]
    for key in required_keys:
        if key not in output:
            return False, f"Missing {key} in output"
            
    # 3. Confidence score must be float 0.0 - 1.0
    try:
        conf_match = re.search(r'Confidence Score:\s*([0-9.]+)', output)
        if not conf_match:
            return False, "Could not parse Confidence Score"
        score = float(conf_match.group(1))
        if not (0.0 <= score <= 1.0):
            return False, f"Confidence Score out of bounds: {score}"
    except Exception:
        return False, "Confidence Score not a float"
        
    # 4. Archetypes must not be identical
    try:
        seller_match = re.search(r'Primary Seller Archetype:\s*(.+)', output)
        buyer_match = re.search(r'Primary Buyer Archetype:\s*(.+)', output)
        if seller_match and buyer_match:
            if seller_match.group(1).strip().lower() == buyer_match.group(1).strip().lower():
                return False, "Identical buyer/seller archetypes"
    except Exception:
        pass
        
    return True, ""

def validate_and_split_data(df, output_dir):
    """
    Validates the dataset, flags bad rows, and splits the valid ones.
    """
    valid_rows = []
    flagged_rows = []
    
    for _, row in df.iterrows():
        is_valid, reason = validate_row(row)
        if is_valid:
            valid_rows.append(row)
        else:
            row_copy = row.copy()
            row_copy['flag_reason'] = reason
            flagged_rows.append(row_copy)
            
    valid_df = pd.DataFrame(valid_rows)
    flagged_df = pd.DataFrame(flagged_rows)
    
    if not flagged_df.empty:
        flagged_path = f"{output_dir}/flagged_for_review.csv"
        flagged_df.to_csv(flagged_path, index=False)
        print(f"Flagged {len(flagged_df)} rows. Saved to {flagged_path}")
        
    if valid_df.empty:
        print("No valid rows remaining after quality checks.")
        return 0, len(flagged_df), 0
        
    # Save full valid dataset
    qarc_path = f"{output_dir}/qarc_bcp_dataset.csv"
    valid_df.to_csv(qarc_path, index=False)
    
    # Strict Chronological (Out-of-Time) Split:
    # Sort strictly by date to eliminate lookahead bias and data leakage.
    valid_df['date'] = pd.to_datetime(valid_df['date'])
    valid_df = valid_df.sort_values(['date', 'ticker']).reset_index(drop=True)
    
    unique_dates = sorted(valid_df['date'].unique())
    n_dates = len(unique_dates)
    train_end_idx = int(n_dates * 0.80)
    val_end_idx = int(n_dates * 0.90)
    
    train_dates = set(unique_dates[:train_end_idx])
    val_dates = set(unique_dates[train_end_idx:val_end_idx])
    test_dates = set(unique_dates[val_end_idx:])
    
    train = valid_df[valid_df['date'].isin(train_dates)].copy()
    val = valid_df[valid_df['date'].isin(val_dates)].copy()
    test = valid_df[valid_df['date'].isin(test_dates)].copy()
    
    train.to_csv(f"{output_dir}/train.csv", index=False)
    val.to_csv(f"{output_dir}/val.csv", index=False)
    test.to_csv(f"{output_dir}/test.csv", index=False)
    
    train_date_list = sorted(list(train_dates))
    val_date_list = sorted(list(val_dates))
    test_date_list = sorted(list(test_dates))
    
    print(f"Chronological Out-of-Time Split saved:")
    if train_date_list:
        print(f" - Train ({len(train)} rows): {train_date_list[0].strftime('%Y-%m-%d')} to {train_date_list[-1].strftime('%Y-%m-%d')}")
    if val_date_list:
        print(f" - Val   ({len(val)} rows): {val_date_list[0].strftime('%Y-%m-%d')} to {val_date_list[-1].strftime('%Y-%m-%d')}")
    else:
        print(f" - Val   ({len(val)} rows)")
    if test_date_list:
        print(f" - Test  ({len(test)} rows): {test_date_list[0].strftime('%Y-%m-%d')} to {test_date_list[-1].strftime('%Y-%m-%d')}")
    else:
        print(f" - Test  ({len(test)} rows)")
    
    return len(df), len(flagged_df), len(valid_df)
