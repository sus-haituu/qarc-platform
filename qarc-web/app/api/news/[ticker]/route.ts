import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const ALLOWED_TICKER_RE = /^[A-Z0-9&-]{2,20}$/;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await context.params;
  const ticker = String(rawTicker || "")
    .trim()
    .toUpperCase()
    .replace(/\.NS$/i, "")
    .replace(/-EQ$/i, "");

  if (!ALLOWED_TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "Invalid NSE ticker symbol" }, { status: 400 });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 5);
  const limit = Math.max(1, Math.min(20, Number.isFinite(limitRaw) ? limitRaw : 5));
  const daysBackRaw = Number(req.nextUrl.searchParams.get("days_back") || 3);
  const daysBack = Math.max(1, Math.min(30, Number.isFinite(daysBackRaw) ? daysBackRaw : 3));

  try {
    const fastApiRes = await fetch(
      `http://127.0.0.1:8000/api/news/${encodeURIComponent(ticker)}?days_back=${daysBack}&limit=${limit}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (fastApiRes.ok) {
      return NextResponse.json(await fastApiRes.json());
    }
  } catch {
    // FastAPI daemon offline — fall back to Python backend helper
  }

  const parentDir = path.resolve(process.cwd(), "..");
  const pythonExe = path.join(parentDir, "venv", "Scripts", "python.exe");
  try {
    const pyScript = [
      "import json, sys",
      "from main import get_ticker_news_endpoint",
      "res = get_ticker_news_endpoint(sys.argv[1], days_back=int(sys.argv[2]), limit=int(sys.argv[3]))",
      "print(json.dumps(res))",
    ].join("; ");
    const { stdout } = await execFileAsync(
      pythonExe,
      ["-c", pyScript, ticker, String(daysBack), String(limit)],
      { cwd: parentDir, timeout: 15000 }
    );
    const lastLine = stdout.trim().split("\n").pop() || "{}";
    return NextResponse.json(JSON.parse(lastLine));
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `Failed to fetch news for ${ticker}` },
      { status: 502 }
    );
  }
}
