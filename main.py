import os
import time
import argparse
import threading
import concurrent.futures
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from tqdm import tqdm

from fetch_data import build_historical_dataset, fetch_historical_bulk_block_deals, DATA_DIR
from compute_indicators import compute_all_indicators, sample_dates_per_ticker
from fetch_news import fetch_headlines, fetch_ticker_news
from generate_labels import generate_bcp_label
from validate_and_split import validate_and_split_data
from quant_engines import compute_all_quant_engines
from qarc_evidence_ledger import build_evidence_ledger
from qarc_provenance import build_provenance_ledger
from qarc_claim_verifier import ClaimVerifier
from qarc_model_client import QArcModelClient, SYSTEM_PROMPT
from qarc_pipeline import build_regime_locked_prompt
from qarc_walk_forward_backtest import adjust_corporate_actions, compute_rolling_hurst
from qarc_angel_client import QARCAngelOneClient
from qarc_portfolio_advisor import (
    compute_price_forecast,
    rank_stock_recommendations,
    generate_institutional_portfolio,
)
from qarc_vector_memory import (
    build_8d_state_vector,
    search_historical_twins,
    retrieve_catalyst_rag,
    upsert_catalysts_to_neon,
)

DEFAULT_WATCHLIST_TICKERS: List[str] = [
    "RELIANCE",
    "TCS",
    "HDFCBANK",
    "INFY",
    "ICICIBANK",
    "SBIN",
    "LT",
    "SUNPHARMA",
]

_SHARED_ANGEL_CLIENT = None
_RUNTIME_LLM_LOCK = threading.Lock()
_RUNTIME_LLM_ENDPOINT: str = os.getenv("QARC_MODEL_ENDPOINT", "http://localhost:8000/v1").strip()


def get_runtime_llm_endpoint() -> str:
    with _RUNTIME_LLM_LOCK:
        return _RUNTIME_LLM_ENDPOINT


def set_runtime_llm_endpoint(
    endpoint_url: str,
    admin_secret: Optional[str] = None,
) -> Dict[str, Any]:
    expected_secret = os.getenv("QARC_ADMIN_SECRET", "").strip()
    if expected_secret and (admin_secret or "").strip() != expected_secret:
        raise PermissionError("Unauthorized: invalid X-QARC-Admin-Secret")

    cleaned = str(endpoint_url or "").strip()
    if not cleaned or not (cleaned.startswith("http://") or cleaned.startswith("https://")):
        raise ValueError("Invalid endpoint_url: must start with http:// or https://")

    global _RUNTIME_LLM_ENDPOINT
    with _RUNTIME_LLM_LOCK:
        _RUNTIME_LLM_ENDPOINT = cleaned
        os.environ["QARC_MODEL_ENDPOINT"] = cleaned
    return {"status": "updated", "endpoint_url": cleaned}


def _get_angel_client() -> QARCAngelOneClient:
    global _SHARED_ANGEL_CLIENT
    if _SHARED_ANGEL_CLIENT is None:
        _SHARED_ANGEL_CLIENT = QARCAngelOneClient()
    return _SHARED_ANGEL_CLIENT

