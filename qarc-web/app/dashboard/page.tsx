"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import StateSpaceChart from "@/components/StateSpaceChart";
import NseStockSearch from "@/components/NseStockSearch";
import StockLogo from "@/components/StockLogo";
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
  type RecommendationItem,
  type SecurityData,
  type SnapshotPayload,
  type TradeExecuteResult,
  type TradeRecord,
} from "@/lib/qarcApi";
import {
  buildAllocationPlainEnglish,
  buildInvestorSummaryBullets,
  buildKpiPlainEnglish,
  buildPortfolioStrategySummary,
  extractForecastView,
  getBcpFieldPlainEnglish,
  getEvidencePlainEnglish,
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
  | "screener"
  | "portfolio"
  | "trades"
  | "statespace"
  | "twins_rag"
  | "evidence"
  | "colab_config";

type IntelTabId = "evidence" | "news" | "trades";

const SIDEBAR_GROUPS: Array<{
  category: string;
  items: Array<{
    id: NavSectionId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}> = [
  {
    category: "MAIN",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "screener", label: "NSE Screener", icon: Activity },
      { id: "portfolio", label: "Portfolio Advisor", icon: PieChart },
      { id: "trades", label: "Trade Ledger", icon: ArrowUpRight },
    ],
  },
  {
    category: "ENGINES",
    items: [
      { id: "statespace", label: "State-Space & HMM", icon: Layers },
      { id: "twins_rag", label: "Twins & RAG (E14/E08)", icon: Cpu },
      { id: "evidence", label: "Evidence E01–E15", icon: Database },
    ],
  },
  {
    category: "SYSTEM",
    items: [{ id: "colab_config", label: "Colab 70B Config", icon: Settings }],
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

const SEGMENT_COLORS = ["#D2FF00", "#10B981", "#38BDF8", "#F59E0B", "#A78BFA", "#34D399"];

function getRegimeStyle(regime: string): {
  hex: string;
  pillCls: string;
  glowCls: string;
  barCls: string;
} {
  const u = (regime || "").toUpperCase();
  if (u.includes("MARKUP")) {
    return {
      hex: "#D2FF00",
      pillCls: "border-[#D2FF00]/50 bg-[#D2FF00]/15 text-[#D2FF00]",
      glowCls: "from-[#D2FF00]/10 via-transparent to-transparent",
      barCls: "bg-[#D2FF00]",
    };
  }
  if (u.includes("ACCUMULATION")) {
    return {
      hex: "#10B981",
      pillCls: "border-emerald-400/50 bg-emerald-400/15 text-emerald-300",
      glowCls: "from-emerald-500/10 via-transparent to-transparent",
      barCls: "bg-emerald-400",
    };
  }
  if (u.includes("DISTRIBUTION")) {
    return {
      hex: "#F59E0B",
      pillCls: "border-amber-400/50 bg-amber-400/15 text-amber-300",
      glowCls: "from-amber-500/10 via-transparent to-transparent",
      barCls: "bg-amber-400",
    };
  }
  if (u.includes("MARKDOWN")) {
    return {
      hex: "#FF3B5C",
      pillCls: "border-[#FF3B5C]/60 bg-[#FF3B5C]/15 text-[#FF3B5C]",
      glowCls: "from-[#FF3B5C]/12 via-transparent to-transparent",
      barCls: "bg-[#FF3B5C]",
    };
  }
  return {
    hex: "#A1A1AA",
    pillCls: "border-white/15 bg-white/5 text-zinc-200",
    glowCls: "from-white/5 via-transparent to-transparent",
    barCls: "bg-zinc-400",
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
    cls: "border-white/15 bg-white/5 text-zinc-400",
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

function RegimeConfidenceGauge({
  confidence,
  regime,
}: {
  confidence: number;
  regime: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number(confidence) || 0));
  const pct = clamped * 100;
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - clamped);
  const { hex } = getRegimeStyle(regime);

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 84 84" className="h-24 w-24 -rotate-90" aria-hidden="true">
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={hex}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ filter: `drop-shadow(0 0 6px ${hex}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-base font-bold tabular-nums text-white">
          {pct.toFixed(0)}%
        </span>
        <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-400">
          CONF
        </span>
      </div>
    </div>
  );
}

function renderBadge(badge: string, status: string) {
  if (badge === "OVERRIDDEN" || (status === "SUPPORTED" && badge === "STRESS_PATCHED")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-300">
        <ShieldAlert className="h-3 w-3" /> OVERRIDDEN (&lt;5ms)
      </span>
    );
  }
  if (badge === "ABSTAINED" || status === "UNVERIFIABLE" || status === "DOWNGRADED_TO_UNKNOWN") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-400">
        <AlertTriangle className="h-3 w-3" /> ABSTAINED
      </span>
    );
  }
  if (status === "CONTRADICTION" || badge === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-[#FF3B5C]/60 bg-[#FF3B5C]/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FF3B5C]">
        REJECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#D2FF00]">
      <CheckCircle2 className="h-3 w-3" /> SUPPORTED
    </span>
  );
}

function InfoTooltip({ text, label = "Explain metric" }: { text: string; label?: string }) {
  return (
    <span className="group/tip relative inline-flex items-center">
      <button
        type="button"
        title={text}
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-white/10 bg-[#090A0C] text-zinc-400 transition hover:border-[#D2FF00] hover:text-[#D2FF00] focus:border-[#D2FF00] focus:text-[#D2FF00] focus:outline-none"
      >
        <HelpCircle className="h-2.5 w-2.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full right-0 z-50 mb-1.5 w-64 rounded-xl border border-[#D2FF00]/50 bg-[#090A0C] p-2.5 font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-zinc-200 opacity-0 shadow-2xl transition group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export default function DashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);

  // Navigation & Bento UI State
  const [activeNav, setActiveNav] = useState<NavSectionId>("overview");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState<boolean>(false);
  const [activeIntelTab, setActiveIntelTab] = useState<IntelTabId>("evidence");
  const [intelSearchQuery, setIntelSearchQuery] = useState<string>("");

  // Core Data & Telemetry State
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string>("RELIANCE");
  const [activeSec, setActiveSec] = useState<SecurityData | null>(null);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>("LOADING");
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const [showPlainEnglish, setShowPlainEnglish] = useState<boolean>(true);
  const [expandedLedgerCode, setExpandedLedgerCode] = useState<string | null>(null);
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
    loadInitial();
  }, [loadInitial]);

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

  const handleNavClick = (id: NavSectionId) => {
    setActiveNav(id);
    setMobileSidebarOpen(false);
    if (id === "colab_config") {
      setShowLlmConfig(true);
    } else if (id === "trades") {
      setActiveIntelTab("trades");
    } else if (id === "evidence") {
      setActiveIntelTab("evidence");
    }
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

  // Compute real portfolio allocation segments (or snapshot regime-cap preview before optimization)
  const allocationBarModel = useMemo(() => {
    if (portfolio) {
      const cap = portfolio.capital_inr || 1;
      const equitySegments = portfolio.allocations.map((a, idx) => ({
        label: a.ticker,
        pct: Math.max(0, a.weight_pct),
        inr: Number(a.allocated_inr ?? a.allocation_inr ?? 0),
        color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
        quarantined: false,
      }));
      const cashPct =
        portfolio.cash_sweep_weight_pct ??
        Math.max(0, (portfolio.cash_sweep_inr / cap) * 100);
      const segments = [
        ...equitySegments,
        {
          label: portfolio.cash_sweep_instrument || "LIQUIDBEES",
          pct: cashPct,
          inr: portfolio.cash_sweep_inr,
          color: "#52525B",
          quarantined: false,
        },
      ];
      return {
        isLive: true,
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
            : `${s.quant_anchors.hmm.current_regime} Regime (₹0)`,
        }));

      let remaining = 100;
      const equitySegments = safe.slice(0, 5).map((s, idx) => {
        const cap = Math.min(
          remaining,
          Math.max(5, Math.min(20, Number(s.quant_anchors.monte_carlo.recommended_max_allocation_cap_pct || 10)))
        );
        remaining = Math.max(0, remaining - cap);
        return {
          label: s.ticker,
          pct: cap,
          inr: Math.round((capitalInr * cap) / 100),
          color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
          quarantined: false,
        };
      });

      const segments = [
        ...equitySegments,
        {
          label: "LIQUIDBEES CASH",
          pct: Math.max(0, remaining),
          inr: Math.round((capitalInr * remaining) / 100),
          color: "#52525B",
          quarantined: false,
        },
      ];
      return {
        isLive: false,
        segments,
        quarantinedTickers: quarantined,
      };
    }

    return null;
  }, [portfolio, snapshot, capitalInr]);

  // Filtered items for Card 5 (Tabbed Intelligence & Ledger)
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

  const filteredNews = useMemo(() => {
    if (!newsArticles) return null;
    const q = intelSearchQuery.trim().toLowerCase();
    if (!q) return newsArticles;
    return newsArticles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.source.toLowerCase().includes(q)
    );
  }, [newsArticles, intelSearchQuery]);

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

  const regimeStyle = getRegimeStyle(activeSec?.quant_anchors.hmm.current_regime || "");

  // Visibility helper when user focuses a sidebar module
  const showOverviewGrid = activeNav === "overview" || activeNav === "colab_config";
  const showHeroAndAi = showOverviewGrid || activeNav === "statespace";
  const showChartAndProbs = showOverviewGrid || activeNav === "statespace";
  const showPortfolioCard = showOverviewGrid || activeNav === "portfolio";
  const showIntelCard = showOverviewGrid || activeNav === "evidence" || activeNav === "trades";
  const showScreenerCard = showOverviewGrid || activeNav === "screener";
  const showTwinsRagCard = showOverviewGrid || activeNav === "twins_rag";

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Animated Q-ARC Brand Logo (No NEURO-SYMBOLIC BCP V2 badge) */}
        <div className="border-b border-white/10 px-5 py-5">
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

        {/* Categorized Navigation */}
        <nav className="space-y-5 px-3 py-5" aria-label="Q-ARC Terminal Sections">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.category}>
              <div className="mb-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {group.category}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-mono text-xs transition ${
                        isActive
                          ? "border border-[#D2FF00]/40 bg-[#D2FF00]/10 font-bold text-[#D2FF00]"
                          : "border border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Google User Pill / Sign In CTA */}
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2 font-mono text-[10px] text-zinc-400">
          <div className="uppercase tracking-wider text-zinc-500">BACKEND TELEMETRY</div>
          <div className="mt-0.5 truncate text-zinc-200">{apiBaseDisplay}</div>
        </div>

        {authStatus === "authenticated" && session?.user ? (
          <div className="rounded-xl border border-white/10 bg-[#090A0C] p-3">
            <div className="flex items-center gap-2.5">
              {session.user.image && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || "Google User"}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-8 w-8 rounded-lg border border-white/15 object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D2FF00] font-mono text-xs font-bold text-[#090A0C]">
                  {userInitial}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs font-bold text-white">
                  {session.user.name || "Authenticated"}
                </div>
                <div className="truncate font-mono text-[10px] text-zinc-500">
                  {session.user.email}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#101216] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 transition hover:border-[#FF3B5C] hover:text-[#FF3B5C]"
            >
              <LogOut className="h-3 w-3" /> Sign Out
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={authStatus === "loading"}
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D2FF00]/60 bg-[#D2FF00]/10 px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#D2FF00] transition hover:bg-[#D2FF00] hover:text-[#090A0C] disabled:opacity-60"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-white">
              <GoogleGIcon />
            </span>
            <span>{authStatus === "loading" ? "Checking..." : "Sign in with Google"}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#090A0C] text-zinc-100">
      {/* Desktop Fixed Left Navigation Rail */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/10 bg-[#101216] lg:flex lg:flex-col">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Collapsible Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-72 flex-col border-r border-white/10 bg-[#101216]">
            <button
              type="button"
              aria-label="Close navigation drawer"
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute right-3 top-4 rounded-lg border border-white/10 bg-[#090A0C] p-1.5 text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Command Bar */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090A0C]/90 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-[#101216] p-2 text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>

              <Link
                href="/"
                className="hidden items-center gap-1 rounded-xl border border-white/10 bg-[#101216] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition hover:border-[#D2FF00] hover:text-[#D2FF00] sm:inline-flex"
              >
                <ArrowLeft className="h-3 w-3" /> Home
              </Link>

              <NseStockSearch onSubmit={handleSearchSubmit} busy={analyzing} />

              <div className="hidden flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#101216] p-1 xl:flex">
                {WATCHLIST.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectTicker(t)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] font-semibold transition ${
                      selectedTicker === t
                        ? "bg-[#D2FF00] text-[#090A0C]"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <StockLogo symbol={t} size="xs" />
                    <span>{t}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPlainEnglish((s) => !s)}
                aria-pressed={showPlainEnglish}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                  showPlainEnglish
                    ? "border-[#D2FF00]/50 bg-[#D2FF00]/10 text-[#D2FF00]"
                    : "border-white/10 bg-[#101216] text-zinc-400 hover:text-white"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Plain English:</span> {showPlainEnglish ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                onClick={() => setShowLlmConfig((s) => !s)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                  isLiveApi
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-[#101216] text-zinc-300 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLiveApi ? "bg-emerald-400 motion-safe:animate-pulse" : "bg-[#D2FF00]"
                  }`}
                />
                <span>{dataSourceLabel}</span>
              </button>

              {authStatus === "authenticated" && session?.user ? (
                <div className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-[#101216] px-2.5 py-1 sm:flex">
                  {session.user.image && !avatarFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name || "Google User"}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                      className="h-5 w-5 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#D2FF00] font-mono text-[10px] font-bold text-[#090A0C]">
                      {userInitial}
                    </span>
                  )}
                  <span className="max-w-[110px] truncate font-mono text-[11px] text-zinc-200">
                    {session.user.name || session.user.email}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={authStatus === "loading"}
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-[#101216] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-200 transition hover:border-[#D2FF00] hover:text-[#D2FF00] sm:inline-flex"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-white">
                    <GoogleGIcon />
                  </span>
                  <span>Sign in</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setTradeDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#090A0C] shadow-[0_0_20px_rgba(210,255,0,0.2)] transition hover:border-white hover:bg-white"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Trade / Risk Gate →
              </button>
            </div>
          </div>

          {/* Mobile/Compact Watchlist Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/5 px-4 py-2 xl:hidden">
            {WATCHLIST.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleSelectTicker(t)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] font-semibold transition ${
                  selectedTicker === t
                    ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                    : "border-white/10 bg-[#101216] text-zinc-400"
                }`}
              >
                <StockLogo symbol={t} size="xs" />
                <span>{t}</span>
              </button>
            ))}
          </div>

          {/* Colab 70B LLM Config Drawer */}
          {showLlmConfig && (
            <div className="border-t border-white/10 bg-[#101216] px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#D2FF00]">
                  POST /api/config/llm_endpoint
                </span>
                <input
                  type="url"
                  value={llmUrlInput}
                  onChange={(e) => setLlmUrlInput(e.target.value)}
                  placeholder="https://xxxx.trycloudflare.com/v1"
                  className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-[#090A0C] px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:border-[#D2FF00] focus:outline-none"
                />
                <input
                  type="password"
                  value={llmAdminSecret}
                  onChange={(e) => setLlmAdminSecret(e.target.value)}
                  placeholder="X-QARC-Admin-Secret (optional)"
                  className="w-56 rounded-xl border border-white/10 bg-[#090A0C] px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:border-[#D2FF00] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveLlmEndpoint}
                  disabled={savingLlmConfig}
                  className="rounded-xl border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-bold uppercase text-[#090A0C] disabled:opacity-50"
                >
                  {savingLlmConfig ? "Saving..." : "Update Endpoint"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLlmConfig(false)}
                  className="rounded-xl border border-white/10 bg-[#090A0C] px-3 py-1.5 text-zinc-400 hover:text-white"
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

        {/* Main Bento Canvas */}
        <main className="mx-auto w-full max-w-[1480px] flex-1 space-y-5 p-4 sm:p-6">
          {activeNav !== "overview" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#101216] px-4 py-2.5 font-mono text-xs">
              <span className="uppercase tracking-wider text-zinc-400">
                FOCUSED WORKSPACE //{" "}
                <strong className="text-[#D2FF00]">{activeNav.replace("_", " ").toUpperCase()}</strong>
              </span>
              <button
                type="button"
                onClick={() => setActiveNav("overview")}
                className="rounded-lg border border-white/10 bg-[#090A0C] px-3 py-1 text-[11px] uppercase tracking-wider text-zinc-200 hover:border-[#D2FF00] hover:text-[#D2FF00]"
              >
                ← Back to Full Bento Overview
              </button>
            </div>
          )}

          {apiNotice && (
            <div className="flex items-center justify-between rounded-2xl border border-[#FF3B5C]/50 bg-[#FF3B5C]/10 px-4 py-3 font-mono text-xs text-[#FF3B5C]">
              <span>{apiNotice}</span>
              <button
                type="button"
                onClick={() => setApiNotice(null)}
                className="ml-4 rounded-lg border border-[#FF3B5C]/40 px-2.5 py-0.5 text-[10px] uppercase"
              >
                Dismiss
              </button>
            </div>
          )}

          {!activeSec ? (
            <div className="rounded-2xl border border-white/10 bg-[#101216] p-8 font-mono text-xs text-zinc-400">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
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
                      NO TELEMETRY FOR {selectedTicker} IN SNAPSHOT — CLICK &ldquo;RUN LIVE 70B BCP&rdquo; TO COMPUTE FROM ANGEL ONE + COLAB.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRunLiveAnalyze()}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[#D2FF00] bg-[#D2FF00] px-4 py-2 font-bold uppercase text-[#090A0C]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Run Live /api/bcp_analyze
                    </button>
                  </>
                )}
              </div>
              {(loadingNews || (newsArticles && newsArticles.length > 0)) && (
                <div className="mx-auto mt-6 max-w-3xl border-t border-white/10 pt-4">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                    GET /api/news/{selectedTicker}
                  </div>
                  {loadingNews ? (
                    <div className="text-zinc-500">FETCHING HEADLINES...</div>
                  ) : (
                    <ul className="space-y-2">
                      {newsArticles?.map((a) => (
                        <li key={a.url || a.title} className="flex flex-col gap-0.5">
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-200 transition hover:text-[#D2FF00]"
                          >
                            {a.title}
                          </a>
                          <span className="text-[10px] uppercase tabular-nums text-zinc-500">
                            {a.source} // {a.published_at}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* TOP BENTO ROW: Card 1 (Selected Stock Hero & Regime Gauge) + Card 2 (AI Advisor 70B + Plain English) */}
              {showHeroAndAi && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                  {/* CARD 1: Selected Stock Hero & Regime Gauge */}
                  <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101216] p-5 xl:col-span-5">
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${regimeStyle.glowCls}`}
                    />
                    <div className="relative z-10 flex h-full flex-col justify-between gap-5">
                      {/* Header row with StockLogo + Ticker + Regime Donut */}
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <StockLogo symbol={activeSec.ticker} size="lg" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white">
                                  {activeSec.ticker}
                                </h1>
                                <span
                                  className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${regimeStyle.pillCls}`}
                                >
                                  {activeSec.quant_anchors.hmm.current_regime}
                                </span>
                              </div>
                              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-400">
                                NSE · {activeSec.date} · {activeSec.latency_ms.toFixed(0)}ms
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-baseline gap-4">
                            <div>
                              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                                RAW LTP
                              </div>
                              <div className="font-mono text-3xl font-bold tabular-nums text-[#D2FF00]">
                                ₹{activeSec.quant_anchors.kalman.raw_price.toFixed(2)}
                              </div>
                            </div>
                            <div className="border-l border-white/10 pl-4">
                              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                                KALMAN DENOISED
                              </div>
                              <div className="font-mono text-lg font-semibold tabular-nums text-zinc-200">
                                ₹{activeSec.quant_anchors.kalman.filtered_price.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          {showPlainEnglish && kpiPlain && (
                            <p className="mt-2 font-sans text-xs text-zinc-400">
                              {kpiPlain.tickerDate}
                            </p>
                          )}
                        </div>

                        <RegimeConfidenceGauge
                          confidence={activeSec.quant_anchors.hmm.confidence}
                          regime={activeSec.quant_anchors.hmm.current_regime}
                        />
                      </div>

                      {/* 4 Core Quant Bento Sub-Tiles */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-[#090A0C] p-3">
                          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>KALMAN VELOCITY</span>
                            <InfoTooltip text="Kalman Filter separates underlying multi-day price velocity (%/day) from short-term bid-ask noise." />
                          </div>
                          <div
                            className={`mt-1 font-mono text-base font-bold tabular-nums ${
                              activeSec.quant_anchors.kalman.trend_velocity_pct_per_day >= 0
                                ? "text-[#D2FF00]"
                                : "text-[#FF3B5C]"
                            }`}
                          >
                            {activeSec.quant_anchors.kalman.trend_velocity_pct_per_day >= 0
                              ? "+"
                              : ""}
                            {activeSec.quant_anchors.kalman.trend_velocity_pct_per_day.toFixed(3)}
                            %/d
                          </div>
                          {showPlainEnglish && kpiPlain && (
                            <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
                              {kpiPlain.kalman}
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-white/10 bg-[#090A0C] p-3">
                          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>GARCH(1,1) VOLATILITY</span>
                            <InfoTooltip text="Statistical volatility forecast showing expected annualized percentage price swing over the next year (~daily move × √252)." />
                          </div>
                          <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">
                            {activeSec.quant_anchors.garch.forecast_annualized_vol_pct.toFixed(1)}%{" "}
                            <span className="text-xs font-normal text-zinc-400">
                              ({activeSec.quant_anchors.garch.volatility_hazard_ratio.toFixed(2)}x)
                            </span>
                          </div>
                          {showPlainEnglish && kpiPlain && (
                            <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
                              {kpiPlain.garch}
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-white/10 bg-[#090A0C] p-3">
                          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>MC CVAR(95%) &amp; CAP</span>
                            <InfoTooltip text="Conditional Value-at-Risk: average 10-day loss in the worst 5% of 10,000 simulated paths, setting your safe max position cap." />
                          </div>
                          <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#FF3B5C]">
                            {activeSec.quant_anchors.monte_carlo.cvar_95_expected_shortfall_pct.toFixed(
                              2
                            )}
                            %{" "}
                            <span className="text-xs font-normal text-zinc-300">
                              / Cap{" "}
                              {activeSec.quant_anchors.monte_carlo.recommended_max_allocation_cap_pct.toFixed(
                                1
                              )}
                              %
                            </span>
                          </div>
                          {showPlainEnglish && kpiPlain && (
                            <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
                              {kpiPlain.monteCarlo}
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-white/10 bg-[#090A0C] p-3">
                          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>CLAIM VERIFIER</span>
                            <InfoTooltip text="Neuro-symbolic guardrail that audits every AI statement against E01–E15 numbers in <5ms and overrides contradictions." />
                          </div>
                          <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#D2FF00]">
                            {activeSec.guardrail_telemetry.post_guardrail_contradictions} CONTRA{" "}
                            <span className="text-xs font-normal text-zinc-400">
                              (Cov {activeSec.guardrail_telemetry.evidence_coverage_pct.toFixed(0)}
                              %)
                            </span>
                          </div>
                          {showPlainEnglish && kpiPlain && (
                            <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
                              {kpiPlain.verifier}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Hero Card Action Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                          {activeSec.active_factors?.factor_4b_deal_churn && (
                            <span className="rounded-md border border-[#FF3B5C]/50 bg-[#FF3B5C]/15 px-2 py-0.5 font-bold text-[#FF3B5C]">
                              FACTOR 4B CHURN LOCK
                            </span>
                          )}
                          {activeSec.live_l2_depth?.spoofing_anomaly_detected && (
                            <span className="rounded-md border border-[#FF3B5C]/50 bg-[#FF3B5C]/15 px-2 py-0.5 font-bold text-[#FF3B5C]">
                              E09 SPOOFING WALL
                            </span>
                          )}
                          {!activeSec.active_factors?.factor_4b_deal_churn &&
                            !activeSec.live_l2_depth?.spoofing_anomaly_detected && (
                              <span className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">
                                {kpiPlain?.hmm || `${activeSec.quant_anchors.hmm.current_regime}`}
                              </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRunLiveAnalyze()}
                            disabled={analyzing}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#090A0C] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-200 transition hover:border-[#D2FF00] hover:text-[#D2FF00] disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${analyzing ? "animate-spin" : ""}`} />
                            {analyzing ? "Analyzing..." : "Run Live 70B BCP"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTradeDrawerOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#090A0C] transition hover:border-white hover:bg-white"
                          >
                            Trade / Risk Gate →
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* CARD 2: AI Advisor (Nemotron 70B LoRA + Plain English) */}
                  <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101216] p-5 xl:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#D2FF00]/40 bg-[#D2FF00]/10 text-[#D2FF00]">
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                            AI Advisor // Nemotron 70B LoRA + Plain English
                          </h2>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                            {isLiveApi
                              ? "LIVE qarc_nemotron_70b + CLAIMVERIFIER"
                              : "SNAPSHOT FALLBACK — CLICK RUN LIVE 70B BCP FOR COLAB INFERENCE"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className="rounded-md border border-[#D2FF00]/40 bg-[#D2FF00]/10 px-2.5 py-1 font-bold uppercase text-[#D2FF00]">
                          {activeSec.guardrail_telemetry.verification_status}
                        </span>
                      </div>
                    </div>

                    {/* "What This Means For You" Plain-English Translation */}
                    {showPlainEnglish && summaryBullets.length > 0 && (
                      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {summaryBullets.map((b) => (
                          <div
                            key={b.label}
                            className={`rounded-xl border bg-[#090A0C] p-3 ${
                              b.tone === "signal"
                                ? "border-[#FF3B5C]/45"
                                : b.tone === "volt"
                                ? "border-[#D2FF00]/45"
                                : "border-white/10"
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
                            <p className="mt-1 font-sans text-xs leading-relaxed text-zinc-200">
                              {b.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* E14 5D Price Cone Strip */}
                    <div className="mt-4 rounded-xl border border-white/10 bg-[#090A0C] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                        <span className="flex items-center gap-1.5 text-[#D2FF00]">
                          <TrendingUp className="h-3.5 w-3.5" /> E14 CAUSAL 5-DAY FORECAST CONE
                          <InfoTooltip text="Causal 5-trading-day price cone from validated factor drifts, Kalman velocity, HMM drift bias, and GARCH uncertainty." />
                        </span>
                        <span>{forecastView?.sourceLabel || "RUN LIVE ANALYZE FOR E14"}</span>
                      </div>
                      {forecastView ? (
                        <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums sm:grid-cols-4">
                          <div className="rounded-lg border border-white/5 bg-[#101216] p-2">
                            <div className="text-[10px] text-zinc-500">EXPECTED 5D</div>
                            <div
                              className={`mt-0.5 font-bold ${
                                (forecastView.expected5dPct ?? 0) >= 0
                                  ? "text-[#D2FF00]"
                                  : "text-[#FF3B5C]"
                              }`}
                            >
                              {forecastView.expected5dPct !== null
                                ? `${forecastView.expected5dPct >= 0 ? "+" : ""}${forecastView.expected5dPct.toFixed(2)}%`
                                : "—"}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/5 bg-[#101216] p-2">
                            <div className="text-[10px] text-zinc-500">MEDIAN / T+5</div>
                            <div className="mt-0.5 font-bold text-white">
                              {forecastView.medianOrT5Price !== null
                                ? `₹${forecastView.medianOrT5Price.toFixed(2)}`
                                : "—"}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/5 bg-[#101216] p-2">
                            <div className="text-[10px] text-zinc-500">BEAR (Q10/95 LO)</div>
                            <div className="mt-0.5 font-bold text-[#FF3B5C]">
                              {forecastView.bearPrice !== null
                                ? `₹${forecastView.bearPrice.toFixed(2)}`
                                : "—"}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/5 bg-[#101216] p-2">
                            <div className="text-[10px] text-zinc-500">BULL (Q90/95 HI)</div>
                            <div className="mt-0.5 font-bold text-[#D2FF00]">
                              {forecastView.bullPrice !== null
                                ? `₹${forecastView.bullPrice.toFixed(2)}`
                                : "—"}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="font-mono text-[11px] text-zinc-500">
                          E14 quantile band computes on live /api/bcp_analyze calls.
                        </div>
                      )}
                    </div>

                    {/* 7-Field Verified BCP Profile */}
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                        <span>VERIFIED 7-FIELD BCP PROFILE</span>
                        <span>CHECKED IN &lt;5MS AGAINST E01–E15</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {Object.entries(activeSec.guardrail_telemetry.field_badges || {}).map(
                          ([key, fb]) => {
                            const fieldMeta = getBcpFieldPlainEnglish(key, fb.verified);
                            return (
                              <div
                                key={key}
                                className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                                    {BCP_LABELS[key] || key}
                                    <InfoTooltip
                                      text={fieldMeta.conceptTooltip}
                                      label={`Explain ${BCP_LABELS[key] || key}`}
                                    />
                                  </span>
                                  {renderBadge(fb.badge, fb.status)}
                                </div>
                                <div className="mt-1 font-mono text-xs font-semibold text-white">
                                  {fb.verified}
                                </div>
                                {showPlainEnglish && (
                                  <div className="mt-1 font-sans text-[11px] leading-snug text-zinc-400">
                                    {fieldMeta.plainNote}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* MIDDLE BENTO ROW: Card 3 (StateSpaceChart Manifold) + Card 4 (Smart Portfolio Allocation Bar & Advisor) */}
              {(showChartAndProbs || showPortfolioCard) && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                  {/* CARD 3: StateSpaceChart Manifold & HMM Probabilities */}
                  {showChartAndProbs && (
                    <section
                      className={`rounded-2xl border border-white/10 bg-[#101216] p-5 ${
                        showPortfolioCard ? "xl:col-span-7" : "xl:col-span-12"
                      }`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                            State-Space Manifold // Kalman Price vs Spot + Regime Phases
                          </h2>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                            {activeSec.series?.length || 0} CAUSAL SESSIONS · HMM ENTROPY{" "}
                            {activeSec.quant_anchors.hmm.entropy_bits.toFixed(2)} BITS · HURST{" "}
                            {(activeSec.hurst_60d ?? 0.5).toFixed(2)}
                          </p>
                        </div>
                        <span
                          className={`rounded-md border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${regimeStyle.pillCls}`}
                        >
                          PERSISTENCE {(activeSec.quant_anchors.hmm.persistence * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#090A0C]">
                        <StateSpaceChart
                          ticker={activeSec.ticker}
                          series={activeSec.series || []}
                          currentRegime={activeSec.quant_anchors.hmm.current_regime}
                        />
                      </div>

                      {/* Calibrated 4-State Regime Posterior Probabilities */}
                      {activeSec.quant_anchors.hmm.probabilities && (
                        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          {Object.entries(activeSec.quant_anchors.hmm.probabilities).map(
                            ([phase, prob]) => {
                              const pct = Math.max(0, Math.min(100, Number(prob) * 100));
                              const st = getRegimeStyle(phase);
                              return (
                                <div
                                  key={phase}
                                  className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5 font-mono text-xs tabular-nums"
                                >
                                  <div className="flex items-center justify-between text-[10px] uppercase text-zinc-400">
                                    <span>{phase}</span>
                                    <span className="font-bold text-white">{pct.toFixed(1)}%</span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                                    <div
                                      className={`h-full rounded-full ${st.barCls}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {/* CARD 4: Smart Portfolio Allocation Bar & Advisor */}
                  {showPortfolioCard && (
                    <section
                      className={`flex flex-col justify-between rounded-2xl border border-white/10 bg-[#101216] p-5 ${
                        showChartAndProbs ? "xl:col-span-5" : "xl:col-span-12"
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                          <div className="flex items-center gap-2">
                            <PieChart className="h-4 w-4 text-[#D2FF00]" />
                            <div>
                              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                                Smart Portfolio Allocation (/api/portfolio/generate)
                              </h2>
                              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                                INVERSE CVAR(95%) SIZING + LIQUIDBEES SWEEP
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleOptimize100kPortfolio}
                            disabled={generatingPortfolio}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D2FF00] bg-[#D2FF00] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#090A0C] transition hover:border-white hover:bg-white disabled:opacity-50"
                          >
                            {generatingPortfolio ? "Optimizing..." : "Optimize ₹1,00,000 Portfolio"}
                          </button>
                        </div>

                        {/* Segmented Horizontal Allocation Progress Bar */}
                        {allocationBarModel && (
                          <div className="mt-4 rounded-xl border border-white/10 bg-[#090A0C] p-3.5">
                            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
                              <span className="text-zinc-400">
                                {allocationBarModel.isLive
                                  ? `LIVE NEON ALLOCATION (₹${(portfolio?.capital_inr || capitalInr).toLocaleString("en-IN")})`
                                  : "SNAPSHOT REGIME-CAP PREVIEW — CLICK OPTIMIZE ₹1,00,000 TO PERSIST"}
                              </span>
                              <span className="text-[#D2FF00]">
                                {allocationBarModel.isLive ? "LIVE" : "PREVIEW"}
                              </span>
                            </div>

                            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-white/5">
                              {allocationBarModel.segments.map((seg) => (
                                <div
                                  key={seg.label}
                                  title={`${seg.label}: ${seg.pct.toFixed(1)}% (₹${seg.inr.toLocaleString("en-IN")})`}
                                  style={{
                                    width: `${Math.max(1.5, seg.pct)}%`,
                                    backgroundColor: seg.color,
                                  }}
                                  className="h-full border-r border-[#090A0C] last:border-r-0"
                                />
                              ))}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {allocationBarModel.segments.map((seg) => (
                                <span
                                  key={seg.label}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#101216] px-2 py-1 font-mono text-[10px] tabular-nums text-zinc-300"
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: seg.color }}
                                  />
                                  <span className="font-bold text-white">{seg.label}</span>
                                  <span>{seg.pct.toFixed(1)}%</span>
                                </span>
                              ))}
                            </div>

                            {allocationBarModel.quarantinedTickers.length > 0 && (
                              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2.5 font-mono text-[10px]">
                                <span className="font-bold uppercase text-[#FF3B5C]">
                                  QUARANTINED (₹0):
                                </span>
                                {allocationBarModel.quarantinedTickers.map((q) => (
                                  <span
                                    key={q.ticker}
                                    title={q.reason}
                                    className="inline-flex items-center gap-1 rounded-md border border-[#FF3B5C]/40 bg-[#FF3B5C]/10 px-2 py-0.5 text-[#FF3B5C]"
                                  >
                                    <StockLogo symbol={q.ticker} size="xs" />
                                    {q.ticker}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Custom Capital & Profile Controls */}
                        <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs">
                          <label className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#090A0C] px-2.5 py-1.5 text-zinc-400">
                            <span>₹</span>
                            <input
                              type="number"
                              min={50000}
                              step={50000}
                              value={capitalInr}
                              onChange={(e) =>
                                setCapitalInr(Math.max(50000, Number(e.target.value) || 100000))
                              }
                              aria-label="Portfolio Capital INR"
                              className="w-24 bg-transparent tabular-nums text-white focus:outline-none"
                            />
                          </label>
                          <select
                            value={riskProfile}
                            onChange={(e) => setRiskProfile(e.target.value)}
                            aria-label="Risk Profile"
                            className="flex-1 rounded-xl border border-white/10 bg-[#090A0C] px-2.5 py-1.5 text-zinc-200 focus:border-[#D2FF00] focus:outline-none"
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
                            className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-1.5 font-bold uppercase text-white transition hover:border-[#D2FF00] hover:text-[#D2FF00] disabled:opacity-50"
                          >
                            {generatingPortfolio ? "Sizing..." : "Generate"}
                          </button>
                        </div>

                        {/* Live Generated Portfolio Breakdown */}
                        {portfolio ? (
                          <div className="mt-4 space-y-3 font-mono text-xs tabular-nums">
                            <div className="rounded-xl border border-[#D2FF00]/35 bg-[#090A0C] p-3 font-sans">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D2FF00]">
                                  STRATEGY SUMMARY ({portfolio.risk_profile})
                                </span>
                                <span className="font-mono text-[10px] text-zinc-500">
                                  ₹{portfolio.capital_inr.toLocaleString("en-IN")}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-zinc-200">
                                {buildPortfolioStrategySummary(portfolio)}
                              </p>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
                                <div className="text-[10px] text-zinc-500">EXPECTED 5D</div>
                                <div
                                  className={`font-bold ${
                                    portfolio.expected_5d_return_pct >= 0
                                      ? "text-[#D2FF00]"
                                      : "text-[#FF3B5C]"
                                  }`}
                                >
                                  {portfolio.expected_5d_return_pct >= 0 ? "+" : ""}
                                  {portfolio.expected_5d_return_pct.toFixed(2)}%
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
                                <div className="text-[10px] text-zinc-500">CVAR(95%)</div>
                                <div className="font-bold text-[#FF3B5C]">
                                  {portfolio.portfolio_cvar95_pct.toFixed(2)}%
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
                                <div className="text-[10px] text-zinc-500">
                                  {portfolio.cash_sweep_instrument || "LIQUIDBEES"}
                                </div>
                                <div className="font-bold text-white">
                                  ₹{portfolio.cash_sweep_inr.toLocaleString("en-IN")}
                                </div>
                              </div>
                            </div>

                            {portfolio.allocations.length > 0 && (
                              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                {portfolio.allocations.map((a) => {
                                  const pe = buildAllocationPlainEnglish(a, portfolio);
                                  return (
                                    <div
                                      key={a.ticker}
                                      className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <StockLogo symbol={a.ticker} size="sm" />
                                          <span className="font-display text-sm font-bold text-white">
                                            {a.ticker}
                                          </span>
                                          {a.rating && (
                                            <span className="rounded-md border border-[#D2FF00]/40 bg-[#D2FF00]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#D2FF00]">
                                              {a.rating}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                          <span className="font-bold text-[#D2FF00]">
                                            {a.weight_pct.toFixed(1)}%
                                          </span>
                                          <span className="font-bold text-white">
                                            ₹{pe.amountInr.toLocaleString("en-IN")}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="mt-1.5 font-sans text-[11px] leading-snug text-zinc-300">
                                        {pe.whyPickedOrCapped}
                                      </p>
                                      <p className="mt-0.5 font-sans text-[11px] leading-snug text-zinc-500">
                                        {pe.keyRiskNote}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="rounded-xl border border-white/10 bg-[#090A0C]">
                              <button
                                type="button"
                                onClick={() => setShowRawPortfolioJson((s) => !s)}
                                aria-expanded={showRawPortfolioJson}
                                className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-[#D2FF00]"
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
                                <pre className="max-h-56 overflow-auto border-t border-white/10 p-3 font-mono text-[10px] text-zinc-300">
                                  {JSON.stringify(portfolio, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* BOTTOM BENTO ROW: Card 5 (Tabbed Intelligence & Ledger) + Right Bento (Screener & Twins/RAG) */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                {/* CARD 5: Tabbed Intelligence & Ledger Card */}
                {showIntelCard && (
                  <section
                    className={`rounded-2xl border border-white/10 bg-[#101216] p-5 ${
                      showScreenerCard || showTwinsRagCard ? "xl:col-span-7" : "xl:col-span-12"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#090A0C] p-1">
                        {(
                          [
                            { id: "evidence", label: "Evidence E01–E15", icon: Database },
                            { id: "news", label: "Live News", icon: Newspaper },
                            { id: "trades", label: "Neon Trade Ledger", icon: ArrowUpRight },
                          ] as const
                        ).map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeIntelTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveIntelTab(tab.id)}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition ${
                                isActive
                                  ? "bg-[#D2FF00] text-[#090A0C]"
                                  : "text-zinc-400 hover:text-white"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#090A0C] px-2.5 py-1.5">
                          <Search className="h-3 w-3 text-zinc-500" />
                          <input
                            type="text"
                            value={intelSearchQuery}
                            onChange={(e) => setIntelSearchQuery(e.target.value)}
                            placeholder="Filter rows..."
                            aria-label="Filter evidence, news, or trades"
                            className="w-32 bg-transparent font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none sm:w-44"
                          />
                        </div>

                        {activeIntelTab === "news" && (
                          <button
                            type="button"
                            onClick={() => handleRefreshNews()}
                            disabled={loadingNews}
                            className="rounded-xl border border-white/10 bg-[#090A0C] px-3 py-1.5 font-mono text-[11px] uppercase text-[#D2FF00] transition hover:border-[#D2FF00] disabled:opacity-50"
                          >
                            {loadingNews ? "Fetching..." : `Fetch ${selectedTicker}`}
                          </button>
                        )}
                        {activeIntelTab === "trades" && (
                          <button
                            type="button"
                            onClick={handleRefreshTrades}
                            disabled={loadingTrades}
                            className="rounded-xl border border-white/10 bg-[#090A0C] px-3 py-1.5 font-mono text-[11px] uppercase text-[#D2FF00] transition hover:border-[#D2FF00] disabled:opacity-50"
                          >
                            {loadingTrades ? "Syncing..." : "Sync Neon"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tab 1: Evidence E01-E15 */}
                    {activeIntelTab === "evidence" && (
                      <div className="mt-4 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                        {filteredEvidence.map(([code, item]) => {
                          const pe = getEvidencePlainEnglish(code, item);
                          const isExpanded = expandedLedgerCode === code;
                          const isFactor4b = item.description.includes("FACTOR 4B");
                          return (
                            <div
                              key={code}
                              className={`rounded-xl border px-3 py-2.5 font-mono text-[11px] ${
                                isFactor4b
                                  ? "border-[#FF3B5C]/50 bg-[#FF3B5C]/10 text-[#FF3B5C]"
                                  : "border-white/10 bg-[#090A0C] text-zinc-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="mr-2 font-bold text-[#D2FF00]">{code}</span>
                                  <span className="mr-1.5 font-semibold text-white">
                                    {item.metric}:
                                  </span>
                                  <span>{item.description}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <span
                                    className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                      isFactor4b
                                        ? "border-[#FF3B5C]/50 bg-[#FF3B5C]/15 text-[#FF3B5C]"
                                        : item.is_limitation
                                        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                                        : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
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
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] transition ${
                                      isExpanded
                                        ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                                        : "border-white/10 bg-[#101216] text-zinc-400 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                                    }`}
                                  >
                                    ?
                                  </button>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="mt-2 rounded-lg border border-[#D2FF00]/35 bg-[#101216] p-2 font-sans text-[11px] leading-snug text-zinc-200">
                                  <span className="font-mono text-[10px] font-bold uppercase text-[#D2FF00]">
                                    DEFINITION:{" "}
                                  </span>
                                  {pe.tooltip}
                                </div>
                              )}
                              {showPlainEnglish && (
                                <div className="mt-1.5 font-sans text-[11px] leading-snug text-zinc-400">
                                  <span className="font-mono text-[10px] uppercase text-zinc-500">
                                    Why it matters:{" "}
                                  </span>
                                  {pe.whyItMatters}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {filteredEvidence.length === 0 && (
                          <div className="rounded-xl border border-white/10 bg-[#090A0C] p-4 font-mono text-xs text-zinc-500">
                            NO EVIDENCE LEDGER ITEMS MATCH &ldquo;{intelSearchQuery}&rdquo;.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Live News */}
                    {activeIntelTab === "news" && (
                      <div className="mt-4 space-y-2.5">
                        {newsE08Refreshed && (
                          <div className="rounded-lg border border-[#D2FF00]/40 bg-[#D2FF00]/10 px-3 py-1.5 font-mono text-[10px] uppercase text-[#D2FF00]">
                            NEON nse_catalyst_rag E08 EMBEDDINGS UPDATED
                          </div>
                        )}
                        {filteredNews ? (
                          filteredNews.length ? (
                            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                              {filteredNews.map((art, idx) => {
                                const cue = getHeadlineCue(art.title);
                                return (
                                  <a
                                    key={`${art.url}-${idx}`}
                                    href={art.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block rounded-xl border border-white/10 bg-[#090A0C] p-3 transition hover:border-[#D2FF00]"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-2.5">
                                        <StockLogo symbol={selectedTicker} size="sm" />
                                        <div>
                                          <div className="font-sans text-xs font-medium text-zinc-100">
                                            {art.title}
                                          </div>
                                          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
                                            <span>{art.source}</span>
                                            <span>·</span>
                                            <span>{art.published_at}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <span
                                        className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${cue.cls}`}
                                      >
                                        {cue.label}
                                      </span>
                                    </div>
                                  </a>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-white/10 bg-[#090A0C] p-4 font-mono text-xs text-zinc-500">
                              NO RECENT HEADLINES RETURNED FOR {selectedTicker}.
                            </div>
                          )
                        ) : (
                          <div className="rounded-xl border border-white/10 bg-[#090A0C] p-5 font-mono text-xs text-zinc-400">
                            CLICK &ldquo;FETCH {selectedTicker}&rdquo; ABOVE TO LOAD LIVE NEWSAPI / RSS HEADLINES AND REFRESH E08 RAG.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Neon Trade Ledger */}
                    {activeIntelTab === "trades" && (
                      <div className="mt-4">
                        {filteredTrades ? (
                          filteredTrades.length ? (
                            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 font-mono text-xs tabular-nums">
                              {filteredTrades.map((tr) => {
                                const isSuccess =
                                  tr.status.includes("FILLED") || tr.status.includes("SUBMITTED");
                                return (
                                  <div
                                    key={tr.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2.5"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <StockLogo symbol={tr.ticker} size="sm" />
                                      <div>
                                        <div className="font-bold text-white">
                                          #{tr.id} {tr.ticker}{" "}
                                          <span className="text-zinc-400">({tr.mode})</span>
                                        </div>
                                        <div className="text-[11px] text-zinc-400">
                                          {tr.action} {tr.quantity} sh @ ₹
                                          {Number(tr.limit_price).toFixed(2)} · Notional ₹
                                          {Number(tr.notional_inr).toLocaleString("en-IN")}
                                        </div>
                                      </div>
                                    </div>
                                    <span
                                      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                        isSuccess
                                          ? "border-[#D2FF00]/40 bg-[#D2FF00]/10 text-[#D2FF00]"
                                          : "border-[#FF3B5C]/50 bg-[#FF3B5C]/15 text-[#FF3B5C]"
                                      }`}
                                    >
                                      {tr.status}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-white/10 bg-[#090A0C] p-4 font-mono text-xs text-zinc-500">
                              NO TRADES RECORDED IN NEON YET.
                            </div>
                          )
                        ) : (
                          <div className="rounded-xl border border-white/10 bg-[#090A0C] p-5 font-mono text-xs text-zinc-500">
                            NEON /api/trades OFFLINE OR NOT YET CONNECTED.
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Right Stacked Bento Modules: NSE Screener + E15 Twins & E08 RAG */}
                {(showScreenerCard || showTwinsRagCard) && (
                  <div
                    className={`space-y-5 ${
                      showIntelCard ? "xl:col-span-5" : "xl:col-span-12"
                    }`}
                  >
                    {/* Cross-Sectional NSE Screener */}
                    {showScreenerCard && (
                      <section className="rounded-2xl border border-white/10 bg-[#101216] p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                          <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-white">
                            <Activity className="h-4 w-4 text-[#D2FF00]" />
                            NSE Screener (/api/recommendations)
                          </span>
                          <button
                            type="button"
                            onClick={handleLoadRecommendations}
                            disabled={loadingRecs}
                            className="rounded-xl border border-[#D2FF00]/40 bg-[#D2FF00]/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[#D2FF00] transition hover:bg-[#D2FF00] hover:text-[#090A0C] disabled:opacity-50"
                          >
                            {loadingRecs ? "Scanning..." : "Fetch Screener"}
                          </button>
                        </div>

                        {recommendations ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse font-mono text-xs tabular-nums">
                              <thead>
                                <tr className="border-b border-white/10 text-left text-[10px] uppercase text-zinc-500">
                                  <th className="py-2 pr-3">Ticker</th>
                                  <th className="py-2 pr-3">HMM</th>
                                  <th className="py-2 pr-3">E14 5D</th>
                                  <th className="py-2 pr-3">CVaR95</th>
                                  <th className="py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {recommendations.map((rec) => {
                                  const recRet =
                                    rec.t5_expected_return_pct ?? rec.expected_5d_return_pct;
                                  const isQuarantined =
                                    Boolean(rec.quarantined) || rec.rating === "AVOID";
                                  return (
                                    <tr
                                      key={rec.ticker}
                                      onClick={() => handleSelectTicker(rec.ticker)}
                                      className="cursor-pointer text-zinc-300 transition hover:bg-white/[0.03]"
                                    >
                                      <td className="py-2.5 pr-3 font-bold text-white">
                                        <span className="inline-flex items-center gap-2">
                                          <StockLogo symbol={rec.ticker} size="sm" />
                                          <span>{rec.ticker}</span>
                                        </span>
                                      </td>
                                      <td className="py-2.5 pr-3 text-[11px]">
                                        {rec.hmm_state || "—"}
                                      </td>
                                      <td
                                        className={`py-2.5 pr-3 font-bold ${
                                          (recRet ?? 0) >= 0 ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                                        }`}
                                      >
                                        {recRet !== undefined
                                          ? `${recRet >= 0 ? "+" : ""}${recRet.toFixed(2)}%`
                                          : "—"}
                                      </td>
                                      <td className="py-2.5 pr-3 text-[#FF3B5C]">
                                        {rec.cvar_95_pct !== undefined
                                          ? `${rec.cvar_95_pct.toFixed(2)}%`
                                          : "—"}
                                      </td>
                                      <td className="py-2.5">
                                        {isQuarantined ? (
                                          <span className="rounded-md border border-[#FF3B5C]/40 bg-[#FF3B5C]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#FF3B5C]">
                                            {rec.rating || "AVOID"}
                                          </span>
                                        ) : (
                                          <span className="rounded-md border border-[#D2FF00]/40 bg-[#D2FF00]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#D2FF00]">
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
                          <div className="rounded-xl border border-white/10 bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                            CLICK &ldquo;FETCH SCREENER&rdquo; TO RANK THE NSE WATCHLIST CAUSALLY FROM FASTAPI.
                          </div>
                        )}
                      </section>
                    )}

                    {/* E15 Historical Twins & E08 Causal Filings RAG */}
                    {showTwinsRagCard && (
                      <section className="rounded-2xl border border-white/10 bg-[#101216] p-5">
                        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3 font-mono text-xs uppercase tracking-wider text-zinc-400">
                          <span className="flex items-center gap-2 font-bold text-white">
                            <Cpu className="h-4 w-4 text-[#D2FF00]" />
                            E15 pgvector Twins &amp; E08 RAG
                            <InfoTooltip text="Historical Regime Twins retrieve past NSE sessions with the closest 8D state signature (cosine similarity %) and report actual T+5 returns." />
                          </span>
                          <span className="text-[10px] text-[#D2FF00]">
                            {activeSec.vector_twins?.source || "NEON HNSW"}
                          </span>
                        </div>

                        {activeSec.vector_twins?.available &&
                        activeSec.vector_twins.twins?.length ? (
                          <div className="space-y-2 font-mono text-[11px] tabular-nums">
                            {activeSec.vector_twins.twins.slice(0, 4).map((tw, i) => (
                              <div
                                key={`${tw.symbol}-${tw.bar_date}-${i}`}
                                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2"
                              >
                                <span className="flex items-center gap-2 text-zinc-200">
                                  <StockLogo symbol={tw.symbol || activeSec.ticker} size="xs" />
                                  <span>
                                    <strong className="text-white">
                                      {tw.symbol || activeSec.ticker}
                                    </strong>{" "}
                                    · {tw.bar_date} ({tw.hmm_state})
                                  </span>
                                </span>
                                <span className="text-zinc-400">
                                  {(tw.cosine_similarity * 100).toFixed(1)}%
                                </span>
                                <span
                                  className={`font-bold ${
                                    (tw.fwd_5d_ret_pct ?? 0) >= 0
                                      ? "text-[#D2FF00]"
                                      : "text-[#FF3B5C]"
                                  }`}
                                >
                                  {tw.fwd_5d_ret_pct !== null
                                    ? `${tw.fwd_5d_ret_pct >= 0 ? "+" : ""}${tw.fwd_5d_ret_pct.toFixed(2)}%`
                                    : "N/A"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-white/10 bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                            CLICK &ldquo;RUN LIVE 70B BCP&rdquo; TO QUERY 16,125 HISTORICAL REGIME TWINS IN NEON PGVECTOR.
                          </div>
                        )}

                        {/* E08 Grounded Catalyst RAG Docs if available */}
                        {activeSec.catalyst_rag?.available &&
                          activeSec.catalyst_rag.docs &&
                          activeSec.catalyst_rag.docs.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                E08 DATE-FENCED CATALYST DOCS (&lt;= {activeSec.date})
                              </div>
                              <div className="space-y-1.5">
                                {activeSec.catalyst_rag.docs.slice(0, 3).map((doc, idx) => (
                                  <div
                                    key={`${doc.filing_date}-${idx}`}
                                    className="rounded-xl border border-white/10 bg-[#090A0C] p-2.5 text-xs"
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
                      </section>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* FLOATING SLIDE-OVER EXECUTION & GATE INSPECTOR DRAWER */}
      {tradeDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Pre-Trade Risk Gate & Execution Inspector"
        >
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setTradeDrawerOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col justify-between overflow-y-auto border-l border-white/15 bg-[#101216] p-6 shadow-2xl">
            <div>
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <StockLogo symbol={selectedTicker} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-black uppercase text-white">
                        {selectedTicker} RISK GATE
                      </h2>
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
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
                  className="rounded-xl border border-white/10 bg-[#090A0C] p-1.5 text-zinc-400 transition hover:border-[#D2FF00] hover:text-white"
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
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2">
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

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2">
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

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2 tabular-nums">
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

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#090A0C] px-3 py-2 tabular-nums">
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
                    className={`rounded-xl border py-2 font-bold uppercase transition ${
                      tradeSide === "BUY"
                        ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                        : "border-white/10 bg-[#090A0C] text-zinc-400"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeSide("SELL")}
                    className={`rounded-xl border py-2 font-bold uppercase transition ${
                      tradeSide === "SELL"
                        ? "border-[#FF3B5C] bg-[#FF3B5C] text-white"
                        : "border-white/10 bg-[#090A0C] text-zinc-400"
                    }`}
                  >
                    SELL
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
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
                  <label className="block rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
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

                <label className="block rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
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

                <label className="block rounded-xl border border-white/10 bg-[#090A0C] p-2.5">
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
                  <div className="space-y-2 rounded-xl border border-[#FF3B5C] bg-[#FF3B5C]/10 p-3 font-mono text-[11px] text-zinc-200">
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
                            className="rounded-lg border border-white/15 bg-[#090A0C] px-2.5 py-1 text-zinc-300"
                          >
                            CANCEL
                          </button>
                          <button
                            type="button"
                            onClick={dispatchOrder}
                            disabled={executingTrade || !activeSec}
                            className="rounded-lg border border-[#FF3B5C] bg-[#FF3B5C] px-2.5 py-1 font-bold text-white disabled:opacity-50"
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
                    className={`w-full rounded-xl py-3 font-mono text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${
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
                  <div className="rounded-xl border border-white/15 bg-[#090A0C] p-3 font-mono text-[11px] text-zinc-300">
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

            <div className="mt-6 border-t border-white/10 pt-3 font-mono text-[10px] text-zinc-500">
              All orders pass backend ClaimVerifier, Factor 4B, ₹25k cap &amp; ±2% LTP collar checks.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
