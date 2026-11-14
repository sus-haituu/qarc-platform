import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ALLOWED_TICKER_RE = /^[A-Z0-9&-]{2,20}$/;

async function loadSnapshot() {
  const snapPath = path.join(process.cwd(), "public", "qarc_telemetry_snapshot.json");
  const raw = await fs.readFile(snapPath, "utf-8");
  return JSON.parse(raw);
}

export async function GET(req: NextRequest) {
  try {
    const snapshot = await loadSnapshot();
    const tickerParam = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
    if (tickerParam && snapshot.securities?.[tickerParam]) {
      return NextResponse.json({
        mode: "snapshot",
        security: snapshot.securities[tickerParam],
        backtest_summary: snapshot.backtest_summary,
        factor_evidence: snapshot.factor_evidence,
        reliability_audit: snapshot.reliability_audit,
        tickers: snapshot.tickers,
      });
    }
    return NextResponse.json(snapshot);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load telemetry snapshot" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = String(body?.ticker || "RELIANCE").trim().toUpperCase();
    const filings = String(body?.filings || "none").slice(0, 120);

    if (!ALLOWED_TICKER_RE.test(ticker)) {
      return NextResponse.json({ error: "Invalid NSE ticker symbol" }, { status: 400 });
    }

    // Fast-path (<350ms): try persistent FastAPI daemon first so Angel One JWT stays warm
    try {
      const fastApiRes = await fetch("http://127.0.0.1:8000/api/bcp_analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, filings, use_live_angel: true }),
        signal: AbortSignal.timeout(3500),
      });
      if (fastApiRes.ok) {
        const fastData = await fastApiRes.json();
        return NextResponse.json(
          fastData.analysis
            ? fastData
            : { mode: "fastapi_daemon", analysis: fastData, ...fastData }
        );
      }
    } catch {
      // FastAPI daemon not running on :8000 — gracefully fall back to Python subprocess / snapshot below
    }

    const parentDir = path.resolve(process.cwd(), "..");
    const pythonExe = path.join(parentDir, "venv", "Scripts", "python.exe");

    try {
      const pyScript = [
        "import json, sys, numpy as np",
        "from main import analyze_bcp_endpoint",
        "res = analyze_bcp_endpoint(sys.argv[1], filings=sys.argv[2])",
        "k = res.get('quant_anchors', {}).get('kalman', {})",
        "k.pop('kalman_price_series', None); k.pop('velocity_series', None)",
        "print(json.dumps(res, default=lambda x: float(x) if isinstance(x, np.floating) else int(x) if isinstance(x, np.integer) else str(x)))",
      ].join("; ");

      const { stdout } = await execFileAsync(pythonExe, ["-c", pyScript, ticker, filings], {
        cwd: parentDir,
        timeout: 25000,
      });

      const lastLine = stdout.trim().split("\n").pop() || "{}";
      const liveAnalysis = JSON.parse(lastLine);
      return NextResponse.json({ mode: "live_python_backend", analysis: liveAnalysis });
    } catch {
      const snapshot = await loadSnapshot();
      const cached = snapshot.securities?.[ticker];
      if (!cached) {
        return NextResponse.json({ error: `Ticker ${ticker} not available` }, { status: 404 });
      }
      return NextResponse.json({ mode: "snapshot_fallback", analysis: cached });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