NSE_TICKERS = {
    # Banking
    'HDFCBANK': 'Nifty Bank', 'ICICIBANK': 'Nifty Bank', 'SBIN': 'Nifty Bank', 
    'AXISBANK': 'Nifty Bank', 'KOTAKBANK': 'Nifty Bank', 'INDUSINDBK': 'Nifty Bank',
    'BANKBARODA': 'Nifty Bank', 'PNB': 'Nifty Bank',
    # IT
    'TCS': 'Nifty IT', 'INFY': 'Nifty IT', 'HCLTECH': 'Nifty IT', 
    'WIPRO': 'Nifty IT', 'TECHM': 'Nifty IT', 'LTIM': 'Nifty IT', 'PERSISTENT': 'Nifty IT',
    # Pharma & Healthcare
    'SUNPHARMA': 'Nifty Pharma', 'CIPLA': 'Nifty Pharma', 'DRREDDY': 'Nifty Pharma', 
    'DIVISLAB': 'Nifty Pharma', 'APOLLOHOSP': 'Nifty Pharma', 'LUPIN': 'Nifty Pharma', 'TORNTPHARM': 'Nifty Pharma',
    # Auto
    'MARUTI': 'Nifty Auto', 'TATAMOTORS': 'Nifty Auto', 'M&M': 'Nifty Auto', 
    'BAJAJ-AUTO': 'Nifty Auto', 'EICHERMOT': 'Nifty Auto', 'HEROMOTOCO': 'Nifty Auto', 'TVSMOTOR': 'Nifty Auto',
    # FMCG & Consumption
    'ITC': 'Nifty FMCG', 'HINDUNILVR': 'Nifty FMCG', 'NESTLEIND': 'Nifty FMCG', 
    'BRITANNIA': 'Nifty FMCG', 'TATACONSUM': 'Nifty FMCG', 'DABUR': 'Nifty FMCG', 'MARICO': 'Nifty FMCG',
    # Energy & Power
    'RELIANCE': 'Nifty Energy', 'ONGC': 'Nifty Energy', 'NTPC': 'Nifty Energy', 
    'POWERGRID': 'Nifty Energy', 'COALINDIA': 'Nifty Energy', 'BPCL': 'Nifty Energy', 'IOC': 'Nifty Energy',
    # Metals & Mining
    'TATASTEEL': 'Nifty Metal', 'HINDALCO': 'Nifty Metal', 'JSWSTEEL': 'Nifty Metal', 
    'VEDL': 'Nifty Metal', 'ADANIENT': 'Nifty Metal', 'JINDALSTEL': 'Nifty Metal',
    # Financial Services
    'BAJFINANCE': 'Nifty Financial Services', 'BAJAJFINSV': 'Nifty Financial Services', 
    'SBILIFE': 'Nifty Financial Services', 'HDFCLIFE': 'Nifty Financial Services', 'CHOLAFIN': 'Nifty Financial Services',
    # Infrastructure, Industrials & Realty
    'LT': 'Nifty Infra', 'ADANIPORTS': 'Nifty Infra', 'SIEMENS': 'Nifty Infra', 
    'BEL': 'Nifty Infra', 'HAL': 'Nifty Infra', 'DLF': 'Nifty Realty'
}

def generate_dataset(sampled_df, data_dir, output_filename="qarc_bcp_dataset_v2_raw.csv", max_workers=6):
    log_file = os.path.join(data_dir, "skipped_rows.log")
    with open(log_file, "a") as f: # Append instead of overwrite for resumes
        f.write("\nSkipped Rows Log (Resumed)\n================\n")
    
    checkpoint_file = os.path.join(data_dir, output_filename)
    completed_pairs = set()
    
    if os.path.exists(checkpoint_file):
        existing_df = pd.read_csv(checkpoint_file)
        # Create a set of tuples (ticker, date_string) to check against
        if not existing_df.empty:
            completed_pairs = set(zip(existing_df['ticker'], existing_df['date'].astype(str)))
        print(f"Loaded {len(completed_pairs)} previously completed rows from checkpoint.")
    
    # Filter pending rows beforehand
    pending_rows = []
    for _, row in sampled_df.iterrows():
        ticker = row['ticker']
        date_str = pd.to_datetime(row['date']).strftime('%Y-%m-%d')
        if (ticker, date_str) not in completed_pairs:
            pending_rows.append(row)
            
    print(f"Remaining rows to process: {len(pending_rows)} (using {max_workers} concurrent workers)")
    if not pending_rows:
        if os.path.exists(checkpoint_file):
            return pd.read_csv(checkpoint_file)
        return pd.DataFrame()
        
    file_lock = threading.Lock()
    final_cols = [
        'ticker', 'date', 'price_change_pct', 'volume', 'volume_vs_30d_avg', 
        'delivery_pct', 'bulk_block_deals', 'hmm_regime', 'rsi_14', 'macd', 'macd_signal', 
        'atr_14', 'bollinger_position', 'obv', 'obv_trend', 'vwap_deviation_pct', 
        'volume_zscore', 'nifty_change_pct', 'beta_vs_nifty', 
        'sector_relative_performance_pct', 'headline', 'output'
    ]

    def process_single_row(row):
        ticker = row['ticker']
        date_str = pd.to_datetime(row['date']).strftime('%Y-%m-%d')
        
        if pd.isna(row['close']):
            with file_lock:
                with open(log_file, "a") as f:
                    f.write(f"Skipped {ticker} {date_str}: Missing base price data\n")
            return None
            
        headline = fetch_headlines(ticker, row['date'])
        row_copy = row.copy()
        row_copy['headline'] = headline
        if pd.isna(row_copy.get('bulk_block_deals')) or not row_copy.get('bulk_block_deals'):
            row_copy['bulk_block_deals'] = "none"
        
        label = generate_bcp_label(row_copy)
        if not label:
            with file_lock:
                with open(log_file, "a") as f:
                    f.write(f"Skipped {ticker} {date_str}: LLM generation failed\n")
            return None
            
        row_copy['output'] = label
        row_df = pd.DataFrame([row_copy[final_cols]])
        
        with file_lock:
            header = not os.path.exists(checkpoint_file)
            row_df.to_csv(checkpoint_file, mode='a', header=header, index=False)
            
        return True

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_row, r): r for r in pending_rows}
        for future in tqdm(concurrent.futures.as_completed(futures), total=len(pending_rows), desc="Generating BCP Labels"):
            try:
                future.result()
            except Exception as e:
                print(f"Worker exception: {e}")
                
    if not os.path.exists(checkpoint_file):
        print("Fatal: No rows successfully generated labels.")
        return pd.DataFrame()
        
    final_df = pd.read_csv(checkpoint_file)
    return final_df

