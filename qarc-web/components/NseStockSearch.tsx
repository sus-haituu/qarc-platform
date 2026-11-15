"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { normalizeNseSymbol, searchSymbols, type SymbolSearchItem } from "@/lib/qarcApi";
import StockLogo from "@/components/StockLogo";

interface NseStockSearchProps {
  onSubmit: (symbol: string) => void;
  busy?: boolean;
}

const DEBOUNCE_MS = 220;

export default function NseStockSearch({ onSubmit, busy = false }: NseStockSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchItem[]>([]);
  const [source, setSource] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced autocomplete against GET /api/symbols (static fallback inside searchSymbols)
  useEffect(() => {
    const q = normalizeNseSymbol(query);
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchSymbols(q, 15, controller.signal);
        setResults(res.results);
        setSource(res.source);
        setActiveIdx(res.results.length ? 0 : -1);
      } catch {
        // aborted by a newer keystroke
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const commit = (symbol: string) => {
    const clean = normalizeNseSymbol(symbol);
    if (!clean) return;
    setQuery(clean);
    setOpen(false);
    onSubmit(clean);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = open && activeIdx >= 0 ? results[activeIdx] : undefined;
      commit(picked ? picked.symbol : query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && normalizeNseSymbol(query).length > 0;

  return (
    <div ref={wrapRef} className="relative flex w-full items-stretch sm:w-auto">
      <div className="relative flex flex-1 items-center border border-[#23262D] bg-[#101216] transition focus-within:border-[#D2FF00]">
        <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search any NSE equity"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="SEARCH ANY NSE STOCK"
          spellCheck={false}
          autoComplete="off"
          className="w-full min-w-0 bg-transparent px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-100 placeholder:text-zinc-600 focus:outline-none sm:w-56"
        />
        {loading && (
          <span className="mr-2 h-1.5 w-1.5 shrink-0 animate-pulse bg-[#D2FF00]" aria-label="Searching" />
        )}
      </div>
      <button
        type="button"
        onClick={() => commit(activeIdx >= 0 && results[activeIdx] && open ? results[activeIdx].symbol : query)}
        disabled={busy || !normalizeNseSymbol(query)}
        className="border border-l-0 border-[#D2FF00] bg-[#D2FF00] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[#090A0C] transition hover:border-white hover:bg-white disabled:opacity-40"
      >
        {busy ? "..." : "Analyze"}
      </button>

      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[60] mt-px max-h-80 overflow-y-auto border border-[#23262D] bg-[#090A0C] shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
        >
          {results.length === 0 && !loading && (
            <li className="px-3 py-2.5 font-mono text-[11px] uppercase text-zinc-500">
              NO NSE EQUITY MATCH — PRESS ENTER TO TRY {normalizeNseSymbol(query)}
            </li>
          )}
          {results.map((r, idx) => (
            <li
              key={`${r.symbol}-${r.token}`}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(r.symbol);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 border-b border-[#23262D] px-3 py-2 last:border-b-0 ${
                idx === activeIdx ? "bg-[#101216]" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <StockLogo symbol={r.symbol} size="sm" />
                <span
                  className={`font-display text-sm font-bold uppercase tracking-[-0.02em] ${
                    idx === activeIdx ? "text-[#D2FF00]" : "text-white"
                  }`}
                >
                  {r.symbol}
                </span>
                <span className="truncate font-mono text-[10px] uppercase text-zinc-500">{r.name}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">#{r.token}</span>
            </li>
          ))}
          {results.length > 0 && source && (
            <li className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              SOURCE: {source}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
