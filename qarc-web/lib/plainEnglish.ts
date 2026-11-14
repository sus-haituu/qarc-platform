import type {
  PortfolioAllocationItem,
  PortfolioResponse,
  PriceForecast,
  SecurityData,
} from "@/lib/qarcApi";

export interface KpiPlainEnglish {
  tickerDate: string;
  kalman: string;
  hmm: string;
  garch: string;
  monteCarlo: string;
  verifier: string;
}

export interface ForecastView {
  expected5dPct: number | null;
  medianOrT5Price: number | null;
  bearPrice: number | null;
  bullPrice: number | null;
  t1Price: number | null;
  t1ReturnPct: number | null;
  probUpPct: number | null;
  probDownPct: number | null;
  bias: string;
  sourceLabel: string;
  primaryDrivers: string[];
}

export interface SummaryBullet {
  label: string;
  tone: "volt" | "signal" | "neutral";
  text: string;
}

export interface EvidencePlainEnglish {
  tooltip: string;
  whyItMatters: string;
}

export interface BcpFieldPlainEnglish {
  conceptTooltip: string;
  plainNote: string;
}

export interface AllocationPlainEnglish {
  amountInr: number;
  priceInr: number;
  t5RetPct: number;
  whyPickedOrCapped: string;
  keyRiskNote: string;
}

function humanizeVolRegime(regime: string): string {
  const u = (regime || "").toUpperCase();
  if (u.includes("EXTREME") || u.includes("CRISIS")) return "Extreme";
  if (u.includes("HIGH") || u.includes("ELEVATED")) return "Elevated";
  if (u.includes("LOW") || u.includes("CALM")) return "Calm";
  if (u.includes("NORMAL")) return "Normal";
  return regime ? regime.replace(/_/g, " ").toLowerCase() : "Normal";
}

function describeHmmPhase(regime: string): string {
  const u = (regime || "").toUpperCase();
  if (u.includes("MARKDOWN")) return "selling/downtrend phase — caution on longs";
  if (u.includes("MARKUP")) return "uptrend phase — buyers in control";
  if (u.includes("ACCUMULATION")) return "quiet base-building phase — institutions absorbing supply";
  if (u.includes("DISTRIBUTION")) return "topping/distribution phase — supply being sold into strength";
  return "balanced sideways phase";
}

export function extractForecastView(pf?: PriceForecast | null): ForecastView | null {
  if (!pf) return null;
  const expected5dPct =
    pf.t5_expected_return_pct ?? pf.expected_5d_return_pct ?? pf.q50_ret_pct ?? null;
  const medianOrT5Price = pf.t5_expected_price ?? pf.q50_price ?? null;
  const bearPrice = pf.t5_lower_95 ?? pf.q10_price ?? null;
  const bullPrice = pf.t5_upper_95 ?? pf.q90_price ?? null;
  const t1Price = pf.t1_expected_price ?? null;
  const t1ReturnPct = pf.t1_expected_return_pct ?? null;
  const probUpPct = pf.prob_up_pct ?? null;
  const probDownPct = pf.prob_down_pct ?? (probUpPct !== null ? Math.max(0, 100 - probUpPct) : null);
  const bias = pf.directional_bias || pf.direction_label || "NEUTRAL";
  const sourceLabel =
    pf.forecast_source ||
    (pf.t5_expected_price !== undefined ? "E14 CAUSAL DRIFT MODEL" : "LIVE API");
  return {
    expected5dPct,
    medianOrT5Price,
    bearPrice,
    bullPrice,
    t1Price,
    t1ReturnPct,
    probUpPct,
    probDownPct,
    bias,
    sourceLabel,
    primaryDrivers: pf.primary_drivers || [],
  };
}

