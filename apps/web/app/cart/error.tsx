"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * Cart-specifik error boundary. Triggas om något i cart/page.tsx kraschar
 * (Stripe-fail, omöjligt state, etc.). Visa kunden actionable val:
 * - "Försök igen" (reset → Next.js mountar om route)
 * - "Hem" (lämna cart helt)
 * Vi nollar INTE cart-state automatiskt — kunden kan ha lagt 30 min på att
 * bygga sin order, och en bug ska inte radera den.
 */
export default function CartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cart error]", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <AlertCircle size={48} className="text-rose-500 mb-6" />
      <h1
        className="text-3xl font-black uppercase italic mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        Något gick fel i kassan
      </h1>
      <p
        className="text-sm max-w-md mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Vi stötte på ett oväntat fel. Din kasse är fortfarande sparad — du
        kan försöka igen eller gå tillbaka till menyn.
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
          href="/"
          className="px-10 py-5 border rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
          style={{
            borderColor: "var(--border-muted)",
            color: "var(--text-secondary)",
          }}
        >
          Till menyn
        </Link>
      </div>
    </div>
  );
}
