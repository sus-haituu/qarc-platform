# Q-ARC: Neuro-Symbolic Behavioral Counterparty Profiling & State-Space Risk Architecture

> **Empirical Freeze & Reproducibility Note:** All benchmarks reported below were executed against the frozen fine-tuned Nemotron-70B LoRA adapter (`models/Q-arc_lora_final/adapter_model.safetensors`, zero retraining) paired with deterministic state-space econometric engines, corporate-action-adjusted NSE EOD Bhavcopy data (`16,125` rows across `61` tickers), and NSE Bulk/Block Deal disclosures (`1,601` rows across `656` tickers).

---

## 1. System Architecture & Zero-Contradiction Guardrail Loop

Q-ARC separates **probabilistic market narrative inference** from **deterministic mathematical grounding** so an unconstrained LLM prior cannot bypass capital-preservation controls during hostile regimes:

1. **State-Space Quantitative Backbone (`quant_engines.py`)**:
   - **GARCH(1,1) MLE Volatility Forecaster (`GARCHForecaster`)**: Conditional volatility, persistence ($\alpha + \beta$), and flash-shock hazard ratio (`SHOCK_VOLATILITY` trigger when $|\text{return}| \ge 3\sigma$ or hazard spikes).
   - **2D Kalman Trend & Noise Filter (`KalmanTrendFilter`)**: State vector $x_t = [\text{price\_level}_t, \text{trend\_velocity}_t]^T$ separating underlying institutional drift from bid-ask microstructure noise.
   - **4-State Gaussian HMM Classifier (`HMMRegimeClassifier`)**: Strict zero-lookahead one-step forward predictive filter across `Accumulation`, `Markup`, `Distribution`, and `Markdown` with temperature-smoothed posterior probabilities ($T = 1.35$) and Shannon entropy bounds.
   - **10,000-Path Monte Carlo Risk Engine (`MonteCarloRiskEngine`)**: Simulates forward horizon paths to compute $\text{VaR}_{95\%}$, $\text{CVaR}_{95\%}$ expected shortfall, stop-loss breach probability, and the binding minimum allocation cap across Stop-Risk Budget, Volatility Targeting, and CVaR Tail Stress.
   - **Causal Rolling Hurst Router (`compute_rolling_hurst` in `qarc_walk_forward_backtest.py`)**: 60-day multi-lag variance scaling classifying regimes into mean-reversion ($H < 0.45$) vs. persistent trend ($H \ge 0.45$).

2. **Immutable Evidence Ledger & Factor Wiring (`qarc_evidence_ledger.py`)**:
   - Compiles facts and explicit data limitations into timestamped codes `E01–E13` (`E08` regulatory >0.5% filing boundary; `E09` explicit missing L2/L3 order-book declaration).
   - **Factor 4B Exhaustion Detection**: When disclosed Bulk/Block deal activity coincides with `Daily Return > +1.0%` and `Delivery % < 40.0%`, `build_evidence_ledger()` injects `"[FACTOR 4B TRIGGERED: Bulk/Block Intraday Exhaustion Churn (p=0.0002, T+5 Mean -0.81%)]"` into `E03` and `E05` and sets `ledger.has_factor_4b_exhaustion = True`.

3. **Zero-Retraining Neuro-Symbolic Guardrail (`qarc_pipeline.py`, `qarc_model_client.py`, `qarc_claim_verifier.py`)**:
   - **Dynamic Regime Lock (`build_regime_locked_prompt`)**: Inspects `E11` (Kalman Velocity) and `E12` (HMM State) prior to decoding and injects strict negative constraints prohibiting bullish absorption / long scaling during `DOWNTREND` / `Distribution` / `Markdown`.
   - **`<1ms` Deterministic Fallback Override (`ClaimVerifier.apply_deterministic_fallback_override`)**: Whenever Pass-1 output fails `ClaimVerifier.verify()` (`CONTRADICTION` on `dominant_intent` or `counter_strategy`), the verifier deterministically patches only the contradicted fields from `E01–E13` in sub-millisecond latency without additional LLM round-trips (`max_retries=0`).

4. **Backend API & Institutional Dashboard (`main.py` & `qarc-web/`)**:
   - `analyze_bcp_endpoint()` in `main.py` (with FastAPI routes `GET /api/health` and `POST /api/bcp_analyze`) serves corporate-action-adjusted `E01–E13` ledgers, 4-engine quantitative telemetry, and field-level guardrail audit badges (`SUPPORTED`, `OVERRIDDEN`, `ABSTAINED`, `REJECTED`).
   - Next.js 15 dark-slate terminal (`qarc-web`) renders a 3-pane workspace: State-Space Price & HMM Regime Canvas (`lightweight-charts`), Quantitative Risk & Microstructure Anchors, and the BCP Dual-Persona Matrix & Claim Verifier Audit.