export function buildKpiPlainEnglish(sec: SecurityData): KpiPlainEnglish {
  const { kalman, hmm, garch, monte_carlo: mc } = sec.quant_anchors;
  const guardrail = sec.guardrail_telemetry;

  // 1. Ticker / Spot vs Kalman Fair Value
  const rawP = Number(kalman.raw_price || 0);
  const filtP = Number(kalman.filtered_price || 0);
  const gap = rawP - filtP;
  let tickerDate = "Spot price and trend baseline loaded.";
  if (filtP > 0) {
    if (gap < -0.5) {
      tickerDate = `Trading ₹${Math.abs(gap).toFixed(2)} below denoised fair trend (₹${filtP.toFixed(2)})`;
    } else if (gap > 0.5) {
      tickerDate = `Trading ₹${Math.abs(gap).toFixed(2)} above denoised fair trend (₹${filtP.toFixed(2)})`;
    } else {
      tickerDate = `Spot tracks denoised fair trend (₹${filtP.toFixed(2)})`;
    }
  }

  // 2. Kalman Velocity
  const vel = Number(kalman.trend_velocity_pct_per_day || 0);
  const velSign = vel >= 0 ? "+" : "";
  let kalmanText: string;
  if (vel > 0.15) {
    kalmanText = `Trend is accelerating up (${velSign}${vel.toFixed(3)}%/day) despite short-term noise`;
  } else if (vel > 0.02) {
    kalmanText = `Trend is drifting higher (${velSign}${vel.toFixed(3)}%/day) after filtering market noise`;
  } else if (vel < -0.15) {
    kalmanText = `Trend is dropping (${velSign}${vel.toFixed(3)}%/day) after filtering short-term noise`;
  } else if (vel < -0.02) {
    kalmanText = `Trend is slowing/down (${velSign}${vel.toFixed(3)}%/day) after filtering short-term noise`;
  } else {
    kalmanText = `Trend is nearly flat (${velSign}${vel.toFixed(3)}%/day) with balanced drift`;
  }

  // 3. HMM Regime
  const confPct = Math.round(Number(hmm.confidence || 0) * 100);
  const hmmText = `${hmm.current_regime} = ${describeHmmPhase(hmm.current_regime)} (${confPct}% model confidence).`;

  // 4. GARCH(1,1) Vol
  const annVol = Number(garch.forecast_annualized_vol_pct || 0);
  const dailyVol = Number(garch.forecast_daily_vol_pct ?? annVol / Math.sqrt(252));
  const volLabel = humanizeVolRegime(garch.volatility_regime);
  const garchText = `Expected annual price swing (~${annVol.toFixed(1)}% — ${volLabel}, ~±${dailyVol.toFixed(2)}%/day).`;

  // 5. Monte Carlo CVaR & Position Cap
  const cvar = Number(mc.cvar_95_expected_shortfall_pct || 0);
  const cap = Number(mc.recommended_max_allocation_cap_pct || 0);
  const mcText = `Worst-case tail loss estimate (${cvar.toFixed(2)}% in bottom 5% scenarios); suggested max position size: ${cap.toFixed(1)}% of capital.`;

  // 6. Claim Verifier
  const cov = Number(guardrail.evidence_coverage_pct || 0);
  const postContra = Number(guardrail.post_guardrail_contradictions || 0);
  const rawContra = Number(guardrail.raw_contradictions || 0);
  const verifierText =
    rawContra > 0 && postContra === 0
      ? `${cov.toFixed(0)}% of AI claims checked against math/data with 0 contradictions (${rawContra} draft error auto-fixed).`
      : `${cov.toFixed(0)}% of AI claims checked against math/data with ${postContra} contradiction${postContra === 1 ? "" : "s"}.`;

  return {
    tickerDate,
    kalman: kalmanText,
    hmm: hmmText,
    garch: garchText,
    monteCarlo: mcText,
    verifier: verifierText,
  };
}

