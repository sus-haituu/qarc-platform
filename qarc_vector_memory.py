"""
Q-ARC E15 Historical Regime Vector Memory (Neon Postgres pgvector)
===================================================================
Constructs strictly causal 8D unit-normalized market state vectors per bar
from corporate-action adjusted Bhavcopy history, caches the panel locally,
upserts into Neon Postgres `market_regime_vectors`, and retrieves top-k
historical regime twins via pgvector cosine distance (`<=>`).
"""
import os
import sys
import datetime
import concurrent.futures
from typing import Any, Callable, Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv

from qarc_db import execute_with_retry, init_db
from qarc_walk_forward_backtest import adjust_corporate_actions, compute_rolling_hurst

load_dotenv()

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

VECTOR_DIM = 8
GEMINI_EMBED_DIM = 768
GEMINI_EMBED_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"

_REGIME_CODE_MAP: Dict[str, float] = {
    "MARKUP": 1.0,
    "ACCUMULATION": 0.35,
    "NEUTRAL": 0.0,
    "DISTRIBUTION": -0.35,
    "MARKDOWN": -1.0,
}

FEATURE_COLUMNS: List[str] = [
    "ret_1d",
    "kalman_vel_norm",
    "kalman_acc_norm",
    "garch_or_rolling_vol",
    "rolling_hurst_60",
    "deliv_z",
    "rsi_14",
    "regime_code",
]


def resolve_regime_code(regime: Union[float, int, str]) -> float:
    """Maps HMM / tactical regime names or numeric codes cleanly into [-1.0, +1.0]."""
    if isinstance(regime, (int, float, np.number)) and not isinstance(regime, bool):
        return float(np.clip(float(regime), -1.0, 1.0))
    upper = str(regime or "").strip().upper()
    for key, val in _REGIME_CODE_MAP.items():
        if key in upper:
            return val
    try:
        return float(np.clip(float(upper), -1.0, 1.0))
    except ValueError:
        return 0.0


def build_8d_state_vector(
    ret_1d: float,
    kalman_vel_norm: float,
    kalman_acc_norm: float,
    garch_or_rolling_vol: float,
    rolling_hurst_60: float,
    deliv_z: float,
    rsi_14: float,
    regime_code: Union[float, int, str],
) -> np.ndarray:
    """
    Scales & clips 8 causal market state features into [-1, 1] and L2-normalizes
    into a unit-norm 8D numpy vector suitable for pgvector cosine distance (`<=>`).
    """
    resolved_regime = resolve_regime_code(regime_code)
    raw = np.array(
        [
            np.clip(float(ret_1d) / 5.0, -1.0, 1.0),
            np.clip(float(kalman_vel_norm) / 1.5, -1.0, 1.0),
            np.clip(float(kalman_acc_norm) / 0.75, -1.0, 1.0),
            np.clip((float(garch_or_rolling_vol) - 1.5) / 2.0, -1.0, 1.0),
            np.clip((float(rolling_hurst_60) - 0.50) / 0.25, -1.0, 1.0),
            np.clip(float(deliv_z) / 3.0, -1.0, 1.0),
            np.clip((float(rsi_14) - 50.0) / 35.0, -1.0, 1.0),
            np.clip(float(resolved_regime), -1.0, 1.0),
        ],
        dtype=np.float64,
    )
    raw = np.nan_to_num(raw, nan=0.0, posinf=1.0, neginf=-1.0)
    norm = float(np.linalg.norm(raw))
    if norm < 1e-12:
        return np.ones(VECTOR_DIM, dtype=np.float64) / np.sqrt(float(VECTOR_DIM))
    return raw / norm


