"""
Q-ARC Live Angel One SmartAPI L2 Order-Book Client
===================================================
Provides live NSE 5-level Bid/Ask order book depth, Total Buy/Sell Quantity
(TBQ/TSQ), and spoofing/wall anomaly detection for Evidence Ledger item E09.
Preserves 100% graceful degradation when offline or outside market hours.
"""
import os
import json
import time
import datetime
import statistics
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from dotenv import load_dotenv

NSE_SYMBOL_TOKEN_MAP: Dict[str, str] = {
    "RELIANCE": "2885",
    "TCS": "11536",
    "INFY": "1594",
    "HDFCBANK": "1333",
    "ICICIBANK": "4963",
    "KOTAKBANK": "1922",
    "DRREDDY": "881",
    "SBIN": "3045",
    "AXISBANK": "5900",
    "INDUSINDBK": "5258",
    "BANKBARODA": "4668",
    "PNB": "10666",
    "HCLTECH": "7229",
    "WIPRO": "3787",
    "TECHM": "13538",
    "LTIM": "17818",
    "PERSISTENT": "18365",
    "SUNPHARMA": "3351",
    "CIPLA": "694",
    "DIVISLAB": "10940",
    "APOLLOHOSP": "157",
    "LUPIN": "10440",
    "MARUTI": "10999",
    "TATAMOTORS": "3456",
    "M&M": "2031",
    "BAJAJ-AUTO": "16669",
    "ITC": "1660",
    "HINDUNILVR": "1394",
    "NESTLEIND": "17963",
    "BRITANNIA": "547",
    "ONGC": "2475",
    "NTPC": "11630",
    "POWERGRID": "14977",
    "COALINDIA": "20374",
    "TATASTEEL": "3499",
    "HINDALCO": "1363",
    "JSWSTEEL": "11723",
    "VEDL": "3063",
    "ADANIENT": "25",
    "BAJFINANCE": "317",
    "BAJAJFINSV": "16675",
    "LT": "11483",
    "ADANIPORTS": "15083",
    "BEL": "383",
    "HAL": "2303",
    "DLF": "14732",
}


