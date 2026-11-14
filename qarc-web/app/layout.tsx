import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Q-ARC | Neuro-Symbolic Counterparty Intelligence Terminal",
  description:
    "Institutional state-space quantitative risk engines + E01-E13 Evidence Ledger & zero-contradiction Claim Verifier guardrail.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090D16] text-slate-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}

