"""
Q-ARC Cognitive Model Client
============================
Connects the Q-ARC Evidence Ledger to the fine-tuned Nemotron 70B LoRA model.
Supports:
1. vLLM / OpenAI-compatible endpoint (e.g., hosted on Colab Pro A100 or local GPU)
2. Direct Transformers/Unsloth inference (if high-VRAM local GPU available)
3. Fallback Gemini / Mock provider for zero-downtime offline development
"""

import os
import json
import re
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

load_dotenv()

BEARISH_ONE_SHOT_USER = """EVIDENCE LEDGER:
=== EVIDENCE LEDGER FOR EXAMPLE (2026-09-15) ===
E01 [FACT] Daily Return: Price moved from ₹1,250.00 to ₹1,228.50 (-1.72%)
E02 [FACT] VWAP Deviation: Close is 1.15% below session VWAP
E03 [FACT] Delivery Percentage: 54.2% delivery to traded volume (Moderate Delivery / Mixed Turnover)
E04 [FACT] Volume Anomaly: Volume 3,420,000 shares (1.35x 30d average, Z-score: +1.12)
E05 [FACT] Liquidity Friction: Amihud Illiquidity: 0.0012, ATR(14): ₹24.50
E06 [FACT] Macro / HMM Regime: Statistically classified as: Distribution
E08 [FACT] Institutional Filings: NONE RECORDED (<0.5% regulatory threshold). Participant identity UNRESOLVED.
E09 [LIMITATION] Level 2 / Level 3 Order Book: NOT AVAILABLE. Daily snapshot data only.
E11 [FACT] Kalman Denoised Trend: Denoised Price: ₹1,234.10, Trend Velocity: -0.340%/day, Signal: MILD_DOWNTREND
E12 [FACT] HMM 4-State Probability Anchor: Phase: Distribution (78.0% confidence, 84.0% state persistence)
E13 [FACT] Live Monte Carlo 10k Risk Scenario: VaR(95%): -4.8%, CVaR(95%): -6.2%, P(Stop -3% Breach): 46.5%, Max Allocation Cap: 12.0% [ADVERSE_RISK_PROFILE]
==================================================

Generate the 7-field BCP Profile JSON:"""

BEARISH_ONE_SHOT_ASSISTANT = json.dumps({
    "counterparty_type": "UNKNOWN (Unattributed Flow)",
    "dominant_intent": "Passive Institutional Distribution",
    "time_horizon": "Positional (Delivery Proxy)",
    "execution_urgency": "Medium",
    "inventory_impact": "Moderate Adverse Selection",
    "deception_risk": "UNVERIFIABLE (No L2/L3 Feed)",
    "counter_strategy": "Defensive Capital Preservation / Wait for Base"
}, indent=2)

