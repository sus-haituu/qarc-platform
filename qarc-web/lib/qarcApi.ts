import type { SeriesPoint } from "@/components/StateSpaceChart";

export interface FieldBadge {
  badge: "SUPPORTED" | "OVERRIDDEN" | "ABSTAINED" | "REJECTED" | string;
  status: string;
  raw: string;
  verified: string;
  cites: string[];
  notes: string;
}

export interface PriceForecast {
  current_price?: number;
  daily_drift_pct?: number;
  validated_factor_5d_drift_pct?: number;
  t1_expected_return_pct?: number;
  t1_expected_price?: number;
  t1_lower_1sigma?: number;
  t1_upper_1sigma?: number;
  t5_expected_return_pct?: number;
  t5_expected_price?: number;
  t5_lower_95?: number;
  t5_upper_95?: number;
  prob_up_pct?: number;
  prob_down_pct?: number;
  directional_bias?: string;
  primary_drivers?: string[];
  expected_5d_return_pct?: number;
  q10_price?: number;
  q50_price?: number;
  q90_price?: number;
  q10_ret_pct?: number;
  q50_ret_pct?: number;
  q90_ret_pct?: number;
  direction_label?: string;
  forecast_source?: string;
}

export interface VectorTwin {
  symbol: string;
  bar_date: string;
  hmm_state: string;
  fwd_5d_ret_pct: number | null;
  cosine_similarity: number;
  cosine_distance?: number;
}

export interface VectorTwinsPayload {
  available: boolean;
  source?: string;
  twins?: VectorTwin[];
  twin_count?: number;
  mean_fwd_5d_ret_pct?: number | null;
  mean_5d_return_pct?: number | null;
  historical_5d_win_rate_pct?: number | null;
  reason?: string;
}

export interface CatalystRagDoc {
  symbol: string;
  filing_date: string;
  headline: string;
  category: string;
  source: string;
  cosine_similarity: number;
}

export interface CatalystRagPayload {
  available: boolean;
  source?: string;
  docs?: CatalystRagDoc[];
  reason?: string;
}

export interface SecurityData {
  ticker: string;
  date: string;
  latency_ms: number;
  hurst_60d?: number;
  hurst_routing_mode?: string;
  active_factors?: {
    factor_1_short_covering: boolean;
    factor_2_squeeze: boolean;
    factor_4b_deal_churn: boolean;
  };
  series?: SeriesPoint[];
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
      forecast_daily_vol_pct?: number;
      long_run_annualized_vol_pct?: number;
      persistence: number | null;
      volatility_hazard_ratio: number;
      volatility_regime: string;
      hazard_alert: string;
    };
    kalman: {
      raw_price: number;
      filtered_price: number;
      trend_velocity_pts_per_day?: number;
      trend_velocity_pct_per_day: number;
      microstructure_noise_pts: number;
      noise_pct_of_price?: number;
      noise_to_signal_ratio?: number;
      trend_signal: string;
    };
    hmm: {
      current_regime: string;
      confidence: number;
      persistence: number;
      entropy_bits: number;
      normalized_entropy?: number;
      probabilities: Record<string, number>;
      summary?: string;
    };
    monte_carlo: {
      simulated_median_price?: number;
      simulated_median_return_pct?: number;
      p05_worst_case_price?: number;
      p95_best_case_price?: number;
      var_95_pct: number;
      var_99_pct?: number;
      cvar_95_expected_shortfall_pct: number;
      prob_stop_breach_pct: number;
      prob_target_hit_pct: number;
      asymmetry_ratio?: number;
      recommended_max_allocation_cap_pct: number;
      position_sizing_breakdown?: {
        stop_risk_budget_cap_pct?: number;
        vol_target_cap_pct?: number;
        cvar_tail_stress_cap_pct?: number;
        account_risk_budget_used?: string;
        effective_stop_distance_used?: string;
        binding_constraint?: string;
      };
      risk_assessment: string;
    };
  };
  price_forecast?: PriceForecast;
  vector_twins?: VectorTwinsPayload;
  catalyst_rag?: CatalystRagPayload;
  raw_bcp_profile?: Record<string, string>;
  verified_bcp_profile?: Record<string, string>;
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
}

