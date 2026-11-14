"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Cpu,
  Database,
  HelpCircle,
  Newspaper,
  PieChart,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import StateSpaceChart from "@/components/StateSpaceChart";
import NseStockSearch from "@/components/NseStockSearch";
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

const BCP_LABELS: Record<string, string> = {
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
        className="pointer-events-none invisible absolute bottom-full right-0 z-50 mb-1.5 w-64 border border-[#D2FF00]/60 bg-[#090A0C] p-2.5 font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-zinc-200 opacity-0 shadow-xl transition group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export default function DashboardPage() {
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

    // Attempt live Neon trades + news quietly
    try {
      const tr = await fetchTrades(10);
      setTrades(tr.trades);
    } catch {
      setTrades(null);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const handleSelectTicker = (ticker: string) => {
    setSelectedTicker(ticker);
    setApiNotice(null);
    setTradeReceipt(null);
    setLiveConfirmPending(false);
    setNewsArticles(null);
    setNewsE08Refreshed(false);
    if (snapshot?.securities?.[ticker]) {
      setActiveSec(snapshot.securities[ticker]);
      setDataSourceLabel("SNAPSHOT FALLBACK");
    } else {
      // Never show another stock's numbers under this ticker
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

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-[#23262D] bg-[#090A0C]/90 backdrop-blur-md">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 border border-[#23262D] bg-[#101216] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Overview
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold uppercase tracking-[-0.03em] text-white">
                  Q-ARC PLATFORM
                </span>
                <span className="border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#D2FF00]">
                  {dataSourceLabel}
                </span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                API: {apiBaseDisplay}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NseStockSearch onSubmit={handleSearchSubmit} busy={analyzing} />

            <div className="flex flex-wrap border border-[#23262D] bg-[#101216]">
              {WATCHLIST.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSelectTicker(t)}
                  className={`px-2.5 py-1.5 font-mono text-[11px] font-semibold transition ${
                    selectedTicker === t
                      ? "bg-[#D2FF00] text-[#090A0C]"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowPlainEnglish((s) => !s)}
              aria-pressed={showPlainEnglish}
              className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                showPlainEnglish
                  ? "border-[#D2FF00]/60 bg-[#D2FF00]/10 text-[#D2FF00] hover:border-[#D2FF00]"
                  : "border-[#23262D] bg-[#101216] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Plain English: {showPlainEnglish ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => setShowLlmConfig((s) => !s)}
              className="inline-flex items-center gap-1.5 border border-[#23262D] bg-[#101216] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
            >
              <Settings className="h-3.5 w-3.5" /> Colab LLM URL
            </button>

            <button
              type="button"
              onClick={() => handleRunLiveAnalyze()}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#090A0C] transition hover:bg-white hover:border-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? "animate-spin" : ""}`} />
              {analyzing ? "Analyzing..." : "Run Live Analyze"}
            </button>
          </div>
        </div>

        {/* Runtime Colab LLM Handshake Drawer */}
        {showLlmConfig && (
          <div className="border-t border-[#23262D] bg-[#101216] px-4 py-3 sm:px-6">
            <div className="mx-auto flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="text-[11px] uppercase tracking-wider text-[#D2FF00]">
                POST /api/config/llm_endpoint
              </span>
              <input
                type="url"
                value={llmUrlInput}
                onChange={(e) => setLlmUrlInput(e.target.value)}
                placeholder="https://xxxx.ngrok-free.app/v1"
                className="min-w-[260px] flex-1 border border-[#23262D] bg-[#090A0C] px-2.5 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:border-[#D2FF00] focus:outline-none"
              />
              <input
                type="password"
                value={llmAdminSecret}
                onChange={(e) => setLlmAdminSecret(e.target.value)}
                placeholder="X-QARC-Admin-Secret (optional)"
                className="w-56 border border-[#23262D] bg-[#090A0C] px-2.5 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:border-[#D2FF00] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveLlmEndpoint}
                disabled={savingLlmConfig}
                className="border border-[#D2FF00] bg-[#D2FF00] px-3 py-1.5 font-bold uppercase text-[#090A0C] disabled:opacity-50"
              >
                {savingLlmConfig ? "Saving..." : "Update Endpoint"}
              </button>
              {llmConfigStatus && (
                <span className="text-[11px] text-zinc-300">{llmConfigStatus}</span>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
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

        {!activeSec ? (
          <div className="border border-[#23262D] bg-[#101216] p-8 font-mono text-xs text-zinc-400">
            <div className="text-center">
              {!snapshot && dataSourceLabel === "LOADING" ? (
                "LOADING Q-ARC TELEMETRY..."
              ) : analyzing ? (
                <span className="text-[#D2FF00]">
                  RUNNING LIVE POST /api/bcp_analyze FOR {selectedTicker}...
                </span>
              ) : (
                <>
                  NO TELEMETRY FOR {selectedTicker} IN SNAPSHOT — AWAITING LIVE API CALL (/api/bcp_analyze).
                </>
              )}
            </div>
            {(loadingNews || (newsArticles && newsArticles.length > 0)) && (
              <div className="mx-auto mt-6 max-w-3xl border-t border-[#23262D] pt-4">
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
                        <span className="text-[10px] uppercase tabular-nums text-zinc-600">
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
            {/* Top Telemetry Strip */}
            <div className="grid grid-cols-2 gap-px bg-[#23262D] sm:grid-cols-3 lg:grid-cols-6">
              <div className="flex flex-col justify-between bg-[#101216] p-3.5">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>TICKER // DATE</span>
                    <InfoTooltip text="Active NSE symbol and latest market session date compared against Kalman denoised fair trend price." />
                  </div>
                  <div className="mt-1 font-display text-lg font-bold text-white">
                    {activeSec.ticker}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-zinc-400">
                    {activeSec.date}
                  </div>
                </div>
                {showPlainEnglish && kpiPlain && (
                  <p className="mt-2 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                    {kpiPlain.tickerDate}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between bg-[#101216] p-3.5">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>KALMAN / RAW LTP</span>
                    <InfoTooltip text="Kalman Filter separates underlying multi-day price velocity (%/day) from short-term random bid-ask noise." />
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#D2FF00]">
                    ₹{activeSec.quant_anchors.kalman.raw_price.toFixed(2)}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-zinc-400">
                    Vel {activeSec.quant_anchors.kalman.trend_velocity_pct_per_day >= 0 ? "+" : ""}
                    {activeSec.quant_anchors.kalman.trend_velocity_pct_per_day.toFixed(3)}%/d
                  </div>
                </div>
                {showPlainEnglish && kpiPlain && (
                  <p className="mt-2 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                    {kpiPlain.kalman}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between bg-[#101216] p-3.5">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>HMM REGIME</span>
                    <InfoTooltip text="4-state Hidden Markov Model phase inferred strictly from past returns & volatility: Accumulation, Markup, Distribution, or Markdown." />
                  </div>
                  <div className="mt-1 font-display text-lg font-bold uppercase text-white">
                    {activeSec.quant_anchors.hmm.current_regime}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-zinc-400">
                    Conf {(activeSec.quant_anchors.hmm.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                {showPlainEnglish && kpiPlain && (
                  <p className="mt-2 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                    {kpiPlain.hmm}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between bg-[#101216] p-3.5">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>GARCH(1,1) VOL</span>
                    <InfoTooltip text="Statistical volatility forecast showing expected annualized percentage price swing over the next year (~daily move × √252)." />
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-white">
                    {activeSec.quant_anchors.garch.forecast_annualized_vol_pct.toFixed(1)}%
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">
                    {activeSec.quant_anchors.garch.volatility_regime}
                  </div>
                </div>
                {showPlainEnglish && kpiPlain && (
                  <p className="mt-2 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                    {kpiPlain.garch}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between bg-[#101216] p-3.5">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>MC CVAR(95%)</span>
                    <InfoTooltip text="Conditional Value-at-Risk: average 10-day loss in the worst 5% of 10,000 simulated paths, setting your safe max position cap." />
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#FF3B5C]">
                    {activeSec.quant_anchors.monte_carlo.cvar_95_expected_shortfall_pct.toFixed(2)}%
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-zinc-400">
                    Cap {activeSec.quant_anchors.monte_carlo.recommended_max_allocation_cap_pct.toFixed(1)}%
                  </div>
                </div>
                {showPlainEnglish && kpiPlain && (
                  <p className="mt-2 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                    {kpiPlain.monteCarlo}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between bg-[#101216] p-3.5">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>CLAIM VERIFIER</span>
                    <InfoTooltip text="Neuro-symbolic guardrail that audits every AI statement against E01–E15 numbers in <5ms and overrides contradictions." />
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#D2FF00]">
                    {activeSec.guardrail_telemetry.post_guardrail_contradictions} CONTRA
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-zinc-400">
                    Cov {activeSec.guardrail_telemetry.evidence_coverage_pct.toFixed(1)}%
                  </div>
                </div>
                {showPlainEnglish && kpiPlain && (
                  <p className="mt-2 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                    {kpiPlain.verifier}
                  </p>
                )}
              </div>
            </div>

            {/* "In Plain English — What This Means For You" Summary Banner */}
            {showPlainEnglish && summaryBullets.length > 0 && (
              <section
                aria-label="In Plain English Summary"
                className="border border-[#D2FF00]/40 bg-[#101216] p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#23262D] pb-2.5">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[#D2FF00]" />
                    <span className="font-display text-sm font-bold uppercase tracking-wide text-white">
                      What This Means For You // In Plain English
                    </span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                    PLAIN-ENGLISH TRANSLATION FOR {activeSec.ticker} ({activeSec.date})
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {summaryBullets.map((b) => (
                    <div
                      key={b.label}
                      className={`border bg-[#090A0C] p-3 ${
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
                      <p className="mt-1 text-xs leading-relaxed text-zinc-200">{b.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Chart + E14 / Execution Split */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-7">
                <StateSpaceChart
                  ticker={activeSec.ticker}
                  series={activeSec.series || []}
                  currentRegime={activeSec.quant_anchors.hmm.current_regime}
                />

                {/* E14 Forecast + E15 Twins */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="border border-[#23262D] bg-[#101216] p-4">
                    <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                      <span className="flex items-center gap-1.5 text-[#D2FF00]">
                        <TrendingUp className="h-3.5 w-3.5" /> E14 5D FORECAST
                        <InfoTooltip text="Causal 5-trading-day price cone from validated factor drifts, Kalman velocity, HMM drift bias, and GARCH uncertainty (Bear = Q10 / 95% lower, Expected = Q50 / T+5, Bull = Q90 / 95% upper)." />
                      </span>
                      <span>{forecastView?.sourceLabel || "LIVE API ONLY"}</span>
                    </div>
                    {forecastView ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                          <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
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
                          <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
                            <div className="text-[10px] text-zinc-500">MEDIAN / T+5</div>
                            <div className="mt-0.5 font-bold text-white">
                              {forecastView.medianOrT5Price !== null
                                ? `₹${forecastView.medianOrT5Price.toFixed(2)}`
                                : "—"}
                            </div>
                          </div>
                          <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
                            <div className="text-[10px] text-zinc-500">BEAR (Q10 / 95% LO)</div>
                            <div className="mt-0.5 font-bold text-[#FF3B5C]">
                              {forecastView.bearPrice !== null
                                ? `₹${forecastView.bearPrice.toFixed(2)}`
                                : "—"}
                            </div>
                          </div>
                          <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
                            <div className="text-[10px] text-zinc-500">BULL (Q90 / 95% HI)</div>
                            <div className="mt-0.5 font-bold text-[#D2FF00]">
                              {forecastView.bullPrice !== null
                                ? `₹${forecastView.bullPrice.toFixed(2)}`
                                : "—"}
                            </div>
                          </div>
                        </div>
                        {showPlainEnglish && (
                          <p className="mt-2.5 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                            Model bias is <strong className="text-zinc-200">{forecastView.bias}</strong>
                            {forecastView.probUpPct !== null
                              ? ` (${forecastView.probUpPct.toFixed(1)}% upside odds)`
                              : ""}
                            . Bear/Bull mark the 95% statistical range over the next 5 sessions.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                        NOT IN SNAPSHOT. CLICK &ldquo;RUN LIVE ANALYZE&rdquo; FOR LIVE E14 QUANTILES.
                      </div>
                    )}
                  </div>

                  <div className="border border-[#23262D] bg-[#101216] p-4">
                    <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                      <span className="flex items-center gap-1.5 text-[#D2FF00]">
                        <Cpu className="h-3.5 w-3.5" /> E15 PGVECTOR TWINS
                        <InfoTooltip text="Historical Regime Twins retrieve past NSE trading days with the closest 8D state signature (similarity %) and report their actual subsequent 5-day return." />
                      </span>
                      <span>{activeSec.vector_twins?.source || "LIVE API ONLY"}</span>
                    </div>
                    {activeSec.vector_twins?.available && activeSec.vector_twins.twins?.length ? (
                      <>
                        <div className="space-y-1.5 font-mono text-[11px] tabular-nums">
                          {activeSec.vector_twins.twins.slice(0, 4).map((tw, i) => (
                            <div
                              key={`${tw.bar_date}-${i}`}
                              className="flex items-center justify-between border border-[#23262D] bg-[#090A0C] px-2.5 py-1.5"
                            >
                              <span className="text-zinc-300">
                                {tw.bar_date} ({tw.hmm_state})
                              </span>
                              <span className="text-[#D2FF00]">
                                {(tw.cosine_similarity * 100).toFixed(1)}%
                              </span>
                              <span
                                className={
                                  (tw.fwd_5d_ret_pct ?? 0) >= 0 ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                                }
                              >
                                {tw.fwd_5d_ret_pct !== null
                                  ? `${tw.fwd_5d_ret_pct >= 0 ? "+" : ""}${tw.fwd_5d_ret_pct.toFixed(2)}%`
                                  : "N/A"}
                              </span>
                            </div>
                          ))}
                        </div>
                        {showPlainEnglish && (
                          <p className="mt-2.5 border-t border-[#23262D] pt-2 text-[11px] leading-snug text-zinc-400">
                            Shows past market dates that looked most statistically similar to today (% match) and what the stock actually returned 5 days later.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                        NOT IN SNAPSHOT. CLICK &ldquo;RUN LIVE ANALYZE&rdquo; FOR NEON PGVECTOR TWINS.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Execution Terminal + BCP Badges + Ledger */}
              <div className="space-y-6 lg:col-span-5">
                {/* Execution Terminal */}
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-white">
                      <ShieldCheck className="h-4 w-4 text-[#D2FF00]" />
                      Pre-Trade Risk Gate
                    </span>
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

                  <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                    <select
                      value={tradeSide}
                      onChange={(e) => setTradeSide(e.target.value === "SELL" ? "SELL" : "BUY")}
                      className="border border-[#23262D] bg-[#090A0C] px-2.5 py-2 text-zinc-200"
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
                      className="border border-[#23262D] bg-[#090A0C] px-2.5 py-2 tabular-nums text-zinc-200"
                      aria-label="Order Quantity"
                    />
                    <input
                      type="number"
                      step="0.05"
                      value={tradePrice}
                      onChange={(e) => setTradePrice(e.target.value)}
                      placeholder={activeSec.quant_anchors.kalman.raw_price.toFixed(2)}
                      className="border border-[#23262D] bg-[#090A0C] px-2.5 py-2 tabular-nums text-zinc-200 placeholder:text-zinc-600"
                      aria-label="Limit Price"
                    />
                    <select
                      value={tradeMode}
                      onChange={(e) => {
                        const next = e.target.value === "LIVE_ANGEL" ? "LIVE_ANGEL" : "PAPER";
                        setTradeMode(next);
                        setLiveConfirmAck(false);
                        setLiveConfirmPending(false);
                      }}
                      className="border border-[#23262D] bg-[#090A0C] px-2.5 py-2 text-zinc-200"
                    >
                      <option value="PAPER">PAPER</option>
                      <option value="LIVE_ANGEL">LIVE_ANGEL</option>
                    </select>
                  </div>

                  {/* LIVE_ANGEL Explicit Confirmation Guard */}
                  {tradeMode === "LIVE_ANGEL" && (
                    <div className="mt-3 space-y-2 border border-[#FF3B5C] bg-[#FF3B5C]/10 p-3 font-mono text-[11px] text-zinc-200">
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
                          I confirm dispatching a real NSE {tradeSide} order for {tradeQty} {selectedTicker} via Angel One SmartAPI.
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
                              disabled={executingTrade}
                              className="border border-[#FF3B5C] bg-[#FF3B5C] px-2.5 py-1 font-bold text-white"
                            >
                              {executingTrade ? "SENDING..." : "CONFIRM LIVE_ANGEL"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={filingsInput}
                      onChange={(e) => setFilingsInput(e.target.value)}
                      placeholder="Filings override (optional)"
                      className="flex-1 border border-[#23262D] bg-[#090A0C] px-2.5 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600"
                    />
                    {!liveConfirmPending && (
                      <button
                        type="button"
                        onClick={handleOrderSubmitClick}
                        disabled={executingTrade}
                        className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${
                          tradeMode === "LIVE_ANGEL"
                            ? "border border-[#FF3B5C] bg-[#FF3B5C] text-white hover:bg-rose-500"
                            : "border border-[#D2FF00] bg-[#D2FF00] text-[#090A0C] hover:bg-white hover:border-white"
                        }`}
                      >
                        {executingTrade
                          ? "Dispatching..."
                          : tradeMode === "LIVE_ANGEL"
                          ? `Arm LIVE_ANGEL ${tradeSide}`
                          : `Execute ${tradeSide} (PAPER)`}
                      </button>
                    )}
                  </div>

                  {tradeReceipt && (
                    <div className="mt-3 border border-[#23262D] bg-[#090A0C] px-3 py-2 font-mono text-[11px] text-zinc-300 tabular-nums">
                      STATUS: <span className="font-bold text-[#D2FF00]">{tradeReceipt.status}</span>
                      {tradeReceipt.order_id ? ` | ORDER: ${tradeReceipt.order_id}` : ""}
                      {tradeReceipt.db_row_id ? ` | NEON ID: #${tradeReceipt.db_row_id}` : ""}
                      {tradeReceipt.reason ? ` | ${tradeReceipt.reason}` : ""}
                    </div>
                  )}
                </div>

                {/* BCP Guardrail Badges */}
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span>VERIFIED 7-FIELD BCP PROFILE</span>
                      <InfoTooltip text="7-part institutional flow profile checked line-by-line by ClaimVerifier against Evidence Ledger E01–E15." />
                    </span>
                    <span className="text-[#D2FF00]">
                      {activeSec.guardrail_telemetry.verification_status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(activeSec.guardrail_telemetry.field_badges || {}).map(
                      ([key, fb]) => {
                        const fieldMeta = getBcpFieldPlainEnglish(key, fb.verified);
                        return (
                          <div key={key} className="border border-[#23262D] bg-[#090A0C] p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                                {BCP_LABELS[key] || key}
                                <InfoTooltip
                                  text={fieldMeta.conceptTooltip}
                                  label={`Explain ${BCP_LABELS[key] || key}`}
                                />
                              </span>
                              {renderBadge(fb.badge, fb.status)}
                            </div>
                            <div className="mt-1 font-mono text-xs text-zinc-200">{fb.verified}</div>
                            {showPlainEnglish && (
                              <div className="mt-1 text-[11px] leading-snug text-zinc-400">
                                {fieldMeta.plainNote}
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Evidence Ledger */}
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    <span className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-[#D2FF00]" />
                      IMMUTABLE EVIDENCE LEDGER (E01–E15)
                    </span>
                    <span className="text-[10px] text-zinc-500">CLICK ? FOR DEFINITION</span>
                  </div>
                  <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                    {Object.entries(activeSec.evidence_ledger).map(([code, item]) => {
                      const pe = getEvidencePlainEnglish(code, item);
                      const isExpanded = expandedLedgerCode === code;
                      return (
                        <div
                          key={code}
                          className={`border px-2.5 py-2 font-mono text-[11px] ${
                            item.description.includes("FACTOR 4B")
                              ? "border-[#FF3B5C]/60 bg-[#FF3B5C]/10 text-[#FF3B5C]"
                              : "border-[#23262D] bg-[#090A0C] text-zinc-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="mr-2 font-bold text-[#D2FF00]">{code}</span>
                              <span className="mr-1.5 font-semibold text-white">{item.metric}:</span>
                              <span className="text-zinc-300">{item.description}</span>
                            </div>
                            <button
                              type="button"
                              title={pe.tooltip}
                              aria-label={`Explain ${code} ${item.metric}`}
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedLedgerCode((prev) => (prev === code ? null : code))
                              }
                              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] transition ${
                                isExpanded
                                  ? "border-[#D2FF00] bg-[#D2FF00] text-[#090A0C]"
                                  : "border-[#23262D] bg-[#101216] text-zinc-400 hover:border-[#D2FF00] hover:text-[#D2FF00]"
                              }`}
                            >
                              ?
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="mt-1.5 border border-[#D2FF00]/40 bg-[#101216] p-2 font-sans text-[11px] leading-snug text-zinc-200">
                              <span className="font-mono text-[10px] font-bold uppercase text-[#D2FF00]">
                                DEFINITION:{" "}
                              </span>
                              {pe.tooltip}
                            </div>
                          )}
                          {showPlainEnglish && (
                            <div className="mt-1 font-sans text-[11px] leading-snug text-zinc-400">
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
                </div>
              </div>
            </div>

            {/* Bottom Row: Screener/Portfolio + Live News/Trades */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Screener + Portfolio Generator */}
              <div className="space-y-6 lg:col-span-7">
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-white">
                      <Activity className="h-4 w-4 text-[#D2FF00]" />
                      Cross-Sectional Screener (/api/recommendations)
                    </span>
                    <button
                      type="button"
                      onClick={handleLoadRecommendations}
                      disabled={loadingRecs}
                      className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-[#D2FF00] transition hover:border-[#D2FF00] disabled:opacity-50"
                    >
                      {loadingRecs ? "Loading..." : "Fetch Screener"}
                    </button>
                  </div>
                  {recommendations ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse font-mono text-xs tabular-nums">
                        <thead>
                          <tr className="border-b border-[#23262D] text-left text-[10px] uppercase text-zinc-500">
                            <th className="py-2 pr-3">Ticker</th>
                            <th className="py-2 pr-3">HMM</th>
                            <th className="py-2 pr-3">E14 5D</th>
                            <th className="py-2 pr-3">CVaR95</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#23262D]">
                          {recommendations.map((rec) => {
                            const recRet = rec.t5_expected_return_pct ?? rec.expected_5d_return_pct;
                            const isQuarantined = Boolean(rec.quarantined) || rec.rating === "AVOID";
                            return (
                              <tr key={rec.ticker} className="text-zinc-300">
                                <td className="py-2 pr-3 font-bold text-white">{rec.ticker}</td>
                                <td className="py-2 pr-3">{rec.hmm_state || "—"}</td>
                                <td
                                  className={`py-2 pr-3 ${
                                    (recRet ?? 0) >= 0 ? "text-[#D2FF00]" : "text-[#FF3B5C]"
                                  }`}
                                >
                                  {recRet !== undefined
                                    ? `${recRet >= 0 ? "+" : ""}${recRet.toFixed(2)}%`
                                    : "—"}
                                </td>
                                <td className="py-2 pr-3 text-[#FF3B5C]">
                                  {rec.cvar_95_pct !== undefined
                                    ? `${rec.cvar_95_pct.toFixed(2)}%`
                                    : "—"}
                                </td>
                                <td className="py-2">
                                  {isQuarantined ? (
                                    <span className="text-[#FF3B5C]">
                                      {rec.rating || "QUARANTINED"} (
                                      {rec.quarantine_reason || rec.rationale || "RISK"})
                                    </span>
                                  ) : (
                                    <span className="text-[#D2FF00]">
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
                    <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                      AWAITING LIVE API CALL. CLICK &ldquo;FETCH SCREENER&rdquo; TO RANK WATCHLIST FROM FASTAPI.
                    </div>
                  )}
                </div>

                {/* Portfolio Generator */}
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-white">
                      <PieChart className="h-4 w-4 text-[#D2FF00]" />
                      Portfolio Advisor (/api/portfolio/generate)
                    </span>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      <input
                        type="number"
                        min={50000}
                        step={50000}
                        value={capitalInr}
                        onChange={(e) => setCapitalInr(Math.max(50000, Number(e.target.value) || 500000))}
                        className="w-28 border border-[#23262D] bg-[#090A0C] px-2 py-1 tabular-nums text-zinc-200"
                      />
                      <select
                        value={riskProfile}
                        onChange={(e) => setRiskProfile(e.target.value)}
                        className="border border-[#23262D] bg-[#090A0C] px-2 py-1 text-zinc-200"
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
                        className="border border-[#D2FF00] bg-[#D2FF00] px-3 py-1 font-bold uppercase text-[#090A0C] disabled:opacity-50"
                      >
                        {generatingPortfolio ? "Sizing..." : "Generate"}
                      </button>
                    </div>
                  </div>
                  {portfolio ? (
                    <div className="space-y-3 font-mono text-xs tabular-nums">
                      {/* Plain-English Strategy Summary */}
                      <div className="border border-[#D2FF00]/40 bg-[#090A0C] p-3 font-sans">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D2FF00]">
                            PLAIN-ENGLISH STRATEGY SUMMARY ({portfolio.risk_profile})
                          </span>
                          <span className="font-mono text-[10px] text-zinc-500">
                            CAPITAL: ₹{portfolio.capital_inr.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-zinc-200">
                          {buildPortfolioStrategySummary(portfolio)}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
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
                        <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
                          <div className="text-[10px] text-zinc-500">PORTFOLIO CVAR95</div>
                          <div className="font-bold text-[#FF3B5C]">
                            {portfolio.portfolio_cvar95_pct.toFixed(2)}%
                          </div>
                        </div>
                        <div className="border border-[#23262D] bg-[#090A0C] p-2.5">
                          <div className="text-[10px] text-zinc-500">
                            {portfolio.cash_sweep_instrument || "LIQUIDBEES"} SWEEP
                          </div>
                          <div className="font-bold text-white">
                            ₹{portfolio.cash_sweep_inr.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>

                      {/* Per-Stock Allocation Cards */}
                      {portfolio.allocations.length > 0 ? (
                        <div className="space-y-2">
                          {portfolio.allocations.map((a) => {
                            const pe = buildAllocationPlainEnglish(a, portfolio);
                            return (
                              <div
                                key={a.ticker}
                                className="border border-[#23262D] bg-[#090A0C] p-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-display text-sm font-bold text-white">
                                      {a.ticker}
                                    </span>
                                    {a.rating && (
                                      <span className="border border-[#D2FF00]/50 bg-[#D2FF00]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#D2FF00]">
                                        {a.rating}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className="font-bold text-[#D2FF00]">
                                      {a.weight_pct.toFixed(1)}%
                                    </span>
                                    <span className="font-bold text-white">
                                      ₹{pe.amountInr.toLocaleString("en-IN")}
                                    </span>
                                    <span className="text-zinc-400">
                                      {a.shares !== undefined ? `${a.shares} sh` : ""}
                                      {pe.priceInr > 0 ? ` @ ₹${pe.priceInr.toFixed(2)}` : ""}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-2 space-y-1 font-sans text-[11px] leading-snug">
                                  <p className="text-zinc-300">
                                    <span className="font-mono text-[10px] uppercase text-[#D2FF00]">
                                      Why picked:{" "}
                                    </span>
                                    {pe.whyPickedOrCapped}
                                  </p>
                                  <p className="text-zinc-400">
                                    <span className="font-mono text-[10px] uppercase text-[#FF3B5C]">
                                      Risk note:{" "}
                                    </span>
                                    {pe.keyRiskNote}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="border border-[#23262D] bg-[#090A0C] p-3 font-sans text-xs text-zinc-400">
                          No watchlist stock cleared all safety filters — 100% of ₹
                          {portfolio.capital_inr.toLocaleString("en-IN")} was kept safely in{" "}
                          {portfolio.cash_sweep_instrument || "LIQUIDBEES"} cash sweep.
                        </div>
                      )}

                      {/* Quarantined / Avoided Stocks */}
                      {portfolio.quarantined_avoid && portfolio.quarantined_avoid.length > 0 && (
                        <div className="border border-[#FF3B5C]/40 bg-[#FF3B5C]/5 p-2.5 font-sans text-[11px]">
                          <div className="font-mono text-[10px] font-bold uppercase text-[#FF3B5C]">
                            QUARANTINED / EXCLUDED (₹0 ALLOCATED)
                          </div>
                          <div className="mt-1 space-y-0.5 text-zinc-300">
                            {portfolio.quarantined_avoid.map((q) => (
                              <div key={q.ticker}>
                                <strong className="font-mono text-white">{q.ticker}</strong>:{" "}
                                {q.rationale}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Collapsible Raw Quant / JSON View */}
                      <div className="border border-[#23262D] bg-[#090A0C]">
                        <button
                          type="button"
                          onClick={() => setShowRawPortfolioJson((s) => !s)}
                          aria-expanded={showRawPortfolioJson}
                          className="flex w-full items-center justify-between px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition hover:text-[#D2FF00]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5" />
                            Raw Quant / JSON View
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
                    <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                      AWAITING LIVE API CALL. CLICK &ldquo;GENERATE&rdquo; TO COMPUTE &amp; PERSIST NEON PORTFOLIO.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Bottom: Live News + Neon Trade Ledger */}
              <div className="space-y-6 lg:col-span-5">
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-white">
                      <Newspaper className="h-4 w-4 text-[#D2FF00]" />
                      Live News &amp; E08 Refresh
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRefreshNews()}
                      disabled={loadingNews}
                      className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-[#D2FF00] transition hover:border-[#D2FF00] disabled:opacity-50"
                    >
                      {loadingNews ? "Fetching..." : `Fetch ${selectedTicker}`}
                    </button>
                  </div>
                  {newsE08Refreshed && (
                    <div className="mb-2 font-mono text-[10px] uppercase text-[#D2FF00]">
                      NEON nse_catalyst_rag E08 EMBEDDINGS UPDATED
                    </div>
                  )}
                  {newsArticles ? (
                    newsArticles.length ? (
                      <div className="space-y-2">
                        {newsArticles.map((art, idx) => (
                          <a
                            key={`${art.url}-${idx}`}
                            href={art.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block border border-[#23262D] bg-[#090A0C] p-2.5 transition hover:border-[#D2FF00]"
                          >
                            <div className="font-mono text-xs text-zinc-200">{art.title}</div>
                            <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
                              <span>{art.source}</span>
                              <span>{art.published_at}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-[#23262D] bg-[#090A0C] p-3 font-mono text-[11px] text-zinc-500">
                        NO RECENT HEADLINES RETURNED FOR {selectedTicker}.
                      </div>
                    )
                  ) : (
                    <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                      AWAITING LIVE API CALL (/api/news/{selectedTicker}).
                    </div>
                  )}
                </div>

                {/* Neon Trade Executions */}
                <div className="border border-[#23262D] bg-[#101216] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                      Neon Trade Ledger (/api/trades)
                    </span>
                    <button
                      type="button"
                      onClick={handleRefreshTrades}
                      disabled={loadingTrades}
                      className="border border-[#23262D] bg-[#090A0C] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-300 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
                    >
                      {loadingTrades ? "Syncing..." : "Refresh"}
                    </button>
                  </div>
                  {trades ? (
                    trades.length ? (
                      <div className="max-h-56 space-y-1.5 overflow-y-auto font-mono text-[11px] tabular-nums">
                        {trades.map((tr) => (
                          <div
                            key={tr.id}
                            className="flex items-center justify-between border border-[#23262D] bg-[#090A0C] px-2.5 py-2"
                          >
                            <span>
                              <strong className="text-white">#{tr.id} {tr.ticker}</strong>{" "}
                              <span className="text-zinc-400">
                                {tr.action} {tr.quantity} @ ₹{Number(tr.limit_price).toFixed(2)}
                              </span>
                            </span>
                            <span
                              className={
                                tr.status.includes("FILLED") || tr.status.includes("SUBMITTED")
                                  ? "text-[#D2FF00]"
                                  : "text-[#FF3B5C]"
                              }
                            >
                              {tr.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                        NO TRADES RECORDED IN NEON YET.
                      </div>
                    )
                  ) : (
                    <div className="border border-[#23262D] bg-[#090A0C] p-4 font-mono text-[11px] text-zinc-500">
                      NEON /api/trades OFFLINE OR NOT YET CONNECTED.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
