import type { Metadata } from "next";
import Link from "next/link";
import { Phone, MapPin, Mail } from "lucide-react";
import { API_URL } from "@/lib/api";

export const metadata: Metadata = {
  title: "Kontakta oss | Levera",
  description: "Kontakta Levera — telefon, e-post och adress.",
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
      <div className="pt-20 pb-24 px-6 max-w-5xl mx-auto">
        <div className="mb-16 max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight" style={{ color: "var(--text-primary)" }}>
            Kontakta <span className="text-gold-500">oss</span>
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Har du frågor om en beställning, ett samarbete eller plattformen? Hör av dig så hjälper vi dig.
          </p>
        </div>

        {cards.length > 0 ? (
          <div className={`grid grid-cols-1 ${cards.length > 1 ? "md:grid-cols-2" : ""} ${cards.length > 2 ? "lg:grid-cols-3" : ""} gap-8 mb-16`}>
            {cards.map((item) => {
              const Icon = item.icon;
              const inner = (
                <div className="p-8 rounded-3xl transition-all group h-full shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mb-6 group-hover:bg-gold-500 group-hover:text-zinc-950 transition-all">
                    <Icon size={24} />
                  </div>
                  <div className="text-[10px] uppercase font-black tracking-widest mb-2 text-zinc-400">{item.title}</div>
                  <div className="text-xl font-black mb-1 whitespace-pre-line" style={{ color: "var(--text-primary)" }}>{item.value}</div>
                  {item.sub && (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.sub}</div>
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
          <div className="p-10 rounded-3xl shadow-sm mb-16" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <p className="text-base font-bold" style={{ color: "var(--text-secondary)" }}>
              Kontaktuppgifter saknas just nu. Lägg in dem via Företagsinställningar i admin-panelen.
            </p>
          </div>
        )}

        <div className="rounded-[2rem] p-10 text-center shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          <div className="text-3xl font-black uppercase tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Vill du <span className="text-gold-500">beställa</span>?
          </div>
          <p className="mb-8" style={{ color: "var(--text-secondary)" }}>Utforska våra anslutna restauranger och beställ direkt.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-10 py-5 bg-gold-500 hover:bg-gold-400 text-zinc-950 font-black rounded-2xl transition-all uppercase tracking-widest shadow-xl shadow-gold-500/10"
          >
            Hitta restauranger →
          </Link>
        </div>
      </div>
    </div>
  );
}