SYSTEM_PROMPT = """You are an institutional quantitative market microstructure auditor and Behavioral Counterparty Profiler (BCP) for Indian Equities (NSE).
You will be provided with an immutable Quantitative Evidence Ledger (E01 - E13).
Analyze the order flow, price dynamics, GARCH volatility, Kalman trend, and HMM regime.
Return a STRICT JSON object with EXACTLY the following 7 BCP keys:
{
  "counterparty_type": "<participant identity or UNKNOWN if no filing>",
  "dominant_intent": "<Passive Distribution / Aggressive Accumulation / Short Covering / etc.>",
  "time_horizon": "<Positional / Intraday / etc.>",
  "execution_urgency": "<Low / Medium / High>",
  "inventory_impact": "<Low / Moderate / Regime Breakout / etc.>",
  "deception_risk": "<UNVERIFIABLE without L2/L3 or Low/High>",
  "counter_strategy": "<Specific tactical counter-measure>"
}

CRITICAL INSTITUTIONAL GOVERNANCE & ANTI-HALLUCINATION RULES:
1. Counterparty Type: NEVER invent specific institutional identities (e.g. 'FII', 'Morgan Stanley', 'DII') unless verified in E08 exchange filings. If E08 is NONE RECORDED, output 'UNKNOWN (Unattributed Flow)'.
2. Dominant Intent Grounding (Zero Contradictions):
   - When Return (E01) > +1.0% and Price > VWAP (E02):
     * If Kalman (E11) is DOWNTREND or HMM (E12) is Markdown/Distribution, this is a 'Short Covering / Counter-Trend Relief Rally'. NEVER label it 'Passive Distribution' (contradicts positive return) and NEVER claim 'Structural Accumulation' (contradicts macro downtrend).
     * If Kalman is UPTREND and HMM is Markup/Accumulation, state 'Bullish Demand Absorption' or 'Markup Accumulation'.
   - When Return (E01) < -1.0% and Price < VWAP (E02):
     * If Kalman is DOWNTREND, state 'Passive Institutional Distribution' or 'Aggressive Liquidation'. NEVER claim 'Bullish Accumulation' or 'Demand Absorption' (contradicts negative price action).
     * If Kalman is UPTREND, state 'Profit Taking Pullback / Mean Reversion'.
   - When price action is within [-1.0%, +1.0%] or near VWAP: state 'Balanced Two-Sided Liquidity Provision'.
3. Time Horizon: NEVER claim '12-24 months' or multi-year structural holding without longitudinal filing data. Use delivery turnover heuristics (e.g., 'Positional (Delivery Proxy)' if E03 delivery% > 50%, or 'Intraday Speculative (<5D)' if delivery% < 35%).
4. Execution Urgency: Reflect VWAP displacement (E02) and Volume anomaly (E04). Use 'High' only if |VWAP dev| > 1.5% and Volume Z-score > 1.5; otherwise 'Medium' or 'Low'.
5. Inventory Impact: Reflect Amihud illiquidity friction (E05). Use 'High Adverse Selection' if illiquid; otherwise 'Moderate Adverse Selection' or 'Low Impact'.
6. Deception Risk: ALWAYS declare 'UNVERIFIABLE (No L2/L3 Feed)' if E09 specifies order book depth is unavailable. NEVER fabricate spoofing or iceberg claims from daily snapshot data.
7. Tactical Counter-Strategy:
   - Under adverse risk (Monte Carlo E13 ADVERSE_RISK_PROFILE, stop breach > 40%, or GARCH E10 volatility shock), NEVER propose aggressive buying or long front-running! Output 'Step-Aside / Wait for Absorption Exhaustion' or 'Defensive Capital Preservation'.
   - If in an overextended counter-trend relief bounce in a macro downtrend, output 'Avoid Chasing Longs / Fade Overextended Relief'.
   - Only propose buying/long scaling if price > VWAP, Kalman trend velocity is non-negative, and Monte Carlo risk is balanced.
8. Output ONLY valid JSON.
"""

