"""
Q-ARC Enterprise Neon Postgres Persistence Layer
================================================
Neon Lakebase Postgres + pgvector persistence using psycopg2.pool.SimpleConnectionPool.
Requires DATABASE_URL (or TEST_DATABASE_URL for test isolation) in environment / .env.
"""
import os
import threading
import datetime as dt
from contextlib import contextmanager
from typing import Any, Callable, Dict, Iterator, List, Optional

import psycopg2
from dotenv import load_dotenv
from psycopg2 import InterfaceError, OperationalError
from psycopg2.extras import Json, RealDictCursor
from psycopg2.pool import SimpleConnectionPool

BASE_DIR = os.path.dirname(__file__)

_POOL_LOCK = threading.Lock()
_POOL: Optional[SimpleConnectionPool] = None
_POOL_DSN: Optional[str] = None


def _resolve_dsn() -> str:
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path, override=False)
    dsn = (os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL not set - add your Neon pooled connection string to .env")
    if "sslmode=" not in dsn:
        sep = "&" if "?" in dsn else "?"
        dsn = f"{dsn}{sep}sslmode=require"
    return dsn


def reset_pool() -> None:
    global _POOL, _POOL_DSN
    with _POOL_LOCK:
        if _POOL is not None:
            try:
                _POOL.closeall()
            except Exception:
                pass
            _POOL = None
            _POOL_DSN = None


def _get_pool() -> SimpleConnectionPool:
    global _POOL, _POOL_DSN
    dsn = _resolve_dsn()
    with _POOL_LOCK:
        if _POOL is None or _POOL_DSN != dsn:
            if _POOL is not None:
                try:
                    _POOL.closeall()
                except Exception:
                    pass
            _POOL = SimpleConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=dsn,
                connect_timeout=5,
            )
            _POOL_DSN = dsn
        return _POOL


def execute_with_retry(fn: Callable[[Any], Any]) -> Any:
    """
    Executes a DB callback using a pooled connection, retrying once if Neon
    closes or drops an idle serverless connection (scale-to-zero wake-up).
    """
    for attempt in range(2):
        pool = _get_pool()
        conn = pool.getconn()
        try:
            if conn.closed:
                raise InterfaceError("Pooled connection is closed")
            result = fn(conn)
            conn.commit()
            pool.putconn(conn)
            return result
        except (OperationalError, InterfaceError):
            try:
                pool.putconn(conn, close=True)
            except Exception:
                pass
            reset_pool()
            if attempt == 0:
                continue
            raise
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                pool.putconn(conn)
            except Exception:
                pass
            raise


@contextmanager
def get_connection() -> Iterator[Any]:
    """Context-managed Neon connection from the pool for direct queries/upserts."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        if conn.closed:
            pool.putconn(conn, close=True)
            reset_pool()
            pool = _get_pool()
            conn = pool.getconn()
        yield conn
        conn.commit()
        pool.putconn(conn)
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        try:
            pool.putconn(conn, close=isinstance(conn, object) and bool(getattr(conn, "closed", 0)))
        except Exception:
            pass
        raise


def init_db() -> None:
    """Creates pgvector extension, core tables, and B-tree / HNSW indexes in Neon Postgres."""
    def _ddl(conn: Any) -> None:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS trade_executions (
                    id BIGSERIAL PRIMARY KEY,
                    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ticker TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    action TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    limit_price DOUBLE PRECISION NOT NULL,
                    live_ltp DOUBLE PRECISION NOT NULL,
                    notional_inr DOUBLE PRECISION NOT NULL,
                    status TEXT NOT NULL,
                    broker_order_id TEXT,
                    hmm_state TEXT,
                    verdict TEXT
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS guardrail_interventions (
                    id BIGSERIAL PRIMARY KEY,
                    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ticker TEXT NOT NULL,
                    raw_contradictions INTEGER NOT NULL,
                    post_contradictions INTEGER NOT NULL,
                    coverage_pct DOUBLE PRECISION NOT NULL,
                    e09_live_active INTEGER NOT NULL,
                    status TEXT NOT NULL
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS generated_portfolios (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    capital_inr DOUBLE PRECISION NOT NULL,
                    risk_profile TEXT NOT NULL,
                    cash_sweep_inr DOUBLE PRECISION NOT NULL,
                    expected_5d_return_pct DOUBLE PRECISION NOT NULL,
                    portfolio_cvar95_pct DOUBLE PRECISION NOT NULL,
                    allocations JSONB NOT NULL
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS market_regime_vectors (
                    id BIGSERIAL PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    bar_date DATE NOT NULL,
                    hmm_state TEXT,
                    fwd_5d_ret_pct DOUBLE PRECISION,
                    state_vector VECTOR(8) NOT NULL,
                    UNIQUE(symbol, bar_date)
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS nse_catalyst_rag (
                    id BIGSERIAL PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    filing_date DATE NOT NULL,
                    headline TEXT NOT NULL,
                    category TEXT,
                    source TEXT,
                    embedding VECTOR(768) NOT NULL,
                    UNIQUE(symbol, filing_date, headline)
                );
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_trade_executions_ticker_executed_at
                ON trade_executions (ticker, executed_at DESC);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_market_regime_vectors_hnsw
                ON market_regime_vectors USING hnsw (state_vector vector_cosine_ops);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_nse_catalyst_rag_hnsw
                ON nse_catalyst_rag USING hnsw (embedding vector_cosine_ops);
            """)

    execute_with_retry(_ddl)


