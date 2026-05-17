"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronLeft,
  Scale,
  Building2,
  ShoppingBag,
  Clock,
  Ban,
  Shield,
  CreditCard,
  AlertOctagon,
} from "lucide-react";

interface CompanyProps {
  name: string;
  organizationNumber: string;
  address: string;
  email: string;
}

export default function TermsContent({ company }: { company: CompanyProps }) {
  // Tomma fält visar diskret "—" istället för raw whitespace, så texten
  // ser proffsig ut även innan admin fyllt i fullt företagsblock.
  const displayValue = (value: string) => (value && value.trim() ? value : "—");

  return (
    <div className="min-h-screen pb-32 md:pt-20" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="sticky top-0 md:top-20 z-30 backdrop-blur-xl p-6" style={{ backgroundColor: "rgba(252,252,249,0.8)", borderBottom: "1px solid var(--border-muted)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/profile" className="p-3 rounded-2xl transition-all active:scale-90" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-xl font-black uppercase italic tracking-tighter" style={{ color: "var(--text-primary)" }}>
            Allmänna <span className="text-gold-500">Villkor</span>
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-12 mt-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="p-8 rounded-[3rem] bg-gold-500/5 border border-gold-500/10 relative overflow-hidden">
            <Scale className="absolute -right-8 -top-8 text-gold-500/10 w-48 h-48 -rotate-12" />
            <div className="relative z-10">
              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-600 mb-2">Avtal &amp; Trygghet</div>
              <h2 className="text-3xl font-black italic mb-4 leading-[1.15]" style={{ color: "var(--text-primary)" }}>
                MatGo och dig.<br />Detta gäller när du beställer.
              </h2>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Genom att använda MatGo godkänner du dessa villkor. De är skrivna med svensk konsumentskyddslagstiftning som grund — Distansavtalslagen (2005:59), Konsumentköplagen (2022:260) och Dataskyddsförordningen (GDPR).
              </p>
            </div>
          </div>

          <div className="space-y-10 mt-12 px-2">
            {/* 1. FÖRETAGSINFORMATION */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Building2 size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Företagsinformation
                </h3>
              </div>
              <div className="rounded-2xl p-5 space-y-2 text-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="flex justify-between gap-4">
                  <span className="font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>Företagsnamn</span>
                  <span style={{ color: "var(--text-primary)" }}>{company.name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>Organisationsnummer</span>
                  <span style={{ color: "var(--text-primary)" }}>{displayValue(company.organizationNumber)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>Adress</span>
                  <span className="text-right whitespace-pre-line" style={{ color: "var(--text-primary)" }}>{displayValue(company.address)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>E-post</span>
                  <a href={`mailto:${company.email}`} className="text-gold-500 underline">{company.email}</a>
                </div>
              </div>
              <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                MatGo är en plattform som förmedlar din beställning till restaurangen. Köpeavtalet för maten du beställer ingås mellan dig och respektive restaurang.
              </p>
            </section>

            {/* 2. BESTÄLLNING & BETALNING */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <ShoppingBag size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Beställning &amp; Betalning
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                När du lägger en order via MatGo är beställningen bindande. Restaurangen påbörjar tillagningen så snart de bekräftat ordern. Priser anges inkl. moms. Eventuell leveransavgift visas tydligt innan du bekräftar köpet.
              </p>
            </section>

            {/* 3. BETALNINGSHANTERING */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <CreditCard size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Betalningshantering
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                All kortbetalning hanteras av Stripe (Stripe Payments Europe Ltd., PCI-DSS-certifierad). MatGo lagrar inga kortnummer eller CVC-koder — endast en token från Stripe används för att slutföra köpet. Vid återbetalning sker krediteringen till samma kort som användes vid köp.
              </p>
            </section>

            {/* 4. LEVERANS */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Clock size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Leverans &amp; Avhämtning
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                ETA-tiden vi visar är en uppskattning, inte en garanti. Vid leverans ansvarar restaurangen (alt. dess samarbetspartner) för transporten enligt restaurangens leveransvillkor. Avhämtning sker direkt hos restaurangen mot beställningsnummer.
              </p>
            </section>

            {/* 5. ÅNGERRÄTT */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Ban size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Ångerrätt &amp; Reklamation
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Enligt Distansavtalslagen 2 kap. 11 § har du normalt 14 dagars ångerrätt på distansavtal. <strong>Ångerrätten gäller dock inte för leverans av livsmedel eller andra varor som tillagats eller paketerats för en enskild beställning</strong> (2 kap. 11 § p. 4) — d.v.s. den färdiglagade maten du beställer via MatGo.
              </p>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Om något är fel på din mat — felaktig leverans, kall mat, allergiavvikelser eller liknande — ska du i första hand kontakta restaurangen direkt. Får du inte gehör hjälper MatGo gärna till via {" "}
                <a href={`mailto:${company.email}`} className="text-gold-500 underline">{company.email}</a>.
              </p>
            </section>

            {/* 6. GDPR */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Shield size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Personuppgifter &amp; GDPR
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {company.name} är personuppgiftsansvarig för de uppgifter du lämnar. Vi behandlar e-post, telefon, namn, leveransadress och beställningshistorik för att kunna hantera dina ordrar. Rättslig grund är avtal (orderhantering) samt — för Sentry-analys — ditt uttryckliga samtycke via cookie-bannern.
              </p>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Uppgifterna lagras så länge ditt konto är aktivt. Underlag som omfattas av bokföringsplikt sparas i sju (7) år enligt Bokföringslagen (1999:1078). Du har rätt till tillgång, rättelse, radering, dataportabilitet och att invända mot behandlingen — se vår {" "}
                <Link href="/privacy" className="text-gold-500 underline">integritetspolicy</Link> för detaljer eller mejla {company.email}.
              </p>
            </section>

            {/* 7. KLAGOMÅL */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <AlertOctagon size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Klagomål &amp; Tvistlösning
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Är du inte nöjd och vi inte kan lösa det själva kan du vända dig till:
              </p>
              <ul className="space-y-2" style={{ color: "var(--text-secondary)" }}>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Allmänna reklamationsnämnden (ARN)</strong> — arn.se</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Konsumentverket / Hallå konsument</strong> — hallakonsument.se</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Integritetsskyddsmyndigheten (IMY)</strong> — imy.se (vid GDPR-relaterade klagomål)</span></li>
              </ul>
            </section>

            <section className="p-8 rounded-3xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
              <h4 className="font-black uppercase tracking-widest text-xs mb-4" style={{ color: "var(--text-primary)" }}>Tillämplig lag</h4>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Dessa villkor regleras av svensk rätt. Tvist prövas i första hand av allmän domstol i Sverige om inte ARN eller annat tvistlösningsorgan är tillämpligt.
              </p>
              <div className="text-[9px] uppercase tracking-widest font-black" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>
                Version: 2026.05 | Lund, Sverige
              </div>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