---

## 2. Dataset & Chronological SFT Split Inventory

| Artifact | Rows | Unique Tickers | Purpose |
| :--- | ---: | ---: | :--- |
| `data/raw_bhavcopy_data.csv` | 16,125 | 61 | Raw NSE EOD OHLCV & delivery percentage archive |
| `data/nse_bulk_block_deals_cache.csv` | 1,601 | 656 | Historical NSE Bulk & Block Deal institutional disclosures |
| `data/qarc_bcp_dataset_v2_raw.csv` | 13,796 | 59 | Generated raw BCP SFT corpus |
| `data/train.csv` | 9,189 | 59 | Chronological training split |
| `data/val.csv` | 1,218 | 58 | Chronological validation split |
| `data/test.csv` | 1,276 | 58 | Chronological out-of-sample test split (`11,683` validated rows total) |

---

## 3. Empirical Microstructure Factor Discovery (`discover_factors.py`)

Tested across **15,027** valid core NSE bars and an expanded **27,270**-bar NSE Bulk/Block Deal panel spanning **470** matched deal tickers (**872** matched deal days) via corporate-action-adjusted Bhavcopy archives:

| Factor ID & Name | Condition | Occurrences | Mean T+1 Return | Mean T+5 Return | T+5 Alpha vs Baseline | $t$-stat | $p$-value |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Factor 1**: Momentum Reversal / Short-Covering Inflection | `RSI > 60`, `Kalman Vel < 0`, `Deliv Z < 0` | 267 bars (1.8%) | `+0.21%` ($p=0.0295$) | `+0.46%` | **`+0.50%`** | `+2.39` | **`0.0170`** |
| **Factor 2**: Short-Covering Squeeze in Downtrend | `Ret > +1%`, `Deliv < 40%`, `Kalman Vel < -0.1` | 205 bars (1.4%) | `-0.07%` | `+0.56%` | **`+0.60%`** | `+2.53` | **`0.0116`** |
| **Factor 3**: Capitulation Washout | `RSI < 30`, `Vol Z > 1.5` | 243 bars (1.6%) | `+0.14%` | `+0.09%` | `+0.14%` | `+0.63` | `0.5292` |
| **Factor 4A**: Confirmed Institutional Block Absorption on Dips | `Net Buy Qty > 0`, `Ret <= 0%`, non-`Markdown` | 69 bars | `+0.42%` | `+1.00%` | `+0.35%` | `+0.39` | `0.6964` |
| **Factor 4B**: Bulk/Block Intraday Exhaustion Churn | `\|Net Deal Qty\| > 0`, `Ret > +1.0%`, `Deliv < 40%` | 384 bars | `+0.12%` | **`-0.81%`** | **`-1.45%`** (`59.9%` down) | **`-3.75`** | **`0.0002`** |

*Baseline comparison:* Core 15,027-bar universe Mean T+1 `-0.01%`, Mean T+5 `-0.04%`; 27,270-bar Bulk/Block Deal panel Mean T+1 `+0.13%`, Mean T+5 `+0.64%`.

---

## 4. Walk-Forward Out-of-Sample Backtest (`qarc_walk_forward_backtest.py`)

