import Link from "next/link";
import RefCookie from "./RefCookie";

// Invite-landning — /i/<token>. Riktig välkomstsida (inte längre en tyst
// redirect): visar vem som bjöd in, belöningen, och en tydlig "Skapa konto"-CTA.
// Cookien dlv_ref sätts klient-sida (RefCookie) + token bärs i ?ref på CTA:n.
export const dynamic = "force-dynamic";

interface InviteInfo {
  valid: boolean;
  inviterName?: string | null;
  rewardPoints?: number;
  rewardKr?: number;
}

async function fetchInfo(token: string): Promise<InviteInfo | null> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const r = await fetch(`${base}/api/public/invite/info?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as InviteInfo;
  } catch {
    return null;
  }
}

export default async function InviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = (token || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  const info = clean ? await fetchInfo(clean) : null;
  const valid = !!info?.valid;
  const reward = info?.rewardPoints ?? 0;
  const rewardKr = info?.rewardKr ?? 0;
  const inviter = info?.inviterName?.trim() || null;

  return (
    <div
      className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-16 pb-32 px-5"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <RefCookie token={clean} />
      <div className="mx-auto max-w-md space-y-8">
        {/* Brand-logga */}
        <div className="flex justify-center pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/delivera-lockup.png" alt="Delívera" style={{ height: 40, width: "auto" }} />
        </div>

        {valid ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {inviter ? `${inviter} bjöd in dig till Delívera` : "Du är inbjuden till Delívera"}
              </h1>
              <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                Skapa ett konto och få bonusen efter din första beställning. Mat hemkört, snabbt och enkelt.
              </p>
            </div>

            {/* Belöning — enda starka guld-accenten */}
            {reward > 0 && (
              <div
                className="flex flex-col items-center gap-1.5 rounded-2xl py-6"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <span
                  className="rounded-full px-4 py-1.5 text-[15px] font-bold"
                  style={{ backgroundColor: "var(--color-gold-500, #E7B24B)", color: "#141416", fontVariantNumeric: "tabular-nums" }}
                >
                  +{reward} Dpoints
                </span>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {rewardKr > 0 ? `≈ ${rewardKr} kr till dig` : "till dig"}
                </span>
              </div>
            )}

            <div className="space-y-3">
              <Link
                href={`/register?ref=${clean}`}
                className="flex h-[54px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.99]"
                style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                Skapa konto
              </Link>
              <Link
                href={`/?ref=${clean}`}
                className="flex h-[48px] w-full items-center justify-center rounded-2xl text-[14px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Fortsätt till Delívera
              </Link>
            </div>
          </>
        ) : (
          <div className="space-y-5 text-center">
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Inbjudan kunde inte hittas
            </h1>
            <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              Länken är ogiltig eller har gått ut. Du kan ändå utforska Delívera.
            </p>
            <Link
              href="/"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold"
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              Gå till Delívera
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
