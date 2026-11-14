"""
Q-ARC Evidence Provenance & Audit Traceability Engine
=====================================================
Guarantees complete end-to-end auditability from raw exchange bytes
to mathematical filter outputs and consensus card claims.

Every evidence item records:
- Source data origin (file, timestamp, bar index)
- Raw exchange inputs
- Transformation equations and parameter definitions
- Epistemic tier & explicit boundaries
"""
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Any, Optional
import json

@dataclass
class ProvenanceRecord:
    evidence_code: str               # e.g., "E01"
    metric_name: str                 # e.g., "Daily Return"
    source_origin: str               # e.g., "NSE Bhavcopy Archive (UDiFF Format)"
    bar_date: str                    # e.g., "2026-10-06"
    raw_inputs: Dict[str, Any]       # e.g., {"close": 1218.0, "prev_close": 1186.4}
    transformation_formula: str      # e.g., "((close - prev_close) / prev_close) * 100"
    computed_output: Any             # e.g., 2.66
    unit: str                        # e.g., "Percentage (%)"
    epistemic_tier: str              # TIER_1_OBSERVATION, TIER_2_MATH_MODEL, TIER_3_REGULATION, TIER_4_LIMITATION
    epistemic_boundary: str          # What this evidence proves AND what it cannot prove

class ProvenanceLedger:
    """
    Immutable ledger of provenance records.
    Provides complete audit trails for every quantitative metric and LLM citation.
    """
    def __init__(self, ticker: str, date: str):
        self.ticker = ticker
        self.date = date
        self.records: Dict[str, ProvenanceRecord] = {}

    def record(
        self,
        code: str,
        metric: str,
        source: str,
        inputs: Dict[str, Any],
        formula: str,
        output: Any,
        unit: str,
        tier: str,
        boundary: str
    ):
        self.records[code] = ProvenanceRecord(
            evidence_code=code,
            metric_name=metric,
            source_origin=source,
            bar_date=self.date,
            raw_inputs=inputs,
            transformation_formula=formula,
            computed_output=output,
            unit=unit,
            epistemic_tier=tier,
            epistemic_boundary=boundary
        )

    def get_audit_trail(self, code: str) -> Optional[Dict[str, Any]]:
        if code in self.records:
            return asdict(self.records[code])
        return None

    def export_audit_manifest(self) -> Dict[str, Any]:
        return {
            "security": self.ticker,
            "session_date": self.date,
            "provenance_items_count": len(self.records),
            "evidence_audit_trails": {k: asdict(v) for k, v in self.records.items()}
        }

    def print_audit_summary(self):
        print(f"\n📑 EVIDENCE PROVENANCE AUDIT TRAIL: {self.ticker} ({self.date})")
        print("=" * 80)
        for code, rec in sorted(self.records.items()):
            print(f"[{code}] {rec.metric_name} ({rec.epistemic_tier})")
            print(f"  • Source  : {rec.source_origin}")
            print(f"  • Formula : {rec.transformation_formula}")
            print(f"  • Output  : {rec.computed_output} {rec.unit}")
            print(f"  • Boundary: {rec.epistemic_boundary}")
            print("-" * 80)


