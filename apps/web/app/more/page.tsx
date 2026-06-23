"use client";

import Link from "next/link";
import { Info, MessageSquare, Lock, FileText, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

/**
 * Informationssida — samlar Om oss, Kontakt och policy på ETT ställe (nås via
 * en enda "Information"-knapp i profilen). Monokromt cart-tema: rundad box med
 * hårfina rader, ingen guld.
 */
export default function MorePage() {
  const { t } = useTranslation();

  const links = [
    { href: "/about", label: t("nav.about"), icon: Info },
    { href: "/contact", label: t("nav.contact"), icon: MessageSquare },
    { href: "/privacy", label: t("profile.settings.privacy"), icon: Lock },
    { href: "/terms", label: t("profile.settings.termsLong"), icon: FileText },
  ];

  return (
    <div className="min-h-screen md:pt-20" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="pt-[calc(env(safe-area-inset-top,0px)+4.5rem)] md:pt-12 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] md:pb-24 px-5 sm:px-6 max-w-2xl mx-auto">
        <h1 className="text-[28px] sm:text-4xl font-bold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>
          {t("profile.menu.info")}
        </h1>
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
          {links.map((l, i) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center justify-between px-5 min-h-[56px] active:bg-black/[0.02] transition-colors"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-muted)" }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon size={17} style={{ color: "var(--text-secondary)" }} />
                  <span className="text-[15px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{l.label}</span>
                </span>
                <ChevronRight size={16} style={{ color: "var(--text-secondary)" }} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
