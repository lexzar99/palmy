"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";

type Banner = {
  message: string;
  severity: "info" | "warning" | "critical";
  expiresAt?: string | null;
};

const DISMISSED_KEY = "matgo_banner_dismissed";

/**
 * PlatformBanner — visas högst upp i web när SUPER_ADMIN har satt en banner
 * via admin/crisis. Auto-rensar om expiresAt passerat. Kund kan dismissa
 * temporärt (per session).
 */
export default function PlatformBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settings`);
        const b = res.data?.banner;
        if (!cancelled && b?.message) {
          setBanner(b);
          // Dismiss-tracking per banner-meddelande (hash) så ny banner alltid visas
          const dismissedHash = sessionStorage.getItem(DISMISSED_KEY);
          if (dismissedHash === b.message) setDismissed(true);
        } else if (!cancelled) {
          setBanner(null);
        }
      } catch {
        // ignore
      }
    };

    void load();
    // Re-check var 60s ifall admin uppdaterar banner medan användaren är inne
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!banner || dismissed) return null;

  const Icon = banner.severity === "critical" ? AlertCircle : banner.severity === "warning" ? AlertTriangle : Info;
  const colors = banner.severity === "critical"
    ? "bg-rose-500/15 border-rose-500/40 text-rose-100"
    : banner.severity === "warning"
    ? "bg-amber-500/15 border-amber-500/40 text-amber-100"
    : "bg-sky-500/15 border-sky-500/40 text-sky-100";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        className={`fixed top-0 left-0 right-0 z-[150] border-b ${colors} backdrop-blur-md md:top-20`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Icon size={16} className="shrink-0" />
          <p className="flex-1 text-[12px] font-bold leading-snug">{banner.message}</p>
          <button
            onClick={() => {
              sessionStorage.setItem(DISMISSED_KEY, banner.message);
              setDismissed(true);
            }}
            aria-label="Stäng banner"
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
