import os
import io
import time
import datetime
import requests
import pandas as pd
from tqdm import tqdm

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

def get_trading_days(start_date, end_date):
    days = pd.date_range(start=start_date, end=end_date, freq='B')
    return [d.date() for d in days]

def fetch_sec_bhavdata_full(date):
    """Fetches the modern full bhavcopy for a specific date, caching to disk."""
    cache_dir = os.path.join(DATA_DIR, "bhavcopy_cache")
    os.makedirs(cache_dir, exist_ok=True)
    date_str = date.strftime('%d%m%Y')
    cache_file = os.path.join(cache_dir, f"sec_bhavdata_{date_str}.csv")
    
    if os.path.exists(cache_file):
        try:
            bhav_df = pd.read_csv(cache_file)
            bhav_df.columns = bhav_df.columns.str.strip()
            if 'SERIES' in bhav_df.columns:
                bhav_df = bhav_df[bhav_df['SERIES'].str.strip() == 'EQ']
            return bhav_df
        except Exception:
            pass

    # Modern Bhavcopy URL (includes delivery data)
    bhav_url = f"https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{date_str}.csv"
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        r_bhav = requests.get(bhav_url, headers=headers, timeout=10)
        if r_bhav.status_code == 200 and len(r_bhav.text) > 200:
            with open(cache_file, "w", encoding="utf-8") as f:
                f.write(r_bhav.text)
            bhav_df = pd.read_csv(io.StringIO(r_bhav.text))
            bhav_df.columns = bhav_df.columns.str.strip()
            if 'SERIES' in bhav_df.columns:
                bhav_df = bhav_df[bhav_df['SERIES'].str.strip() == 'EQ']
            return bhav_df
    except Exception:
        pass

    return None

def build_historical_dataset(tickers, lookback_days=100):
    """Builds a combined dataset of OHLCV and Delivery by downloading past daily reports."""
    raw_path = os.path.join(DATA_DIR, "raw_bhavcopy_data.csv")
    if os.path.exists(raw_path):
        cached_df = pd.read_csv(raw_path)
        if not cached_df.empty and len(cached_df) > 10000:
            print(f"Loaded existing raw bhavcopy data from {raw_path} ({len(cached_df)} rows)")
            return cached_df

    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=lookback_days)
    
    possible_days = get_trading_days(start_date, end_date)
    possible_days = sorted(possible_days, reverse=True)
    
    all_data = []
    
    valid_days_fetched = 0
    pbar = tqdm(possible_days, desc="Downloading NSE Archives")
    
    for d in pbar:
        df = fetch_sec_bhavdata_full(d)
        if df is not None and not df.empty:
            valid_days_fetched += 1
            
            # Map the columns to our expected names
            # Expected columns in sec_bhavdata_full: SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
            # But the columns might vary slightly. Let's do a safe rename
            col_map = {
                'SYMBOL': 'ticker',
                'OPEN_PRICE': 'open',
                'HIGH_PRICE': 'high',
                'LOW_PRICE': 'low',
                'CLOSE_PRICE': 'close',
                'TTL_TRD_QNTY': 'volume',
                'DELIV_PER': 'DELIVERY_PCT'
            }
            
            # Keep only the target tickers
            target_symbols = set(tickers + ['NIFTYBEES'])
            df['SYMBOL'] = df['SYMBOL'].str.strip()
            df = df[df['SYMBOL'].isin(target_symbols)]
            
            if not df.empty:
                df = df.rename(columns=col_map)
                df['date'] = pd.to_datetime(d)
                all_data.append(df[['ticker', 'date', 'open', 'high', 'low', 'close', 'volume', 'DELIVERY_PCT']])
                
        # To avoid hitting server too hard
        time.sleep(0.5)
        
    if not all_data:
        return pd.DataFrame()
        
    final_df = pd.concat(all_data, ignore_index=True)
    
    # Sort chronological
    final_df = final_df.sort_values(['ticker', 'date']).reset_index(drop=True)
    
    # Clean delivery pct which might have '-' instead of numeric if no delivery
    final_df['DELIVERY_PCT'] = pd.to_numeric(final_df['DELIVERY_PCT'].replace('-', pd.NA), errors='coerce')
    
    # Save raw data
    raw_path = os.path.join(DATA_DIR, "raw_bhavcopy_data.csv")
    final_df.to_csv(raw_path, index=False)
    print(f"Raw data saved to {raw_path} with {len(final_df)} rows")
    
    return final_df