export function buildInvestorSummaryBullets(sec: SecurityData): SummaryBullet[] {
  const { hmm, kalman, monte_carlo: mc, garch } = sec.quant_anchors;
  const vel = Number(kalman.trend_velocity_pct_per_day || 0);
  const confPct = Math.round(Number(hmm.confidence || 0) * 100);
  const regimeUpper = (hmm.current_regime || "").toUpperCase();

  // Bullet 1: Regime vs Kalman trend alignment
  let b1Tone: SummaryBullet["tone"] = "neutral";
  let b1Text: string;
  if (regimeUpper.includes("MARKDOWN") && vel > 0.05) {
    b1Tone = "signal";
    b1Text = `Broad regime is Markdown (${describeHmmPhase(hmm.current_regime)}, ${confPct}% confidence), even though the short-term Kalman slope is bouncing (+${vel.toFixed(3)}%/day) — treat rallies cautiously until phase shifts.`;
  } else if (regimeUpper.includes("MARKDOWN")) {
    b1Tone = "signal";
    b1Text = `Stock is in a Markdown phase (${confPct}% confidence) with negative/weak trend drift (${vel >= 0 ? "+" : ""}${vel.toFixed(3)}%/day) — capital preservation takes priority over aggressive buying.`;
  } else if (regimeUpper.includes("DISTRIBUTION")) {
    b1Tone = "signal";
    b1Text = `Regime shows Distribution (${confPct}% confidence) alongside ${vel >= 0 ? "+" : ""}${vel.toFixed(3)}%/day slope — large holders may be unloading into strength; avoid chasing breakouts.`;
  } else if ((regimeUpper.includes("MARKUP") || regimeUpper.includes("ACCUMULATION")) && vel > 0.02) {
    b1Tone = "volt";
    b1Text = `Regime is ${hmm.current_regime} (${confPct}% confidence) and Kalman trend is rising (+${vel.toFixed(3)}%/day) — trend and regime align constructively.`;
  } else {
    b1Text = `Regime is ${hmm.current_regime} (${confPct}% confidence, persistence ${Math.round(hmm.persistence * 100)}%) with trend drift of ${vel >= 0 ? "+" : ""}${vel.toFixed(3)}%/day.`;
  }

  // Bullet 2: E09 Order book / Spoofing / Delivery footprint
  const l2 = sec.live_l2_depth;
  let b2Tone: SummaryBullet["tone"] = "neutral";
  let b2Text: string;
  if (l2?.available) {
    const wall = Number(l2.wall_to_median_ratio ?? 1);
    const imbPct = Number(l2.l2_imbalance ?? 0) * 100;
    const tbqTsq = Number(l2.tbq_tsq_ratio ?? 1);
    const sideWord = imbPct >= 0 ? "buy-side" : "sell-side";
    if (l2.spoofing_anomaly_detected) {
      b2Tone = "signal";
      b2Text = `Order book shows heavy ${sideWord} walls (${wall.toFixed(2)}x median, top-5 imbalance ${imbPct >= 0 ? "+" : ""}${imbPct.toFixed(1)}%, full-depth TBQ/TSQ ${tbqTsq.toFixed(2)}x) with spoofing risk — avoid chasing; wait for absorption.`;
    } else {
      b2Tone = "volt";
      b2Text = `Live L2 order book looks orderly (max wall ${wall.toFixed(2)}x median, top-5 imbalance ${imbPct >= 0 ? "+" : ""}${imbPct.toFixed(1)}%, TBQ/TSQ ${tbqTsq.toFixed(2)}x) with no spoofing wall anomaly.`;
    }
  } else {
    const e03 = sec.evidence_ledger?.E03?.description;
    const e04 = sec.evidence_ledger?.E04?.description;
    b2Text = `Live L2 order-book depth is unavailable; exchange footprint shows ${e03 ? e03 : "daily delivery stats"}${e04 ? ` and ${e04}` : ""}.`;
  }

  // Bullet 3: E13 Tail Risk & Cap + GARCH context
  const cvar = Number(mc.cvar_95_expected_shortfall_pct || 0);
  const stopProb = Number(mc.prob_stop_breach_pct || 0);
  const cap = Number(mc.recommended_max_allocation_cap_pct || 0);
  const annVol = Number(garch.forecast_annualized_vol_pct || 0);
  const riskLabel = (mc.risk_assessment || "").replace(/_/g, " ").toLowerCase();
  const b3Tone: SummaryBullet["tone"] =
    Math.abs(cvar) >= 8 || stopProb >= 40 ? "signal" : "neutral";
  const b3Text = `In the worst 5% of 10,000 Monte Carlo 10-day paths, average loss is ${cvar.toFixed(2)}% with a ${stopProb.toFixed(1)}% chance of breaching a -3% stop (${annVol.toFixed(1)}% annualized vol, ${riskLabel}); limit any position to <= ${cap.toFixed(1)}% of capital.`;

  // Bullet 4: E14 Forecast + Verified Counter-Strategy
  const fv = extractForecastView(sec.price_forecast);
  const strat = sec.verified_bcp_profile?.counter_strategy;
  let b4Tone: SummaryBullet["tone"] = "neutral";
  let b4Text: string;
  if (fv && fv.expected5dPct !== null) {
    const sign = fv.expected5dPct >= 0 ? "+" : "";
    const probPart =
      fv.probUpPct !== null ? ` (${fv.probUpPct.toFixed(1)}% probability of closing higher)` : "";
    const pricePart =
      fv.medianOrT5Price !== null ? ` toward ₹${fv.medianOrT5Price.toFixed(2)}` : "";
    b4Tone = fv.bias === "BULLISH" ? "volt" : fv.bias === "BEARISH" ? "signal" : "neutral";
    b4Text = `5-day causal model projects ${sign}${fv.expected5dPct.toFixed(2)}%${pricePart}${probPart} [${fv.bias}].${strat ? ` Verified playbook: ${strat}.` : ""}`;
  } else {
    const mcMedRet = mc.simulated_median_return_pct;
    const mcMedP = mc.simulated_median_price;
    if (mcMedRet !== undefined && mcMedP !== undefined) {
      b4Tone = mcMedRet >= 0 ? "volt" : "signal";
      b4Text = `Live E14 5-day quantile model requires "Run Live Analyze"; 10-day Monte Carlo median path points to ${mcMedRet >= 0 ? "+" : ""}${mcMedRet.toFixed(2)}% (₹${mcMedP.toFixed(2)}).${strat ? ` Verified playbook: ${strat}.` : ""}`;
    } else {
      b4Text = `${strat ? `Verified playbook: ${strat}. ` : ""}Click "Run Live Analyze" to compute causal 5-day E14 price targets.`;
    }
  }

  return [
    { label: "REGIME & TREND", tone: b1Tone, text: b1Text },
    { label: "ORDER BOOK & FLOW", tone: b2Tone, text: b2Text },
    { label: "DOWNSIDE & SIZING", tone: b3Tone, text: b3Text },
    { label: "OUTLOOK & PLAN", tone: b4Tone, text: b4Text },
  ];
}

