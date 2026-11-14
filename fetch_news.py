import os
import urllib.parse
from email.utils import parsedate_to_datetime
import feedparser
import requests
from datetime import datetime, timedelta
from typing import Any, Dict, List

_HEADLINES_CACHE = {}

def fetch_headlines(ticker, target_date):
    """
    Fetches top 1-2 headlines for a ticker within +/- 1 day of the target date 
    using Google News RSS with a fast timeout and in-memory cache.
    Returns empty string if none found.
    """
    try:
        date_str = str(target_date)[:10]
        cache_key = (ticker, date_str)
        if cache_key in _HEADLINES_CACHE:
            return _HEADLINES_CACHE[cache_key]

        start_date = (target_date - timedelta(days=1)).strftime('%Y-%m-%d')
        end_date = (target_date + timedelta(days=2)).strftime('%Y-%m-%d')
        
        query = f"{ticker} NSE stock"
        encoded_query = urllib.parse.quote(query)
        
        url = f"https://news.google.com/rss/search?q={encoded_query}+after:{start_date}+before:{end_date}&hl=en-IN&gl=IN&ceid=IN:en"
        
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=1.5)
        headlines_str = ""
        if resp.status_code == 200:
            feed = feedparser.parse(resp.content)
            if feed.entries:
                headlines = [entry.title for entry in feed.entries[:2]]
                headlines_str = " | ".join(headlines)
        
        _HEADLINES_CACHE[cache_key] = headlines_str
        return headlines_str
    except Exception:
        return ""


def _parse_published_iso(entry: Any) -> str:
    """Normalizes a feedparser entry's publication date into YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DD."""
    parsed_tuple = getattr(entry, "published_parsed", None) or (
        entry.get("published_parsed") if isinstance(entry, dict) else None
    )
    if parsed_tuple:
        try:
            return datetime(*parsed_tuple[:6]).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass
    raw_pub = (
        getattr(entry, "published", None)
        or (entry.get("published") if isinstance(entry, dict) else None)
        or ""
    )
    if raw_pub:
        try:
            return parsedate_to_datetime(str(raw_pub)).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            return str(raw_pub).strip()
    return datetime.utcnow().strftime("%Y-%m-%d")


def _extract_rss_source(entry: Any, title: str) -> str:
    src = getattr(entry, "source", None) or (
        entry.get("source") if isinstance(entry, dict) else None
    )
    if isinstance(src, dict) and src.get("title"):
        return str(src["title"]).strip()
    if getattr(src, "title", None):
        return str(src.title).strip()
    if " - " in title:
        return title.rsplit(" - ", 1)[-1].strip() or "Google News RSS"
    return "Google News RSS"


def fetch_ticker_news(
    ticker: str,
    days_back: int = 3,
    limit: int = 5,
) -> List[Dict[str, str]]:
    """
    Fetches structured recent news articles for `ticker`:
      [{"title", "published_at", "source", "url"}]
    1) Uses NewsAPI.org (`/v2/everything`) with a 3s timeout when `NEWS_API_KEY` is set.
    2) Falls back cleanly to Google News RSS (`news.google.com/rss/search`) on missing key,
       non-200 status, empty results, or request failure.
    3) Degrades gracefully to [] on timeout or network error.
    """
    sym = str(ticker or "").strip().upper().replace(".NS", "")
    if not sym:
        return []
    max_items = max(int(limit), 1)
    lookback = max(int(days_back), 1)

    news_api_key = os.getenv("NEWS_API_KEY", "").strip()
    if news_api_key:
        try:
            from_dt = (datetime.utcnow() - timedelta(days=lookback)).strftime("%Y-%m-%d")
            resp = requests.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": f"{sym} AND (NSE OR India OR stock)",
                    "from": from_dt,
                    "sortBy": "publishedAt",
                    "language": "en",
                    "pageSize": max_items,
                    "apiKey": news_api_key,
                },
                timeout=3.0,
            )
            if resp.status_code == 200:
                articles = resp.json().get("articles", []) or []
                out: List[Dict[str, str]] = []
                for art in articles[:max_items]:
                    title = " ".join(str(art.get("title") or "").split()).strip()
                    if not title:
                        continue
                    src_obj = art.get("source") or {}
                    src_name = str(
                        src_obj.get("name", "NewsAPI") if isinstance(src_obj, dict) else src_obj
                    ).strip() or "NewsAPI"
                    out.append(
                        {
                            "title": title,
                            "published_at": str(art.get("publishedAt") or "").strip(),
                            "source": src_name,
                            "url": str(art.get("url") or "").strip(),
                        }
                    )
                if out:
                    return out
        except Exception:
            pass

    try:
        start_date = (datetime.utcnow() - timedelta(days=lookback)).strftime("%Y-%m-%d")
        encoded_query = urllib.parse.quote(f"{sym} NSE stock")
        rss_url = (
            f"https://news.google.com/rss/search?"
            f"q={encoded_query}+after:{start_date}&hl=en-IN&gl=IN&ceid=IN:en"
        )
        resp = requests.get(rss_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=3.0)
        if resp.status_code != 200:
            return []
        feed = feedparser.parse(resp.content)
        entries = getattr(feed, "entries", None) or []
        results: List[Dict[str, str]] = []
        for entry in entries[:max_items]:
            title = " ".join(str(getattr(entry, "title", "") or "").split()).strip()
            link = str(getattr(entry, "link", "") or "").strip()
            if not title:
                continue
            results.append(
                {
                    "title": title,
                    "published_at": _parse_published_iso(entry),
                    "source": _extract_rss_source(entry, title),
                    "url": link,
                }
            )
        return results
    except Exception:
        return []