class QArcModelClient:
    def __init__(self, endpoint_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        endpoint_url: URL of the OpenAI-compatible vLLM server (e.g., 'http://localhost:8000/v1' or ngrok URL from Colab)
        """
        self.endpoint_url = endpoint_url or os.getenv("QARC_MODEL_ENDPOINT", "http://localhost:8000/v1")
        self.api_key = api_key or os.getenv("QARC_MODEL_API_KEY", "EMPTY")

    @staticmethod
    def is_bearish_ledger_text(text: str) -> bool:
        upper = text.upper()
        return any(tok in upper for tok in ["DOWNTREND", "DISTRIBUTION", "MARKDOWN"])

    def generate_bcp_profile(
        self,
        evidence_ledger_text: str,
        system_prompt_override: Optional[str] = None,
        bearish_lock: Optional[bool] = None,
        logit_bias: Optional[Dict[int, float]] = None,
    ) -> Dict[str, str]:
        """
        Sends the Evidence Ledger to the fine-tuned model and returns the parsed 7-field JSON.
        Uses greedy decoding (temperature=0.0) to eliminate stochastic hallucinations.
        When bearish_lock is active (or detected from E11/E12), injects a 1-shot bearish exemplar
        and optional logit_bias/bad_words to override bullish LoRA priors at inference time.
        """
        if bearish_lock is None:
            bearish_lock = self.is_bearish_ledger_text(evidence_ledger_text)

        sys_prompt = system_prompt_override or SYSTEM_PROMPT
        if bearish_lock and "[HARD MATHEMATICAL CONSTRAINT" not in sys_prompt:
            sys_prompt += (
                "\n\n[HARD MATHEMATICAL CONSTRAINT - OVERRIDE PRIOR]:\n"
                "Deterministic engines confirm DOWNTREND / Distribution or Markdown regime.\n"
                "- FORBIDDEN OUTPUTS: You are strictly prohibited from outputting 'Bullish Demand Absorption', "
                "'Accumulation', or 'Scale Limit Orders at VWAP'.\n"
                "- REQUIRED ALIGNMENT: `dominant_intent` MUST reflect supply distribution, institutional liquidation, "
                "or defensive step-aside (or Short Covering / Relief Rally only if E01 > +1.0% and above VWAP). "
                "`counter_strategy` MUST specify capital preservation, short/hedge, or wait-for-base.\n"
            )

        # Detect placeholder
        if "xxxx" in self.endpoint_url or not self.endpoint_url.strip():
            print(f"  • [Q-ARC CLIENT] Notice: Endpoint is currently set to placeholder '{self.endpoint_url}'.")
            print("  • [Q-ARC CLIENT] Paste your live Colab ngrok URL into .env (e.g. QARC_MODEL_ENDPOINT=https://abc.ngrok-free.app/v1).")
            return self._heuristic_baseline(evidence_ledger_text)

        messages: List[Dict[str, str]] = [{"role": "system", "content": sys_prompt}]
        if bearish_lock:
            messages.append({"role": "user", "content": BEARISH_ONE_SHOT_USER})
            messages.append({"role": "assistant", "content": BEARISH_ONE_SHOT_ASSISTANT})
        messages.append({
            "role": "user",
            "content": f"EVIDENCE LEDGER:\n{evidence_ledger_text}\n\nGenerate the 7-field BCP Profile JSON:"
        })

        # Optional negative token bias from env or caller when bearish
        resolved_bias = logit_bias
        if resolved_bias is None and bearish_lock:
            env_bias = os.getenv("QARC_BEARISH_LOGIT_BIAS", "").strip()
            if env_bias:
                try:
                    resolved_bias = {int(k): float(v) for k, v in json.loads(env_bias).items()}
                except Exception:
                    resolved_bias = None

        # Try live OpenAI-compatible endpoint
        try:
            print(f"  • [Q-ARC CLIENT] Querying fine-tuned Nemotron 70B at: {self.endpoint_url}...")
            from openai import OpenAI
            client = OpenAI(base_url=self.endpoint_url, api_key=self.api_key, timeout=30.0)

            kwargs: Dict[str, Any] = {
                "model": "qarc_nemotron_70b",
                "messages": messages,
                "temperature": 0.0,
                "max_tokens": 400,
            }
            if resolved_bias:
                kwargs["logit_bias"] = resolved_bias

            response = client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content.strip()
            print("  • [Q-ARC CLIENT] Received response from live model.")
            return self._parse_json_response(content)

        except Exception as e:
            print(f"  • [Q-ARC CLIENT WARNING] Endpoint error ({e}). Using cognitive fallback.")
            return self._heuristic_baseline(evidence_ledger_text)

    def repair_contradicted_fields(
        self,
        evidence_ledger_text: str,
        previous_output: Dict[str, str],
        contradicted_fields: List[str],
        contradiction_notes: List[str],
        system_prompt_override: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Closed-Loop Reflexion Retry (1 retry max): feeds exact ClaimVerifier contradiction
        diagnostics back to the model and asks it to rewrite ONLY the contradicted keys.
        """
        if "xxxx" in self.endpoint_url or not self.endpoint_url.strip():
            return self._heuristic_baseline(evidence_ledger_text)

        sys_prompt = system_prompt_override or SYSTEM_PROMPT
        error_summary = "\n".join(f"- {n}" for n in contradiction_notes)
        repair_prompt = (
            f"Your previous JSON output had a CONTRADICTION on fields {contradicted_fields}:\n"
            f"{error_summary}\n\n"
            f"Previous JSON:\n{json.dumps(previous_output, indent=2)}\n\n"
            f"EVIDENCE LEDGER:\n{evidence_ledger_text}\n\n"
            f"Rewrite ONLY the contradicted keys ({', '.join(contradicted_fields)}) to align strictly "
            f"with the bearish/quantitative evidence, and return the complete 7-field JSON."
        )

        try:
            from openai import OpenAI
            client = OpenAI(base_url=self.endpoint_url, api_key=self.api_key, timeout=30.0)
            response = client.chat.completions.create(
                model="qarc_nemotron_70b",
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": BEARISH_ONE_SHOT_USER},
                    {"role": "assistant", "content": BEARISH_ONE_SHOT_ASSISTANT},
                    {"role": "user", "content": repair_prompt},
                ],
                temperature=0.0,
                max_tokens=400,
            )
            content = response.choices[0].message.content.strip()
            repaired = self._parse_json_response(content)
            merged = dict(previous_output)
            for k in contradicted_fields:
                if k in repaired and repaired[k]:
                    merged[k] = repaired[k]
            return merged
        except Exception as e:
            print(f"  • [Q-ARC CLIENT WARNING] Reflexion retry failed ({e}).")
            return previous_output

    def _parse_json_response(self, text: str) -> Dict[str, str]:
        """Extracts JSON substring from LLM generation."""
        try:
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1:
                return json.loads(text[start:end+1])
        except Exception:
            pass
        return self._heuristic_baseline(text)

    def _heuristic_baseline(self, text: str) -> Dict[str, str]:
        """
        Reliable, 100% grounded deterministic fallback response when model endpoint is offline.
        Strictly parses E01-E13 metrics to prevent ungrounded claims or contradictions.
        """
        # 1. Parse E08 Filings
        has_filing = "VERIFIED Exchange" in text

        # 2. Parse E01 Price Return
        ret = 0.0
        ret_match = re.search(r"Daily Return:[^\(]+\(([+-]?\d+\.?\d*)%\)", text)
        if ret_match:
            try:
                ret = float(ret_match.group(1))
            except ValueError:
                ret = 0.0

        # 3. Parse E02 VWAP Deviation
        vwap_dev = 0.0
        vwap_match = re.search(r"Close is\s+(\d+\.?\d*)%\s+(above|below)", text)
        if vwap_match:
            try:
                val = float(vwap_match.group(1))
                vwap_dev = val if vwap_match.group(2) == "above" else -val
            except ValueError:
                vwap_dev = 0.0

        # 4. Parse Macro / Trend (E06, E11, E12)
        is_downtrend = any(k in text.upper() for k in ["DOWNTREND", "MARKDOWN"])
        is_uptrend = any(k in text.upper() for k in ["UPTREND", "MARKUP"]) and not is_downtrend

        # 5. Parse E03 Delivery %
        deliv = 45.0
        deliv_match = re.search(r"(\d+\.?\d*)%\s+delivery", text)
        if deliv_match:
            try:
                deliv = float(deliv_match.group(1))
            except ValueError:
                deliv = 45.0

        # 6. Parse E13 Risk & E10 Volatility
        is_adverse_risk = "ADVERSE_RISK_PROFILE" in text or "VOLATILITY_SHOCK" in text

        # Determine Dominant Intent with Zero Contradictions
        if ret > 1.0 and vwap_dev > 0.0:
            if is_downtrend:
                dominant_intent = "Short Covering / Counter-Trend Relief Rally"
            else:
                dominant_intent = "Bullish Demand Absorption"
        elif ret < -1.0 and vwap_dev < 0.0:
            if is_downtrend:
                dominant_intent = "Passive Institutional Distribution"
            else:
                dominant_intent = "Profit Taking Pullback"
        else:
            dominant_intent = "Balanced Two-Sided Liquidity Provision"

        # Determine Counter-Strategy aligned with Risk Anchors
        if is_adverse_risk or (is_downtrend and ret < 0.0):
            counter_strategy = "Step-Aside / Wait for Absorption Exhaustion"
        elif ret > 1.0 and is_downtrend:
            counter_strategy = "Avoid Chasing Longs / Fade Overextended Relief"
        elif ret > 0.0 and is_uptrend and not is_adverse_risk:
            counter_strategy = "Scale Limit Orders at VWAP"
        else:
            counter_strategy = "Step-Aside / Await Clear Order Flow Imbalance"

        time_horizon = "Positional (Delivery Proxy)" if deliv >= 50.0 else "Intraday / Short-Term (<5D)"

        return {
            "counterparty_type": "Foreign Institutional Investor (FII)" if has_filing else "UNKNOWN (Unattributed Flow)",
            "dominant_intent": dominant_intent,
            "time_horizon": time_horizon,
            "execution_urgency": "High" if (abs(vwap_dev) > 1.5 or abs(ret) > 2.0) else "Medium",
            "inventory_impact": "Moderate Adverse Selection",
            "deception_risk": "UNVERIFIABLE (No L2/L3 Feed)",
            "counter_strategy": counter_strategy
        }
