import Link from "next/link";
import { Gift, ArrowRight, AlertTriangle, Truck, CalendarDays, Wallet } from "lucide-react";
import { API_URL } from "@/lib/api";

// Public referral landing — server component. Slag-parametern är referral-
// koden, t.ex. /r/ANNA8X3K. Vi hämtar preview-data (inviter-namn, reward-belopp,
// enabled-flag) från backend utan auth och visar en splash med stor CTA mot
// /register?ref=KOD. OBS: samma dynamic-segment [slug] används av reviews-
// route nedanför (`/r/[slug]/reviews`) — det är restaurang-slug där men en
// referral-kod här. Backend filtrerar bort restaurang-slugs naturligt eftersom
// referral-preview returnerar exists=false för alla icke-koder.

type DealInfo = {
  title: string;
  discountType: string;
  discountPercent: number | null;
  amountKr: number | null;
  freeDelivery: boolean;
  minOrderKr: number;
  expiresAt: string;
};

type ReferralPreview = {
  exists: boolean;
  inviterName?: string;
  deal?: DealInfo | null;
  discountType?: string | null;
  rewardPercent?: number | null;
  rewardKr?: number | null;
  rewardLabel?: string;
  couponsPerSide?: number;
  enabled?: boolean;
};

function formatExpiry(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  } catch {
    return null;
  }
}

