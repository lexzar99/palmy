"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Tydlig "bjud in en vän"-CTA på startsidan. Hämtar referral-config från
 * backend så texten anpassar sig efter den valda dealen (procent / kr /
 * fri leverans). Visar generisk fallback om backend inte svarar.
 *
 * Visas endast för inloggade användare (kräver auth för /invite).
 */

type ReferralConfig = {
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
  // "Fri leverans" / "20% rabatt + Fri leverans"). Visa rakt av.
  const rewardLabel = config?.rewardLabel;
  const ctaSubtitle =
    rewardLabel && rewardLabel !== "rabatt"
      ? `Få ${rewardLabel} åt båda`
      : "Bjud in en vän och få belöning";

  return (
    <Link href="/invite" className="block mb-6">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.99 }}
        className="relative rounded-[1.5rem] overflow-hidden border flex items-center gap-4 px-5 py-4 cursor-pointer"
        style={{
          backgroundColor: "rgba(231,178,75,0.08)",
          borderColor: "rgba(231,178,75,0.35)",
          boxShadow: "0 0 24px rgba(231,178,75,0.08)",
        }}
      >
        {/* Subtle gold-glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 85% 50%, rgba(231,178,75,0.15) 0%, transparent 60%)",
          }}
        />

        <div className="relative w-11 h-11 shrink-0 rounded-2xl bg-gold-500 text-zinc-950 flex items-center justify-center shadow-lg">
          <Gift size={20} />
        </div>

        <div className="relative flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-1">
            Bjud in en vän
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
          className="relative shrink-0 text-gold-500"
        />
      </motion.div>
    </Link>
  );
}