const EVIDENCE_EXPLANATIONS: Record<string, EvidencePlainEnglish> = {
  E01: {
    tooltip:
      "Daily Return measures how much the stock gained or lost vs the previous trading day's close.",
    whyItMatters:
      "Shows immediate session direction; judge it alongside volume (E04) and delivery % (E03) to see if the move has real backing.",
  },
  E02: {
    tooltip:
      "VWAP (Volume-Weighted Average Price) is the average price traded per share during the day. Positive deviation means close > VWAP.",
    whyItMatters:
      "Closing above VWAP means the average buyer ended the day in profit; far above VWAP can invite short-term profit booking.",
  },
  E03: {
    tooltip:
      "Delivery Percentage is the share of volume settled into demat accounts rather than squared off intraday.",
    whyItMatters:
      "Above 55% implies long-term positional transfer; below 35% implies intraday speculation (or exhaustion churn if paired with heavy block deals).",
  },
  E04: {
    tooltip:
      "Compares today's traded volume to the 30-day average (ratio) and normalizes it by standard deviations (Z-score).",
    whyItMatters:
      "Moves on >= 1.5x volume carry institutional participation; sub-1.0x volume means conviction is light.",
  },
  E05: {
    tooltip:
      "Amihud Illiquidity estimates price slippage per rupee traded; ATR(14) is the average daily rupee high-low range over 14 sessions.",
    whyItMatters:
      "Low Amihud confirms deep liquidity for clean fills; ATR(14) tells you how wide normal daily swings are so stops aren't placed too tight.",
  },
  E06: {
    tooltip:
      "Hidden Markov Model (HMM) statistical market phase fitted on historical returns and volatility without future look-ahead.",
    whyItMatters:
      "Markup/Accumulation favor holding winners; Markdown/Distribution carry heightened drawdown risk.",
  },
  E07: {
    tooltip:
      "RSI (14) measures 14-day upside vs downside momentum on a 0–100 scale (>70 overbought, <30 oversold, 30–70 neutral).",
    whyItMatters:
      "Readings above 70 warn that short-term buying is stretched and prone to a pause or pullback; below 30 signals stretched selling.",
  },
  E08: {
    tooltip:
      "Official NSE Bulk/Block filings (>0.5% equity) plus date-filtered semantic news catalysts retrieved from Neon pgvector RAG.",
    whyItMatters:
      "Prevents inventing institutional buyers when no exchange disclosure or dated catalyst exists below the reporting threshold.",
  },
  E09: {
    tooltip:
      "Live 5-level Bid/Ask order book from Angel One: Imbalance compares top-5 bid vs ask shares, TBQ/TSQ compares full-market buy vs sell orders, Wall Ratio flags oversized resting orders.",
    whyItMatters:
      "A giant resting bid wall (>4.5x median) alongside weak total buyers (TBQ/TSQ < 0.5x) often signals spoofing — artificial support designed to lure buyers.",
  },
  E10: {
    tooltip:
      "GARCH(1,1) forecasts upcoming annualized price swing %, Persistence (0–1) shows how sticky volatility clusters are, and Hazard Ratio compares current vs long-run vol.",
    whyItMatters:
      "Elevated volatility or Hazard Ratio > 1.2x calls for smaller position sizes and wider stop distances.",
  },
  E11: {
    tooltip:
      "Kalman Filter strips out random daily bid-ask noise (microstructure noise ₹) to reveal the smooth underlying daily drift (%/day).",
    whyItMatters:
      "Helps you see whether the core multi-day trend is speeding up or stalling beneath noisy daily candles.",
  },
  E12: {
    tooltip:
      "Shows calibrated probability weights across all 4 market phases (Markdown, Markup, Distribution, Accumulation) and state persistence %.",
    whyItMatters:
      "High persistence (>80%) means the current market phase tends to stick; split probabilities signal regime transition risk.",
  },
  E13: {
    tooltip:
      "10,000 simulated 10-day paths: VaR(95%) is the 1-in-20 loss cutoff, CVaR(95%) is the average loss inside that worst 5% tail, and Max Cap limits capital exposure.",
    whyItMatters:
      "Anchors position sizing to worst-case tail scenarios and actual stop-breach odds rather than best-case hopes.",
  },
  E14: {
    tooltip:
      "Strictly causal 1-day and 5-day expected return & price range built from validated empirical factor drifts, Kalman slope, HMM bias, GARCH width, and live L2 tilt.",
    whyItMatters:
      "Quantifies realistic Bear/Median/Bull bands and win probability P(Up) instead of relying on an uncalibrated price target.",
  },
  E15: {
    tooltip:
      "Searches Neon pgvector for past NSE bars matching today's 8-dimensional state (return, trend, vol, Hurst, delivery, RSI, regime) using cosine similarity.",
    whyItMatters:
      "Shows what actually happened 5 days later during the closest historical analogs before today's date.",
  },
};

