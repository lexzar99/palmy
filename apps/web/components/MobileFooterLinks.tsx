"use client";

import Link from "next/link";
import { Building2, MessageSquare } from "lucide-react";

/**
 * MobileFooterLinks — två sekundära länkar (Om oss + Kontakt) renderad inline
 * på en sida. Visas bara på mobil (md:hidden). Inkluderas av sidor som vill
 * exponera dessa länkar utan att de hamnar nära bottom-nav.
 */
export default function MobileFooterLinks() {
  return (
    <div className="md:hidden">
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/about"
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border transition-all hover:border-gold-500/40 active:scale-95"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-muted)",
            color: "var(--text-primary)",
          }}
        >
          <Building2 size={14} className="text-gold-500" />
          <span className="text-[10px] font-black uppercase tracking-widest">Om oss</span>
        </Link>
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
    </div>
  );
}
