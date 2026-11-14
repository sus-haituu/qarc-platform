import requests
import json
# pyrefly: ignore [missing-import]
from nsepython import nsefetch

def get_historical_data(symbol, start_date, end_date):
    url = f"https://www.nseindia.com/api/historical/cm/equity?symbol={symbol}&series=[%22EQ%22]&from={start_date}&to={end_date}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': f'https://www.nseindia.com/get-quotes/equity?symbol={symbol}',
    }
    
    session = requests.Session()
    # Hit main page first to get cookies
    session.get('https://www.nseindia.com', headers=headers, timeout=10)
    
    res = session.get(url, headers=headers, timeout=10)
    try:
        return res.json()
    except:
        return res.text

print(get_historical_data('RELIANCE', '01-01-2024', '15-01-2024'))