export function getEvidencePlainEnglish(
  code: string,
  item?: { metric?: string; is_limitation?: boolean }
): EvidencePlainEnglish {
  if (EVIDENCE_EXPLANATIONS[code]) {
    return EVIDENCE_EXPLANATIONS[code];
  }
  return {
    tooltip: item?.is_limitation
      ? "Explicit data-boundary declaration where live telemetry was unavailable."
      : `Exchange or statistical telemetry for ${item?.metric || code}.`,
    whyItMatters: item?.is_limitation
      ? "Marks missing telemetry so the AI never guesses unverified order-book or filing facts."
      : "Provides an immutable numeric anchor checked by ClaimVerifier before finalizing signals.",
  };
}

const BCP_FIELD_META: Record<
  string,
  { conceptTooltip: string; interpret: (val: string) => string }
> = {
  counterparty_type: {
    conceptTooltip:
      "Identifies who appears to be driving today's volume based ONLY on exchange block/bulk disclosures (E08).",
    interpret: (v) =>
      v.toUpperCase().includes("UNKNOWN")
        ? "No >0.5% exchange block filing today — buyer/seller identity cannot be confirmed."
        : "Large participant footprint verified against exchange filing records.",
  },
  dominant_intent: {
    conceptTooltip:
      "Summarizes whether net order flow shows accumulation, distribution, covering, or two-sided market making.",
    interpret: (v) => {
      const u = v.toUpperCase();
      if (u.includes("TWO-SIDED")) return "Balanced buying & selling liquidity; no clean directional sweep.";
      if (u.includes("ACCUMULAT")) return "Steadier buyer absorption relative to recent turnover.";
      if (u.includes("DISTRIB") || u.includes("SELL") || u.includes("BEAR"))
        return "Supply pressure outweighs sustained buyer follow-through.";
      if (u.includes("EXHAUSTION") || u.includes("CHURN"))
        return "High-turnover churn with elevated post-spike pullback risk.";
      return "Interpreted strictly against E01–E14 numeric anchors.";
    },
  },
  time_horizon: {
    conceptTooltip:
      "Estimates whether volume reflects short-term intraday flipping or multi-day positional holding (from Delivery % and Hurst).",
    interpret: (v) =>
      v.toUpperCase().includes("POSITIONAL")
        ? "Elevated delivery suggests multi-day investors are holding shares overnight."
        : v.toUpperCase().includes("INTRADAY")
        ? "Low delivery points to same-day traders turning inventory quickly."
        : "Holding horizon estimated from delivery share and trend persistence.",
  },
  execution_urgency: {
    conceptTooltip:
      "Measures how aggressively buyers or sellers are crossing the spread based on VWAP gap, volume Z-score, and volatility.",
    interpret: (v) => {
      const u = v.toUpperCase();
      if (u.includes("HIGH")) return "Elevated activity/spread aggression — expect sharper intraday swings.";
      if (u.includes("LOW")) return "Quiet, patient execution with low immediacy pressure.";
      return "Moderate execution pace without panic chasing.";
    },
  },
  inventory_impact: {
    conceptTooltip:
      "Reflects price slippage and adverse-selection risk when filling orders against current depth and Amihud liquidity.",
    interpret: (v) =>
      v.toUpperCase().includes("ADVERSE")
        ? "Market makers face elevated risk of getting run over; avoid market orders on spikes."
        : "Normal liquidity absorption cost for typical position sizes.",
  },
  deception_risk: {
    conceptTooltip:
      "Flags whether live L2 depth detects oversized resting walls/spoofing or explicitly abstains when L2 is offline.",
    interpret: (v) => {
      const u = v.toUpperCase();
      if (u.includes("SPOOF") || u.includes("HIGH") || u.includes("ELEVATED") || u.includes("DETECTED"))
        return "Oversized resting bid/ask wall detected — limit orders could vanish before fill.";
      if (u.includes("UNVERIFIABLE"))
        return "Cannot inspect spoofing risk because live Angel One L2 feed was inactive here.";
      return "No abnormal order-book wall asymmetry detected.";
    },
  },
  counter_strategy: {
    conceptTooltip:
      "Actionable execution rule verified against HMM regime, Factor 4B exhaustion, L2 walls, and E14 5D bias.",
    interpret: (v) => {
      const u = v.toUpperCase();
      if (u.includes("STEP-ASIDE") || u.includes("AVOID") || u.includes("WAIT"))
        return "Patience favored: avoid market-buying into noise or unabsorbed supply.";
      if (u.includes("ACCUMULAT") || u.includes("BUY"))
        return "Constructive setup — scale carefully using limit orders and risk-gate stops.";
      return "Follow verified discipline rules; obey pre-trade risk gate limits.";
    },
  },
};

