"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api";

interface VerifiedVersion {
  versionCode: number;
  versionName: string;
  sizeBytes: number;
  sha256: string;
  notes: string | null;
}

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function TerminalUpdateClient() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [version, setVersion] = useState<VerifiedVersion | null>(null);
  // Koden är en engångskod: verifiering förbrukar den. Utan den här spärren
  // skulle React 18:s dubbla effekt-körning i dev bränna koden direkt.
  const autoSubmitted = useRef(false);

  const verify = useCallback(async (raw: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${getApiUrl()}/api/terminal-download/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || "Koden kunde inte verifieras.");
        return;
      }
      setToken(data.token);
      setVersion(data.version);
    } catch {
      setError("Ingen kontakt med servern. Kontrollera nätverket och försök igen.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Terminalen öppnar sidan som .../terminal?code=XXXXXXXX — då ska personalen
  // inte behöva skriva av något alls.
  useEffect(() => {
    if (typeof window === "undefined" || autoSubmitted.current) return;
    const prefilled = new URLSearchParams(window.location.search).get("code");
    if (!prefilled) return;
    autoSubmitted.current = true;
    const normalized = prefilled.replace(/[\s-]+/g, "").toUpperCase();
    setCode(normalized);
    void verify(normalized);
  }, [verify]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void verify(code);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0A2340",
        color: "#FEF7F0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "var(--font-baloo, system-ui, sans-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>
          Terminaluppdatering
        </h1>
        <p style={{ margin: "10px 0 26px", fontSize: 14.5, lineHeight: 1.55, color: "rgba(254,247,240,0.68)" }}>
          Skriv in koden som visas i terminalens inställningar för att hämta den
          senaste ViaEats Partner-appen.
        </p>

        {!token || !version ? (
          <form onSubmit={submit}>
            <label
              htmlFor="terminal-code"
              style={{ display: "block", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(254,247,240,0.55)" }}
            >
              Kod från terminalen
            </label>
            <input
              id="terminal-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              placeholder="XXXXXXXX"
              style={{
                width: "100%",
                marginTop: 10,
                padding: "16px 18px",
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "0.18em",
                textAlign: "center",
                color: "#FEF7F0",
                background: "rgba(254,247,240,0.06)",
                border: "1px solid rgba(254,247,240,0.18)",
                borderRadius: 16,
                outline: "none",
              }}
            />

            {error ? (
              <p style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.5, color: "#FFB4A2" }}>{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              style={{
                width: "100%",
                marginTop: 18,
                padding: "15px 18px",
                fontSize: 15.5,
                fontWeight: 800,
                color: "#FEF7F0",
                background: busy || code.trim().length < 6 ? "rgba(232,98,44,0.45)" : "#E8622C",
                border: "none",
                borderRadius: 14,
                cursor: busy || code.trim().length < 6 ? "default" : "pointer",
              }}
            >
              {busy ? "Kontrollerar…" : "Hämta uppdatering"}
            </button>
          </form>
        ) : (
          <div
            style={{
              padding: "22px",
              background: "rgba(254,247,240,0.06)",
              border: "1px solid rgba(254,247,240,0.16)",
              borderRadius: 18,
            }}
          >
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(254,247,240,0.55)" }}>
              Klar att installera
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 23, fontWeight: 800, letterSpacing: "-0.4px" }}>
              ViaEats Partner {version.versionName}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(254,247,240,0.6)" }}>
              {formatMb(version.sizeBytes)}
            </p>
            {version.notes ? (
              <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(254,247,240,0.78)" }}>
                {version.notes}
              </p>
            ) : null}

            <a
              href={`${getApiUrl()}/api/terminal-download/file/${token}`}
              style={{
                display: "block",
                marginTop: 20,
                padding: "15px 18px",
                fontSize: 15.5,
                fontWeight: 800,
                textAlign: "center",
                textDecoration: "none",
                color: "#FEF7F0",
                background: "#E8622C",
                borderRadius: 14,
              }}
            >
              Ladda ner appen
            </a>

            <p style={{ margin: "16px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "rgba(254,247,240,0.55)" }}>
              Öppna filen när nedladdningen är klar och tryck Installera. Terminalen
              startar om i den nya versionen. Länken gäller i 15 minuter.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
