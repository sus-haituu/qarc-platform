import os
import numpy as pd
import pandas as pd
import numpy as np

def compute_technical_indicators(df):
    """Computes technical and context indicators for a single ticker's dataframe."""
    df = df.sort_values('date').copy()
    
    # Base fields
    df['price_change_pct'] = df['close'].pct_change() * 100
    df['volume_vs_30d_avg'] = df['volume'] / df['volume'].rolling(window=30, min_periods=30).mean()
    
    # Delivery PCT is already in df from MTO
    if 'DELIVERY_PCT' not in df.columns:
        df['DELIVERY_PCT'] = pd.NA
    df['delivery_pct'] = df['DELIVERY_PCT']
        
    # Technicals
    # RSI 14
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14, min_periods=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14, min_periods=14).mean()
    rs = gain / loss
    df['rsi_14'] = 100 - (100 / (1 + rs))
    
    # MACD
    ema_12 = df['close'].ewm(span=12, adjust=False, min_periods=12).mean()
    ema_26 = df['close'].ewm(span=26, adjust=False, min_periods=26).mean()
    df['macd'] = ema_12 - ema_26
    df['macd_signal'] = df['macd'].ewm(span=9, adjust=False, min_periods=9).mean()
    
    # ATR 14
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['atr_14'] = tr.rolling(window=14, min_periods=14).mean()
    
    # Bollinger Position
    sma_20 = df['close'].rolling(window=20, min_periods=20).mean()
    std_20 = df['close'].rolling(window=20, min_periods=20).std()
    upper_band = sma_20 + (std_20 * 2)
    lower_band = sma_20 - (std_20 * 2)
    df['bollinger_position'] = (df['close'] - lower_band) / (upper_band - lower_band)
    # Clip to 0.0-1.0 roughly, or let it exceed if it breaks bands, but prompt says 0.0-1.0
    df['bollinger_position'] = df['bollinger_position'].clip(0, 1)
    
    # OBV & Trend
    obv = (np.sign(delta) * df['volume']).fillna(0).cumsum()
    df['obv'] = obv
    df['obv_trend'] = df['obv'].diff(10) # 10-day slope proxy
    
    # VWAP deviation pct
    # Approximating daily VWAP with typical price if intraday isn't available
    typical_price = (df['high'] + df['low'] + df['close']) / 3
    # If we don't have intraday VWAP, we use typical price deviation vs close or typical price MA
    # True VWAP across the day requires intraday data. We will compute a rolling 10-day VWAP deviation
    rolling_vwap = (typical_price * df['volume']).rolling(10, min_periods=10).sum() / df['volume'].rolling(10, min_periods=10).sum()
    df['vwap_deviation_pct'] = (df['close'] - rolling_vwap) / rolling_vwap * 100
    
    # Volume Z-score
    vol_mean_30 = df['volume'].rolling(window=30, min_periods=30).mean()
    vol_std_30 = df['volume'].rolling(window=30, min_periods=30).std()
    df['volume_zscore'] = (df['volume'] - vol_mean_30) / vol_std_30
    
    return df

def compute_hmm_regimes(df):
    """
    Fits a 4-state Gaussian Hidden Markov Model on returns and relative volume
    to label Wyckoff-style market phases: Accumulation, Markup, Distribution, Markdown.
    """
    from hmmlearn.hmm import GaussianHMM

    if len(df) < 50:
        df['hmm_regime'] = 'Neutral'
        return df

    r = np.log(df['close'] / df['close'].shift(1)).fillna(0)
    v_ma = df['volume'].rolling(20, min_periods=5).mean().bfill()
    v = np.log(df['volume'] / v_ma).replace([np.inf, -np.inf], 0).fillna(0)
    
    X = np.column_stack([r, v])
    try:
        import warnings, io, sys
        old_out, old_err = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = io.StringIO(), io.StringIO()
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                hmm = GaussianHMM(n_components=4, covariance_type='diag', n_iter=50, random_state=42)
                hmm.fit(X)
        finally:
            sys.stdout, sys.stderr = old_out, old_err
        states = hmm.predict(X)
        
        # Characterize states by return mean and volatility
        stats = []
        for s in range(4):
            mask = (states == s)
            mean_r = r[mask].mean() if np.any(mask) else -999
            vol_std = r[mask].std() if np.any(mask) else 0
            stats.append((s, mean_r, vol_std))
            
        stats.sort(key=lambda x: x[1])
        markdown_state = stats[0][0]
        markup_state = stats[-1][0]
        
        # Among the middle two, the one with higher volatility is Distribution, lower is Accumulation
        mid_states = sorted(stats[1:3], key=lambda x: x[2])
        accum_state = mid_states[0][0]
        dist_state = mid_states[1][0]
        
        mapping = {
            markup_state: 'Markup',
            markdown_state: 'Markdown',
            accum_state: 'Accumulation',
            dist_state: 'Distribution'
        }
        df['hmm_regime'] = [mapping.get(s, 'Neutral') for s in states]
    except Exception as e:
        df['hmm_regime'] = 'Neutral'
        
    return df