export function getBcpFieldPlainEnglish(key: string, verifiedVal: string): BcpFieldPlainEnglish {
  const meta = BCP_FIELD_META[key];
  if (!meta) {
    return {
      conceptTooltip: "Verified behavioral counterparty assessment checked against E01–E15.",
      plainNote: verifiedVal,
    };
  }
  return {
    conceptTooltip: meta.conceptTooltip,
    plainNote: meta.interpret(verifiedVal || ""),
  };
}

const PROFILE_META: Record<
  string,
  { label: string; defaultMaxSingle: number; defaultMaxEquity: number; explanation: string }
> = {
  CONSERVATIVE: {
    label: "Conservative Capital Shield",
    defaultMaxSingle: 15,
    defaultMaxEquity: 50,
    explanation:
      "Limits each stock to 15% and keeps at least 50% in LIQUIDBEES cash sweep to cushion drawdowns.",
  },
  SNIPER_DEFENSIVE: {
    label: "Sniper Defensive",
    defaultMaxSingle: 20,
    defaultMaxEquity: 60,
    explanation:
      "Caps single-stock exposure at 20% and deploys up to 60% into top-ranked setups, parking the remainder in LIQUIDBEES.",
  },
  BALANCED_CORE: {
    label: "Balanced Core",
    defaultMaxSingle: 25,
    defaultMaxEquity: 85,
    explanation:
      "Allows up to 25% per high-conviction stock and up to 85% total equity exposure while sweeping idle cash into LIQUIDBEES.",
  },
  AGGRESSIVE_ALPHA: {
    label: "Aggressive Alpha",
    defaultMaxSingle: 30,
    defaultMaxEquity: 95,
    explanation:
      "Concentrates up to 30% per stock and up to 95% total equity into eligible bullish setups, retaining a small cash buffer.",
  },
};