def main():
    parser = argparse.ArgumentParser(description="BCP Data Pipeline")
    parser.add_argument('--dry-run', action='store_true', help="Run in dry run mode")
    parser.add_argument('--workers', type=int, default=6, help="Number of concurrent workers for labeling")
    args = parser.parse_args()
    
    if args.dry_run:
        print("--- RUNNING IN DRY RUN MODE ---")
        tickers_to_process = ['RELIANCE', 'TCS']
        lookback_days = 60
        samples_per_ticker = 5
    else:
        print("--- RUNNING FULL INDUSTRY-STANDARD PIPELINE (10,000+ ROWS) ---")
        tickers_to_process = list(NSE_TICKERS.keys())
        lookback_days = 380 
        samples_per_ticker = 200 
        
    print(f"Step 1: Fetching historical bhavcopy for {len(tickers_to_process)} tickers ({lookback_days} lookback days)...")
    raw_df = build_historical_dataset(tickers_to_process, lookback_days=lookback_days)
    
    if raw_df.empty:
        print("Fatal: Failed to fetch any historical data.")
        return
        
    print("Step 2: Fetching & integrating historical NSE Bulk and Block Deals...")
    min_date = pd.to_datetime(raw_df['date']).min()
    max_date = pd.to_datetime(raw_df['date']).max()
    deals_df = fetch_historical_bulk_block_deals(min_date, max_date)
    if not deals_df.empty:
        deals_df['date'] = pd.to_datetime(deals_df['date'])
        raw_df['date'] = pd.to_datetime(raw_df['date'])
        raw_df = pd.merge(raw_df, deals_df, on=['ticker', 'date'], how='left')
        raw_df['bulk_block_deals'] = raw_df['bulk_block_deals'].fillna('none')
    else:
        raw_df['bulk_block_deals'] = 'none'

    print("Step 3: Computing technical indicators, HMM regimes & sector contexts...")
    processed_df = compute_all_indicators(raw_df, NSE_TICKERS)
    
    print(f"Sampling up to {samples_per_ticker} dates per ticker for 10,000+ row target...")
    sampled_df = sample_dates_per_ticker(processed_df, samples_per_ticker)
    
    if sampled_df.empty:
        print("Fatal: No valid dates remained after sampling.")
        return
        
    print(f"Total eligible dataset candidate rows: {len(sampled_df)}")
    print("Step 4 & 5: Fetching News and Generating BCP Labels with NVIDIA NIM...")
    output_filename = "dry_run_dataset.csv" if args.dry_run else "qarc_bcp_dataset_v2_raw.csv"
    output_dir = os.path.join(DATA_DIR, "dry_run") if args.dry_run else DATA_DIR
    os.makedirs(output_dir, exist_ok=True)
    
    final_df = generate_dataset(sampled_df, output_dir, output_filename=output_filename, max_workers=args.workers)
    
    print("Step 6, 7 & 8: Validating dataset and performing Chronological Split...")
    if not final_df.empty:
        total_after_gen, flagged_count, valid_count = validate_and_split_data(final_df, output_dir)
        
        print("\n========================================")
        print("Step 9: Final Integrity Report (Industry Standard)")
        print("========================================")
        print(f"Total rows attempted for generation: {len(sampled_df)}")
        print(f"Total rows skipped (missing data/LLM fail): {len(sampled_df) - total_after_gen}")
        print(f"Total rows generated: {total_after_gen}")
        print(f"Total rows flagged in QA: {flagged_count} (See flagged_for_review.csv)")
        print(f"Total valid rows in final dataset: {valid_count} (Chronologically split into train/val/test)")
        print("========================================")
    else:
        print("Generation failed to produce the final dataset.")


def _load_adjusted_bhavcopy(bhavcopy_path: str = "data/raw_bhavcopy_data.csv") -> pd.DataFrame:
    if not os.path.exists(bhavcopy_path):
        raise FileNotFoundError(f"Bhavcopy dataset not found at {bhavcopy_path}")
    df = pd.read_csv(bhavcopy_path)
    df["date"] = pd.to_datetime(df["date"])
    return adjust_corporate_actions(df)


