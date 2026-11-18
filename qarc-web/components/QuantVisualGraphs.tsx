"use client";

import React, { useId, useMemo, useState } from "react";
import type { SeriesPoint } from "@/components/StateSpaceChart";
import type { SecurityData } from "@/lib/qarcApi";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function parseFirstNumber(text?: string): number | null {
  if (!text) return null;
  const m = text.match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function regimeHex(regime: string): string {
  const u = (regime || "").toUpperCase();
  if (u.includes("MARKUP")) return "#D2FF00";
  if (u.includes("ACCUMULATION")) return "#10B981";
  if (u.includes("DISTRIBUTION")) return "#F59E0B";
  if (u.includes("MARKDOWN")) return "#FF3B5C";
  return "#A1A1AA";
}

// ============================================================================
// 1. 8D STATE-SPACE SPIDER / RADAR FINGERPRINT
// ============================================================================
export function StateSpaceRadar8dSvg({ security }: { security: SecurityData }) {
  const gradId = useId();
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);

  const axes = useMemo(() => {
    const series = security.series || [];
    const last = series.length ? series[series.length - 1] : undefined;
    const prev = series.length >= 2 ? series[series.length - 2] : undefined;

    const e01Ret =
      last && prev && prev.close > 0
        ? ((last.close - prev.close) / prev.close) * 100
        : parseFirstNumber(security.evidence_ledger?.E01?.description) ?? 0;

    const vel = Number(security.quant_anchors.kalman.trend_velocity_pct_per_day || 0);
    const nsr = Math.max(0, Number(security.quant_anchors.kalman.noise_to_signal_ratio ?? 1));
    const snrNorm = clamp(1 / (1 + nsr), 0.06, 0.98);
    const hazard = Math.max(0.5, Number(security.quant_anchors.garch.volatility_hazard_ratio || 1));
    const garchCalm = clamp((1 / hazard) * 0.65, 0.06, 0.98);
    const hurst = clamp(Number(security.hurst_60d ?? 0.5), 0.1, 0.9);

    const deliv =
      last?.delivery_pct ??
      parseFirstNumber(security.evidence_ledger?.E03?.description) ??
      50;
    const rsi =
      last?.rsi_14 ??
      parseFirstNumber(security.evidence_ledger?.E07?.description) ??
      50;
    const hmmConf = clamp(Number(security.quant_anchors.hmm.confidence || 0.5), 0.05, 0.98);

    return [
      {
        label: "1D RET",
        norm: clamp(0.5 + e01Ret / 6, 0.06, 0.98),
        rawText: `${e01Ret >= 0 ? "+" : ""}${e01Ret.toFixed(2)}%`,
      },
      {
        label: "KALMAN VEL",
        norm: clamp(0.5 + vel / 1.0, 0.06, 0.98),
        rawText: `${vel >= 0 ? "+" : ""}${vel.toFixed(3)}%/d`,
      },
      {
        label: "SIGNAL SNR",
        norm: snrNorm,
        rawText: `NSR ${nsr.toFixed(2)}`,
      },
      {
        label: "GARCH CALM",
        norm: garchCalm,
        rawText: `${hazard.toFixed(2)}x haz`,
      },
      {
        label: "HURST 60D",
        norm: hurst,
        rawText: `H ${hurst.toFixed(2)}`,
      },
      {
        label: "DELIVERY %",
        norm: clamp(deliv / 100, 0.06, 0.98),
        rawText: `${deliv.toFixed(1)}%`,
      },
      {
        label: "RSI(14)",
        norm: clamp(rsi / 100, 0.06, 0.98),
        rawText: `${rsi.toFixed(1)}`,
      },
      {
        label: "HMM CONF",
        norm: hmmConf,
        rawText: `${(hmmConf * 100).toFixed(1)}%`,
      },
    ];
  }, [security]);

  const cx = 190;
  const cy = 128;
  const maxR = 82;
  const n = axes.length;

  const vertexPoint = (idx: number, ratio: number): [number, number] => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
    return [cx + Math.cos(angle) * maxR * ratio, cy + Math.sin(angle) * maxR * ratio];
  };

  const ringPoints = (ratio: number) =>
    axes.map((_, i) => vertexPoint(i, ratio).map((v) => v.toFixed(1)).join(",")).join(" ");

  const dataCoords = axes.map((a, i) => vertexPoint(i, a.norm));
  const dataPolygon = dataCoords.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const focused = hoveredAxis !== null ? axes[hoveredAxis] : null;

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          8D FINGERPRINT // <strong className="text-[#D2FF00]">{security.ticker}</strong>
        </span>
        <span className="text-zinc-300">
          {focused ? `${focused.label}: ${focused.rawText}` : "HOVER VERTEX TO INSPECT · 0.50 REF DASHED"}
        </span>
      </div>

      <svg
        viewBox="0 0 380 256"
        className="h-[235px] w-full select-none"
        role="img"
        aria-label="8-axis state-space radar fingerprint"
      >
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#D2FF00" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#D2FF00" stopOpacity="0.08" />
          </radialGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1.0].map((r) => (
          <polygon
            key={r}
            points={ringPoints(r)}
            fill="none"
            stroke={r === 0.5 ? "#D2FF00" : "#23262D"}
            strokeOpacity={r === 0.5 ? 0.35 : 1}
            strokeWidth={r === 0.5 ? 1.1 : 1}
            strokeDasharray={r === 0.5 ? "3 3" : undefined}
          />
        ))}

        {axes.map((a, i) => {
          const [ex, ey] = vertexPoint(i, 1.0);
          const [lx, ly] = vertexPoint(i, 1.21);
          const anchor =
            lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";
          const isActive = hoveredAxis === i;
          return (
            <g key={a.label}>
              <line
                x1={cx}
                y1={cy}
                x2={ex}
                y2={ey}
                stroke="#23262D"
                strokeWidth="1"
              />
              <text
                x={lx}
                y={ly - 2}
                textAnchor={anchor}
                fill={isActive ? "#D2FF00" : "#A1A1AA"}
                fontSize="8.5"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {a.label}
              </text>
              <text
                x={lx}
                y={ly + 8}
                textAnchor={anchor}
                fill={isActive ? "#FFFFFF" : "#71717A"}
                fontSize="8"
                fontFamily="monospace"
              >
                {a.rawText}
              </text>
            </g>
          );
        })}

        <polygon
          points={dataPolygon}
          fill={`url(#${gradId})`}
          stroke="#D2FF00"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {dataCoords.map(([vx, vy], i) => (
          <g
            key={axes[i].label}
            onMouseEnter={() => setHoveredAxis(i)}
            onMouseLeave={() => setHoveredAxis(null)}
            className="cursor-pointer"
          >
            <circle cx={vx} cy={vy} r="8" fill="transparent" />
            <circle
              cx={vx}
              cy={vy}
              r={hoveredAxis === i ? "4.5" : "3"}
              fill={hoveredAxis === i ? "#FFFFFF" : "#D2FF00"}
              stroke="#090A0C"
              strokeWidth="1.2"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ============================================================================
// 2. PC1 x PC2 REGIME SCATTER & TRAJECTORY MANIFOLD
// ============================================================================
export function RegimeScatterManifoldSvg({
  series,
  currentRegime,
}: {
  series: SeriesPoint[];
  currentRegime: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo(() => {
    const slice = (series || []).slice(-60);
    return slice.map((pt) => {
      const pc1 = clamp(
        (Number(pt.velocity_pct || 0) / 0.8) * 0.55 +
          ((Number(pt.rsi_14 || 50) - 50) / 50) * 0.45,
        -1.25,
        1.25
      );
      const pc2 = clamp((Number(pt.delivery_pct || 50) - 50) / 35, -1.25, 1.25);
      return { ...pt, pc1, pc2 };
    });
  }, [series]);

  if (points.length < 2) {
    return (
      <div className="flex h-[250px] items-center justify-center border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500">
        NO MULTI-BAR SERIES IN SNAPSHOT FOR PC1 × PC2 REGIME MANIFOLD.
      </div>
    );
  }

  const w = 520;
  const h = 225;
  const padL = 34;
  const padR = 24;
  const padT = 22;
  const padB = 24;
  const cx = padL + (w - padL - padR) / 2;
  const cy = padT + (h - padT - padB) / 2;
  const halfW = (w - padL - padR) / 2;
  const halfH = (h - padT - padB) / 2;

  const toX = (v: number) => cx + (v / 1.35) * halfW;
  const toY = (v: number) => cy - (v / 1.35) * halfH;

  const trailPts = points.slice(-10);
  const trailPath = trailPts
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.pc1).toFixed(1)},${toY(p.pc2).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];
  const inspected = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : last;

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          {inspected.date} ·{" "}
          <strong style={{ color: regimeHex(inspected.regime || currentRegime) }}>
            {(inspected.regime || currentRegime).toUpperCase()}
          </strong>
        </span>
        <span className="text-zinc-300">
          Vel {inspected.velocity_pct >= 0 ? "+" : ""}
          {inspected.velocity_pct.toFixed(3)}%/d · Deliv {inspected.delivery_pct.toFixed(1)}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[220px] w-full select-none"
        role="img"
        aria-label="PC1 vs PC2 regime scatter plot with pulsing current session ring"
      >
        <line x1={cx} y1={padT} x2={cx} y2={h - padB} stroke="#23262D" strokeWidth="1" />
        <line x1={padL} y1={cy} x2={w - padR} y2={cy} stroke="#23262D" strokeWidth="1" />
        <rect
          x={padL}
          y={padT}
          width={w - padL - padR}
          height={h - padT - padB}
          fill="none"
          stroke="#191C22"
          strokeDasharray="3 3"
        />

        <text x={w - padR - 4} y={padT + 11} textAnchor="end" fill="#52525B" fontSize="8" fontFamily="monospace">
          MARKUP (+MOM / +DELIV)
        </text>
        <text x={padL + 4} y={padT + 11} fill="#52525B" fontSize="8" fontFamily="monospace">
          ACCUMULATION (+DELIV)
        </text>
        <text x={padL + 4} y={h - padB - 5} fill="#52525B" fontSize="8" fontFamily="monospace">
          MARKDOWN (-MOM / -DELIV)
        </text>
        <text x={w - padR - 4} y={h - padB - 5} textAnchor="end" fill="#52525B" fontSize="8" fontFamily="monospace">
          DISTRIBUTION (-DELIV)
        </text>

        <path
          d={trailPath}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.35"
          strokeWidth="1.25"
          strokeDasharray="2.5 2.5"
        />

        {points.slice(0, -1).map((pt, idx) => (
          <circle
            key={`${pt.date}-${idx}`}
            cx={toX(pt.pc1)}
            cy={toY(pt.pc2)}
            r={hoverIdx === idx ? "5" : "3.4"}
            fill={regimeHex(pt.regime)}
            fillOpacity={hoverIdx === idx ? 1 : 0.72}
            stroke={hoverIdx === idx ? "#FFFFFF" : "none"}
            strokeWidth="1"
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
            className="cursor-pointer"
          />
        ))}

        {/* Pulsing CURRENT session ring */}
        <circle
          cx={toX(last.pc1)}
          cy={toY(last.pc2)}
          r="12"
          fill="none"
          stroke="#D2FF00"
          strokeWidth="1.5"
          className="animate-qarc-pulse-ring"
        />
        <circle cx={toX(last.pc1)} cy={toY(last.pc2)} r="8" fill="none" stroke="#D2FF00" strokeWidth="1" />
        <circle
          cx={toX(last.pc1)}
          cy={toY(last.pc2)}
          r="4.2"
          fill="#D2FF00"
          onMouseEnter={() => setHoverIdx(points.length - 1)}
          onMouseLeave={() => setHoverIdx(null)}
          className="cursor-pointer"
        />
        <text
          x={toX(last.pc1)}
          y={toY(last.pc2) - 12}
          textAnchor="middle"
          fill="#D2FF00"
          fontSize="8.5"
          fontWeight="bold"
          fontFamily="monospace"
        >
          CURRENT
        </text>
      </svg>
    </div>
  );
}

// ============================================================================
// 3. 10,000-PATH MONTE CARLO STUDENT-T TAIL DENSITY & CVAR(95%)
// ============================================================================
export function MonteCarloTailDensitySvg({
  monteCarlo,
}: {
  monteCarlo: SecurityData["quant_anchors"]["monte_carlo"];
}) {
  const gradId = useId();
  const tailGradId = useId();

  const median = Number(monteCarlo.simulated_median_return_pct ?? 0);
  const var95 = Number(monteCarlo.var_95_pct ?? -5.0);
  const cvar95 = Number(monteCarlo.cvar_95_expected_shortfall_pct ?? var95 - 1.5);
  const stopProb = clamp(Number(monteCarlo.prob_stop_breach_pct ?? 0), 0, 100);
  const targetProb = clamp(Number(monteCarlo.prob_target_hit_pct ?? 0), 0, 100);
  const capPct = Number(monteCarlo.recommended_max_allocation_cap_pct ?? 0);

  // Calibrate Student-t (df=5) scale from the gap between Median and 5th percentile VaR95
  const scale = Math.max(Math.abs(median - var95) / 2.015, 0.65);
  const xMin = Math.min(cvar95 - 2.5 * scale, var95 - 3.0 * scale);
  const xMax = Math.max(median + 3.8 * scale, Math.abs(xMin) * 0.85);

  const nPts = 72;
  const pdf = (x: number) => {
    const z = (x - median) / scale;
    return Math.pow(1 + (z * z) / 5.0, -3.0);
  };

  const samples = Array.from({ length: nPts + 1 }, (_, i) => {
    const x = xMin + (i / nPts) * (xMax - xMin);
    return { x, y: pdf(x) };
  });

  const maxY = Math.max(...samples.map((s) => s.y), 1e-4);
  const w = 520;
  const h = 158;
  const padL = 24;
  const padR = 20;
  const padT = 22;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const baseY = padT + plotH;

  const toX = (x: number) => padL + ((x - xMin) / Math.max(xMax - xMin, 1e-4)) * plotW;
  const toY = (y: number) => baseY - (y / maxY) * plotH;

  const fullLine = samples
    .map((s, i) => `${i === 0 ? "M" : "L"}${toX(s.x).toFixed(1)},${toY(s.y).toFixed(1)}`)
    .join(" ");
  const fullArea = `${fullLine} L${toX(xMax).toFixed(1)},${baseY} L${toX(xMin).toFixed(1)},${baseY} Z`;

  const tailSamples = samples.filter((s) => s.x <= var95);
  if (tailSamples.length > 0 && tailSamples[tailSamples.length - 1].x < var95) {
    tailSamples.push({ x: var95, y: pdf(var95) });
  }
  const tailArea =
    tailSamples.length >= 2
      ? `${tailSamples
          .map((s, i) => `${i === 0 ? "M" : "L"}${toX(s.x).toFixed(1)},${toY(s.y).toFixed(1)}`)
          .join(" ")} L${toX(var95).toFixed(1)},${baseY} L${toX(tailSamples[0].x).toFixed(1)},${baseY} Z`
      : "";

  return (
    <div className="space-y-2.5 border border-[#23262D] bg-[#090A0C] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          STUDENT-t (ν=5) · 10,000 PATHS
        </span>
        <span className="border border-[#23262D] bg-[#101216] px-2 py-0.5 font-bold text-[#D2FF00]">
          MAX POSITION CAP: {capPct.toFixed(1)}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[155px] w-full select-none"
        role="img"
        aria-label="Monte Carlo Student-t tail risk density curve"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D2FF00" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#D2FF00" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={tailGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF3B5C" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#FF3B5C" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        <line x1={padL} y1={baseY} x2={w - padR} y2={baseY} stroke="#23262D" strokeWidth="1" />
        <path d={fullArea} fill={`url(#${gradId})`} />
        {tailArea && <path d={tailArea} fill={`url(#${tailGradId})`} />}
        <path d={fullLine} fill="none" stroke="#D2FF00" strokeWidth="1.75" />

        {/* Vertical Reference Markers */}
        {[
          { val: cvar95, label: `CVaR95 ${cvar95.toFixed(1)}%`, color: "#FF3B5C", yOff: 12 },
          { val: var95, label: `VaR95 ${var95.toFixed(1)}%`, color: "#F59E0B", yOff: 23 },
          { val: median, label: `Med ${median >= 0 ? "+" : ""}${median.toFixed(1)}%`, color: "#FFFFFF", yOff: 12 },
        ].map((m) => {
          const xPos = clamp(toX(m.val), padL + 8, w - padR - 8);
          return (
            <g key={m.label}>
              <line
                x1={xPos}
                y1={padT}
                x2={xPos}
                y2={baseY}
                stroke={m.color}
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <text
                x={xPos}
                y={m.yOff}
                textAnchor="middle"
                fill={m.color}
                fontSize="8.5"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Two Horizontal Barrier-Probability Bars */}
      <div className="grid grid-cols-1 gap-2 pt-1 font-mono text-[10px] tabular-nums sm:grid-cols-2">
        <div className="border border-[#23262D] bg-[#101216] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-zinc-400">P(HIT +5% TARGET)</span>
            <span className="font-bold text-[#10B981]">{targetProb.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#090A0C]">
            <div className="h-full bg-[#10B981]" style={{ width: `${targetProb}%` }} />
          </div>
        </div>

        <div className="border border-[#23262D] bg-[#101216] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-zinc-400">P(BREACH -3% STOP)</span>
            <span className="font-bold text-[#FF3B5C]">{stopProb.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#090A0C]">
            <div className="h-full bg-[#FF3B5C]" style={{ width: `${stopProb}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. DELIVERY % VS VOLUME MICROSTRUCTURE & FACTOR 4B CHURN LINE
// ============================================================================
export function DeliveryVolumeMicrostructureSvg({ series }: { series: SeriesPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = useMemo(() => (series || []).slice(-40), [series]);

  if (pts.length < 2) {
    return (
      <div className="flex h-[225px] items-center justify-center border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500">
        NO VOLUME / DELIVERY SERIES IN SNAPSHOT.
      </div>
    );
  }

  const w = 520;
  const h = 205;
  const padL = 34;
  const padR = 36;
  const padT = 20;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const baseY = padT + plotH;

  const maxVol = Math.max(...pts.map((p) => Number(p.volume) || 0), 1);
  const stepX = plotW / pts.length;
  const barW = Math.max(3, stepX * 0.62);

  const delivY = (d: number) => baseY - (clamp(d, 0, 100) / 100) * plotH;
  const delivLine = pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(padL + stepX * i + stepX / 2).toFixed(1)},${delivY(
          p.delivery_pct
        ).toFixed(1)}`
    )
    .join(" ");

  const last = pts[pts.length - 1];
  const inspected = hoverIdx !== null && pts[hoverIdx] ? pts[hoverIdx] : last;

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          {inspected.date} · VOL {(inspected.volume / 1e5).toFixed(2)}L
        </span>
        <span
          className={
            inspected.delivery_pct >= 50
              ? "font-bold text-[#10B981]"
              : inspected.delivery_pct >= 40
              ? "font-bold text-[#D2FF00]"
              : "font-bold text-[#FF3B5C]"
          }
        >
          DELIVERY: {inspected.delivery_pct.toFixed(1)}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[200px] w-full select-none"
        role="img"
        aria-label="Volume microstructure and delivery percentage chart"
      >
        <line x1={padL} y1={baseY} x2={w - padR} y2={baseY} stroke="#23262D" />
        {/* 40% Factor 4B Churn Line */}
        <line
          x1={padL}
          y1={delivY(40)}
          x2={w - padR}
          y2={delivY(40)}
          stroke="#FF3B5C"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <text x={w - padR + 4} y={delivY(40) + 3} fill="#FF3B5C" fontSize="8.5" fontFamily="monospace">
          40% 4B
        </text>
        <text x={w - padR + 4} y={delivY(80) + 3} fill="#71717A" fontSize="8" fontFamily="monospace">
          80%
        </text>

        {pts.map((p, i) => {
          const barH = Math.max(2, ((Number(p.volume) || 0) / maxVol) * (plotH * 0.72));
          const x = padL + stepX * i + (stepX - barW) / 2;
          const y = baseY - barH;
          const fill =
            p.delivery_pct >= 50 ? "#10B981" : p.delivery_pct >= 40 ? "#D2FF00" : "#FF3B5C";
          const cx = padL + stepX * i + stepX / 2;
          const dy = delivY(p.delivery_pct);
          return (
            <g
              key={`${p.date}-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={fill}
                fillOpacity={hoverIdx === i ? 0.95 : 0.45}
              />
              {(p.factor_1 || p.factor_2) && (
                <polygon
                  points={`${cx},${dy - 4.5} ${cx + 4},${dy} ${cx},${dy + 4.5} ${cx - 4},${dy}`}
                  fill="#D2FF00"
                  stroke="#090A0C"
                  strokeWidth="1"
                />
              )}
            </g>
          );
        })}

        <path d={delivLine} fill="none" stroke="#38BDF8" strokeWidth="1.8" />
        <text x={padL} y={h - 6} fill="#71717A" fontSize="8.5" fontFamily="monospace">
          {pts[0].date}
        </text>
        <text x={w - padR} y={h - 6} textAnchor="end" fill="#38BDF8" fontSize="8.5" fontFamily="monospace">
          {last.date}
        </text>
      </svg>
    </div>
  );
}

// ============================================================================
// 5. KALMAN MICROSTRUCTURE NOISE OSCILLATOR ((SPOT - KALMAN) / KALMAN %)
// ============================================================================
export function KalmanNoiseOscillatorSvg({ series }: { series: SeriesPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { items, sigma } = useMemo(() => {
    const pts = (series || []).slice(-45);
    const disp = pts.map((p) => {
      const k = Math.max(Number(p.kalman) || 0, 1e-4);
      const pct = ((Number(p.close) - k) / k) * 100;
      return { ...p, pct };
    });
    const mean = disp.reduce((a, b) => a + b.pct, 0) / Math.max(disp.length, 1);
    const variance =
      disp.reduce((a, b) => a + (b.pct - mean) ** 2, 0) / Math.max(disp.length, 1);
    return { items: disp, sigma: Math.max(Math.sqrt(variance), 0.15) };
  }, [series]);

  if (items.length < 2) {
    return (
      <div className="flex h-[225px] items-center justify-center border border-[#23262D] bg-[#090A0C] p-6 font-mono text-xs text-zinc-500">
        NO SERIES IN SNAPSHOT FOR KALMAN NOISE OSCILLATOR.
      </div>
    );
  }

  const w = 520;
  const h = 205;
  const padL = 38;
  const padR = 32;
  const padT = 20;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const zeroY = padT + plotH / 2;

  const maxAbs = Math.max(sigma * 1.4, ...items.map((d) => Math.abs(d.pct)), 0.5);
  const toY = (pct: number) => zeroY - (pct / maxAbs) * (plotH / 2 - 4);
  const stepX = plotW / items.length;

  const last = items[items.length - 1];
  const inspected = hoverIdx !== null && items[hoverIdx] ? items[hoverIdx] : last;

  return (
    <div className="border border-[#23262D] bg-[#090A0C] p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="text-zinc-400">
          {inspected.date} · ±1σ BAND: ±{sigma.toFixed(2)}%
        </span>
        <span className={inspected.pct >= 0 ? "font-bold text-[#D2FF00]" : "font-bold text-[#FF3B5C]"}>
          SPOT − KALMAN: {inspected.pct >= 0 ? "+" : ""}
          {inspected.pct.toFixed(2)}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[200px] w-full select-none"
        role="img"
        aria-label="Spot minus Kalman microstructure noise lollipop oscillator"
      >
        <rect
          x={padL}
          y={toY(sigma)}
          width={plotW}
          height={Math.max(2, toY(-sigma) - toY(sigma))}
          fill="#FFFFFF"
          fillOpacity="0.03"
        />
        <line x1={padL} y1={toY(sigma)} x2={w - padR} y2={toY(sigma)} stroke="#23262D" strokeDasharray="3 3" />
        <line x1={padL} y1={toY(-sigma)} x2={w - padR} y2={toY(-sigma)} stroke="#23262D" strokeDasharray="3 3" />
        <line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke="#3F3F46" strokeWidth="1" />

        <text x={w - padR + 4} y={toY(sigma) + 3} fill="#71717A" fontSize="8" fontFamily="monospace">
          +1σ
        </text>
        <text x={w - padR + 4} y={toY(-sigma) + 3} fill="#71717A" fontSize="8" fontFamily="monospace">
          -1σ
        </text>

        {items.map((d, i) => {
          const cx = padL + stepX * i + stepX / 2;
          const cy = toY(d.pct);
          const color = d.pct >= 0 ? "#D2FF00" : "#FF3B5C";
          return (
            <g
              key={`${d.date}-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <line
                x1={cx}
                y1={zeroY}
                x2={cx}
                y2={cy}
                stroke={color}
                strokeWidth={hoverIdx === i ? "2" : "1.25"}
                strokeOpacity="0.75"
              />
              <circle
                cx={cx}
                cy={cy}
                r={hoverIdx === i ? "4" : "2.6"}
                fill={hoverIdx === i ? "#FFFFFF" : color}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================================================
// 6. MULTI-SEGMENT PORTFOLIO ALLOCATION DONUT RING
// ============================================================================
export interface PortfolioSegment {
  label: string;
  pct: number;
  inr: number;
  color: string;
}

export function PortfolioDonutRingSvg({
  segments,
  totalCapital,
  quarantinedCount,
}: {
  segments: PortfolioSegment[];
  totalCapital: number;
  quarantinedCount: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const r = 56;
  const circumference = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    let accPct = 0;
    return segments.map((seg) => {
      const pct = clamp(Number(seg.pct) || 0, 0, 100);
      const len = (pct / 100) * circumference;
      const offset = -(accPct / 100) * circumference;
      accPct += pct;
      return { ...seg, len, offset };
    });
  }, [segments, circumference]);

  const focused = hoverIdx !== null && arcs[hoverIdx] ? arcs[hoverIdx] : null;

  return (
    <div className="grid grid-cols-1 items-center gap-4 border border-[#23262D] bg-[#090A0C] p-3 sm:grid-cols-12">
      <div className="relative mx-auto flex h-36 w-36 items-center justify-center sm:col-span-5">
        <svg viewBox="0 0 144 144" className="h-36 w-36 -rotate-90 select-none" role="img" aria-label="Portfolio allocation donut ring">
          <circle cx="72" cy="72" r={r} fill="none" stroke="#181B22" strokeWidth="15" />
          {arcs.map((arc, idx) => (
            <circle
              key={arc.label}
              cx="72"
              cy="72"
              r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={hoverIdx === idx ? "18" : "15"}
              strokeDasharray={`${arc.len} ${circumference}`}
              strokeDashoffset={arc.offset}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer transition-all duration-150"
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center font-mono">
          {focused ? (
            <>
              <span className="text-[10px] font-bold uppercase text-white">{focused.label.split(" ")[0]}</span>
              <span className="text-sm font-bold tabular-nums text-[#D2FF00]">
                {focused.pct.toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[9px] uppercase text-zinc-500">CAPITAL</span>
              <span className="text-xs font-bold tabular-nums text-white">
                ₹{(totalCapital / 100000).toFixed(2)}L
              </span>
              <span className="text-[9px] text-[#FF3B5C]">{quarantinedCount} QUARANTINED</span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-1.5 font-mono text-[11px] tabular-nums sm:col-span-7">
        {arcs.map((arc, idx) => (
          <div
            key={arc.label}
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
            className={`flex cursor-pointer items-center justify-between border px-2.5 py-1.5 transition ${
              hoverIdx === idx ? "border-[#D2FF00]/60 bg-[#101216]" : "border-[#23262D] bg-[#101216]/60"
            }`}
          >
            <span className="flex items-center gap-2 text-zinc-200">
              <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: arc.color }} />
              <span className="truncate">{arc.label}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="font-bold text-[#D2FF00]">{arc.pct.toFixed(1)}%</span>
              <span className="text-zinc-300">₹{arc.inr.toLocaleString("en-IN")}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
