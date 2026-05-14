"use client";

import { useEffect } from "react";

/**
 * Root error boundary for the customer site.
 *
 * SECURITY: vi visar ALDRIG `error.message` rakt till slutanvändaren i
 * produktion — det kan läcka stacktraces, DB-table-names, env-vars, eller
 * andra interna detaljer. Bara en generisk svensk text + en "Försök igen"-
 * knapp. I dev visar vi felet under en details-toggle för debugging.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logga fullt fel i konsollen — bara dev/server-side ser detta.
    // Sentry har redan plockat upp det via Next.js auto-instrumentation.
    console.error("[Page error]", error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="text-center space-y-4 max-w-md">
        <h2
          className="text-2xl font-black"
          style={{ color: "var(--text-primary)" }}
        >
          Något gick fel
        </h2>
        <p className="text-zinc-500 text-sm">
          Vi stötte på ett oväntat fel. Vårt team har fått en signal och
          tittar på det. Försök igen om en stund.
        </p>
        {error.digest && (
          <p className="text-zinc-600 text-[10px] font-mono">
            Felkod: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-6 py-3 bg-gold-500 text-zinc-950 rounded-xl font-bold"
        >
          Försök igen
        </button>
        {isDev && (
          <details className="mt-6 text-left">
            <summary className="text-zinc-500 text-xs cursor-pointer">
              Dev: tekniska detaljer
            </summary>
            <pre className="mt-2 text-[10px] text-zinc-400 bg-zinc-900/50 p-3 rounded-lg overflow-auto max-h-64">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
