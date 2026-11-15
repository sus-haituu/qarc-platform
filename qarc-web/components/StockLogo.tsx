"use client";

import React from "react";

export type StockLogoSize = "xs" | "sm" | "md" | "lg";

export interface StockLogoProps {
  symbol: string;
  size?: StockLogoSize;
  className?: string;
}

interface BrandSpec {
  bg: string;
  border: string;
  fg: string;
  glyph:
    | "flame"
    | "t"
    | "orbit"
    | "shield"
    | "wave"
    | "bars"
    | "cross"
    | "spark"
    | "hex"
    | "diamond"
    | "monogram";
  label?: string;
}

const BRAND_MAP: Record<string, BrandSpec> = {
  RELIANCE: { bg: "#141923", border: "#D4AF37", fg: "#FACC15", glyph: "flame", label: "RIL" },
  JIOFIN: { bg: "#0D1A2D", border: "#3B82F6", fg: "#60A5FA", glyph: "orbit", label: "JIO" },
  TCS: { bg: "#141226", border: "#A855F7", fg: "#E9D5FF", glyph: "t", label: "TCS" },
  TATAMOTORS: { bg: "#0D1B2E", border: "#38BDF8", fg: "#BAE6FD", glyph: "t", label: "TM" },
  TATASTEEL: { bg: "#0F1D2C", border: "#60A5FA", fg: "#DBEAFE", glyph: "t", label: "TS" },
  TRENT: { bg: "#1B1218", border: "#F472B6", fg: "#FCE7F3", glyph: "t", label: "TR" },
  TITAN: { bg: "#18140C", border: "#D97706", fg: "#FBBF24", glyph: "diamond", label: "TI" },
  INFY: { bg: "#0D1E2E", border: "#0EA5E9", fg: "#7DD3FC", glyph: "orbit", label: "IN" },
  WIPRO: { bg: "#121C24", border: "#2DD4BF", fg: "#99F6E4", glyph: "spark", label: "WI" },
  HCLTECH: { bg: "#0E1C2F", border: "#38BDF8", fg: "#E0F2FE", glyph: "hex", label: "HC" },
  TECHM: { bg: "#261217", border: "#FB7185", fg: "#FFE4E6", glyph: "hex", label: "TM" },
  HDFCBANK: { bg: "#0E172A", border: "#EF4444", fg: "#F8FAFC", glyph: "shield", label: "HD" },
  ICICIBANK: { bg: "#27140D", border: "#F97316", fg: "#FED7AA", glyph: "shield", label: "IC" },
  SBIN: { bg: "#0C2133", border: "#38BDF8", fg: "#E0F2FE", glyph: "orbit", label: "SB" },
  KOTAKBANK: { bg: "#271115", border: "#EF4444", fg: "#FECACA", glyph: "wave", label: "KB" },
  AXISBANK: { bg: "#27101C", border: "#EC4899", fg: "#FBCFE8", glyph: "bars", label: "AX" },
  INDUSINDBK: { bg: "#241313", border: "#F87171", fg: "#FEE2E2", glyph: "shield", label: "IB" },
  LT: { bg: "#141D2B", border: "#FACC15", fg: "#FEF08A", glyph: "hex", label: "LT" },
  SUNPHARMA: { bg: "#261B0D", border: "#F59E0B", fg: "#FDE68A", glyph: "cross", label: "SP" },
  DRREDDY: { bg: "#1A1328", border: "#A78BFA", fg: "#EDE9FE", glyph: "cross", label: "DR" },
  CIPLA: { bg: "#0E1F2A", border: "#22D3EE", fg: "#CFFAFE", glyph: "cross", label: "CP" },
  BHARTIARTL: { bg: "#291014", border: "#EF4444", fg: "#FECACA", glyph: "wave", label: "AR" },
  IDEA: { bg: "#261E0D", border: "#EAB308", fg: "#FEF08A", glyph: "wave", label: "VI" },
  ITC: { bg: "#121D1A", border: "#34D399", fg: "#D1FAE5", glyph: "bars", label: "IT" },
  ADANIENT: { bg: "#0F1D2B", border: "#38BDF8", fg: "#BAE6FD", glyph: "wave", label: "AD" },
  BAJFINANCE: { bg: "#0E1C2E", border: "#3B82F6", fg: "#DBEAFE", glyph: "bars", label: "BF" },
  BAJAJFINSV: { bg: "#0E1C2E", border: "#60A5FA", fg: "#DBEAFE", glyph: "bars", label: "BS" },
  MARUTI: { bg: "#1B1526", border: "#818CF8", fg: "#E0E7FF", glyph: "wave", label: "MS" },
  "M&M": { bg: "#251216", border: "#F43F5E", fg: "#FFE4E6", glyph: "bars", label: "MM" },
  ZOMATO: { bg: "#2A1016", border: "#FB7185", fg: "#FFE4E6", glyph: "spark", label: "ZO" },
  PAYTM: { bg: "#0D202C", border: "#22D3EE", fg: "#CFFAFE", glyph: "bars", label: "PT" },
  HAL: { bg: "#141D26", border: "#94A3B8", fg: "#F1F5F9", glyph: "spark", label: "HA" },
  BEL: { bg: "#101E2B", border: "#38BDF8", fg: "#BAE6FD", glyph: "hex", label: "BE" },
  NTPC: { bg: "#121C29", border: "#FBBF24", fg: "#FEF3C7", glyph: "flame", label: "NT" },
  ONGC: { bg: "#261414", border: "#F87171", fg: "#FEE2E2", glyph: "flame", label: "ON" },
  POWERGRID: { bg: "#131C26", border: "#D2FF00", fg: "#ECFCCB", glyph: "spark", label: "PG" },
  ULTRACEMCO: { bg: "#262010", border: "#FACC15", fg: "#FEF9C3", glyph: "hex", label: "UC" },
  ASIANPAINT: { bg: "#251520", border: "#FB7185", fg: "#FCE7F3", glyph: "orbit", label: "AP" },
  HINDUNILVR: { bg: "#0F1B2C", border: "#60A5FA", fg: "#DBEAFE", glyph: "shield", label: "HL" },
  COALINDIA: { bg: "#191B1F", border: "#A1A1AA", fg: "#F4F4F5", glyph: "hex", label: "CI" },
  JSWSTEEL: { bg: "#111A2C", border: "#818CF8", fg: "#E0E7FF", glyph: "bars", label: "JS" },
  HINDALCO: { bg: "#141A29", border: "#60A5FA", fg: "#DBEAFE", glyph: "hex", label: "HN" },
  GRASIM: { bg: "#181C24", border: "#FBBF24", fg: "#FEF3C7", glyph: "bars", label: "GR" },
  LIQUIDBEES: { bg: "#111D18", border: "#D2FF00", fg: "#D2FF00", glyph: "orbit", label: "LB" },
};

