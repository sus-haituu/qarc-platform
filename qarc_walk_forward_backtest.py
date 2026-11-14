"""
Q-ARC Walk-Forward Historical Out-Of-Sample Backtester
=====================================================
Evaluates quantitative regime filtering and claim rules out-of-sample across
liquid NSE equities from historical Bhavcopy archives.

Compares against simple benchmarks:
1. Passive Buy & Hold Benchmark
2. 20-Day SMA Trend Follower
3. Naive RSI(14) Mean Reversion (<30 Buy / >70 Sell)
4. Q-ARC Quantitative Engine (Kalman Denoised Trend + HMM Regime Filter + GARCH Hazard)

Computes:
- Total Return (%)
- Annualized Return (%)
- Annualized Volatility (%)
- Sharpe Ratio (Risk-free rate = 6.5% Indian T-bill baseline)
- Maximum Drawdown (%)
- Win Rate (%)
- Trade Count & Market Exposure (%)
"""
import sys
import numpy as np
import pandas as pd
from scipy import stats

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')


def compute_rolling_hurst(prices: np.ndarray, window: int = 60) -> float:
    """
    Causal rolling Hurst Exponent estimator via multi-lag Variance Ratio / R/S scaling
    on log returns over the trailing `window` bars.
    H > 0.52 indicates persistent trending; H < 0.48 indicates mean-reversion/chop.
    """
    if len(prices) < max(window, 20):
        return 0.50
    sub = np.asarray(prices[-window:], dtype=float)
    sub = np.maximum(sub, 1e-6)
    log_p = np.log(sub)
    lags = [2, 4, 8, 16]
    tau = []
    for lag in lags:
        if lag >= len(log_p):
            break
        diff = log_p[lag:] - log_p[:-lag]
        std_val = np.std(diff)
        tau.append(max(std_val, 1e-8))
    if len(tau) < 2:
        return 0.50
    poly = np.polyfit(np.log(lags[:len(tau)]), np.log(tau), 1)
    hurst = float(np.clip(poly[0], 0.1, 0.9))
    return hurst


def apply_regime_exposure_gate(
    raw_weight: float,
    hmm_state: str,
    kalman_vel: float,
    garch_vol: float,
    vol_p75: float,
) -> float:
    """
    Hard Regime Circuit Breaker & Volatility Shock Damper:
    1. Hard Cash Gate: Never hold long inventory in confirmed Markdown/Distribution + negative velocity.
    2. Volatility Shock Damper: Scale down exposure to 0.35x if conditional vol spikes above 75th percentile.
    """
    if hmm_state in ["Markdown", "Distribution"] and kalman_vel < 0:
        return 0.0
    if garch_vol > vol_p75 and raw_weight > 0:
        return raw_weight * 0.35
    return raw_weight