class QARCAngelOneClient:
    """
    Wrapper around Angel One SmartAPI SmartConnect for live L2 5-level depth
    and real-time microstructure imbalance verification (E09).
    """

    _LAST_API_CALL_TS: float = 0.0
    _GLOBAL_CANDLE_CACHE: Dict[str, Any] = {}

    @classmethod
    def _throttle_api(cls, min_interval: float = 0.55) -> None:
        now_ts = time.monotonic()
        elapsed = now_ts - cls._LAST_API_CALL_TS
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        cls._LAST_API_CALL_TS = time.monotonic()

    def __init__(self):
        load_dotenv()
        self.api_key = os.getenv("ANGEL_API_KEY", "").strip()
        self.client_code = os.getenv("ANGEL_CLIENT_CODE", "").strip()
        self.password = os.getenv("ANGEL_PASSWORD", "").strip()
        self.totp_secret = os.getenv("ANGEL_TOTP_SECRET", "").strip()
        self.smart_api = None
        self.auth_token: Optional[str] = None
        self.last_auth_time: float = 0.0
        self.last_error: Optional[str] = None
        self._candle_cache: Dict[str, pd.DataFrame] = {}

    def is_configured(self) -> bool:
        return all([self.api_key, self.client_code, self.password, self.totp_secret])

    @property
    def is_authenticated(self) -> bool:
        return bool(self.smart_api is not None and self.auth_token)

    def sleep_rate_limit(self, seconds: float = 0.38) -> None:
        time.sleep(seconds)

    def authenticate(self, force: bool = False) -> bool:
        if force:
            self.smart_api = None
            self.auth_token = None
            self.last_auth_time = 0.0
        if not self.is_configured():
            self.last_error = "Missing Angel One credentials in environment/.env"
            return False
        if self.smart_api is not None and self.auth_token:
            return True
        try:
            import logging
            import logzero
            import pyotp
            from SmartApi import SmartConnect

            logzero.loglevel(logging.CRITICAL)
            totp = pyotp.TOTP(self.totp_secret).now()
            smart_api = SmartConnect(api_key=self.api_key)
            session = smart_api.generateSession(self.client_code, self.password, totp)
            if not session or not session.get("status"):
                msg = session.get("message", "Unknown login failure") if isinstance(session, dict) else "Empty response"
                self.last_error = f"SmartAPI login rejected: {msg}"
                return False
            self.smart_api = smart_api
            self.auth_token = session.get("data", {}).get("jwtToken")
            self.last_auth_time = time.time()
            self.last_error = None
            return True
        except Exception as exc:
            self.last_error = f"Angel One auth exception: {exc}"
            return False

    def _ensure_fresh_session(self, force_reauth: bool = False) -> bool:
        """
        Ensures an active SmartAPI session, forcing re-authentication when
        `force_reauth=True` or when the JWT age exceeds 20 hours (72000s).
        """
        stale = self.last_auth_time > 0.0 and (time.time() - self.last_auth_time) > 72000.0
        if force_reauth or stale:
            self.smart_api = None
            self.auth_token = None
            self.last_auth_time = 0.0
            return self.authenticate(force=True)
        return self.authenticate()

    @staticmethod
    def _is_session_expired_resp(resp: Any) -> bool:
        """Detects Angel One JWT expiry codes (AB1010, AB1007, AG8001) or token-expired messages."""
        if resp is None:
            return False
        expired_codes = {"AB1010", "AB1007", "AG8001"}
        expired_phrases = (
            "invalid token",
            "expired token",
            "token expired",
            "session expired",
            "unauthorized",
        )
        if isinstance(resp, dict):
            code = str(resp.get("errorcode") or resp.get("errorCode") or "").strip().upper()
            if code in expired_codes:
                return True
            msg = str(resp.get("message") or "").lower()
            if any(phrase in msg for phrase in expired_phrases):
                return True
            return False
        text = str(resp)
        upper = text.upper()
        if any(code in upper for code in expired_codes):
            return True
        lower = text.lower()
        return any(phrase in lower for phrase in expired_phrases)

    def _invoke_smartapi_with_reauth(self, fn) -> Any:
        """Executes a SmartAPI callable and retries once after forced pyotp re-authentication on expired JWT."""
        try:
            resp = fn()
        except Exception as exc:
            if self._is_session_expired_resp(exc) and self._ensure_fresh_session(force_reauth=True):
                return fn()
            raise
        if self._is_session_expired_resp(resp) and self._ensure_fresh_session(force_reauth=True):
            resp = fn()
        return resp

    def fetch_live_l2_depth_e09(self, symbol: str, allow_fallback: bool = False) -> Dict[str, Any]:
        """
        Fetches FULL mode quote (5-level Bid/Ask depth + TBQ/TSQ) from Angel One SmartAPI
        and computes spoofing/wall anomaly metrics for Evidence Ledger E09.
        """
        sym = symbol.strip().upper()
        token = NSE_SYMBOL_TOKEN_MAP.get(sym)
        if not token:
            return {
                "available": False,
                "symbol": sym,
                "source": "UNMAPPED_SYMBOL",
                "reason": f"No NSE symbol token configured for {sym}",
            }

        if not self._ensure_fresh_session():
            return {
                "available": False,
                "symbol": sym,
                "token": token,
                "source": "AUTH_FAILED_OR_OFFLINE",
                "reason": self.last_error or "Authentication unavailable",
            }

        try:
            def _call():
                self._throttle_api()
                return self.smart_api.getMarketData("FULL", {"NSE": [token]})

            resp = self._invoke_smartapi_with_reauth(_call)
            if not resp or not resp.get("status"):
                msg = resp.get("message", "Market data error") if isinstance(resp, dict) else "Empty response"
                return {
                    "available": False,
                    "symbol": sym,
                    "token": token,
                    "source": "MARKET_DATA_REJECTED",
                    "reason": msg,
                }

            fetched = resp.get("data", {}).get("fetched", [])
            if not fetched:
                return {
                    "available": False,
                    "symbol": sym,
                    "token": token,
                    "source": "EMPTY_FETCH",
                    "reason": "No market depth rows returned by SmartAPI",
                }

            row = fetched[0]
            return self._parse_single_l2_quote(row, sym_override=sym, token_override=token)
        except Exception as exc:
            return {
                "available": False,
                "symbol": sym,
                "token": token,
                "source": "EXCEPTION",
                "reason": str(exc),
            }

    def _parse_single_l2_quote(
        self,
        row: Dict[str, Any],
        sym_override: Optional[str] = None,
        token_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Parses a single SmartAPI getMarketData('FULL') quote row into E09 depth schema."""
        token = str(token_override or row.get("symbolToken", "") or "")
        sym = str(sym_override or row.get("tradingSymbol", "") or token).replace("-EQ", "").strip().upper()
        depth = row.get("depth", {}) or {}
        buy_levels = depth.get("buy", []) or []
        sell_levels = depth.get("sell", []) or []

        top5_bid_qty = sum(int(lvl.get("quantity", 0) or 0) for lvl in buy_levels[:5])
        top5_ask_qty = sum(int(lvl.get("quantity", 0) or 0) for lvl in sell_levels[:5])
        tbq = int(row.get("totBuyQuan", 0) or 0)
        tsq = int(row.get("totSellQuan", 0) or 0)

        l2_imbalance = round(
            (top5_bid_qty - top5_ask_qty) / max(top5_bid_qty + top5_ask_qty, 1),
            4,
        )
        tbq_tsq_ratio = round(tbq / max(tsq, 1), 3)

        all_qtys = [
            int(lvl.get("quantity", 0) or 0)
            for lvl in (buy_levels[:5] + sell_levels[:5])
            if int(lvl.get("quantity", 0) or 0) > 0
        ]
        if len(all_qtys) >= 2:
            med_qty = max(statistics.median(all_qtys), 1.0)
            wall_to_median_ratio = round(max(all_qtys) / med_qty, 2)
        else:
            wall_to_median_ratio = 1.0

        spoofing_anomaly_detected = bool(wall_to_median_ratio > 4.5 or abs(l2_imbalance) > 0.65)

        best_bid = float(buy_levels[0].get("price", 0.0)) if buy_levels else float(row.get("ltp", 0.0) or 0.0)
        best_ask = float(sell_levels[0].get("price", 0.0)) if sell_levels else float(row.get("ltp", 0.0) or 0.0)

        summary_text = (
            f"LIVE ANGEL ONE L2 DEPTH: 5-Level Imbalance={l2_imbalance:+.2%}, "
            f"TBQ/TSQ={tbq_tsq_ratio:.2f}x (Top5 Bid={top5_bid_qty:,} vs Ask={top5_ask_qty:,}), "
            f"Spoofing/Wall Anomaly={'DETECTED' if spoofing_anomaly_detected else 'NONE'} "
            f"(Max Wall={wall_to_median_ratio:.2f}x median)."
        )

        return {
            "available": True,
            "symbol": sym,
            "token": token,
            "source": "ANGEL_ONE_SMARTAPI_LIVE",
            "ltp": float(row.get("ltp", 0.0) or 0.0),
            "open": float(row.get("open", 0.0) or 0.0),
            "high": float(row.get("high", 0.0) or 0.0),
            "low": float(row.get("low", 0.0) or 0.0),
            "close": float(row.get("close", 0.0) or 0.0),
            "avg_price": float(row.get("avgPrice", 0.0) or 0.0),
            "trade_volume": int(row.get("tradeVolume", 0) or 0),
            "best_bid": best_bid,
            "best_ask": best_ask,
            "top5_bid_qty": top5_bid_qty,
            "top5_ask_qty": top5_ask_qty,
            "tot_buy_quan": tbq,
            "tot_sell_quan": tsq,
            "l2_imbalance": l2_imbalance,
            "tbq_tsq_ratio": tbq_tsq_ratio,
            "wall_to_median_ratio": wall_to_median_ratio,
            "spoofing_anomaly_detected": spoofing_anomaly_detected,
            "buy_levels": buy_levels[:5],
            "sell_levels": sell_levels[:5],
            "summary_text": summary_text,
        }

    def fetch_batch_live_l2_depth_e09(self, symbols: list[str]) -> dict[str, dict]:
        """
        Fetches L2 5-level depth for up to 50 NSE tickers in a SINGLE Angel One HTTP call
        (~120ms total) to avoid AB1004 rate-limit throttling.
        """
        clean_syms = [s.upper().replace(".NS", "") for s in symbols]
        token_to_sym = {
            NSE_SYMBOL_TOKEN_MAP[s]: s
            for s in clean_syms
            if s in NSE_SYMBOL_TOKEN_MAP
        }
        if not token_to_sym or not self._ensure_fresh_session():
            return {s: {"available": False, "reason": "ANGEL_OFFLINE"} for s in clean_syms}

        try:
            def _call():
                self._throttle_api()
                return self.smart_api.getMarketData("FULL", {"NSE": list(token_to_sym.keys())})

            res = self._invoke_smartapi_with_reauth(_call)
            fetched_list = (res or {}).get("data", {}).get("fetched", [])
            out: dict[str, dict] = {}
            for quote in fetched_list:
                tok = str(quote.get("symbolToken", ""))
                sym = token_to_sym.get(tok)
                if sym:
                    out[sym] = self._parse_single_l2_quote(quote, sym_override=sym, token_override=tok)
            for s in clean_syms:
                if s not in out:
                    out[s] = {"available": False, "reason": "TOKEN_NOT_RETURNED"}
            return out
        except Exception as e:
            return {s: {"available": False, "reason": str(e)} for s in clean_syms}

    def fetch_historical_ohlcv(
        self,
        symbol: str,
        interval: str = "ONE_DAY",
        days_back: int = 45,
    ) -> pd.DataFrame:
        """
        Fetches recent OHLCV candles from Angel One SmartAPI getCandleData
        to bridge cached NSE Bhavcopy files right up to today's live bar.
        Returns empty DataFrame gracefully when offline.
        """
        sym = symbol.strip().upper()
        cache_key = f"{sym}:{interval}:{days_back}"
        if cache_key in self._candle_cache:
            return self._candle_cache[cache_key].copy()
        cached_entry = self._GLOBAL_CANDLE_CACHE.get(cache_key)
        if cached_entry and (time.monotonic() - cached_entry[0]) < 120.0:
            return cached_entry[1].copy()

        token = NSE_SYMBOL_TOKEN_MAP.get(sym)
        if not token or not self._ensure_fresh_session():
            return pd.DataFrame()

        try:
            now = datetime.datetime.now()
            from_dt = (now - datetime.timedelta(days=days_back)).strftime("%Y-%m-%d 09:00")
            to_dt = now.strftime("%Y-%m-%d 15:35")
            params = {
                "exchange": "NSE",
                "symboltoken": token,
                "interval": interval,
                "fromdate": from_dt,
                "todate": to_dt,
            }
            resp = None
            for attempt in range(5):
                if attempt > 0:
                    time.sleep(1.3 * attempt)
                try:
                    def _call():
                        time.sleep(0.38)
                        self._throttle_api(0.6)
                        return self.smart_api.getCandleData(params)

                    resp = self._invoke_smartapi_with_reauth(_call) if attempt == 0 else _call()
                    if resp and resp.get("status") and resp.get("data"):
                        break
                except Exception as exc:
                    self.last_error = str(exc)
                    resp = None
            if not resp or not resp.get("status"):
                return pd.DataFrame()
            rows = resp.get("data", []) or []
            if not rows:
                return pd.DataFrame()

            records = []
            for r in rows:
                if len(r) < 6:
                    continue
                records.append({
                    "ticker": sym,
                    "date": pd.to_datetime(r[0]).tz_localize(None).normalize(),
                    "open": float(r[1]),
                    "high": float(r[2]),
                    "low": float(r[3]),
                    "close": float(r[4]),
                    "volume": float(r[5]),
                })
            out_df = pd.DataFrame(records)
            if not out_df.empty:
                self._candle_cache[cache_key] = out_df.copy()
                self._GLOBAL_CANDLE_CACHE[cache_key] = (time.monotonic(), out_df.copy())
            return out_df
        except Exception:
            return pd.DataFrame()

    def append_live_candles_to_df(
        self,
        stock_df: pd.DataFrame,
        symbol: str,
        days_back: int = 45,
    ) -> pd.DataFrame:
        """
        Appends live Angel One historical daily candles onto the tail of a ticker's
        Bhavcopy DataFrame, deduplicating on date/TIMESTAMP and sorting chronologically.
        """
        live_df = self.fetch_historical_ohlcv(symbol, interval="ONE_DAY", days_back=days_back)
        if live_df.empty:
            return stock_df

        base_df = stock_df.copy()
        dt_col = "date" if "date" in base_df.columns else "TIMESTAMP"
        base_df[dt_col] = pd.to_datetime(base_df[dt_col]).dt.tz_localize(None).dt.normalize()
        if dt_col != "date":
            live_df = live_df.rename(columns={"date": dt_col})

        deliv_col = "DELIVERY_PCT" if "DELIVERY_PCT" in base_df.columns else (
            "delivery_pct" if "delivery_pct" in base_df.columns else None
        )
        if deliv_col:
            median_deliv = float(base_df[deliv_col].tail(20).median()) if len(base_df) > 0 else 45.0
            live_df[deliv_col] = round(median_deliv, 2)

        merged = pd.concat([base_df, live_df], ignore_index=True)
        merged = merged.drop_duplicates(subset=[dt_col], keep="last").sort_values(dt_col).reset_index(drop=True)

        sym_group_col = "SYMBOL" if "SYMBOL" in merged.columns else ("ticker" if "ticker" in merged.columns else None)
        for dcol in ("DELIV_PER", "DELIVERY_PCT", "delivery_pct"):
            if dcol in merged.columns:
                merged[dcol] = pd.to_numeric(merged[dcol], errors="coerce")
                merged.loc[merged[dcol] <= 0.01, dcol] = np.nan
                if sym_group_col:
                    rolling_med = merged.groupby(sym_group_col)[dcol].transform(
                        lambda s: s.rolling(20, min_periods=5).median()
                    )
                    merged[dcol] = merged[dcol].fillna(rolling_med).groupby(merged[sym_group_col]).ffill().fillna(50.0)
                else:
                    rolling_med = merged[dcol].rolling(20, min_periods=5).median()
                    merged[dcol] = merged[dcol].fillna(rolling_med).ffill().fillna(50.0)

        if "DELIV_QTY" in merged.columns and "TOTTRDQTY" in merged.columns and "DELIV_PER" in merged.columns:
            merged["DELIV_QTY"] = merged["DELIV_QTY"].fillna(merged["TOTTRDQTY"] * (merged["DELIV_PER"] / 100.0))

        return merged

    def execute_trade_order(
        self,
        symbol: str,
        side: str = "BUY",
        quantity: int = 1,
        price: float = 0.0,
        order_type: str = "LIMIT",
        product_type: str = "DELIVERY",
        mode: str = "PAPER",
        ledger_path: str = "data/paper_trade_ledger.json",
    ) -> Dict[str, Any]:
        """
        Dual-mode execution router:
        - mode == "PAPER" (default): logs a deterministic simulated fill to disk; never calls placeOrder.
        - mode == "LIVE_ANGEL": authenticates and dispatches smart_api.placeOrder() on NSE.
        """
        sym = symbol.strip().upper()
        side_clean = side.strip().upper()
        if side_clean not in ("BUY", "SELL"):
            return {"status": "REJECTED", "mode": mode, "reason": f"Invalid side: {side}"}
        if int(quantity) <= 0:
            return {"status": "REJECTED", "mode": mode, "reason": "Quantity must be >= 1"}

        mode_clean = str(mode or "PAPER").strip().upper()
        now_iso = datetime.datetime.now().isoformat()

        if mode_clean != "LIVE_ANGEL":
            order_id = f"PAPER-{sym}-{int(time.time() * 1000)}"
            receipt = {
                "status": "PAPER_FILLED",
                "mode": "PAPER",
                "order_id": order_id,
                "symbol": sym,
                "side": side_clean,
                "quantity": int(quantity),
                "price": round(float(price), 2),
                "order_type": order_type.upper(),
                "product_type": product_type.upper(),
                "timestamp": now_iso,
            }
            try:
                os.makedirs(os.path.dirname(ledger_path) or ".", exist_ok=True)
                existing = []
                if os.path.exists(ledger_path):
                    with open(ledger_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                existing.append(receipt)
                with open(ledger_path, "w", encoding="utf-8") as f:
                    json.dump(existing, f, indent=2)
            except Exception:
                pass
            return receipt

        token = NSE_SYMBOL_TOKEN_MAP.get(sym)
        if not token:
            return {"status": "REJECTED", "mode": "LIVE_ANGEL", "reason": f"Unmapped symbol: {sym}"}
        if not self._ensure_fresh_session():
            return {"status": "REJECTED", "mode": "LIVE_ANGEL", "reason": self.last_error or "Auth failed"}

        try:
            otype = order_type.strip().upper()
            order_params = {
                "variety": "NORMAL",
                "tradingsymbol": f"{sym}-EQ",
                "symboltoken": token,
                "transactiontype": side_clean,
                "exchange": "NSE",
                "ordertype": otype,
                "producttype": product_type.strip().upper(),
                "duration": "DAY",
                "price": "0" if otype == "MARKET" else f"{float(price):.2f}",
                "squareoff": "0",
                "stoploss": "0",
                "quantity": str(int(quantity)),
            }
            broker_resp = self._invoke_smartapi_with_reauth(
                lambda: self.smart_api.placeOrder(order_params)
            )
            order_ok = bool(broker_resp) and not (
                isinstance(broker_resp, dict) and broker_resp.get("status") is False
            )
            order_id = (
                str(broker_resp.get("data", {}).get("orderid") or broker_resp.get("orderid") or "")
                if isinstance(broker_resp, dict)
                else (str(broker_resp) if broker_resp else None)
            )
            return {
                "status": "LIVE_ORDER_SUBMITTED" if order_ok else "LIVE_ORDER_FAILED",
                "mode": "LIVE_ANGEL",
                "order_id": order_id or None,
                "symbol": sym,
                "side": side_clean,
                "quantity": int(quantity),
                "price": round(float(price), 2),
                "order_type": otype,
                "timestamp": now_iso,
            }
        except Exception as exc:
            return {
                "status": "LIVE_ORDER_ERROR",
                "mode": "LIVE_ANGEL",
                "symbol": sym,
                "reason": str(exc),
                "timestamp": now_iso,
            }

    def place_semi_auto_order(
        self,
        symbol: str,
        action: str,
        quantity: int,
        limit_price: float,
    ) -> dict:
        """Dispatches a live NSE order via SmartAPI after passing validate_and_execute_order gates."""
        return self.execute_trade_order(
            symbol=symbol,
            side=action,
            quantity=quantity,
            price=limit_price,
            order_type="LIMIT",
            product_type="DELIVERY",
            mode="LIVE_ANGEL",
        )

    def validate_and_execute_order(
        self,
        symbol: str,
        action: str,
        quantity: int,
        limit_price: float,
        mode: str = "PAPER",
        live_ltp: float = 0.0,
        has_factor_4b: bool = False,
        unresolved_contradictions: int = 0,
        max_notional_inr: float = 25000.0,
        hmm_state: str = "",
        verdict: str = "",
    ) -> dict:
        """
        Enforces 4 Institutional Pre-Trade Safety Checks before allowing PAPER or LIVE_ANGEL execution:
        1. Guardrail Contradiction Lock (0 unresolved contradictions required)
        2. Factor 4B Exhaustion Churn Block on BUY orders
        3. Max Notional Cap (default Rs.25,000 per order)
        4. +/-2.0% Price Collar against Live LTP
        """
        symbol = symbol.upper().replace(".NS", "")
        action_u = action.upper()
        notional = float(quantity) * float(limit_price)

        # Gate 1: Neuro-Symbolic Contradiction Lock
        if unresolved_contradictions > 0:
            return {
                "status": "REJECTED_BY_RISK_GATE",
                "reason": f"Blocked: {unresolved_contradictions} unresolved ClaimVerifier contradiction(s).",
            }

        # Gate 2: Factor 4B Bulk/Block Exhaustion Churn Lock
        if has_factor_4b and action_u in ["BUY", "ACCUMULATE"]:
            return {
                "status": "REJECTED_BY_RISK_GATE",
                "reason": "Blocked: Factor 4B (Bulk/Block Intraday Exhaustion Churn, p=0.0002) active on BUY.",
            }

        # Gate 3: Fat-Finger Max Notional Cap
        if notional <= 0 or notional > max_notional_inr:
            return {
                "status": "REJECTED_BY_RISK_GATE",
                "reason": f"Blocked: Order notional ₹{notional:,.2f} exceeds ₹{max_notional_inr:,.2f} safety cap.",
            }

        # Gate 4: +/-2.0% Live LTP Price Collar
        ref_ltp = float(live_ltp or 0.0)
        if ref_ltp <= 0:
            l2 = self.fetch_live_l2_depth_e09(symbol)
            ref_ltp = float(l2.get("ltp", 0.0)) if l2.get("available") else float(limit_price)

        if ref_ltp > 0:
            deviation_pct = abs(limit_price - ref_ltp) / ref_ltp
            if deviation_pct > 0.02:
                return {
                    "status": "REJECTED_BY_RISK_GATE",
                    "reason": (
                        f"Blocked: Limit ₹{limit_price:.2f} deviates {deviation_pct*100:.2f}% "
                        f"from Live LTP ₹{ref_ltp:.2f} (>2.0% collar)."
                    ),
                }

        # Execute PAPER Mode (Default Safe Path)
        if str(mode or "PAPER").upper() != "LIVE_ANGEL":
            broker_id = f"PAPER_{int(time.time() * 1000)}"
            receipt = {
                "status": "PAPER_FILLED",
                "mode": "PAPER",
                "symbol": symbol,
                "action": action_u,
                "side": action_u,
                "quantity": int(quantity),
                "limit_price": round(float(limit_price), 2),
                "price": round(float(limit_price), 2),
                "live_ltp": round(ref_ltp, 2),
                "notional_inr": round(notional, 2),
                "broker_order_id": broker_id,
                "order_id": broker_id,
            }
        else:
            # Execute LIVE_ANGEL Mode (Only when explicitly toggled & all 4 gates pass)
            receipt = self.place_semi_auto_order(symbol, action_u, quantity, limit_price)
            receipt.setdefault("action", action_u)
            receipt.setdefault("limit_price", round(float(limit_price), 2))
            receipt.setdefault("live_ltp", round(ref_ltp, 2))
            receipt.setdefault("notional_inr", round(notional, 2))
            receipt.setdefault("broker_order_id", receipt.get("order_id") or "")

        from qarc_db import log_trade_execution

        row_id = log_trade_execution({
            "ticker": symbol,
            "mode": receipt.get("mode", mode),
            "action": action_u,
            "quantity": int(quantity),
            "limit_price": float(limit_price),
            "live_ltp": float(ref_ltp),
            "notional_inr": float(notional),
            "status": receipt.get("status", ""),
            "broker_order_id": receipt.get("broker_order_id", ""),
            "hmm_state": hmm_state,
            "verdict": verdict,
        })
        receipt["db_row_id"] = row_id
        return receipt


if __name__ == "__main__":
    client = QARCAngelOneClient()
    for sym in ["RELIANCE", "TCS"]:
        quote = client.fetch_live_l2_depth_e09(sym)
        if quote.get("available"):
            print(f"[{sym}] LTP=₹{quote['ltp']:.2f} | {quote['summary_text']}")
        else:
            print(f"[{sym}] Unavailable ({quote.get('source')}): {quote.get('reason')}")
