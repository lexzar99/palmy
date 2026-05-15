"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { X, Gift } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// WelcomeDealBanner — sticky banner ovanför restaurang-listan på home. Visar
// kundens aktiva WELCOME/REFERRAL-deal om den finns. Stängs med X-knapp och
// stannar dismissad tills nästa session (sessionStorage).
//
// Backend-kontrakt: GET /api/account/deals → { deals: [{ id, type, status,
// amountKr, expiresAt, metadata }] }. ACTIVE = användbara nu.

type UserDeal = {
  id: string;
  type: "WELCOME" | "REFERRAL_INVITER" | "REFERRAL_INVITEE" | string;
  status: "ACTIVE" | "USED" | "EXPIRED" | string;
  amountKr?: number; // legacy
  discountPercent?: number; // ny — 20 = 20%
  minOrderKr?: number;
  expiresAt?: string | null;
  metadata?: Record<string, any> | null;
};

// Hjälpare för att rendera rabatt-text. Prefererar procent om satt,
// faller tillbaka till kr för legacy-deals.
function formatDealReward(d: UserDeal): string {
  if (d.discountPercent && d.discountPercent > 0) return `${d.discountPercent}%`;
  if (d.amountKr && d.amountKr > 0) return `${d.amountKr} kr`;
  return "rabatt";
}

const DISMISS_KEY = "matgo_welcome_banner_dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* noop */
  }
}

function formatExpiry(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
  });
}

export default function WelcomeDealBanner({ enabled = true }: { enabled?: boolean }) {
  const [deal, setDeal] = useState<UserDeal | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled || isDismissed()) return;
    let cancelled = false;
    axios
      .get<{ deals: UserDeal[] }>("/api/platform/account/deals")
      .then((res) => {
        if (cancelled) return;
        const deals = res.data?.deals || [];
        // Prioriterar WELCOME-deals först — referral-payout-deals visas senare
        // när de blir aktiva. Vi vill ha en ENDA banner åt gången.
        const welcome = deals.find(
          (d) => d.status === "ACTIVE" && d.type === "WELCOME",
        );
        const referral = deals.find(
          (d) =>
            d.status === "ACTIVE" &&
            (d.type === "REFERRAL_INVITER" || d.type === "REFERRAL_INVITEE"),
        );
        const active = welcome || referral || null;
        if (active) {
          setDeal(active);
          setShow(true);
        }
      })
      .catch(() => {
        // Tyst ignorera — banner är best-effort, ej kritisk
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const handleClose = () => {
    setShow(false);
    dismiss();
  };

  if (!show || !deal) return null;

  const expiry = formatExpiry(deal.expiresAt);
  const minOrder = deal.minOrderKr ?? deal.metadata?.minOrderKr ?? null;

  const reward = formatDealReward(deal);
  const title =
    deal.type === "WELCOME"
      ? `Du har ${reward} rabatt`
      : deal.type === "REFERRAL_INVITER"
        ? `Referral-belöning: ${reward}`
        : `Du har ${reward} rabatt`;

  const subtitle = [
    minOrder ? `Min order: ${minOrder} kr` : null,
    expiry ? `Gäller till ${expiry}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mb-6 rounded-[1.5rem] border flex items-center gap-4 px-4 py-3.5"
        style={{
          backgroundColor: "rgba(231,178,75,0.08)",
          borderColor: "rgba(231,178,75,0.3)",
        }}
      >
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-500">
          <Gift size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gold-500 truncate">
            {title}
          </p>
          {subtitle && (
            <p
              className="text-[10px] font-bold mt-0.5 truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Stäng banner"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <X size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
