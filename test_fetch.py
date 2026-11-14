from nsepython import nsefetch, equity_history

try:
    print("Trying equity_history...")
    res = equity_history('RELIANCE', 'EQ', '01-01-2024', '15-01-2024')
    print(res)
except Exception as e:
    print("equity_history failed:", e)

try:
    print("\nTrying nsefetch direct api...")
    url = "https://www.nseindia.com/api/historical/cm/equity?symbol=RELIANCE&series=[%22EQ%22]&from=01-01-2024&to=15-01-2024"
    res = nsefetch(url)
    print(res)
except Exception as e:
    print("nsefetch failed:", e)
