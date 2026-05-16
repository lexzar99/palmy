"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Gift, ArrowRight, Lock } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Tydlig "bjud in en vän"-CTA på startsidan. Texten är dynamisk baserat
 * på den konfigurerade dealen (rewardLabel) och lock-state (om user inte
 * gjort sin första betalda order än).
 *
 * Visas endast för inloggade användare.
 */

type ReferralConfig = {
  locked?: boolean;
  enabled?: boolean;
  discountType?: string | null;
  rewardLabel?: string;
};

export default function InviteFriendsBanner({ enabled = true }: { enabled?: boolean }) {
  const [config, setConfig] = useState<ReferralConfig | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    axios
      .get<ReferralConfig>("/api/platform/account/referral")
      .then((r) => {
        if (!cancelled) setConfig(r.data);
      })
      .catch(() => {
        // Tyst — banner visar generisk text om fetch failar
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  // rewardLabel är grammatiskt komplett från backend ("20% rabatt" /
  // "Fri leverans" / "20% rabatt + Fri leverans"). Splice rakt av.
  const rewardLabel = config?.rewardLabel;
  const isLocked = config?.locked === true;

  // Bygg subtitle baserat på lock-state + reward-info.
  const ctaSubtitle = (() => {
    if (rewardLabel && rewardLabel !== "rabatt") {
      return isLocked
        ? `Lägg din första order för att låsa upp ${rewardLabel}`
        : `Få ${rewardLabel} åt båda`;
    }
    return isLocked
      ? "Lägg din första order för att låsa upp referrals"
      : "Bjud in en vän och få belöning";
  })();

  const headerText = isLocked ? "Låst — bjud in en vän" : "Bjud in en vän";

  return (
    <Link href="/invite" className="block mb-6">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.99 }}
        className="relative rounded-[1.5rem] overflow-hidden border flex items-center gap-4 px-5 py-4 cursor-pointer"
        style={{
          backgroundColor: isLocked
            ? "var(--bg-secondary)"
            : "rgba(231,178,75,0.08)",
          borderColor: isLocked
            ? "var(--border-muted)"
            : "rgba(231,178,75,0.35)",
          boxShadow: isLocked
            ? "none"
            : "0 0 24px rgba(231,178,75,0.08)",
        }}
      >
        {/* Gold-glow endast när unlocked */}
        {!isLocked && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 85% 50%, rgba(231,178,75,0.15) 0%, transparent 60%)",
            }}
          />
        )}

        <div
          className="relative w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center shadow-lg"
          style={{
            backgroundColor: isLocked
              ? "var(--bg-deep)"
              : "var(--gold-500, #e7b24b)",
            color: isLocked ? "var(--text-secondary)" : "#18181b",
          }}
        >
          {isLocked ? <Lock size={18} /> : <Gift size={20} />}
        </div>

        <div className="relative flex-1 min-w-0">
          <p
            className="text-[10px] font-black uppercase tracking-[0.3em] mb-1"
            style={{
              color: isLocked ? "var(--text-secondary)" : "var(--gold-500, #e7b24b)",
            }}
          >
            {headerText}
          </p>
          <p
            className="text-[14px] font-black leading-tight truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {ctaSubtitle}
          </p>
        </div>

        <ArrowRight
          size={18}
          className="relative shrink-0"
          style={{
            color: isLocked ? "var(--text-secondary)" : "var(--gold-500, #e7b24b)",
          }}
        />
      </motion.div>
    </Link>
  );
}
