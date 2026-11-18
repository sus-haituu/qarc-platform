"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  Cpu,
  Database,
  LogOut,
  Radio,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import StockLogo from "@/components/StockLogo";

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

const STORY_CHAPTERS = [
  {
    step: "01",
    tag: "01 // WHAT IS Q-ARC",
    railLabel: "01 // WHAT IS Q-ARC",
    title: "What is Q-ARC",
    body: "A causal neuro-symbolic NSE intelligence engine combining 4-state regime math, vector memory, and a fine-tuned 70B LLM.",
    highlights: [
      "Unified E01–E15 causal telemetry ledger per NSE ticker",
      "Plain-English investor translation alongside raw quant math",
    ],
    badge: "8D STATE-SPACE + 70B AI",
    accent: "volt" as const,
  },
  {
    step: "02",
    tag: "02 // WHY Q-ARC",
    railLabel: "02 // WHY Q-ARC",
    title: "Why Q-ARC",
    body: "Standard LLM bots hallucinate prices and leak future data. Q-ARC enforces strict T <= as_of_date causality and deterministic verification.",
    highlights: [
      "Prevents forward-bar leakage across every technical & news feature",
      "Rejects fabricated institutional buyer stories & ungrounded targets",
    ],
    badge: "STRICT T <= AS_OF_DATE CAUSALITY",
    accent: "signal" as const,
  },
  {
    step: "03",
    tag: "03 // WHAT'S BETTER",
    railLabel: "03 // WHAT'S BETTER",
    title: "What's Better",
    body: "Zero look-ahead leakage, <5ms deterministic ClaimVerifier pre-trade locks, plain-English explanations, and safe Paper/Angel One execution.",
    highlights: [
      "Deterministic <5ms ClaimVerifier enforces 0 contradictions",
      "Paper simulation default + two-step armed Angel One guard",
    ],
    badge: "<5MS CLAIMVERIFIER + SAFE EXECUTION",
    accent: "volt" as const,
  },
];

