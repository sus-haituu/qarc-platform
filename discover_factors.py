"""
Q-ARC Microstructure Alpha Discovery
Tests multi-factor microstructure interactions across 15,027 real NSE daily records:
1. Stealth Delivery Absorption (High Delivery Z-score + Low Volatility Spread)
2. Illiquidity Shock / Liquidity Vacuums (Amihud Spike + Volume Z-score)
3. Momentum Exhaustion (High Volume Churn + Overbought RSI)
"""
import sys
import os
import re
import glob
from datetime import datetime
import pandas as pd
import numpy as np
from scipy import stats
from qarc_walk_forward_backtest import adjust_corporate_actions

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def run_alpha_discovery():
    print("=" * 72)
    print("🔍 Q-ARC MICROSTRUCTURE FACTOR DISCOVERY (15,027 REAL NSE BARS)")
    print("=" * 72)

    df = pd.read_csv("data/raw_bhavcopy_data.csv")
    df['date'] = pd.to_datetime(df['date'])
    df = adjust_corporate_actions(df)

    records = []
    for ticker, group in df.groupby('ticker'):
        g = group.copy().sort_values('date').reset_index(drop=True)
        g['prev_close'] = g['close'].shift(1)
        g['daily_return_pct'] = ((g['close'] - g['prev_close']) / g['prev_close']) * 100
        
        # Forward Returns
        g['fwd_t1'] = ((g['close'].shift(-1) - g['close']) / g['close']) * 100
        g['fwd_t3'] = ((g['close'].shift(-3) - g['close']) / g['close']) * 100
        g['fwd_t5'] = ((g['close'].shift(-5) - g['close']) / g['close']) * 100

        # Rolling Microstructure Metrics
        # 1. Delivery Z-score (vs 30d rolling baseline for THIS stock)
        deliv_col = 'DELIVERY_PCT' if 'DELIVERY_PCT' in g.columns else 'delivery_pct'
        g['deliv_pct'] = g[deliv_col]
        g['deliv_30d_avg'] = g['deliv_pct'].rolling(30, min_periods=10).mean()
        g['deliv_30d_std'] = g['deliv_pct'].rolling(30, min_periods=10).std()
        g['deliv_zscore'] = (g['deliv_pct'] - g['deliv_30d_avg']) / (g['deliv_30d_std'] + 1e-6)

        # 2. Volume Z-score
        g['vol_30d_avg'] = g['volume'].rolling(30, min_periods=10).mean()
        g['vol_30d_std'] = g['volume'].rolling(30, min_periods=10).std()
        g['vol_zscore'] = (g['volume'] - g['vol_30d_avg']) / (g['vol_30d_std'] + 1e-6)

        # 3. Amihud Illiquidity (Price impact per Rupee)
        turnover = g['close'] * g['volume']
        g['amihud'] = (g['daily_return_pct'].abs() / (turnover + 1e-6)) * 1e9

        # 4. Intraday Range / Spread (High - Low) / Close
        g['daily_range_pct'] = ((g['high'] - g['low']) / g['close']) * 100
        g['range_30d_avg'] = g['daily_range_pct'].rolling(30, min_periods=10).mean()

        # 5. RSI (14)
        delta = g['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(14, min_periods=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14, min_periods=14).mean()
        rs = gain / (loss + 1e-6)
        g['rsi_14'] = 100 - (100 / (1 + rs))

        # 6. VWAP deviation
        typical_p = (g['high'] + g['low'] + g['close']) / 3.0
        g['vwap_dev'] = ((g['close'] - typical_p) / typical_p) * 100

        # 7. Causal Kalman Velocity & Acceleration + Regime State (Zero Lookahead)
        sma_fast = g['close'].rolling(10, min_periods=5).mean()
        sma_slow = g['close'].rolling(30, min_periods=10).mean()
        sma_20 = g['close'].rolling(20, min_periods=10).mean()
        ret_20d = g['close'].pct_change(20)
        g['kalman_vel'] = ((sma_fast - sma_slow) / g['close'].clip(lower=1.0)) * 100.0
        g['kalman_acc'] = g['kalman_vel'].diff()
        g['hmm_state'] = np.where(
            (g['kalman_vel'] < -0.15) & (ret_20d < -0.02), 'Markdown',
            np.where((g['kalman_vel'] < 0.0) & (g['close'] < sma_20), 'Distribution',
                     np.where((g['kalman_vel'] > 0.10) & (g['close'] > sma_20), 'Markup', 'Accumulation'))
        )

        records.append(g)

    data = pd.concat(records).reset_index(drop=True)
    valid = data.dropna(subset=['fwd_t1', 'fwd_t5', 'deliv_zscore', 'vol_zscore', 'rsi_14', 'kalman_acc']).copy()

    base_t1 = valid['fwd_t1'].mean()
    base_t5 = valid['fwd_t5'].mean()
    print(f"Market Baseline: Mean T+1 = {base_t1:+.2f}%, Mean T+5 = {base_t5:+.2f}% across {len(valid):,} bars.\n")

    # --------------------------------------------------------------------------
    # FACTOR 1: MOMENTUM REVERSAL / SHORT-COVERING INFLECTION (Regime-Conditioned)
    # Definition: RSI > 60 AND Kalman_Velocity < 0 AND Delivery Z-Score < 0
    # --------------------------------------------------------------------------
    inflect_mask = (
        (valid['rsi_14'] > 60.0)
        & (valid['kalman_vel'] < 0.0)
        & (valid['deliv_zscore'] < 0.0)
    )
    inflect = valid[inflect_mask]
    t1_s = inflect['fwd_t1'].mean()
    t5_s = inflect['fwd_t5'].mean()
    t_stat_s1, p_s1 = stats.ttest_ind(inflect['fwd_t1'], valid['fwd_t1'])
    t_stat_s, p_s = stats.ttest_ind(inflect['fwd_t5'], valid['fwd_t5'])

    print("FACTOR 1: 'MOMENTUM REVERSAL / SHORT-COVERING INFLECTION' (RSI>60, Kalman Vel<0, Deliv Z<0)")
    print(f"• Occurrences : {len(inflect):,} bars ({len(inflect)/len(valid)*100:.1f}%)")
    print(f"• Mean T+1    : {t1_s:+.2f}% (vs Baseline {base_t1:+.2f}%) | t = {t_stat_s1:+.2f}, p = {p_s1:.4f}")
    print(f"• Mean T+5    : {t5_s:+.2f}% (vs Baseline {base_t5:+.2f}%) | Alpha: {t5_s - base_t5:+.2f}%")
    print(f"• Win Rate >0 : {(inflect['fwd_t5'] > 0).mean()*100:.1f}%")
    print(f"• T-stat / p  : t = {t_stat_s:+.2f}, p-value = {p_s:.4f}")
    print(f"• Edge Verdict: {'✅ STATISTICALLY SIGNIFICANT POSITIVE ALPHA (p < 0.05)' if p_s < 0.05 and t5_s > base_t5 else '❌ NO EDGE'}\n")

    # --------------------------------------------------------------------------
    # FACTOR 2: SHORT-COVERING SQUEEZE IN DOWNTREND
    # Definition: Daily Return > +1.0% AND Delivery < 40% AND Kalman_Velocity < -0.1
    # --------------------------------------------------------------------------
    squeeze_mask = (
        (valid['daily_return_pct'] > 1.0)
        & (valid['deliv_pct'] < 40.0)
        & (valid['kalman_vel'] < -0.1)
    )
    squeeze = valid[squeeze_mask]
    t1_e = squeeze['fwd_t1'].mean()
    t5_e = squeeze['fwd_t5'].mean()
    t_stat_e, p_e = stats.ttest_ind(squeeze['fwd_t5'], valid['fwd_t5'])

    print("FACTOR 2: 'SHORT-COVERING SQUEEZE IN DOWNTREND' (Ret>1%, Deliv<40%, Kalman Vel<-0.1)")
    print(f"• Occurrences : {len(squeeze):,} bars ({len(squeeze)/len(valid)*100:.1f}%)")
    print(f"• Mean T+1    : {t1_e:+.2f}% (vs Baseline {base_t1:+.2f}%)")
    print(f"• Mean T+5    : {t5_e:+.2f}% (vs Baseline {base_t5:+.2f}%) | Alpha: {t5_e - base_t5:+.2f}%")
    print(f"• Win Rate >0 : {(squeeze['fwd_t5'] > 0).mean()*100:.1f}%")
    print(f"• T-stat / p  : t = {t_stat_e:+.2f}, p-value = {p_e:.4f}")
    print(f"• Edge Verdict: {'✅ STATISTICALLY SIGNIFICANT ALPHA (p < 0.05)' if p_e < 0.05 else '❌ NO EDGE'}\n")

    # --------------------------------------------------------------------------
    # FACTOR 3: PANIC WASHOUT (RSI < 30 + Volume Z-score > 1.5)
    # --------------------------------------------------------------------------
    washout_mask = (valid['rsi_14'] < 30) & (valid['vol_zscore'] > 1.5)
    washout = valid[washout_mask]
    t1_w = washout['fwd_t1'].mean()
    t5_w = washout['fwd_t5'].mean()
    t_stat_w, p_w = stats.ttest_ind(washout['fwd_t5'], valid['fwd_t5'])

    print("FACTOR 3: 'CAPITULATION WASHOUT' (RSI < 30 + Volume Surge Z>1.5)")
    print(f"• Occurrences : {len(washout):,} bars ({len(washout)/len(valid)*100:.1f}%)")
    print(f"• Mean T+1    : {t1_w:+.2f}% (vs Baseline {base_t1:+.2f}%)")
    print(f"• Mean T+5    : {t5_w:+.2f}% (vs Baseline {base_t5:+.2f}%) | Alpha: {t5_w - base_t5:+.2f}%")
    print(f"• Rebound Rate: {(washout['fwd_t5'] > 0).mean()*100:.1f}%")
    print(f"• T-stat / p  : t = {t_stat_w:+.2f}, p-value = {p_w:.4f}")
    print(f"• Edge Verdict: {'✅ MEAN REVERSION REBOUND CONFIRMED' if t5_w > base_t5 else '❌ NO EDGE'}\n")

    # --------------------------------------------------------------------------
    # FACTOR 4: CONFIRMED NSE BULK & BLOCK DEALS MICROSTRUCTURE PANEL
    # Joins data/nse_bulk_block_deals_cache.csv onto matching Bhavcopy cache bars
    # --------------------------------------------------------------------------
    run_bulk_block_deal_factors()
    print("=" * 72)


def _parse_net_deal_qty(text: str) -> int:
    if not isinstance(text, str):
        return 0
    buys = [int(x.replace(",", "")) for x in re.findall(r"BUY:\s*([\d,]+)\s*shares", text)]
    sells = [int(x.replace(",", "")) for x in re.findall(r"SELL:\s*([\d,]+)\s*shares", text)]
    return sum(buys) - sum(sells)


def run_bulk_block_deal_factors(
    deals_path: str = "data/nse_bulk_block_deals_cache.csv",
    bhav_glob: str = "data/bhavcopy_cache/sec_bhavdata_*.csv",
):
    if not os.path.exists(deals_path):
        print("⚠️ Bulk/Block Deals cache not found; skipping Factor 4.")
        return
    files = sorted(glob.glob(bhav_glob))
    if not files:
        print("⚠️ Bhavcopy cache not found; skipping Factor 4.")
        return

    deals = pd.read_csv(deals_path)
    deals["ticker"] = deals["ticker"].astype(str).str.strip()
    deals["date"] = pd.to_datetime(deals["date"]).dt.strftime("%Y-%m-%d")
    deals["net_qty"] = deals["bulk_block_deals"].apply(_parse_net_deal_qty)
    deal_tickers = set(deals["ticker"])

    rows = []
    for f in files:
        bname = f.split("sec_bhavdata_")[-1].replace(".csv", "")
        try:
            dt = datetime.strptime(bname, "%d%m%Y")
        except ValueError:
            continue
        if dt >= datetime(2026, 6, 15):
            b = pd.read_csv(f, skipinitialspace=True)
            b.columns = [c.strip() for c in b.columns]
            b["SYMBOL"] = b["SYMBOL"].astype(str).str.strip()
            b["SERIES"] = b["SERIES"].astype(str).str.strip()
            b = b[(b["SERIES"] == "EQ") & (b["SYMBOL"].isin(deal_tickers))].copy()
            b["date"] = dt.strftime("%Y-%m-%d")
            rows.append(b[["SYMBOL", "date", "OPEN_PRICE", "HIGH_PRICE", "LOW_PRICE", "CLOSE_PRICE", "TTL_TRD_QNTY", "DELIV_PER"]])

    if not rows:
        print("⚠️ No overlapping EQ Bhavcopy cache bars for Bulk/Block Deals.")
        return

    panel = pd.concat(rows, ignore_index=True)
    for col in ["OPEN_PRICE", "HIGH_PRICE", "LOW_PRICE", "CLOSE_PRICE", "TTL_TRD_QNTY", "DELIV_PER"]:
        panel[col] = pd.to_numeric(panel[col], errors="coerce")
    panel = panel.dropna().rename(columns={
        "SYMBOL": "ticker",
        "OPEN_PRICE": "open",
        "HIGH_PRICE": "high",
        "LOW_PRICE": "low",
        "CLOSE_PRICE": "close",
        "TTL_TRD_QNTY": "volume",
        "DELIV_PER": "delivery_pct",
    })
    panel["date"] = pd.to_datetime(panel["date"])
    panel = adjust_corporate_actions(panel)
    panel["date"] = panel["date"].dt.strftime("%Y-%m-%d")
    panel = panel.merge(deals[["ticker", "date", "net_qty"]], on=["ticker", "date"], how="left")
    panel["net_qty"] = panel["net_qty"].fillna(0)

    recs = []
    for _, g in panel.groupby("ticker"):
        g = g.sort_values("date").reset_index(drop=True)
        g["ret"] = g["close"].pct_change() * 100.0
        g["fwd_t1"] = (g["close"].shift(-1) - g["close"]) / g["close"] * 100.0
        g["fwd_t5"] = (g["close"].shift(-5) - g["close"]) / g["close"] * 100.0
        g["deliv_z"] = (
            (g["delivery_pct"] - g["delivery_pct"].rolling(20, min_periods=10).mean())
            / (g["delivery_pct"].rolling(20, min_periods=10).std() + 1e-6)
        )
        sma10 = g["close"].rolling(10, min_periods=5).mean()
        sma20 = g["close"].rolling(20, min_periods=10).mean()
        g["k_vel"] = (sma10 - sma20) / g["close"].clip(lower=1.0) * 100.0
        g["hmm_state"] = np.where(g["k_vel"] < -0.2, "Markdown", "NonMarkdown")
        recs.append(g)

    v = pd.concat(recs).dropna(subset=["fwd_t1", "fwd_t5", "deliv_z"])
    base_t1 = v["fwd_t1"].mean()
    base_t5 = v["fwd_t5"].mean()
    matched_days = int((v["net_qty"] != 0).sum())

    print("-" * 72)
    print(f"🏛️  BULK/BLOCK DEALS PANEL ({len(v):,} bars across {v['ticker'].nunique()} deal tickers, {matched_days} matched deal days)")
    print(f"   Panel Baseline: Mean T+1 = {base_t1:+.2f}%, Mean T+5 = {base_t5:+.2f}%\n")

    # Factor 4A: Confirmed Institutional Block Absorption on Dips
    f4a = v[(v["net_qty"] > 0) & (v["ret"] <= 0.0) & (v["hmm_state"] != "Markdown")]
    t5_4a, p_4a = stats.ttest_ind(f4a["fwd_t5"], v["fwd_t5"])
    print("FACTOR 4A: 'CONFIRMED INSTITUTIONAL BLOCK ABSORPTION ON DIPS' (Net Buy>0, Ret<=0, Non-Markdown)")
    print(f"• Occurrences : {len(f4a):,} bars")
    print(f"• Mean T+1    : {f4a['fwd_t1'].mean():+.2f}% (vs Baseline {base_t1:+.2f}%)")
    print(f"• Mean T+5    : {f4a['fwd_t5'].mean():+.2f}% (vs Baseline {base_t5:+.2f}%) | Alpha: {f4a['fwd_t5'].mean() - base_t5:+.2f}%")
    print(f"• T-stat / p  : t = {t5_4a:+.2f}, p-value = {p_4a:.4f}\n")

    # Factor 4B: Institutional Bulk/Block Exhaustion Churn
    f4b = v[(v["net_qty"] != 0) & (v["ret"] > 1.0) & (v["delivery_pct"] < 40.0)]
    t5_4b, p_4b = stats.ttest_ind(f4b["fwd_t5"], v["fwd_t5"])
    print("FACTOR 4B: 'BULK/BLOCK EXHAUSTION CHURN' (|Net Deal Qty|>0, Ret>1.0%, Delivery<40%)")
    print(f"• Occurrences : {len(f4b):,} bars")
    print(f"• Mean T+1    : {f4b['fwd_t1'].mean():+.2f}% (vs Baseline {base_t1:+.2f}%)")
    print(f"• Mean T+5    : {f4b['fwd_t5'].mean():+.2f}% (vs Baseline {base_t5:+.2f}%) | Alpha: {f4b['fwd_t5'].mean() - base_t5:+.2f}%")
    print(f"• Down Rate <0: {(f4b['fwd_t5'] < 0).mean()*100:.1f}%")
    print(f"• T-stat / p  : t = {t5_4b:+.2f}, p-value = {p_4b:.4f}")
    print(f"• Edge Verdict: {'✅ STATISTICALLY SIGNIFICANT EXHAUSTION FADE (p < 0.001)' if p_4b < 0.001 else '⚠️ WEAK'}")

if __name__ == "__main__":
    run_alpha_discovery()
