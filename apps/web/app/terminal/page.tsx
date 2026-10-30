import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TerminalUpdateClient } from "./TerminalUpdateClient";

// Dold sida: nås bara av den som har en engångskod från en parad terminal.
// Ingen länk pekar hit, och den ska aldrig hamna i ett sökresultat.
export const metadata: Metadata = {
  title: "Terminaluppdatering — ViaEats",
  robots: { index: false, follow: false, nocache: true },
};

// Koden är en engångskod: sidan får aldrig cachas eller förrenderas.
export const dynamic = "force-dynamic";

function apiBase(): string {
  return (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "https://api.viaeats.se"
  ).replace(/\/+$/, "");
}

async function verifyCode(code: string): Promise<{ token?: string; error?: string }> {
  try {
    const response = await fetch(`${apiBase()}/api/terminal-download/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data?.token !== "string") {
      return { error: data?.error || "Koden kunde inte verifieras." };
    }
    return { token: data.token };
  } catch {
    return { error: "Ingen kontakt med servern. Försök igen om en stund." };
  }
}

type TerminalUpdatePageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

/**
 * Terminalen (v1) öppnar sidan som .../terminal?code=XXXXXXXX i sin inbyggda
 * webbläsare. På Android 7 är den för gammal för att köra sidans JavaScript, så
 * knappar och automatisk verifiering fungerade inte. Därför växlas koden här på
 * servern och webbläsaren skickas direkt vidare till APK:n. Terminalens
 * nedladdningsfångare tar emot filen och startar installationen, utan att
 * någon behöver klicka eller skriva något. Utan kod visas formuläret som förut.
 */
export default async function TerminalUpdatePage({ searchParams }: TerminalUpdatePageProps) {
  const raw = (await searchParams).code;
  const code = (Array.isArray(raw) ? raw[0] : raw)?.replace(/[\s-]+/g, "").toUpperCase();
  if (!code) return <TerminalUpdateClient />;

  const result = await verifyCode(code);
  if (result.token) {
    // redirect() kastar internt, så den ligger utanför try/catch.
    redirect(`${apiBase()}/api/terminal-download/file/${encodeURIComponent(result.token)}`);
  }

  // Ren HTML utan JavaScript, så att även den gamla webbläsaren visar felet.
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0A2340",
        color: "#FEF7F0",
        padding: "32px 24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Uppdateringen kunde inte hämtas</h1>
      <p style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.85 }}>{result.error}</p>
      <p style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.85 }}>
        Gå tillbaka till terminalen och tryck på Sök efter uppdatering igen för att få en ny kod.
      </p>
    </main>
  );
}