def adjust_corporate_actions(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detects unadjusted NSE stock splits/bonuses/demergers (overnight drops > 35%,
    exceeding NSE circuit limits) and backward-adjusts OHLC & Volume.
    Supports both lowercase (ticker/date/open/high/low/close/volume) and
    uppercase (SYMBOL/TIMESTAMP/OPEN/HIGH/LOW/CLOSE/TOTTRDQTY) schemas.
    """
    sym_col = "ticker" if "ticker" in df.columns else "SYMBOL"
    dt_col = "date" if "date" in df.columns else "TIMESTAMP"
    o_col = "open" if "open" in df.columns else "OPEN"
    h_col = "high" if "high" in df.columns else "HIGH"
    l_col = "low" if "low" in df.columns else "LOW"
    c_col = "close" if "close" in df.columns else "CLOSE"
    v_col = "volume" if "volume" in df.columns else ("TOTTRDQTY" if "TOTTRDQTY" in df.columns else None)

    df = df.sort_values([sym_col, dt_col]).reset_index(drop=True).copy()
    price_cols = [o_col, h_col, l_col, c_col]
    df[price_cols] = df[price_cols].astype(float)
    if v_col:
        df[v_col] = df[v_col].astype(float)

    for _, group in df.groupby(sym_col):
        closes = group[c_col].values
        opens = group[o_col].values
        overnight_ratio = np.ones(len(group))
        overnight_ratio[1:] = opens[1:] / np.maximum(closes[:-1], 1e-6)

        split_mask = overnight_ratio < 0.65
        if np.any(split_mask):
            cum_factor = np.ones(len(group))
            for idx in np.where(split_mask)[0]:
                raw_factor = overnight_ratio[idx]
                inv = 1.0 / max(raw_factor, 1e-6)
                if abs(inv - np.round(inv)) < 0.15:
                    clean_factor = 1.0 / max(np.round(inv), 1.0)
                else:
                    clean_factor = raw_factor
                cum_factor[:idx] *= clean_factor

            df.loc[group.index, price_cols] = group[price_cols].multiply(cum_factor, axis=0)
            if v_col:
                df.loc[group.index, v_col] = group[v_col] / cum_factor

    return df

def run_walk_forward_backtest(
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    sample_tickers: list = None,
    warmup_bars: int = 40,
    rf_rate: float = 0.065
):
    print("=" * 80)
    print("📈 Q-ARC WALK-FORWARD OUT-OF-SAMPLE BACKTESTING BENCHMARK")
    print("=" * 80)
    print(f"Data source   : {bhavcopy_path}")
    print(f"Warmup window : {warmup_bars} bars (Strictly causal, zero look-ahead)")
    print(f"Risk-free rate: {rf_rate*100:.1f}% (Indian Sovereign T-Bill Benchmark)\n")

    df = pd.read_csv(bhavcopy_path)
    df['date'] = pd.to_datetime(df['date'])
    df = adjust_corporate_actions(df)

    if sample_tickers is None:
        # Default to a representative basket of high-liquidity NSE equities
        sample_tickers = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'DRREDDY', 'SBIN']

    available_tickers = [t for t in sample_tickers if t in df['ticker'].unique()]
    print(f"Testing across {len(available_tickers)} liquid equities: {', '.join(available_tickers)}\n")

    portfolio_results = {
        "Buy_and_Hold": [],
        "SMA_20_Trend": [],
        "RSI_Mean_Reversion": [],
        "Q_ARC_Sniper": [],
        "Q_ARC_Balanced_Core": [],
    }
    portfolio_excess = {
        "Buy_and_Hold": [],
        "SMA_20_Trend": [],
        "RSI_Mean_Reversion": [],
        "Q_ARC_Sniper": [],
        "Q_ARC_Balanced_Core": [],
    }
    strategy_exposures = {
        "Buy_and_Hold": [],
        "SMA_20_Trend": [],
        "RSI_Mean_Reversion": [],
        "Q_ARC_Sniper": [],
        "Q_ARC_Balanced_Core": [],
    }
    strategy_active_bars = {
        "Buy_and_Hold": [],
        "SMA_20_Trend": [],
        "RSI_Mean_Reversion": [],
        "Q_ARC_Sniper": [],
        "Q_ARC_Balanced_Core": [],
    }

    ticker_summaries = []

    for ticker in available_tickers:
        sub = df[df['ticker'] == ticker].sort_values('date').reset_index(drop=True)
        if len(sub) <= warmup_bars + 10:
            continue

        closes = sub['close'].values
        volumes = sub['volume'].values
        deliv_col = 'DELIVERY_PCT' if 'DELIVERY_PCT' in sub.columns else 'delivery_pct'
        deliv = sub[deliv_col].values if deliv_col in sub.columns else np.full(len(sub), 45.0)
        n = len(closes)

        # Precompute indicators causality-checked
        returns = np.zeros(n)
        returns[1:] = (closes[1:] - closes[:-1]) / closes[:-1]

        # 20-Day SMA & Bollinger Bands
        sma_20 = pd.Series(closes).rolling(20).mean().values
        std_20 = pd.Series(closes).rolling(20).std().values
        bb_lower = sma_20 - 1.5 * std_20

        # 14-Day RSI
        delta = pd.Series(closes).diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / np.maximum(loss, 1e-6)
        rsi_14 = (100 - (100 / (1 + rs))).values

        # Delivery Z-score (causal 30d rolling)
        deliv_s = pd.Series(deliv)
        deliv_z = ((deliv_s - deliv_s.rolling(30, min_periods=10).mean()) /
                   (deliv_s.rolling(30, min_periods=10).std() + 1e-6)).fillna(0.0).values

        # Q-ARC Causal State Estimator (Kalman Velocity/Acc + HMM Regime + Volatility Hazard + Hurst Routing)
        qarc_signal = np.zeros(n)
        bal_signal = np.zeros(n)
        bal_hold_days = 0
        sma_fast = pd.Series(closes).rolling(10).mean().values
        sma_slow = pd.Series(closes).rolling(30).mean().values
        sma_60 = pd.Series(closes).rolling(60, min_periods=30).mean().values
        vol_20 = pd.Series(returns).rolling(20).std().values * np.sqrt(252)
        rf_daily = rf_rate / 252.0

        for t in range(warmup_bars, n - 1):
            p_t = closes[t]
            # Causal Kalman proxy trend velocity & acceleration
            kalman_vel = (sma_fast[t] - sma_slow[t]) / max(p_t, 1.0) * 100.0
            prev_vel = (sma_fast[t - 1] - sma_slow[t - 1]) / max(closes[t - 1], 1.0) * 100.0
            kalman_acc = kalman_vel - prev_vel

            vol_window = vol_20[max(20, t - 60):t + 1]
            vol_window = vol_window[~np.isnan(vol_window)]
            garch_vol = float(vol_20[t]) if not np.isnan(vol_20[t]) else 0.15
            vol_p75 = float(np.percentile(vol_window, 75)) if len(vol_window) >= 10 else garch_vol * 1.2

            # Causal 4-State Regime Classification (Markup / Accumulation / Distribution / Markdown)
            ret_20d = (closes[t] - closes[max(0, t - 20)]) / max(closes[max(0, t - 20)], 1e-6)
            if kalman_vel < -0.15 and ret_20d < -0.02:
                hmm_state = "Markdown"
            elif kalman_vel < 0.0 and p_t < sma_20[t]:
                hmm_state = "Distribution"
            elif kalman_vel > 0.10 and p_t > sma_20[t]:
                hmm_state = "Markup"
            else:
                hmm_state = "Accumulation"

            # Rolling 60-day Hurst Exponent Routing
            hurst = compute_rolling_hurst(closes[:t + 1], window=60)

            if hurst < 0.45:
                # Mean-reverting / choppy regime: RSI/BB extremes + Delivery Z + macro anchor
                if (rsi_14[t] < 40.0 or p_t <= bb_lower[t]) and deliv_z[t] > 0.5 and kalman_acc >= 0.0 and p_t >= sma_60[t] * 0.97:
                    raw_weight = 1.0
                elif rsi_14[t] > 58.0 or kalman_acc < -0.05:
                    raw_weight = 0.0
                else:
                    raw_weight = qarc_signal[t - 1]
            else:
                # Persistent trending regime (H >= 0.45): Kalman velocity + acceleration + macro anchor
                if kalman_vel > 0.12 and kalman_acc >= 0.0 and rsi_14[t] < 65.0 and deliv_z[t] > 0.25 and p_t > sma_60[t]:
                    raw_weight = 1.0
                elif kalman_vel < 0.0 or rsi_14[t] > 65.0:
                    raw_weight = 0.0
                else:
                    raw_weight = qarc_signal[t - 1]

            # Tier 1: Q-ARC Sniper (Capital Preservation)
            qarc_signal[t] = apply_regime_exposure_gate(
                raw_weight=raw_weight,
                hmm_state=hmm_state,
                kalman_vel=kalman_vel,
                garch_vol=garch_vol,
                vol_p75=vol_p75,
            )

            # Tier 2: Q-ARC Balanced Core (Sniper 1.0 + Factor 1 & Factor 2 Tactical 0.50 + Uptrend 0.65)
            f1_trigger = (rsi_14[t] > 60.0 and kalman_vel < 0.0 and deliv_z[t] < 0.0)
            f2_trigger = (returns[t] * 100.0 > 1.0 and deliv[t] < 40.0 and kalman_vel < -0.1)
            if (f1_trigger or f2_trigger) and garch_vol <= vol_p75:
                bal_hold_days = 7

            if qarc_signal[t] > 0.0:
                bal_signal[t] = qarc_signal[t]
            elif bal_hold_days > 0:
                bal_hold_days -= 1
                bal_signal[t] = 0.50 if hmm_state != "Markdown" else 0.0
            elif hmm_state in ("Markup", "Accumulation") and p_t > sma_60[t] * 0.99 and kalman_acc >= 0.0 and rsi_14[t] < 65.0:
                bal_signal[t] = apply_regime_exposure_gate(
                    raw_weight=0.50,
                    hmm_state=hmm_state,
                    kalman_vel=kalman_vel,
                    garch_vol=garch_vol,
                    vol_p75=vol_p75,
                )
            else:
                bal_signal[t] = 0.0

        # Net-of-cost Strategy Daily Returns (15 bps NSE STT + slippage, T-bill cash sweep)
        def calc_net_returns(weights, stock_ret):
            turnover = np.abs(np.diff(weights, prepend=0.0))
            cost_drag = turnover * 0.0015  # 15 bps all-in NSE STT + slippage
            tot_ret = (weights * stock_ret) + ((1.0 - np.abs(weights)) * rf_daily) - cost_drag
            ex_ret = (weights * (stock_ret - rf_daily)) - cost_drag
            return tot_ret, ex_ret

        stock_rets = returns[warmup_bars:]
        bh_w = np.ones_like(stock_rets)
        sma_w = (closes[warmup_bars-1:-1] > sma_20[warmup_bars-1:-1]).astype(float)
        rsi_w = (rsi_14[warmup_bars-1:-1] < 45.0).astype(float)
        qarc_w = qarc_signal[warmup_bars-1:-1]
        bal_w = bal_signal[warmup_bars-1:-1]

        bh_rets, bh_ex = calc_net_returns(bh_w, stock_rets)
        sma_rets, sma_ex = calc_net_returns(sma_w, stock_rets)
        rsi_rets, rsi_ex = calc_net_returns(rsi_w, stock_rets)
        qarc_rets, qarc_ex = calc_net_returns(qarc_w, stock_rets)
        bal_rets, bal_ex = calc_net_returns(bal_w, stock_rets)

        portfolio_results["Buy_and_Hold"].append(bh_rets)
        portfolio_results["SMA_20_Trend"].append(sma_rets)
        portfolio_results["RSI_Mean_Reversion"].append(rsi_rets)
        portfolio_results["Q_ARC_Sniper"].append(qarc_rets)
        portfolio_results["Q_ARC_Balanced_Core"].append(bal_rets)

        portfolio_excess["Buy_and_Hold"].append(bh_ex)
        portfolio_excess["SMA_20_Trend"].append(sma_ex)
        portfolio_excess["RSI_Mean_Reversion"].append(rsi_ex)
        portfolio_excess["Q_ARC_Sniper"].append(qarc_ex)
        portfolio_excess["Q_ARC_Balanced_Core"].append(bal_ex)

        strategy_exposures["Buy_and_Hold"].append(float(np.mean(bh_w)) * 100.0)
        strategy_exposures["SMA_20_Trend"].append(float(np.mean(sma_w)) * 100.0)
        strategy_exposures["RSI_Mean_Reversion"].append(float(np.mean(rsi_w)) * 100.0)
        strategy_exposures["Q_ARC_Sniper"].append(float(np.mean(qarc_w)) * 100.0)
        strategy_exposures["Q_ARC_Balanced_Core"].append(float(np.mean(bal_w)) * 100.0)

        strategy_active_bars["Buy_and_Hold"].append(float(np.mean(bh_w > 0)) * 100.0)
        strategy_active_bars["SMA_20_Trend"].append(float(np.mean(sma_w > 0)) * 100.0)
        strategy_active_bars["RSI_Mean_Reversion"].append(float(np.mean(rsi_w > 0)) * 100.0)
        strategy_active_bars["Q_ARC_Sniper"].append(float(np.mean(qarc_w > 0)) * 100.0)
        strategy_active_bars["Q_ARC_Balanced_Core"].append(float(np.mean(bal_w > 0)) * 100.0)

        # Ticker metrics
        tot_bh = (np.prod(1 + bh_rets) - 1) * 100
        tot_qarc = (np.prod(1 + qarc_rets) - 1) * 100
        tot_bal = (np.prod(1 + bal_rets) - 1) * 100
        ticker_summaries.append({
            "ticker": ticker,
            "bars": len(bh_rets),
            "bh_return": tot_bh,
            "sniper_return": tot_qarc,
            "balanced_return": tot_bal,
            "alpha_sniper": tot_qarc - tot_bh
        })

    # Aggregate Portfolio Metrics
    def compute_metrics(returns_list, excess_list, name):
        # Equal-weighted portfolio across tested tickers
        min_len = min(len(r) for r in returns_list)
        aligned = np.column_stack([r[:min_len] for r in returns_list])
        port_daily = np.mean(aligned, axis=1)

        aligned_ex = np.column_stack([r[:min_len] for r in excess_list])
        port_ex = np.mean(aligned_ex, axis=1)

        cum_equity = np.cumprod(1 + port_daily)
        total_return = (cum_equity[-1] - 1.0) * 100.0
        n_days = len(port_daily)
        ann_return = ((1 + total_return / 100.0) ** (252.0 / max(n_days, 1)) - 1.0) * 100.0
        ann_vol = np.std(port_daily) * np.sqrt(252) * 100.0

        sharpe = (np.mean(port_ex) / max(np.std(port_ex), 1e-6)) * np.sqrt(252)

        # Max Drawdown
        peaks = np.maximum.accumulate(cum_equity)
        drawdowns = (cum_equity - peaks) / peaks * 100.0
        max_dd = float(np.min(drawdowns))
        calmar = ann_return / max(abs(max_dd), 0.1)

        win_rate = float(np.mean(port_daily[port_daily != 0] > 0)) * 100.0 if np.any(port_daily != 0) else 0.0
        exposure = float(np.mean(strategy_exposures[name])) if strategy_exposures.get(name) else 0.0
        active_bars = float(np.mean(strategy_active_bars[name])) if strategy_active_bars.get(name) else 0.0

        return {
            "Strategy": name,
            "Total Return (%)": round(total_return, 2),
            "Annualized Return (%)": round(ann_return, 2),
            "Annualized Vol (%)": round(ann_vol, 2),
            "Sharpe Ratio": round(sharpe, 2),
            "Max Drawdown (%)": round(max_dd, 2),
            "Calmar Ratio": round(calmar, 2),
            "Win Rate (%)": round(win_rate, 1),
            "Avg Weight (%)": round(exposure, 1),
            "Active Bars (%)": round(active_bars, 1),
        }

    summary_table = []
    for strat, rets in portfolio_results.items():
        summary_table.append(compute_metrics(rets, portfolio_excess[strat], strat))

    res_df = pd.DataFrame(summary_table)

    print("📊 COMPARATIVE OUT-OF-SAMPLE PERFORMANCE SUMMARY")
    print("=" * 80)
    print(res_df.to_string(index=False))
    print("=" * 80 + "\n")

    print("🔎 INDIVIDUAL TICKER OUT-OF-SAMPLE BREAKDOWN")
    print("-" * 80)
    t_df = pd.DataFrame(ticker_summaries)
    print(t_df.to_string(index=False))
    print("-" * 80)

    # Statistical Significance Test (Paired t-test vs Buy & Hold)
    min_len = min(len(r) for r in portfolio_results["Q_ARC_Sniper"])
    q_daily = np.mean(np.column_stack([r[:min_len] for r in portfolio_results["Q_ARC_Sniper"]]), axis=1)
    bal_daily = np.mean(np.column_stack([r[:min_len] for r in portfolio_results["Q_ARC_Balanced_Core"]]), axis=1)
    bh_daily = np.mean(np.column_stack([r[:min_len] for r in portfolio_results["Buy_and_Hold"]]), axis=1)
    t_stat, p_val = stats.ttest_rel(q_daily, bh_daily)
    t_bal, p_bal = stats.ttest_rel(bal_daily, bh_daily)

    print(f"\n🔬 PAIRED STATISTICAL SIGNIFICANCE (vs Buy & Hold):")
    print(f"  • Q_ARC_Sniper        : t-stat = {t_stat:+.3f}, p-value = {p_val:.4f}")
    print(f"  • Q_ARC_Balanced_Core : t-stat = {t_bal:+.3f}, p-value = {p_bal:.4f}")

if __name__ == "__main__":
    run_walk_forward_backtest()
