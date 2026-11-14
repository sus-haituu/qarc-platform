"""
Q-ARC Production Pipeline Runner
================================
Integrates:
1. Real Historical / Live Data Ingestion
2. Four Quantitative Mathematical Engines:
   - GARCH(1,1) Volatility Forecasting (replaces naive rolling Z-score hazard)
   - Kalman Filter Noise Separator (estimates true latent price & trend velocity)
   - Hidden Markov Model (HMM) 4-State Regime Classifier (Wyckoff phase anchor)
   - Live Monte Carlo 10,000-Path Risk Simulator (VaR95, CVaR95, barrier stop/target)
3. Quantitative Evidence Ledger Generation (E01 - E13)
4. Nemotron 70B BCP Profile Ingestion
5. Independent Claim Verifier & Consensus Card Output
"""
import sys
import io
import os
from typing import Any
import pandas as pd
import numpy as np

# Ensure UTF-8 output on Windows consoles
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from qarc_evidence_ledger import build_evidence_ledger, EvidenceLedger
from qarc_claim_verifier import ClaimVerifier
from quant_engines import compute_all_quant_engines
from qarc_model_client import QArcModelClient, SYSTEM_PROMPT
from qarc_provenance import build_provenance_ledger
from qarc_walk_forward_backtest import adjust_corporate_actions


def build_regime_locked_prompt(evidence_ledger: Any, base_prompt: str = SYSTEM_PROMPT) -> str:
    """
    Zero-Retraining Regime Lock:
    Inspects deterministic E11 (Kalman Velocity/Signal) and E12 (HMM Regime) outputs
    and injects a hard mathematical constraint into the system prompt when bearish.
    """
    if isinstance(evidence_ledger, EvidenceLedger):
        e11_val = evidence_ledger.items.get("E11").value if "E11" in evidence_ledger.items else {}
        e12_val = evidence_ledger.items.get("E12").value if "E12" in evidence_ledger.items else {}
        e11_kalman = str(e11_val.get("trend_signal", "")) if isinstance(e11_val, dict) else str(e11_val)
        e12_hmm = str(e12_val.get("current_regime", "")) if isinstance(e12_val, dict) else str(e12_val)
    elif isinstance(evidence_ledger, dict):
        e11_kalman = str(evidence_ledger.get("E11_kalman_regime", ""))
        e12_hmm = str(evidence_ledger.get("E12_hmm_state", ""))
    else:
        return base_prompt

    is_bearish_math = (
        "DOWNTREND" in e11_kalman.upper()
        or e12_hmm.upper() in ["DISTRIBUTION", "MARKDOWN"]
    )

    if is_bearish_math:
        override_block = (
            "\n\n[HARD MATHEMATICAL CONSTRAINT - OVERRIDE PRIOR]:\n"
            f"Deterministic engines confirm {e11_kalman} and {e12_hmm} regime.\n"
            "- FORBIDDEN OUTPUTS: You are strictly prohibited from outputting 'Bullish Demand Absorption', "
            "'Accumulation', or 'Scale Limit Orders at VWAP'.\n"
            "- REQUIRED ALIGNMENT: `dominant_intent` MUST reflect supply distribution, institutional liquidation, "
            "or defensive step-aside. `counter_strategy` MUST specify capital preservation, short/hedge, or wait-for-base.\n"
        )
        return base_prompt + override_block
    return base_prompt

