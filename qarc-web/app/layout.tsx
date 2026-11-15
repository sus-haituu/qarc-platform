import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Q-ARC | Neuro-Symbolic Counterparty Intelligence",
  description:
    "Causal 4-State Gaussian HMM, 2D Kalman Filter, Neon pgvector Regime Twins, E08 News RAG, and Deterministic Pre-Trade Risk Gate for Indian Equities (NSE).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#090A0C] font-sans text-zinc-100 antialiased selection:bg-[#D2FF00] selection:text-[#090A0C]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