def _format_pgvector(vec: Sequence[float], expected_dim: int = VECTOR_DIM) -> str:
    arr = np.asarray(vec, dtype=np.float64).reshape(-1)
    if arr.shape[0] != expected_dim:
        raise ValueError(f"Expected {expected_dim}D vector, got shape {arr.shape}")
    arr = np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=-1.0)
    norm = float(np.linalg.norm(arr))
    if norm < 1e-12:
        arr = np.ones(expected_dim, dtype=np.float64) / np.sqrt(float(expected_dim))
    elif abs(norm - 1.0) > 1e-9:
        arr = arr / norm
    return "[" + ",".join(f"{x:.8f}" for x in arr) + "]"


def _causal_2d_log_kalman(closes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Strictly causal constant-parameter 2D Kalman filter over log prices.
    State x_t = [log_price_t, log_velocity_t] depends ONLY on closes[0..t].
    Returns (velocity_pct_per_day, acceleration_pct_per_day2).
    """
    n = len(closes)
    log_p = np.log(np.maximum(np.asarray(closes, dtype=np.float64), 1e-6))
    vel_pct = np.zeros(n, dtype=np.float64)
    acc_pct = np.zeros(n, dtype=np.float64)
    if n < 2:
        return vel_pct, acc_pct

    F = np.array([[1.0, 1.0], [0.0, 1.0]])
    H = np.array([[1.0, 0.0]])
    Q = np.array([[1e-5, 2e-5], [2e-5, 4e-5]])
    R = np.array([[4e-4]])
    eye2 = np.eye(2)

    x = np.array([[log_p[0]], [0.0]])
    P = np.array([[4e-4, 0.0], [0.0, 1e-4]])

    for t in range(n):
        if t > 0:
            x = F @ x
            P = F @ P @ F.T + Q
        y = log_p[t] - float((H @ x)[0, 0])
        S = float((H @ P @ H.T)[0, 0]) + R[0, 0]
        K = (P @ H.T) / S
        x = x + K * y
        P = (eye2 - K @ H) @ P
        vel_pct[t] = float(x[1, 0]) * 100.0
        if t > 0:
            acc_pct[t] = vel_pct[t] - vel_pct[t - 1]

    return vel_pct, acc_pct


def _causal_rsi_14(closes: np.ndarray) -> np.ndarray:
    """Strictly causal 14-day RSI without any backfill or future peeking."""
    s = pd.Series(np.asarray(closes, dtype=np.float64))
    diff = s.diff().fillna(0.0)
    gains = diff.clip(lower=0.0)
    losses = (-diff).clip(lower=0.0)
    avg_gain = gains.rolling(14, min_periods=1).mean()
    avg_loss = losses.rolling(14, min_periods=1).mean()
    rs = avg_gain / np.maximum(avg_loss, 1e-6)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return np.asarray(rsi.fillna(50.0), dtype=np.float64)


def build_historical_panel(
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    cache_path: str = "data/regime_vector_panel.csv",
    force_rebuild: bool = False,
) -> pd.DataFrame:
    """
    Constructs a strictly causal panel of 8D unit-norm state vectors from
    corporate-action-adjusted Bhavcopy bars and caches it to disk.
    Zero look-ahead bias: every feature at bar t uses only data <= t.
    """
    if not force_rebuild and cache_path and os.path.exists(cache_path):
        cached = pd.read_csv(cache_path)
        if not cached.empty and "state_vector" in cached.columns:
            return cached

    if not os.path.exists(bhavcopy_path):
        raise FileNotFoundError(f"Bhavcopy dataset not found at {bhavcopy_path}")

    df = pd.read_csv(bhavcopy_path)
    df["date"] = pd.to_datetime(df["date"])
    df = adjust_corporate_actions(df)

    deliv_col = "DELIVERY_PCT" if "DELIVERY_PCT" in df.columns else (
        "delivery_pct" if "delivery_pct" in df.columns else None
    )

    records: List[Dict[str, Any]] = []
    for symbol, grp in df.groupby("ticker"):
        g = grp.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
        n = len(g)
        if n < 2:
            continue

        closes = g["close"].to_numpy(dtype=np.float64)
        dates_str = g["date"].dt.strftime("%Y-%m-%d").tolist()

        close_s = pd.Series(closes)
        ret_1d_arr = (close_s.pct_change() * 100.0).fillna(0.0).to_numpy(dtype=np.float64)

        k_vel_arr, k_acc_arr = _causal_2d_log_kalman(closes)

        # Strictly causal volatility: expanding up to 20 bars, rolling(20) thereafter
        ret_s = pd.Series(ret_1d_arr)
        exp_vol = ret_s.expanding(min_periods=2).std()
        roll_vol = ret_s.rolling(20, min_periods=20).std()
        vol_arr = roll_vol.fillna(exp_vol).fillna(1.5).to_numpy(dtype=np.float64)

        # Strictly causal delivery Z-score
        if deliv_col is not None:
            deliv_s = g[deliv_col].astype(np.float64).fillna(40.0)
            mean_30 = deliv_s.rolling(30, min_periods=1).mean()
            std_30 = deliv_s.rolling(30, min_periods=2).std().fillna(10.0)
            deliv_z_arr = ((deliv_s - mean_30) / np.maximum(std_30, 1.0)).fillna(0.0).to_numpy(dtype=np.float64)
        else:
            deliv_z_arr = np.zeros(n, dtype=np.float64)

        rsi_arr = _causal_rsi_14(closes)

        sma_20 = close_s.rolling(20, min_periods=1).mean().to_numpy(dtype=np.float64)
        sma_50 = close_s.rolling(50, min_periods=1).mean().to_numpy(dtype=np.float64)
        ret_20 = (close_s / close_s.shift(20).fillna(close_s.iloc[0]) - 1.0) * 100.0
        ret_20_arr = ret_20.fillna(0.0).to_numpy(dtype=np.float64)

        # Target outcome label ONLY for bars where t+5 exists (last 5 bars stay NaN)
        fwd_5d_arr = ((close_s.shift(-5) - close_s) / np.maximum(close_s, 1e-6) * 100.0).to_numpy(dtype=np.float64)

        for t in range(n):
            hurst_t = compute_rolling_hurst(closes[max(0, t - 59) : t + 1], window=60)
            c_t = closes[t]
            r20_t = ret_20_arr[t]
            dz_t = deliv_z_arr[t]

            if c_t > sma_20[t] and sma_20[t] >= sma_50[t] and r20_t > 2.0:
                hmm_state = "Markup"
                reg_code = 1.0
            elif c_t < sma_20[t] and sma_20[t] <= sma_50[t] and r20_t < -2.0:
                hmm_state = "Markdown"
                reg_code = -1.0
            elif c_t < sma_20[t] and dz_t < 0.0:
                hmm_state = "Distribution"
                reg_code = -0.35
            elif dz_t >= 0.0 and k_vel_arr[t] >= -0.05:
                hmm_state = "Accumulation"
                reg_code = 0.35
            else:
                hmm_state = "Neutral"
                reg_code = 0.0

            vec = build_8d_state_vector(
                ret_1d=ret_1d_arr[t],
                kalman_vel_norm=k_vel_arr[t],
                kalman_acc_norm=k_acc_arr[t],
                garch_or_rolling_vol=vol_arr[t],
                rolling_hurst_60=hurst_t,
                deliv_z=dz_t,
                rsi_14=rsi_arr[t],
                regime_code=reg_code,
            )

            fwd_val = round(float(fwd_5d_arr[t]), 4) if np.isfinite(fwd_5d_arr[t]) else np.nan
            records.append(
                {
                    "symbol": str(symbol).strip().upper(),
                    "bar_date": dates_str[t],
                    "hmm_state": hmm_state,
                    "fwd_5d_ret_pct": fwd_val,
                    "ret_1d": round(float(ret_1d_arr[t]), 4),
                    "kalman_vel_norm": round(float(k_vel_arr[t]), 4),
                    "kalman_acc_norm": round(float(k_acc_arr[t]), 4),
                    "garch_or_rolling_vol": round(float(vol_arr[t]), 4),
                    "rolling_hurst_60": round(float(hurst_t), 4),
                    "deliv_z": round(float(dz_t), 4),
                    "rsi_14": round(float(rsi_arr[t]), 4),
                    "regime_code": reg_code,
                    "state_vector": _format_pgvector(vec),
                }
            )

    panel_df = pd.DataFrame(records)
    if cache_path:
        os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
        panel_df.to_csv(cache_path, index=False)
    return panel_df


def upsert_panel_to_neon(
    panel_df: Optional[pd.DataFrame] = None,
    batch_size: int = 1000,
) -> Dict[str, int]:
    """
    Batched upsert of the causal 8D state vector panel into Neon Postgres
    `market_regime_vectors`. Returns row counts before and after.
    """
    from psycopg2.extras import execute_values

    init_db()
    if panel_df is None:
        panel_df = build_historical_panel()

    def _count(conn: Any) -> int:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM market_regime_vectors;")
            return int(cur.fetchone()[0])

    rows_before = int(execute_with_retry(_count))

    records: List[tuple] = []
    for row in panel_df.itertuples(index=False):
        fwd = getattr(row, "fwd_5d_ret_pct")
        fwd_clean = None if (fwd is None or (isinstance(fwd, float) and np.isnan(fwd))) else float(fwd)
        records.append(
            (
                str(getattr(row, "symbol")),
                str(getattr(row, "bar_date")),
                str(getattr(row, "hmm_state")),
                fwd_clean,
                str(getattr(row, "state_vector")),
            )
        )

    upsert_sql = """
        INSERT INTO market_regime_vectors (symbol, bar_date, hmm_state, fwd_5d_ret_pct, state_vector)
        VALUES %s
        ON CONFLICT (symbol, bar_date) DO UPDATE SET
            hmm_state = EXCLUDED.hmm_state,
            fwd_5d_ret_pct = EXCLUDED.fwd_5d_ret_pct,
            state_vector = EXCLUDED.state_vector;
    """

    for start in range(0, len(records), batch_size):
        chunk = records[start : start + batch_size]

        def _upsert_batch(conn: Any, batch: List[tuple] = chunk) -> None:
            with conn.cursor() as cur:
                execute_values(cur, upsert_sql, batch, template="(%s, %s, %s, %s, %s::vector)")

        execute_with_retry(_upsert_batch)

    rows_after = int(execute_with_retry(_count))
    return {
        "rows_before": rows_before,
        "rows_upserted": len(records),
        "rows_after": rows_after,
    }


def search_historical_twins(
    query_vec: Union[Sequence[float], np.ndarray],
    ticker: str,
    as_of_date: str,
    k: int = 5,
    symbol_filter: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Searches Neon Postgres `market_regime_vectors` via pgvector cosine distance (`<=>`)
    for top-k strictly causal historical twins (`bar_date < as_of_date` and known `fwd_5d_ret_pct`).
    Neon Postgres ONLY — raises RuntimeError if DATABASE_URL is missing.
    """
    init_db()
    vec_literal = _format_pgvector(query_vec)
    cutoff_date = str(as_of_date)[:10]
    top_k = max(int(k), 1)
    sym_filter = symbol_filter.strip().upper() if symbol_filter else None

    def _search(conn: Any) -> List[Dict[str, Any]]:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL hnsw.ef_search = 1000;")
            if sym_filter:
                cur.execute(
                    """
                    SELECT symbol,
                           bar_date::text AS bar_date,
                           hmm_state,
                           fwd_5d_ret_pct,
                           (state_vector <=> %s::vector) AS cosine_distance
                    FROM market_regime_vectors
                    WHERE bar_date < %s::date
                      AND fwd_5d_ret_pct IS NOT NULL
                      AND symbol = %s
                    ORDER BY state_vector <=> %s::vector ASC, symbol ASC, bar_date DESC
                    LIMIT %s;
                    """,
                    (vec_literal, cutoff_date, sym_filter, vec_literal, top_k),
                )
            else:
                cur.execute(
                    """
                    SELECT symbol,
                           bar_date::text AS bar_date,
                           hmm_state,
                           fwd_5d_ret_pct,
                           (state_vector <=> %s::vector) AS cosine_distance
                    FROM market_regime_vectors
                    WHERE bar_date < %s::date
                      AND fwd_5d_ret_pct IS NOT NULL
                    ORDER BY state_vector <=> %s::vector ASC, symbol ASC, bar_date DESC
                    LIMIT %s;
                    """,
                    (vec_literal, cutoff_date, vec_literal, top_k),
                )
            rows = cur.fetchall()
            out: List[Dict[str, Any]] = []
            for sym, bdate, hstate, fwd5, dist in rows:
                dist_f = float(dist)
                out.append(
                    {
                        "symbol": str(sym),
                        "bar_date": str(bdate),
                        "hmm_state": str(hstate or "Neutral"),
                        "fwd_5d_ret_pct": round(float(fwd5), 3),
                        "cosine_distance": round(dist_f, 6),
                        "cosine_similarity": round(1.0 - dist_f, 6),
                    }
                )
            return out

    twins = execute_with_retry(_search)
    if twins:
        fwd_vals = [t["fwd_5d_ret_pct"] for t in twins]
        win_rate = round((sum(1 for r in fwd_vals if r > 0.0) / len(fwd_vals)) * 100.0, 1)
        mean_ret = round(float(np.mean(fwd_vals)), 3)
    else:
        win_rate = 0.0
        mean_ret = 0.0

    return {
        "available": bool(twins),
        "query_ticker": str(ticker).strip().upper(),
        "as_of_date": cutoff_date,
        "k": top_k,
        "twins": twins,
        "historical_5d_win_rate_pct": win_rate,
        "mean_5d_return_pct": mean_ret,
        "source": "NEON_PGVECTOR_COSINE",
    }


# ---------------------------------------------------------------------------
# Step 5: E08 Institutional Filings & Catalyst RAG (Gemini 768D + Neon)
# ---------------------------------------------------------------------------

def embed_text_gemini(
    text: str,
    task_type: str = "RETRIEVAL_DOCUMENT",
) -> Optional[np.ndarray]:
    """
    Calls Gemini REST `gemini-embedding-001` with `outputDimensionality=768`
    and L2-normalizes the resulting vector. Reads `GEMINI_API_KEY` solely from
    `os.environ` (timeout=5s); returns None if offline, unconfigured, or failed.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    clean_text = " ".join(str(text or "").split()).strip()
    if not api_key or not clean_text:
        return None

    payload = {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": clean_text}]},
        "taskType": task_type,
        "outputDimensionality": GEMINI_EMBED_DIM,
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    try:
        resp = requests.post(
            GEMINI_EMBED_ENDPOINT,
            headers=headers,
            json=payload,
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        values = data.get("embedding", {}).get("values")
        if not isinstance(values, list) or len(values) != GEMINI_EMBED_DIM:
            return None
        arr = np.asarray(values, dtype=np.float64)
        if not np.all(np.isfinite(arr)):
            return None
        norm = float(np.linalg.norm(arr))
        if norm < 1e-12:
            return None
        return arr / norm
    except Exception:
        return None


def build_real_catalyst_docs(
    max_deal_docs: int = 25,
    max_news_docs: int = 35,
    bhavcopy_path: str = "data/raw_bhavcopy_data.csv",
    dataset_path: str = "data/qarc_bcp_dataset.csv",
    include_live_rss: bool = True,
) -> List[Dict[str, str]]:
    """
    Builds short timestamped catalyst documents strictly from real repository
    sources (`fetch_historical_bulk_block_deals` and `fetch_news`). Never fabricates filings.
    """
    from fetch_data import fetch_historical_bulk_block_deals
    from fetch_news import fetch_headlines

    docs: List[Dict[str, str]] = []
    seen_keys = set()

    def _add_doc(symbol: str, filing_date: str, headline: str, category: str, source: str) -> None:
        sym_clean = str(symbol or "").strip().upper()
        fdate = str(filing_date or "")[:10]
        hline = " ".join(str(headline or "").split()).strip()
        if not sym_clean or len(fdate) != 10 or not hline or hline.lower() in ("none", "nan"):
            return
        key = (sym_clean, fdate, hline)
        if key in seen_keys:
            return
        seen_keys.add(key)
        docs.append(
            {
                "symbol": sym_clean,
                "filing_date": fdate,
                "headline": hline[:800],
                "category": category,
                "source": source,
            }
        )

    universe_tickers = set()
    if os.path.exists(bhavcopy_path):
        try:
            bhav = pd.read_csv(bhavcopy_path, usecols=["ticker"])
            universe_tickers = {str(t).strip().upper() for t in bhav["ticker"].dropna().unique()}
        except Exception:
            universe_tickers = set()

    # 1. Real NSE bulk/block deals from fetch_historical_bulk_block_deals (cache/NSE)
    try:
        deals_df = fetch_historical_bulk_block_deals(
            datetime.date(2026, 8, 1),
            datetime.date(2026, 10, 6),
        )
        if deals_df is not None and not deals_df.empty:
            deals_df = deals_df.copy()
            deals_df["ticker"] = deals_df["ticker"].astype(str).str.strip().str.upper()
            deals_df["date_str"] = pd.to_datetime(deals_df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
            deals_df = deals_df.dropna(subset=["date_str", "bulk_block_deals"])

            universe_deals = deals_df[deals_df["ticker"].isin(universe_tickers)] if universe_tickers else deals_df.iloc[0:0]
            other_deals = deals_df[~deals_df["ticker"].isin(universe_tickers)].sort_values("date_str", ascending=False)

            for row in universe_deals.itertuples(index=False):
                _add_doc(
                    symbol=row.ticker,
                    filing_date=row.date_str,
                    headline=f"NSE Bulk/Block Deal Disclosure on {row.date_str}: {row.bulk_block_deals}",
                    category="BULK_BLOCK_DEAL",
                    source="fetch_data.fetch_historical_bulk_block_deals",
                )
            for row in other_deals.head(max_deal_docs).itertuples(index=False):
                _add_doc(
                    symbol=row.ticker,
                    filing_date=row.date_str,
                    headline=f"NSE Bulk/Block Deal Disclosure on {row.date_str}: {row.bulk_block_deals}",
                    category="BULK_BLOCK_DEAL",
                    source="fetch_data.fetch_historical_bulk_block_deals",
                )
    except Exception:
        pass

    # 2. Real dated news headlines captured via fetch_news in qarc_bcp_dataset.csv
    if os.path.exists(dataset_path):
        try:
            ds = pd.read_csv(dataset_path, usecols=["ticker", "date", "headline"])
            h_mask = ds["headline"].notna() & (
                ~ds["headline"].astype(str).str.strip().str.lower().isin(["none", "nan", ""])
            )
            ds = ds[h_mask].copy()
            ds["ticker"] = ds["ticker"].astype(str).str.strip().str.upper()
            ds["date_str"] = pd.to_datetime(ds["date"], errors="coerce").dt.strftime("%Y-%m-%d")
            ds = ds.dropna(subset=["date_str"]).sort_values(["date_str", "ticker"], ascending=[False, True])
            ds_latest = ds.drop_duplicates(subset=["ticker"], keep="first").head(max_news_docs)
            for row in ds_latest.itertuples(index=False):
                _add_doc(
                    symbol=row.ticker,
                    filing_date=row.date_str,
                    headline=f"NSE News ({row.date_str}): {row.headline}",
                    category="NEWS_CATALYST",
                    source="fetch_news.fetch_headlines",
                )
        except Exception:
            pass

    # 3. Real Google News RSS headlines around latest Bhavcopy bar for core watchlist
    if include_live_rss:
        core_watchlist = [
            "RELIANCE",
            "TCS",
            "INFY",
            "HDFCBANK",
            "ICICIBANK",
            "KOTAKBANK",
            "DRREDDY",
            "SBIN",
        ]
        target_dt = datetime.date(2026, 10, 6)
        for sym in core_watchlist:
            try:
                hl = fetch_headlines(sym, target_dt)
                if hl and str(hl).strip():
                    _add_doc(
                        symbol=sym,
                        filing_date="2026-10-06",
                        headline=f"NSE News (2026-10-06): {hl}",
                        category="NEWS_CATALYST",
                        source="fetch_news.fetch_headlines",
                    )
            except Exception:
                continue

    return docs


def upsert_catalysts_to_neon(
    docs: Optional[List[Dict[str, Any]]] = None,
    embed_fn: Optional[Callable[[str, str], Optional[np.ndarray]]] = None,
    batch_size: int = 200,
) -> Dict[str, int]:
    """
    Embeds catalyst documents (768D Gemini `RETRIEVAL_DOCUMENT` by default) and
    upserts them into Neon Postgres `nse_catalyst_rag`.
    """
    from psycopg2.extras import execute_values

    init_db()
    if docs is None:
        docs = build_real_catalyst_docs()

    _embed = embed_fn or embed_text_gemini

    def _count(conn: Any) -> int:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM nse_catalyst_rag;")
            return int(cur.fetchone()[0])

    rows_before = int(execute_with_retry(_count))

    def _prepare_row(doc: Dict[str, Any]) -> Optional[tuple]:
        sym = str(doc.get("symbol", "")).strip().upper()
        fdate = str(doc.get("filing_date", ""))[:10]
        headline = " ".join(str(doc.get("headline", "")).split()).strip()
        cat = str(doc.get("category", "CATALYST")).strip()
        src = str(doc.get("source", "unknown")).strip()
        if not sym or len(fdate) != 10 or not headline:
            return None
        embed_input = f"{sym} ({fdate}) [{cat}]: {headline}"
        vec = _embed(embed_input, task_type="RETRIEVAL_DOCUMENT")
        if vec is None:
            return None
        vec_str = _format_pgvector(vec, expected_dim=GEMINI_EMBED_DIM)
        return (sym, fdate, headline, cat, src, vec_str)

    prepared: List[tuple] = []
    if embed_fn is None and len(docs) > 1:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for item in pool.map(_prepare_row, docs):
                if item is not None:
                    prepared.append(item)
    else:
        for doc in docs:
            item = _prepare_row(doc)
            if item is not None:
                prepared.append(item)

    # Deduplicate exact conflict key before batch execute_values
    dedup_map: Dict[tuple, tuple] = {}
    for rec in prepared:
        dedup_map[(rec[0], rec[1], rec[2])] = rec
    records = list(dedup_map.values())

    sql = """
        INSERT INTO nse_catalyst_rag (
            symbol, filing_date, headline, category, source, embedding
        ) VALUES %s
        ON CONFLICT (symbol, filing_date, headline) DO UPDATE SET
            category = EXCLUDED.category,
            source = EXCLUDED.source,
            embedding = EXCLUDED.embedding;
    """
    for start in range(0, len(records), batch_size):
        chunk = records[start : start + batch_size]

        def _upsert_chunk(conn: Any, batch: List[tuple] = chunk) -> None:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    sql,
                    batch,
                    template="(%s, %s::date, %s, %s, %s, %s::vector)",
                    page_size=min(len(batch), 200),
                )
            conn.commit()

        execute_with_retry(_upsert_chunk)

    rows_after = int(execute_with_retry(_count))
    return {
        "rows_before": rows_before,
        "rows_upserted": len(records),
        "rows_after": rows_after,
    }


def retrieve_catalyst_rag(
    ticker: str,
    as_of_date: str,
    k: int = 3,
    query_text: Optional[str] = None,
    embed_fn: Optional[Callable[[str, str], Optional[np.ndarray]]] = None,
) -> Dict[str, Any]:
    """
    Retrieves up to k timestamped E08 catalyst / filing documents from Neon
    Postgres `nse_catalyst_rag` strictly with `filing_date <= as_of_date`.
    Returns offline/empty gracefully if embeddings are unavailable.
    """
    sym = str(ticker or "").strip().upper()
    cutoff_date = str(as_of_date or "")[:10]
    top_k = max(int(k), 1)
    _embed = embed_fn or embed_text_gemini

    q_text = query_text or (
        f"{sym} NSE institutional bulk block deal filing corporate catalyst news as of {cutoff_date}"
    )
    q_vec = _embed(q_text, task_type="RETRIEVAL_QUERY")
    if q_vec is None:
        return {
            "available": False,
            "ticker": sym,
            "as_of_date": cutoff_date,
            "k": top_k,
            "docs": [],
            "source": "OFFLINE_NO_EMBEDDING",
        }

    init_db()
    vec_literal = _format_pgvector(q_vec, expected_dim=GEMINI_EMBED_DIM)

    def _query(conn: Any) -> List[Dict[str, Any]]:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL hnsw.ef_search = 100;")
            cur.execute(
                """
                SELECT symbol,
                       filing_date::text AS filing_date,
                       headline,
                       category,
                       source,
                       (embedding <=> %s::vector) AS cosine_distance
                FROM nse_catalyst_rag
                WHERE symbol = %s
                  AND filing_date <= %s::date
                ORDER BY embedding <=> %s::vector ASC, filing_date DESC
                LIMIT %s;
                """,
                (vec_literal, sym, cutoff_date, vec_literal, top_k),
            )
            rows = cur.fetchall()
            out: List[Dict[str, Any]] = []
            for r_sym, r_date, r_hl, r_cat, r_src, r_dist in rows:
                dist_f = float(r_dist)
                out.append(
                    {
                        "symbol": str(r_sym),
                        "filing_date": str(r_date),
                        "headline": str(r_hl),
                        "category": str(r_cat or "CATALYST"),
                        "source": str(r_src or "unknown"),
                        "cosine_distance": round(dist_f, 6),
                        "cosine_similarity": round(1.0 - dist_f, 6),
                    }
                )
            return out

    docs = execute_with_retry(_query)
    return {
        "available": bool(docs),
        "ticker": sym,
        "as_of_date": cutoff_date,
        "k": top_k,
        "docs": docs,
        "source": "NEON_PGVECTOR_GEMINI_RAG",
    }


def delete_catalyst_rag_by_symbol(symbol: str) -> int:
    """Deletes `nse_catalyst_rag` rows for `symbol` (for DB test cleanup)."""
    init_db()
    sym = str(symbol or "").strip().upper()

    def _del(conn: Any) -> int:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM nse_catalyst_rag WHERE symbol = %s;", (sym,))
            deleted = int(cur.rowcount)
        conn.commit()
        return deleted

    return int(execute_with_retry(_del))


if __name__ == "__main__":
    print("=" * 72)
    print("🧠 Q-ARC E15 HISTORICAL REGIME VECTOR MEMORY INGESTION")
    print("=" * 72)
    panel = build_historical_panel(force_rebuild=True)
    known_labels = int(panel["fwd_5d_ret_pct"].notna().sum())
    print(f"Built causal panel: {len(panel):,} rows ({panel['symbol'].nunique()} tickers), {known_labels:,} with fwd_5d_ret_pct.")
    stats = upsert_panel_to_neon(panel_df=panel, batch_size=1000)
    print(f"Neon Postgres upsert: before={stats['rows_before']:,}, upserted={stats['rows_upserted']:,}, after={stats['rows_after']:,}")
    print("=" * 72)
