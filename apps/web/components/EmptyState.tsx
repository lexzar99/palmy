"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * EmptyState — appens enda tomma-läge-mall: ikon i mjuk ruta (bg-deep,
 * guld-ikon), bold rubrik i normal case, EN rad sekundärtext och valfri
 * guld-CTA. Tema-säker via variabler. Används på favoriter, meny, sök,
 * ordrar m.fl. så alla tomma lägen känns som samma app.
 */
export default function EmptyState({
  icon: Icon,
  title,
  text,
  ctaLabel,
  ctaHref,
  onCtaClick,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
}) {
  const cta = ctaLabel ? (
    ctaHref ? (
      <Link
        href={ctaHref}
        className="mt-6 inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-gold-500 text-zinc-950 text-sm font-bold active:scale-95 transition-transform"
      >
        {ctaLabel}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onCtaClick}
        className="mt-6 inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-gold-500 text-zinc-950 text-sm font-bold active:scale-95 transition-transform"
      >
        {ctaLabel}
      </button>
    )
  ) : null;

  return (
    <div className="py-16 px-6 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "var(--bg-deep)" }}>
        <Icon size={26} className="text-gold-500" strokeWidth={2} />
      </div>
      <h3 className="text-lg font-bold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {text && <p className="text-sm max-w-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{text}</p>}
      {cta}
    </div>
  );
}