export interface SnapshotPayload {
  generated_at: string;
  tickers: string[];
  securities: Record<string, SecurityData>;
  reliability_audit?: {
    n_trials: number;
    n_fields: number;
    n_tickers: number;
    raw_rate_pct: number;
    raw_ci: string;
    post_rate_pct: number;
    post_ci: string;
    coverage_pct: number;
    e09_refusal_pct: number;
  };
}

export interface RecommendationItem {
  ticker: string;
  date?: string;
  ltp?: number;
  current_price?: number;
  hmm_state?: string;
  expected_5d_return_pct?: number;
  t5_expected_return_pct?: number;
  t1_expected_return_pct?: number;
  t5_expected_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  prob_up_pct?: number;
  directional_bias?: string;
  cvar_95_pct?: number;
  var_95_pct?: number;
  garch_daily_vol_pct?: number;
  kalman_vel?: number;
  score?: number;
  conviction_score?: number;
  rating?: string;
  tier?: string;
  action?: string;
  rationale?: string;
  has_factor_1?: boolean;
  has_factor_2?: boolean;
  has_factor_4b?: boolean;
  quarantined?: boolean;
  quarantine_reason?: string;
}

export interface RecommendationsResponse {
  as_of_date: string;
  latency_ms: number;
  count: number;
  recommendations: RecommendationItem[];
}

export interface PortfolioAllocationItem {
  ticker: string;
  weight_pct: number;
  target_weight_pct?: number;
  allocated_inr?: number;
  allocation_inr?: number;
  shares?: number;
  current_price?: number;
  ltp?: number;
  conviction_score?: number;
  t5_expected_return_pct?: number;
  expected_5d_return_pct?: number;
  cvar_95_pct?: number;
  stop_loss_price?: number;
  target_price?: number;
  rating?: string;
  tier?: string;
  hmm_state?: string;
  garch_daily_vol_pct?: number;
  prob_up_pct?: number;
  has_factor_1?: boolean;
  has_factor_2?: boolean;
  rationale?: string;
}

export interface PortfolioResponse {
  as_of_date?: string;
  capital_inr: number;
  risk_profile: string;
  max_single_weight_pct?: number;
  max_equity_weight_pct?: number;
  total_equity_inr?: number;
  total_equity_weight_pct?: number;
  cash_sweep_instrument?: string;
  cash_sweep_inr: number;
  cash_sweep_weight_pct?: number;
  cash_sweep_annual_yield_pct?: number;
  expected_5d_return_pct: number;
  portfolio_cvar95_pct: number;
  allocations: PortfolioAllocationItem[];
  quarantined_avoid?: Array<{
    ticker: string;
    rating: string;
    shares: number;
    rationale: string;
  }>;
  db_row_id?: number;
}

export interface TradeRecord {
  id: number;
  ticker: string;
  mode: string;
  action: string;
  quantity: number;
  limit_price: number;
  live_ltp: number;
  notional_inr: number;
  status: string;
  broker_order_id?: string;
  hmm_state?: string;
  verdict?: string;
  executed_at?: string;
}

export interface NewsArticle {
  title: string;
  published_at: string;
  source: string;
  url: string;
}

export interface NewsResponse {
  ticker: string;
  count: number;
  articles: NewsArticle[];
  e08_refreshed: boolean;
  e08_upserted: number;
}

export interface TradeExecuteResult {
  status: string;
  mode: string;
  order_id?: string;
  broker_order_id?: string;
  symbol?: string;
  side?: string;
  action?: string;
  quantity?: number;
  price?: number;
  limit_price?: number;
  reason?: string;
  db_row_id?: number;
}

export function getQarcApiBase(): string {
  return (process.env.NEXT_PUBLIC_QARC_API_URL || "").trim().replace(/\/+$/, "");
}

