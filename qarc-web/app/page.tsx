"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import StateSpaceChart, { SeriesPoint } from "@/components/StateSpaceChart";

interface FieldBadge {
  badge: "SUPPORTED" | "OVERRIDDEN" | "ABSTAINED" | "REJECTED" | string;
  status: string;
  raw: string;
  verified: string;
  cites: string[];
  notes: string;
}

interface SecurityData {
  ticker: string;
  date: string;
  latency_ms: number;
  hurst_60d: number;
  hurst_routing_mode: string;
  active_factors: {
    factor_1_short_covering: boolean;
    factor_2_squeeze: boolean;
    factor_4b_deal_churn: boolean;
  };
  series: SeriesPoint[];
  evidence_ledger: Record<
    string,
    {
      category: string;
      metric: string;
      description: string;
      is_limitation: boolean;
    }
  >;
  quant_anchors: {
    garch: {
      forecast_annualized_vol_pct: number;
      persistence: number | null;
      volatility_hazard_ratio: number;
      volatility_regime: string;
      hazard_alert: string;
    };
    kalman: {
      raw_price: number;
      filtered_price: number;
      trend_velocity_pct_per_day: number;
      microstructure_noise_pts: number;
      trend_signal: string;
    };
    hmm: {
      current_regime: string;
      confidence: number;
      persistence: number;
      entropy_bits: number;
      probabilities: Record<string, number>;
    };
    monte_carlo: {
      var_95_pct: number;
      cvar_95_expected_shortfall_pct: number;
      prob_stop_breach_pct: number;
      prob_target_hit_pct: number;
      recommended_max_allocation_cap_pct: number;
      risk_assessment: string;
    };
  };
  guardrail_telemetry: {
    guardrail_intervened: boolean;
    raw_contradictions: number;
    post_guardrail_contradictions: number;
    unsupported_claims: number;
    evidence_coverage_pct: number;
    verification_status: string;
    field_badges: Record<string, FieldBadge>;
  };
  live_l2_depth?: {
    available: boolean;
    source?: string;
    ltp?: number;
    best_bid?: number;
    best_ask?: number;
    top5_bid_qty?: number;
    top5_ask_qty?: number;
    l2_imbalance?: number;
    tbq_tsq_ratio?: number;
    wall_to_median_ratio?: number;
    spoofing_anomaly_detected?: boolean;
    summary_text?: string;
  };
  guardrail_stress_test?: {
    unconstrained_prior_contradictions: number;
    post_guardrail_contradictions: number;
    field_diffs: Record<string, Omit<FieldBadge, "badge">>;
  };
}

interface SnapshotPayload {
  generated_at: string;
  tickers: string[];
  securities: Record<string, SecurityData>;
  backtest_summary: Array<{
    strategy: string;
    total_return_pct: number;
    ann_return_pct: number;
    ann_vol_pct: number;
    sharpe: number;
    max_dd_pct: number;
    calmar: number;
    win_rate_pct: number;
    avg_weight_pct: number;
    active_bars_pct: number;
  }>;
  factor_evidence: Array<{
    id: string;
    name: string;
    rule: string;
    bars: number;
    t5_mean_pct: number;
    t_stat: number;
    p_value: number;
    direction: string;
  }>;
  reliability_audit: {
    n_trials: number;
    n_fields: number;
    n_tickers: number;
    raw_contradictions: number;
    post_contradictions: number;
    raw_rate_pct: number;
    raw_ci: string;
    post_rate_pct: number;
    post_ci: string;
    coverage_pct: number;
    abstention_pct: number;
    e09_refusal_pct: number;
  };
}

const BCP_FIELD_LABELS: Record<string, string> = {
  counterparty_type: "Counterparty Type",
  dominant_intent: "Dominant Intent",
  time_horizon: "Time Horizon",
  execution_urgency: "Execution Urgency",
  inventory_impact: "Inventory Impact",
  deception_risk: "Deception Risk",
  counter_strategy: "Counter-Strategy",
};

