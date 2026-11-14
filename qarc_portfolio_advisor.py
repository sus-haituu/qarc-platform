"""
Q-ARC E14 Probabilistic Price Forecast, Cross-Sectional Screener & Institutional Portfolio Advisor
=================================================================================================
Pure NumPy/SciPy causal forecasting and portfolio sizing layer:
1. E14 Probabilistic Price Forecast (`compute_price_forecast`) using ONLY validated
   5-day empirical factor drifts (Factor 4B -0.81%, Factor 1 +0.46%, Factor 2 +0.56%),
   Kalman velocity/acceleration with Hurst routing, HMM regime drift bias, GARCH
   volatility bands, and optional live Angel One L2 microstructure tilt.
2. Cross-Sectional Screener (`rank_stock_recommendations`) enforcing hard quarantine
   (`AVOID`) on Factor 4B exhaustion churn, HMM Markdown regimes, or unresolved
   ClaimVerifier contradictions.
3. Institutional Portfolio Advisor (`generate_institutional_portfolio`) supporting
   `SNIPER_DEFENSIVE` (20% single / 60% equity) and `BALANCED_CORE` (25% single /
   85% equity), inverse-CVaR conviction weighting, integer share sizing,
   LIQUIDBEES cash sweep routing, and Neon Postgres persistence.
"""
import math
from typing import Any, Dict, List, Optional

import numpy as np
from scipy.stats import norm

# Empirically validated 5-day factor drifts (strictly causal)
FACTOR_4B_5D_DRIFT_PCT = -0.81
FACTOR_1_5D_DRIFT_PCT = 0.46
FACTOR_2_5D_DRIFT_PCT = 0.56

LIQUIDBEES_ANNUAL_YIELD_PCT = 6.50
DAILY_DRIFT_CLIP_PCT = 1.20

RISK_PROFILES: Dict[str, Dict[str, float]] = {
    "SNIPER_DEFENSIVE": {
        "max_single_weight": 0.20,
        "max_equity_weight": 0.60,
    },
    "CONSERVATIVE": {
        "max_single_weight": 0.15,
        "max_equity_weight": 0.50,
    },
    "BALANCED_CORE": {
        "max_single_weight": 0.25,
        "max_equity_weight": 0.85,
    },
    "AGGRESSIVE_ALPHA": {
        "max_single_weight": 0.30,
        "max_equity_weight": 0.95,
    },
}

_HMM_DAILY_BIAS_PCT: Dict[str, float] = {
    "MARKUP": 0.12,
    "ACCUMULATION": 0.06,
    "DISTRIBUTION": -0.08,
    "MARKDOWN": -0.20,
}


def _hmm_daily_drift_bias(hmm_state: str) -> float:
    upper = str(hmm_state or "").upper()
    for key, bias in _HMM_DAILY_BIAS_PCT.items():
        if key in upper:
            return bias
    return 0.0


def _round_price(value: float) -> float:
    return round(float(value), 4 if abs(value) < 5.0 else 2)


