import type { Metadata } from "next";
import Link from "next/link";
import { Phone, MapPin, Mail, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Kontakta oss | MatGo Lund",
  description: "Kontakta MatGo Lund – telefon, adress och öppettider.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#171513" }}>
      <div className="pt-32 pb-24 px-6 max-w-5xl mx-auto">
        <div className="mb-16 max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight" style={{ color: "#FFF8EA" }}>
            Kontakta <span className="text-gold-500">oss</span>
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: "#B8AA95" }}>
            Hör av dig till oss för catering, bordsbokning eller bara ett stort hej.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {[
            {
              icon: Phone,
              title: "Telefon",
              value: "046120612",
              sub: "Mån-Sön 11:00 – stängning",
              href: "tel:046120612",
            },
            {
              icon: Mail,
              title: "E-post",
              value: "info@matgo.se",
              sub: "Svar inom 24 timmar",
              href: "mailto:info@matgo.se",
            },
            {
              icon: MapPin,
              title: "Adress",
              value: "Kiliansgatan 14, 223 50 Lund",
              sub: "Centralt i Lund",
              href: "https://maps.google.com/?q=Kiliansgatan+14+Lund",
            },
            {
              icon: Clock,
              title: "Öppettider",
              value: "11:00 – 22:00 (22/02:00 ons-lör)",
              sub: "Öppet alla dagar",
              href: null,
            },
          ].map((item) => {
            const Icon = item.icon;
            const inner = (
              <div className="p-8 rounded-3xl hover:border-gold-500/20 transition-all group h-full" style={{ backgroundColor: "#211C19", border: "1px solid rgba(255,248,234,0.08)" }}>
                <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mb-6 group-hover:bg-gold-500 group-hover:text-dark-500 transition-all">
                  <Icon size={24} />
                </div>
                <div className="text-[10px] uppercase font-black tracking-widest mb-2" style={{ color: "rgba(184,170,149,0.4)" }}>{item.title}</div>
                <div className="text-xl font-black mb-1" style={{ color: "#FFF8EA" }}>{item.value}</div>
                <div className="text-sm" style={{ color: "#B8AA95" }}>{item.sub}</div>
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

        <div className="rounded-[2rem] p-10 text-center" style={{ backgroundColor: "#211C19", border: "1px solid rgba(255,248,234,0.08)" }}>
          <div className="text-3xl font-black uppercase tracking-tight mb-4" style={{ color: "#FFF8EA" }}>
            Vill du <span className="text-gold-500">beställa</span>?
          </div>
          <p className="mb-8" style={{ color: "#B8AA95" }}>Prova vår digitala beställning – snabbt och smidigt.</p>
          <Link
            href="/menu"
            className="inline-flex items-center gap-3 px-10 py-5 bg-gold-500 hover:bg-gold-400 text-dark-500 font-black rounded-2xl transition-all uppercase tracking-widest shadow-[0_10px_40px_rgba(212,167,74,0.3)]"
          >
            Gå till menyn →
          </Link>
        </div>
      </div>
    </div>
  );
}