def _prepare_ticker_market_snapshot(
    stock_df: pd.DataFrame,
    ticker_clean: str,
    filings: str = "none",
    angel_client: Optional[QARCAngelOneClient] = None,
    live_l2_quote: Optional[Dict[str, Any]] = None,
    use_live_angel: bool = True,
) -> Dict[str, Any]:
    """
    Shared causal snapshot extractor for single-ticker BCP analysis and cross-sectional screening.
    """
    df_work = stock_df.sort_values("date").copy()
    if angel_client is not None:
        try:
            df_work = angel_client.append_live_candles_to_df(df_work, ticker_clean, days_back=45)
        except Exception:
            pass

    closes = df_work["close"].values
    volumes = df_work["volume"].values
    latest_bar = df_work.iloc[-1]
    prev_bar = df_work.iloc[-2]
    cur_price = float(latest_bar["close"])
    prev_close = float(prev_bar["close"])
    date_str = str(latest_bar["date"])[:10]

    quant_res = compute_all_quant_engines(ticker_clean, closes, volumes, cur_price)

    deliv_col = "DELIVERY_PCT" if "DELIVERY_PCT" in df_work.columns else "delivery_pct"
    if deliv_col in df_work.columns:
        deliv_pct = float(latest_bar.get(deliv_col, 40.0))
        deliv_mean_30 = float(df_work[deliv_col].tail(30).mean())
        deliv_std_30 = float(df_work[deliv_col].tail(30).std())
    else:
        deliv_pct = 40.0
        deliv_mean_30 = 40.0
        deliv_std_30 = 10.0
    deliv_zscore = (deliv_pct - deliv_mean_30) / max(deliv_std_30, 1.0)

    vol_mean_30 = float(df_work["volume"].tail(30).mean())
    vol_std_30 = float(df_work["volume"].tail(30).std())
    vol_zscore = (float(latest_bar["volume"]) - vol_mean_30) / max(vol_std_30, 1.0)
    vol_vs_avg = float(latest_bar["volume"]) / max(vol_mean_30, 1.0)

    tr = np.maximum(
        df_work["high"].values - df_work["low"].values,
        np.abs(df_work["high"].values - np.roll(closes, 1)),
    )
    atr_14 = float(pd.Series(tr).tail(14).mean())
    diff = pd.Series(closes).diff()
    gain = (diff.where(diff > 0, 0)).tail(14).mean()
    loss = (-diff.where(diff < 0, 0)).tail(14).mean()
    rsi_14 = float(100 - (100 / (1 + gain / max(loss, 1e-4))))
    vwap_approx = (df_work["close"].tail(10) * df_work["volume"].tail(10)).sum() / max(
        df_work["volume"].tail(10).sum(), 1.0
    )
    vwap_dev = ((cur_price - vwap_approx) / max(vwap_approx, 1e-6)) * 100.0

    kalman_res = quant_res["kalman"]
    k_vel = float(kalman_res.get("trend_velocity_pct_per_day", 0.0))
    vel_series = kalman_res.get("velocity_series")
    filtered_p = max(float(kalman_res.get("filtered_price", cur_price) or cur_price), 1e-4)
    if vel_series is not None and len(vel_series) >= 2:
        k_acc = float(((vel_series[-1] - vel_series[-2]) / filtered_p) * 100.0)
    else:
        k_acc = 0.0

    hurst = compute_rolling_hurst(closes, window=60)
    garch_vol = float(quant_res["garch"].get("forecast_daily_vol_pct", 1.5))
    hmm_regime = str(quant_res["hmm"].get("current_regime", "Neutral"))

    ret_1d_pct = ((cur_price - prev_close) / max(prev_close, 1e-6)) * 100.0
    has_factor_1 = bool(rsi_14 > 60.0 and k_vel < 0.0 and deliv_zscore < 0.0)
    has_factor_2 = bool(ret_1d_pct > 1.0 and deliv_pct < 40.0 and k_vel < -0.1)
    has_filing = str(filings).strip().lower() not in ("", "none", "nan") and len(str(filings).strip()) > 4
    has_factor_4b = bool(has_filing and ret_1d_pct > 1.0 and deliv_pct < 40.0)

    resolved_l2 = live_l2_quote
    if resolved_l2 is None and use_live_angel and angel_client is not None:
        try:
            resolved_l2 = angel_client.fetch_live_l2_depth_e09(ticker_clean)
        except Exception as exc:
            resolved_l2 = {"available": False, "source": "EXCEPTION", "reason": str(exc)}

    price_forecast = compute_price_forecast(
        current_price=cur_price,
        kalman_vel=k_vel,
        kalman_acc=k_acc,
        garch_daily_vol_pct=garch_vol,
        hurst=hurst,
        hmm_state=hmm_regime,
        has_factor_1=has_factor_1,
        has_factor_2=has_factor_2,
        has_factor_4b=has_factor_4b,
        live_l2=resolved_l2,
    )

    market_data = {
        "ticker": ticker_clean,
        "date": date_str,
        "price": cur_price,
        "prev_close": prev_close,
        "volume": int(latest_bar["volume"]),
        "volume_vs_30d_avg": round(vol_vs_avg, 2),
        "volume_zscore": round(vol_zscore, 2),
        "delivery_pct": round(deliv_pct, 1),
        "vwap_deviation_pct": round(vwap_dev, 2),
        "rsi_14": round(rsi_14, 2),
        "atr_14": round(atr_14, 2),
        "amihud_illiq": round(
            abs(cur_price - prev_close) / (cur_price * max(float(latest_bar["volume"]), 1.0)) * 1e6,
            4,
        ),
        "hmm_regime": hmm_regime,
        "bulk_block_deals": filings,
        "garch": quant_res["garch"],
        "kalman": quant_res["kalman"],
        "hmm": quant_res["hmm"],
        "monte_carlo": quant_res["monte_carlo"],
        "price_forecast": price_forecast,
    }

    screener_payload = {
        "ticker": ticker_clean,
        "current_price": cur_price,
        "hmm_state": hmm_regime,
        "kalman_vel": k_vel,
        "kalman_acc": k_acc,
        "garch_daily_vol_pct": garch_vol,
        "hurst": hurst,
        "cvar_95_pct": float(quant_res["monte_carlo"].get("cvar_95_expected_shortfall_pct", -4.5)),
        "var_95_pct": float(quant_res["monte_carlo"].get("var_95_pct", -3.0)),
        "has_factor_1": has_factor_1,
        "has_factor_2": has_factor_2,
        "has_factor_4b": has_factor_4b,
        "unresolved_contradictions": 0,
        "live_l2": resolved_l2,
        "price_forecast": price_forecast,
    }

    state_vector = build_8d_state_vector(
        ret_1d=ret_1d_pct,
        kalman_vel_norm=k_vel,
        kalman_acc_norm=k_acc,
        garch_or_rolling_vol=garch_vol,
        rolling_hurst_60=hurst,
        deliv_z=deliv_zscore,
        rsi_14=rsi_14,
        regime_code=hmm_regime,
    )

    return {
        "market_data": market_data,
        "quant_res": quant_res,
        "price_forecast": price_forecast,
        "live_l2_quote": resolved_l2,
        "date_str": date_str,
        "state_vector": state_vector,
        "screener_payload": screener_payload,
    }