const FALLBACK_PALETTES: Array<{ bg: string; border: string; fg: string }> = [
  { bg: "#121820", border: "#38BDF8", fg: "#E0F2FE" },
  { bg: "#181A14", border: "#D2FF00", fg: "#D2FF00" },
  { bg: "#1E1418", border: "#FB7185", fg: "#FFE4E6" },
  { bg: "#181422", border: "#A78BFA", fg: "#EDE9FE" },
  { bg: "#131E1B", border: "#34D399", fg: "#D1FAE5" },
  { bg: "#201912", border: "#FBBF24", fg: "#FEF3C7" },
];

const SIZE_CLASSES: Record<StockLogoSize, { box: string; svg: string; text: string; radius: string }> = {
  xs: { box: "h-4 w-4", svg: "h-2.5 w-2.5", text: "text-[7px]", radius: "rounded-[5px]" },
  sm: { box: "h-5 w-5", svg: "h-3 w-3", text: "text-[8px]", radius: "rounded-md" },
  md: { box: "h-7 w-7", svg: "h-4 w-4", text: "text-[10px]", radius: "rounded-lg" },
  lg: { box: "h-10 w-10", svg: "h-5 w-5", text: "text-xs", radius: "rounded-xl" },
};

export function normalizeLogoSymbol(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\.NS$/i, "")
    .replace(/-EQ$/i, "");
}

function hashSymbol(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i += 1) {
    h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  }
  return h;
}

function renderGlyph(spec: BrandSpec, svgCls: string) {
  switch (spec.glyph) {
    case "flame":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <path
            d="M8.5 1.8C10.8 4 12.2 6.2 12.2 8.7C12.2 11.4 10.3 13.6 8 13.6C5.7 13.6 3.8 11.4 3.8 8.9C3.8 7 4.7 5.5 6.1 4.2C6.2 5.6 6.8 6.4 7.7 6.8C7.4 5 7.8 3.3 8.5 1.8Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="10" r="1.4" fill="currentColor" />
        </svg>
      );
    case "t":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <path
            d="M3 4.2H13M8 4.2V12.5M4.5 7.2H11.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      );
    case "orbit":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.35" />
          <path d="M3.2 10.5C5.6 7.4 10.4 7.4 12.8 5.5" stroke="currentColor" strokeWidth="1.35" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <rect x="2.8" y="2.8" width="10.4" height="10.4" stroke="currentColor" strokeWidth="1.4" />
          <rect x="5.8" y="5.8" width="4.4" height="4.4" fill="currentColor" />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <path
            d="M8 2.8V13.2M2.8 8H13.2"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="square"
          />
        </svg>
      );
    case "wave":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <path
            d="M2.2 10.2C4.2 5.4 6.2 5.4 8 8C9.8 10.6 11.8 10.6 13.8 5.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "bars":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <path
            d="M3.5 12V7.5M8 12V3.8M12.5 12V5.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <path
            d="M8 2.2L9.4 6.6L13.8 8L9.4 9.4L8 13.8L6.6 9.4L2.2 8L6.6 6.6L8 2.2Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "hex":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <polygon
            points="8,2.2 13,5.1 13,10.9 8,13.8 3,10.9 3,5.1"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 16 16" className={svgCls} fill="none" aria-hidden="true">
          <polygon
            points="8,2.2 13.5,8 8,13.8 2.5,8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="1.35" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

export function StockLogo({ symbol, size = "sm", className = "" }: StockLogoProps) {
  const clean = normalizeLogoSymbol(symbol);
  const spec = BRAND_MAP[clean];
  const dims = SIZE_CLASSES[size];

  if (spec) {
    return (
      <span
        aria-hidden="true"
        title={clean}
        style={{
          backgroundColor: spec.bg,
          borderColor: spec.border,
          color: spec.fg,
        }}
        className={`inline-flex shrink-0 items-center justify-center border font-mono font-bold uppercase select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${dims.radius} ${dims.box} ${className}`}
      >
        {renderGlyph(spec, dims.svg)}
      </span>
    );
  }

  const palette = FALLBACK_PALETTES[hashSymbol(clean || "NSE") % FALLBACK_PALETTES.length];
  const letters = clean.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "NS";

  return (
    <span
      aria-hidden="true"
      title={clean || "NSE"}
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        color: palette.fg,
      }}
      className={`inline-flex shrink-0 items-center justify-center border font-mono font-bold uppercase tracking-tighter select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${dims.radius} ${dims.box} ${dims.text} ${className}`}
    >
      {letters}
    </span>
  );
}

export default StockLogo;