function renderBadge(badge: string, status: string) {
  if (badge === "OVERRIDDEN" || (status === "SUPPORTED" && badge === "STRESS_PATCHED")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        <ShieldAlert className="h-3 w-3" /> Overridden by Guardrail (&lt;1ms)
      </span>
    );
  }
  if (badge === "ABSTAINED" || status === "UNVERIFIABLE" || status === "DOWNGRADED_TO_UNKNOWN") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
        <AlertTriangle className="h-3 w-3 text-slate-400" /> Prudent Abstention (E08/E09)
      </span>
    );
  }
  if (status === "CONTRADICTION" || badge === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Supported
    </span>
  );
}

export default function QArcTerminalPage() {
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string>("RELIANCE");
  const [activeSec, setActiveSec] = useState<SecurityData | null>(null);
  const [backendMode, setBackendMode] = useState<string>("snapshot");
  const [loadingLive, setLoadingLive] = useState<boolean>(false);
  const [filingsInput, setFilingsInput] = useState<string>("none");
  const [showStressTest, setShowStressTest] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeQty, setTradeQty] = useState<number>(1);
  const [tradeMode, setTradeMode] = useState<"PAPER" | "LIVE_ANGEL">("PAPER");
  const [executingTrade, setExecutingTrade] = useState<boolean>(false);
  const [tradeReceipt, setTradeReceipt] = useState<{
    status: string;
    mode: string;
    order_id?: string;
    symbol?: string;
    side?: string;
    quantity?: number;
    price?: number;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/bcp_analyze")
      .then((res) => res.json())
      .then((data: SnapshotPayload) => {
        setSnapshot(data);
        if (data.securities?.[selectedTicker]) {
          setActiveSec(data.securities[selectedTicker]);
        }
      })
      .catch((err) => setErrorMsg(String(err)));
  }, []);

  const handleSelectTicker = (t: string) => {
    setSelectedTicker(t);
    setErrorMsg(null);
    if (snapshot?.securities?.[t]) {
      setActiveSec(snapshot.securities[t]);
      setBackendMode("snapshot");
    }
  };

  const handleRunLiveAnalyze = async () => {
    setLoadingLive(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/bcp_analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: selectedTicker, filings: filingsInput || "none" }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "API call failed");
      }
      const existingSeries = snapshot?.securities?.[selectedTicker]?.series || activeSec?.series || [];
      const existingHurst = snapshot?.securities?.[selectedTicker]?.hurst_60d ?? activeSec?.hurst_60d ?? 0.5;
      const existingHurstMode =
        snapshot?.securities?.[selectedTicker]?.hurst_routing_mode ?? activeSec?.hurst_routing_mode ?? "RANDOM_WALK";
      const existingFactors =
        snapshot?.securities?.[selectedTicker]?.active_factors ?? {
          factor_1_short_covering: false,
          factor_2_squeeze: false,
          factor_4b_deal_churn: false,
        };

      const merged: SecurityData = {
        ...json.analysis,
        series: json.analysis.series || existingSeries,
        hurst_60d: json.analysis.hurst_60d ?? existingHurst,
        hurst_routing_mode: json.analysis.hurst_routing_mode ?? existingHurstMode,
        active_factors: {
          ...existingFactors,
          factor_4b_deal_churn: Boolean(
            json.analysis?.evidence_ledger?.E03?.description?.includes("FACTOR 4B TRIGGERED")
          ),
        },
        guardrail_stress_test: snapshot?.securities?.[selectedTicker]?.guardrail_stress_test,
      };
      setActiveSec(merged);
      setBackendMode(json.mode || "live_python_backend");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Live endpoint failed");
    } finally {
      setLoadingLive(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!activeSec) return;
    setExecutingTrade(true);
    setTradeReceipt(null);
    const refPrice = activeSec.live_l2_depth?.ltp || activeSec.quant_anchors.kalman.raw_price;
    try {
      const res = await fetch("/api/execute_trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: activeSec.ticker,
          side: tradeSide,
          quantity: tradeQty,
          price: refPrice,
          order_type: "LIMIT",
          mode: tradeMode,
        }),
      });
      const json = await res.json();
      setTradeReceipt(json);
    } catch (err: unknown) {
      setTradeReceipt({
        status: "ERROR",
        mode: tradeMode,
        reason: err instanceof Error ? err.message : "Order failed",
      });
    } finally {
      setExecutingTrade(false);
    }
  };

  if (!snapshot || !activeSec) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090D16] text-slate-300">
        <div className="flex items-center gap-3 text-sm font-mono">
          <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
          Loading Q-ARC Neuro-Symbolic Telemetry...
        </div>
      </div>
    );
  }

  const garch = activeSec.quant_anchors.garch;
  const kalman = activeSec.quant_anchors.kalman;
  const hmm = activeSec.quant_anchors.hmm;
  const mc = activeSec.quant_anchors.monte_carlo;
  const gt = activeSec.guardrail_telemetry;

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100">
      {/* Top Command Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#090D16]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wide text-white">
                  Q-ARC · NEURO-SYMBOLIC COUNTERPARTY TERMINAL
                </h1>
                <span className="rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  FROZEN 70B LoRA + &lt;1ms GUARDRAIL
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                State-Space Econometrics (GARCH · 2D Kalman · 4-State HMM · 10k Monte Carlo) + Immutable E01–E13 Claim Verifier
              </p>
            </div>
          </div>

          {/* Ticker Selector & Live main.py Trigger */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-[#0B1120] p-1">
              {snapshot.tickers.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSelectTicker(t)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs transition ${
                    selectedTicker === t
                      ? "bg-emerald-500/20 font-semibold text-emerald-300 border border-emerald-500/40"
                      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={filingsInput}
              onChange={(e) => setFilingsInput(e.target.value)}
              placeholder="Exchange filing (none or Block deal)"
              className="w-44 rounded-lg border border-slate-800 bg-[#0B1120] px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              title="Simulate NSE Bulk/Block filing text for E08 & Factor 4B verification"
            />

            <button
              onClick={handleRunLiveAnalyze}
              disabled={loadingLive}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/25 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLive ? "animate-spin" : ""}`} />
              {loadingLive ? "Executing main.py..." : "Analyze via main.py"}
            </button>

            <span className="rounded-md border border-slate-800 bg-[#0B1120] px-2 py-1 font-mono text-[10px] text-slate-400">
              {backendMode} · {activeSec.latency_ms}ms
            </span>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="mx-auto mt-3 max-w-[1600px] px-5">
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
            {errorMsg}
          </div>
        </div>
      )}

      {/* Main 3-Pane Terminal Grid */}
      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 px-5 py-5 xl:grid-cols-12">
        {/* LEFT COLUMN (7 cols): Pane 1 + Pane 2 */}
        <div className="space-y-5 xl:col-span-7">
          {/* PANE 1: State-Space Price & Regime Canvas */}
          <StateSpaceChart
            ticker={activeSec.ticker}
            series={activeSec.series}
            currentRegime={hmm.current_regime}
          />

          {/* PANE 2: Quantitative Risk & Microstructure Anchors */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0B1120] p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pane 2 · Quantitative Risk &amp; Microstructure Anchors
                </span>
                <p className="text-xs text-slate-400">
                  Real-time parameters for {activeSec.ticker} as of {activeSec.date} (Strict Causal Window)
                </p>
              </div>
              <span className="font-mono text-xs text-slate-300">
                Close ₹{kalman.raw_price.toLocaleString("en-IN")} | Kalman ₹{kalman.filtered_price.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* GARCH Card */}
              <div className="rounded-lg border border-slate-800 bg-[#0F172A]/70 p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>GARCH(1,1) Vol</span>
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-white">
                  {garch.forecast_annualized_vol_pct.toFixed(1)}%
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Hazard {garch.volatility_hazard_ratio.toFixed(2)}x</span>
                  <span
                    className={`font-mono ${
                      garch.volatility_regime.includes("SHOCK") ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {garch.volatility_regime.replace("_VOLATILITY", "")}
                  </span>
                </div>
              </div>

              {/* Monte Carlo Card */}
              <div className="rounded-lg border border-slate-800 bg-[#0F172A]/70 p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>10k Monte Carlo</span>
                  <BarChart3 className="h-3.5 w-3.5 text-rose-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-white">
                  {mc.cvar_95_expected_shortfall_pct.toFixed(1)}%{" "}
                  <span className="text-xs font-normal text-slate-400">CVaR95</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">VaR95 {mc.var_95_pct.toFixed(1)}%</span>
                  <span className="font-mono text-sky-300">Cap {mc.recommended_max_allocation_cap_pct.toFixed(0)}%</span>
                </div>
              </div>

              {/* 60-Day Hurst Router Card */}
              <div className="rounded-lg border border-slate-800 bg-[#0F172A]/70 p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>60D Rolling Hurst (H)</span>
                  <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-white">
                  {activeSec.hurst_60d.toFixed(3)}
                </div>
                <div className="mt-1 text-[11px] font-mono text-sky-300">
                  {activeSec.hurst_routing_mode}
                </div>
              </div>

              {/* Kalman & HMM Confidence Card */}
              <div className="rounded-lg border border-slate-800 bg-[#0F172A]/70 p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Kalman Vel / HMM Conf</span>
                  <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div
                  className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                    kalman.trend_velocity_pct_per_day >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {kalman.trend_velocity_pct_per_day >= 0 ? "+" : ""}
                  {kalman.trend_velocity_pct_per_day.toFixed(3)}%/d
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{(hmm.confidence * 100).toFixed(1)}% HMM</span>
                  <span className="font-mono">H={hmm.entropy_bits.toFixed(2)}b</span>
                </div>
              </div>
            </div>

            {/* Live Angel One SmartAPI NSE L2 Order Book Depth (E09) */}
            <div className="mt-4 rounded-lg border border-slate-800/80 bg-[#0F172A]/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Live Angel One NSE L2 Order-Book Depth (E09)
                </span>
                {activeSec.live_l2_depth?.available ? (
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                    LIVE STREAM · COVERAGE {gt.evidence_coverage_pct}%
                  </span>
                ) : (
                  <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                    OFFLINE EOD SNAPSHOT
                  </span>
                )}
              </div>
              {activeSec.live_l2_depth?.available ? (
                <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                  <div className="rounded bg-[#090D16]/80 p-2">
                    <div className="text-[10px] text-slate-400">Live NSE LTP</div>
                    <div className="font-bold text-white">
                      ₹{(activeSec.live_l2_depth.ltp ?? 0).toLocaleString("en-IN")}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Bid ₹{activeSec.live_l2_depth.best_bid} / Ask ₹{activeSec.live_l2_depth.best_ask}
                    </div>
                  </div>
                  <div className="rounded bg-[#090D16]/80 p-2">
                    <div className="text-[10px] text-slate-400">5-Lvl Imbalance</div>
                    <div
                      className={`font-bold ${
                        (activeSec.live_l2_depth.l2_imbalance ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(activeSec.live_l2_depth.l2_imbalance ?? 0) >= 0 ? "+" : ""}
                      {((activeSec.live_l2_depth.l2_imbalance ?? 0) * 100).toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {(activeSec.live_l2_depth.top5_bid_qty ?? 0).toLocaleString()} vs{" "}
                      {(activeSec.live_l2_depth.top5_ask_qty ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded bg-[#090D16]/80 p-2">
                    <div className="text-[10px] text-slate-400">TBQ / TSQ Ratio</div>
                    <div className="font-bold text-sky-300">
                      {(activeSec.live_l2_depth.tbq_tsq_ratio ?? 1).toFixed(2)}x
                    </div>
                    <div className="text-[10px] text-slate-500">Full Book Depth</div>
                  </div>
                  <div className="rounded bg-[#090D16]/80 p-2">
                    <div className="text-[10px] text-slate-400">Spoofing / Wall</div>
                    <div
                      className={`font-bold ${
                        activeSec.live_l2_depth.spoofing_anomaly_detected ? "text-amber-300" : "text-emerald-400"
                      }`}
                    >
                      {activeSec.live_l2_depth.spoofing_anomaly_detected ? "ANOMALY" : "STABLE"}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Max Wall {(activeSec.live_l2_depth.wall_to_median_ratio ?? 1).toFixed(2)}x med
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Live SmartAPI depth inactive; deterministic E09 limitation abstention enforced.
                </div>
              )}
            </div>

            {/* Active Microstructure Factor Badges */}
            <div className="mt-4 rounded-lg border border-slate-800/80 bg-[#0F172A]/50 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Empirical Microstructure Factors (15,027 Core + 27,270 Bulk/Block Panel Bars)
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {snapshot.factor_evidence.map((fac) => {
                  const isActive =
                    (fac.id === "Factor 1" && activeSec.active_factors.factor_1_short_covering) ||
                    (fac.id === "Factor 2" && activeSec.active_factors.factor_2_squeeze) ||
                    (fac.id === "Factor 4B" && activeSec.active_factors.factor_4b_deal_churn);
                  return (
                    <div
                      key={fac.id}
                      className={`rounded-md border p-2.5 text-xs ${
                        isActive
                          ? fac.direction === "BEARISH"
                            ? "border-rose-500/50 bg-rose-500/10"
                            : "border-emerald-500/50 bg-emerald-500/10"
                          : "border-slate-800 bg-[#090D16]/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">{fac.id}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            isActive
                              ? "bg-amber-400/20 text-amber-300 font-bold"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {isActive ? "ACTIVE TODAY" : `p=${fac.p_value.toFixed(4)}`}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-300">{fac.name}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">
                        T+5: {fac.t5_mean_pct >= 0 ? "+" : ""}
                        {fac.t5_mean_pct.toFixed(2)}% (t={fac.t_stat >= 0 ? "+" : ""}
                        {fac.t_stat.toFixed(2)}, n={fac.bars})
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Walk-Forward Out-of-Sample Backtest Table */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Walk-Forward OOS Backtest (8 Liquid NSE Equities · Net of 15 bps STT/Slippage + 6.5% T-Bill Sweep)</span>
                <span className="font-mono text-emerald-400">Corporate Action Adjusted</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left font-mono text-xs tabular-nums">
                  <thead className="bg-slate-900/90 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Strategy</th>
                      <th className="px-3 py-2 text-right">Total Ret</th>
                      <th className="px-3 py-2 text-right">Sharpe</th>
                      <th className="px-3 py-2 text-right">Max DD</th>
                      <th className="px-3 py-2 text-right">Win Rate</th>
                      <th className="px-3 py-2 text-right">Active Bars</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {snapshot.backtest_summary.map((row) => {
                      const isQarc = row.strategy.startsWith("Q_ARC");
                      return (
                        <tr key={row.strategy} className={isQarc ? "bg-emerald-500/5" : ""}>
                          <td className={`px-3 py-2 font-medium ${isQarc ? "text-emerald-300" : "text-slate-300"}`}>
                            {row.strategy}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              row.total_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {row.total_return_pct >= 0 ? "+" : ""}
                            {row.total_return_pct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right text-slate-200">{row.sharpe.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{row.max_dd_pct.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right text-slate-300">{row.win_rate_pct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right text-slate-300">{row.active_bars_pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Pane 3 — BCP Dual-Persona Matrix & Claim Verifier Audit */}
        <div className="space-y-5 xl:col-span-5">
          <div className="rounded-xl border border-slate-800/90 bg-[#0B1120] p-4 shadow-lg">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pane 3 · BCP Dual-Persona Matrix &amp; Claim Verifier Audit
                </span>
                <p className="text-xs text-slate-400">
                  Status: <span className="font-semibold text-emerald-400">{gt.verification_status}</span> · Coverage{" "}
                  {gt.evidence_coverage_pct}%
                </p>
              </div>

              {activeSec.guardrail_stress_test && (
                <button
                  onClick={() => setShowStressTest((prev) => !prev)}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition ${
                    showStressTest
                      ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                      : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {showStressTest ? "Viewing: Guardrail Stress-Test" : "Simulate Unconstrained 70B Prior"}
                </button>
              )}
            </div>

            {showStressTest && activeSec.guardrail_stress_test && (
              <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                Counterfactual Guardrail Stress-Test: Unconstrained bullish LoRA prior yielded{" "}
                <strong>{activeSec.guardrail_stress_test.unconstrained_prior_contradictions} contradictions</strong>{" "}
                on {activeSec.ticker}; &lt;1ms Deterministic Verifier Override reduced contradictions to{" "}
                <strong>{activeSec.guardrail_stress_test.post_guardrail_contradictions}</strong>.
              </div>
            )}

            <div className="space-y-2.5">
              {Object.entries(BCP_FIELD_LABELS).map(([key, label]) => {
                const liveField = gt.field_badges[key];
                const stressField = activeSec.guardrail_stress_test?.field_diffs?.[key];
                const f = showStressTest && stressField ? stressField : liveField;
                if (!f) return null;

                const isStressOverridden =
                  showStressTest && stressField && stressField.raw !== stressField.verified && stressField.status === "SUPPORTED";
                const badgeKey = isStressOverridden ? "OVERRIDDEN" : liveField?.badge || "SUPPORTED";

                return (
                  <div
                    key={key}
                    className="rounded-lg border border-slate-800/90 bg-[#0F172A]/70 p-3 transition hover:border-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200">{label}</span>
                      {renderBadge(badgeKey, f.status)}
                    </div>

                    <div className="mt-1.5 font-mono text-xs text-white">{f.verified}</div>

                    {f.raw && f.raw !== f.verified && (
                      <div className="mt-1 rounded bg-slate-900/90 px-2 py-1 font-mono text-[11px] text-amber-300/90">
                        Raw LLM Prior: <span className="line-through opacity-75">{f.raw}</span>
                      </div>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span>{f.notes}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                        [{f.cites?.join(", ") || "NONE"}]
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Execution Bridge (PAPER | LIVE_ANGEL Safety Switch) */}
            <div className="mt-4 rounded-lg border border-slate-800 bg-[#0F172A]/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Execution Bridge (POST /api/execute_trade)
                </span>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    tradeMode === "LIVE_ANGEL"
                      ? "border border-rose-500/50 bg-rose-500/20 text-rose-300"
                      : "border border-sky-500/40 bg-sky-500/15 text-sky-300"
                  }`}
                >
                  {tradeMode === "LIVE_ANGEL" ? "LIVE BROKER ARMED" : "PAPER SIMULATOR SAFE"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <select
                  value={tradeSide}
                  onChange={(e) => setTradeSide(e.target.value === "SELL" ? "SELL" : "BUY")}
                  className="rounded border border-slate-700 bg-[#090D16] px-2 py-1.5 text-slate-200"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={tradeQty}
                  onChange={(e) => setTradeQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 rounded border border-slate-700 bg-[#090D16] px-2 py-1.5 text-slate-200"
                  title="Order Quantity"
                />
                <select
                  value={tradeMode}
                  onChange={(e) => setTradeMode(e.target.value === "LIVE_ANGEL" ? "LIVE_ANGEL" : "PAPER")}
                  className="rounded border border-slate-700 bg-[#090D16] px-2 py-1.5 text-slate-200"
                >
                  <option value="PAPER">PAPER (Default Safe)</option>
                  <option value="LIVE_ANGEL">LIVE_ANGEL (placeOrder)</option>
                </select>
                <button
                  onClick={handleExecuteTrade}
                  disabled={executingTrade}
                  className={`ml-auto rounded px-3 py-1.5 font-semibold transition disabled:opacity-50 ${
                    tradeMode === "LIVE_ANGEL"
                      ? "bg-rose-600 text-white hover:bg-rose-500"
                      : "bg-emerald-600 text-white hover:bg-emerald-500"
                  }`}
                >
                  {executingTrade ? "Dispatching..." : `Execute ${tradeSide} (${tradeMode})`}
                </button>
              </div>
              {tradeReceipt && (
                <div className="mt-2 rounded border border-slate-800 bg-[#090D16] px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                  Status: <span className="font-semibold text-emerald-400">{tradeReceipt.status}</span>
                  {tradeReceipt.order_id ? ` | Order ID: ${tradeReceipt.order_id}` : ""}
                  {tradeReceipt.reason ? ` | ${tradeReceipt.reason}` : ""}
                </div>
              )}
            </div>

            {/* N=30 Stratified OOS Reliability Summary */}
            <div className="mt-4 rounded-lg border border-slate-800 bg-[#0F172A]/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Stratified OOS Epistemic Reliability Audit (N={snapshot.reliability_audit.n_trials}, {snapshot.reliability_audit.n_fields} Fields)
                </span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {snapshot.reliability_audit.n_tickers} NSE Tickers
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                <div className="rounded bg-[#090D16] p-2">
                  <div className="text-[10px] text-slate-400">Raw LLM Contra</div>
                  <div className="font-bold text-rose-400">{snapshot.reliability_audit.raw_rate_pct}%</div>
                  <div className="text-[10px] text-slate-500">{snapshot.reliability_audit.raw_ci}</div>
                </div>
                <div className="rounded bg-[#090D16] p-2">
                  <div className="text-[10px] text-slate-400">Post-Guardrail</div>
                  <div className="font-bold text-emerald-400">{snapshot.reliability_audit.post_rate_pct.toFixed(1)}%</div>
                  <div className="text-[10px] text-slate-500">{snapshot.reliability_audit.post_ci}</div>
                </div>
                <div className="rounded bg-[#090D16] p-2">
                  <div className="text-[10px] text-slate-400">Coverage</div>
                  <div className="font-bold text-sky-300">{snapshot.reliability_audit.coverage_pct}%</div>
                  <div className="text-[10px] text-slate-500">139 / 210 fields</div>
                </div>
                <div className="rounded bg-[#090D16] p-2">
                  <div className="text-[10px] text-slate-400">E09 Refusal</div>
                  <div className="font-bold text-slate-200">{snapshot.reliability_audit.e09_refusal_pct.toFixed(0)}%</div>
                  <div className="text-[10px] text-slate-500">30 / 30 trials</div>
                </div>
              </div>
            </div>

            {/* E01-E13 Immutable Evidence Ledger */}
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <Database className="h-3.5 w-3.5 text-sky-400" />
                Immutable Evidence Ledger (E01–E13)
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {Object.entries(activeSec.evidence_ledger).map(([code, item]) => (
                  <div
                    key={code}
                    className={`rounded border px-2.5 py-1.5 text-[11px] ${
                      item.is_limitation
                        ? "border-slate-700 bg-slate-900/90 text-slate-400"
                        : item.description.includes("FACTOR 4B")
                        ? "border-rose-500/50 bg-rose-500/10 text-rose-200"
                        : "border-slate-800/80 bg-[#090D16]/70 text-slate-300"
                    }`}
                  >
                    <span className="mr-2 font-mono font-bold text-sky-400">{code}</span>
                    <span className="mr-1.5 font-semibold text-slate-200">{item.metric}:</span>
                    <span>{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
