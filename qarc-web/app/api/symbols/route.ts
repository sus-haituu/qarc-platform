import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { NSE_STATIC_SYMBOL_TOKENS, normalizeNseSymbol } from "@/lib/qarcApi";

const execFileAsync = promisify(execFile);

export async function GET(req: NextRequest) {
  const q = normalizeNseSymbol(req.nextUrl.searchParams.get("q") || "");
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 15);
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 15));

  try {
    const fastApiRes = await fetch(
      `http://127.0.0.1:8000/api/symbols?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (fastApiRes.ok) {
      return NextResponse.json(await fastApiRes.json());
    }
  } catch {
    // FastAPI daemon offline — fall back to Python Scrip Master helper
  }

  const parentDir = path.resolve(process.cwd(), "..");
  const pythonExe = path.join(parentDir, "venv", "Scripts", "python.exe");
  try {
    const pyScript = [
      "import json, sys",
      "from qarc_angel_client import search_nse_symbols",
      "print(json.dumps(search_nse_symbols(sys.argv[1], int(sys.argv[2]))))",
    ].join("; ");
    const { stdout } = await execFileAsync(
      pythonExe,
      ["-c", pyScript, q, String(limit)],
      { cwd: parentDir, timeout: 15000 }
    );
    const lastLine = stdout.trim().split("\n").pop() || "{}";
    return NextResponse.json(JSON.parse(lastLine));
  } catch {
    const matches = Object.entries(NSE_STATIC_SYMBOL_TOKENS)
      .filter(([sym]) => !q || sym.includes(q))
      .slice(0, limit)
      .map(([symbol, token]) => ({ symbol, name: symbol, token }));
    return NextResponse.json({
      query: q,
      source: "NEXT_STATIC_TOKEN_MAP",
      count: matches.length,
      results: matches,
    });
  }
}
