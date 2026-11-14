"""
Q-ARC Evidence Ledger Engine
Transforms raw market indicators into an immutable, timestamped Evidence Ledger (E01, E02, ...).
Enforces explicit boundaries between observed market facts, proxy heuristics, and missing data.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional

@dataclass
class EvidenceItem:
    code: str                  # e.g., "E01"
    category: str              # e.g., "PRICE_VWAP", "DELIVERY", "FILINGS", "LIMITATION"
    metric: str                # e.g., "VWAP Deviation"
    value: Any                 # e.g., -0.85
    description: str           # Human-readable factual summary
    is_verifiable_fact: bool = True  # True if directly computed from exchange data
    is_limitation: bool = False       # True if explicit declaration of missing data

@dataclass
class EvidenceLedger:
    ticker: str
    date: str
    items: Dict[str, EvidenceItem] = field(default_factory=dict)
    
    # Explicit capability flags (tells the verifier what can legally be claimed)
    has_verified_filings: bool = False
    has_order_book_depth: bool = False
    has_multi_week_holdings: bool = False
    has_factor_4b_exhaustion: bool = False

    def add(self, code: str, category: str, metric: str, value: Any, desc: str, 
            is_fact: bool = True, is_limitation: bool = False):
        self.items[code] = EvidenceItem(
            code=code,
            category=category,
            metric=metric,
            value=value,
            description=desc,
            is_verifiable_fact=is_fact,
            is_limitation=is_limitation
        )

    def to_prompt_text(self) -> str:
        """Serializes the evidence ledger for input into the Nemotron 70B cognitive layer."""
        lines = [f"=== EVIDENCE LEDGER FOR {self.ticker} ({self.date}) ==="]
        for code, item in sorted(self.items.items()):
            tag = "[LIMITATION]" if item.is_limitation else "[FACT]"
            lines.append(f"{code} {tag} {item.metric}: {item.description}")
        lines.append("==================================================")
        return "\n".join(lines)


def build_evidence_ledger(
    stock_data: Dict[str, Any],
    live_l2_quote: Optional[Dict[str, Any]] = None,
    catalyst_rag: Optional[Any] = None,
) -> EvidenceLedger:
    """
    Constructs an immutable Evidence Ledger from input stock metrics.
    Automatically assigns capability flags and limitation warnings.
    When live_l2_quote['available'] is True, E09 upgrades from abstention
    to live 5-level NSE Order Book Depth telemetry.
    """
    ticker = stock_data["ticker"]
    date_str = str(stock_data.get("date", "LATEST"))[:10]
    ledger = EvidenceLedger(ticker=ticker, date=date_str)

    p = float(stock_data["price"])
    prev = float(stock_data["prev_close"])
    p_chg = round(((p - prev) / prev) * 100, 2)
    
    # E01: Price Return
    ledger.add(
        code="E01",
        category="PRICE",
        metric="Daily Return",
        value=p_chg,
        desc=f"Price moved from ₹{prev:.2f} to ₹{p:.2f} ({p_chg:+.2f}%)"
    )

    # E02: VWAP Deviation
    vwap_dev = float(stock_data.get("vwap_deviation_pct", 0.0))
    side = "below" if vwap_dev < 0 else "above" if vwap_dev > 0 else "at"
    ledger.add(
        code="E02",
        category="PRICE_VWAP",
        metric="VWAP Deviation",
        value=vwap_dev,
        desc=f"Close is {abs(vwap_dev):.2f}% {side} session VWAP"
    )

    # E03: Delivery Volume
    deliv = float(stock_data.get("delivery_pct", 0.0))
    if deliv < 35.0:
        deliv_cat = "Low Delivery / High Intraday Speculative Turnover"
    elif deliv <= 55.0:
        deliv_cat = "Moderate Delivery / Mixed Turnover"
    else:
        deliv_cat = "High Delivery / Elevated Positional Transfer"
    ledger.add(
        code="E03",
        category="DELIVERY",
        metric="Delivery Percentage",
        value=deliv,
        desc=f"{deliv:.1f}% delivery to traded volume ({deliv_cat})"
    )

    # E04: Volume Z-Score & Multiple
    vol = int(stock_data.get("volume", 0))
    vol_z = float(stock_data.get("volume_zscore", 0.0))
    vol_ratio = float(stock_data.get("volume_vs_30d_avg", 1.0))
    ledger.add(
        code="E04",
        category="VOLUME",
        metric="Volume Anomaly",
        value={"zscore": vol_z, "ratio": vol_ratio, "volume": vol},
        desc=f"Volume {vol:,} shares ({vol_ratio:.2f}x 30d average, Z-score: {vol_z:+.2f})"
    )

    # E05: Microstructure Friction (Amihud & Kyle proxies)
    amihud = float(stock_data.get("amihud_illiq", 0.0))
    atr = float(stock_data.get("atr_14", 0.0))
    ledger.add(
        code="E05",
        category="MICROSTRUCTURE",
        metric="Liquidity Friction",
        value={"amihud": amihud, "atr": atr},
        desc=f"Amihud Illiquidity: {amihud:.4f}, ATR(14): ₹{atr:.2f}"
    )

    # E06: Market Regime (HMM / Trend)
    regime = str(stock_data.get("hmm_regime", "Neutral"))
    ledger.add(
        code="E06",
        category="REGIME",
        metric="Macro / HMM Regime",
        value=regime,
        desc=f"Statistically classified as: {regime}"
    )

    # E07: RSI (14)
    rsi = float(stock_data.get("rsi_14", 50.0))
    if rsi < 30.0:
        rsi_desc = f"RSI 14 = {rsi:.2f} (Conventionally Oversold, <30)"
    elif rsi > 70.0:
        rsi_desc = f"RSI 14 = {rsi:.2f} (Conventionally Overbought, >70)"
    else:
        rsi_desc = f"RSI 14 = {rsi:.2f} (Within neutral 30-70 band; NOT conventionally oversold/overbought)"
    ledger.add(
        code="E07",
        category="MOMENTUM",
        metric="RSI 14",
        value=rsi,
        desc=rsi_desc
    )

    # E08: Exchange Filings & Institutional Deal Records (Regulatory Disclosure Boundary)
    deals = str(stock_data.get("bulk_block_deals", "none")).strip()
    has_filing = deals.lower() not in ("", "none", "nan") and len(deals) > 4
    net_deal_qty = float(stock_data.get("net_deal_qty", 0.0) or 0.0)
    has_deal_activity = has_filing or abs(net_deal_qty) > 0

    rag_payload = catalyst_rag if catalyst_rag is not None else stock_data.get("catalyst_rag")
    if rag_payload is None and stock_data.get("use_catalyst_rag"):
        try:
            from qarc_vector_memory import retrieve_catalyst_rag

            rag_payload = retrieve_catalyst_rag(ticker=ticker, as_of_date=date_str, k=3)
        except Exception:
            rag_payload = None

    rag_docs: List[Dict[str, Any]] = []
    if isinstance(rag_payload, dict):
        rag_docs = [d for d in (rag_payload.get("docs") or []) if isinstance(d, dict) and d.get("headline")]
    elif isinstance(rag_payload, list):
        rag_docs = [d for d in rag_payload if isinstance(d, dict) and d.get("headline")]

    if not has_filing and any(
        "DEAL" in str(d.get("category", "")).upper() or "FILING" in str(d.get("category", "")).upper()
        for d in rag_docs
    ):
        ledger.has_verified_filings = True
    else:
        ledger.has_verified_filings = has_filing

    if has_deal_activity and p_chg > 1.0 and deliv < 40.0:
        ledger.has_factor_4b_exhaustion = True
        factor_4b_tag = " [FACTOR 4B TRIGGERED: Bulk/Block Intraday Exhaustion Churn (p=0.0002, T+5 Mean -0.81%)]"
        ledger.items["E03"].description += factor_4b_tag
        ledger.items["E05"].description += factor_4b_tag

    if has_filing:
        desc_e08 = f"VERIFIED Exchange Block/Bulk Filing (>0.5% threshold): {deals}. Participant identity established."
        if rag_docs:
            citations = "; ".join(
                f"[{d.get('filing_date')}] ({d.get('category', 'CATALYST')}) {d.get('headline')}"
                for d in rag_docs
            )
            desc_e08 += f" | Retrieved E08 Catalyst RAG: {citations}"
    elif rag_docs:
        citations = "; ".join(
            f"[{d.get('filing_date')}] ({d.get('category', 'CATALYST')}) {d.get('headline')}"
            for d in rag_docs
        )
        desc_e08 = f"RETRIEVED E08 CATALYST RAG ({len(rag_docs)} docs <= {date_str}): {citations}"
    else:
        desc_e08 = "NONE RECORDED (<0.5% regulatory threshold). Participant identity UNRESOLVED. Note: Lack of filings does NOT establish absence of institutional investors; order slicing below disclosure threshold cannot be verified from Bhavcopy."
    ledger.add(
        code="E08",
        category="FILINGS",
        metric="Institutional Filings",
        value=deals,
        desc=desc_e08,
        is_fact=True
    )

    # E09: Order Book Depth (Live Angel One SmartAPI L2 Upgrade or Explicit Limitation)
    l2_data = live_l2_quote if live_l2_quote is not None else stock_data.get("live_l2_quote")
    if isinstance(l2_data, dict) and l2_data.get("available"):
        ledger.has_order_book_depth = True
        imb = float(l2_data.get("l2_imbalance", 0.0))
        tbq_tsq = float(l2_data.get("tbq_tsq_ratio", 1.0))
        bid_q = int(l2_data.get("top5_bid_qty", 0))
        ask_q = int(l2_data.get("top5_ask_qty", 0))
        spoof = bool(l2_data.get("spoofing_anomaly_detected", False))
        wall_ratio = float(l2_data.get("wall_to_median_ratio", 1.0))
        desc_e09 = l2_data.get("summary_text") or (
            f"LIVE ANGEL ONE L2 DEPTH: 5-Level Imbalance={imb:+.2%}, TBQ/TSQ={tbq_tsq:.2f}x "
            f"(Top5 Bid={bid_q:,} vs Ask={ask_q:,}), Spoofing/Wall Anomaly={'DETECTED' if spoof else 'NONE'} "
            f"(Max Wall={wall_ratio:.2f}x median)."
        )
        ledger.add(
            code="E09",
            category="ORDER_BOOK_L2",
            metric="Level 2 Order Book (Angel One SmartAPI)",
            value=l2_data,
            desc=desc_e09,
            is_fact=True,
            is_limitation=False,
        )
    else:
        ledger.has_order_book_depth = False
        ledger.add(
            code="E09",
            category="LIMITATION",
            metric="Level 2 / Level 3 Order Book",
            value="UNAVAILABLE",
            desc="NOT AVAILABLE. Daily snapshot data only. Real-time bid/ask depth, spoofing, and cancellation queues are absent.",
            is_fact=False,
            is_limitation=True,
        )

    # --------------------------------------------------------------------------
    # QUANT ENGINES INTEGRATION (E10 - E13)
    # --------------------------------------------------------------------------
    # E10: GARCH(1,1) Volatility Forecast
    garch_data = stock_data.get("garch", {})
    if garch_data:
        ann_vol = garch_data.get("forecast_annualized_vol_pct", 0.0)
        persist = garch_data.get("persistence", 0.0)
        h_ratio = garch_data.get("volatility_hazard_ratio", 1.0)
        v_regime = garch_data.get("volatility_regime", "NORMAL")
        alert = garch_data.get("hazard_alert", "")
        ledger.add(
            code="E10",
            category="GARCH_VOLATILITY",
            metric="GARCH(1,1) Vol Forecast",
            value=garch_data,
            desc=f"Annualized Vol: {ann_vol:.1f}%, Persistence: {persist}, Hazard Ratio: {h_ratio:.2f}x ({v_regime}) — {alert}"
        )

    # E11: Kalman Filter Denoised Price & Trend Velocity
    kalman_data = stock_data.get("kalman", {})
    if kalman_data:
        k_price = kalman_data.get("filtered_price", p)
        k_vel = kalman_data.get("trend_velocity_pts_per_day", 0.0)
        k_vel_pct = kalman_data.get("trend_velocity_pct_per_day", 0.0)
        k_noise = kalman_data.get("microstructure_noise_pts", 0.0)
        k_signal = kalman_data.get("trend_signal", "UNKNOWN")
        ledger.add(
            code="E11",
            category="KALMAN_FILTER",
            metric="Kalman Denoised Trend",
            value=kalman_data,
            desc=f"Denoised Price: ₹{k_price:.2f}, Trend Velocity: {k_vel:+.2f} pts/day ({k_vel_pct:+.3f}%/day), Signal: {k_signal}, Microstructure Noise: ₹{k_noise:+.2f}"
        )

    # E12: HMM 4-State Regime Probabilities
    hmm_data = stock_data.get("hmm", {})
    if hmm_data:
        h_regime = hmm_data.get("current_regime", regime)
        h_conf = hmm_data.get("confidence", 0.0)
        h_persist = hmm_data.get("persistence", 0.0)
        h_probs = hmm_data.get("probabilities", {})
        prob_str = ", ".join([f"{k}: {v*100:.0f}%" for k, v in h_probs.items()])
        ledger.add(
            code="E12",
            category="HMM_REGIME",
            metric="HMM 4-State Probability Anchor",
            value=hmm_data,
            desc=f"Phase: {h_regime} ({h_conf*100:.1f}% confidence, {h_persist*100:.1f}% state persistence) [Posterior Probs: {prob_str}]"
        )

    # E13: Live Monte Carlo 10,000-Path Risk Scenarios
    mc_data = stock_data.get("monte_carlo", {})
    if mc_data:
        var95 = mc_data.get("var_95_pct", 0.0)
        cvar95 = mc_data.get("cvar_95_expected_shortfall_pct", 0.0)
        p_stop = mc_data.get("prob_stop_breach_pct", 0.0)
        p_tgt = mc_data.get("prob_target_hit_pct", 0.0)
        asym = mc_data.get("asymmetry_ratio", 1.0)
        alloc_cap = mc_data.get("recommended_max_allocation_cap_pct", 100.0)
        r_profile = mc_data.get("risk_assessment", "BALANCED")
        ledger.add(
            code="E13",
            category="MONTE_CARLO_RISK",
            metric="Live Monte Carlo 10k Risk Scenario",
            value=mc_data,
            desc=f"VaR(95%): {var95:+.1f}%, CVaR(95%): {cvar95:+.1f}%, P(Stop -3% Breach): {p_stop:.1f}%, P(Target +5% Hit): {p_tgt:.1f}%, Asymmetry: {asym:.2f}x, Max Allocation Cap: {alloc_cap:.1f}% [{r_profile}]"
        )

    # E14: Strictly Causal Probabilistic Price Forecast (T+1 / T+5)
    pf_data = stock_data.get("price_forecast", {})
    if isinstance(pf_data, dict) and pf_data:
        bias = pf_data.get("directional_bias", "NEUTRAL")
        t1_p = float(pf_data.get("t1_expected_price", 0.0))
        t1_r = float(pf_data.get("t1_expected_return_pct", 0.0))
        t1_lo = float(pf_data.get("t1_lower_1sigma", 0.0))
        t1_hi = float(pf_data.get("t1_upper_1sigma", 0.0))
        t5_p = float(pf_data.get("t5_expected_price", 0.0))
        t5_r = float(pf_data.get("t5_expected_return_pct", 0.0))
        t5_lo = float(pf_data.get("t5_lower_95", 0.0))
        t5_hi = float(pf_data.get("t5_upper_95", 0.0))
        p_up = float(pf_data.get("prob_up_pct", 50.0))
        p_dn = float(pf_data.get("prob_down_pct", 50.0))
        ledger.add(
            code="E14",
            category="PRICE_FORECAST",
            metric="E14 Probabilistic Price Forecast (T+1 / T+5)",
            value=pf_data,
            desc=(
                f"Bias: {bias}, T+1: ₹{t1_p:.2f} ({t1_r:+.2f}%, 1σ [₹{t1_lo:.2f}, ₹{t1_hi:.2f}]), "
                f"T+5: ₹{t5_p:.2f} ({t5_r:+.2f}%, 95% CI [₹{t5_lo:.2f}, ₹{t5_hi:.2f}]), "
                f"P(Up): {p_up:.1f}% / P(Down): {p_dn:.1f}%"
            )
        )

    # E15: Historical Regime Vector Memory Twins (Neon Postgres pgvector)
    vt_data = stock_data.get("vector_twins", {})
    if isinstance(vt_data, dict) and vt_data.get("available") and vt_data.get("twins"):
        twins = vt_data["twins"]
        win_rate = float(vt_data.get("historical_5d_win_rate_pct", 0.0))
        mean_ret = float(vt_data.get("mean_5d_return_pct", 0.0))
        top_refs = ", ".join(
            f"{t['symbol']}@{t['bar_date']} ({float(t['fwd_5d_ret_pct']):+.2f}%, sim={float(t['cosine_similarity']):.3f})"
            for t in twins[:3]
        )
        ledger.add(
            code="E15",
            category="VECTOR_MEMORY",
            metric="E15 Historical Regime Twins (Neon pgvector)",
            value=vt_data,
            desc=(
                f"Top-{len(twins)} Cosine Twins ({vt_data.get('source', 'NEON_PGVECTOR_COSINE')}): "
                f"5D Win Rate {win_rate:.1f}%, Mean 5D Return {mean_ret:+.2f}%. Nearest: {top_refs}"
            )
        )

    return ledger