export function buildPortfolioStrategySummary(pf: PortfolioResponse): string {
  const profile = PROFILE_META[pf.risk_profile] || {
    label: pf.risk_profile,
    defaultMaxSingle: 25,
    defaultMaxEquity: 85,
    explanation: "Sizes eligible stocks proportionally to conviction divided by tail risk.",
  };
  const maxSingle = pf.max_single_weight_pct ?? profile.defaultMaxSingle;
  const maxEquity = pf.max_equity_weight_pct ?? profile.defaultMaxEquity;
  const deployed =
    pf.total_equity_inr ??
    pf.allocations.reduce((acc, a) => acc + (a.allocated_inr ?? a.allocation_inr ?? 0), 0);
  const deployedPct =
    pf.total_equity_weight_pct ?? (pf.capital_inr > 0 ? (deployed / pf.capital_inr) * 100 : 0);
  const cashPct =
    pf.cash_sweep_weight_pct ??
    (pf.capital_inr > 0 ? (pf.cash_sweep_inr / pf.capital_inr) * 100 : 0);
  const quarantinedCount = pf.quarantined_avoid?.length ?? 0;

  return (
    `${profile.label} (${maxSingle}% max/stock, ${maxEquity}% max equity) allocates ₹${deployed.toLocaleString("en-IN")} (${deployedPct.toFixed(1)}%) across ${pf.allocations.length} eligible stock${pf.allocations.length === 1 ? "" : "s"} sized by Conviction ÷ Tail Risk (CVaR95). ` +
    `The unallocated ₹${pf.cash_sweep_inr.toLocaleString("en-IN")} (${cashPct.toFixed(1)}%) sits safely in ${pf.cash_sweep_instrument || "LIQUIDBEES"} (~${pf.cash_sweep_annual_yield_pct ?? 6.5}% p.a.).` +
    (quarantinedCount > 0
      ? ` ${quarantinedCount} watchlist stock${quarantinedCount === 1 ? " was" : "s were"} quarantined (₹0) due to Markdown/Factor 4B risk.`
      : "")
  );
}

export function buildAllocationPlainEnglish(
  alloc: PortfolioAllocationItem,
  pf: PortfolioResponse
): AllocationPlainEnglish {
  const amountInr = Number(alloc.allocated_inr ?? alloc.allocation_inr ?? 0);
  const priceInr = Number(alloc.current_price ?? alloc.ltp ?? 0);
  const t5RetPct = Number(alloc.t5_expected_return_pct ?? alloc.expected_5d_return_pct ?? 0);
  const maxSingle =
    pf.max_single_weight_pct ?? PROFILE_META[pf.risk_profile]?.defaultMaxSingle ?? 25;
  const targetW = Number(alloc.target_weight_pct ?? alloc.weight_pct ?? 0);
  const hitCap = targetW >= maxSingle - 0.15;

  const regimePart = alloc.hmm_state ? `${alloc.hmm_state} regime` : "eligible trend";
  const driftPart = `${t5RetPct >= 0 ? "+" : ""}${t5RetPct.toFixed(2)}% expected 5D drift`;
  const scorePart =
    alloc.conviction_score !== undefined ? `conviction ${alloc.conviction_score.toFixed(1)}/100` : "";
  const capPart = hitCap
    ? `position capped at the ${maxSingle}% single-stock ceiling`
    : `sized proportionally by inverse CVaR95 tail risk (rounded down to whole shares)`;

  const whyPickedOrCapped = `Picked for ${regimePart} (${driftPart}${scorePart ? `, ${scorePart}` : ""}); ${capPart}.`;

  const cvar = alloc.cvar_95_pct;
  const stop = alloc.stop_loss_price;
  const tgt = alloc.target_price;
  const riskBits: string[] = [];
  if (cvar !== undefined) {
    riskBits.push(`Worst 5% 10D tail loss (CVaR95): ${cvar.toFixed(2)}%`);
  }
  if (alloc.garch_daily_vol_pct !== undefined) {
    riskBits.push(`typical daily swing ±${alloc.garch_daily_vol_pct.toFixed(2)}%`);
  }
  if (stop !== undefined && stop > 0) {
    riskBits.push(`suggested stop ₹${stop.toFixed(2)}`);
  }
  if (tgt !== undefined && tgt > 0) {
    riskBits.push(`5D target ₹${tgt.toFixed(2)}`);
  }
  const keyRiskNote =
    riskBits.length > 0
      ? riskBits.join(" · ") + "."
      : "Monitor daily E13 CVaR bounds and ClaimVerifier status before scaling.";

  return {
    amountInr,
    priceInr,
    t5RetPct,
    whyPickedOrCapped,
    keyRiskNote,
  };
}
