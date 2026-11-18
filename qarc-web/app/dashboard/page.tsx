"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Cpu,
  Database,
  HelpCircle,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  PieChart,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import StateSpaceChart, { type SeriesPoint } from "@/components/StateSpaceChart";
import NseStockSearch from "@/components/NseStockSearch";
import StockLogo from "@/components/StockLogo";
import {
  DeliveryVolumeMicrostructureSvg,
  KalmanNoiseOscillatorSvg,
  MonteCarloTailDensitySvg,
  PortfolioDonutRingSvg,
  RegimeScatterManifoldSvg,
  StateSpaceRadar8dSvg,
} from "@/components/QuantVisualGraphs";
import {
  analyzeBcp,
  configureLlmEndpoint,
  executeTrade,
  fetchRecommendations,
  fetchTickerNews,
  fetchTrades,
  generatePortfolio,
  getQarcApiBase,
  loadTelemetrySnapshot,
  type NewsArticle,
  type PortfolioResponse,
  type PriceForecast,
  type RecommendationItem,
  type SecurityData,
  type SnapshotPayload,
  type TradeExecuteResult,
  type TradeRecord,
  type VectorTwinsPayload,
} from "@/lib/qarcApi";
import {
  buildAllocationPlainEnglish,
  buildInvestorSummaryBullets,
  buildKpiPlainEnglish,
  buildPortfolioStrategySummary,
  extractForecastView,
  getBcpFieldPlainEnglish,
  getEvidencePlainEnglish,
  type ForecastView,
} from "@/lib/plainEnglish";

const WATCHLIST = [
  "RELIANCE",
  "TCS",
  "INFY",
  "HDFCBANK",
  "ICICIBANK",
  "KOTAKBANK",
  "DRREDDY",
  "SBIN",
];

type NavSectionId =
  | "overview"
  | "ai_advisor"
  | "statespace"
  | "screener"
  | "portfolio"
  | "evidence"
  | "news_twins"
  | "trades";

const NAV_ITEMS: Array<{
  num: string;
  id: NavSectionId;
  label: string;
  headerTitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { num: "01", id: "overview", label: "Overview", headerTitle: "OVERVIEW", icon: LayoutDashboard },
  {
    num: "02",
    id: "ai_advisor",
    label: "AI Advisor 70B",
    headerTitle: "AI ADVISOR 70B",
    icon: Sparkles,
  },
  { num: "03", id: "statespace", label: "State-Space", headerTitle: "STATE-SPACE", icon: Layers },
  {
    num: "04",
    id: "screener",
    label: "NSE Screener",
    headerTitle: "NSE SCREENER",
    icon: Activity,
  },
  { num: "05", id: "portfolio", label: "Portfolio", headerTitle: "PORTFOLIO", icon: PieChart },
  {
    num: "06",
    id: "evidence",
    label: "Evidence E01–E15",
    headerTitle: "EVIDENCE E01-E15",
    icon: Database,
  },
  {
    num: "07",
    id: "news_twins",
    label: "News & Twins",
    headerTitle: "NEWS & TWINS",
    icon: Newspaper,
  },
  {
    num: "08",
    id: "trades",
    label: "Trade Ledger",
    headerTitle: "TRADE LEDGER",
    icon: ArrowUpRight,
  },
];

const BCP_LABELS: Record<string, string> = {
  counterparty_type: "Counterparty Type",
  dominant_intent: "Dominant Intent",
  time_horizon: "Time Horizon",
  execution_urgency: "Execution Urgency",
  inventory_impact: "Inventory Impact",
  deception_risk: "Deception Risk",
  counter_strategy: "Counter-Strategy",
};

const SEGMENT_COLORS = ["#D2FF00", "#10B981", "#38BDF8", "#F59E0B", "#A78BFA"];

function getRegimeStyle(regime: string): {
  hex: string;
  pillCls: string;
  textCls: string;
  spotlightHex: string;
} {
  const u = (regime || "").toUpperCase();
  if (u.includes("MARKUP")) {
    return {
      hex: "#D2FF00",
      pillCls: "border-[#D2FF00]/60 bg-[#D2FF00]/10 text-[#D2FF00]",
      textCls: "text-[#D2FF00]",
      spotlightHex: "rgba(210, 255, 0, 0.14)",
    };
  }
  if (u.includes("ACCUMULATION")) {
    return {
      hex: "#10B981",
      pillCls: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300",
      textCls: "text-emerald-300",
      spotlightHex: "rgba(16, 185, 129, 0.12)",
    };
  }
  if (u.includes("DISTRIBUTION")) {
    return {
      hex: "#F59E0B",
      pillCls: "border-amber-400/50 bg-amber-400/10 text-amber-300",
      textCls: "text-amber-300",
      spotlightHex: "rgba(245, 158, 11, 0.12)",
    };
  }
  if (u.includes("MARKDOWN")) {
    return {
      hex: "#FF3B5C",
      pillCls: "border-[#FF3B5C]/60 bg-[#FF3B5C]/15 text-[#FF3B5C]",
      textCls: "text-[#FF3B5C]",
      spotlightHex: "rgba(255, 59, 92, 0.14)",
    };
  }
  return {
    hex: "#A1A1AA",
    pillCls: "border-[#23262D] bg-[#090A0C] text-zinc-300",
    textCls: "text-zinc-200",
    spotlightHex: "rgba(210, 255, 0, 0.10)",
  };
}

function getHeadlineCue(title: string): { label: string; cls: string } {
  const t = (title || "").toLowerCase();
  if (/(surge|rally|profit|jump|beat|buy|upgrade|gain|high|record|order|win|growth)/.test(t)) {
    return {
      label: "POSITIVE",
      cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    };
  }
  if (/(fall|drop|loss|slump|cut|downgrade|probe|fraud|warn|debt|crash|sell|decline)/.test(t)) {
    return {
      label: "NEGATIVE",
      cls: "border-[#FF3B5C]/50 bg-[#FF3B5C]/10 text-[#FF3B5C]",
    };
  }
  return {
    label: "NEUTRAL",
    cls: "border-[#23262D] bg-[#090A0C] text-zinc-400",
  };
}

function GoogleGIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function SpotlightCard({
  children,
  className = "",
  accentHex = "rgba(210, 255, 0, 0.12)",
}: {
  children: React.ReactNode;
  className?: string;
  accentHex?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  return (
    <div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          active: true,
        });
      }}
      onMouseLeave={() => setPos((p) => ({ ...p, active: false }))}
      className={`relative overflow-hidden border bg-[#101216] transition-colors duration-200 ${
        className || "border-[#23262D] hover:border-[#D2FF00]/60"
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(360px circle at ${pos.x}px ${pos.y}px, ${accentHex}, transparent 70%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

function SectionCodeHeader({
  code,
  title,
  rightSlot,
}: {
  code: string;
  title: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#23262D] pb-3">
      <div className="font-mono text-xs font-bold uppercase tracking-[0.16em]">
        <span className="text-[#D2FF00]">{code}</span>{" "}
        <span className="text-zinc-200">// {title}</span>
      </div>
      {rightSlot}
    </div>
  );
}

function RegimeConfidenceGauge({
  confidence,
  regime,
}: {
  confidence: number;
  regime: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number(confidence) || 0));
  const pct = clamped * 100;
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - clamped);
  const { hex } = getRegimeStyle(regime);

  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#23262D" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={hex}
          strokeWidth="5"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ filter: `drop-shadow(0 0 6px ${hex}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-xs font-bold tabular-nums text-white">
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function InfoTooltip({ text, label = "Explain metric" }: { text: string; label?: string }) {
  return (
    <span className="group/tip relative inline-flex items-center">
      <button
        type="button"
        title={text}
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center border border-[#23262D] bg-[#090A0C] text-zinc-400 transition hover:border-[#D2FF00] hover:text-[#D2FF00] focus:border-[#D2FF00] focus:text-[#D2FF00] focus:outline-none"
      >
        <HelpCircle className="h-2.5 w-2.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full right-0 z-50 mb-1.5 w-64 border border-[#D2FF00]/60 bg-[#090A0C] p-2.5 font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-zinc-200 opacity-0 shadow-2xl transition group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function renderBadge(badge: string, status: string) {
  if (badge === "OVERRIDDEN" || (status === "SUPPORTED" && badge === "STRESS_PATCHED")) {
    return (
      <span className="inline-flex items-center gap-1 border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-300">
        <ShieldAlert className="h-3 w-3" /> OVERRIDDEN (&lt;5ms)
      </span>
    );
  }
  if (badge === "ABSTAINED" || status === "UNVERIFIABLE" || status === "DOWNGRADED_TO_UNKNOWN") {
    return (
      <span className="inline-flex items-center gap-1 border border-[#23262D] bg-[#090A0C] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-400">
        <AlertTriangle className="h-3 w-3" /> ABSTAINED
      </span>
    );
  }
  if (status === "CONTRADICTION" || badge === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 border border-[#FF3B5C]/60 bg-[#FF3B5C]/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FF3B5C]">
        REJECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#D2FF00]">
      <CheckCircle2 className="h-3 w-3" /> SUPPORTED
    </span>
  );
}

function KalmanTrajectorySvg({
  series,
  currentFilteredPrice,
  currentRawPrice,
  heightClass = "h-[230px]",
}: {
  series: SeriesPoint[];
  currentFilteredPrice: number;
  currentRawPrice: number;
  heightClass?: string;
}) {
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = useMemo(() => (series || []).slice(-60), [series]);

  if (pts.length < 2) {
    return (
      <div
        className={`flex ${heightClass} items-center justify-center border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500`}
      >
        HISTORICAL BAR SERIES UNAVAILABLE FOR THIS SYMBOL IN SNAPSHOT — CLICK &ldquo;RUN LIVE 70B BCP&rdquo;.
      </div>
    );
  }

  const w = 560;
  const h = 220;
  const padL = 48;
  const padR = 24;
  const padT = 28;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const vals = pts.flatMap((p) => [p.close, p.kalman]).filter((v) => Number.isFinite(v));
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(maxV - minV, minV * 0.01, 1);
  const yMin = minV - span * 0.08;
  const yMax = maxV + span * 0.08;

  const toX = (i: number) => padL + (i / Math.max(pts.length - 1, 1)) * plotW;
  const toY = (v: number) => padT + ((yMax - v) / Math.max(yMax - yMin, 1e-6)) * plotH;

  const closeLine = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.close).toFixed(1)}`).join(" ");
  const kalmanLine = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.kalman).toFixed(1)}`)
    .join(" ");
  const areaPath = `${closeLine} L${toX(pts.length - 1).toFixed(1)},${(padT + plotH).toFixed(
    1
  )} L${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  const lastPt = pts[pts.length - 1];
  const lastX = toX(pts.length - 1);
  const lastY = toY(lastPt.close);

  const inspected = hoverIdx !== null && pts[hoverIdx] ? pts[hoverIdx] : lastPt;
  const inspectedIdx = hoverIdx !== null && pts[hoverIdx] ? hoverIdx : pts.length - 1;
  const yTicks = [yMax, (yMax + yMin) / 2, yMin];

  return (
    <div className="relative border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[#D2FF00]">
            <span className="h-0.5 w-3 bg-[#D2FF00]" />
            SPOT ₹{inspected.close.toFixed(2)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-white">
            <span className="h-0.5 w-3 border-b border-dashed border-white" />
            KALMAN ₹{inspected.kalman.toFixed(2)}
          </span>
          <span className="text-zinc-500">{inspected.date}</span>
        </div>
        <span className="border border-[#D2FF00]/50 bg-[#090A0C] px-2 py-0.5 font-bold text-[#D2FF00]">
          CURRENT: KALMAN ₹{(currentFilteredPrice || lastPt.kalman || currentRawPrice).toFixed(2)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className={`w-full ${heightClass} select-none`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * w;
          const idx = Math.round(((relX - padL) / plotW) * (pts.length - 1));
          if (idx >= 0 && idx < pts.length) setHoverIdx(idx);
        }}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Spot vs Kalman denoised trajectory SVG chart"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D2FF00" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#D2FF00" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, idx) => {
          const y = toY(tick);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={w - padR}
                y2={y}
                stroke="#23262D"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fill="#71717A"
                fontSize="9"
                fontFamily="monospace"
              >
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={closeLine} fill="none" stroke="#D2FF00" strokeWidth="2" />
        <path
          d={kalmanLine}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.9"
        />

        {hoverIdx !== null && (
          <g>
            <line
              x1={toX(inspectedIdx)}
              y1={padT}
              x2={toX(inspectedIdx)}
              y2={padT + plotH}
              stroke="#D2FF00"
              strokeOpacity="0.4"
              strokeDasharray="2 2"
            />
            <circle cx={toX(inspectedIdx)} cy={toY(inspected.close)} r="3.5" fill="#D2FF00" />
            <circle cx={toX(inspectedIdx)} cy={toY(inspected.kalman)} r="3" fill="#FFFFFF" />
          </g>
        )}

        <circle
          cx={lastX}
          cy={lastY}
          r="11"
          fill="none"
          stroke="#D2FF00"
          strokeWidth="1.5"
          className="animate-qarc-pulse-ring"
        />
        <circle cx={lastX} cy={lastY} r="7" fill="none" stroke="#D2FF00" strokeWidth="1" />
        <circle cx={lastX} cy={lastY} r="3.5" fill="#D2FF00" />

        <text x={padL} y={h - 6} fill="#71717A" fontSize="9" fontFamily="monospace">
          {pts[0].date}
        </text>
        <text x={w - padR} y={h - 6} textAnchor="end" fill="#D2FF00" fontSize="9" fontFamily="monospace">
          {lastPt.date}
        </text>
      </svg>
    </div>
  );
}

function E14ConeSvg({
  currentPrice,
  forecastView,
  rawForecast,
  onRunLive,
  analyzing,
}: {
  currentPrice: number;
  forecastView: ForecastView | null;
  rawForecast?: PriceForecast;
  onRunLive: () => void;
  analyzing: boolean;
}) {
  const gradId = useId();

  if (!forecastView || forecastView.medianOrT5Price === null) {
    return (
      <div className="flex h-[265px] flex-col items-center justify-center gap-3 border border-[#23262D] bg-[#090A0C] p-6 text-center font-mono text-xs text-zinc-400">
        <div>
          E14 5-DAY CAUSAL QUANTILE CONE REQUIRES A LIVE <span className="text-[#D2FF00]">/api/bcp_analyze</span> CALL.
        </div>
        <button
          type="button"
          onClick={onRunLive}
          disabled={analyzing}
          className="border border-[#D2FF00] bg-[#D2FF00] px-4 py-1.5 font-bold uppercase tracking-wider text-[#090A0C] transition hover:bg-white disabled:opacity-50"
        >
          {analyzing ? "Computing..." : "Run Live 70B BCP"}
        </button>
      </div>
    );
  }

  const startP = Number(rawForecast?.current_price || currentPrice || 0);
  const t1P = Number(forecastView.t1Price ?? (startP + forecastView.medianOrT5Price) / 2);
  const t1Lo = Number(rawForecast?.t1_lower_1sigma ?? (startP + (forecastView.bearPrice ?? startP)) / 2);
  const t1Hi = Number(rawForecast?.t1_upper_1sigma ?? (startP + (forecastView.bullPrice ?? startP)) / 2);
  const t5Med = Number(forecastView.medianOrT5Price);
  const t5Lo = Number(forecastView.bearPrice ?? t5Med);
  const t5Hi = Number(forecastView.bullPrice ?? t5Med);

  const w = 560;
  const h = 220;
  const padL = 56;
  const padR = 78;
  const padT = 26;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allVals = [startP, t1P, t1Lo, t1Hi, t5Med, t5Lo, t5Hi];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const padSpan = Math.max((maxV - minV) * 0.2, startP * 0.01, 1);
  const yMin = minV - padSpan;
  const yMax = maxV + padSpan;

  const x0 = padL;
  const x1 = padL + plotW * 0.24;
  const x5 = padL + plotW;
  const toY = (v: number) => padT + ((yMax - v) / Math.max(yMax - yMin, 1e-6)) * plotH;

  const fanPath = `M${x0},${toY(startP).toFixed(1)} L${x1.toFixed(1)},${toY(t1Hi).toFixed(
    1
  )} L${x5.toFixed(1)},${toY(t5Hi).toFixed(1)} L${x5.toFixed(1)},${toY(t5Lo).toFixed(
    1
  )} L${x1.toFixed(1)},${toY(t1Lo).toFixed(1)} Z`;

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          {forecastView.sourceLabel} ·{" "}
          <strong className={forecastView.bias === "BEARISH" ? "text-[#FF3B5C]" : "text-[#D2FF00]"}>
            {forecastView.bias}
          </strong>
        </span>
        {forecastView.probUpPct !== null && (
          <span className="border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2 py-0.5 font-bold text-[#D2FF00]">
            WIN PROB P(UP): {forecastView.probUpPct.toFixed(1)}%
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-[220px] w-full select-none" role="img" aria-label="E14 5-day price forecast cone">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#D2FF00" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.24" />
          </linearGradient>
        </defs>

        {[yMax, startP, yMin].map((tick, idx) => (
          <g key={idx}>
            <line
              x1={x0}
              y1={toY(tick)}
              x2={x5}
              y2={toY(tick)}
              stroke="#23262D"
              strokeDasharray="3 3"
            />
            <text
              x={x0 - 6}
              y={toY(tick) + 3}
              textAnchor="end"
              fill="#71717A"
              fontSize="9"
              fontFamily="monospace"
            >
              {tick.toFixed(0)}
            </text>
          </g>
        ))}

        <path d={fanPath} fill={`url(#${gradId})`} stroke="none" />
        <line
          x1={x0}
          y1={toY(startP)}
          x2={x5}
          y2={toY(t5Hi)}
          stroke="#10B981"
          strokeWidth="1.25"
          strokeDasharray="3 3"
        />
        <line
          x1={x0}
          y1={toY(startP)}
          x2={x5}
          y2={toY(t5Lo)}
          stroke="#FF3B5C"
          strokeWidth="1.25"
          strokeDasharray="3 3"
        />
        <polyline
          fill="none"
          stroke="#D2FF00"
          strokeWidth="2.25"
          points={`${x0},${toY(startP).toFixed(1)} ${x1.toFixed(1)},${toY(t1P).toFixed(
            1
          )} ${x5.toFixed(1)},${toY(t5Med).toFixed(1)}`}
        />

        <circle cx={x0} cy={toY(startP)} r="4" fill="#FFFFFF" />
        <circle cx={x5} cy={toY(t5Med)} r="4.5" fill="#D2FF00" />
        <circle cx={x5} cy={toY(t5Hi)} r="3.5" fill="#10B981" />
        <circle cx={x5} cy={toY(t5Lo)} r="3.5" fill="#FF3B5C" />

        <text x={x5 + 6} y={toY(t5Hi) + 3} fill="#10B981" fontSize="9" fontFamily="monospace">
          BULL ₹{t5Hi.toFixed(1)}
        </text>
        <text x={x5 + 6} y={toY(t5Med) + 3} fill="#D2FF00" fontSize="9" fontWeight="bold" fontFamily="monospace">
          E[5D] ₹{t5Med.toFixed(1)}
        </text>
        <text x={x5 + 6} y={toY(t5Lo) + 3} fill="#FF3B5C" fontSize="9" fontFamily="monospace">
          BEAR ₹{t5Lo.toFixed(1)}
        </text>

        <text x={x0} y={h - 6} fill="#71717A" fontSize="9" fontFamily="monospace">
          T+0 (₹{startP.toFixed(0)})
        </text>
        <text x={x1} y={h - 6} textAnchor="middle" fill="#71717A" fontSize="9" fontFamily="monospace">
          T+1
        </text>
        <text x={x5} y={h - 6} textAnchor="middle" fill="#D2FF00" fontSize="9" fontFamily="monospace">
          T+5
        </text>
      </svg>
    </div>
  );
}

function HmmStatesBarChartSvg({
  probabilities,
  currentRegime,
}: {
  probabilities: Record<string, number>;
  currentRegime: string;
}) {
  const ordered: Array<{ key: string; label: string; color: string }> = [
    { key: "Accumulation", label: "ACCUMULATION", color: "#10B981" },
    { key: "Markup", label: "MARKUP", color: "#D2FF00" },
    { key: "Distribution", label: "DISTRIBUTION", color: "#F59E0B" },
    { key: "Markdown", label: "MARKDOWN", color: "#FF3B5C" },
  ];

  const entries = ordered.map((o) => {
    const matchedKey = Object.keys(probabilities || {}).find(
      (k) => k.toLowerCase() === o.key.toLowerCase()
    );
    const val = matchedKey ? Number(probabilities[matchedKey]) : 0;
    return {
      ...o,
      pct: Math.max(0, Math.min(100, val * 100)),
      active: currentRegime.toLowerCase().includes(o.key.toLowerCase()),
    };
  });

  const w = 520;
  const h = 215;
  const padL = 34;
  const padR = 16;
  const padT = 26;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const colW = plotW / 4;
  const barW = Math.min(64, colW * 0.54);

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[215px] w-full select-none" role="img" aria-label="HMM 4-state posterior probability bar chart">
        {[100, 50, 0].map((tick) => {
          const y = padT + ((100 - tick) / 100) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padL}
                y1={y}
                x2={w - padR}
                y2={y}
                stroke="#23262D"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fill="#71717A"
                fontSize="9"
                fontFamily="monospace"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {entries.map((e, idx) => {
          const cx = padL + colW * idx + colW / 2;
          const barH = Math.max(3, (e.pct / 100) * plotH);
          const x = cx - barW / 2;
          const y = padT + plotH - barH;
          return (
            <g key={e.key}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx="4"
                fill={e.color}
                fillOpacity={e.active ? 0.95 : 0.65}
                stroke={e.active ? "#FFFFFF" : e.color}
                strokeWidth={e.active ? 1.2 : 0}
              />
              <text
                x={cx}
                y={y - 7}
                textAnchor="middle"
                fill={e.active ? "#FFFFFF" : "#D4D4D8"}
                fontSize="10"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {e.pct.toFixed(1)}%
              </text>
              <text
                x={cx}
                y={h - 12}
                textAnchor="middle"
                fill={e.active ? e.color : "#71717A"}
                fontSize="9"
                fontWeight={e.active ? "bold" : "normal"}
                fontFamily="monospace"
              >
                {e.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function VelocityRsiDualSvg({ series }: { series: SeriesPoint[] }) {
  const pts = useMemo(() => (series || []).slice(-36), [series]);
  if (pts.length < 2) {
    return (
      <div className="flex h-[215px] items-center justify-center border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500">
        NO VELOCITY / RSI BAR SERIES IN SNAPSHOT.
      </div>
    );
  }

  const w = 520;
  const h = 215;
  const padL = 38;
  const padR = 38;
  const padT = 22;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxAbsVel = Math.max(
    0.5,
    ...pts.map((p) => Math.abs(Number(p.velocity_pct) || 0))
  );
  const zeroY = padT + plotH / 2;
  const stepX = plotW / pts.length;
  const barW = Math.max(3, stepX * 0.58);

  const rsiY = (rsi: number) =>
    padT + ((100 - Math.max(0, Math.min(100, rsi))) / 100) * plotH;
  const rsiPath = pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(padL + stepX * i + stepX / 2).toFixed(1)},${rsiY(
          p.rsi_14
        ).toFixed(1)}`
    )
    .join(" ");

  const last = pts[pts.length - 1];

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          BARS: KALMAN VEL ({last.velocity_pct >= 0 ? "+" : ""}
          {last.velocity_pct.toFixed(3)}%/d)
        </span>
        <span className="text-[#38BDF8]">LINE: RSI(14) = {last.rsi_14.toFixed(1)}</span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-[195px] w-full select-none" role="img" aria-label="Kalman velocity bars and RSI 14 line">
        <line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke="#23262D" strokeWidth="1" />
        <line
          x1={padL}
          y1={rsiY(70)}
          x2={w - padR}
          y2={rsiY(70)}
          stroke="#23262D"
          strokeDasharray="3 3"
        />
        <line
          x1={padL}
          y1={rsiY(30)}
          x2={w - padR}
          y2={rsiY(30)}
          stroke="#23262D"
          strokeDasharray="3 3"
        />

        {pts.map((p, i) => {
          const vel = Number(p.velocity_pct) || 0;
          const mag = (Math.abs(vel) / maxAbsVel) * (plotH / 2 - 4);
          const x = padL + stepX * i + (stepX - barW) / 2;
          const y = vel >= 0 ? zeroY - mag : zeroY;
          return (
            <rect
              key={`${p.date}-${i}`}
              x={x}
              y={y}
              width={barW}
              height={Math.max(1.5, mag)}
              fill={vel >= 0 ? "#D2FF00" : "#FF3B5C"}
              fillOpacity="0.72"
            />
          );
        })}

        <path d={rsiPath} fill="none" stroke="#38BDF8" strokeWidth="1.75" />

        <text x={w - padR + 5} y={rsiY(70) + 3} fill="#71717A" fontSize="9" fontFamily="monospace">
          70
        </text>
        <text x={w - padR + 5} y={rsiY(30) + 3} fill="#71717A" fontSize="9" fontFamily="monospace">
          30
        </text>
        <text x={padL - 5} y={padT + 6} textAnchor="end" fill="#71717A" fontSize="9" fontFamily="monospace">
          +{maxAbsVel.toFixed(1)}%
        </text>
        <text x={padL - 5} y={padT + plotH} textAnchor="end" fill="#71717A" fontSize="9" fontFamily="monospace">
          -{maxAbsVel.toFixed(1)}%
        </text>
      </svg>
    </div>
  );
}

function E15TwinsBarView({
  vectorTwins,
  ticker,
  onRunLive,
  analyzing,
}: {
  vectorTwins?: VectorTwinsPayload;
  ticker: string;
  onRunLive: () => void;
  analyzing: boolean;
}) {
  if (!vectorTwins?.available || !vectorTwins.twins?.length) {
    return (
      <div className="flex h-[215px] flex-col items-center justify-center gap-3 border border-[#23262D] bg-[#090A0C] p-6 text-center font-mono text-xs text-zinc-400">
        <div>E15 NEON PGVECTOR TWINS UNAVAILABLE IN SNAPSHOT FOR {ticker}.</div>
        <button
          type="button"
          onClick={onRunLive}
          disabled={analyzing}
          className="border border-[#D2FF00] bg-[#D2FF00] px-4 py-1.5 font-bold uppercase text-[#090A0C] transition hover:bg-white disabled:opacity-50"
        >
          {analyzing ? "Querying..." : "Run Live 70B BCP"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border border-[#23262D] bg-[#090A0C] p-3 font-mono text-xs tabular-nums">
      {vectorTwins.twins.slice(0, 4).map((tw, i) => {
        const simPct = Math.max(0, Math.min(100, tw.cosine_similarity * 100));
        const ret = tw.fwd_5d_ret_pct;
        return (
          <div
            key={`${tw.symbol}-${tw.bar_date}-${i}`}
            className="border border-[#23262D] bg-[#101216] p-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-2 text-zinc-200">
                <StockLogo symbol={tw.symbol || ticker} size="xs" />
                <strong className="text-white">{tw.symbol || ticker}</strong>
                <span className="text-zinc-500">· {tw.bar_date}</span>
                <span className="text-zinc-400">({tw.hmm_state})</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="text-zinc-300">{simPct.toFixed(1)}% MATCH</span>
                <span className={(ret ?? 0) >= 0 ? "font-bold text-[#D2FF00]" : "font-bold text-[#FF3B5C]"}>
                  T+5: {ret !== null ? `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%` : "N/A"}
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-[#090A0C]">
              <div className="h-full bg-[#D2FF00]" style={{ width: `${simPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);

  // Navigation & Overview Tabs
  const [activeNav, setActiveNav] = useState<NavSectionId>("overview");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState<boolean>(false);

  const [trajTab, setTrajTab] = useState<"kalman" | "cone" | "candles">("kalman");
  const [distTab, setDistTab] = useState<"hmm" | "vel_rsi" | "twins">("hmm");
  const [ledgerTab, setLedgerTab] = useState<"portfolio" | "donut" | "trades" | "verdict">(
    "portfolio"
  );
  const [microTab, setMicroTab] = useState<"delivery" | "oscillator">("delivery");

  // Core Data & Telemetry State
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string>("RELIANCE");
  const [activeSec, setActiveSec] = useState<SecurityData | null>(null);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>("LOADING");
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const [showPlainEnglish, setShowPlainEnglish] = useState<boolean>(true);
  const [expandedLedgerCode, setExpandedLedgerCode] = useState<string | null>(null);
  const [intelSearchQuery, setIntelSearchQuery] = useState<string>("");
  const [showRawPortfolioJson, setShowRawPortfolioJson] = useState<boolean>(false);

  const [filingsInput, setFilingsInput] = useState<string>("none");
  const [analyzing, setAnalyzing] = useState<boolean>(false);

  // Runtime Colab LLM Handshake
  const [showLlmConfig, setShowLlmConfig] = useState<boolean>(false);
  const [llmUrlInput, setLlmUrlInput] = useState<string>("");
  const [llmAdminSecret, setLlmAdminSecret] = useState<string>("");
  const [llmConfigStatus, setLlmConfigStatus] = useState<string | null>(null);
  const [savingLlmConfig, setSavingLlmConfig] = useState<boolean>(false);

  // Screener & Portfolio
  const [recommendations, setRecommendations] = useState<RecommendationItem[] | null>(null);
  const [loadingRecs, setLoadingRecs] = useState<boolean>(false);
  const [capitalInr, setCapitalInr] = useState<number>(500000);
  const [riskProfile, setRiskProfile] = useState<string>("BALANCED_CORE");
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [generatingPortfolio, setGeneratingPortfolio] = useState<boolean>(false);

  // News + Trades
  const [newsArticles, setNewsArticles] = useState<NewsArticle[] | null>(null);
  const [newsE08Refreshed, setNewsE08Refreshed] = useState<boolean>(false);
  const [loadingNews, setLoadingNews] = useState<boolean>(false);
  const [trades, setTrades] = useState<TradeRecord[] | null>(null);
  const [loadingTrades, setLoadingTrades] = useState<boolean>(false);

  // Execution Terminal + LIVE_ANGEL Confirmation Guard
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeQty, setTradeQty] = useState<number>(1);
  const [tradePrice, setTradePrice] = useState<string>("");
  const [tradeMode, setTradeMode] = useState<"PAPER" | "LIVE_ANGEL">("PAPER");
  const [liveConfirmAck, setLiveConfirmAck] = useState<boolean>(false);
  const [liveConfirmPending, setLiveConfirmPending] = useState<boolean>(false);
  const [executingTrade, setExecutingTrade] = useState<boolean>(false);
  const [tradeReceipt, setTradeReceipt] = useState<TradeExecuteResult | null>(null);

  const loadInitial = useCallback(async () => {
    try {
      const snap = await loadTelemetrySnapshot();
      setSnapshot(snap);
      if (snap.securities?.RELIANCE) {
        setActiveSec(snap.securities.RELIANCE);
        setDataSourceLabel("SNAPSHOT FALLBACK");
      }
    } catch (err) {
      setApiNotice(err instanceof Error ? err.message : "Failed to load snapshot");
      setDataSourceLabel("OFFLINE");
    }

    try {
      const tr = await fetchTrades(15);
      setTrades(tr.trades);
    } catch {
      setTrades(null);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      loadInitial();
    }
  }, [authStatus, loadInitial]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTradeDrawerOpen(false);
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelectTicker = (ticker: string) => {
    setSelectedTicker(ticker);
    setApiNotice(null);
    setTradeReceipt(null);
    setLiveConfirmPending(false);
    setNewsArticles(null);
    setNewsE08Refreshed(false);
    setTradePrice("");
    if (snapshot?.securities?.[ticker]) {
      setActiveSec(snapshot.securities[ticker]);
      setDataSourceLabel("SNAPSHOT FALLBACK");
    } else {
      setActiveSec(null);
      setDataSourceLabel("AWAITING LIVE API");
    }
  };

  const handleRunLiveAnalyze = async (tickerOverride?: string) => {
    const ticker = tickerOverride || selectedTicker;
    setAnalyzing(true);
    setApiNotice(null);
    try {
      const res = await analyzeBcp({
        ticker,
        filings: filingsInput || "none",
        use_live_angel: true,
        llm_endpoint_url: llmUrlInput.trim() || undefined,
      });
      const existingSeries = snapshot?.securities?.[ticker]?.series || [];
      setActiveSec({
        ...res.analysis,
        series: res.analysis.series?.length ? res.analysis.series : existingSeries,
      });
      setDataSourceLabel(`LIVE API (${res.mode.toUpperCase()})`);
    } catch (err) {
      const hasSnapshot = Boolean(snapshot?.securities?.[ticker]);
      setApiNotice(
        `Live /api/bcp_analyze unavailable for ${ticker} (${err instanceof Error ? err.message : "error"}).` +
          (hasSnapshot ? " Retaining snapshot." : " No snapshot exists for this ticker.")
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRefreshNews = async (tickerOverride?: string) => {
    const ticker = tickerOverride || selectedTicker;
    setLoadingNews(true);
    try {
      const res = await fetchTickerNews(ticker, 5);
      setNewsArticles(res.articles);
      setNewsE08Refreshed(Boolean(res.e08_refreshed));
    } catch (err) {
      setNewsArticles(null);
      setApiNotice(`News fetch unavailable (${err instanceof Error ? err.message : "offline"}).`);
    } finally {
      setLoadingNews(false);
    }
  };

  const handleSearchSubmit = (symbol: string) => {
    handleSelectTicker(symbol);
    void Promise.allSettled([handleRunLiveAnalyze(symbol), handleRefreshNews(symbol)]);
  };

  const handleLoadRecommendations = async () => {
    setLoadingRecs(true);
    setApiNotice(null);
    try {
      const res = await fetchRecommendations(false);
      setRecommendations(res.recommendations);
    } catch (err) {
      setApiNotice(
        `Screener /api/recommendations unavailable (${err instanceof Error ? err.message : "offline"}).`
      );
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleGeneratePortfolio = async () => {
    setGeneratingPortfolio(true);
    setApiNotice(null);
    try {
      const res = await generatePortfolio({
        capital_inr: capitalInr,
        risk_profile: riskProfile,
        use_live_angel: false,
      });
      setPortfolio(res);
    } catch (err) {
      setApiNotice(
        `Portfolio /api/portfolio/generate unavailable (${err instanceof Error ? err.message : "offline"}).`
      );
    } finally {
      setGeneratingPortfolio(false);
    }
  };

  const handleOptimize100kPortfolio = async () => {
    setCapitalInr(100000);
    setGeneratingPortfolio(true);
    setApiNotice(null);
    try {
      const res = await generatePortfolio({
        capital_inr: 100000,
        risk_profile: riskProfile,
        use_live_angel: false,
      });
      setPortfolio(res);
    } catch (err) {
      setApiNotice(
        `Portfolio /api/portfolio/generate unavailable (${err instanceof Error ? err.message : "offline"}).`
      );
    } finally {
      setGeneratingPortfolio(false);
    }
  };

  const handleRefreshTrades = async () => {
    setLoadingTrades(true);
    try {
      const res = await fetchTrades(15);
      setTrades(res.trades);
    } catch (err) {
      setApiNotice(`Trades /api/trades unavailable (${err instanceof Error ? err.message : "offline"}).`);
    } finally {
      setLoadingTrades(false);
    }
  };

  const handleSaveLlmEndpoint = async () => {
    setSavingLlmConfig(true);
    setLlmConfigStatus(null);
    try {
      const res = await configureLlmEndpoint({
        endpoint_url: llmUrlInput.trim(),
        admin_secret: llmAdminSecret.trim() || undefined,
      });
      setLlmConfigStatus(`UPDATED → ${res.endpoint_url}`);
    } catch (err) {
      setLlmConfigStatus(`ERROR: ${err instanceof Error ? err.message : "Request failed"}`);
    } finally {
      setSavingLlmConfig(false);
    }
  };

  const dispatchOrder = async () => {
    if (!activeSec) return;
    setExecutingTrade(true);
    setTradeReceipt(null);
    try {
      const fallbackPrice = activeSec.quant_anchors.kalman.raw_price || 0;
      const parsedPrice = Number(tradePrice) > 0 ? Number(tradePrice) : fallbackPrice;
      const res = await executeTrade({
        ticker: selectedTicker,
        side: tradeSide,
        quantity: tradeQty,
        price: parsedPrice,
        mode: tradeMode,
        live_ltp: activeSec.live_l2_depth?.ltp || fallbackPrice,
        has_factor_4b: Boolean(activeSec.active_factors?.factor_4b_deal_churn),
        unresolved_contradictions: activeSec.guardrail_telemetry.post_guardrail_contradictions,
        hmm_state: activeSec.quant_anchors.hmm.current_regime,
        verdict: activeSec.guardrail_telemetry.verification_status,
      });
      setTradeReceipt(res);
      setLiveConfirmPending(false);
      handleRefreshTrades();
    } catch (err) {
      setTradeReceipt({
        status: "EXECUTION_ERROR",
        mode: tradeMode,
        reason: err instanceof Error ? err.message : "Order failed",
      });
    } finally {
      setExecutingTrade(false);
    }
  };

  const handleOrderSubmitClick = () => {
    if (tradeMode === "LIVE_ANGEL") {
      if (!liveConfirmAck) {
        setApiNotice("Check the LIVE_ANGEL acknowledgment box before arming a real NSE order.");
        return;
      }
      if (!liveConfirmPending) {
        setLiveConfirmPending(true);
        return;
      }
    }
    dispatchOrder();
  };

  const apiBaseDisplay = getQarcApiBase() || "NEXT PROXY (/api/*)";
  const kpiPlain = activeSec ? buildKpiPlainEnglish(activeSec) : null;
  const summaryBullets = activeSec ? buildInvestorSummaryBullets(activeSec) : [];
  const forecastView = activeSec ? extractForecastView(activeSec.price_forecast) : null;

  const userInitial =
    session?.user?.name?.trim()?.charAt(0)?.toUpperCase() ||
    session?.user?.email?.trim()?.charAt(0)?.toUpperCase() ||
    "Q";

  const isLiveApi = dataSourceLabel.startsWith("LIVE API");
  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeNav) || NAV_ITEMS[0];
  const regimeStyle = getRegimeStyle(activeSec?.quant_anchors.hmm.current_regime || "");
  const isMarkupRegime = Boolean(
    activeSec?.quant_anchors.hmm.current_regime.toLowerCase().includes("markup")
  );

  // Active Watchlist 4-row model strictly from real recommendations or snapshot.securities
  const watchlistRows = useMemo(() => {
    if (recommendations && recommendations.length > 0) {
      return recommendations.slice(0, 4).map((rec) => {
        const snapSec = snapshot?.securities?.[rec.ticker];
        const price = rec.current_price ?? rec.ltp ?? snapSec?.quant_anchors.kalman.raw_price ?? null;
        const vel = rec.kalman_vel ?? snapSec?.quant_anchors.kalman.trend_velocity_pct_per_day ?? null;
        const regime = rec.hmm_state || snapSec?.quant_anchors.hmm.current_regime || "—";
        return { ticker: rec.ticker, price, vel, regime };
      });
    }

    if (snapshot?.securities) {
      const all = Object.values(snapshot.securities);
      const sorted = [
        ...all.filter((s) => s.ticker === selectedTicker),
        ...all.filter((s) => s.ticker !== selectedTicker),
      ].slice(0, 4);
      return sorted.map((s) => ({
        ticker: s.ticker,
        price: s.quant_anchors.kalman.raw_price,
        vel: s.quant_anchors.kalman.trend_velocity_pct_per_day,
        regime: s.quant_anchors.hmm.current_regime,
      }));
    }

    if (activeSec) {
      return [
        {
          ticker: activeSec.ticker,
          price: activeSec.quant_anchors.kalman.raw_price,
          vel: activeSec.quant_anchors.kalman.trend_velocity_pct_per_day,
          regime: activeSec.quant_anchors.hmm.current_regime,
        },
      ];
    }

    return [];
  }, [recommendations, snapshot, selectedTicker, activeSec]);

  // Portfolio allocation model (live generated portfolio or snapshot regime-cap preview)
  const allocationBarModel = useMemo(() => {
    if (portfolio) {
      const cap = portfolio.capital_inr || 1;
      const equitySegments = portfolio.allocations.map((a, idx) => ({
        label: a.ticker,
        pct: Math.max(0, a.weight_pct),
        inr: Number(a.allocated_inr ?? a.allocation_inr ?? 0),
        color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
        isCash: false,
      }));
      const cashPct =
        portfolio.cash_sweep_weight_pct ?? Math.max(0, (portfolio.cash_sweep_inr / cap) * 100);
      const segments = [
        ...equitySegments,
        {
          label: `${portfolio.cash_sweep_instrument || "LIQUIDBEES"} (CASH SWEEP)`,
          pct: cashPct,
          inr: portfolio.cash_sweep_inr,
          color: "#64748B",
          isCash: true,
        },
      ];
      return {
        isLive: true,
        totalCapital: portfolio.capital_inr,
        segments,
        quarantinedTickers: (portfolio.quarantined_avoid || []).map((q) => ({
          ticker: q.ticker,
          reason: q.rationale,
        })),
      };
    }

    if (snapshot?.securities) {
      const entries = Object.values(snapshot.securities);
      const safe = entries.filter(
        (s) =>
          !s.quant_anchors.hmm.current_regime.toUpperCase().includes("MARKDOWN") &&
          !s.active_factors?.factor_4b_deal_churn
      );
      const quarantined = entries
        .filter(
          (s) =>
            s.quant_anchors.hmm.current_regime.toUpperCase().includes("MARKDOWN") ||
            Boolean(s.active_factors?.factor_4b_deal_churn)
        )
        .map((s) => ({
          ticker: s.ticker,
          reason: s.active_factors?.factor_4b_deal_churn
            ? "Factor 4B Churn Lock (₹0)"
            : `${s.quant_anchors.hmm.current_regime} (₹0)`,
        }));

      let remaining = 100;
      const equitySegments = safe.slice(0, 3).map((s, idx) => {
        const cap = Math.min(
          remaining,
          Math.max(
            5,
            Math.min(20, Number(s.quant_anchors.monte_carlo.recommended_max_allocation_cap_pct || 10))
          )
        );
        remaining = Math.max(0, remaining - cap);
        return {
          label: s.ticker,
          pct: cap,
          inr: Math.round((capitalInr * cap) / 100),
          color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
          isCash: false,
        };
      });

      const segments = [
        ...equitySegments,
        {
          label: "LIQUIDBEES (CASH SWEEP)",
          pct: Math.max(0, remaining),
          inr: Math.round((capitalInr * remaining) / 100),
          color: "#64748B",
          isCash: true,
        },
      ];
      return {
        isLive: false,
        totalCapital: capitalInr,
        segments,
        quarantinedTickers: quarantined,
      };
    }

    return null;
  }, [portfolio, snapshot, capitalInr]);

  const filteredEvidence = useMemo(() => {
    if (!activeSec) return [];
    const q = intelSearchQuery.trim().toLowerCase();
    const entries = Object.entries(activeSec.evidence_ledger);
    if (!q) return entries;
    return entries.filter(
      ([code, item]) =>
        code.toLowerCase().includes(q) ||
        item.metric.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [activeSec, intelSearchQuery]);

  const filteredTrades = useMemo(() => {
    if (!trades) return null;
    const q = intelSearchQuery.trim().toLowerCase();
    if (!q) return trades;
    return trades.filter(
      (tr) =>
        tr.ticker.toLowerCase().includes(q) ||
        tr.status.toLowerCase().includes(q) ||
        tr.action.toLowerCase().includes(q)
    );
  }, [trades, intelSearchQuery]);

  // Pre-trade lock evaluations for the Slide-Over Execution Drawer
  const liveLtp = activeSec
    ? activeSec.live_l2_depth?.ltp || activeSec.quant_anchors.kalman.raw_price || 0
    : 0;
  const effectiveOrderPrice = Number(tradePrice) > 0 ? Number(tradePrice) : liveLtp;
  const notionalInr = Math.max(0, tradeQty) * Math.max(0, effectiveOrderPrice);
  const collarDeviationPct =
    liveLtp > 0 ? (Math.abs(effectiveOrderPrice - liveLtp) / liveLtp) * 100 : 0;

  const lock1ContradictionsPass = activeSec
    ? activeSec.guardrail_telemetry.post_guardrail_contradictions === 0
    : false;
  const lock2Factor4bPass = activeSec
    ? !(Boolean(activeSec.active_factors?.factor_4b_deal_churn) && tradeSide === "BUY")
    : false;
  const lock3NotionalPass = notionalInr > 0 && notionalInr <= 25000;
  const lock4CollarPass = liveLtp > 0 && collarDeviationPct <= 2.0;

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-[#101216]">
      <div>
        {/* Animated Q-ARC Brand Logo */}
        <div className="border-b border-[#23262D] px-5 py-5">
          <Link
            href="/"
            className="group relative inline-flex items-center gap-2 py-1"
            aria-label="Q-ARC Home"
          >
            <span className="font-display text-2xl font-black uppercase tracking-tighter md:text-3xl">
              <span className="inline-block text-[#D2FF00] drop-shadow-[0_0_12px_rgba(210,255,0,0.65)] motion-safe:animate-pulse">
                Q
              </span>
              <span className="inline-block text-white transition-all duration-300 group-hover:tracking-normal group-hover:text-zinc-100">
                -ARC
              </span>
            </span>
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#D2FF00] opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D2FF00]" />
            </span>
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 left-0 h-[2px] w-7 bg-[#D2FF00] transition-all duration-300 group-hover:w-full"
            />
          </Link>
        </div>

        {/* Numbered 01..08 Sidebar Navigation */}
        <nav className="space-y-1 px-3 py-4" aria-label="Q-ARC Terminal Sections">
          <div className="mb-2 px-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            VIEWS // 01–08
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveNav(item.id);
                  setMobileSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left font-mono text-xs transition ${
                  isActive
                    ? "border border-[#D2FF00]/70 bg-[#D2FF00]/10 font-bold text-[#D2FF00]"
                    : "border border-transparent text-zinc-400 hover:border-[#23262D] hover:bg-[#090A0C] hover:text-white"
                }`}
              >
                <span className={`text-[10px] tabular-nums ${isActive ? "text-[#D2FF00]" : "text-zinc-500"}`}>
                  {item.num}
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Colab Config + Signed-in Google User + Sign Out */}
      <div className="space-y-2.5 border-t border-[#23262D] p-3">
        <button
          type="button"
          onClick={() => {
            setShowLlmConfig((s) => !s);
            setMobileSidebarOpen(false);
          }}
          className={`flex w-full items-center justify-between border px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition ${
            showLlmConfig
              ? "border-[#D2FF00] bg-[#D2FF00]/10 text-[#D2FF00]"
              : "border-[#23262D] bg-[#090A0C] text-zinc-300 hover:border-[#D2FF00]/60 hover:text-[#D2FF00]"
          }`}
        >
          <span className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5" />
            Colab 70B Config
          </span>
          <span className="text-[10px]">{showLlmConfig ? "OPEN" : "CFG"}</span>
        </button>

        {session?.user && (
          <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
            <div className="flex items-center gap-2">
              {session.user.image && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || "Google User"}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-7 w-7 border border-[#23262D] object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center bg-white">
                  <GoogleGIcon />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px] font-bold text-white">
                  {session.user.name || "Google Session"}
                </div>
                <div className="truncate font-mono text-[10px] text-zinc-500">
                  {session.user.email}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 border border-[#23262D] bg-[#101216] px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300 transition hover:border-[#FF3B5C] hover:text-[#FF3B5C]"
            >
              <LogOut className="h-3 w-3" /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Mandatory Google OAuth Session Verification
  if (authStatus === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#090A0C] p-6 text-zinc-100">
        <div className="w-full max-w-md border border-[#23262D] bg-[#101216] p-8 text-center">
          <div className="mb-6 inline-flex items-center gap-2">
            <span className="font-display text-3xl font-black uppercase tracking-tighter">
              <span className="inline-block text-[#D2FF00] drop-shadow-[0_0_12px_rgba(210,255,0,0.65)] motion-safe:animate-pulse">
                Q
              </span>
              <span className="inline-block text-white">-ARC</span>
            </span>
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#D2FF00] opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D2FF00]" />
            </span>
          </div>

          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center border border-[#D2FF00]/50 bg-[#D2FF00]/10">
            <RefreshCw className="h-5 w-5 animate-spin text-[#D2FF00]" />
          </div>

          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#D2FF00]">
            Verifying Q-ARC Institutional Session...
          </p>
          <div className="mt-5 space-y-2">
            <div className="h-2 w-full animate-pulse bg-[#23262D]" />
            <div className="mx-auto h-2 w-2/3 animate-pulse bg-[#23262D]/60" />
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthenticated" || !session?.user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090A0C] p-6 text-zinc-100">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_50%_20%,rgba(210,255,0,0.08),transparent_65%)]"
        />
        <div className="relative z-10 w-full max-w-md border border-[#23262D] bg-[#101216] p-8 shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#23262D] pb-5">
            <div className="inline-flex items-center gap-2 py-0.5">
              <span className="font-display text-3xl font-black uppercase tracking-tighter">
                <span className="inline-block text-[#D2FF00] drop-shadow-[0_0_12px_rgba(210,255,0,0.65)] motion-safe:animate-pulse">
                  Q
                </span>
                <span className="inline-block text-white">-ARC</span>
              </span>
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#D2FF00] opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D2FF00]" />
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#D2FF00]">
              <ShieldCheck className="h-3.5 w-3.5" />
              OAUTH GATE
            </span>
          </div>

          <div className="mt-6">
            <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white">
              Institutional Access Required
            </h1>
            <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-400">
              Sign in with Google to unlock live NSE 8D state-space telemetry, E01–E15 ClaimVerifier
              audits, and the 4-lock Risk Gate terminal.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="flex w-full items-center justify-center gap-2.5 border border-[#D2FF00] bg-[#D2FF00] px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white active:translate-y-0"
            >
              <span className="flex h-5 w-5 items-center justify-center bg-white">
                <GoogleGIcon />
              </span>
              <span>Continue with Google →</span>
            </button>

            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 border border-[#23262D] bg-[#090A0C] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
            >
              ← Back to Landing Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#090A0C] text-zinc-100">
      {/* Desktop Fixed Left Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[#23262D] bg-[#101216] lg:flex lg:flex-col">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Collapsible Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-64 flex-col border-r border-[#23262D] bg-[#101216]">
            <button
              type="button"
              aria-label="Close navigation drawer"
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute right-3 top-4 border border-[#23262D] bg-[#090A0C] p-1.5 text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 border-b border-[#23262D] bg-[#090A0C]/90 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            {/* Left: Mobile Trigger + Title + Home */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex items-center justify-center border border-[#23262D] bg-[#101216] p-2 text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>

              <h1 className="font-display text-xl font-black uppercase tracking-[-0.03em] text-white sm:text-2xl">
                {activeNavMeta.headerTitle} <span className="text-[#D2FF00]">//</span> LIVE TERMINAL
              </h1>

              <Link
                href="/"
                className="inline-flex items-center gap-1 border border-[#23262D] bg-[#101216] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
              >
                <ArrowLeft className="h-3 w-3" /> HOME
              </Link>
            </div>

            {/* Right: Search + Plain English + Live Status + Run 70B + Risk Gate */}
            <div className="flex flex-wrap items-center gap-2">
              <NseStockSearch onSubmit={handleSearchSubmit} busy={analyzing} />

              <button
                type="button"
                onClick={() => setShowPlainEnglish((s) => !s)}
                aria-pressed={showPlainEnglish}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition ${
                  showPlainEnglish
                    ? "border-[#D2FF00]/60 bg-[#D2FF00]/10 text-[#D2FF00]"
                    : "border-[#23262D] bg-[#101216] text-zinc-400 hover:text-white"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                PLAIN ENGLISH: {showPlainEnglish ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                onClick={() => setShowLlmConfig((s) => !s)}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition ${
                  isLiveApi
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                    : "border-[#23262D] bg-[#101216] text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                }`}
                title={`API: ${apiBaseDisplay}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLiveApi ? "bg-emerald-400 motion-safe:animate-pulse" : "bg-[#10B981]"
                  }`}
                />
                <span>{dataSourceLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => handleRunLiveAnalyze()}
                disabled={analyzing}
                className="inline-flex items-center gap-1.5 border border-[#23262D] bg-[#101216] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em] text-zinc-100 transition hover:border-[#D2FF00] hover:text-[#D2FF00] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? "animate-spin" : ""}`} />
                {analyzing ? "Analyzing..." : "Run Live 70B BCP"}
              </button>

              <button
                type="button"
                onClick={() => setTradeDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white active:translate-y-0"
              >
                TRADE / RISK GATE →
              </button>
            </div>
          </div>

          {/* Compact Quick-Pick Watchlist Sub-bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#23262D] bg-[#101216]/80 px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                WATCHLIST //
              </span>
              {WATCHLIST.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSelectTicker(t)}
                  className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] font-bold uppercase transition ${
                    selectedTicker === t
                      ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                      : "border-[#23262D] bg-[#090A0C] text-zinc-400 hover:border-zinc-500 hover:text-white"
                  }`}
                >
                  <StockLogo symbol={t} size="xs" />
                  <span>{t}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
              {activeSec && (
                <span className="inline-flex items-center gap-1.5 border border-[#23262D] bg-[#090A0C] px-2 py-1 text-zinc-300">
                  <StockLogo symbol={activeSec.ticker} size="xs" />
                  <strong className="text-white">{activeSec.ticker}</strong>
                  <span className="text-zinc-500">· {activeSec.date}</span>
                </span>
              )}
              {activeSec?.active_factors?.factor_4b_deal_churn && (
                <span className="border border-[#FF3B5C]/70 bg-[#FF3B5C]/15 px-2 py-1 font-bold uppercase text-[#FF3B5C]">
                  FACTOR 4B CHURN LOCK
                </span>
              )}
              {activeSec?.live_l2_depth?.spoofing_anomaly_detected && (
                <span className="border border-[#FF3B5C]/70 bg-[#FF3B5C]/15 px-2 py-1 font-bold uppercase text-[#FF3B5C]">
                  E09 SPOOFING WALL
                </span>
              )}
            </div>
          </div>

          {/* Collapsible Colab 70B LLM Endpoint Bar */}
          {showLlmConfig && (
            <div className="border-t border-[#23262D] bg-[#101216] px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#D2FF00]">
                  POST /api/config/llm_endpoint
                </span>
                <input
                  type="url"
                  value={llmUrlInput}
                  onChange={(e) => setLlmUrlInput(e.target.value)}
                  placeholder="https://xxxx.trycloudflare.com/v1"
                  className="min-w-[240px] flex-1 border border-[#23262D] bg-[#090A0C] px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:border-[#D2FF00] focus:outline-none"
                />
                <input
                  type="password"
                  value={llmAdminSecret}
                  onChange={(e) => setLlmAdminSecret(e.target.value)}
                  placeholder="X-QARC-Admin-Secret (optional)"
                  className="w-56 border border-[#23262D] bg-[#090A0C] px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:border-[#D2FF00] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveLlmEndpoint}
                  disabled={savingLlmConfig}
                  className="border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-bold uppercase text-[#090A0C] transition hover:bg-white disabled:opacity-50"
                >
                  {savingLlmConfig ? "Saving..." : "Update Endpoint"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLlmConfig(false)}
                  className="border border-[#23262D] bg-[#090A0C] px-3 py-1.5 uppercase text-zinc-400 hover:border-zinc-500 hover:text-white"
                >
                  Close
                </button>
                {llmConfigStatus && (
                  <span className="text-[11px] text-zinc-200">{llmConfigStatus}</span>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Workspace Canvas */}
        <main className="mx-auto w-full max-w-[1480px] flex-1 space-y-5 p-4 sm:p-6">
          {apiNotice && (
            <div className="flex items-center justify-between border border-[#FF3B5C]/60 bg-[#FF3B5C]/10 px-4 py-2.5 font-mono text-xs text-[#FF3B5C]">
              <span>{apiNotice}</span>
              <button
                type="button"
                onClick={() => setApiNotice(null)}
                className="ml-4 border border-[#FF3B5C]/50 px-2 py-0.5 text-[10px] uppercase"
              >
                Dismiss
              </button>
            </div>
          )}

          {!activeSec && activeNav !== "screener" && activeNav !== "portfolio" && activeNav !== "trades" ? (
            <SpotlightCard className="border-[#23262D] p-8">
              <div className="flex flex-col items-center justify-center gap-3 text-center font-mono text-xs text-zinc-400">
                <div className="flex items-center gap-3">
                  <StockLogo symbol={selectedTicker} size="lg" />
                  <span className="font-display text-2xl font-bold uppercase text-white">
                    {selectedTicker}
                  </span>
                </div>
                {!snapshot && dataSourceLabel === "LOADING" ? (
                  "LOADING Q-ARC TELEMETRY..."
                ) : analyzing ? (
                  <span className="text-[#D2FF00]">
                    RUNNING LIVE POST /api/bcp_analyze FOR {selectedTicker}...
                  </span>
                ) : (
                  <>
                    <span>
                      NO TELEMETRY FOR {selectedTicker} IN SNAPSHOT — CLICK &ldquo;RUN LIVE 70B BCP&rdquo; TO COMPUTE FROM FASTAPI.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRunLiveAnalyze()}
                      className="mt-2 inline-flex items-center gap-2 border border-[#D2FF00] bg-[#D2FF00] px-4 py-2 font-bold uppercase text-[#090A0C] transition hover:bg-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Run Live 70B BCP
                    </button>
                  </>
                )}
              </div>
            </SpotlightCard>
          ) : (
            <>
              {/* ===================================================================== */}
              {/* 01 OVERVIEW VIEW: 4 SLIM KPI CARDS + 2x2 MULTI-GRAPH BENTO GRID       */}
              {/* ===================================================================== */}
              {activeNav === "overview" && activeSec && (
                <>
                  {/* ROW 1 — 4 Equal Slim SpotlightCard KPI Cards */}
                  <section
                    aria-label="Key Telemetry Metrics"
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
                  >
                    {/* KPI 01: RAW LTP & KALMAN */}
                    <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                      <div className="flex h-full flex-col justify-between gap-2">
                        <div className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.14em]">
                          <span>
                            <span className="text-[#D2FF00]">01</span>{" "}
                            <span className="text-zinc-200">// RAW LTP &amp; KALMAN</span>
                          </span>
                          <InfoTooltip text="Raw spot price vs 2D Kalman Filter fair trend price (strips bid-ask microstructure noise)." />
                        </div>
                        <div className="font-display text-3xl font-bold tabular-nums text-white">
                          ₹{activeSec.quant_anchors.kalman.raw_price.toFixed(2)}
                        </div>
                        <div className="font-mono text-xs tabular-nums text-zinc-400">
                          Kalman Fair ₹{activeSec.quant_anchors.kalman.filtered_price.toFixed(2)} ·{" "}
                          <span
                            className={
                              activeSec.quant_anchors.kalman.trend_velocity_pct_per_day >= 0
                                ? "text-[#D2FF00]"
                                : "text-[#FF3B5C]"
                            }
                          >
                            {activeSec.quant_anchors.kalman.trend_velocity_pct_per_day >= 0 ? "+" : ""}
                            {activeSec.quant_anchors.kalman.trend_velocity_pct_per_day.toFixed(3)}%/d
                          </span>
                        </div>
                        {showPlainEnglish && kpiPlain && (
                          <p className="border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                            {kpiPlain.kalman}
                          </p>
                        )}
                      </div>
                    </SpotlightCard>

                    {/* KPI 02: HMM REGIME (Active #D2FF00 border glow when Markup) */}
                    <SpotlightCard
                      accentHex={regimeStyle.spotlightHex}
                      className={
                        isMarkupRegime
                          ? "border-[#D2FF00] p-5 shadow-[0_0_24px_rgba(210,255,0,0.12)]"
                          : "border-[#23262D] p-5 hover:border-[#D2FF00]/60"
                      }
                    >
                      <div className="flex h-full flex-col justify-between gap-2">
                        <div className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.14em]">
                          <span>
                            <span className="text-[#D2FF00]">02</span>{" "}
                            <span className="text-zinc-200">// HMM REGIME</span>
                          </span>
                          <InfoTooltip text="Causal 4-state Gaussian HMM phase fitted on historical returns & volume without look-ahead bias." />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div
                              className={`font-display text-2xl font-black uppercase tracking-tight ${regimeStyle.textCls}`}
                            >
                              {activeSec.quant_anchors.hmm.current_regime}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-400">
                              Persist {(activeSec.quant_anchors.hmm.persistence * 100).toFixed(0)}%
                            </div>
                          </div>
                          <RegimeConfidenceGauge
                            confidence={activeSec.quant_anchors.hmm.confidence}
                            regime={activeSec.quant_anchors.hmm.current_regime}
                          />
                        </div>
                        {showPlainEnglish && kpiPlain && (
                          <p className="border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                            {kpiPlain.hmm}
                          </p>
                        )}
                      </div>
                    </SpotlightCard>

                    {/* KPI 03: GARCH(1,1) VOL */}
                    <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                      <div className="flex h-full flex-col justify-between gap-2">
                        <div className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.14em]">
                          <span>
                            <span className="text-[#D2FF00]">03</span>{" "}
                            <span className="text-zinc-200">// GARCH(1,1) VOL</span>
                          </span>
                          <InfoTooltip text="GARCH(1,1) MLE annualized volatility forecast and conditional hazard ratio relative to long-run baseline." />
                        </div>
                        <div className="font-display text-3xl font-bold tabular-nums text-white">
                          {activeSec.quant_anchors.garch.forecast_annualized_vol_pct.toFixed(1)}%
                        </div>
                        <div>
                          <span
                            className={`inline-block border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums uppercase ${
                              activeSec.quant_anchors.garch.volatility_hazard_ratio >= 1.3
                                ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                                : "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                            }`}
                          >
                            {activeSec.quant_anchors.garch.volatility_hazard_ratio.toFixed(2)}x HAZARD
                          </span>
                        </div>
                        {showPlainEnglish && kpiPlain && (
                          <p className="border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                            {kpiPlain.garch}
                          </p>
                        )}
                      </div>
                    </SpotlightCard>

                    {/* KPI 04: MC CVAR(95%) CAP */}
                    <SpotlightCard
                      accentHex="rgba(255, 59, 92, 0.14)"
                      className="border-[#23262D] p-5 hover:border-[#FF3B5C]/70"
                    >
                      <div className="flex h-full flex-col justify-between gap-2">
                        <div className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.14em]">
                          <span>
                            <span className="text-[#D2FF00]">04</span>{" "}
                            <span className="text-zinc-200">// MC CVAR(95%) CAP</span>
                          </span>
                          <InfoTooltip text="10,000-path Student-t Monte Carlo Expected Shortfall (worst 5% tail) & ClaimVerifier contradiction count." />
                        </div>
                        <div className="font-display text-3xl font-bold tabular-nums text-[#FF3B5C]">
                          {activeSec.quant_anchors.monte_carlo.cvar_95_expected_shortfall_pct.toFixed(
                            2
                          )}
                          %
                        </div>
                        <div>
                          <span className="inline-block border border-[#23262D] bg-[#090A0C] px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums uppercase text-zinc-200">
                            CAP{" "}
                            {activeSec.quant_anchors.monte_carlo.recommended_max_allocation_cap_pct.toFixed(
                              1
                            )}
                            % · {activeSec.guardrail_telemetry.post_guardrail_contradictions} CONTRA
                          </span>
                        </div>
                        {showPlainEnglish && kpiPlain && (
                          <p className="border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                            {kpiPlain.monteCarlo}
                          </p>
                        )}
                      </div>
                    </SpotlightCard>
                  </section>

                  {/* ROW 2 — 2x2 Multi-Graph Bento Grid */}
                  <section
                    aria-label="Multi-Graph Quantitative Workspace"
                    className="grid grid-cols-1 gap-5 xl:grid-cols-2"
                  >
                    {/* TOP-LEFT CARD: 01 // ACTIVE WATCHLIST & SIGNALS */}
                    <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                      <SectionCodeHeader
                        code="01"
                        title="ACTIVE WATCHLIST & SIGNALS"
                        rightSlot={
                          <button
                            type="button"
                            onClick={() => setActiveNav("screener")}
                            className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#D2FF00] transition hover:underline"
                          >
                            VIEW ALL →
                          </button>
                        }
                      />

                      <div className="overflow-x-auto border border-[#23262D] bg-[#090A0C]">
                        <table className="w-full border-collapse font-mono text-xs tabular-nums">
                          <thead>
                            <tr className="border-b border-[#23262D] text-left text-[10px] uppercase tracking-wider text-zinc-500">
                              <th className="px-3.5 py-2.5">TICKER</th>
                              <th className="px-3.5 py-2.5">PRICE</th>
                              <th className="px-3.5 py-2.5">VELOCITY</th>
                              <th className="px-3.5 py-2.5 text-right">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#23262D]">
                            {watchlistRows.map((row) => {
                              const st = getRegimeStyle(row.regime);
                              const isSelected = row.ticker === selectedTicker;
                              return (
                                <tr
                                  key={row.ticker}
                                  onClick={() => handleSelectTicker(row.ticker)}
                                  className={`cursor-pointer transition ${
                                    isSelected ? "bg-[#D2FF00]/[0.06]" : "hover:bg-[#101216]"
                                  }`}
                                >
                                  <td className="px-3.5 py-3 font-bold text-white">
                                    <span className="inline-flex items-center gap-2.5">
                                      <StockLogo symbol={row.ticker} size="sm" />
                                      <span className={isSelected ? "text-[#D2FF00]" : "text-white"}>
                                        {row.ticker}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-3 text-zinc-200">
                                    {row.price !== null ? `₹${row.price.toFixed(2)}` : "—"}
                                  </td>
                                  <td
                                    className={`px-3.5 py-3 font-semibold ${
                                      row.vel === null
                                        ? "text-zinc-500"
                                        : row.vel >= 0
                                        ? "text-[#D2FF00]"
                                        : "text-[#FF3B5C]"
                                    }`}
                                  >
                                    {row.vel !== null
                                      ? `${row.vel >= 0 ? "+" : ""}${row.vel.toFixed(2)}%/d`
                                      : "—"}
                                  </td>
                                  <td className="px-3.5 py-3 text-right">
                                    <span
                                      className={`inline-block border px-2 py-0.5 text-[10px] font-bold uppercase ${st.pillCls}`}
                                    >
                                      {row.regime}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {showPlainEnglish && kpiPlain && (
                        <p className="mt-3 font-mono text-[11px] text-zinc-400">
                          {kpiPlain.tickerDate} · Click any row to switch active terminal security.
                        </p>
                      )}
                    </SpotlightCard>

                    {/* TOP-RIGHT CARD: 02 // KALMAN TRAJECTORY & FORECAST */}
                    <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                      <SectionCodeHeader
                        code="02"
                        title="KALMAN TRAJECTORY & FORECAST"
                        rightSlot={
                          <div className="flex flex-wrap border border-[#23262D] bg-[#090A0C] p-0.5 font-mono text-[10px]">
                            {(
                              [
                                { id: "kalman", label: "SPOT / KALMAN" },
                                { id: "cone", label: "E14 5D CONE" },
                                { id: "candles", label: "CANDLES" },
                              ] as const
                            ).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setTrajTab(t.id)}
                                className={`px-2.5 py-1 font-bold uppercase transition ${
                                  trajTab === t.id
                                    ? "bg-[#D2FF00] text-[#090A0C]"
                                    : "text-zinc-400 hover:text-white"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        }
                      />

                      {trajTab === "kalman" && (
                        <KalmanTrajectorySvg
                          series={activeSec.series || []}
                          currentFilteredPrice={activeSec.quant_anchors.kalman.filtered_price}
                          currentRawPrice={activeSec.quant_anchors.kalman.raw_price}
                        />
                      )}

                      {trajTab === "cone" && (
                        <E14ConeSvg
                          currentPrice={activeSec.quant_anchors.kalman.raw_price}
                          forecastView={forecastView}
                          rawForecast={activeSec.price_forecast}
                          onRunLive={() => handleRunLiveAnalyze()}
                          analyzing={analyzing}
                        />
                      )}

                      {trajTab === "candles" && (
                        <div className="overflow-hidden border border-[#23262D] bg-[#090A0C]">
                          <StateSpaceChart
                            ticker={activeSec.ticker}
                            series={activeSec.series || []}
                            currentRegime={activeSec.quant_anchors.hmm.current_regime}
                          />
                        </div>
                      )}
                    </SpotlightCard>

                    {/* BOTTOM-LEFT CARD: 03 // REGIME & SIGNAL DISTRIBUTION */}
                    <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                      <SectionCodeHeader
                        code="03"
                        title="REGIME & SIGNAL DISTRIBUTION"
                        rightSlot={
                          <div className="flex flex-wrap border border-[#23262D] bg-[#090A0C] p-0.5 font-mono text-[10px]">
                            {(
                              [
                                { id: "hmm", label: "HMM STATES" },
                                { id: "vel_rsi", label: "VELOCITY & RSI" },
                                { id: "twins", label: "E15 TWINS" },
                              ] as const
                            ).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setDistTab(t.id)}
                                className={`px-2.5 py-1 font-bold uppercase transition ${
                                  distTab === t.id
                                    ? "bg-[#D2FF00] text-[#090A0C]"
                                    : "text-zinc-400 hover:text-white"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        }
                      />

                      {distTab === "hmm" && (
                        <HmmStatesBarChartSvg
                          probabilities={activeSec.quant_anchors.hmm.probabilities || {}}
                          currentRegime={activeSec.quant_anchors.hmm.current_regime}
                        />
                      )}

                      {distTab === "vel_rsi" && (
                        <VelocityRsiDualSvg series={activeSec.series || []} />
                      )}

                      {distTab === "twins" && (
                        <E15TwinsBarView
                          vectorTwins={activeSec.vector_twins}
                          ticker={activeSec.ticker}
                          onRunLive={() => handleRunLiveAnalyze()}
                          analyzing={analyzing}
                        />
                      )}
                    </SpotlightCard>

                    {/* BOTTOM-RIGHT CARD: 04 // PORTFOLIO & NEON LEDGER */}
                    <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                      <SectionCodeHeader
                        code="04"
                        title="PORTFOLIO & NEON LEDGER"
                        rightSlot={
                          <div className="flex flex-wrap border border-[#23262D] bg-[#090A0C] p-0.5 font-mono text-[10px]">
                            {(
                              [
                                { id: "portfolio", label: "PORTFOLIO" },
                                { id: "donut", label: "DONUT RING" },
                                { id: "trades", label: "TRADES" },
                                { id: "verdict", label: "70B VERDICT" },
                              ] as const
                            ).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setLedgerTab(t.id)}
                                className={`px-2.5 py-1 font-bold uppercase transition ${
                                  ledgerTab === t.id
                                    ? "bg-[#D2FF00] text-[#090A0C]"
                                    : "text-zinc-400 hover:text-white"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        }
                      />

                      {ledgerTab === "portfolio" && allocationBarModel && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                            <span>
                              {allocationBarModel.isLive
                                ? `LIVE NEON PORTFOLIO (₹${allocationBarModel.totalCapital.toLocaleString("en-IN")})`
                                : `SNAPSHOT CAP PREVIEW (₹${allocationBarModel.totalCapital.toLocaleString("en-IN")})`}
                            </span>
                            <span className="text-[#D2FF00]">
                              {allocationBarModel.isLive ? "PERSISTED" : "PREVIEW"}
                            </span>
                          </div>

                          {/* Segmented Allocation Pill Bar with % labels inside */}
                          <div className="flex h-6 w-full overflow-hidden border border-[#23262D] bg-[#090A0C]">
                            {allocationBarModel.segments.map((seg) => (
                              <div
                                key={seg.label}
                                title={`${seg.label}: ${seg.pct.toFixed(1)}% (₹${seg.inr.toLocaleString("en-IN")})`}
                                style={{
                                  width: `${Math.max(4, seg.pct)}%`,
                                  backgroundColor: seg.color,
                                }}
                                className="flex items-center justify-center overflow-hidden border-r border-[#090A0C] px-1 font-mono text-[10px] font-bold tabular-nums text-[#090A0C] last:border-r-0"
                              >
                                {seg.pct >= 11 ? `${seg.pct.toFixed(0)}%` : ""}
                              </div>
                            ))}
                          </div>

                          {/* 3-4 Allocation Rows */}
                          <div className="divide-y divide-[#23262D] border border-[#23262D] bg-[#090A0C] font-mono text-xs tabular-nums">
                            {allocationBarModel.segments.slice(0, 4).map((seg) => (
                              <div
                                key={seg.label}
                                className="flex items-center justify-between px-3 py-2"
                              >
                                <span className="flex items-center gap-2 font-semibold text-zinc-200">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0"
                                    style={{ backgroundColor: seg.color }}
                                  />
                                  <span>{seg.label}</span>
                                </span>
                                <div className="flex items-center gap-4">
                                  <span className="font-bold text-[#D2FF00]">
                                    {seg.pct.toFixed(1)}%
                                  </span>
                                  <span className="w-24 text-right font-bold text-white">
                                    ₹{seg.inr.toLocaleString("en-IN")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Bottom Row: Quarantined pill + Optimize ₹1,00,000 */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            {allocationBarModel.quarantinedTickers.length > 0 ? (
                              <span className="border border-[#FF3B5C]/60 bg-[#FF3B5C]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#FF3B5C]">
                                QUARANTINED (₹0):{" "}
                                {allocationBarModel.quarantinedTickers
                                  .map((q) => q.ticker)
                                  .join(", ")}
                              </span>
                            ) : (
                              <span className="border border-[#23262D] bg-[#090A0C] px-2.5 py-1 font-mono text-[10px] uppercase text-zinc-400">
                                QUARANTINED (₹0): NONE
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={handleOptimize100kPortfolio}
                              disabled={generatingPortfolio}
                              className="border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white disabled:opacity-50"
                            >
                              {generatingPortfolio ? "Optimizing..." : "Optimize ₹1,00,000"}
                            </button>
                          </div>
                        </div>
                      )}

                      {ledgerTab === "donut" && allocationBarModel && (
                        <div className="space-y-3">
                          <PortfolioDonutRingSvg
                            segments={allocationBarModel.segments}
                            totalCapital={allocationBarModel.totalCapital}
                            quarantinedCount={allocationBarModel.quarantinedTickers.length}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[10px] uppercase text-zinc-400">
                              {allocationBarModel.isLive
                                ? "LIVE NEON PORTFOLIO DISTRIBUTION"
                                : "SNAPSHOT REGIME-CAP PREVIEW"}
                            </span>
                            <button
                              type="button"
                              onClick={handleOptimize100kPortfolio}
                              disabled={generatingPortfolio}
                              className="border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white disabled:opacity-50"
                            >
                              {generatingPortfolio ? "Optimizing..." : "Optimize ₹1,00,000"}
                            </button>
                          </div>
                        </div>
                      )}

                      {ledgerTab === "trades" && (
                        <div className="space-y-3 font-mono text-xs tabular-nums">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase text-zinc-400">
                              LATEST NEON EXECUTIONS (/api/trades)
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleRefreshTrades}
                                disabled={loadingTrades}
                                className="border border-[#23262D] bg-[#090A0C] px-2.5 py-1 text-[10px] font-bold uppercase text-[#D2FF00] hover:border-[#D2FF00]"
                              >
                                {loadingTrades ? "Syncing..." : "Sync Neon"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveNav("trades")}
                                className="text-[10px] font-bold uppercase text-zinc-300 hover:text-[#D2FF00]"
                              >
                                Full Ledger →
                              </button>
                            </div>
                          </div>

                          {trades && trades.length ? (
                            <div className="divide-y divide-[#23262D] border border-[#23262D] bg-[#090A0C]">
                              {trades.slice(0, 4).map((tr) => {
                                const ok =
                                  tr.status.includes("FILLED") || tr.status.includes("SUBMITTED");
                                return (
                                  <div
                                    key={tr.id}
                                    className="flex items-center justify-between gap-2 px-3 py-2.5"
                                  >
                                    <span className="flex items-center gap-2">
                                      <StockLogo symbol={tr.ticker} size="xs" />
                                      <strong className="text-white">#{tr.id} {tr.ticker}</strong>
                                      <span className="text-zinc-400">
                                        {tr.action} {tr.quantity} @ ₹{Number(tr.limit_price).toFixed(2)}
                                      </span>
                                    </span>
                                    <span
                                      className={`border px-1.5 py-0.5 text-[10px] font-bold ${
                                        ok
                                          ? "border-[#D2FF00]/50 bg-[#D2FF00]/10 text-[#D2FF00]"
                                          : "border-[#FF3B5C]/50 bg-[#FF3B5C]/10 text-[#FF3B5C]"
                                      }`}
                                    >
                                      {tr.status}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="border border-[#23262D] bg-[#090A0C] p-5 text-zinc-500">
                              NO TRADES RETURNED FROM NEON YET.
                            </div>
                          )}
                        </div>
                      )}

                      {ledgerTab === "verdict" && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            {summaryBullets.slice(0, 3).map((b) => (
                              <div
                                key={b.label}
                                className="border border-[#23262D] bg-[#090A0C] p-2.5"
                              >
                                <div
                                  className={`font-mono text-[10px] font-bold uppercase ${
                                    b.tone === "signal"
                                      ? "text-[#FF3B5C]"
                                      : b.tone === "volt"
                                      ? "text-[#D2FF00]"
                                      : "text-zinc-400"
                                  }`}
                                >
                                  {b.label}
                                </div>
                                <p className="mt-1 font-sans text-xs leading-snug text-zinc-200">
                                  {b.text}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setActiveNav("ai_advisor")}
                              className="border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:bg-white"
                            >
                              Open 7-Field BCP →
                            </button>
                          </div>
                        </div>
                      )}
                    </SpotlightCard>
                  </section>

                  {/* ROW 3 — 05 // MULTI-DIMENSIONAL QUANT ANALYTICS — 2x2 GRAPH MATRIX */}
                  <section aria-label="Multi-Dimensional Quant Analytics Matrix" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#23262D] pb-2 font-mono text-xs font-bold uppercase tracking-[0.16em]">
                      <span>
                        <span className="text-[#D2FF00]">05</span>{" "}
                        <span className="text-zinc-200">
                          // MULTI-DIMENSIONAL QUANT ANALYTICS — 2×2 GRAPH MATRIX
                        </span>
                      </span>
                      <span className="text-[10px] font-normal text-zinc-500">
                        CAUSAL REAL TELEMETRY · {activeSec.ticker}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                      {/* Panel A: 8D State-Space Radar */}
                      <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                        <SectionCodeHeader
                          code="05"
                          title="8D STATE-SPACE RADAR FINGERPRINT"
                          rightSlot={
                            <InfoTooltip text="8 normalized telemetry axes comparing 1D return, Kalman velocity, SNR, GARCH hazard, 60D Hurst, delivery %, RSI(14), and HMM confidence against a 0.50 neutral octagon." />
                          }
                        />
                        <StateSpaceRadar8dSvg security={activeSec} />
                      </SpotlightCard>

                      {/* Panel B: PC1 x PC2 Regime Scatter Manifold */}
                      <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                        <SectionCodeHeader
                          code="06"
                          title="PC1 × PC2 REGIME SCATTER MANIFOLD"
                          rightSlot={
                            <InfoTooltip text="Plots trailing 60 NSE sessions across Momentum/Velocity (X) vs Institutional Delivery (Y) colored by HMM regime, with a 10-session trail and pulsing CURRENT session ring." />
                          }
                        />
                        <RegimeScatterManifoldSvg
                          series={activeSec.series || []}
                          currentRegime={activeSec.quant_anchors.hmm.current_regime}
                        />
                      </SpotlightCard>

                      {/* Panel C: 10K Monte Carlo Student-t Tail Density & CVaR(95%) */}
                      <SpotlightCard
                        accentHex="rgba(255, 59, 92, 0.14)"
                        className="border-[#23262D] p-5 hover:border-[#FF3B5C]/70"
                      >
                        <SectionCodeHeader
                          code="07"
                          title="10K MONTE CARLO TAIL DENSITY & CVAR(95%)"
                          rightSlot={
                            <InfoTooltip text="Student-t (df=5) return density centered at the 10-day simulated median, shading the worst 5% tail (<= VaR95) in crimson with target-hit vs stop-breach odds." />
                          }
                        />
                        <MonteCarloTailDensitySvg
                          monteCarlo={activeSec.quant_anchors.monte_carlo}
                        />
                      </SpotlightCard>

                      {/* Panel D: Delivery % vs Volume Microstructure / Kalman Noise Oscillator */}
                      <SpotlightCard className="border-[#23262D] p-5 hover:border-[#D2FF00]/60">
                        <SectionCodeHeader
                          code="08"
                          title={
                            microTab === "delivery"
                              ? "DELIVERY % VS VOLUME MICROSTRUCTURE"
                              : "KALMAN MICROSTRUCTURE NOISE OSCILLATOR"
                          }
                          rightSlot={
                            <div className="flex flex-wrap border border-[#23262D] bg-[#090A0C] p-0.5 font-mono text-[10px]">
                              {(
                                [
                                  { id: "delivery", label: "DELIVERY / VOL" },
                                  { id: "oscillator", label: "KALMAN NOISE OSCILLATOR" },
                                ] as const
                              ).map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setMicroTab(t.id)}
                                  className={`px-2.5 py-1 font-bold uppercase transition ${
                                    microTab === t.id
                                      ? "bg-[#D2FF00] text-[#090A0C]"
                                      : "text-zinc-400 hover:text-white"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          }
                        />
                        {microTab === "delivery" ? (
                          <DeliveryVolumeMicrostructureSvg series={activeSec.series || []} />
                        ) : (
                          <KalmanNoiseOscillatorSvg series={activeSec.series || []} />
                        )}
                      </SpotlightCard>
                    </div>
                  </section>
                </>
              )}

              {/* ===================================================================== */}
              {/* 02 AI ADVISOR 70B VIEW                                                */}
              {/* ===================================================================== */}
              {activeNav === "ai_advisor" && activeSec && (
                <div className="space-y-5">
                  <SpotlightCard className="border-[#23262D] p-6">
                    <SectionCodeHeader
                      code="02"
                      title="AI ADVISOR 70B // NEMOTRON LORA & GUARDRAIL"
                      rightSlot={
                        <div className="flex items-center gap-2">
                          <span className="border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#D2FF00]">
                            {activeSec.guardrail_telemetry.verification_status}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveNav("overview")}
                            className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                          >
                            ← Back to 01 Overview
                          </button>
                        </div>
                      }
                    />

                    {/* 4 Plain-English What This Means For You cards */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {summaryBullets.map((b) => (
                        <div
                          key={b.label}
                          className={`border bg-[#090A0C] p-3.5 ${
                            b.tone === "signal"
                              ? "border-[#FF3B5C]/50"
                              : b.tone === "volt"
                              ? "border-[#D2FF00]/50"
                              : "border-[#23262D]"
                          }`}
                        >
                          <div
                            className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                              b.tone === "signal"
                                ? "text-[#FF3B5C]"
                                : b.tone === "volt"
                                ? "text-[#D2FF00]"
                                : "text-zinc-400"
                            }`}
                          >
                            {b.label}
                          </div>
                          <p className="mt-1.5 font-sans text-xs leading-relaxed text-zinc-200">
                            {b.text}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* E14 5-Day Forecast Cone */}
                    <div className="mt-5">
                      <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#D2FF00]">
                        E14 5-DAY CAUSAL FORECAST CONE
                      </div>
                      <E14ConeSvg
                        currentPrice={activeSec.quant_anchors.kalman.raw_price}
                        forecastView={forecastView}
                        rawForecast={activeSec.price_forecast}
                        onRunLive={() => handleRunLiveAnalyze()}
                        analyzing={analyzing}
                      />
                    </div>

                    {/* Verified 7-Field BCP Profile Cards */}
                    <div className="mt-5">
                      <div className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                        VERIFIED 7-FIELD BCP PROFILE ({activeSec.ticker})
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {Object.entries(activeSec.guardrail_telemetry.field_badges || {}).map(
                          ([key, fb]) => {
                            const fieldMeta = getBcpFieldPlainEnglish(key, fb.verified);
                            return (
                              <div
                                key={key}
                                className="border border-[#23262D] bg-[#090A0C] p-3.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                                    {BCP_LABELS[key] || key}
                                    <InfoTooltip
                                      text={fieldMeta.conceptTooltip}
                                      label={`Explain ${BCP_LABELS[key] || key}`}
                                    />
                                  </span>
                                  {renderBadge(fb.badge, fb.status)}
                                </div>
                                <div className="mt-1.5 font-mono text-xs font-bold text-white">
                                  {fb.verified}
                                </div>
                                {showPlainEnglish && (
                                  <div className="mt-1.5 font-sans text-xs leading-snug text-zinc-400">
                                    {fieldMeta.plainNote}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </SpotlightCard>
                </div>
              )}

              {/* ===================================================================== */}
              {/* 03 STATE-SPACE VIEW                                                   */}
              {/* ===================================================================== */}
              {activeNav === "statespace" && activeSec && (
                <div className="space-y-5">
                  <SpotlightCard className="border-[#23262D] p-6">
                    <SectionCodeHeader
                      code="03"
                      title={`STATE-SPACE & HMM // ${activeSec.ticker}`}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => setActiveNav("overview")}
                          className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                        >
                          ← Back to 01 Overview
                        </button>
                      }
                    />

                    <div className="mb-4 grid grid-cols-2 gap-3 font-mono text-xs tabular-nums sm:grid-cols-4">
                      <div className="border border-[#23262D] bg-[#090A0C] p-3">
                        <div className="text-[10px] text-zinc-500">HMM REGIME</div>
                        <div className={`mt-1 font-bold uppercase ${regimeStyle.textCls}`}>
                          {activeSec.quant_anchors.hmm.current_regime}
                        </div>
                      </div>
                      <div className="border border-[#23262D] bg-[#090A0C] p-3">
                        <div className="text-[10px] text-zinc-500">ENTROPY</div>
                        <div className="mt-1 font-bold text-white">
                          {activeSec.quant_anchors.hmm.entropy_bits.toFixed(2)} bits
                        </div>
                      </div>
                      <div className="border border-[#23262D] bg-[#090A0C] p-3">
                        <div className="text-[10px] text-zinc-500">PERSISTENCE</div>
                        <div className="mt-1 font-bold text-[#D2FF00]">
                          {(activeSec.quant_anchors.hmm.persistence * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="border border-[#23262D] bg-[#090A0C] p-3">
                        <div className="text-[10px] text-zinc-500">60D HURST</div>
                        <div className="mt-1 font-bold text-white">
                          {(activeSec.hurst_60d ?? 0.5).toFixed(2)} (
                          {activeSec.hurst_routing_mode || "CAUSAL"})
                        </div>
                      </div>
                    </div>

                    <div className="overflow-hidden border border-[#23262D] bg-[#090A0C]">
                      <StateSpaceChart
                        ticker={activeSec.ticker}
                        series={activeSec.series || []}
                        currentRegime={activeSec.quant_anchors.hmm.current_regime}
                      />
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <div>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          KALMAN VELOCITY &amp; RSI(14)
                        </div>
                        <VelocityRsiDualSvg series={activeSec.series || []} />
                      </div>
                      <div>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          HMM 4-STATE CALIBRATED PROBABILITIES
                        </div>
                        <HmmStatesBarChartSvg
                          probabilities={activeSec.quant_anchors.hmm.probabilities || {}}
                          currentRegime={activeSec.quant_anchors.hmm.current_regime}
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <div>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          05 // 8D STATE-SPACE RADAR FINGERPRINT
                        </div>
                        <StateSpaceRadar8dSvg security={activeSec} />
                      </div>
                      <div>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          06 // PC1 × PC2 REGIME SCATTER MANIFOLD
                        </div>
                        <RegimeScatterManifoldSvg
                          series={activeSec.series || []}
                          currentRegime={activeSec.quant_anchors.hmm.current_regime}
                        />
                      </div>
                      <div>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          07 // DELIVERY % VS VOLUME MICROSTRUCTURE
                        </div>
                        <DeliveryVolumeMicrostructureSvg series={activeSec.series || []} />
                      </div>
                      <div>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          08 // KALMAN MICROSTRUCTURE NOISE OSCILLATOR
                        </div>
                        <KalmanNoiseOscillatorSvg series={activeSec.series || []} />
                      </div>
                    </div>
                  </SpotlightCard>
                </div>
              )}

              {/* ===================================================================== */}
              {/* 04 NSE SCREENER VIEW                                                  */}
              {/* ===================================================================== */}
              {activeNav === "screener" && (
                <SpotlightCard className="border-[#23262D] p-6">
                  <SectionCodeHeader
                    code="04"
                    title="CROSS-SECTIONAL NSE SCREENER (/api/recommendations)"
                    rightSlot={
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleLoadRecommendations}
                          disabled={loadingRecs}
                          className="border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:bg-white disabled:opacity-50"
                        >
                          {loadingRecs ? "Scanning..." : "Fetch Screener"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveNav("overview")}
                          className="border border-[#23262D] bg-[#090A0C] px-3 py-1.5 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                        >
                          ← Back to 01 Overview
                        </button>
                      </div>
                    }
                  />

                  {recommendations ? (
                    <div className="overflow-x-auto border border-[#23262D] bg-[#090A0C]">
                      <table className="w-full border-collapse font-mono text-xs tabular-nums">
                        <thead>
                          <tr className="border-b border-[#23262D] text-left text-[10px] uppercase text-zinc-500">
                            <th className="px-4 py-3">Ticker</th>
                            <th className="px-4 py-3">HMM Regime</th>
                            <th className="px-4 py-3">LTP</th>
                            <th className="px-4 py-3">E14 5D Return</th>
                            <th className="px-4 py-3">CVaR(95%)</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#23262D]">
                          {recommendations.map((rec) => {
                            const recRet = rec.t5_expected_return_pct ?? rec.expected_5d_return_pct;
                            const isQuarantined =
                              Boolean(rec.quarantined) || rec.rating === "AVOID";
                            const price = rec.current_price ?? rec.ltp;
                            return (
                              <tr
                                key={rec.ticker}
                                onClick={() => {
                                  handleSelectTicker(rec.ticker);
                                  setActiveNav("overview");
                                }}
                                className="cursor-pointer text-zinc-300 transition hover:bg-[#101216]"
                              >
                                <td className="px-4 py-3 font-bold text-white">
                                  <span className="inline-flex items-center gap-2.5">
                                    <StockLogo symbol={rec.ticker} size="sm" />
                                    <span>{rec.ticker}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-3">{rec.hmm_state || "—"}</td>
                                <td className="px-4 py-3">
                                  {price !== undefined ? `₹${price.toFixed(2)}` : "—"}
                                </td>
                                <td
                                  className={`px-4 py-3 font-bold ${
                                    (recRet ?? 0) >= 0 ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                                  }`}
                                >
                                  {recRet !== undefined
                                    ? `${recRet >= 0 ? "+" : ""}${recRet.toFixed(2)}%`
                                    : "—"}
                                </td>
                                <td className="px-4 py-3 text-[#FF3B5C]">
                                  {rec.cvar_95_pct !== undefined
                                    ? `${rec.cvar_95_pct.toFixed(2)}%`
                                    : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {isQuarantined ? (
                                    <span className="border border-[#FF3B5C]/50 bg-[#FF3B5C]/10 px-2 py-0.5 text-[10px] font-bold text-[#FF3B5C]">
                                      {rec.rating || "QUARANTINED"} (
                                      {rec.quarantine_reason || rec.rationale || "RISK"})
                                    </span>
                                  ) : (
                                    <span className="border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2 py-0.5 text-[10px] font-bold text-[#D2FF00]">
                                      {rec.rating || rec.action || "ELIGIBLE"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-400">
                      CLICK &ldquo;FETCH SCREENER&rdquo; TO RANK ALL WATCHLIST EQUITIES LIVE FROM{" "}
                      <span className="text-[#D2FF00]">GET /api/recommendations</span>. CLICK ANY ROW TO INSPECT IN 01 OVERVIEW.
                    </div>
                  )}
                </SpotlightCard>
              )}

              {/* ===================================================================== */}
              {/* 05 PORTFOLIO VIEW                                                     */}
              {/* ===================================================================== */}
              {activeNav === "portfolio" && (
                <SpotlightCard className="border-[#23262D] p-6">
                  <SectionCodeHeader
                    code="05"
                    title="PORTFOLIO ADVISOR (/api/portfolio/generate)"
                    rightSlot={
                      <button
                        type="button"
                        onClick={() => setActiveNav("overview")}
                        className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                      >
                        ← Back to 01 Overview
                      </button>
                    }
                  />

                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-[#23262D] bg-[#090A0C] p-4 font-mono text-xs">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="flex items-center gap-1.5 border border-[#23262D] bg-[#101216] px-3 py-1.5 text-zinc-400">
                        <span>₹</span>
                        <input
                          type="number"
                          min={50000}
                          step={50000}
                          value={capitalInr}
                          onChange={(e) =>
                            setCapitalInr(Math.max(50000, Number(e.target.value) || 500000))
                          }
                          aria-label="Portfolio Capital INR"
                          className="w-28 bg-transparent font-bold tabular-nums text-white focus:outline-none"
                        />
                      </label>
                      <select
                        value={riskProfile}
                        onChange={(e) => setRiskProfile(e.target.value)}
                        aria-label="Risk Profile"
                        className="border border-[#23262D] bg-[#101216] px-3 py-1.5 text-zinc-200 focus:border-[#D2FF00] focus:outline-none"
                      >
                        <option value="CONSERVATIVE">CONSERVATIVE</option>
                        <option value="SNIPER_DEFENSIVE">SNIPER_DEFENSIVE</option>
                        <option value="BALANCED_CORE">BALANCED_CORE</option>
                        <option value="AGGRESSIVE_ALPHA">AGGRESSIVE_ALPHA</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleGeneratePortfolio}
                        disabled={generatingPortfolio}
                        className="border border-[#23262D] bg-[#101216] px-4 py-1.5 font-bold uppercase text-white transition hover:border-[#D2FF00] hover:text-[#D2FF00] disabled:opacity-50"
                      >
                        {generatingPortfolio ? "Sizing..." : "Generate"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleOptimize100kPortfolio}
                      disabled={generatingPortfolio}
                      className="border border-[#D2FF00] bg-[#D2FF00] px-4 py-1.5 font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:bg-white disabled:opacity-50"
                    >
                      {generatingPortfolio ? "Optimizing..." : "Optimize ₹1,00,000 Portfolio"}
                    </button>
                  </div>

                  {allocationBarModel && (
                    <div className="mb-5 border border-[#23262D] bg-[#090A0C] p-4">
                      <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase text-zinc-400">
                        <span>
                          {allocationBarModel.isLive
                            ? `LIVE ALLOCATION (₹${allocationBarModel.totalCapital.toLocaleString("en-IN")})`
                            : "SNAPSHOT REGIME-CAP PREVIEW — CLICK OPTIMIZE ₹1,00,000 OR GENERATE"}
                        </span>
                        <span className="text-[#D2FF00]">
                          {allocationBarModel.isLive ? "PERSISTED IN NEON" : "PREVIEW"}
                        </span>
                      </div>
                      <div className="flex h-6 w-full overflow-hidden border border-[#23262D] bg-[#101216]">
                        {allocationBarModel.segments.map((seg) => (
                          <div
                            key={seg.label}
                            title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
                            style={{
                              width: `${Math.max(3, seg.pct)}%`,
                              backgroundColor: seg.color,
                            }}
                            className="flex items-center justify-center border-r border-[#090A0C] font-mono text-[10px] font-bold text-[#090A0C] last:border-r-0"
                          >
                            {seg.pct >= 10 ? `${seg.pct.toFixed(0)}%` : ""}
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <PortfolioDonutRingSvg
                          segments={allocationBarModel.segments}
                          totalCapital={allocationBarModel.totalCapital}
                          quarantinedCount={allocationBarModel.quarantinedTickers.length}
                        />
                      </div>
                    </div>
                  )}

                  {portfolio ? (
                    <div className="space-y-4 font-mono text-xs tabular-nums">
                      <div className="border border-[#D2FF00]/40 bg-[#090A0C] p-4 font-sans">
                        <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D2FF00]">
                          PLAIN-ENGLISH STRATEGY SUMMARY ({portfolio.risk_profile})
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-zinc-200">
                          {buildPortfolioStrategySummary(portfolio)}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="border border-[#23262D] bg-[#090A0C] p-3">
                          <div className="text-[10px] text-zinc-500">EXPECTED 5D</div>
                          <div
                            className={`mt-1 text-lg font-bold ${
                              portfolio.expected_5d_return_pct >= 0
                                ? "text-[#D2FF00]"
                                : "text-[#FF3B5C]"
                            }`}
                          >
                            {portfolio.expected_5d_return_pct >= 0 ? "+" : ""}
                            {portfolio.expected_5d_return_pct.toFixed(2)}%
                          </div>
                        </div>
                        <div className="border border-[#23262D] bg-[#090A0C] p-3">
                          <div className="text-[10px] text-zinc-500">PORTFOLIO CVAR(95%)</div>
                          <div className="mt-1 text-lg font-bold text-[#FF3B5C]">
                            {portfolio.portfolio_cvar95_pct.toFixed(2)}%
                          </div>
                        </div>
                        <div className="border border-[#23262D] bg-[#090A0C] p-3">
                          <div className="text-[10px] text-zinc-500">
                            {portfolio.cash_sweep_instrument || "LIQUIDBEES"} SWEEP
                          </div>
                          <div className="mt-1 text-lg font-bold text-white">
                            ₹{portfolio.cash_sweep_inr.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {portfolio.allocations.map((a) => {
                          const pe = buildAllocationPlainEnglish(a, portfolio);
                          return (
                            <div
                              key={a.ticker}
                              className="border border-[#23262D] bg-[#090A0C] p-3.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <StockLogo symbol={a.ticker} size="sm" />
                                  <span className="font-display text-base font-bold text-white">
                                    {a.ticker}
                                  </span>
                                  {a.rating && (
                                    <span className="border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#D2FF00]">
                                      {a.rating}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-bold text-[#D2FF00]">
                                    {a.weight_pct.toFixed(1)}%
                                  </span>
                                  <span className="font-bold text-white">
                                    ₹{pe.amountInr.toLocaleString("en-IN")}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-2 font-sans text-xs text-zinc-200">
                                {pe.whyPickedOrCapped}
                              </p>
                              <p className="mt-1 font-sans text-[11px] text-zinc-400">
                                {pe.keyRiskNote}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {portfolio.quarantined_avoid && portfolio.quarantined_avoid.length > 0 && (
                        <div className="border border-[#FF3B5C]/50 bg-[#FF3B5C]/10 p-3 font-sans text-xs">
                          <div className="font-mono text-[10px] font-bold uppercase text-[#FF3B5C]">
                            QUARANTINED (₹0 ALLOCATED)
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {portfolio.quarantined_avoid.map((q) => (
                              <span
                                key={q.ticker}
                                title={q.rationale}
                                className="inline-flex items-center gap-1.5 border border-[#FF3B5C]/50 bg-[#090A0C] px-2.5 py-1 font-mono text-[11px] text-zinc-200"
                              >
                                <StockLogo symbol={q.ticker} size="xs" />
                                <strong>{q.ticker}</strong>: {q.rationale}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="border border-[#23262D] bg-[#090A0C]">
                        <button
                          type="button"
                          onClick={() => setShowRawPortfolioJson((s) => !s)}
                          aria-expanded={showRawPortfolioJson}
                          className="flex w-full items-center justify-between px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:text-[#D2FF00]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5" /> Raw Portfolio JSON
                          </span>
                          {showRawPortfolioJson ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {showRawPortfolioJson && (
                          <pre className="max-h-72 overflow-auto border-t border-[#23262D] p-3 font-mono text-[10px] leading-relaxed text-zinc-300">
                            {JSON.stringify(portfolio, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-400">
                      CLICK &ldquo;GENERATE&rdquo; OR &ldquo;OPTIMIZE ₹1,00,000 PORTFOLIO&rdquo; TO COMPUTE LIVE ALLOCATIONS FROM FASTAPI.
                    </div>
                  )}
                </SpotlightCard>
              )}

              {/* ===================================================================== */}
              {/* 06 EVIDENCE E01-E15 VIEW                                              */}
              {/* ===================================================================== */}
              {activeNav === "evidence" && activeSec && (
                <SpotlightCard className="border-[#23262D] p-6">
                  <SectionCodeHeader
                    code="06"
                    title={`IMMUTABLE EVIDENCE LEDGER E01–E15 (${activeSec.ticker})`}
                    rightSlot={
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 border border-[#23262D] bg-[#090A0C] px-2.5 py-1">
                          <Search className="h-3 w-3 text-zinc-500" />
                          <input
                            type="text"
                            value={intelSearchQuery}
                            onChange={(e) => setIntelSearchQuery(e.target.value)}
                            placeholder="Filter rows..."
                            aria-label="Filter evidence ledger rows"
                            className="w-40 bg-transparent font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveNav("overview")}
                          className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                        >
                          ← Back to 01 Overview
                        </button>
                      </div>
                    }
                  />

                  <div className="space-y-2">
                    {filteredEvidence.map(([code, item]) => {
                      const pe = getEvidencePlainEnglish(code, item);
                      const isExpanded = expandedLedgerCode === code;
                      const isFactor4b = item.description.includes("FACTOR 4B");
                      return (
                        <div
                          key={code}
                          className={`border px-3.5 py-2.5 font-mono text-xs ${
                            isFactor4b
                              ? "border-[#FF3B5C]/60 bg-[#FF3B5C]/10 text-[#FF3B5C]"
                              : "border-[#23262D] bg-[#090A0C] text-zinc-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="mr-2 font-bold text-[#D2FF00]">{code}</span>
                              <span className="mr-1.5 font-semibold text-white">{item.metric}:</span>
                              <span>{item.description}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={`border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  isFactor4b
                                    ? "border-[#FF3B5C]/60 bg-[#FF3B5C]/15 text-[#FF3B5C]"
                                    : item.is_limitation
                                    ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                                    : "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                                }`}
                              >
                                {isFactor4b ? "BLOCKED" : item.is_limitation ? "BOUNDARY" : "PASS"}
                              </span>
                              <button
                                type="button"
                                title={pe.tooltip}
                                aria-label={`Explain ${code} ${item.metric}`}
                                aria-expanded={isExpanded}
                                onClick={() =>
                                  setExpandedLedgerCode((prev) => (prev === code ? null : code))
                                }
                                className={`inline-flex h-5 w-5 items-center justify-center border text-[10px] transition ${
                                  isExpanded
                                    ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                                    : "border-[#23262D] bg-[#101216] text-zinc-400 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                                }`}
                              >
                                ?
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-2 border border-[#D2FF00]/40 bg-[#101216] p-2.5 font-sans text-xs text-zinc-200">
                              <strong className="font-mono text-[10px] uppercase text-[#D2FF00]">
                                DEFINITION:{" "}
                              </strong>
                              {pe.tooltip}
                            </div>
                          )}
                          {showPlainEnglish && (
                            <div className="mt-1.5 font-sans text-[11px] text-zinc-400">
                              <span className="font-mono text-[10px] uppercase text-zinc-500">
                                Why it matters:{" "}
                              </span>
                              {pe.whyItMatters}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SpotlightCard>
              )}

              {/* ===================================================================== */}
              {/* 07 NEWS & TWINS VIEW                                                  */}
              {/* ===================================================================== */}
              {activeNav === "news_twins" && activeSec && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                  {/* Live News + Fetch Ticker */}
                  <SpotlightCard className="border-[#23262D] p-6 xl:col-span-6">
                    <SectionCodeHeader
                      code="07A"
                      title={`LIVE NEWS & E08 REFRESH (${selectedTicker})`}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => handleRefreshNews()}
                          disabled={loadingNews}
                          className="border border-[#D2FF00] bg-[#D2FF00] px-3 py-1 font-mono text-[11px] font-bold uppercase text-[#090A0C] transition hover:bg-white disabled:opacity-50"
                        >
                          {loadingNews ? "Fetching..." : `Fetch ${selectedTicker}`}
                        </button>
                      }
                    />

                    {newsE08Refreshed && (
                      <div className="mb-3 border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-3 py-1.5 font-mono text-[10px] uppercase text-[#D2FF00]">
                        NEON nse_catalyst_rag E08 EMBEDDINGS UPDATED
                      </div>
                    )}

                    {newsArticles ? (
                      newsArticles.length ? (
                        <div className="space-y-2.5">
                          {newsArticles.map((art, idx) => {
                            const cue = getHeadlineCue(art.title);
                            return (
                              <a
                                key={`${art.url}-${idx}`}
                                href={art.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block border border-[#23262D] bg-[#090A0C] p-3 transition hover:border-[#D2FF00]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5">
                                    <StockLogo symbol={selectedTicker} size="sm" />
                                    <div>
                                      <div className="font-sans text-xs font-semibold text-zinc-100">
                                        {art.title}
                                      </div>
                                      <div className="mt-1 font-mono text-[10px] text-zinc-500">
                                        {art.source} · {art.published_at}
                                      </div>
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${cue.cls}`}
                                  >
                                    {cue.label}
                                  </span>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-xs text-zinc-500">
                          NO RECENT HEADLINES RETURNED FOR {selectedTicker}.
                        </div>
                      )
                    ) : (
                      <div className="border border-[#23262D] bg-[#090A0C] p-5 font-mono text-xs text-zinc-400">
                        CLICK &ldquo;FETCH {selectedTicker}&rdquo; ABOVE TO LOAD LIVE NEWS AND REFRESH E08 RAG.
                      </div>
                    )}
                  </SpotlightCard>

                  {/* E15 pgvector Twins & E08 Catalyst RAG */}
                  <SpotlightCard className="border-[#23262D] p-6 xl:col-span-6">
                    <SectionCodeHeader
                      code="07B"
                      title="E15 PGVECTOR TWINS & E08 CATALYST RAG"
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => setActiveNav("overview")}
                          className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                        >
                          ← Back to 01 Overview
                        </button>
                      }
                    />

                    <E15TwinsBarView
                      vectorTwins={activeSec.vector_twins}
                      ticker={activeSec.ticker}
                      onRunLive={() => handleRunLiveAnalyze()}
                      analyzing={analyzing}
                    />

                    {activeSec.catalyst_rag?.available &&
                      activeSec.catalyst_rag.docs &&
                      activeSec.catalyst_rag.docs.length > 0 && (
                        <div className="mt-4 border-t border-[#23262D] pt-4">
                          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            E08 DATE-FENCED CATALYST DOCS (&lt;= {activeSec.date})
                          </div>
                          <div className="space-y-2">
                            {activeSec.catalyst_rag.docs.map((doc, idx) => (
                              <div
                                key={`${doc.filing_date}-${idx}`}
                                className="border border-[#23262D] bg-[#090A0C] p-2.5 text-xs"
                              >
                                <div className="text-zinc-200">{doc.headline}</div>
                                <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
                                  <span>
                                    {doc.source} · {doc.category}
                                  </span>
                                  <span>{doc.filing_date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </SpotlightCard>
                </div>
              )}

              {/* ===================================================================== */}
              {/* 08 TRADE LEDGER VIEW                                                  */}
              {/* ===================================================================== */}
              {activeNav === "trades" && (
                <SpotlightCard className="border-[#23262D] p-6">
                  <SectionCodeHeader
                    code="08"
                    title="NEON TRADE EXECUTIONS LEDGER (/api/trades)"
                    rightSlot={
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 border border-[#23262D] bg-[#090A0C] px-2.5 py-1">
                          <Search className="h-3 w-3 text-zinc-500" />
                          <input
                            type="text"
                            value={intelSearchQuery}
                            onChange={(e) => setIntelSearchQuery(e.target.value)}
                            placeholder="Filter ticker / status..."
                            aria-label="Filter trade executions"
                            className="w-40 bg-transparent font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleRefreshTrades}
                          disabled={loadingTrades}
                          className="border border-[#D2FF00] bg-[#D2FF00] px-3 py-1 font-mono text-[11px] font-bold uppercase text-[#090A0C] hover:bg-white disabled:opacity-50"
                        >
                          {loadingTrades ? "Syncing..." : "Sync Neon"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTradeDrawerOpen(true)}
                          className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] font-bold uppercase text-[#D2FF00] hover:border-[#D2FF00]"
                        >
                          Open Risk Gate →
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveNav("overview")}
                          className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                        >
                          ← Back to 01 Overview
                        </button>
                      </div>
                    }
                  />

                  {filteredTrades ? (
                    filteredTrades.length ? (
                      <div className="divide-y divide-[#23262D] border border-[#23262D] bg-[#090A0C] font-mono text-xs tabular-nums">
                        {filteredTrades.map((tr) => {
                          const ok =
                            tr.status.includes("FILLED") || tr.status.includes("SUBMITTED");
                          return (
                            <div
                              key={tr.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                            >
                              <div className="flex items-center gap-3">
                                <StockLogo symbol={tr.ticker} size="sm" />
                                <div>
                                  <div className="font-bold text-white">
                                    #{tr.id} {tr.ticker}{" "}
                                    <span className="text-zinc-500">({tr.mode})</span>
                                  </div>
                                  <div className="text-[11px] text-zinc-400">
                                    {tr.action} {tr.quantity} sh @ ₹
                                    {Number(tr.limit_price).toFixed(2)} · Notional ₹
                                    {Number(tr.notional_inr).toLocaleString("en-IN")}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`border px-2.5 py-1 text-[10px] font-bold uppercase ${
                                  ok
                                    ? "border-[#D2FF00]/60 bg-[#D2FF00]/10 text-[#D2FF00]"
                                    : "border-[#FF3B5C]/60 bg-[#FF3B5C]/15 text-[#FF3B5C]"
                                }`}
                              >
                                {tr.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500">
                        NO MATCHING TRADES IN NEON.
                      </div>
                    )
                  ) : (
                    <div className="border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500">
                      NEON /api/trades OFFLINE OR NOT YET CONNECTED.
                    </div>
                  )}
                </SpotlightCard>
              )}
            </>
          )}
        </main>
      </div>

      {/* SLIDE-OVER EXECUTION & 4-LOCK RISK GATE DRAWER */}
      {tradeDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Pre-Trade Risk Gate and Execution Inspector"
        >
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setTradeDrawerOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col justify-between overflow-y-auto border-l border-[#23262D] bg-[#101216] p-6 shadow-2xl">
            <div>
              <div className="flex items-start justify-between gap-3 border-b border-[#23262D] pb-4">
                <div className="flex items-center gap-3">
                  <StockLogo symbol={selectedTicker} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-black uppercase text-white">
                        {selectedTicker} RISK GATE
                      </h2>
                      <span
                        className={`border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          tradeMode === "LIVE_ANGEL"
                            ? "border-[#FF3B5C] bg-[#FF3B5C]/15 text-[#FF3B5C]"
                            : "border-[#D2FF00]/50 bg-[#D2FF00]/10 text-[#D2FF00]"
                        }`}
                      >
                        {tradeMode === "LIVE_ANGEL" ? "LIVE_ANGEL ARMED" : "PAPER SAFE"}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-zinc-400">
                      LIVE LTP ₹{liveLtp.toFixed(2)} ·{" "}
                      {activeSec?.quant_anchors.hmm.current_regime || "AWAITING ANALYZE"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTradeDrawerOpen(false)}
                  aria-label="Close execution drawer"
                  className="border border-[#23262D] bg-[#090A0C] p-1.5 text-zinc-400 transition hover:border-[#D2FF00] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 4 Deterministic Pre-Trade Locks */}
              <div className="mt-5">
                <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <span className="flex items-center gap-1.5 text-[#D2FF00]">
                    <ShieldCheck className="h-3.5 w-3.5" /> 4 DETERMINISTIC PRE-TRADE LOCKS
                  </span>
                  <span>POST /api/execute_trade</span>
                </div>

                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between border border-[#23262D] bg-[#090A0C] px-3 py-2">
                    <span className="text-zinc-300">01 // ClaimVerifier == 0</span>
                    <span
                      className={`font-bold ${
                        lock1ContradictionsPass ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                      }`}
                    >
                      {activeSec
                        ? `${activeSec.guardrail_telemetry.post_guardrail_contradictions} CONTRA · ${
                            lock1ContradictionsPass ? "PASS" : "BLOCKED"
                          }`
                        : "NO TELEMETRY"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border border-[#23262D] bg-[#090A0C] px-3 py-2">
                    <span className="text-zinc-300">02 // Factor 4B Churn Lock</span>
                    <span
                      className={`font-bold ${
                        lock2Factor4bPass ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                      }`}
                    >
                      {activeSec
                        ? lock2Factor4bPass
                          ? "CLEAR"
                          : "BLOCKED (BUY)"
                        : "NO TELEMETRY"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border border-[#23262D] bg-[#090A0C] px-3 py-2 tabular-nums">
                    <span className="text-zinc-300">03 // ₹25,000 Notional Cap</span>
                    <span
                      className={`font-bold ${
                        lock3NotionalPass ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                      }`}
                    >
                      ₹{notionalInr.toLocaleString("en-IN")} ·{" "}
                      {lock3NotionalPass ? "PASS" : "EXCEEDED"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border border-[#23262D] bg-[#090A0C] px-3 py-2 tabular-nums">
                    <span className="text-zinc-300">04 // ±2.0% LTP Collar</span>
                    <span
                      className={`font-bold ${
                        lock4CollarPass ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                      }`}
                    >
                      {collarDeviationPct.toFixed(2)}% ·{" "}
                      {lock4CollarPass ? "PASS" : "OUT OF BOUNDS"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Controls */}
              <div className="mt-5 space-y-3 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTradeSide("BUY")}
                    className={`border py-2 font-bold uppercase transition ${
                      tradeSide === "BUY"
                        ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                        : "border-[#23262D] bg-[#090A0C] text-zinc-400"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeSide("SELL")}
                    className={`border py-2 font-bold uppercase transition ${
                      tradeSide === "SELL"
                        ? "border-[#FF3B5C] bg-[#FF3B5C] text-white"
                        : "border-[#23262D] bg-[#090A0C] text-zinc-400"
                    }`}
                  >
                    SELL
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block border border-[#23262D] bg-[#090A0C] p-2.5">
                    <span className="block text-[10px] uppercase text-zinc-500">Quantity</span>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={tradeQty}
                      onChange={(e) => setTradeQty(Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1 w-full bg-transparent text-sm font-bold tabular-nums text-white focus:outline-none"
                    />
                  </label>
                  <label className="block border border-[#23262D] bg-[#090A0C] p-2.5">
                    <span className="block text-[10px] uppercase text-zinc-500">
                      Limit Price (₹)
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      value={tradePrice}
                      onChange={(e) => setTradePrice(e.target.value)}
                      placeholder={liveLtp ? liveLtp.toFixed(2) : "0.00"}
                      className="mt-1 w-full bg-transparent text-sm font-bold tabular-nums text-white placeholder:text-zinc-600 focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block border border-[#23262D] bg-[#090A0C] p-2.5">
                  <span className="block text-[10px] uppercase text-zinc-500">Execution Mode</span>
                  <select
                    value={tradeMode}
                    onChange={(e) => {
                      const next = e.target.value === "LIVE_ANGEL" ? "LIVE_ANGEL" : "PAPER";
                      setTradeMode(next);
                      setLiveConfirmAck(false);
                      setLiveConfirmPending(false);
                    }}
                    className="mt-1 w-full bg-[#090A0C] text-xs font-bold text-white focus:outline-none"
                  >
                    <option value="PAPER">PAPER (Default Simulation)</option>
                    <option value="LIVE_ANGEL">LIVE_ANGEL (Real SmartAPI Order)</option>
                  </select>
                </label>

                <label className="block border border-[#23262D] bg-[#090A0C] p-2.5">
                  <span className="block text-[10px] uppercase text-zinc-500">
                    Optional E08 Filings Override
                  </span>
                  <textarea
                    rows={2}
                    value={filingsInput}
                    onChange={(e) => setFilingsInput(e.target.value)}
                    placeholder="none"
                    className="mt-1 w-full resize-none bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                  />
                </label>

                {/* LIVE_ANGEL Explicit Two-Step Confirmation Guard */}
                {tradeMode === "LIVE_ANGEL" && (
                  <div className="space-y-2 border border-[#FF3B5C] bg-[#FF3B5C]/10 p-3 font-mono text-[11px] text-zinc-200">
                    <div className="font-bold uppercase text-[#FF3B5C]">
                      REAL BROKER EXECUTION GUARD (ANGEL ONE placeOrder)
                    </div>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={liveConfirmAck}
                        onChange={(e) => {
                          setLiveConfirmAck(e.target.checked);
                          if (!e.target.checked) setLiveConfirmPending(false);
                        }}
                        className="mt-0.5 accent-[#FF3B5C]"
                      />
                      <span>
                        I confirm dispatching a real NSE {tradeSide} order for {tradeQty}{" "}
                        {selectedTicker} via Angel One SmartAPI.
                      </span>
                    </label>
                    {liveConfirmPending && (
                      <div className="flex items-center justify-between border-t border-[#FF3B5C]/40 pt-2">
                        <span className="font-bold text-[#FF3B5C]">CONFIRM REAL NSE ORDER?</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setLiveConfirmPending(false)}
                            className="border border-[#23262D] bg-[#090A0C] px-2.5 py-1 text-zinc-300"
                          >
                            CANCEL
                          </button>
                          <button
                            type="button"
                            onClick={dispatchOrder}
                            disabled={executingTrade || !activeSec}
                            className="border border-[#FF3B5C] bg-[#FF3B5C] px-2.5 py-1 font-bold text-white disabled:opacity-50"
                          >
                            {executingTrade ? "SENDING..." : "CONFIRM LIVE_ANGEL"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!liveConfirmPending && (
                  <button
                    type="button"
                    onClick={handleOrderSubmitClick}
                    disabled={executingTrade || !activeSec}
                    className={`w-full py-3 font-mono text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${
                      tradeMode === "LIVE_ANGEL"
                        ? "border border-[#FF3B5C] bg-[#FF3B5C] text-white hover:bg-rose-500"
                        : "border border-[#D2FF00] bg-[#D2FF00] text-[#090A0C] hover:border-white hover:bg-white"
                    }`}
                  >
                    {executingTrade
                      ? "Dispatching..."
                      : !activeSec
                      ? "Run Live Analyze First"
                      : tradeMode === "LIVE_ANGEL"
                      ? `Arm LIVE_ANGEL ${tradeSide}`
                      : `Execute ${tradeSide} (PAPER)`}
                  </button>
                )}

                {tradeReceipt && (
                  <div className="border border-[#23262D] bg-[#090A0C] p-3 font-mono text-[11px] text-zinc-300">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-zinc-500">EXECUTION RECEIPT</span>
                      <span
                        className={`font-bold ${
                          tradeReceipt.status.includes("FILLED") ||
                          tradeReceipt.status.includes("SUBMITTED")
                            ? "text-[#D2FF00]"
                            : "text-[#FF3B5C]"
                        }`}
                      >
                        {tradeReceipt.status}
                      </span>
                    </div>
                    <pre className="max-h-40 overflow-auto text-[10px] leading-relaxed text-zinc-300">
                      {JSON.stringify(tradeReceipt, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-[#23262D] pt-3 font-mono text-[10px] text-zinc-500">
              All orders pass backend ClaimVerifier, Factor 4B, ₹25k cap &amp; ±2% LTP collar checks.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