const ENGINES = [
  {
    id: "01",
    code: "STATE-SPACE QUANT",
    title: "Causal 4-State HMM & Kalman",
    tagline: "Filters microstructure noise into causal market phases.",
    points: [
      "2D Kalman velocity separates trend from tick noise",
      "GARCH(1,1) MLE & causal HMM score 4 market regimes",
      "10K-path Monte Carlo CVaR(95%) sizes tail caps strictly",
    ],
    stat: "0 LOOK-AHEAD LEAKAGE",
    icon: Cpu,
  },
  {
    id: "02",
    code: "PGVECTOR MEMORY",
    title: "8D Regime Twin Retrieval",
    tagline: "Finds true historical analogs in <10ms via HNSW.",
    points: [
      "Projects return, VWAP, delivery & Hurst into 8D vectors",
      "Queries 16,125 historical NSE sessions strictly < T",
      "Surfaces actual T+1 and T+5 twin forward outcomes",
    ],
    stat: "16,125 NSE VECTORS",
    icon: Database,
  },
  {
    id: "03",
    code: "E08 CAUSAL RAG",
    title: "News & Bulk Deal Grounding",
    tagline: "Date-fenced catalyst retrieval with zero leakage.",
    points: [
      "Embeds NSE bulk deals & live news feeds at 768D",
      "gemini-embedding-001 semantic similarity scoring",
      "Hard filing_date <= T filter blocks future spoilers",
    ],
    stat: "STRICT DATE CUTOFF",
    icon: Radio,
  },
  {
    id: "04",
    code: "PRE-TRADE GATE",
    title: "ClaimVerifier & Angel Switch",
    tagline: "Hard mathematical safety before any order leaves.",
    points: [
      "<5ms ClaimVerifier enforces 0 contradictions across 7 fields",
      "Factor 4B churn lock blocks trapped BUY entries",
      "Rs.25,000 cap & +/-2% LTP collar guard execution",
    ],
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

function GoogleGIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function MaskedWords({
  text,
  className = "",
  reducedMotion,
}: {
  text: string;
  className?: string;
  reducedMotion: boolean;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, idx) => (
        <span key={`${word}-${idx}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            initial={reducedMotion ? false : { y: "110%", opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.45 }}
            transition={{
              duration: reducedMotion ? 0 : 0.45,
              delay: reducedMotion ? 0 : idx * 0.055,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-block"
          >
            {word}
            {idx < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function SpotlightCard({
  children,
  className = "",
  accentHex = "rgba(210, 255, 0, 0.12)",
}: {
  children: React.ReactNode;
  className?: string;
  accentHex?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  return (
    <div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          active: true,
        });
      }}
      onMouseLeave={() => setPos((p) => ({ ...p, active: false }))}
      className={`relative overflow-hidden ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(360px circle at ${pos.x}px ${pos.y}px, ${accentHex}, transparent 70%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export default function LandingPage() {
  const reducedMotion = Boolean(useReducedMotion());
  const { data: session, status } = useSession();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);

  const whySectionRef = useRef<HTMLElement>(null);
  const enginesSectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: whySectionRef,
    offset: ["start 80%", "end 30%"],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    mass: 0.4,
  });
  const stickyY = useTransform(smoothProgress, [0, 1], reducedMotion ? [0, 0] : [14, -14]);

  const { scrollYProgress: enginesScrollProgress } = useScroll({
    target: enginesSectionRef,
    offset: ["start end", "end start"],
  });
  const watermarkX = useTransform(
    enginesScrollProgress,
    [0, 1],
    reducedMotion ? ["0%", "0%"] : ["6%", "-22%"]
  );

  const userInitial =
    session?.user?.name?.trim()?.charAt(0)?.toUpperCase() ||
    session?.user?.email?.trim()?.charAt(0)?.toUpperCase() ||
    "Q";

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100">
      {/* Sticky Blur Navbar */}
      <header className="sticky top-0 z-50 border-b border-[#23262D] bg-[#090A0C]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <motion.a
            href="#"
            initial={reducedMotion ? false : { opacity: 0, x: -16, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            whileHover={reducedMotion ? undefined : { x: 2 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="group relative inline-flex items-center gap-2 py-1"
            aria-label="Q-ARC Home"
          >
            <span className="font-display text-2xl font-black uppercase tracking-tighter md:text-3xl">
              <span className="inline-block text-[#D2FF00] drop-shadow-[0_0_12px_rgba(210,255,0,0.65)] transition-all duration-300 group-hover:drop-shadow-[0_0_18px_rgba(210,255,0,0.95)] motion-safe:animate-pulse">
                Q
              </span>
              <span className="inline-block text-white transition-all duration-300 group-hover:tracking-normal group-hover:text-zinc-100">
                -ARC
              </span>
            </span>
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#D2FF00] opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D2FF00]" />
            </span>
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 left-0 h-[2px] w-7 bg-[#D2FF00] transition-all duration-300 group-hover:w-full"
            />
          </motion.a>

          <nav className="hidden items-center gap-7 font-mono text-xs uppercase tracking-[0.14em] text-zinc-400 md:flex">
            <a href="#why-qarc" className="transition-colors hover:text-[#D2FF00]">
              Why Q-ARC
            </a>
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

          {/* Top-Right Google OAuth Control + Launch Platform */}
          <div className="flex items-center gap-2 sm:gap-3">
            {status === "authenticated" && session?.user ? (
              <>
                <div className="hidden items-center gap-2 rounded-md border border-[#23262D] bg-[#101216] px-2.5 py-1.5 sm:flex">
                  {session.user.image && !avatarFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name || "Google User"}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                      className="h-5 w-5 rounded-sm border border-[#23262D] object-cover"
                    />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#D2FF00] font-mono text-[10px] font-bold text-[#090A0C]">
                      {userInitial}
                    </span>
                  )}
                  <span className="max-w-[140px] truncate font-mono text-[11px] text-zinc-200">
                    {session.user.name || session.user.email}
                  </span>
                </div>

                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white active:translate-y-0"
                >
                  Dashboard →
                </Link>

                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="inline-flex items-center gap-1.5 border border-[#23262D] bg-[#101216] px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:border-[#FF3B5C] hover:text-[#FF3B5C]"
                  title="Sign Out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={status === "loading"}
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="inline-flex items-center gap-2 border border-[#23262D] bg-[#101216] px-3.5 py-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-zinc-100 transition hover:border-[#D2FF00] hover:text-[#D2FF00] disabled:cursor-wait disabled:opacity-70"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-white">
                    <GoogleGIcon />
                  </span>
                  <span className="hidden sm:inline">
                    {status === "loading" ? "Checking..." : "Sign in with Google"}
                  </span>
                  <span className="sm:hidden">Sign in</span>
                </button>

                <button
                  type="button"
                  disabled={status === "loading"}
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="inline-flex items-center gap-1.5 border border-[#D2FF00] bg-[#D2FF00] px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
                >
                  Launch Platform →
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative flex min-h-[calc(100vh-4rem)] flex-col justify-between border-b border-[#23262D] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.45 }}
              className="mb-6 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400"
            >
              <span className="inline-flex items-center gap-2 border border-[#23262D] bg-[#101216] px-3 py-1 text-[#D2FF00]">
                <span className="h-1.5 w-1.5 bg-[#D2FF00]" />
                NSE INSTITUTIONAL MICROSTRUCTURE
              </span>
              <span className="border border-[#23262D] bg-[#101216] px-3 py-1 tabular-nums">
                16,125 CAUSAL VECTORS · E01–E15 LEDGER
              </span>
            </motion.div>

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
                        initial={reducedMotion ? false : { y: "105%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{
                          duration: reducedMotion ? 0 : 0.42,
                          delay: reducedMotion ? 0 : lineIdx * 0.14 + charIdx * 0.022,
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

            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.35 }}
              className="mt-8 grid gap-6 border-t border-[#23262D] pt-6 lg:grid-cols-12 lg:items-center"
            >
              <p className="font-mono text-xs leading-relaxed text-zinc-400 sm:text-sm lg:col-span-7">
                Q-ARC fuses causal 4-State Gaussian HMM, 2D Kalman denoising, GARCH(1,1) volatility hazards,
                Neon pgvector historical twins, and a deterministic &lt;5ms ClaimVerifier before any NSE order
                reaches Angel One SmartAPI.
              </p>
              <div className="flex flex-wrap items-center gap-3 lg:col-span-5 lg:justify-end">
                {status === "authenticated" && session?.user ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 border border-[#D2FF00] bg-[#D2FF00] px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white"
                  >
                    Launch Platform <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={status === "loading"}
                    onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                    className="inline-flex items-center gap-2 border border-[#D2FF00] bg-[#D2FF00] px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#090A0C] transition hover:-translate-y-0.5 hover:border-white hover:bg-white disabled:cursor-wait disabled:opacity-70"
                  >
                    Launch Platform <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                <a
                  href="#why-qarc"
                  className="inline-flex items-center gap-2 border border-[#23262D] bg-[#101216] px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:border-[#D2FF00] hover:text-[#D2FF00]"
                >
                  Why Q-ARC
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 40s Infinite NSE Ticker Marquee */}
        <div className="overflow-hidden border-b border-[#23262D] bg-[#101216] py-3">
          <div className="animate-qarc-marquee">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, idx) => (
              <div
                key={`${item.sym}-${idx}`}
                className="flex items-center gap-3.5 border-r border-[#23262D] px-6 font-mono text-xs uppercase tracking-[0.12em]"
              >
                <StockLogo symbol={item.sym} size="xs" />
                <span className="font-bold text-white">{item.sym}</span>
                <span className="text-[#D2FF00]">{item.tag}</span>
                <span className="tabular-nums text-zinc-400">{item.metric}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 1: Vertical-Scroll "WHY Q-ARC?" Experience */}
        <section
          id="why-qarc"
          ref={whySectionRef}
          className="relative border-b border-[#23262D] bg-[#090A0C] px-4 py-24 sm:px-6 lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
            {/* Sticky Left Editorial Column & Progress Rail */}
            <motion.div
              style={{ y: stickyY }}
              className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start"
            >
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D2FF00]">
                BRIEFING // REGIME DISCIPLINE
              </p>
              <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-[0.94] tracking-[-0.035em] text-white sm:text-6xl">
                <MaskedWords text="WHY Q-ARC?" reducedMotion={reducedMotion} />
              </h2>
              <p className="mt-4 max-w-md font-mono text-xs leading-relaxed text-zinc-400 sm:text-sm">
                Markets punish intuition and unverified AI narratives. Scroll the 3 structural shifts
                separating hype from causal execution.
              </p>

              {/* Sticky Vertical Progress Rail */}
              <div className="mt-8 rounded-2xl border border-[#23262D] bg-[#101216] p-5">
                <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
                  <span className="text-zinc-400">CAUSAL SCROLL RAIL</span>
                  <span className="tabular-nums text-[#D2FF00]">
                    STEP {STORY_CHAPTERS[activeChapter].step} / 03
                  </span>
                </div>
                <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-[#090A0C]">
                  <motion.div
                    className="h-full origin-left bg-[#D2FF00]"
                    style={{ scaleX: reducedMotion ? 1 : smoothProgress }}
                  />
                </div>
                <div className="relative space-y-2.5 pl-4">
                  <div
                    aria-hidden="true"
                    className="absolute bottom-2 left-1 top-2 w-0.5 bg-[#23262D]"
                  >
                    <motion.div
                      className="w-full origin-top bg-[#D2FF00]"
                      style={{ height: "100%", scaleY: reducedMotion ? 1 : smoothProgress }}
                    />
                  </div>
                  {STORY_CHAPTERS.map((chap, i) => {
                    const isActive = activeChapter === i;
                    const isSignal = chap.accent === "signal";
                    return (
                      <div
                        key={chap.step}
                        className={`relative rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-all ${isActive
                          ? isSignal
                            ? "border-[#FF3B5C]/70 bg-[#FF3B5C]/10 text-[#FF3B5C]"
                            : "border-[#D2FF00]/70 bg-[#D2FF00]/10 text-[#D2FF00]"
                          : "border-[#23262D] bg-[#090A0C] text-zinc-500"
                          }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute -left-[19px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border ${isActive
                            ? isSignal
                              ? "border-[#FF3B5C] bg-[#FF3B5C] shadow-[0_0_8px_#FF3B5C]"
                              : "border-[#D2FF00] bg-[#D2FF00] shadow-[0_0_8px_#D2FF00]"
                            : "border-[#23262D] bg-[#090A0C]"
                            }`}
                        />
                        {chap.railLabel}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Right Vertical Storytelling Stack */}
            <div className="space-y-8 lg:col-span-7">
              {STORY_CHAPTERS.map((chap, idx) => {
                const isSignal = chap.accent === "signal";
                const isActive = activeChapter === idx;
                return (
                  <motion.div
                    key={chap.step}
                    initial={reducedMotion ? false : { opacity: 0, y: 28 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    onViewportEnter={() => setActiveChapter(idx)}
                    viewport={{ once: false, amount: 0.45 }}
                    whileHover={reducedMotion ? undefined : { y: -3 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.48,
                      delay: reducedMotion ? 0 : idx * 0.05,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <SpotlightCard
                      accentHex={
                        isSignal ? "rgba(255, 59, 92, 0.14)" : "rgba(210, 255, 0, 0.12)"
                      }
                      className={`rounded-2xl border bg-[#101216] p-6 transition-colors duration-300 sm:p-8 ${isActive
                        ? isSignal
                          ? "border-[#FF3B5C]/80"
                          : "border-[#D2FF00]/80"
                        : "border-[#23262D] hover:border-zinc-600"
                        }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#23262D] pb-4">
                        <span
                          className={`font-mono text-xs font-bold uppercase tracking-[0.16em] ${isSignal ? "text-[#FF3B5C]" : "text-[#D2FF00]"
                            }`}
                        >
                          {chap.tag}
                        </span>
                        <span className="rounded-md border border-[#23262D] bg-[#090A0C] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                          {chap.badge}
                        </span>
                      </div>

                      <div className="mt-5 flex items-baseline gap-4">
                        <span
                          className={`font-display text-4xl font-bold tabular-nums sm:text-5xl ${isSignal ? "text-[#FF3B5C]" : "text-stroke-volt"
                            }`}
                        >
                          {chap.step}
                        </span>
                        <h3 className="font-display text-2xl font-bold uppercase tracking-[-0.025em] text-white sm:text-3xl">
                          {chap.title}
                        </h3>
                      </div>

                      <p className="mt-4 font-mono text-xs leading-relaxed text-zinc-200 sm:text-sm">
                        {chap.body}
                      </p>

                      <ul className="mt-5 grid gap-2.5 border-t border-[#23262D] pt-4 sm:grid-cols-2">
                        {chap.highlights.map((pt) => (
                          <li
                            key={pt}
                            className="flex items-start gap-2 font-mono text-[11px] leading-snug text-zinc-400"
                          >
                            <span
                              className={`mt-1 h-1.5 w-1.5 shrink-0 ${isSignal ? "bg-[#FF3B5C]" : "bg-[#D2FF00]"
                                }`}
                            />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </SpotlightCard>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 2: FOUR ENGINES. ONE EDGE. */}
        <section
          id="engines"
          ref={enginesSectionRef}
          className="relative overflow-hidden border-b border-[#23262D] px-4 py-20 sm:px-6 lg:px-8"
        >
          {/* Horizontal Scroll-Scrubbed Watermark */}
          <motion.div
            aria-hidden="true"
            style={{ x: watermarkX }}
            className="pointer-events-none absolute left-0 top-6 select-none whitespace-nowrap font-display text-[13vw] font-black uppercase leading-none tracking-[-0.05em] text-white/[0.025]"
          >
            CAUSAL STATE-SPACE · PGVECTOR · E08 RAG · PRE-TRADE GATE
          </motion.div>

          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mb-12 flex flex-col justify-between gap-4 border-b border-[#23262D] pb-6 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D2FF00]">
                  ARCHITECTURE // CAUSAL PIPELINE
                </p>
                <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] text-white sm:text-6xl">
                  <MaskedWords text="FOUR ENGINES." reducedMotion={reducedMotion} />{" "}
                  <span className="text-[#D2FF00]">
                    <MaskedWords text="ONE EDGE." reducedMotion={reducedMotion} />
                  </span>
                </h2>
              </div>
              <p className="max-w-md font-mono text-xs uppercase leading-relaxed tracking-[0.06em] text-zinc-400">
                EVERY SIGNAL GROUNDED IN CAUSAL MATH (&lt;= T). ZERO HALLUCINATED NARRATIVES.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {ENGINES.map((eng, idx) => {
                const Icon = eng.icon;
                return (
                  <motion.div
                    key={eng.id}
                    initial={reducedMotion ? false : { opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    whileHover={reducedMotion ? undefined : { y: -4 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.42,
                      delay: reducedMotion ? 0 : idx * 0.07,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <SpotlightCard className="group flex h-full flex-col justify-between rounded-2xl border border-[#23262D] bg-[#101216] p-6 transition-colors duration-200 hover:border-[#D2FF00]/60">
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <div className="mb-5 flex items-center justify-between">
                            <span className="font-mono text-xs font-bold tracking-[0.16em] text-[#D2FF00]">
                              {eng.id} // {eng.code}
                            </span>
                            <Icon className="h-4 w-4 text-zinc-500 transition-transform duration-200 group-hover:scale-110 group-hover:text-[#D2FF00]" />
                          </div>
                          <h3 className="font-display text-xl font-bold uppercase tracking-[-0.02em] text-white">
                            {eng.title}
                          </h3>
                          <p className="mt-2 font-mono text-xs font-semibold text-zinc-200">
                            {eng.tagline}
                          </p>
                          <ul className="mt-4 space-y-2.5">
                            {eng.points.map((point, ptIdx) => (
                              <motion.li
                                key={point}
                                initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{
                                  duration: reducedMotion ? 0 : 0.32,
                                  delay: reducedMotion ? 0 : idx * 0.06 + ptIdx * 0.05,
                                }}
                                className="flex items-start gap-2 font-mono text-xs leading-snug text-zinc-400"
                              >
                                <span className="mt-1.5 h-1 w-1 shrink-0 bg-[#D2FF00]" />
                                <span>{point}</span>
                              </motion.li>
                            ))}
                          </ul>
                        </div>
                        <div className="mt-8 border-t border-[#23262D] pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors group-hover:text-[#D2FF00]">
                          {eng.stat}
                        </div>
                      </div>
                    </SpotlightCard>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Engine 01: PC1 x PC2 State-Space SVG Scatter Plot */}
        <section id="regime-space" className="border-b border-[#23262D] px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reducedMotion ? 0 : 0.45 }}
            className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-12 lg:items-center"
          >
            <div className="lg:col-span-5">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D2FF00]">
                ENGINE 01 // STATE-SPACE GEOMETRY
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] text-white sm:text-5xl">
                <MaskedWords text="PC1 × PC2 REGIME MANIFOLD." reducedMotion={reducedMotion} />
              </h2>
              <p className="mt-4 font-mono text-xs leading-relaxed text-zinc-400">
                Daily NSE bars project into an 8-dimensional state manifold across return, VWAP displacement,
                delivery ratio, Kalman trend velocity, and GARCH hazard. The active session locks inside the
                pulsing CURRENT ring.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="border border-[#23262D] bg-[#101216] p-3 transition-colors hover:border-[#D2FF00]/60">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">ACTIVE PHASE</div>
                  <div className="mt-1 font-bold text-[#D2FF00]">MARKUP</div>
                </div>
                <div className="border border-[#23262D] bg-[#101216] p-3 transition-colors hover:border-[#FF3B5C]/60">
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
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reducedMotion ? 0 : 0.45 }}
            className="mx-auto max-w-7xl"
          >
            <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D2FF00]">
                  ENGINE 02 // NEON PGVECTOR HNSW
                </p>
                <h2 className="mt-2 font-display text-4xl font-bold uppercase tracking-[-0.03em] text-white sm:text-5xl">
                  <MaskedWords text="HISTORICAL REGIME TWINS." reducedMotion={reducedMotion} />
                </h2>
              </div>
              <span className="border border-[#23262D] bg-[#101216] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-400">
                FILTERED: BAR_DATE &lt; AS_OF_DATE
              </span>
            </div>

            <div className="divide-y divide-[#23262D] border border-[#23262D] bg-[#101216]">
              {TWINS.map((twin, idx) => (
                <motion.div
                  key={twin.id}
                  initial={reducedMotion ? false : { opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.38,
                    delay: reducedMotion ? 0 : idx * 0.06,
                  }}
                  className="grid grid-cols-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-[#14171E] md:grid-cols-12"
                >
                  <div className="font-mono text-xs font-bold text-[#D2FF00] md:col-span-2">
                    {twin.id}
                  </div>
                  <div className="flex items-center gap-2.5 font-mono text-xs text-white md:col-span-3">
                    <StockLogo symbol={twin.sym} size="sm" />
                    <span>
                      {twin.sym} <span className="text-zinc-500">· {twin.date}</span>
                    </span>
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
                      <motion.div
                        initial={reducedMotion ? false : { width: 0 }}
                        whileInView={{ width: `${twin.sim}%` }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{
                          duration: reducedMotion ? 0 : 0.7,
                          delay: reducedMotion ? 0 : idx * 0.08,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="h-full bg-[#D2FF00]"
                      />
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs font-bold tabular-nums text-[#D2FF00] md:col-span-2">
                    T+5: {twin.ret}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Engine 03: NEWS BECOMES SIGNAL. */}
        <section className="border-b border-[#23262D] bg-[#090A0C] px-4 py-24 sm:px-6 lg:px-8">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: reducedMotion ? 0 : 0.45 }}
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
              {[
                { label: "01 // NEWSAPI + RSS", volt: false },
                { label: "02 // GEMINI 768D VECTOR", volt: true },
                { label: "03 // E08 LEDGER CITATION", volt: false },
              ].map((pill, i) => (
                <motion.div
                  key={pill.label}
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.35,
                    delay: reducedMotion ? 0 : i * 0.08,
                  }}
                  className={`bg-[#101216] p-4 ${pill.volt ? "text-[#D2FF00]" : "text-zinc-300"}`}
                >
                  {pill.label}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Engine 04: Inverted #D2FF00 Execution Band */}
        <section id="execution" className="border-b border-[#23262D] bg-[#D2FF00] px-4 py-20 text-[#090A0C] sm:px-6 lg:px-8">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reducedMotion ? 0 : 0.45 }}
            className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12 lg:items-center"
          >
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
                {status === "authenticated" && session?.user ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 border border-[#090A0C] bg-[#090A0C] px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#D2FF00] transition hover:-translate-y-0.5 hover:bg-zinc-900"
                  >
                    Open Live Execution Terminal →
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={status === "loading"}
                    onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                    className="inline-flex items-center gap-2 border border-[#090A0C] bg-[#090A0C] px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#D2FF00] transition hover:-translate-y-0.5 hover:bg-zinc-900 disabled:cursor-wait disabled:opacity-70"
                  >
                    Open Live Execution Terminal →
                  </button>
                )}
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
          </motion.div>
        </section>
      </main>

      {/* Watermark Footer */}
      <footer className="relative overflow-hidden bg-[#090A0C] px-4 py-14 sm:px-6 lg:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none select-none text-center font-display text-[19vw] font-black uppercase leading-none tracking-[-0.06em]"
        >
          <span className="text-[#D2FF00]/[0.06]">Q</span>
          <span className="text-white/[0.03]">-ARC</span>
        </div>
        <div className="mx-auto mt-4 flex max-w-7xl flex-col items-start justify-between gap-4 border-t border-[#23262D] pt-6 font-mono text-xs text-zinc-500 sm:flex-row sm:items-center">
          <span>Q-ARC // FASTAPI + NEON PGVECTOR + NEXT.JS</span>
          <div className="flex items-center gap-6 uppercase tracking-wider">
            <a href="#why-qarc" className="hover:text-[#D2FF00]">
              Why Q-ARC
            </a>
            <a href="#engines" className="hover:text-[#D2FF00]">
              Engines
            </a>
            {status === "authenticated" && session?.user ? (
              <Link href="/dashboard" className="text-[#D2FF00] hover:underline">
                Dashboard →
              </Link>
            ) : (
              <button
                type="button"
                disabled={status === "loading"}
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="uppercase tracking-wider text-[#D2FF00] hover:underline disabled:opacity-70"
              >
                Dashboard →
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
