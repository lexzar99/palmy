"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * Order-tracking error boundary. Triggas om order/[id]/page.tsx kraschar.
 * Visar lugnande text — kundens BETALNING är säker, det är bara tracking-
 * sidan som hade ett tekniskt problem. /orders-listan eller support är
 * fallbacks.
 */
export default function OrderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[order tracking error]", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <AlertCircle size={48} className="text-amber-500 mb-6" />
      <h1
        className="text-3xl font-black uppercase italic mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        Kunde inte visa ordern
      </h1>
      <p
        className="text-sm max-w-md mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Tracking-sidan hade ett problem, men din betalning är säker.
        Försök igen eller titta i din orderhistorik.
      </p>
      {error.digest && (
        <p className="text-zinc-600 text-[10px] font-mono mb-4">
          Felkod: {error.digest}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={reset}
          className="px-10 py-5 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
        >
          Försök igen
        </button>
        <Link
          href="/orders"
          className="px-10 py-5 border rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
          style={{
            borderColor: "var(--border-muted)",
            color: "var(--text-secondary)",
          }}
        >
          Mina ordrar
        </Link>
      </div>
    </div>
  );
}