function buildApiUrl(path: string): string {
  const base = getQarcApiBase();
  return base ? `${base}${path}` : path;
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = init?.signal;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg =
        (data && (data.detail || data.error || data.reason)) ||
        `HTTP ${res.status}`;
      throw new Error(String(msg));
    }
    return data as T;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

export async function loadTelemetrySnapshot(): Promise<SnapshotPayload> {
  return fetchJson<SnapshotPayload>("/qarc_telemetry_snapshot.json", undefined, 8000);
}

export async function analyzeBcp(params: {
  ticker: string;
  filings?: string;
  use_live_angel?: boolean;
  llm_endpoint_url?: string;
}): Promise<{ mode: string; analysis: SecurityData }> {
  const payload = {
    ticker: params.ticker.trim().toUpperCase(),
    filings: params.filings || "none",
    use_live_angel: params.use_live_angel ?? true,
    ...(params.llm_endpoint_url ? { llm_endpoint_url: params.llm_endpoint_url } : {}),
  };
  const url = buildApiUrl("/api/bcp_analyze");
  const data = await fetchJson<Record<string, unknown>>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    25000
  );
  if (data && typeof data === "object" && "analysis" in data && data.analysis) {
    return {
      mode: String(data.mode || "live_api"),
      analysis: data.analysis as SecurityData,
    };
  }
  return {
    mode: "live_api",
    analysis: data as unknown as SecurityData,
  };
}

export async function fetchRecommendations(
  useLiveAngel = false
): Promise<RecommendationsResponse> {
  const url = buildApiUrl(`/api/recommendations?use_live_angel=${useLiveAngel ? "true" : "false"}`);
  return fetchJson<RecommendationsResponse>(url, undefined, 25000);
}

export async function generatePortfolio(params: {
  capital_inr: number;
  risk_profile: string;
  use_live_angel?: boolean;
}): Promise<PortfolioResponse> {
  const url = buildApiUrl("/api/portfolio/generate");
  return fetchJson<PortfolioResponse>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capital_inr: params.capital_inr,
        risk_profile: params.risk_profile,
        use_live_angel: params.use_live_angel ?? false,
        persist_to_db: true,
      }),
    },
    25000
  );
}

export async function fetchTrades(limit = 15): Promise<{ count: number; trades: TradeRecord[] }> {
  const url = buildApiUrl(`/api/trades?limit=${limit}`);
  return fetchJson<{ count: number; trades: TradeRecord[] }>(url, undefined, 10000);
}

export async function executeTrade(params: {
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  mode: "PAPER" | "LIVE_ANGEL";
  live_ltp?: number;
  has_factor_4b?: boolean;
  unresolved_contradictions?: number;
  hmm_state?: string;
  verdict?: string;
}): Promise<TradeExecuteResult> {
  const url = buildApiUrl("/api/execute_trade");
  return fetchJson<TradeExecuteResult>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: params.ticker,
        side: params.side,
        quantity: params.quantity,
        price: params.price,
        order_type: params.price > 0 ? "LIMIT" : "MARKET",
        product_type: "DELIVERY",
        mode: params.mode,
        live_ltp: params.live_ltp ?? 0,
        has_factor_4b: params.has_factor_4b ?? false,
        unresolved_contradictions: params.unresolved_contradictions ?? 0,
        hmm_state: params.hmm_state ?? "",
        verdict: params.verdict ?? "",
      }),
    },
    15000
  );
}

export async function fetchTickerNews(
  ticker: string,
  limit = 5
): Promise<NewsResponse> {
  const url = buildApiUrl(`/api/news/${encodeURIComponent(ticker.trim().toUpperCase())}?limit=${limit}`);
  return fetchJson<NewsResponse>(url, undefined, 12000);
}

