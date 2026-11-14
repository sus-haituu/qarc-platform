import os
import json
import time
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

def generate_bcp_label(row):
    """
    Generates Behavioral Counterparty Profiling labels using Google Gemini API
    or falls back to NVIDIA NIM.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    nvidia_key = os.getenv("NVIDIA_API_KEY")

    if not gemini_key and not nvidia_key:
        print("Warning: Neither GEMINI_API_KEY nor NVIDIA_API_KEY found. Returning empty BCP label for dry run.")
        return "Primary Seller Archetype: Unknown Seller\nSeller Motivation: Unknown\nSeller Time Horizon: Unknown\nPrimary Buyer Archetype: Unknown Buyer\nBuyer Motivation: Unknown\nBuyer Time Horizon: Unknown\nConfidence Score: 0.0"

    prompt = f"""
    You are an expert quantitative behavioral finance analyst. Based on the following real market data for the Indian stock market, profile the most likely primary buyer and seller for this stock on this specific day. Do not hallucinate data.

    Stock Ticker: {row['ticker']}
    Date: {row['date']}
    Price Change %: {row.get('price_change_pct', 'N/A')}
    Volume: {row.get('volume', 'N/A')}
    Volume vs 30d Avg: {row.get('volume_vs_30d_avg', 'N/A')}
    Delivery %: {row.get('delivery_pct', 'N/A')}
    Bulk/Block Deals: {row.get('bulk_block_deals', 'none')}
    Market Regime (HMM): {row.get('hmm_regime', 'Neutral')}
    RSI 14: {row.get('rsi_14', 'N/A')}
    MACD: {row.get('macd', 'N/A')} (Signal: {row.get('macd_signal', 'N/A')})
    ATR 14: {row.get('atr_14', 'N/A')}
    Bollinger Position (0-1): {row.get('bollinger_position', 'N/A')}
    OBV Trend (10d): {row.get('obv_trend', 'N/A')}
    VWAP Deviation %: {row.get('vwap_deviation_pct', 'N/A')}
    Volume Z-score: {row.get('volume_zscore', 'N/A')}
    NIFTY 50 Change %: {row.get('nifty_change_pct', 'N/A')}
    Beta vs NIFTY (60d): {row.get('beta_vs_nifty', 'N/A')}
    Sector Relative Performance %: {row.get('sector_relative_performance_pct', 'N/A')}
    Headlines: {row.get('headline', 'None')}

    Analyze who is buying/selling and why, using strictly the data provided above.
    
    CRITICAL ANTI-HALLUCINATION RULES:
    1. If Bulk/Block Deals is 'none', NEVER invent specific institutional identities (e.g. 'FII', 'Mutual Funds', 'DII'). Use flow-based archetypes like 'Unattributed Flow', 'Momentum / Swing Trader', 'Retail Flow', or 'Short-Term Liquidity Provider'.
    2. NEVER claim a multi-year time horizon (e.g., '12-24 months') based solely on single-day bar data. Use observable delivery turnover horizons: '<7 days' for low delivery, or '1-4 weeks (Positional Delivery)' for high delivery.
    3. Output strictly grounded motivations directly tied to the price, volume, and VWAP deviation metrics provided.

    IMPORTANT INSTRUCTION FOR CONFIDENCE SCORE: 
    Confidence Score must reflect how strongly the provided technical and flow data support this specific archetype read. Score below 0.5 when signals are mixed or weak (e.g. price drops but volume/delivery% is very low). Score above 0.8 only when multiple indicators clearly align (e.g. massive volume, high delivery%, strong price action). Do not default to a mid-range score like 0.78.

    Format your response EXACTLY as follows (no extra text, markdown, or explanation):

    Primary Seller Archetype: <archetype name or Unattributed Flow>
    Seller Motivation: <one factual sentence grounded in provided metrics>
    Seller Time Horizon: <e.g. "<7 days" or "1-4 weeks (Positional Delivery)">
    Primary Buyer Archetype: <archetype name or Unattributed Flow>
    Buyer Motivation: <one factual sentence grounded in provided metrics>
    Buyer Time Horizon: <e.g. "<7 days" or "1-4 weeks (Positional Delivery)">
    Confidence Score: <float 0.0-1.0>
    """

    max_retries = 3
    for attempt in range(max_retries):
        start_time = time.time()
        final_content = ""
        
        # 1. Try NVIDIA NIM
        if nvidia_key:
            try:
                from openai import OpenAI
                client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=nvidia_key)
                completion = client.chat.completions.create(
                    model="nvidia/nemotron-3-super-120b-a12b",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=1200
                )
                msg = completion.choices[0].message
                final_content = msg.content or ""
                if not final_content and hasattr(msg, "reasoning_content"):
                    final_content = getattr(msg, "reasoning_content", "") or ""
                
                usage = completion.usage
                if usage:
                    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "token_usage.log"), "a", encoding="utf-8") as uf:
                        uf.write(f"{row['ticker']} | {row['date']} | Time: {time.time() - start_time:.2f}s | Prompt: {usage.prompt_tokens} | Completion: {usage.completion_tokens} | Total: {usage.total_tokens}\n")
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    time.sleep(2.0)
                # Fallback to Gemini
                pass

        # 2. Try Gemini fallback if NVIDIA didn't succeed
        if not final_content and gemini_key:
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=gemini_key)
                response = client.models.generate_content(
                    model="gemini-3.5-flash-lite",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=600,
                    )
                )
                final_content = response.text or ""
                usage = getattr(response, "usage_metadata", None)
                if usage:
                    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "token_usage.log"), "a", encoding="utf-8") as uf:
                        uf.write(f"{row['ticker']} | {row['date']} | Time: {time.time() - start_time:.2f}s | Prompt: {getattr(usage, 'prompt_token_count', 0)} | Completion: {getattr(usage, 'candidates_token_count', 0)} | Total: {getattr(usage, 'total_token_count', 0)}\n")
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    time.sleep(5.0)

        if final_content:
            import re
            pattern = r"(Primary Seller Archetype:.*Confidence Score:\s*[0-9.]+)"
            match = re.search(pattern, final_content, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1).strip()
            elif "Primary Seller Archetype:" in final_content:
                # Add default confidence score if omitted
                if "Confidence Score:" not in final_content:
                    final_content += "\nConfidence Score: 0.75"
                return final_content.strip()

        time.sleep(1.0 + attempt)
            
    return None
