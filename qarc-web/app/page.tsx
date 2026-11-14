"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Terminal, Cpu, Database, Radio } from "lucide-react";

const HERO_LINES = [
  { text: "TRADE THE", accent: "white" },
  { text: "REGIME.", accent: "volt" },
  { text: "NOT NOISE.", accent: "stroke" },
] as const;

const MARQUEE_ITEMS = [
  { sym: "RELIANCE", tag: "HMM: MARKUP", metric: "HURST 0.62" },
  { sym: "TCS", tag: "KALMAN +0.38%/D", metric: "CVAR95 -4.1%" },
  { sym: "HDFCBANK", tag: "E08 RAG: 768D", metric: "E09 L2 READY" },
  { sym: "INFY", tag: "PGVECTOR 8D", metric: "GARCH 18.4%" },
  { sym: "ICICIBANK", tag: "FACTOR 1+2", metric: "GATE: ARMED" },
  { sym: "SBIN", tag: "HMM: ACCUMULATION", metric: "MC 10K PATHS" },
  { sym: "LT", tag: "TWIN MATCH 94.1%", metric: "VERIFIER <5MS" },
  { sym: "SUNPHARMA", tag: "SPLIT ADJUSTED", metric: "PAPER SAFE" },
];

const ENGINES = [
  {
    id: "01",
    code: "STATE-SPACE QUANT",
    title: "Causal 4-State HMM & Kalman",
    desc: "2D Kalman price velocity, GARCH(1,1) MLE volatility hazard ratio, causal Gaussian HMM regime posteriors, and 10,000-path Monte Carlo CVaR(95%).",
    stat: "0 LOOK-AHEAD LEAKAGE",
    icon: Cpu,
  },
  {
    id: "02",
    code: "PGVECTOR MEMORY",
    title: "8D Regime Twin Retrieval",
    desc: "Normalizes return, VWAP deviation, delivery %, volume Z-score, Kalman velocity, GARCH ratio, RSI, and Hurst into Neon HNSW VECTOR(8) embeddings.",
    stat: "16,125 NSE VECTORS",
    icon: Database,
  },
  {
    id: "03",
    code: "E08 CAUSAL RAG",
    title: "News & Bulk Deal Grounding",
    desc: "Embeds NSE bulk/block disclosures and live NewsAPI/RSS headlines via gemini-embedding-001 (768D), strictly gated by filing_date <= as_of_date.",
    stat: "STRICT DATE CUTOFF",
    icon: Radio,
  },
  {
    id: "04",
    code: "PRE-TRADE GATE",
    title: "ClaimVerifier & Angel Switch",
    desc: "Deterministic <5ms guardrail enforces zero contradictions, Factor 4B churn locks, notional caps, and +/-2% LTP collars before PAPER or LIVE_ANGEL.",
    stat: "4 HARD SAFETY LOCKS",
    icon: ShieldCheck,
  },
];

const SCATTER_POINTS = [
  { x: 92, y: 215, regime: "Markdown", color: "#FF3B5C", label: "2025-02-18" },
  { x: 118, y: 232, regime: "Markdown", color: "#FF3B5C", label: "2025-03-04" },
  { x: 140, y: 196, regime: "Markdown", color: "#FF3B5C", label: "2025-04-11" },
  { x: 175, y: 185, regime: "Distribution", color: "#F59E0B", label: "2025-06-20" },
  { x: 205, y: 162, regime: "Distribution", color: "#F59E0B", label: "2025-07-08" },
  { x: 232, y: 188, regime: "Distribution", color: "#F59E0B", label: "2025-08-19" },
  { x: 262, y: 132, regime: "Accumulation", color: "#A1A1AA", label: "2025-11-05" },
  { x: 288, y: 118, regime: "Accumulation", color: "#A1A1AA", label: "2026-01-14" },
  { x: 318, y: 136, regime: "Accumulation", color: "#A1A1AA", label: "2026-03-22" },
  { x: 344, y: 92, regime: "Markup", color: "#D2FF00", label: "2026-06-09" },
  { x: 374, y: 74, regime: "Markup", color: "#D2FF00", label: "2026-08-14" },
  { x: 404, y: 66, regime: "Markup", color: "#D2FF00", label: "2026-10-02" },
];