def fetch_historical_bulk_block_deals(start_date, end_date):
    """
    Fetches historical bulk and block deals from NSE historicalOR endpoint using curl_cffi.
    Caches results to disk to avoid repeated queries.
    """
    cache_path = os.path.join(DATA_DIR, "nse_bulk_block_deals_cache.csv")
    if os.path.exists(cache_path):
        try:
            cached_df = pd.read_csv(cache_path)
            cached_df['date'] = pd.to_datetime(cached_df['date'])
            print(f"Loaded {len(cached_df)} bulk/block deal records from cache.")
            return cached_df
        except Exception:
            pass

    from curl_cffi import requests as cffi_requests
    session = cffi_requests.Session(impersonate="chrome120")
    headers = {
        "Referer": "https://www.nseindia.com/report-detail/display-bulk-and-block-deals",
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        session.get("https://www.nseindia.com", headers=headers, timeout=10)
    except Exception as e:
        print(f"Warning: Failed to initialize NSE session: {e}")

    # Chunk into 60-day intervals
    date_ranges = []
    curr_start = start_date
    while curr_start < end_date:
        curr_end = min(curr_start + datetime.timedelta(days=60), end_date)
        date_ranges.append((curr_start, curr_end))
        curr_start = curr_end + datetime.timedelta(days=1)

    all_deals = []
    for option_type in ['bulk_deals', 'block_deals']:
        desc = "Bulk Deals" if option_type == 'bulk_deals' else "Block Deals"
        print(f"Fetching historical {desc} across {len(date_ranges)} date chunks...")
        for s_dt, e_dt in date_ranges:
            s_str = s_dt.strftime('%d-%m-%Y')
            e_str = e_dt.strftime('%d-%m-%Y')
            url = f"https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType={option_type}&from={s_str}&to={e_str}&csv=true"
            try:
                res = session.get(url, headers=headers, timeout=15)
                if res.status_code == 200 and len(res.text) > 50:
                    csv_text = res.text.lstrip('\ufeff')
                    chunk_df = pd.read_csv(io.StringIO(csv_text))
                    chunk_df.columns = chunk_df.columns.str.strip()
                    if not chunk_df.empty and 'Symbol' in chunk_df.columns:
                        chunk_df['deal_type'] = 'BULK' if option_type == 'bulk_deals' else 'BLOCK'
                        all_deals.append(chunk_df)
                time.sleep(0.5)
            except Exception as e:
                print(f"Error fetching {option_type} for {s_str} to {e_str}: {e}")

    if not all_deals:
        print("No bulk/block deals fetched or endpoint unavailable.")
        return pd.DataFrame(columns=['ticker', 'date', 'bulk_block_deals'])

    combined = pd.concat(all_deals, ignore_index=True)
    # Format and clean columns
    col_map = {
        'Symbol': 'ticker',
        'Date': 'date',
        'Buy / Sell': 'action',
        'Quantity Traded': 'quantity',
        'Trade Price / Wght. Avg. Price': 'price',
        'Client Name': 'client'
    }
    # Keep only columns that exist
    valid_cols = [c for c in col_map.keys() if c in combined.columns]
    combined = combined[valid_cols].rename(columns=col_map)
    combined['ticker'] = combined['ticker'].astype(str).str.strip()
    combined['date'] = pd.to_datetime(combined['date'], format='%d-%b-%Y', errors='coerce')
    combined = combined.dropna(subset=['ticker', 'date'])

    # Aggregate by (ticker, date) into a concise readable string
    def aggregate_deals(group):
        parts = []
        for _, row in group.iterrows():
            action = str(row.get('action', '')).strip().upper()
            client = str(row.get('client', 'Unknown')).strip()
            qty = row.get('quantity', '')
            px = row.get('price', '')
            parts.append(f"{action}: {qty} shares @ {px} ({client})")
        return "; ".join(parts[:3]) # Limit to top 3 to keep prompt tight

    aggregated = combined.groupby(['ticker', 'date']).apply(aggregate_deals).reset_index(name='bulk_block_deals')
    aggregated.to_csv(cache_path, index=False)
    print(f"Cached {len(aggregated)} aggregated bulk/block deal records to {cache_path}")
    return aggregated

if __name__ == "__main__":
    test_tickers = ['RELIANCE', 'TCS']
    df = build_historical_dataset(test_tickers, lookback_days=10)
    print(df.head())