def compute_price_forecast(
    current_price: float,
    kalman_vel: float,
    kalman_acc: float,
    garch_daily_vol_pct: float,
    hurst: float,
    hmm_state: str,
    has_factor_1: bool = False,
    has_factor_2: bool = False,
    has_factor_4b: bool = False,
    live_l2: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Computes strictly causal T+1 and T+5 probabilistic price forecasts (E14).
    """
    cur_p = max(float(current_price), 1e-4)
    k_vel = float(kalman_vel)
    k_acc = float(kalman_acc)
    hurst_val = float(np.clip(hurst, 0.0, 1.0))
    sigma_1d_pct = max(float(garch_daily_vol_pct), 0.25)

    primary_drivers: List[str] = []

    # 1. Hurst-routed Kalman velocity + acceleration
    if hurst_val > 0.55:
        vel_weight = 0.65
        primary_drivers.append(f"Hurst Persistent Trend ({hurst_val:.2f})")
    elif hurst_val < 0.45:
        vel_weight = -0.25
        primary_drivers.append(f"Hurst Mean-Reversion Dampening ({hurst_val:.2f})")
    else:
        vel_weight = 0.35
    vel_contrib = vel_weight * k_vel
    acc_contrib = 0.25 * k_acc

    # 2. HMM regime daily drift bias
    hmm_bias = _hmm_daily_drift_bias(hmm_state)
    if hmm_bias != 0.0:
        primary_drivers.append(f"HMM {hmm_state} ({hmm_bias:+.2f}%/d)")

    # 3. Validated 5-day empirical factor drifts ONLY
    if has_factor_4b:
        factor_5d_drift_pct = FACTOR_4B_5D_DRIFT_PCT
        primary_drivers.append(f"Factor 4B Exhaustion Churn ({FACTOR_4B_5D_DRIFT_PCT:+.2f}% 5D)")
    else:
        factor_5d_drift_pct = (
            (FACTOR_1_5D_DRIFT_PCT if has_factor_1 else 0.0)
            + (FACTOR_2_5D_DRIFT_PCT if has_factor_2 else 0.0)
        )
        if has_factor_1:
            primary_drivers.append(f"Factor 1 Mean-Reversion ({FACTOR_1_5D_DRIFT_PCT:+.2f}% 5D)")
        if has_factor_2:
            primary_drivers.append(f"Factor 2 Liquidity Surge ({FACTOR_2_5D_DRIFT_PCT:+.2f}% 5D)")
    factor_daily_drift_pct = factor_5d_drift_pct / 5.0

    # 4. Optional live Angel One L2 microstructure micro-tilt
    l2_tilt = 0.0
    if isinstance(live_l2, dict) and live_l2.get("available"):
        if live_l2.get("l2_imbalance") is not None:
            imb = float(live_l2["l2_imbalance"])
        elif live_l2.get("buy_pressure_pct") is not None:
            imb = (float(live_l2["buy_pressure_pct"]) - 50.0) / 50.0
        else:
            imb = 0.0
        l2_tilt = float(np.clip(imb * 0.12, -0.10, 0.10))
        if abs(l2_tilt) >= 0.01:
            primary_drivers.append(f"Live L2 Imbalance ({imb:+.1%})")

    # 5. Aggregate & clip daily drift strictly within [-1.2%, +1.2%]
    raw_daily_drift_pct = vel_contrib + acc_contrib + hmm_bias + factor_daily_drift_pct + l2_tilt
    daily_drift_pct = float(np.clip(raw_daily_drift_pct, -DAILY_DRIFT_CLIP_PCT, DAILY_DRIFT_CLIP_PCT))

    # 6. T+1 projection and 1-sigma interval
    t1_expected_return_pct = round(daily_drift_pct, 4)
    t1_expected_price = _round_price(cur_p * (1.0 + t1_expected_return_pct / 100.0))
    t1_lower_1sigma = _round_price(cur_p * (1.0 + (t1_expected_return_pct - sigma_1d_pct) / 100.0))
    t1_upper_1sigma = _round_price(cur_p * (1.0 + (t1_expected_return_pct + sigma_1d_pct) / 100.0))
    eps = 1e-4 if abs(cur_p) < 5.0 else 0.01
    if t1_lower_1sigma >= t1_expected_price:
        t1_lower_1sigma = _round_price(t1_expected_price - eps)
    if t1_upper_1sigma <= t1_expected_price:
        t1_upper_1sigma = _round_price(t1_expected_price + eps)

    # 7. T+5 projection (3-day persistence on clipped state drift + full 5D factor drift) and 95% CI
    non_factor_daily = daily_drift_pct - factor_daily_drift_pct
    t5_expected_return_pct = round(
        float(np.clip(3.0 * non_factor_daily + factor_5d_drift_pct, -5.0 * DAILY_DRIFT_CLIP_PCT, 5.0 * DAILY_DRIFT_CLIP_PCT)),
        4,
    )
    t5_expected_price = _round_price(cur_p * (1.0 + t5_expected_return_pct / 100.0))
    sigma_5d_1x_pct = max(sigma_1d_pct * math.sqrt(5.0), 0.25)
    sigma_5d_95_pct = sigma_5d_1x_pct * 1.96
    t5_lower_95 = _round_price(cur_p * (1.0 + (t5_expected_return_pct - sigma_5d_95_pct) / 100.0))
    t5_upper_95 = _round_price(cur_p * (1.0 + (t5_expected_return_pct + sigma_5d_95_pct) / 100.0))
    if t5_lower_95 >= t5_expected_price:
        t5_lower_95 = _round_price(t5_expected_price - eps)
    if t5_upper_95 <= t5_expected_price:
        t5_upper_95 = _round_price(t5_expected_price + eps)

    # 8. Normal CDF directional probabilities summing strictly to 100.0%
    z_score = t5_expected_return_pct / sigma_5d_1x_pct
    prob_up_pct = round(float(np.clip(norm.cdf(z_score) * 100.0, 1.0, 99.0)), 1)
    prob_down_pct = round(100.0 - prob_up_pct, 1)

    hmm_upper = str(hmm_state or "").upper()
    if has_factor_4b or "MARKDOWN" in hmm_upper or t5_expected_return_pct <= -0.15:
        directional_bias = "BEARISH"
    elif t5_expected_return_pct >= 0.15:
        directional_bias = "BULLISH"
    else:
        directional_bias = "NEUTRAL"

    if not primary_drivers:
        primary_drivers.append("Balanced Quant Equilibrium")

    return {
        "current_price": _round_price(cur_p),
        "daily_drift_pct": round(daily_drift_pct, 4),
        "validated_factor_5d_drift_pct": round(factor_5d_drift_pct, 2),
        "t1_expected_return_pct": t1_expected_return_pct,
        "t1_expected_price": t1_expected_price,
        "t1_lower_1sigma": t1_lower_1sigma,
        "t1_upper_1sigma": t1_upper_1sigma,
        "t5_expected_return_pct": t5_expected_return_pct,
        "t5_expected_price": t5_expected_price,
        "t5_lower_95": t5_lower_95,
        "t5_upper_95": t5_upper_95,
        "prob_up_pct": prob_up_pct,
        "prob_down_pct": prob_down_pct,
        "directional_bias": directional_bias,
        "primary_drivers": primary_drivers,
    }


def rank_stock_recommendations(ticker_payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Cross-sectional screener ranking stocks by risk-adjusted conviction score.
    Enforces hard `AVOID` quarantine whenever Factor 4B exhaustion churn,
    HMM Markdown regime, or unresolved ClaimVerifier contradictions are active.
    """
    ranked: List[Dict[str, Any]] = []

    for item in ticker_payloads:
        ticker = str(item.get("ticker", "")).strip().upper()
        cur_p = max(float(item.get("current_price", 0.0) or 0.0), 1e-4)
        hmm_state = str(item.get("hmm_state", "Accumulation"))
        k_vel = float(item.get("kalman_vel", 0.0) or 0.0)
        k_acc = float(item.get("kalman_acc", 0.0) or 0.0)
        garch_vol = float(item.get("garch_daily_vol_pct", 1.5) or 1.5)
        hurst = float(item.get("hurst", 0.5) or 0.5)
        cvar_95 = float(item.get("cvar_95_pct", -4.5) or -4.5)
        var_95 = float(item.get("var_95_pct", -3.0) or -3.0)
        has_f1 = bool(item.get("has_factor_1", False))
        has_f2 = bool(item.get("has_factor_2", False))
        has_f4b = bool(item.get("has_factor_4b", False))
        unresolved = int(item.get("unresolved_contradictions", 0) or 0)
        live_l2 = item.get("live_l2")

        pf = item.get("price_forecast")
        if not isinstance(pf, dict) or "t5_expected_return_pct" not in pf:
            pf = compute_price_forecast(
                current_price=cur_p,
                kalman_vel=k_vel,
                kalman_acc=k_acc,
                garch_daily_vol_pct=garch_vol,
                hurst=hurst,
                hmm_state=hmm_state,
                has_factor_1=has_f1,
                has_factor_2=has_f2,
                has_factor_4b=has_f4b,
                live_l2=live_l2,
            )

        t5_ret = float(pf.get("t5_expected_return_pct", 0.0))
        prob_up = float(pf.get("prob_up_pct", 50.0))
        bias = str(pf.get("directional_bias", "NEUTRAL"))
        hmm_upper = hmm_state.upper()

        hmm_boost = (
            8.0 if "MARKUP" in hmm_upper
            else 4.0 if "ACCUMULATION" in hmm_upper
            else -8.0 if "DISTRIBUTION" in hmm_upper
            else -20.0 if "MARKDOWN" in hmm_upper
            else 0.0
        )
        factor_boost = (8.0 if has_f1 else 0.0) + (10.0 if has_f2 else 0.0)
        tail_penalty = min(max(abs(cvar_95) - 3.5, 0.0) * 2.0, 15.0)
        raw_score = (
            50.0
            + float(np.clip(t5_ret * 10.0, -25.0, 25.0))
            + ((prob_up - 50.0) * 0.5)
            + hmm_boost
            + factor_boost
            - tail_penalty
        )
        clipped_score = float(np.clip(raw_score, 5.0, 98.0))

        # Hard institutional quarantine rule
        is_quarantined = has_f4b or ("MARKDOWN" in hmm_upper) or (unresolved > 0)
        if is_quarantined:
            conviction_score = round(min(clipped_score, 15.0), 1)
            rating = "AVOID"
            tier = "RISK_QUARANTINE"
            reasons = []
            if has_f4b:
                reasons.append("Factor 4B exhaustion churn")
            if "MARKDOWN" in hmm_upper:
                reasons.append("HMM Markdown regime")
            if unresolved > 0:
                reasons.append(f"{unresolved} unresolved ClaimVerifier contradiction(s)")
            rationale = f"QUARANTINED ({', '.join(reasons)})."
        elif clipped_score >= 68.0 and bias == "BULLISH":
            conviction_score = round(clipped_score, 1)
            rating = "STRONG BUY"
            tier = "SNIPER_CORE"
            rationale = (
                f"High-conviction setup: {hmm_state}, T+5 E14 {t5_ret:+.2f}%, "
                f"P(Up) {prob_up:.1f}%."
            )
        elif clipped_score >= 54.0 and (has_f1 or has_f2 or bias == "BULLISH"):
            conviction_score = round(clipped_score, 1)
            rating = "TACTICAL ACCUMULATE"
            tier = "TACTICAL_FACTOR"
            rationale = (
                f"Tactical edge ({hmm_state}, T+5 E14 {t5_ret:+.2f}%, P(Up) {prob_up:.1f}%)."
            )
        else:
            conviction_score = round(clipped_score, 1)
            rating = "HOLD"
            tier = "BENCHMARK_WATCH"
            rationale = f"Neutral watch: {hmm_state}, T+5 E14 {t5_ret:+.2f}%."

        stop_pct = float(np.clip(abs(cvar_95), 2.0, 6.0))
        target_price = float(pf.get("t5_expected_price", cur_p))
        stop_loss_price = _round_price(cur_p * (1.0 - stop_pct / 100.0))

        ranked.append({
            "ticker": ticker,
            "current_price": _round_price(cur_p),
            "conviction_score": conviction_score,
            "rating": rating,
            "tier": tier,
            "hmm_state": hmm_state,
            "has_factor_1": has_f1,
            "has_factor_2": has_f2,
            "has_factor_4b": has_f4b,
            "unresolved_contradictions": unresolved,
            "cvar_95_pct": round(cvar_95, 2),
            "var_95_pct": round(var_95, 2),
            "garch_daily_vol_pct": round(garch_vol, 2),
            "kalman_vel": round(k_vel, 3),
            "t1_expected_return_pct": float(pf.get("t1_expected_return_pct", 0.0)),
            "t5_expected_return_pct": t5_ret,
            "t5_expected_price": target_price,
            "target_price": target_price,
            "stop_loss_price": stop_loss_price,
            "prob_up_pct": prob_up,
            "directional_bias": bias,
            "rationale": rationale,
            "price_forecast": pf,
        })

    ranked.sort(key=lambda r: (r["rating"] == "AVOID", -r["conviction_score"]))
    return ranked


def _allocate_capped_weights(
    raw_scores: List[float],
    max_single: float,
    max_total: float,
) -> List[float]:
    """
    Water-filling simplex allocation: distributes up to `max_total` proportionally
    to `raw_scores` while strictly capping each weight at `max_single`.
    """
    n = len(raw_scores)
    if n == 0 or max_total <= 0.0 or max_single <= 0.0:
        return [0.0] * n

    weights = [0.0] * n
    remaining_budget = min(max_total, n * max_single)
    active = set(range(n))

    while active and remaining_budget > 1e-12:
        score_sum = sum(max(raw_scores[i], 0.0) for i in active)
        if score_sum <= 0.0:
            equal_w = min(remaining_budget / len(active), max_single)
            for i in active:
                weights[i] += equal_w
            break

        capped_any = False
        for i in list(active):
            prop_w = remaining_budget * (max(raw_scores[i], 0.0) / score_sum)
            if weights[i] + prop_w > max_single + 1e-12:
                used = max_single - weights[i]
                weights[i] = max_single
                remaining_budget = max(remaining_budget - used, 0.0)
                active.remove(i)
                capped_any = True
        if not capped_any:
            for i in active:
                weights[i] += remaining_budget * (max(raw_scores[i], 0.0) / score_sum)
            break

    return weights


def generate_institutional_portfolio(
    recommendations: List[Dict[str, Any]],
    capital_inr: float = 500000.0,
    risk_profile: str = "BALANCED_CORE",
    persist_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Constructs a risk-budgeted institutional equity + LIQUIDBEES portfolio.
    Never allocates capital to Factor 4B, HMM Markdown, or AVOID stocks.
    """
    profile_key = str(risk_profile or "BALANCED_CORE").strip().upper()
    if profile_key not in RISK_PROFILES:
        raise ValueError(f"Unsupported risk_profile '{risk_profile}'. Choose from {list(RISK_PROFILES.keys())}.")

    cap = max(float(capital_inr), 0.0)
    bounds = RISK_PROFILES[profile_key]
    max_single = bounds["max_single_weight"]
    max_equity = bounds["max_equity_weight"]

    eligible = [
        r for r in recommendations
        if r.get("rating") in ("STRONG BUY", "TACTICAL ACCUMULATE")
        and not r.get("has_factor_4b", False)
        and "MARKDOWN" not in str(r.get("hmm_state", "")).upper()
        and int(r.get("unresolved_contradictions", 0) or 0) == 0
        and float(r.get("current_price", 0.0) or 0.0) > 0.0
    ]

    raw_scores = [
        float(r.get("conviction_score", 0.0)) / max(abs(float(r.get("cvar_95_pct", 4.5))), 1.0)
        for r in eligible
    ]
    target_weights = _allocate_capped_weights(raw_scores, max_single=max_single, max_total=max_equity)

    allocations: List[Dict[str, Any]] = []
    for rec, target_w in zip(eligible, target_weights):
        price = float(rec["current_price"])
        target_inr = cap * target_w
        shares = int(math.floor(target_inr / price)) if cap > 0.0 and price > 0.0 else 0
        if shares <= 0:
            continue
        allocated_inr = round(shares * price, 2)
        actual_weight_pct = round((allocated_inr / cap) * 100.0, 2) if cap > 0.0 else 0.0
        allocations.append({
            "ticker": rec["ticker"],
            "rating": rec["rating"],
            "tier": rec.get("tier", ""),
            "shares": shares,
            "current_price": _round_price(price),
            "allocated_inr": allocated_inr,
            "allocation_inr": allocated_inr,
            "target_weight_pct": round(target_w * 100.0, 2),
            "weight_pct": actual_weight_pct,
            "conviction_score": float(rec.get("conviction_score", 0.0)),
            "t5_expected_return_pct": float(rec.get("t5_expected_return_pct", 0.0)),
            "cvar_95_pct": float(rec.get("cvar_95_pct", -4.5)),
            "stop_loss_price": float(rec.get("stop_loss_price", price * 0.96)),
            "target_price": float(rec.get("target_price", price)),
            "hmm_state": str(rec.get("hmm_state", "Accumulation")),
            "garch_daily_vol_pct": float(rec.get("garch_daily_vol_pct", 1.5)),
            "prob_up_pct": float(rec.get("prob_up_pct", 50.0)),
            "has_factor_1": bool(rec.get("has_factor_1", False)),
            "has_factor_2": bool(rec.get("has_factor_2", False)),
            "rationale": str(rec.get("rationale", "")),
        })

    quarantined_tickers = [
        {
            "ticker": r["ticker"],
            "rating": r.get("rating", "AVOID"),
            "shares": 0,
            "rationale": r.get("rationale", "Risk quarantined"),
        }
        for r in recommendations
        if r.get("rating") == "AVOID" or r.get("has_factor_4b") or "MARKDOWN" in str(r.get("hmm_state", "")).upper()
    ]

    total_equity_inr = round(sum(a["allocated_inr"] for a in allocations), 2)
    total_equity_weight_pct = round((total_equity_inr / cap) * 100.0, 2) if cap > 0.0 else 0.0
    cash_sweep_inr = round(max(cap - total_equity_inr, 0.0), 2)
    cash_sweep_weight_pct = round((cash_sweep_inr / cap) * 100.0, 2) if cap > 0.0 else 100.0

    cash_5d_yield_pct = LIQUIDBEES_ANNUAL_YIELD_PCT * (5.0 / 252.0)
    if cap > 0.0:
        expected_5d_return_pct = round(
            sum((a["allocated_inr"] / cap) * a["t5_expected_return_pct"] for a in allocations)
            + (cash_sweep_inr / cap) * cash_5d_yield_pct,
            3,
        )
        portfolio_cvar95_pct = round(
            sum((a["allocated_inr"] / cap) * a["cvar_95_pct"] for a in allocations),
            3,
        )
    else:
        expected_5d_return_pct = 0.0
        portfolio_cvar95_pct = 0.0

    portfolio_result: Dict[str, Any] = {
        "risk_profile": profile_key,
        "capital_inr": round(cap, 2),
        "max_single_weight_pct": round(max_single * 100.0, 1),
        "max_equity_weight_pct": round(max_equity * 100.0, 1),
        "total_equity_inr": total_equity_inr,
        "total_equity_weight_pct": total_equity_weight_pct,
        "cash_sweep_instrument": "LIQUIDBEES",
        "cash_sweep_inr": cash_sweep_inr,
        "cash_sweep_weight_pct": cash_sweep_weight_pct,
        "cash_sweep_annual_yield_pct": LIQUIDBEES_ANNUAL_YIELD_PCT,
        "expected_5d_return_pct": expected_5d_return_pct,
        "portfolio_cvar95_pct": portfolio_cvar95_pct,
        "allocations": allocations,
        "quarantined_avoid": quarantined_tickers,
    }

    if persist_to_db:
        from qarc_db import log_generated_portfolio

        row_id = log_generated_portfolio(portfolio_result)
        portfolio_result["db_row_id"] = row_id

    return portfolio_result
