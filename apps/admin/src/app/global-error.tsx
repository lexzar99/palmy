"use client";

import { useEffect } from "react";

/**
 * Root global-error — fångar fel som uppstår i rot-layouten (där en vanlig
 * error.tsx inte räcker). Måste rendera egna <html>/<body>. Visar felet och
 * en omladdningsknapp så inget krasch-läge blir en intetsägande blank sida.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] global error boundary:", error);
  }, [error]);

  return (
    <html lang="sv">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0b0d", color: "#fff" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Något gick fel</h1>
            <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>
              {error?.message || "Ett oväntat fel inträffade."}
              {error?.digest ? ` (digest: ${error.digest})` : ""}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{ height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "#E7B24B", color: "#141416", border: "none" }}
              >
                Försök igen
              </button>
              <button
                type="button"
                onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
                style={{ height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                Ladda om
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