Evaluated causally (`warmup = 40` bars, zero look-ahead) across 8 liquid NSE large-cap tickers (`RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `ICICIBANK`, `KOTAKBANK`, `DRREDDY`, `SBIN`; 231 OOS bars per ticker after warmup) following **corporate-action backward split adjustment** (`adjust_corporate_actions`, fixing `KOTAKBANK` 1:5 split on `2026-01-14`, `TATAMOTORS`, and `VEDL`), **6.5% annualized T-bill cash sweep** on uninvested capital, and **15 bps (`0.0015`) NSE STT + brokerage/slippage drag** on turnover:

| Strategy | Total Return | Ann. Return | Ann. Vol | Sharpe Ratio | Max Drawdown | Calmar Ratio | Win Rate | Avg Weight | Active Bars |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Buy_and_Hold` | `-14.53%` | `-15.74%` | `13.59%` | `-1.67` | `-18.45%` | `-0.85` | `47.2%` | `100.0%` | `100.0%` |
| `SMA_20_Trend` | `-11.32%` | `-12.28%` | `7.23%` | `-2.67` | `-12.70%` | `-0.97` | `47.6%` | `45.7%` | `45.7%` |
| `RSI_Mean_Reversion` | `-8.51%` | `-9.24%` | `8.95%` | `-1.76` | `-12.50%` | `-0.74` | `50.6%` | `45.6%` | `45.6%` |
| **`Q_ARC_Sniper`** | **`+7.25%`** | **`+7.94%`** | **`1.33%`** | **`+0.86`** | **`-0.51%`** | **`+15.67`** | **`93.9%`** | `3.3%` | `3.8%` |
| **`Q_ARC_Balanced_Core`** | **`+6.99%`** | **`+7.65%`** | **`1.99%`** | **`+0.45`** | **`-0.59%`** | **`+13.00`** | **`72.7%`** | `9.3%` | **`17.9%`** |

### Per-Ticker Out-of-Sample Performance (8/8 Tickers Positive for Both Q-ARC Tiers)

| Ticker | Bars | Buy & Hold | `Q_ARC_Sniper` | `Q_ARC_Balanced_Core` | Sniper Alpha vs B&H |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `RELIANCE` | 231 | `-19.90%` | `+6.25%` | `+0.40%` | `+26.15%` |
| `TCS` | 231 | `-32.41%` | `+10.51%` | `+13.29%` | `+42.92%` |
| `INFY` | 231 | `-32.85%` | `+6.54%` | `+9.19%` | `+39.39%` |
| `HDFCBANK` | 231 | `-28.72%` | `+3.85%` | `+3.27%` | `+32.56%` |
| `ICICIBANK` | 231 | `-2.77%` | `+2.79%` | `+0.22%` | `+5.56%` |
| `KOTAKBANK` | 231 | `+2.54%` | `+13.92%` | `+11.46%` | `+11.38%` |
| `DRREDDY` | 231 | `-3.07%` | `+6.62%` | `+7.46%` | `+9.69%` |
| `SBIN` | 231 | `-1.65%` | `+7.65%` | `+10.79%` | `+9.29%` |

- **Paired $t$-test vs `Buy_and_Hold`**:
  - `Q_ARC_Sniper`: $t = +1.689$, $p = 0.0925$
  - `Q_ARC_Balanced_Core`: $t = +1.753$, $p = 0.0809$

---

## 5. Stratified OOS LLM Reliability & Epistemic Audit (`benchmark_llm_reliability.py --stratified-30`)

Evaluated across **30 stratified OOS bars** (**210 evaluated fields**, 10 `Markup` + 10 `Accumulation` + 10 `Markdown` across **26 distinct NSE tickers** from `data/test.csv`), auditing the **actual cached historical LLM completions** stored in `data/test.csv` (`output` column) before and after the deterministic Claim Verifier guardrail (`data/llm_reliability_audit_manifest.json`):

| Metric | Ratio | Point Estimate | Wilson 95% CI |
| :--- | :--- | ---: | :--- |
| Trials Evaluated | `30 / 30` trials (`26` tickers) | `100.0%` | — |
| **Raw Pass-1 Field Contradiction Rate** | `42 / 210` fields | **`20.0%`** | `[15.2%, 25.9%]` |
| **Post-Guardrail Field Contradiction Rate** | `0 / 210` fields | **`0.0%`** | `[0.0%, 1.8%]` |
| Post-Guardrail Trial Rejection Rate | `0 / 30` trials | `0.0%` | `[0.0%, 11.4%]` |
| Evidence Coverage Rate (`SUPPORTED`) | `139 / 210` fields | `66.2%` | `[59.6%, 72.2%]` |
| Prudent Abstention Rate (`E08`/`E09` Unverified) | `71 / 210` fields | `33.8%` | `[27.8%, 40.4%]` |
| `E09` L2/L3 Refusal Accuracy | `30 / 30` trials | `100.0%` | `[88.6%, 100.0%]` |

---

## 6. Mathematical & Guardrail Verification Suite (`test_numerical_engines.py`)

**13 / 13** automated numerical & neuro-symbolic regression tests passing:
1. GARCH Units & Annualization
2. GARCH Edge Cases & Circuit Shocks
3. Kalman State-Space Stability
4. Kalman Flatline & NaN Handling
5. HMM Zero Look-Ahead Leakage
6. HMM Probability Calibration & Entropy
7. Monte Carlo Quantile Monotonicity ($\text{CVaR}_{95} \le \text{VaR}_{95} \le \text{Median}$)
8. Monte Carlo Multi-Factor Position Sizing
9. Integrated Quant Engines Execution
10. Corporate Action 1:5 Split Adjuster (`< 1e-6` split-day return & no GARCH spike)
11. Regime Exposure Gate & 60D Hurst Routing
12. Claim Verifier `<5ms` Deterministic Override (`0` post-guardrail contradictions)
13. Factor 4B Evidence Injection & Intraday Exhaustion Verifier Override

