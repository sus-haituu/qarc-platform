import urllib.parse
import feedparser
import requests
from datetime import datetime, timedelta

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