def analyze_bcp_endpoint(
    ticker: str,
    filings: str = "none",
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    max_retries: int = 0,
    use_live_angel: bool = True,
    llm_endpoint_url: Optional[str] = None,
) -> dict:
    """
    Production neuro-symbolic BCP analyzer backing POST /api/bcp_analyze.
    Returns E01-E15 Evidence Ledger, 4-engine quantitative telemetry, E14 forecast,
    E15 historical pgvector twins, raw vs. verified BCP profile, and guardrail badges.
    """
    t_start = time.perf_counter()
    ticker_clean = ticker.strip().upper()
    df = _load_adjusted_bhavcopy(bhavcopy_path)
    stock_df = df[df["ticker"] == ticker_clean].sort_values("date").copy()
    if len(stock_df) < 30:
        raise ValueError(f"Insufficient historical bars for {ticker_clean} ({len(stock_df)} bars)")

    angel_client = _get_angel_client() if use_live_angel else None
    snapshot = _prepare_ticker_market_snapshot(
        stock_df=stock_df,
        ticker_clean=ticker_clean,
        filings=filings,
        angel_client=angel_client,
        use_live_angel=use_live_angel,
    )
    market_data = snapshot["market_data"]
    quant_res = snapshot["quant_res"]
    price_forecast = snapshot["price_forecast"]
    live_l2_quote = snapshot["live_l2_quote"]
    date_str = snapshot["date_str"]

    vector_twins: Dict[str, Any] = {"available": False, "twins": [], "source": "OFFLINE"}
    try:
        vector_twins = search_historical_twins(
            query_vec=snapshot["state_vector"],
            ticker=ticker_clean,
            as_of_date=date_str,
            k=5,
        )
        market_data["vector_twins"] = vector_twins
    except Exception as exc:
        vector_twins = {"available": False, "twins": [], "source": "OFFLINE", "reason": str(exc)}

    catalyst_rag: Dict[str, Any] = {"available": False, "docs": [], "source": "OFFLINE"}
    try:
        catalyst_rag = retrieve_catalyst_rag(
            ticker=ticker_clean,
            as_of_date=date_str,
            k=3,
        )
        market_data["catalyst_rag"] = catalyst_rag
    except Exception as exc:
        catalyst_rag = {"available": False, "docs": [], "source": "OFFLINE", "reason": str(exc)}

    ledger = build_evidence_ledger(
        market_data,
        live_l2_quote=live_l2_quote,
        catalyst_rag=catalyst_rag,
    )
    prov_ledger = build_provenance_ledger(market_data)

    resolved_endpoint = (llm_endpoint_url or "").strip() or get_runtime_llm_endpoint()
    client = QArcModelClient(endpoint_url=resolved_endpoint)
    locked_prompt = build_regime_locked_prompt(ledger, SYSTEM_PROMPT)
    raw_bcp = client.generate_bcp_profile(ledger.to_prompt_text(), system_prompt_override=locked_prompt)

    verifier = ClaimVerifier(ledger)
    raw_verified = verifier.verify(raw_bcp)
    raw_contradictions = raw_verified.contradictions_count
    guardrail_intervened = False
    overridden_keys = set()

    final_bcp = dict(raw_bcp)
    verified_bcp = raw_verified
    if raw_contradictions > 0:
        guardrail_intervened = True
        overridden_keys = {k for k, vf in raw_verified.fields.items() if vf.status == "CONTRADICTION"}
        if max_retries > 0:
            notes = [f"{k}: {raw_verified.fields[k].audit_notes}" for k in overridden_keys]
            final_bcp = client.repair_contradicted_fields(
                ledger.to_prompt_text(),
                raw_bcp,
                list(overridden_keys),
                notes,
                system_prompt_override=locked_prompt,
            )
            verified_bcp = verifier.verify(final_bcp)
        if verified_bcp.contradictions_count > 0:
            final_bcp = verifier.apply_deterministic_fallback_override(final_bcp, verified_bcp)
            verified_bcp = verifier.verify(final_bcp)

    field_badges = {}
    for k, vf in verified_bcp.fields.items():
        if k in overridden_keys and vf.status == "SUPPORTED":
            badge = "OVERRIDDEN"
        elif vf.status in ("UNVERIFIABLE", "DOWNGRADED_TO_UNKNOWN"):
            badge = "ABSTAINED"
        elif vf.status == "CONTRADICTION":
            badge = "REJECTED"
        else:
            badge = "SUPPORTED"
        field_badges[k] = {
            "badge": badge,
            "status": vf.status,
            "raw": raw_bcp.get(k, ""),
            "verified": vf.verified_value,
            "cites": vf.cited_evidence,
            "notes": vf.audit_notes,
        }

    try:
        from qarc_db import log_guardrail_intervention

        log_guardrail_intervention({
            "ticker": ticker_clean,
            "raw_contradictions": raw_contradictions,
            "post_contradictions": verified_bcp.contradictions_count,
            "coverage_pct": verified_bcp.evidence_coverage_pct,
            "e09_live_active": bool(live_l2_quote and live_l2_quote.get("available")),
            "status": verified_bcp.verification_status,
        })
    except Exception:
        pass

    return {
        "ticker": ticker_clean,
        "date": date_str,
        "latency_ms": round((time.perf_counter() - t_start) * 1000.0, 2),
        "evidence_ledger": {
            code: {
                "category": item.category,
                "metric": item.metric,
                "description": item.description,
                "is_limitation": item.is_limitation,
            }
            for code, item in sorted(ledger.items.items())
        },
        "provenance": prov_ledger.to_dict() if hasattr(prov_ledger, "to_dict") else str(prov_ledger),
        "quant_anchors": quant_res,
        "price_forecast": price_forecast,
        "vector_twins": vector_twins,
        "catalyst_rag": catalyst_rag,
        "live_l2_depth": live_l2_quote if (live_l2_quote and live_l2_quote.get("available")) else {"available": False},
        "raw_bcp_profile": raw_bcp,
        "verified_bcp_profile": final_bcp,
        "guardrail_telemetry": {
            "guardrail_intervened": guardrail_intervened,
            "raw_contradictions": raw_contradictions,
            "post_guardrail_contradictions": verified_bcp.contradictions_count,
            "unsupported_claims": verified_bcp.unsupported_claims_count,
            "evidence_coverage_pct": verified_bcp.evidence_coverage_pct,
            "verification_status": verified_bcp.verification_status,
            "field_badges": field_badges,
        },
    }