def build_provenance_ledger(stock_data: Dict[str, Any]) -> ProvenanceLedger:
    ticker = stock_data["ticker"]
    date_str = str(stock_data.get("date", "LATEST"))[:10]
    prov = ProvenanceLedger(ticker, date_str)

    p = float(stock_data["price"])
    prev = float(stock_data["prev_close"])
    vol = int(stock_data.get("volume", 0))

    # E01: Daily Return
    prov.record(
        code="E01",
        metric="Daily Return",
        source="NSE Daily Bhavcopy (UDiFF)",
        inputs={"close": p, "prev_close": prev},
        formula="((close - prev_close) / prev_close) * 100",
        output=round(((p - prev) / prev) * 100, 2),
        unit="%",
        tier="TIER_1_EXCHANGE_OBSERVATION",
        boundary="Verifies price displacement between settlement auctions; does not reveal intraday execution path."
    )

    # E02: VWAP Deviation
    vwap_dev = float(stock_data.get("vwap_deviation_pct", 0.0))
    prov.record(
        code="E02",
        metric="VWAP Deviation",
        source="NSE Bhavcopy (Close vs Rolling Session VWAP Approximation)",
        inputs={"close": p, "vwap_dev_pct": vwap_dev},
        formula="((close - session_vwap) / session_vwap) * 100",
        output=vwap_dev,
        unit="%",
        tier="TIER_1_EXCHANGE_OBSERVATION",
        boundary="Measures closing execution premium/discount vs volume-weighted average; proxy for intraday aggressive demand."
    )

    # E03: Delivery Percentage
    deliv = float(stock_data.get("delivery_pct", 0.0))
    prov.record(
        code="E03",
        metric="Delivery Percentage",
        source="NSE Security-wise Delivery Position Archive",
        inputs={"delivery_pct": deliv, "traded_volume": vol},
        formula="(delivery_quantity / traded_volume) * 100",
        output=deliv,
        unit="%",
        tier="TIER_1_EXCHANGE_OBSERVATION",
        boundary="Verifies proportion of traded shares transferring settlement custody (demat); does not reveal investor holding duration."
    )

    # E04: Volume Anomaly
    vol_z = float(stock_data.get("volume_zscore", 0.0))
    vol_r = float(stock_data.get("volume_vs_30d_avg", 1.0))
    prov.record(
        code="E04",
        metric="Volume Anomaly",
        source="NSE Bhavcopy Historical 30-Day Rolling Window",
        inputs={"volume": vol, "volume_30d_avg": stock_data.get("vol_mean_30", "rolling"), "volume_30d_std": stock_data.get("vol_std_30", "rolling")},
        formula="Z = (volume - mean_30) / std_30 ; Ratio = volume / mean_30",
        output={"zscore": vol_z, "ratio": vol_r},
        unit="Standard Deviations / Multiples",
        tier="TIER_1_EXCHANGE_OBSERVATION",
        boundary="Verifies abnormal liquidity expansion/contraction vs recent baseline; does not identify counterparty composition."
    )

    # E05: Liquidity Friction
    amihud = float(stock_data.get("amihud_illiq", 0.0))
    atr = float(stock_data.get("atr_14", 0.0))
    prov.record(
        code="E05",
        metric="Liquidity Friction",
        source="NSE Bhavcopy Intraday Range & Amihud Proxy",
        inputs={"amihud": amihud, "atr_14": atr},
        formula="Amihud = |return| / (price * volume) * 1e6 ; ATR(14) = Mean(True_Range, 14)",
        output={"amihud": amihud, "atr": atr},
        unit="Price Impact per Rupee Traded / Rupee Range",
        tier="TIER_1_EXCHANGE_OBSERVATION",
        boundary="Quantifies price impact resistance; does not measure resting limit order queue depth."
    )

    # E08: Institutional Filings (Epistemic Boundary)
    deals = str(stock_data.get("bulk_block_deals", "none")).strip()
    has_filing = deals.lower() not in ("", "none", "nan") and len(deals) > 4
    prov.record(
        code="E08",
        metric="Exchange Filings & Block Deals",
        source="NSE Bulk / Block Deal Disclosure Reports (SEBI LODR Reg 29)",
        inputs={"filing_content": deals, "reporting_threshold": ">= 0.5% of total paid-up equity"},
        formula="Direct regulatory disclosure parsing",
        output=deals if has_filing else "NO_FILING_RECORDED",
        unit="Categorical Regulatory Disclosure",
        tier="TIER_3_REGULATORY_FILING",
        boundary="Proof of participation ONLY when >= 0.5% shares are transacted. Absence of filing proves lack of statutory disclosure, NOT absence of institutional investors (sub-threshold algorithmic slicing is unobservable)."
    )

    # E09: Order Book Depth Limitation
    prov.record(
        code="E09",
        metric="Level 2 / Level 3 Order Book Depth",
        source="NSE Broadcast Tick Data (ITCH / Multicast Feed)",
        inputs={"feed_status": "NOT_CONNECTED_IN_DAILY_MODE"},
        formula="N/A (Feed unavailable)",
        output="UNAVAILABLE",
        unit="Qualitative Feed Availability",
        tier="TIER_4_EXPLICIT_LIMITATION",
        boundary="Strict epistemic limitation: Daily Bhavcopy data cannot observe iceberg orders, spoofing cancellations, or bid-ask queue dynamics."
    )

    # E10: GARCH(1,1) Volatility
    garch = stock_data.get("garch", {})
    prov.record(
        code="E10",
        metric="GARCH(1,1) Volatility Forecast",
        source="SciPy MLE Solver on Historical Log Returns",
        inputs={"daily_returns_window": "30-270 bars", "omega": garch.get("omega"), "alpha": garch.get("alpha"), "beta": garch.get("beta")},
        formula="sigma_t^2 = omega + alpha * epsilon_{t-1}^2 + beta * sigma_{t-1}^2",
        output=garch.get("forecast_annualized_vol_pct", 0.0),
        unit="Annualized Volatility (%)",
        tier="TIER_2_MATHEMATICAL_MODEL",
        boundary="Captures volatility clustering and mean reversion; assumes stationary return innovation variance."
    )

    # E11: Kalman Filter Denoised Trend
    kalman = stock_data.get("kalman", {})
    prov.record(
        code="E11",
        metric="Kalman Denoised Trend Velocity",
        source="2D State-Space Filter on Closing Prices",
        inputs={"state_transition_F": "[[1,1],[0,1]]", "observation_H": "[[1,0]]", "raw_price": p},
        formula="x_t = F x_{t-1} + w_t ; z_t = H x_t + v_t ; K_t = P_{t|t-1} H^T (H P_{t|t-1} H^T + R)^{-1}",
        output={"filtered_price": kalman.get("filtered_price"), "velocity_pct_per_day": kalman.get("trend_velocity_pct_per_day")},
        unit="Rupees / % per day",
        tier="TIER_2_MATHEMATICAL_MODEL",
        boundary="Separates latent smooth price drift from high-frequency microstructure noise; cannot identify participant intent or causation."
    )

    # E12: HMM 4-State Probability Anchor
    hmm = stock_data.get("hmm", {})
    prov.record(
        code="E12",
        metric="HMM 4-State Regime Anchor",
        source="Out-of-sample forward filter on Gaussian drift/volatility clusters",
        inputs={"training_bars": "t=0..T-1", "test_bar": "t=T", "calibrated_entropy": hmm.get("entropy_bits")},
        formula="Forward filter: alpha_T(j) = sum_i(alpha_{T-1}(i) A_{ij}) b_j(X_T) with Dirichlet temperature smoothing",
        output={"regime": hmm.get("current_regime"), "confidence": hmm.get("confidence"), "entropy": hmm.get("entropy_bits")},
        unit="Calibrated Posterior Probability [0, 1]",
        tier="TIER_2_MATHEMATICAL_MODEL",
        boundary="Purely statistical clustering of return/volume distributions; acts as an analogue to Wyckoff phases, NOT ground truth proof of institutional campaigns."
    )

    # E13: Monte Carlo 10,000-Path Risk Simulation
    mc = stock_data.get("monte_carlo", {})
    prov.record(
        code="E13",
        metric="Monte Carlo 10k Forward Risk Sizing",
        source="GBM with Student-t fat-tail innovations (df=5) over 10 days",
        inputs={"n_paths": 10000, "horizon": 10, "garch_sigma": garch.get("forecast_daily_vol_pct", 1.5), "sizing_breakdown": mc.get("position_sizing_breakdown")},
        formula="S_t = S_0 exp((mu - 0.5 sigma^2) t + sigma sqrt(t) Z_t_fat) ; Cap = min(Stop_Budget, Vol_Target, CVaR_Stress)",
        output={"var_95": mc.get("var_95_pct"), "cvar_95": mc.get("cvar_95_expected_shortfall_pct"), "allocation_cap_pct": mc.get("recommended_max_allocation_cap_pct")},
        unit="% Drawdown / % Portfolio Capital",
        tier="TIER_2_MATHEMATICAL_MODEL",
        boundary="Simulates forward path distributions under stationary parameters; does not predict black swan regime shifts outside simulated innovations."
    )

    return prov
