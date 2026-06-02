"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

/**
 * MobileFooterLinks — sekundär Kontakt-länk renderad inline på en sida.
 * Visas bara på mobil (md:hidden). "Om oss" borttagen enligt önskemål.
 */
export default function MobileFooterLinks() {
  return (
    <div className="md:hidden">
      <Link
        href="/contact"
        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border transition-all hover:border-gold-500/40 active:scale-95"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-muted)",
          color: "var(--text-primary)",
        }}
      >
        <MessageSquare size={14} className="text-gold-500" />
        <span className="text-[10px] font-black uppercase tracking-widest">Kontakt</span>
      </Link>
    </div>
  );
}