const TWINS = [
  { id: "TWIN 1", sym: "RELIANCE", date: "2025-08-19", regime: "MARKUP", sim: 96.4, ret: "+4.82%" },
  { id: "TWIN 2", sym: "TCS", date: "2025-11-12", regime: "MARKUP", sim: 94.1, ret: "+3.45%" },
  { id: "TWIN 3", sym: "INFY", date: "2026-02-04", regime: "ACCUMULATION", sim: 91.8, ret: "+2.18%" },
  { id: "TWIN 4", sym: "ICICIBANK", date: "2025-05-27", regime: "ACCUMULATION", sim: 89.2, ret: "+1.64%" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100">
      {/* Sticky Blur Navbar */}
      <header className="sticky top-0 z-50 border-b border-[#23262D] bg-[#090A0C]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold uppercase tracking-[-0.04em] text-white">
              Q-ARC
            </span>
            <span className="hidden border border-[#23262D] bg-[#101216] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:inline-block">
              NEURO-SYMBOLIC BCP v2
            </span>
          </div>

          <nav className="hidden items-center gap-7 font-mono text-xs uppercase tracking-[0.14em] text-zinc-400 md:flex">
            <a href="#engines" className="transition-colors hover:text-[#D2FF00]">
              Engines
            </a>
            <a href="#regime-space" className="transition-colors hover:text-[#D2FF00]">
              Regime Space
            </a>
            <a href="#twins" className="transition-colors hover:text-[#D2FF00]">
              Twins
            </a>
            <a href="#execution" className="transition-colors hover:text-[#D2FF00]">
              Execution
            </a>
          </nav>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 border border-[#D2FF00] bg-[#D2FF00] px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:bg-white hover:border-white active:translate-y-0"
          >
            Launch Platform →
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative flex min-h-[calc(100vh-4rem)] flex-col justify-between border-b border-[#23262D] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center">
            <div className="mb-6 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              <span className="inline-flex items-center gap-2 border border-[#23262D] bg-[#101216] px-3 py-1 text-[#D2FF00]">
                <span className="h-1.5 w-1.5 bg-[#D2FF00]" />
                NSE INSTITUTIONAL MICROSTRUCTURE
              </span>
              <span className="border border-[#23262D] bg-[#101216] px-3 py-1 tabular-nums">
                16,125 CAUSAL VECTORS · E01–E15 LEDGER
              </span>
            </div>

            <h1 className="font-display font-bold uppercase tracking-[-0.045em] leading-[0.88] text-[clamp(3.1rem,9.2vw,8.6rem)]">
              {HERO_LINES.map((line, lineIdx) => {
                const lineCls =
                  line.accent === "volt"
                    ? "text-[#D2FF00]"
                    : line.accent === "stroke"
                    ? "text-stroke-volt"
                    : "text-white";
                return (
                  <span key={line.text} className={`block overflow-hidden ${lineCls}`}>
                    {line.text.split("").map((ch, charIdx) => (
                      <motion.span
                        key={`${lineIdx}-${charIdx}`}
                        initial={{ y: "105%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{
                          duration: 0.42,
                          delay: lineIdx * 0.14 + charIdx * 0.022,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="inline-block"
                      >
                        {ch === " " ? "\u00A0" : ch}
                      </motion.span>
                    ))}
                  </span>
                );
              })}
            </h1>

            <div className="mt-8 grid gap-6 border-t border-[#23262D] pt-6 lg:grid-cols-12 lg:items-center">
              <p className="font-mono text-xs leading-relaxed text-zinc-400 sm:text-sm lg:col-span-7">
                Q-ARC fuses causal 4-State Gaussian HMM, 2D Kalman denoising, GARCH(1,1) volatility hazards,
                Neon pgvector historical twins, and a deterministic &lt;5ms ClaimVerifier before any NSE order
                reaches Angel One SmartAPI.
              </p>
              <div className="flex flex-wrap items-center gap-3 lg:col-span-5 lg:justify-end">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 border border-[#D2FF00] bg-[#D2FF00] px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#090A0C] transition hover:-translate-y-0.5 hover:bg-white hover:border-white"
                >
                  Launch Platform <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#engines"
                  className="inline-flex items-center gap-2 border border-[#23262D] bg-[#101216] px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
                >
                  Explore Engines
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 40s Infinite NSE Ticker Marquee */}
        <div className="overflow-hidden border-b border-[#23262D] bg-[#101216] py-3">
          <div className="animate-qarc-marquee">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, idx) => (
              <div
                key={`${item.sym}-${idx}`}
                className="flex items-center gap-4 border-r border-[#23262D] px-6 font-mono text-xs uppercase tracking-[0.12em]"
              >
                <span className="font-bold text-white">{item.sym}</span>
                <span className="text-[#D2FF00]">{item.tag}</span>
                <span className="tabular-nums text-zinc-400">{item.metric}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FOUR ENGINES. ONE EDGE. */}
        <section id="engines" className="border-b border-[#23262D] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 flex flex-col justify-between gap-4 border-b border-[#23262D] pb-6 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D2FF00]">
                  ARCHITECTURE // CAUSAL PIPELINE
                </p>
                <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] text-white sm:text-6xl">
                  FOUR ENGINES. ONE EDGE.
                </h2>
              </div>
              <p className="max-w-md font-mono text-xs leading-relaxed text-zinc-400">
                Every bar at time T reads strictly causal data &lt;= T. Unverified LLM claims are deterministically overridden.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-px bg-[#23262D] md:grid-cols-2 lg:grid-cols-4">
              {ENGINES.map((eng, idx) => {
                const Icon = eng.icon;
                return (
                  <motion.div
                    key={eng.id}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.4, delay: idx * 0.06 }}
                    className="group flex flex-col justify-between bg-[#101216] p-6 transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div>
                      <div className="mb-6 flex items-center justify-between">
                        <span className="font-mono text-xs font-bold tracking-[0.16em] text-[#D2FF00]">
                          {eng.id} // {eng.code}
                        </span>
                        <Icon className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-[#D2FF00]" />
                      </div>
                      <h3 className="font-display text-xl font-bold uppercase tracking-[-0.02em] text-white">
                        {eng.title}
                      </h3>
                      <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-400">
                        {eng.desc}
                      </p>
                    </div>
                    <div className="mt-8 border-t border-[#23262D] pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      {eng.stat}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Engine 01: PC1 x PC2 State-Space SVG Scatter Plot */}
        <section id="regime-space" className="border-b border-[#23262D] px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.45 }}
            className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-12 lg:items-center"
          >
            <div className="lg:col-span-5">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D2FF00]">
                ENGINE 01 // STATE-SPACE GEOMETRY
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] text-white sm:text-5xl">
                PC1 × PC2 REGIME MANIFOLD.
              </h2>
              <p className="mt-4 font-mono text-xs leading-relaxed text-zinc-400">
                Daily NSE bars project into an 8-dimensional state manifold across return, VWAP displacement,
                delivery ratio, Kalman trend velocity, and GARCH hazard. The active session locks inside the
                pulsing CURRENT ring.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="border border-[#23262D] bg-[#101216] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">ACTIVE PHASE</div>
                  <div className="mt-1 font-bold text-[#D2FF00]">MARKUP</div>
                </div>
                <div className="border border-[#23262D] bg-[#101216] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">RISK REGIME</div>
                  <div className="mt-1 font-bold text-[#FF3B5C]">TAIL MONITORED</div>
                </div>
              </div>
            </div>

            <div className="border border-[#23262D] bg-[#101216] p-5 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                <span>LATENT REGIME PROJECTION (PC1 × PC2)</span>
                <span className="tabular-nums text-[#D2FF00]">CURRENT: (+1.42, +0.96)</span>
              </div>
              <svg
                viewBox="0 0 480 280"
                className="h-auto w-full border border-[#23262D] bg-[#090A0C]"
                role="img"
                aria-label="PC1 by PC2 state-space scatter plot with pulsing CURRENT state ring"
              >
                {/* Grid hairlines */}
                <line x1="240" y1="12" x2="240" y2="268" stroke="#23262D" strokeWidth="1" />
                <line x1="16" y1="140" x2="464" y2="140" stroke="#23262D" strokeWidth="1" />
                <line x1="128" y1="12" x2="128" y2="268" stroke="#15181E" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="352" y1="12" x2="352" y2="268" stroke="#15181E" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="16" y1="76" x2="464" y2="76" stroke="#15181E" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="16" y1="204" x2="464" y2="204" stroke="#15181E" strokeWidth="1" strokeDasharray="3 3" />

                {/* Axis labels */}
                <text x="456" y="134" textAnchor="end" fill="#71717A" fontSize="9" fontFamily="monospace">
                  PC1 (MOMENTUM / FLOW) →
                </text>
                <text x="246" y="22" fill="#71717A" fontSize="9" fontFamily="monospace">
                  ↑ PC2 (DELIVERY / REGIME)
                </text>

                {/* Historical cluster dots */}
                {SCATTER_POINTS.map((pt) => (
                  <g key={pt.label}>
                    <circle cx={pt.x} cy={pt.y} r="4.5" fill={pt.color} fillOpacity="0.85" />
                  </g>
                ))}

                {/* Pulsing CURRENT ring */}
                <circle
                  cx={392}
                  cy={68}
                  r="13"
                  fill="none"
                  stroke="#D2FF00"
                  strokeWidth="1.5"
                  className="animate-qarc-pulse-ring"
                />
                <circle cx={392} cy={68} r="10" fill="none" stroke="#D2FF00" strokeWidth="1.25" />
                <circle cx={392} cy={68} r="4" fill="#D2FF00" />
                <text x="392" y="48" textAnchor="middle" fill="#D2FF00" fontSize="10" fontWeight="bold" fontFamily="monospace">
                  CURRENT
                </text>
              </svg>
            </div>
          </motion.div>
        </section>

        {/* Engine 02: pgvector TWIN 1-4 Similarity Bars */}
        <section id="twins" className="border-b border-[#23262D] px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.45 }}
            className="mx-auto max-w-7xl"
          >
            <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D2FF00]">
                  ENGINE 02 // NEON PGVECTOR HNSW
                </p>
                <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] text-white sm:text-5xl">
                  HISTORICAL REGIME TWINS.
                </h2>
              </div>
              <span className="border border-[#23262D] bg-[#101216] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-400">
                FILTERED: BAR_DATE &lt; AS_OF_DATE
              </span>
            </div>

            <div className="divide-y divide-[#23262D] border border-[#23262D] bg-[#101216]">
              {TWINS.map((twin) => (
                <div
                  key={twin.id}
                  className="grid grid-cols-1 items-center gap-4 px-5 py-4 md:grid-cols-12"
                >
                  <div className="font-mono text-xs font-bold text-[#D2FF00] md:col-span-2">
                    {twin.id}
                  </div>
                  <div className="font-mono text-xs text-white md:col-span-3">
                    {twin.sym} <span className="text-zinc-500">· {twin.date}</span>
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 md:col-span-2">
                    {twin.regime}
                  </div>
                  <div className="md:col-span-3">
                    <div className="mb-1 flex justify-between font-mono text-[11px] tabular-nums">
                      <span className="text-zinc-400">COSINE SIMILARITY</span>
                      <span className="font-bold text-white">{twin.sim.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#090A0C]">
                      <div
                        className="h-full bg-[#D2FF00]"
                        style={{ width: `${twin.sim}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs font-bold tabular-nums text-[#D2FF00] md:col-span-2">
                    T+5: {twin.ret}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Engine 03: NEWS BECOMES SIGNAL. */}
        <section className="border-b border-[#23262D] bg-[#090A0C] px-4 py-24 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45 }}
            className="mx-auto max-w-6xl text-center"
          >
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-400">
              ENGINE 03 // E08 CAUSAL CATALYST RAG
            </p>
            <h2 className="mt-4 font-display text-[clamp(2.8rem,8.5vw,7.4rem)] font-bold uppercase leading-[0.88] tracking-[-0.045em] text-stroke-volt">
              NEWS BECOMES SIGNAL.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl font-mono text-xs leading-relaxed text-zinc-400 sm:text-sm">
              Live NewsAPI &amp; Google News RSS feeds and NSE bulk/block deal disclosures are embedded at
              768 dimensions with gemini-embedding-001 and queried strictly on filing_date &lt;= T.
            </p>
            <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-px bg-[#23262D] font-mono text-[11px] uppercase tracking-wider sm:grid-cols-3">
              <div className="bg-[#101216] p-4 text-zinc-300">01 // NEWSAPI + RSS</div>
              <div className="bg-[#101216] p-4 text-[#D2FF00]">02 // GEMINI 768D VECTOR</div>
              <div className="bg-[#101216] p-4 text-zinc-300">03 // E08 LEDGER CITATION</div>
            </div>
          </motion.div>
        </section>

        {/* Engine 04: Inverted #D2FF00 Execution Band */}
        <section id="execution" className="border-b border-[#23262D] bg-[#D2FF00] px-4 py-20 text-[#090A0C] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em]">
                ENGINE 04 // DETERMINISTIC RISK GATE
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] sm:text-6xl">
                ZERO CONTRADICTIONS. PAPER OR LIVE.
              </h2>
              <p className="mt-4 font-mono text-xs font-medium leading-relaxed text-[#090A0C]/80 sm:text-sm">
                Every order clears four non-negotiable gates before execution: ClaimVerifier contradiction
                count == 0, Factor 4B exhaustion block on BUY, Rs.25,000 notional cap, and +/-2.0% live LTP
                price collar.
              </p>
              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 border border-[#090A0C] bg-[#090A0C] px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#D2FF00] transition hover:-translate-y-0.5 hover:bg-zinc-900"
                >
                  Open Live Execution Terminal →
                </Link>
              </div>
            </div>

            <div className="border border-[#090A0C] bg-[#090A0C] p-5 text-zinc-100 lg:col-span-6">
              <div className="mb-4 flex items-center justify-between border-b border-[#23262D] pb-3 font-mono text-[11px]">
                <span className="flex items-center gap-2 text-[#D2FF00]">
                  <Terminal className="h-3.5 w-3.5" />
                  POST /api/execute_trade
                </span>
                <span className="border border-[#23262D] bg-[#101216] px-2 py-0.5 text-[10px] text-zinc-400">
                  MODE: PAPER DEFAULT
                </span>
              </div>
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300 tabular-nums">
{`{
  "ticker": "RELIANCE",
  "side": "BUY",
  "quantity": 1,
  "price": 1337.00,
  "mode": "PAPER",
  "unresolved_contradictions": 0,
  "has_factor_4b": false
}

// RESPONSE 200 OK -> NEON trade_executions
{
  "status": "PAPER_FILLED",
  "notional_inr": 1337.00,
  "collar_check": "PASS (+/-2.0%)",
  "db_row_id": 2
}`}
              </pre>
            </div>
          </div>
        </section>
      </main>

      {/* Watermark Footer */}
      <footer className="relative overflow-hidden bg-[#090A0C] px-4 py-14 sm:px-6 lg:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none select-none text-center font-display text-[19vw] font-bold uppercase leading-none tracking-[-0.06em] text-white/[0.03]"
        >
          Q-ARC
        </div>
        <div className="mx-auto mt-4 flex max-w-7xl flex-col items-start justify-between gap-4 border-t border-[#23262D] pt-6 font-mono text-xs text-zinc-500 sm:flex-row sm:items-center">
          <span>Q-ARC NEURO-SYMBOLIC BCP v2 // FASTAPI + NEON PGVECTOR + NEXT.JS</span>
          <div className="flex items-center gap-6 uppercase tracking-wider">
            <a href="#engines" className="hover:text-[#D2FF00]">
              Engines
            </a>
            <Link href="/dashboard" className="text-[#D2FF00] hover:underline">
              Dashboard →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