def log_trade_execution(record: Dict[str, Any]) -> int:
    init_db()
    executed_at = record.get("executed_at") or dt.datetime.now(dt.timezone.utc).isoformat()
    values = (
        executed_at,
        str(record.get("ticker", "")),
        str(record.get("mode", "PAPER")),
        str(record.get("action", "BUY")),
        int(record.get("quantity", 0)),
        float(record.get("limit_price", 0.0)),
        float(record.get("live_ltp", 0.0)),
        float(record.get("notional_inr", 0.0)),
        str(record.get("status", "")),
        str(record.get("broker_order_id", "")),
        str(record.get("hmm_state", "")),
        str(record.get("verdict", "")),
    )

    def _insert(conn: Any) -> int:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trade_executions (
                    executed_at, ticker, mode, action, quantity,
                    limit_price, live_ltp, notional_inr, status,
                    broker_order_id, hmm_state, verdict
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                values,
            )
            return int(cur.fetchone()[0])

    return int(execute_with_retry(_insert))


def log_guardrail_intervention(record: Dict[str, Any]) -> int:
    init_db()
    logged_at = record.get("logged_at") or dt.datetime.now(dt.timezone.utc).isoformat()
    values = (
        logged_at,
        str(record.get("ticker", "")),
        int(record.get("raw_contradictions", 0)),
        int(record.get("post_contradictions", 0)),
        float(record.get("coverage_pct", 0.0)),
        1 if record.get("e09_live_active") else 0,
        str(record.get("status", "")),
    )

    def _insert(conn: Any) -> int:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guardrail_interventions (
                    logged_at, ticker, raw_contradictions, post_contradictions,
                    coverage_pct, e09_live_active, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                values,
            )
            return int(cur.fetchone()[0])

    return int(execute_with_retry(_insert))


def get_recent_trades(limit: int = 20) -> List[Dict[str, Any]]:
    init_db()

    def _query(conn: Any) -> List[Dict[str, Any]]:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, executed_at::text AS executed_at, ticker, mode, action, quantity,
                       limit_price, live_ltp, notional_inr, status, broker_order_id, hmm_state, verdict
                FROM trade_executions
                ORDER BY id DESC
                LIMIT %s;
                """,
                (int(limit),),
            )
            return [dict(r) for r in cur.fetchall()]

    return execute_with_retry(_query)


def log_generated_portfolio(record: Dict[str, Any]) -> int:
    init_db()
    created_at = record.get("created_at") or dt.datetime.now(dt.timezone.utc).isoformat()
    values = (
        created_at,
        float(record.get("capital_inr", 0.0)),
        str(record.get("risk_profile", "BALANCED_CORE")),
        float(record.get("cash_sweep_inr", 0.0)),
        float(record.get("expected_5d_return_pct", 0.0)),
        float(record.get("portfolio_cvar95_pct", 0.0)),
        Json(record.get("allocations", [])),
    )

    def _insert(conn: Any) -> int:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO generated_portfolios (
                    created_at, capital_inr, risk_profile, cash_sweep_inr,
                    expected_5d_return_pct, portfolio_cvar95_pct, allocations
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                values,
            )
            return int(cur.fetchone()[0])

    return int(execute_with_retry(_insert))


def get_recent_portfolios(limit: int = 20) -> List[Dict[str, Any]]:
    init_db()

    def _query(conn: Any) -> List[Dict[str, Any]]:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, created_at::text AS created_at, capital_inr, risk_profile,
                       cash_sweep_inr, expected_5d_return_pct, portfolio_cvar95_pct, allocations
                FROM generated_portfolios
                ORDER BY id DESC
                LIMIT %s;
                """,
                (int(limit),),
            )
            return [dict(r) for r in cur.fetchall()]

    return execute_with_retry(_query)


def delete_trade_execution(row_id: int) -> None:
    """Deletes a trade execution record by id (used for test row cleanup)."""
    init_db()

    def _delete(conn: Any) -> None:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM trade_executions WHERE id = %s;", (int(row_id),))

    execute_with_retry(_delete)


def delete_generated_portfolio(row_id: int) -> None:
    """Deletes a generated portfolio record by id (used for test row cleanup)."""
    init_db()

    def _delete(conn: Any) -> None:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM generated_portfolios WHERE id = %s;", (int(row_id),))

    execute_with_retry(_delete)