def get_recommendations_endpoint(
    tickers: Optional[List[str]] = None,
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    use_live_angel: bool = False,
) -> Dict[str, Any]:
    """
    Cross-sectional screener endpoint backing GET /api/recommendations.
    Runs quantitative + E14 forecast snapshots across watchlist tickers and
    ranks them with hard quarantine on Factor 4B / Markdown / Contradictions.
    """
    t_start = time.perf_counter()
    df = _load_adjusted_bhavcopy(bhavcopy_path)
    target_tickers = [t.strip().upper() for t in (tickers or DEFAULT_WATCHLIST_TICKERS) if t.strip()]

    angel_client = _get_angel_client() if use_live_angel else None
    batch_l2: Dict[str, Any] = {}
    if use_live_angel and angel_client is not None and target_tickers:
        try:
            batch_l2 = angel_client.fetch_batch_live_l2_depth_e09(target_tickers)
        except Exception:
            batch_l2 = {}

    payloads: List[Dict[str, Any]] = []
    latest_dates: List[str] = []
    for sym in target_tickers:
        stock_df = df[df["ticker"] == sym].sort_values("date").copy()
        if len(stock_df) < 30:
            continue
        snapshot = _prepare_ticker_market_snapshot(
            stock_df=stock_df,
            ticker_clean=sym,
            filings="none",
            angel_client=angel_client if use_live_angel else None,
            live_l2_quote=batch_l2.get(sym, {"available": False}) if not use_live_angel else batch_l2.get(sym),
            use_live_angel=use_live_angel,
        )
        payloads.append(snapshot["screener_payload"])
        latest_dates.append(snapshot["date_str"])

    recommendations = rank_stock_recommendations(payloads)
    return {
        "as_of_date": max(latest_dates) if latest_dates else "",
        "latency_ms": round((time.perf_counter() - t_start) * 1000.0, 2),
        "count": len(recommendations),
        "recommendations": recommendations,
    }


