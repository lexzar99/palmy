"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * Restaurant-menu error boundary. Triggas om restaurants/[slug]/page.tsx
 * eller MenuContent.tsx kraschar. Erbjuder retry + "andra restauranger".
 */
export default function RestaurantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[restaurant menu error]", error);
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
        Kunde inte ladda menyn
      </h1>
      <p
        className="text-sm max-w-md mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Något gick fel när vi hämtade restaurangens meny. Försök igen,
        eller välj en annan restaurang.
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
          href="/discover"
          className="px-10 py-5 border rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
          style={{
            borderColor: "var(--border-muted)",
            color: "var(--text-secondary)",
          }}
        >
          Andra restauranger
        </Link>
      </div>
    </div>
  );
}