export async function configureLlmEndpoint(params: {
  endpoint_url: string;
  admin_secret?: string;
}): Promise<{ status: string; endpoint_url: string }> {
  const url = buildApiUrl("/api/config/llm_endpoint");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.admin_secret) {
    headers["X-QARC-Admin-Secret"] = params.admin_secret;
  }
  return fetchJson<{ status: string; endpoint_url: string }>(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ endpoint_url: params.endpoint_url }),
    },
    10000
  );
}


// ---------------------------------------------------------------------------
// NSE equity symbol search (GET /api/symbols) with static offline fallback
// ---------------------------------------------------------------------------
export interface SymbolSearchItem {
  symbol: string;
  name: string;
  token: string;
}

export interface SymbolSearchResponse {
  query: string;
  source: string;
  count: number;
  results: SymbolSearchItem[];
}

/** Mirrors NSE_SYMBOL_TOKEN_MAP in qarc_angel_client.py (46 symbols). */
export const NSE_STATIC_SYMBOL_TOKENS: Record<string, string> = {
  RELIANCE: "2885",
  TCS: "11536",
  INFY: "1594",
  HDFCBANK: "1333",
  ICICIBANK: "4963",
  KOTAKBANK: "1922",
  DRREDDY: "881",
  SBIN: "3045",
  AXISBANK: "5900",
  INDUSINDBK: "5258",
  BANKBARODA: "4668",
  PNB: "10666",
  HCLTECH: "7229",
  WIPRO: "3787",
  TECHM: "13538",
  LTIM: "17818",
  PERSISTENT: "18365",
  SUNPHARMA: "3351",
  CIPLA: "694",
  DIVISLAB: "10940",
  APOLLOHOSP: "157",
  LUPIN: "10440",
  MARUTI: "10999",
  TATAMOTORS: "3456",
  "M&M": "2031",
  "BAJAJ-AUTO": "16669",
  ITC: "1660",
  HINDUNILVR: "1394",
  NESTLEIND: "17963",
  BRITANNIA: "547",
  ONGC: "2475",
  NTPC: "11630",
  POWERGRID: "14977",
  COALINDIA: "20374",
  TATASTEEL: "3499",
  HINDALCO: "1363",
  JSWSTEEL: "11723",
  VEDL: "3063",
  ADANIENT: "25",
  BAJFINANCE: "317",
  BAJAJFINSV: "16675",
  LT: "11483",
  ADANIPORTS: "15083",
  BEL: "383",
  HAL: "2303",
  DLF: "14732",
};

export function normalizeNseSymbol(raw: string): string {
  let s = (raw || "").trim().toUpperCase();
  if (s.endsWith(".NS")) s = s.slice(0, -3);
  if (s.endsWith("-EQ")) s = s.slice(0, -3);
  return s;
}

function searchStaticSymbols(query: string, limit: number): SymbolSearchItem[] {
  const q = normalizeNseSymbol(query);
  const entries = Object.entries(NSE_STATIC_SYMBOL_TOKENS).map(([symbol, token]) => ({
    symbol,
    name: symbol,
    token,
  }));
  if (!q) return entries.slice(0, limit);
  const rank = (s: string) => (s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : -1);
  return entries
    .map((e) => ({ e, r: rank(e.symbol) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.e.symbol.length - b.e.symbol.length || a.e.symbol.localeCompare(b.e.symbol))
    .slice(0, limit)
    .map((x) => x.e);
}

export async function searchSymbols(
  query: string,
  limit = 15,
  signal?: AbortSignal
): Promise<SymbolSearchResponse> {
  const q = normalizeNseSymbol(query);
  const url = buildApiUrl(`/api/symbols?q=${encodeURIComponent(q)}&limit=${limit}`);
  try {
    const data = await fetchJson<SymbolSearchResponse>(url, signal ? { signal } : undefined, 6000);
    if (Array.isArray(data?.results)) return data;
    throw new Error("Malformed /api/symbols response");
  } catch (err) {
    if (signal?.aborted) throw err;
    const results = searchStaticSymbols(q, limit);
    return { query: q, source: "OFFLINE_STATIC_TOKEN_MAP", count: results.length, results };
  }
}
