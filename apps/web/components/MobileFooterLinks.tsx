"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, MessageSquare } from "lucide-react";

/**
 * MobileFooterLinks — två sekundära länkar i botten av mobil-vyer.
 * Visas BARA på mobil (md:hidden) och bara på sidor där det är vettigt
 * (hem/upptäck/sök/orders — inte i kassan/checkout-flöden där distraktion
 * är dålig).
 *
 * Användaren kan backa till föregående sida med browser-back efter att ha
 * klickat sig in på Om oss / Kontakt.
 */
const SHOW_ON_PATHS = ["/", "/discover", "/search", "/orders", "/profile"];

export default function MobileFooterLinks() {
  const pathname = usePathname() || "/";
  // Visa bara på vissa rotrutter — inte under /restaurants/, /order/, /cart, etc.
  const shouldShow = SHOW_ON_PATHS.some((p) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p)
  );
  if (!shouldShow) return null;

  return (
    <div
      className="md:hidden px-4 pb-32 pt-6"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto">
        <Link
          href="/about"
          className="flex items-center justify-center gap-2 py-4 rounded-2xl border transition-all hover:border-gold-500/40 active:scale-95"
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
          className="flex items-center justify-center gap-2 py-4 rounded-2xl border transition-all hover:border-gold-500/40 active:scale-95"
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