def generate_portfolio_endpoint(
    capital_inr: float = 500000.0,
    risk_profile: str = "BALANCED_CORE",
    tickers: Optional[List[str]] = None,
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    use_live_angel: bool = False,
    persist_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Institutional portfolio advisor endpoint backing POST /api/portfolio/generate.
    """
    screener = get_recommendations_endpoint(
        tickers=tickers,
        bhavcopy_path=bhavcopy_path,
        use_live_angel=use_live_angel,
    )
    portfolio = generate_institutional_portfolio(
        screener["recommendations"],
        capital_inr=capital_inr,
        risk_profile=risk_profile,
        persist_to_db=persist_to_db,
    )
    portfolio["as_of_date"] = screener["as_of_date"]
    return portfolio


def get_trades_endpoint(limit: int = 20) -> Dict[str, Any]:
    """
    Recent executed/rejected trade ledger endpoint backing GET /api/trades.
    """
    from qarc_db import get_recent_trades

    rows = get_recent_trades(limit=limit)
    return {"count": len(rows), "trades": rows}


def get_ticker_news_endpoint(
    ticker: str,
    days_back: int = 3,
    limit: int = 5,
    refresh_e08: bool = True,
) -> Dict[str, Any]:
    """
    Live news endpoint backing GET /api/news/{ticker}. Optionally embeds & upserts
    fresh headlines into Neon `nse_catalyst_rag` when GEMINI_API_KEY + DATABASE_URL are set.
    """
    sym = ticker.strip().upper().replace(".NS", "")
    if not sym:
        raise ValueError("ticker must be non-empty")

    articles = fetch_ticker_news(sym, days_back=days_back, limit=limit)
    e08_refreshed = False
    e08_upserted = 0

    has_gemini = bool(os.getenv("GEMINI_API_KEY", "").strip())
    has_db = bool((os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip())
    if refresh_e08 and articles and has_gemini and has_db:
        try:
            docs = []
            for art in articles:
                hl = str(art.get("title", "")).strip()
                pub = str(art.get("published_at", ""))[:10]
                if len(pub) != 10:
                    pub = pd.Timestamp.utcnow().strftime("%Y-%m-%d")
                if hl:
                    docs.append(
                        {
                            "symbol": sym,
                            "filing_date": pub,
                            "headline": hl,
                            "category": "NEWS_HEADLINE",
                            "source": f"fetch_news:{art.get('source', 'live_news')}",
                        }
                    )
            if docs:
                stats = upsert_catalysts_to_neon(docs=docs)
                e08_upserted = int(stats.get("rows_upserted", 0))
                e08_refreshed = e08_upserted > 0
        except Exception:
            e08_refreshed = False

    return {
        "ticker": sym,
        "count": len(articles),
        "articles": articles,
        "e08_refreshed": e08_refreshed,
        "e08_upserted": e08_upserted,
    }


def execute_trade_endpoint(
    ticker: str,
    side: str = "BUY",
    quantity: int = 1,
    price: float = 0.0,
    order_type: str = "LIMIT",
    product_type: str = "DELIVERY",
    mode: str = "PAPER",
    live_ltp: float = 0.0,
    has_factor_4b: bool = False,
    unresolved_contradictions: int = 0,
    max_notional_inr: float = 25000.0,
    hmm_state: str = "",
    verdict: str = "",
) -> dict:
    """
    Safety-switched execution endpoint backing POST /api/execute_trade.
    Routes orders through 4 institutional pre-trade risk gates and persists to Neon Postgres.
    """
    return _get_angel_client().validate_and_execute_order(
        symbol=ticker,
        action=side,
        quantity=quantity,
        limit_price=price,
        mode=mode,
        live_ltp=live_ltp,
        has_factor_4b=has_factor_4b,
        unresolved_contradictions=unresolved_contradictions,
        max_notional_inr=max_notional_inr,
        hmm_state=hmm_state,
        verdict=verdict,
    )


try:
    from fastapi import FastAPI, Header, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    app = FastAPI(title="Q-ARC Neuro-Symbolic BCP API", version="2.0.0")
    _cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
    _cors_origins = (
        ["*"]
        if not _cors_origins_raw or _cors_origins_raw == "*"
        else [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class BCPAnalyzeRequest(BaseModel):
        ticker: str
        filings: str = "none"
        max_retries: int = 0
        use_live_angel: bool = True
        llm_endpoint_url: Optional[str] = None

    class LLMEndpointConfigRequest(BaseModel):
        endpoint_url: str

    class PortfolioGenerateRequest(BaseModel):
        capital_inr: float = 500000.0
        risk_profile: str = "BALANCED_CORE"
        tickers: Optional[List[str]] = None
        use_live_angel: bool = False
        persist_to_db: bool = True

    class TradeExecuteRequest(BaseModel):
        ticker: str
        side: str = "BUY"
        quantity: int = 1
        price: float = 0.0
        order_type: str = "LIMIT"
        product_type: str = "DELIVERY"
        mode: str = "PAPER"
        live_ltp: float = 0.0
        has_factor_4b: bool = False
        unresolved_contradictions: int = 0
        max_notional_inr: float = 25000.0
        hmm_state: str = ""
        verdict: str = ""

    @app.get("/api/health")
    def api_health():
        return {"status": "ok", "engine": "Q-ARC Neuro-Symbolic BCP v2"}

    @app.post("/api/config/llm_endpoint")
    def api_config_llm_endpoint(
        req: LLMEndpointConfigRequest,
        x_qarc_admin_secret: Optional[str] = Header(default=None, alias="X-QARC-Admin-Secret"),
    ):
        try:
            return set_runtime_llm_endpoint(
                req.endpoint_url,
                admin_secret=x_qarc_admin_secret,
            )
        except PermissionError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post("/api/bcp_analyze")
    def api_bcp_analyze(req: BCPAnalyzeRequest):
        try:
            return analyze_bcp_endpoint(
                req.ticker,
                filings=req.filings,
                max_retries=req.max_retries,
                use_live_angel=req.use_live_angel,
                llm_endpoint_url=req.llm_endpoint_url,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/api/news/{ticker}")
    def api_ticker_news(
        ticker: str,
        days_back: int = 3,
        limit: int = 5,
        refresh_e08: bool = True,
    ):
        try:
            return get_ticker_news_endpoint(
                ticker=ticker,
                days_back=days_back,
                limit=limit,
                refresh_e08=refresh_e08,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/api/recommendations")
    def api_recommendations(tickers: Optional[str] = None, use_live_angel: bool = False):
        try:
            ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()] if tickers else None
            return get_recommendations_endpoint(tickers=ticker_list, use_live_angel=use_live_angel)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post("/api/portfolio/generate")
    def api_generate_portfolio(req: PortfolioGenerateRequest):
        try:
            return generate_portfolio_endpoint(
                capital_inr=req.capital_inr,
                risk_profile=req.risk_profile,
                tickers=req.tickers,
                use_live_angel=req.use_live_angel,
                persist_to_db=req.persist_to_db,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

    @app.get("/api/trades")
    def api_trades(limit: int = 20):
        try:
            return get_trades_endpoint(limit=limit)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

    @app.post("/api/execute_trade")
    def api_execute_trade(req: TradeExecuteRequest):
        return execute_trade_endpoint(
            ticker=req.ticker,
            side=req.side,
            quantity=req.quantity,
            price=req.price,
            order_type=req.order_type,
            product_type=req.product_type,
            mode=req.mode,
            live_ltp=req.live_ltp,
            has_factor_4b=req.has_factor_4b,
            unresolved_contradictions=req.unresolved_contradictions,
            max_notional_inr=req.max_notional_inr,
            hmm_state=req.hmm_state,
            verdict=req.verdict,
        )
except ImportError:
    app = None


if __name__ == "__main__":
    main()
