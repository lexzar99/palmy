"use client";

import { useEffect } from "react";

/**
 * Route-segment error boundary för hela (app)-delen (inkl. /zones/...).
 *
 * Tidigare saknades en boundary helt → en oväntad klient-exception (t.ex. när
 * man redigerade en zon) bubblade till ramverkets default och visade en
 * intetsägande "This page couldn't load". Nu fångas felet här och VISAS, så
 * man ser vad som faktiskt gick fel — plus knappar för att försöka igen
 * (mjuk reset) eller ladda om (återhämtar chunk-fel efter en ny deploy).
 */
export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logga hela felet till konsolen så det går att läsa/skärmdumpa.
    console.error("[admin] route error boundary:", error);
  }, [error]);

  const message = error?.message || "Ett oväntat fel inträffade.";
  // Chunk-/nätverksfel uppstår typiskt direkt efter en ny deploy (gamla
  // chunk-hashar finns inte längre) — då räcker en omladdning.
  const isChunkError = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch|Importing a module script failed/i.test(
    message,
  );

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: "0 auto 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
            fontSize: 28,
          }}
          aria-hidden
        >
          !
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {isChunkError ? "En ny version har publicerats" : "Något gick fel på sidan"}
        </h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>
          {isChunkError
            ? "Ladda om sidan för att hämta den senaste versionen."
            : "Felet nedan fångades automatiskt. Försök igen, eller ladda om sidan."}
        </p>

        {!isChunkError && (
          <pre
            style={{
              textAlign: "left",
              fontSize: 12,
              lineHeight: 1.45,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(127,127,127,0.10)",
              border: "1px solid rgba(127,127,127,0.20)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 220,
              overflow: "auto",
              marginBottom: 16,
            }}
          >
            {message}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "#E7B24B",
              color: "#141416",
              border: "none",
            }}
          >
            Försök igen
          </button>
          <button
            type="button"
            onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
              color: "inherit",
              border: "1px solid rgba(127,127,127,0.35)",
            }}
          >
            Ladda om
          </button>
        </div>
      </div>
    </div>
  );
}