def run_pipeline_for_ticker(
    ticker: str,
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    filings: str = "none",
    max_retries: int = 0,
    use_live_angel: bool = False,
):
    print("=" * 72)
    print(f"🛡️ Q-ARC GROUNDED PIPELINE EXECUTION: {ticker}")
    print("=" * 72)

    # 1. Load historical data & auto-adjust corporate actions
    if not os.path.exists(bhavcopy_path):
        raise FileNotFoundError(f"Bhavcopy dataset not found at {bhavcopy_path}")

    df = pd.read_csv(bhavcopy_path)
    df['date'] = pd.to_datetime(df['date'])
    df = adjust_corporate_actions(df)
    stock_df = df[df['ticker'] == ticker].sort_values('date').copy()
    if len(stock_df) < 30:
        raise ValueError(f"Insufficient historical bars for {ticker} ({len(stock_df)} bars)")

    live_l2_quote = None
    if use_live_angel:
        try:
            from qarc_angel_client import QARCAngelOneClient
            angel_client = QARCAngelOneClient()
            stock_df = angel_client.append_live_candles_to_df(stock_df, ticker, days_back=45)
            sym_col = "SYMBOL" if "SYMBOL" in stock_df.columns else ("ticker" if "ticker" in stock_df.columns else None)
            for dcol in ("DELIV_PER", "DELIVERY_PCT"):
                if dcol in stock_df.columns:
                    stock_df[dcol] = pd.to_numeric(stock_df[dcol], errors="coerce")
                    stock_df.loc[stock_df[dcol] <= 0.01, dcol] = np.nan
                    if sym_col:
                        rolling_med = stock_df.groupby(sym_col)[dcol].transform(
                            lambda s: s.rolling(20, min_periods=5).median()
                        )
                        stock_df[dcol] = stock_df[dcol].fillna(rolling_med).groupby(stock_df[sym_col]).ffill().fillna(50.0)
                    else:
                        rolling_med = stock_df[dcol].rolling(20, min_periods=5).median()
                        stock_df[dcol] = stock_df[dcol].fillna(rolling_med).ffill().fillna(50.0)
            if "DELIV_QTY" in stock_df.columns and "TOTTRDQTY" in stock_df.columns and "DELIV_PER" in stock_df.columns:
                stock_df["DELIV_QTY"] = stock_df["DELIV_QTY"].fillna(
                    stock_df["TOTTRDQTY"] * (stock_df["DELIV_PER"] / 100.0)
                )
            live_l2_quote = angel_client.fetch_live_l2_depth_e09(ticker)
        except Exception:
            live_l2_quote = None

    closes = stock_df['close'].values
    volumes = stock_df['volume'].values
    latest_bar = stock_df.iloc[-1]
    prev_bar = stock_df.iloc[-2]

    cur_price = float(latest_bar['close'])
    prev_close = float(prev_bar['close'])
    date_str = str(latest_bar['date'])

    # 2. Run the 4 Quantitative Engines Live
    print("\n[STEP 1: COMPUTING 4 QUANTITATIVE ENGINES LIVE]")
    print("  • 1. GARCH(1,1) Conditional Heteroskedasticity Volatility Forecast...")
    print("  • 2. Kalman 2D State-Space Filter (Denoising Price & Trend Velocity)...")
    print("  • 3. Hidden Markov Model (HMM) 4-State Regime Classifier...")
    print("  • 4. Monte Carlo Live Simulation (10,000 Paths Forward over 10 Days)...")

    quant_res = compute_all_quant_engines(ticker, closes, volumes, cur_price)

    # Calculate additional standard indicators for ledger
    deliv_pct = float(latest_bar.get('DELIVERY_PCT', 40.0))
    vol_mean_30 = float(stock_df['volume'].tail(30).mean())
    vol_std_30 = float(stock_df['volume'].tail(30).std())
    vol_zscore = (float(latest_bar['volume']) - vol_mean_30) / max(vol_std_30, 1.0)
    vol_vs_avg = float(latest_bar['volume']) / max(vol_mean_30, 1.0)

    # ATR(14)
    tr = np.maximum(stock_df['high'].values - stock_df['low'].values, 
                    np.abs(stock_df['high'].values - np.roll(closes, 1)))
    atr_14 = float(pd.Series(tr).tail(14).mean())

    # RSI(14)
    diff = pd.Series(closes).diff()
    gain = (diff.where(diff > 0, 0)).tail(14).mean()
    loss = (-diff.where(diff < 0, 0)).tail(14).mean()
    rs = gain / max(loss, 1e-4)
    rsi_14 = 100 - (100 / (1 + rs))

    # Rolling VWAP approx
    vwap_approx = (stock_df['close'].tail(10) * stock_df['volume'].tail(10)).sum() / stock_df['volume'].tail(10).sum()
    vwap_dev = ((cur_price - vwap_approx) / vwap_approx) * 100.0

    market_data = {
        "ticker": ticker,
        "date": date_str,
        "price": cur_price,
        "prev_close": prev_close,
        "volume": int(latest_bar['volume']),
        "volume_vs_30d_avg": round(vol_vs_avg, 2),
        "volume_zscore": round(vol_zscore, 2),
        "delivery_pct": round(deliv_pct, 1),
        "vwap_deviation_pct": round(vwap_dev, 2),
        "rsi_14": round(rsi_14, 2),
        "atr_14": round(atr_14, 2),
        "amihud_illiq": round(abs(cur_price - prev_close) / (cur_price * max(latest_bar['volume'], 1)) * 1e6, 4),
        "hmm_regime": quant_res["hmm"]["current_regime"],
        "bulk_block_deals": filings,
        "garch": quant_res["garch"],
        "kalman": quant_res["kalman"],
        "hmm": quant_res["hmm"],
        "monte_carlo": quant_res["monte_carlo"]
    }

    # 3. Build Evidence Ledger (E01 - E13) & Evidence Provenance Audit Trail
    ledger = build_evidence_ledger(market_data, live_l2_quote=live_l2_quote)
    prov_ledger = build_provenance_ledger(market_data)
    print("\n[STEP 2: GENERATED EVIDENCE LEDGER (E01 - E13)]")
    print(ledger.to_prompt_text())

    # 4. Ingest Model Prediction (Nemotron 70B LoRA with Zero-Retraining Regime Lock)
    client = QArcModelClient()
    locked_system_prompt = build_regime_locked_prompt(ledger, SYSTEM_PROMPT)
    raw_llm_output = client.generate_bcp_profile(
        ledger.to_prompt_text(),
        system_prompt_override=locked_system_prompt,
    )

    print("\n[STEP 3: NEMOTRON 70B COGNITIVE LAYER OUTPUT (PASS 1)]")
    for k, v in raw_llm_output.items():
        print(f"  • {k:<20}: {v}")

    # 5. Independent Claim Verification + Optional Reflexion Retry / <1ms Deterministic Override
    verifier = ClaimVerifier(ledger)
    verified_bcp = verifier.verify(raw_llm_output)

    if verified_bcp.contradictions_count > 0:
        current_output = raw_llm_output
        if max_retries > 0:
            contradicted_keys = [
                k for k, vf in verified_bcp.fields.items() if vf.status == "CONTRADICTION"
            ]
            contradiction_notes = [
                f"{k}: {verified_bcp.fields[k].audit_notes}" for k in contradicted_keys
            ]
            print(f"\n[STEP 3B: CLOSED-LOOP REFLEXION RETRY ON {contradicted_keys}]")
            current_output = client.repair_contradicted_fields(
                ledger.to_prompt_text(),
                raw_llm_output,
                contradicted_keys,
                contradiction_notes,
                system_prompt_override=locked_system_prompt,
            )
            verified_bcp = verifier.verify(current_output)

        if verified_bcp.contradictions_count > 0:
            print("[STEP 3B: APPLYING DETERMINISTIC NEURO-SYMBOLIC OVERRIDE (<1ms)]")
            patched_output = verifier.apply_deterministic_fallback_override(current_output, verified_bcp)
            verified_bcp = verifier.verify(patched_output)

    print("\n[STEP 4: INDEPENDENT CLAIM VERIFICATION & STATISTICAL CONSENSUS]")
    verified_bcp.print_consensus_card()

    return verified_bcp

if __name__ == "__main__":
    # Test on Real RELIANCE Bhavcopy Data
    run_pipeline_for_ticker("RELIANCE", filings="none")
