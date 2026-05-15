"use client";

import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Tydlig "bjud in en vän"-CTA på startsidan. Tidigare fanns referral-koden
 * gömd långt nere på /profile — användarna hittade aldrig dit. Den här
 * gold-bannern syns direkt på startsidan ovanför restaurang-listan och
 * länkar till /invite där hela ReferralCard visas centrerat.
 *
 * Visas endast för inloggade användare (kräver auth för /invite).
 */
export default function InviteFriendsBanner({ enabled = true }: { enabled?: boolean }) {
  if (!enabled) return null;

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
            Få <span className="text-gold-500">20%</span> rabatt åt båda
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
