import type { Metadata } from "next";
import Link from "next/link";
import { Phone, MapPin, Mail, ArrowRight } from "lucide-react";
import { API_URL } from "@/lib/api";

export const metadata: Metadata = {
  title: "Kontakta oss | ViaEats",
  description: "Kontakta ViaEats — telefon, e-post och adress.",
};

type PlatformSettings = {
  contactPhone?: string | null;
  contactPhoneHours?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
};

async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const res = await fetch(`${API_URL}/api/settings`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export default async function ContactPage() {
  const settings = await getPlatformSettings();

  const cards = [
    settings.contactPhone && {
      icon: Phone,
      title: "Telefon",
      value: settings.contactPhone,
      sub: settings.contactPhoneHours || "",
      href: `tel:${settings.contactPhone.replace(/[^\d+]/g, "")}`,
    },
    settings.contactEmail && {
      icon: Mail,
      title: "E-post",
      value: settings.contactEmail,
      sub: "Svar inom 24 timmar",
      href: `mailto:${settings.contactEmail}`,
    },
    settings.contactAddress && {
      icon: MapPin,
      title: "Adress",
      value: settings.contactAddress,
      sub: "",
      href: `https://maps.google.com/?q=${encodeURIComponent(settings.contactAddress)}`,
    },
  ].filter(Boolean) as Array<{ icon: typeof Phone; title: string; value: string; sub: string; href: string | null }>;

  return (
    <div className="min-h-screen md:pt-20" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="pt-[calc(env(safe-area-inset-top,0px)+4.5rem)] md:pt-12 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] md:pb-24 px-5 sm:px-6 max-w-4xl mx-auto">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-[28px] sm:text-4xl font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
            Kontakta oss
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Har du frågor om en beställning, ett samarbete eller plattformen? Hör av dig så hjälper vi dig.
          </p>
        </div>

        {cards.length > 0 ? (
          <div className={`grid grid-cols-1 ${cards.length > 1 ? "sm:grid-cols-2" : ""} ${cards.length > 2 ? "lg:grid-cols-3" : ""} gap-3 sm:gap-4 mb-6`}>
            {cards.map((item) => {
              const Icon = item.icon;
              const inner = (
                <div className="p-5 rounded-2xl h-full transition-all active:scale-[0.99]" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                    <Icon size={20} style={{ color: "var(--text-secondary)" }} />
                  </div>
                  <div className="text-[11px] uppercase font-semibold tracking-wider mb-1.5" style={{ color: "var(--text-secondary)" }}>{item.title}</div>
                  <div className="text-[16px] font-semibold mb-0.5 whitespace-pre-line break-words" style={{ color: "var(--text-primary)" }}>{item.value}</div>
                  {item.sub && (
                    <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{item.sub}</div>
                  )}
                </div>
              );
              return item.href ? (
                <a key={item.title} href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <div key={item.title}>{inner}</div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-2xl mb-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
            <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Kontaktuppgifter saknas just nu. Lägg in dem via Företagsinställningar i admin-panelen.
            </p>
          </div>
        )}

        <div className="rounded-2xl p-6 sm:p-8 text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
          <div className="text-[18px] font-bold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>
            Vill du beställa?
          </div>
          <p className="mb-5 text-[14px]" style={{ color: "var(--text-secondary)" }}>Utforska våra anslutna restauranger och beställ direkt.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 h-[52px] rounded-xl text-[15.5px] font-semibold transition-all active:scale-[0.99] bg-gold-500"
            style={{ color: "#141416" }}
          >
            Hitta restauranger <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