def compute_all_indicators(raw_df, sector_map):
    """Computes all technicals and contexts across all tickers."""
    # Process NIFTYBEES first to get index returns
    nifty_df = raw_df[raw_df['ticker'] == 'NIFTYBEES'].copy()
    if not nifty_df.empty:
        nifty_df = nifty_df.sort_values('date')
        nifty_df['nifty_change_pct'] = nifty_df['close'].pct_change() * 100
        nifty_returns = nifty_df[['date', 'nifty_change_pct']]
    else:
        nifty_returns = pd.DataFrame(columns=['date', 'nifty_change_pct'])

    all_processed = []
    
    for ticker, group in raw_df.groupby('ticker'):
        if ticker == 'NIFTYBEES':
            continue
            
        df = compute_technical_indicators(group)
        df = compute_hmm_regimes(df)
        
        # Merge with NIFTY returns
        df = pd.merge(df, nifty_returns, on='date', how='left')
        
        # Beta vs NIFTY (trailing 60-day)
        # Covariance of returns / variance of nifty returns
        # Require 60 days of history
        if not nifty_returns.empty and len(df) > 60:
            df['beta_vs_nifty'] = df['price_change_pct'].rolling(60).cov(df['nifty_change_pct']) / df['nifty_change_pct'].rolling(60).var()
        else:
            df['beta_vs_nifty'] = np.nan
            
        df['sector'] = sector_map.get(ticker, 'Unknown')
        all_processed.append(df)
        
    full_df = pd.concat(all_processed, ignore_index=True)
    
    # Sector relative performance (trailing 1-day)
    # Calculate daily sector mean return
    sector_means = full_df.groupby(['date', 'sector'])['price_change_pct'].mean().reset_index()
    sector_means.rename(columns={'price_change_pct': 'sector_mean_pct'}, inplace=True)
    
    full_df = pd.merge(full_df, sector_means, on=['date', 'sector'], how='left')
    full_df['sector_relative_performance_pct'] = full_df['price_change_pct'] - full_df['sector_mean_pct']
    
    return full_df

def sample_dates_per_ticker(df, n_samples):
    """Sample diverse dates ensuring prior trading days exist for indicator warmup."""
    sampled_rows = []
    
    for ticker, group in df.groupby('ticker'):
        group = group.sort_values('date').reset_index(drop=True)
        # Ensure sufficient prior days exist for indicator warmup (30 days)
        warmup_idx = 30 if len(group) > 30 else max(15, len(group) - n_samples)
        valid_pool = group.iloc[warmup_idx:].copy()
        
        # Drop rows with NaN in core indicators
        required_cols = ['rsi_14', 'macd', 'bollinger_position']
        valid_pool = valid_pool.dropna(subset=required_cols)
        
        if len(valid_pool) <= n_samples:
            sampled = valid_pool
        else:
            step = len(valid_pool) / n_samples
            indices = [int(i * step) for i in range(n_samples)]
            sampled = valid_pool.iloc[indices]
            
        sampled_rows.append(sampled)
        
    if not sampled_rows:
        return pd.DataFrame()
    return pd.concat(sampled_rows, ignore_index=True)

