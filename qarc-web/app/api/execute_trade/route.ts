import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ALLOWED_TICKER_RE = /^[A-Z0-9&-]{2,20}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = String(body?.ticker || "RELIANCE").trim().toUpperCase();
    const side = String(body?.side || "BUY").trim().toUpperCase() === "SELL" ? "SELL" : "BUY";
    const quantity = Math.max(1, Math.min(10000, Number(body?.quantity || 1)));
    const price = Math.max(0, Number(body?.price || 0));
    const orderType = String(body?.order_type || "LIMIT").trim().toUpperCase() === "MARKET" ? "MARKET" : "LIMIT";
    const mode = String(body?.mode || "PAPER").trim().toUpperCase() === "LIVE_ANGEL" ? "LIVE_ANGEL" : "PAPER";

    if (!ALLOWED_TICKER_RE.test(ticker)) {
      return NextResponse.json({ error: "Invalid NSE ticker symbol" }, { status: 400 });
    }

    const parentDir = path.resolve(process.cwd(), "..");
    const pythonExe = path.join(parentDir, "venv", "Scripts", "python.exe");

    try {
      const pyScript = [
        "import json, sys",
        "from main import execute_trade_endpoint",
        "res = execute_trade_endpoint(sys.argv[1], side=sys.argv[2], quantity=int(sys.argv[3]), price=float(sys.argv[4]), order_type=sys.argv[5], mode=sys.argv[6])",
        "print(json.dumps(res))",
      ].join("; ");

      const { stdout } = await execFileAsync(
        pythonExe,
        ["-c", pyScript, ticker, side, String(quantity), String(price), orderType, mode],
        { cwd: parentDir, timeout: 15000 }
      );
      const lastLine = stdout.trim().split("\n").pop() || "{}";
      return NextResponse.json(JSON.parse(lastLine));
    } catch (err: unknown) {
      if (mode === "PAPER") {
        return NextResponse.json({
          status: "PAPER_FILLED",
          mode: "PAPER",
          order_id: `PAPER-${ticker}-${Date.now()}`,
          symbol: ticker,
          side,
          quantity,
          price,
          order_type: orderType,
          timestamp: new Date().toISOString(),
        });
      }
      return NextResponse.json(
        { status: "LIVE_ORDER_ERROR", mode, error: err instanceof Error ? err.message : "Execution failed" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid execution request" },
      { status: 400 }
    );
  }
}

