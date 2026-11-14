"use client";

import React, { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, Time } from "lightweight-charts";

export interface SeriesPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  kalman: number;
  velocity_pct: number;
  volume: number;
  delivery_pct: number;
  rsi_14: number;
  regime: "Markup" | "Accumulation" | "Distribution" | "Markdown" | string;
  factor_1: boolean;
  factor_2: boolean;
}

const REGIME_COLORS: Record<string, { bg: string; hex: string; label: string }> = {
  Markup: { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", hex: "#10B981", label: "Markup" },
  Accumulation: { bg: "bg-sky-500/20 text-sky-300 border-sky-500/40", hex: "#38BDF8", label: "Accumulation" },
  Distribution: { bg: "bg-amber-500/20 text-amber-300 border-amber-500/40", hex: "#F59E0B", label: "Distribution" },
  Markdown: { bg: "bg-rose-500/20 text-rose-300 border-rose-500/40", hex: "#F43F5E", label: "Markdown" },
};

export default function StateSpaceChart({
  ticker,
  series,
  currentRegime,
}: {
  ticker: string;
  series: SeriesPoint[];
  currentRegime: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !series.length) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0B1120" },
        textColor: "#94A3B8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(51, 65, 85, 0.25)" },
        horzLines: { color: "rgba(51, 65, 85, 0.25)" },
      },
      rightPriceScale: {
        borderColor: "rgba(51, 65, 85, 0.5)",
      },
      timeScale: {
        borderColor: "rgba(51, 65, 85, 0.5)",
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(148, 163, 184, 0.4)", style: LineStyle.Dashed },
        horzLine: { color: "rgba(148, 163, 184, 0.4)", style: LineStyle.Dashed },
      },
      height: 310,
      width: containerRef.current.clientWidth,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10B981",
      downColor: "#F43F5E",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#F43F5E",
    });

    candleSeries.setData(
      series.map((d) => ({
        time: d.date as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    const kalmanLine = chart.addLineSeries({
      color: "#38BDF8",
      lineWidth: 2,
      title: "2D Kalman Denoised",
    });

    kalmanLine.setData(
      series.map((d) => ({
        time: d.date as Time,
        value: d.kalman,
      }))
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [series, ticker]);

  const regimeStyle = REGIME_COLORS[currentRegime] || REGIME_COLORS.Accumulation;

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#0B1120] p-4 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pane 1 · State-Space Price &amp; HMM Regime Canvas
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${regimeStyle.bg}`}>
              HMM: {currentRegime}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Corporate-action-adjusted NSE Bhavcopy OHLCV vs. 2D Kalman denoised trajectory ({series.length} sessions)
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Bull / Bear OHLC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 bg-sky-400" /> 2D Kalman Filter
          </span>
        </div>
      </div>

      <div ref={containerRef} className="w-full overflow-hidden rounded-lg border border-slate-800/60" />

      {/* 4-State Gaussian HMM Regime Ribbon */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Causal 4-State HMM Regime Ribbon ({series[0]?.date} → {series[series.length - 1]?.date})</span>
          <div className="flex items-center gap-3">
            {Object.entries(REGIME_COLORS).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: v.hex }} />
                {k}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-md border border-slate-800">
          {series.map((pt, idx) => {
            const c = REGIME_COLORS[pt.regime]?.hex || "#64748B";
            return (
              <div
                key={`${pt.date}-${idx}`}
                title={`${pt.date} | ${pt.regime} | Close ₹${pt.close} | Kalman ₹${pt.kalman} (${pt.velocity_pct >= 0 ? "+" : ""}${pt.velocity_pct}%/d)`}
                style={{ backgroundColor: c }}
                className="h-full flex-1 opacity-85 transition-opacity hover:opacity-100"
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

