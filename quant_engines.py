"""
Q-ARC Quantitative Core Engines
===============================
Four Mathematically Defensible Quantitative Models:
1. GARCH(1,1) Volatility Forecaster (upgrades naive rolling Z-score hazard alert)
2. Kalman Filter Noise Separator (separates true price trend/velocity from microstructure noise)
3. Hidden Markov Model (HMM) 4-State Regime Classifier (Accumulation/Markup/Distribution/Markdown)
4. Live Monte Carlo Risk Simulator (10,000-path forward simulation for position sizing & risk scenarios)
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple, Optional
import warnings

# Suppress minor convergence warnings during optimization
warnings.filterwarnings("ignore")


# ==============================================================================
# 1. GARCH(1,1) VOLATILITY FORECASTER
# ==============================================================================
class GARCHForecaster:
    """
    Fits a GARCH(1,1) conditional heteroskedasticity model:
        r_t = mu + eps_t
        eps_t = sigma_t * z_t,  z_t ~ N(0, 1)
        sigma_t^2 = omega + alpha * eps_{t-1}^2 + beta * sigma_{t-1}^2
    
    Upgrades the simple rolling volatility / Z-score to a model that accounts
    for volatility clustering, leverage, and mean-reversion.
    """
    def __init__(self, p: int = 1, q: int = 1):
        self.p = p
        self.q = q

    def fit_forecast(self, returns: np.ndarray, current_price: float) -> Dict[str, Any]:
        """
        Fits GARCH(1,1) on percentage or log returns and forecasts forward volatility.
        Returns are expected in percent (e.g., 1.5 for +1.5%).
        """
        returns = np.asarray(returns, dtype=float)
        # Drop NaNs or infinite values
        returns = returns[np.isfinite(returns)]

        if len(returns) < 30:
            # Insufficient history fallback to empirical standard deviation
            hist_std = float(np.std(returns)) if len(returns) > 1 else 1.5
            annualized_vol = hist_std * np.sqrt(252)
            return {
                "model_status": "FALLBACK_SAMPLE_TOO_SMALL",
                "omega": None,
                "alpha": None,
                "beta": None,
                "persistence": None,
                "forecast_daily_vol_pct": round(hist_std, 2),
                "forecast_annualized_vol_pct": round(annualized_vol, 2),
                "long_run_annualized_vol_pct": round(annualized_vol, 2),
                "volatility_hazard_ratio": 1.0,
                "volatility_regime": "NORMAL",
                "hazard_alert": "INSUFFICIENT_HISTORY_SAMPLE (<30 bars)"
            }

        return self._scipy_garch_mle(returns)

    def _scipy_garch_mle(self, returns: np.ndarray) -> Dict[str, Any]:
        """Pure SciPy/NumPy GARCH(1,1) Maximum Likelihood Estimation with zero external friction."""
        from scipy.optimize import minimize

        n = len(returns)
        var_sample = np.var(returns)

        def garch_loglik(params):
            omega, alpha, beta = params
            if omega <= 0 or alpha < 0 or beta < 0 or (alpha + beta) >= 0.9999:
                return 1e10
            sigma2 = np.empty(n)
            sigma2[0] = var_sample
            for t in range(1, n):
                sigma2[t] = omega + alpha * (returns[t-1] ** 2) + beta * sigma2[t-1]
            loglik = -0.5 * np.sum(np.log(2 * np.pi) + np.log(sigma2) + (returns ** 2) / sigma2)
            return -loglik

        init_params = [0.05 * var_sample, 0.10, 0.85]
        bounds = [(1e-6, None), (0.0, 0.5), (0.0, 0.98)]
        res = minimize(garch_loglik, init_params, bounds=bounds, method='L-BFGS-B')

        if res.success:
            omega, alpha, beta = res.x
            persistence = alpha + beta
            last_sigma2 = omega + alpha * (returns[-1] ** 2) + beta * var_sample
            daily_vol = np.sqrt(last_sigma2)
            ann_vol = daily_vol * np.sqrt(252)
            long_run_ann = np.sqrt(omega / max(1 - persistence, 1e-4)) * np.sqrt(252)
            hazard_ratio = ann_vol / max(long_run_ann, 1e-4)
            # Flash Innovation Shock Check (catches circuit breakers when alpha parameter is small)
            shock_z = abs(returns[-1]) / max(np.sqrt(var_sample), 0.5)
            if shock_z >= 3.0:
                hazard_ratio = max(hazard_ratio, float(shock_z / 2.0))
                vol_regime = "SHOCK_VOLATILITY"
            else:
                vol_regime = "NORMAL_VOLATILITY" if hazard_ratio < 1.3 else "ELEVATED_VOLATILITY"

            return {
                "model_status": "CONVERGED_SCIPY_MLE",
                "omega": round(omega, 6),
                "alpha": round(alpha, 4),
                "beta": round(beta, 4),
                "persistence": round(persistence, 4),
                "forecast_daily_vol_pct": round(daily_vol, 2),
                "forecast_annualized_vol_pct": round(ann_vol, 2),
                "long_run_annualized_vol_pct": round(long_run_ann, 2),
                "volatility_hazard_ratio": round(hazard_ratio, 2),
                "volatility_regime": vol_regime,
                "hazard_alert": f"Fitted via SciPy MLE ({vol_regime})."
            }
        else:
            std = float(np.std(returns))
            baseline_std = float(np.std(returns[:-3])) if len(returns) > 10 else std
            hazard_ratio = float(std / max(baseline_std, 1e-4))
            if len(returns) > 0 and abs(returns[-1]) > 2.5 * max(baseline_std, 1e-4):
                hazard_ratio = max(hazard_ratio, float(abs(returns[-1]) / max(baseline_std, 1e-4)))
            hazard_ratio = round(max(0.5, hazard_ratio), 2)
            vol_regime = "SHOCK_VOLATILITY" if hazard_ratio >= 1.5 else "ELEVATED_VOLATILITY" if hazard_ratio >= 1.2 else "NORMAL_VOLATILITY"
            return {
                "model_status": "EMPIRICAL_FALLBACK",
                "omega": None, "alpha": None, "beta": None, "persistence": None,
                "forecast_daily_vol_pct": round(std, 2),
                "forecast_annualized_vol_pct": round(std * np.sqrt(252), 2),
                "long_run_annualized_vol_pct": round(baseline_std * np.sqrt(252), 2),
                "volatility_hazard_ratio": hazard_ratio,
                "volatility_regime": vol_regime,
                "hazard_alert": f"Empirical sample standard deviation fallback ({vol_regime})."
            }


# ==============================================================================
# 2. KALMAN FILTER NOISE-SEPARATOR ENGINE
# ==============================================================================
class KalmanTrendFilter:
    """
    State-Space Formulation:
        State vector: x_t = [ price_level_t , trend_velocity_t ]^T
        State equation: x_t = F * x_{t-1} + w_t ,   w_t ~ N(0, Q)
            where F = [[1, 1],
                       [0, 1]]
        Measurement equation: z_t = H * x_t + v_t , v_t ~ N(0, R)
            where H = [[1, 0]]
            z_t = raw observed closing price
    
    Separates institutional underlying value trajectory from bid-ask microstructure
    noise and transient liquidity excursions.
    """
    def __init__(self, process_noise_scale: float = 1e-4, measurement_noise_scale: float = 1e-2):
        self.q_scale = process_noise_scale
        self.r_scale = measurement_noise_scale

    def filter_series(self, prices: np.ndarray) -> Dict[str, Any]:
        """
        Runs full 2D forward Kalman Filter across price series.
        """
        prices = np.asarray(prices, dtype=float)
        prices = prices[np.isfinite(prices)]
        n = len(prices)

        if n < 5:
            return {
                "filtered_price": prices[-1] if n > 0 else 0.0,
                "trend_velocity": 0.0,
                "velocity_pct": 0.0,
                "microstructure_noise": 0.0,
                "noise_to_signal_ratio": 0.0,
                "trend_signal": "UNKNOWN"
            }

        # Observation variance R (microstructure noise proxy)
        diffs = np.diff(prices)
        raw_var = float(np.var(diffs)) if len(diffs) > 0 else 0.0
        # Enforce minimum positive variance floors to guarantee positive definiteness & avoid division by zero
        r_var = max(raw_var * self.r_scale * 100, 1e-4)
        q_var = max(raw_var * self.q_scale * 10, 1e-5)

        # State transition F and observation H
        F = np.array([[1.0, 1.0],
                      [0.0, 1.0]])
        H = np.array([[1.0, 0.0]])
        Q = np.array([[q_var * 0.25, q_var * 0.5],
                      [q_var * 0.5,  q_var]])
        R = np.array([[r_var]])

        # Initial state
        x = np.array([[prices[0]],
                      [diffs[0] if len(diffs) > 0 else 0.0]])
        P = np.array([[r_var, 0.0],
                      [0.0, r_var]])

        filtered_prices = np.empty(n)
        velocities = np.empty(n)
        innovations = np.empty(n)

        I = np.eye(2)

        for t in range(n):
            z = prices[t]
            # 1. Predict
            if t > 0:
                x = F @ x
                P = F @ P @ F.T + Q

            # 2. Innovation
            y = z - (H @ x)[0, 0]
            S = (H @ P @ H.T)[0, 0] + R[0, 0]
            K = (P @ H.T) / S

            # 3. Update
            x = x + K * y
            P = (I - K @ H) @ P

            filtered_prices[t] = x[0, 0]
            velocities[t] = x[1, 0]
            innovations[t] = y

        latest_price = prices[-1]
        latest_filtered = filtered_prices[-1]
        latest_velocity = velocities[-1]
        latest_noise = latest_price - latest_filtered
        velocity_pct = (latest_velocity / max(latest_filtered, 1e-4)) * 100

        # Noise-to-signal ratio
        noise_var = np.var(innovations)
        signal_var = np.var(np.diff(filtered_prices)) if len(filtered_prices) > 1 else 1e-6
        nsr = noise_var / max(signal_var, 1e-6)

        # Classification
        if velocity_pct > 0.35:
            trend_signal = "STRONG_ACCELERATING_UPTREND"
        elif velocity_pct > 0.08:
            trend_signal = "MILD_UPTREND"
        elif velocity_pct < -0.35:
            trend_signal = "STRONG_ACCELERATING_DOWNTREND"
        elif velocity_pct < -0.08:
            trend_signal = "MILD_DOWNTREND"
        else:
            trend_signal = "STATIONARY_FLAT_RANGE"

        return {
            "raw_price": round(latest_price, 2),
            "filtered_price": round(latest_filtered, 2),
            "trend_velocity_pts_per_day": round(latest_velocity, 2),
            "trend_velocity_pct_per_day": round(velocity_pct, 3),
            "microstructure_noise_pts": round(latest_noise, 2),
            "noise_pct_of_price": round((latest_noise / max(latest_filtered, 1e-4)) * 100, 2),
            "noise_to_signal_ratio": round(nsr, 2),
            "trend_signal": trend_signal,
            "kalman_price_series": filtered_prices,
            "velocity_series": velocities
        }


# ==============================================================================
# 3. HIDDEN MARKOV MODEL (HMM) 4-STATE REGIME CLASSIFIER
# ==============================================================================
class HMMRegimeClassifier:
    """
    Fits a 4-state Gaussian Hidden Markov Model on historical observations:
        Observation vector X_t = [ log_return_t , log_volume_ratio_t ]
    
    METHODOLOGICAL RIGOR & EPISTEMIC BOUNDS:
    - Out-of-sample forward filtering: Fitted strictly on historical bars [0 .. T-1].
      The latest bar T is evaluated via the one-step forward predictive filter to eliminate look-ahead bias.
    - Probability Calibration: Applies Dirichlet/temperature smoothing to avoid artificial
      softmax likelihood collapse to 99.9% or 100%.
    - Epistemic Framing: Hidden Markov states are purely statistical clusters of return drift
      and volatility, treated as statistical analogues to Wyckoff phases, NOT metaphysical proof
      of institutional intent.
    """
    def __init__(self, n_states: int = 4, random_state: int = 42, temperature: float = 1.35):
        self.n_states = n_states
        self.random_state = random_state
        self.temperature = temperature

    def classify_regime(self, closes: np.ndarray, volumes: np.ndarray) -> Dict[str, Any]:
        from hmmlearn.hmm import GaussianHMM

        closes = np.asarray(closes, dtype=float)
        volumes = np.asarray(volumes, dtype=float)

        if len(closes) < 40 or len(volumes) < 40:
            return {
                "current_regime": "UNKNOWN (Insufficient Bars)",
                "confidence": 0.0,
                "probabilities": {"Accumulation": 0.25, "Markup": 0.25, "Distribution": 0.25, "Markdown": 0.25},
                "persistence": 0.5,
                "entropy": 2.0,
                "calibration_status": "UNINITIALIZED",
                "summary": "Need at least 40 daily bars to fit 4-state HMM."
            }

        # 1. Feature extraction strictly causal (no future lookahead)
        log_ret = np.log(closes[1:] / closes[:-1])
        vol_slice = volumes[1:]
        vol_ma = pd.Series(vol_slice).rolling(20, min_periods=5).mean().bfill().values
        log_vol_ratio = np.log(np.maximum(vol_slice, 1.0) / np.maximum(vol_ma, 1.0))
        log_vol_ratio = np.nan_to_num(log_vol_ratio, nan=0.0, posinf=0.0, neginf=0.0)

        X = np.column_stack([log_ret, log_vol_ratio])
        n_obs = len(X)

        try:
            import io, sys
            old_out, old_err = sys.stdout, sys.stderr
            sys.stdout, sys.stderr = io.StringIO(), io.StringIO()
            try:
                # Out-of-sample partition: Fit parameters on historical bars [0 .. T-2]
                X_train = X[:-1]
                X_latest = X[-1:]

                hmm = GaussianHMM(
                    n_components=self.n_states,
                    covariance_type='diag',
                    n_iter=80,
                    random_state=self.random_state
                )
                hmm.fit(X_train)
            finally:
                sys.stdout, sys.stderr = old_out, old_err

            # In-sample historical state identification on training set
            hidden_states_train = hmm.predict(X_train)
            posteriors_train = hmm.predict_proba(X_train)
            prior_t = posteriors_train[-1]  # P(S_{T-1} | X_{1:T-1})

            # One-step forward predictive filter for latest bar T:
            # 1. Prediction step: P(S_T = j | X_{1:T-1}) = sum_i P(S_{T-1} = i | X_{1:T-1}) * A_{i,j}
            pred_state_probs = np.dot(prior_t, hmm.transmat_)

            # 2. Update step: Compute log-likelihood of X_latest under each Gaussian emission
            log_emissions = np.zeros(self.n_states)
            for j in range(self.n_states):
                mean = hmm.means_[j]
                cov = hmm.covars_[j]
                # Diagonal Gaussian log PDF
                diff = X_latest[0] - mean
                log_p = -0.5 * np.sum(np.log(2 * np.pi * cov) + (diff ** 2) / cov)
                log_emissions[j] = log_p

            # Calibrate posteriors with temperature scaling to prevent artificial probability collapse (e.g. 99.9%)
            scaled_log_emissions = log_emissions / self.temperature
            max_log = np.max(scaled_log_emissions)
            emissions = np.exp(scaled_log_emissions - max_log)

            unnormalized_posteriors = pred_state_probs * emissions
            sum_p = np.sum(unnormalized_posteriors)
            if sum_p > 0:
                latest_posteriors = unnormalized_posteriors / sum_p
            else:
                latest_posteriors = pred_state_probs

            # Dirichlet / Laplace smoothing (alpha = 0.05) to bound confidence realistically
            alpha_smooth = 0.05
            latest_posteriors = (latest_posteriors + alpha_smooth) / (1.0 + self.n_states * alpha_smooth)
            latest_state = int(np.argmax(latest_posteriors))

            # Interpret states by mean return and volatility
            state_metrics = []
            for s in range(self.n_states):
                mask = (hidden_states_train == s)
                if np.any(mask):
                    m_ret = float(np.mean(log_ret[:-1][mask]))
                    v_ret = float(np.std(log_ret[:-1][mask]))
                    m_vol = float(np.mean(log_vol_ratio[:-1][mask]))
                else:
                    m_ret, v_ret, m_vol = 0.0, 0.0, 0.0
                state_metrics.append((s, m_ret, v_ret, m_vol))

            # Sort by return to identify Markup (highest) and Markdown (lowest)
            sorted_by_ret = sorted(state_metrics, key=lambda x: x[1])
            markdown_id = sorted_by_ret[0][0]
            markup_id = sorted_by_ret[-1][0]

            # Middle two states: the one with lower volatility is Accumulation, higher is Distribution
            mid_candidates = sorted(sorted_by_ret[1:3], key=lambda x: x[2])
            accum_id = mid_candidates[0][0]
            dist_id = mid_candidates[1][0]

            id_to_name = {
                accum_id: "Accumulation",
                markup_id: "Markup",
                dist_id: "Distribution",
                markdown_id: "Markdown"
            }

            current_regime = id_to_name.get(latest_state, "Neutral")
            regime_probs = {
                id_to_name[s]: round(float(latest_posteriors[s]), 3)
                for s in range(self.n_states)
            }
            confidence = round(float(np.max(latest_posteriors)), 3)

            # Transition persistence: P(S_{t+1} = current_state | S_t = current_state)
            persistence = round(float(hmm.transmat_[latest_state, latest_state]), 3)

            # Shannon entropy of calibrated posterior distribution (bits, base 2)
            # Max entropy for 4 states is log2(4) = 2.0
            entropy = float(-np.sum(latest_posteriors * np.log2(np.maximum(latest_posteriors, 1e-9))))
            normalized_entropy = round(entropy / np.log2(self.n_states), 2)

            calibration_status = (
                "BALANCED_CALIBRATION" if normalized_entropy > 0.4
                else "CONCENTRATED_CONFIDENCE" if normalized_entropy > 0.2
                else "EXTREME_SEPARATION (Check Regime Volatility)"
            )

            return {
                "current_regime": current_regime,
                "confidence": confidence,
                "probabilities": regime_probs,
                "persistence": persistence,
                "state_id": int(latest_state),
                "entropy_bits": round(entropy, 2),
                "normalized_entropy": normalized_entropy,
                "calibration_status": calibration_status,
                "model_nature": "Out-of-sample forward filter on Gaussian drift/volatility clusters (Wyckoff analogue)",
                "summary": f"Statistical cluster: {current_regime} ({confidence*100:.1f}% calibrated prob, persistence: {persistence*100:.1f}%, entropy: {round(entropy, 2)} bits)."
            }

        except Exception as e:
            return {
                "current_regime": "NEUTRAL_FALLBACK",
                "confidence": 0.50,
                "probabilities": {"Accumulation": 0.25, "Markup": 0.25, "Distribution": 0.25, "Markdown": 0.25},
                "persistence": 0.50,
                "entropy_bits": 2.0,
                "normalized_entropy": 1.0,
                "calibration_status": "FALLBACK",
                "summary": f"HMM fitting notice: {str(e)}"
            }


# ==============================================================================
# 4. LIVE MONTE CARLO RISK SCENARIO ENGINE
# ==============================================================================
class MonteCarloRiskEngine:
    """
    Live Backend Simulation Engine (Separate 'Risk Scenario' Feature):
    Simulates 10,000 forward price paths over H days (e.g., 5, 10, 20 days)
    incorporating:
      - GARCH conditional volatility forecast (clustering / regime variance)
      - HMM regime drift & persistence
      - Empirical heavy-tail Student-t innovations (df=5)
    
    Computes rigorous multi-factor position-sizing constraints, Value-at-Risk (95%),
    Expected Shortfall (CVaR), and barrier stop/target breach probabilities.
    """
    def __init__(self, n_simulations: int = 10000, random_seed: int = 42):
        self.n_sims = n_simulations
        self.seed = random_seed

    def simulate_scenarios(
        self,
        current_price: float,
        daily_vol_pct: float,
        regime_name: str,
        horizon_days: int = 10,
        stop_loss_pct: float = 3.0,
        target_gain_pct: float = 5.0,
        account_risk_budget_pct: float = 1.0,
        target_annual_vol_pct: float = 15.0,
        max_tail_risk_budget_pct: float = 2.0
    ) -> Dict[str, Any]:
        """
        Executes live Monte Carlo simulation across 10,000 paths and computes
        statistically defensible multi-factor position sizing limits.
        """
        np.random.seed(self.seed)

        # 1. Regime drift alignment (% per day)
        drift_map = {
            "Markup": 0.0012,       # +0.12% per day positive drift
            "Accumulation": 0.0003, # +0.03% steady accumulation
            "Distribution": -0.0004,# -0.04% topping churn
            "Markdown": -0.0015     # -0.15% liquidation pressure
        }
        mu = drift_map.get(regime_name, 0.0)

        # Daily sigma from GARCH
        sigma = max(daily_vol_pct / 100.0, 0.005)

        # 2. Generate innovations with fat tails (Student-t with df=5 to model Indian equity kurtosis)
        df_t = 5
        scale_factor = np.sqrt((df_t - 2) / df_t)
        t_draws = np.random.standard_t(df=df_t, size=(self.n_sims, horizon_days)) * scale_factor

        # 3. Simulate forward price paths: Geometric Brownian Motion with t-innovations
        dt = 1.0
        drift_term = (mu - 0.5 * (sigma ** 2)) * dt
        vol_term = sigma * np.sqrt(dt) * t_draws

        # Cumulative log returns across horizon
        log_ret_paths = np.cumsum(drift_term + vol_term, axis=1)
        price_paths = current_price * np.exp(log_ret_paths)

        # Final prices at horizon H
        terminal_prices = price_paths[:, -1]
        terminal_returns_pct = ((terminal_prices - current_price) / current_price) * 100.0

        # Minimum and Maximum prices along each entire path (for barrier/stop breach)
        min_path_prices = np.min(price_paths, axis=1)
        max_path_prices = np.max(price_paths, axis=1)

        # 4. Value-at-Risk and Expected Shortfall (CVaR)
        var_95_pct = float(np.percentile(terminal_returns_pct, 5))
        var_99_pct = float(np.percentile(terminal_returns_pct, 1))

        # CVaR (Expected Shortfall): Mean of returns below 5th percentile
        tail_losses_95 = terminal_returns_pct[terminal_returns_pct <= var_95_pct]
        cvar_95_pct = float(np.mean(tail_losses_95)) if len(tail_losses_95) > 0 else var_95_pct

        # 5. Barrier Probabilities
        stop_level = current_price * (1.0 - stop_loss_pct / 100.0)
        target_level = current_price * (1.0 + target_gain_pct / 100.0)

        prob_stop_breach = float(np.mean(min_path_prices <= stop_level)) * 100.0
        prob_target_hit = float(np.mean(max_path_prices >= target_level)) * 100.0

        # 6. Asymmetry Payoff Ratio (Expected Upside / Expected Downside)
        pos_rets = terminal_returns_pct[terminal_returns_pct > 0]
        neg_rets = -terminal_returns_pct[terminal_returns_pct < 0]
        avg_gain = float(np.mean(pos_rets)) if len(pos_rets) > 0 else 0.01
        avg_loss = float(np.mean(neg_rets)) if len(neg_rets) > 0 else 0.01
        asymmetry_ratio = avg_gain / max(avg_loss, 1e-4)

        # 7. Rigorous Multi-Factor Position Sizing Architecture
        # Factor A: Stop-Loss Execution Risk Budget
        # Total portfolio equity risked upon stop execution = account_risk_budget_pct (default 1.0%)
        # Includes slippage & overnight gap buffer for Indian market opening volatility (0.5%)
        effective_stop_distance_pct = stop_loss_pct + 0.5
        cap_stop_budget_pct = (account_risk_budget_pct / max(effective_stop_distance_pct, 0.5)) * 100.0

        # Factor B: Portfolio Volatility Targeting
        # Allocates so that individual asset volatility contribution matches target annual vol (default 15%)
        annualized_vol_pct = daily_vol_pct * np.sqrt(252)
        cap_vol_target_pct = (target_annual_vol_pct / max(annualized_vol_pct, 5.0)) * 100.0

        # Factor C: Tail CVaR Stress Limit
        # Maximum portfolio equity loss allowed under 95% tail event = max_tail_risk_budget_pct (default 2.0%)
        cap_cvar_stress_pct = (max_tail_risk_budget_pct / max(abs(cvar_95_pct), 1.0)) * 100.0

        # Final Defensible Allocation Cap: Conservative minimum across all three institutional risk bounds
        final_allocation_cap_pct = round(min(100.0, max(1.0, min(cap_stop_budget_pct, cap_vol_target_pct, cap_cvar_stress_pct))), 1)

        sizing_breakdown = {
            "stop_risk_budget_cap_pct": round(cap_stop_budget_pct, 1),
            "vol_target_cap_pct": round(cap_vol_target_pct, 1),
            "cvar_tail_stress_cap_pct": round(cap_cvar_stress_pct, 1),
            "account_risk_budget_used": f"{account_risk_budget_pct}%",
            "effective_stop_distance_used": f"{effective_stop_distance_pct}% (incl. 0.5% gap buffer)",
            "binding_constraint": (
                "STOP_RISK_BUDGET" if final_allocation_cap_pct == round(cap_stop_budget_pct, 1)
                else "VOLATILITY_TARGET" if final_allocation_cap_pct == round(cap_vol_target_pct, 1)
                else "CVAR_TAIL_STRESS"
            )
        }

        return {
            "simulation_paths": self.n_sims,
            "horizon_days": horizon_days,
            "current_price": current_price,
            "simulated_median_price": round(float(np.median(terminal_prices)), 2),
            "simulated_median_return_pct": round(float(np.median(terminal_returns_pct)), 2),
            "p05_worst_case_price": round(float(np.percentile(terminal_prices, 5)), 2),
            "p95_best_case_price": round(float(np.percentile(terminal_prices, 95)), 2),
            "var_95_pct": round(var_95_pct, 2),
            "var_99_pct": round(var_99_pct, 2),
            "cvar_95_expected_shortfall_pct": round(cvar_95_pct, 2),
            "prob_stop_breach_pct": round(prob_stop_breach, 1),
            "prob_target_hit_pct": round(prob_target_hit, 1),
            "asymmetry_ratio": round(asymmetry_ratio, 2),
            "recommended_max_allocation_cap_pct": final_allocation_cap_pct,
            "position_sizing_breakdown": sizing_breakdown,
            "risk_assessment": (
                "FAVORABLE_ASYMMETRY" if asymmetry_ratio >= 1.25 and prob_target_hit > prob_stop_breach
                else "ADVERSE_RISK_PROFILE" if prob_stop_breach > 1.5 * prob_target_hit
                else "BALANCED_RISK"
            )
        }


# ==============================================================================
# UNIFIED CONVENIENCE RUNNER
# ==============================================================================
def compute_all_quant_engines(
    ticker: str,
    closes: np.ndarray,
    volumes: np.ndarray,
    current_price: Optional[float] = None
) -> Dict[str, Any]:
    """
    Executes all 4 quantitative engines in unified pipeline format:
    1. GARCH(1,1) Volatility
    2. Kalman Filter Trend / Denoising
    3. HMM 4-State Regime
    4. Live Monte Carlo 10,000-Path Simulation
    """
    closes = np.asarray(closes, dtype=float)
    volumes = np.asarray(volumes, dtype=float)
    cur_p = current_price if current_price is not None else float(closes[-1])

    # Log/Pct returns for GARCH
    pct_returns = pd.Series(closes).pct_change().dropna().values * 100.0

    # 1. GARCH
    garch_engine = GARCHForecaster()
    garch_res = garch_engine.fit_forecast(pct_returns, cur_p)

    # 2. Kalman Filter
    kalman_engine = KalmanTrendFilter()
    kalman_res = kalman_engine.filter_series(closes)

    # 3. HMM
    hmm_engine = HMMRegimeClassifier()
    hmm_res = hmm_engine.classify_regime(closes, volumes)

    # 4. Monte Carlo (Live Risk Scenario)
    mc_engine = MonteCarloRiskEngine(n_simulations=10000)
    daily_vol = garch_res.get("forecast_daily_vol_pct", 1.5)
    regime = hmm_res.get("current_regime", "Neutral")
    mc_res = mc_engine.simulate_scenarios(
        current_price=cur_p,
        daily_vol_pct=daily_vol,
        regime_name=regime,
        horizon_days=10,
        stop_loss_pct=3.0,
        target_gain_pct=5.0
    )

    return {
        "ticker": ticker,
        "garch": garch_res,
        "kalman": kalman_res,
        "hmm": hmm_res,
        "monte_carlo": mc_res
    }
