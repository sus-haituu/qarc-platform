import os
import json
import pandas as pd

SYSTEM_PROMPT = (
    "You are an institutional quantitative behavioral finance analyst specializing in Behavioral "
    "Counterparty Profiling (BCP) for the Indian stock market (NSE). Based strictly on the "
    "provided technical indicators, volume dynamics, institutional block deals, HMM regimes, "
    "and market context, profile the most likely primary buyer and seller archetypes. "
    "Adhere strictly to verifiable evidence: do not invent institutional participation unless confirmed "
    "by exchange filings, and do not hallucinate multi-year time horizons without longitudinal data."
)

INSTRUCTION_PROMPT = (
    "Analyze the following real market data for this Indian equity and profile the most likely "
    "primary buyer and seller for this trading day. Adhere strictly to the 7-field format and avoid hallucinations."
)

def format_input_context(row):
    headline = str(row.get('headline', '')).strip()
    if not headline or headline.lower() == 'nan':
        headline = 'None'

    deals = str(row.get('bulk_block_deals', 'none')).strip()
    if not deals or deals.lower() == 'nan':
        deals = 'none'

    return (
        f"Stock Ticker: {row['ticker']}\n"
        f"Date: {str(row['date'])[:10]}\n"
        f"Price Change %: {round(float(row['price_change_pct']), 2) if pd.notna(row.get('price_change_pct')) else 'N/A'}\n"
        f"Volume: {int(row['volume']) if pd.notna(row.get('volume')) else 'N/A'}\n"
        f"Volume vs 30d Avg: {round(float(row['volume_vs_30d_avg']), 2) if pd.notna(row.get('volume_vs_30d_avg')) else 'N/A'}\n"
        f"Delivery %: {round(float(row['delivery_pct']), 2) if pd.notna(row.get('delivery_pct')) else 'N/A'}\n"
        f"Bulk/Block Deals: {deals}\n"
        f"Market Regime (HMM): {row.get('hmm_regime', 'Neutral')}\n"
        f"RSI 14: {round(float(row['rsi_14']), 2) if pd.notna(row.get('rsi_14')) else 'N/A'}\n"
        f"MACD: {round(float(row['macd']), 2) if pd.notna(row.get('macd')) else 'N/A'} "
        f"(Signal: {round(float(row['macd_signal']), 2) if pd.notna(row.get('macd_signal')) else 'N/A'})\n"
        f"ATR 14: {round(float(row['atr_14']), 2) if pd.notna(row.get('atr_14')) else 'N/A'}\n"
        f"Bollinger Position (0-1): {round(float(row['bollinger_position']), 2) if pd.notna(row.get('bollinger_position')) else 'N/A'}\n"
        f"OBV Trend (10d): {row.get('obv_trend', 'N/A')}\n"
        f"VWAP Deviation %: {round(float(row['vwap_deviation_pct']), 2) if pd.notna(row.get('vwap_deviation_pct')) else 'N/A'}\n"
        f"Volume Z-score: {round(float(row['volume_zscore']), 2) if pd.notna(row.get('volume_zscore')) else 'N/A'}\n"
        f"NIFTY 50 Change %: {round(float(row['nifty_change_pct']), 2) if pd.notna(row.get('nifty_change_pct')) else 'N/A'}\n"
        f"Beta vs NIFTY (60d): {round(float(row['beta_vs_nifty']), 2) if pd.notna(row.get('beta_vs_nifty')) else 'N/A'}\n"
        f"Sector Relative Performance %: {round(float(row['sector_relative_performance_pct']), 2) if pd.notna(row.get('sector_relative_performance_pct')) else 'N/A'}\n"
        f"Headlines: {headline}"
    )

def convert_split(df, split_name, output_dir):
    chatml_records = []
    alpaca_records = []

    for _, row in df.iterrows():
        input_context = format_input_context(row)
        output_target = str(row['output']).strip()

        # 1. ChatML / OpenAI format
        chatml_item = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"{INSTRUCTION_PROMPT}\n\n{input_context}"},
                {"role": "assistant", "content": output_target}
            ]
        }
        chatml_records.append(chatml_item)

        # 2. Alpaca format
        alpaca_item = {
            "instruction": INSTRUCTION_PROMPT,
            "input": input_context,
            "output": output_target
        }
        alpaca_records.append(alpaca_item)

    # Output directories
    chatml_dir = os.path.join(output_dir, "chatml")
    alpaca_dir = os.path.join(output_dir, "alpaca")
    os.makedirs(chatml_dir, exist_ok=True)
    os.makedirs(alpaca_dir, exist_ok=True)

    # Save ChatML JSONL
    chatml_file = os.path.join(chatml_dir, f"{split_name}.jsonl")
    with open(chatml_file, "w", encoding="utf-8") as f:
        for item in chatml_records:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # Save Alpaca JSONL and JSON
    alpaca_jsonl_file = os.path.join(alpaca_dir, f"{split_name}.jsonl")
    with open(alpaca_jsonl_file, "w", encoding="utf-8") as f:
        for item in alpaca_records:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    alpaca_json_file = os.path.join(alpaca_dir, f"{split_name}.json")
    with open(alpaca_json_file, "w", encoding="utf-8") as f:
        json.dump(alpaca_records, f, indent=2, ensure_ascii=False)

    print(f"[{split_name.upper()}] Converted {len(df):,} records:")
    print(f"  -> ChatML: {chatml_file}")
    print(f"  -> Alpaca: {alpaca_jsonl_file} & {alpaca_json_file}")

def main():
    base_data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    output_dir = os.path.join(base_data_dir, "finetuning")
    os.makedirs(output_dir, exist_ok=True)

    splits = ["train", "val", "test"]
    for s in splits:
        csv_path = os.path.join(base_data_dir, f"{s}.csv")
        if not os.path.exists(csv_path):
            print(f"Warning: {csv_path} not found!")
            continue
        df = pd.read_csv(csv_path)
        convert_split(df, s, output_dir)

    print("\nFine-tuning datasets created successfully!")

if __name__ == "__main__":
    main()