async function fetchReferralPreview(code: string): Promise<ReferralPreview | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/public/referral-preview?code=${encodeURIComponent(code)}`,
      {
        cache: "no-store",
        // Public endpoint — ingen auth-header
      },
    );
    if (!res.ok) return { exists: false };
    return (await res.json()) as ReferralPreview;
  } catch {
    return null;
  }
}

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // I Next 16 är params en Promise — måste await:as.
  const { slug } = await params;
  // Normalisera till uppercase och striktt format (backend lagrar alltid uppercase).
  const code = (slug || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const preview = code ? await fetchReferralPreview(code) : null;

  // Inte en giltig kod → vi visar "ogiltig länk"-sida istället för 404 så
  // användaren får tydlig vägledning till hemsidan. Vi kollar BARA exists —
  // `enabled`-flaggan styr om auto-reward triggas server-side, inte om
  // länken är giltig. Annars: admin glömmer toggla → alla referral-länkar
  // visar "Ogiltig länk" trots att koderna är korrekta.
  if (!preview || !preview.exists) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="max-w-md w-full text-center space-y-8">
          <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto bg-rose-500/10 border border-rose-500/20 text-rose-500">
            <AlertTriangle size={44} />
          </div>
          <div className="space-y-3">
            <h1
              className="text-4xl font-black uppercase tracking-tight italic"
              style={{ color: "var(--text-primary)" }}
            >
              Ogiltig <span className="text-rose-500">länk</span>
            </h1>
            <p
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: "var(--text-secondary)" }}
            >
              Den här referral-koden gäller inte längre eller har skrivits fel.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-3 px-10 py-5 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-gold-500/20 active:scale-95 transition-all"
          >
            Gå till hemsidan <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  // Färdig grammatisk label från backend: "20% rabatt" / "Fri leverans" /
  // "20% rabatt + Fri leverans". Splice rakt av — ingen extra logik.
  const rewardLabel = preview.rewardLabel || "rabatt";
  const inviter = preview.inviterName?.trim() || "En vän";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-md w-full text-center space-y-10">
        {/* Hero-icon */}
        <div className="relative w-32 h-32 mx-auto">
          <div className="absolute inset-0 rounded-[2.5rem] bg-gold-500/10 border border-gold-500/30 blur-md" />
          <div className="relative w-full h-full rounded-[2.5rem] bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-500 shadow-2xl shadow-gold-500/20">
            <Gift size={56} />
          </div>
        </div>

        <div className="space-y-4">
          <p
            className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500"
          >
            Inbjudan via referral
          </p>
          <h1
            className="text-4xl sm:text-5xl font-black uppercase tracking-tight italic leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            <span className="text-gold-500">{inviter}</span> bjuder in dig till FoodGo
          </h1>
          <p
            className="text-sm font-bold leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Registrera ett konto med koden{" "}
            <span className="font-black text-gold-500 tracking-[0.2em]">
              {code}
            </span>{" "}
            — så får ni båda{" "}
            <span className="font-black text-gold-500">{rewardLabel}</span>{" "}
            på er nästa beställning.
          </p>
        </div>

        {/* Deal-hero — visuell representation av exakt vad invitee får */}
        {preview.deal && <LandingDealHero deal={preview.deal} />}

        {/* Kod-display */}
        <div
          className="mx-auto rounded-[1.75rem] px-8 py-6 border-2"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "rgba(231,178,75,0.4)",
            boxShadow: "0 0 30px rgba(231,178,75,0.15)",
          }}
        >
          <p
            className="text-[9px] font-black uppercase tracking-[0.3em] mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Din rabattkod
          </p>
          <p className="font-mono font-black text-3xl tracking-[0.25em] text-gold-500">
            {code}
          </p>
        </div>

        <Link
          href={`/register?ref=${code}`}
          className="inline-flex items-center justify-center gap-3 w-full px-10 py-6 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-sm shadow-2xl shadow-gold-500/30 active:scale-95 transition-all group"
        >
          Registrera nu{" "}
          <ArrowRight
            size={18}
            className="group-hover:translate-x-1.5 transition-transform"
          />
        </Link>

        <Link
          href="/"
          className="block text-[10px] font-black uppercase tracking-widest hover:text-gold-500 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          Eller fortsätt till hemsidan
        </Link>
      </div>
    </div>
  );
}

/**
 * LandingDealHero — visuell representation av exakt vad invitee får.
 * Anpassar sig efter dealtypen (procent/kr/fri leverans/stack) och visar
 * villkor (min-order, expiry) som badge-rad längst ner.
 */
function LandingDealHero({ deal }: { deal: DealInfo }) {
  const hasDiscount =
    (deal.discountType === "PERCENTAGE" && (deal.discountPercent ?? 0) > 0) ||
    (deal.discountType === "FIXED" && (deal.amountKr ?? 0) > 0);
  const isPercent = deal.discountType === "PERCENTAGE";
  const expiry = formatExpiry(deal.expiresAt);

  return (
    <div
      className="mx-auto rounded-[1.75rem] px-6 py-6 border-2"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "rgba(231,178,75,0.4)",
        boxShadow: "0 0 30px rgba(231,178,75,0.12)",
      }}
    >
      <p
        className="text-[9px] font-black uppercase tracking-[0.3em] mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        {deal.title}
      </p>

      <div className="flex items-center justify-center gap-5">
        {hasDiscount && (
          <div className="flex flex-col items-center">
            <p className="text-6xl sm:text-7xl font-black italic tracking-tighter text-gold-500 leading-none">
              {isPercent ? deal.discountPercent : deal.amountKr}
              <span className="text-3xl align-top ml-0.5">
                {isPercent ? "%" : "kr"}
              </span>
            </p>
            <p
              className="text-[10px] font-black uppercase tracking-[0.3em] mt-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Rabatt
            </p>
          </div>
        )}

        {hasDiscount && deal.freeDelivery && (
          <p
            className="text-4xl font-black"
            style={{ color: "var(--text-secondary)", opacity: 0.4 }}
          >
            +
          </p>
        )}

        {deal.freeDelivery && (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
              <Truck size={32} className="text-gold-500" strokeWidth={2.5} />
            </div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.3em] mt-2 text-center"
              style={{ color: "var(--text-secondary)" }}
            >
              Fri leverans
            </p>
          </div>
        )}
      </div>

      {(deal.minOrderKr > 0 || expiry) && (
        <div
          className="flex flex-wrap items-center justify-center gap-4 mt-5 pt-4 text-[10px] font-bold"
          style={{
            borderTop: "1px solid var(--border-muted)",
            color: "var(--text-secondary)",
          }}
        >
          {deal.minOrderKr > 0 && (
            <span className="flex items-center gap-1.5">
              <Wallet size={11} /> Min {deal.minOrderKr} kr
            </span>
          )}
          {expiry && (
            <span className="flex items-center gap-1.5">
              <CalendarDays size={11} /> Gäller till {expiry}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
