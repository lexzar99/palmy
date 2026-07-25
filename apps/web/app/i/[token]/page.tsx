import Link from "next/link";
import RefCookie from "./RefCookie";
import ViaEatsWordmark from "@/components/ViaEatsWordmark";
import { API_URL } from "@/lib/api";

// Invite-landning — /i/<token>. Riktig välkomstsida (inte längre en tyst
// redirect): visar vem som bjöd in, belöningen, och en tydlig nummer-CTA.
// Cookien dlv_ref sätts klient-sida (RefCookie) + token bärs i ?ref på CTA:n.
export const dynamic = "force-dynamic";

interface InviteInfo {
  exists: boolean;
  enabled?: boolean;
  inviterName?: string | null;
  rewardLabel?: string | null;
}

async function fetchInfo(token: string): Promise<InviteInfo | null> {
  try {
    const r = await fetch(`${API_URL}/api/public/referral-preview?code=${encodeURIComponent(token)}`, { cache: "no-store" });
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
  const valid = !!info?.exists;
  const rewardLabel = info?.enabled === false ? null : info?.rewardLabel?.trim() || null;
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
          <ViaEatsWordmark size="md" />
        </div>

        {valid ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {inviter ? `${inviter} bjöd in dig till ViaEats` : "Du är inbjuden till ViaEats"}
              </h1>
              <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                Verifiera ditt nummer och få bonusen efter din första beställning. Mat hemkört, snabbt och enkelt.
              </p>
            </div>

            {/* Belöning — enda starka guld-accenten */}
            {rewardLabel && (
              <div
                className="flex flex-col items-center gap-1.5 rounded-2xl py-6"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <span
                  className="rounded-full px-4 py-1.5 text-[15px] font-bold"
                  style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416", fontVariantNumeric: "tabular-nums" }}
                >
                  {rewardLabel}
                </span>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  till dig
                </span>
              </div>
            )}

            <div className="space-y-3">
              <Link
                href={`/register?ref=${clean}`}
                className="flex h-[54px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.99]"
                style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                Verifiera nummer
              </Link>
              <Link
                href={`/?ref=${clean}`}
                className="flex h-[48px] w-full items-center justify-center rounded-2xl text-[14px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Fortsätt till ViaEats
              </Link>
            </div>
          </>
        ) : (
          <div className="space-y-5 text-center">
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Inbjudan kunde inte hittas
            </h1>
            <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              Länken är ogiltig eller har gått ut. Du kan ändå utforska ViaEats.
            </p>
            <Link
              href="/"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold"
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              Gå till ViaEats
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
