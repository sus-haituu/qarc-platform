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

const REGIME_STYLES: Record<string, { pill: string; hex: string }> = {
  Markup: {
    pill: "border-[#D2FF00]/50 bg-[#D2FF00]/10 text-[#D2FF00]",
    hex: "#D2FF00",
  },
  Accumulation: {
    pill: "border-zinc-500/50 bg-zinc-500/10 text-zinc-200",
    hex: "#A1A1AA",
  },
  Distribution: {
    pill: "border-amber-400/50 bg-amber-400/10 text-amber-300",
    hex: "#F59E0B",
  },
  Markdown: {
    pill: "border-[#FF3B5C]/50 bg-[#FF3B5C]/10 text-[#FF3B5C]",
    hex: "#FF3B5C",
  },
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
        background: { type: ColorType.Solid, color: "#090A0C" },
        textColor: "#A1A1AA",
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
      },
      grid: {
        vertLines: { color: "#181A20" },
        horzLines: { color: "#181A20" },
      },
      rightPriceScale: {
        borderColor: "#23262D",
      },
      timeScale: {
        borderColor: "#23262D",
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(210, 255, 0, 0.35)", style: LineStyle.Dashed },
        horzLine: { color: "rgba(210, 255, 0, 0.35)", style: LineStyle.Dashed },
      },
      height: 310,
      width: containerRef.current.clientWidth,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#D2FF00",
      downColor: "#FF3B5C",
      borderVisible: false,
      wickUpColor: "#D2FF00",
      wickDownColor: "#FF3B5C",
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
      color: "#FFFFFF",
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

  const regimeStyle = REGIME_STYLES[currentRegime] || REGIME_STYLES.Accumulation;

  if (!series.length) {
    return (
      <div className="border border-[#23262D] bg-[#101216] p-6 font-mono text-xs text-zinc-400">
        NO OHLCV SERIES RETURNED FOR {ticker}. LOAD SNAPSHOT OR LIVE API TO RENDER STATE-SPACE CANVAS.
      </div>
    );
  }

  return (
    <div className="border border-[#23262D] bg-[#101216] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              ENGINE 01 // STATE-SPACE &amp; HMM CANVAS
            </span>
            <span className={`border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${regimeStyle.pill}`}>
              HMM: {currentRegime}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            Split-adjusted NSE Bhavcopy OHLCV vs. 2D Kalman trajectory ({series.length} sessions)
          </p>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[#D2FF00]" /> Up / <span className="inline-block h-2 w-2 bg-[#FF3B5C]" /> Down OHLC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 bg-white" /> 2D Kalman
          </span>
        </div>
      </div>

      <div ref={containerRef} className="w-full overflow-hidden border border-[#23262D] bg-[#090A0C]" />

      <div className="mt-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          <span>
            Causal 4-State HMM Ribbon ({series[0]?.date} → {series[series.length - 1]?.date})
          </span>
          <div className="flex items-center gap-3">
            {Object.entries(REGIME_STYLES).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-zinc-400">
                <span className="inline-block h-2 w-2" style={{ backgroundColor: v.hex }} />
                {k}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden border border-[#23262D] bg-[#090A0C]">
          {series.map((pt, idx) => {
            const c = REGIME_STYLES[pt.regime]?.hex || "#52525B";
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
