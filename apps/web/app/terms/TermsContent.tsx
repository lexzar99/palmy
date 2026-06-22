"use client";

import Link from "next/link";
import { Scale } from "lucide-react";

interface CompanyProps {
  name: string;
  organizationNumber: string;
  address: string;
  email: string;
}

export default function TermsContent({ company }: { company: CompanyProps }) {
  // Tomma fält visar diskret "-" istället för raw whitespace, så texten
  // ser proffsig ut även innan admin fyllt i fullt företagsblock.
  const displayValue = (value: string) => (value && value.trim() ? value : "-");

  return (
    <div
      className="min-h-screen pt-[env(safe-area-inset-top,0px)] md:pt-20"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="pt-12 md:pt-20 pb-24 px-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 text-gold-600 text-xs font-bold uppercase tracking-wider mb-8 border border-gold-500/20">
          <Scale size={12} /> Allmänna villkor
        </div>
        <h1
          className="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Villkor för <span className="text-gold-500">Delívera</span>
        </h1>
        <p className="text-lg leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          När du beställer via Delívera gäller dessa villkor. De utgår från svensk
          konsumentlagstiftning, Distansavtalslagen (2005:59), Konsumentköplagen (2022:260)
          och Dataskyddsförordningen (GDPR).
        </p>

        <div className="mt-14 space-y-12">
          {/* 1. FÖRETAGSINFORMATION */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Företagsinformation
            </h2>
            <dl
              className="rounded-2xl p-6 space-y-4 text-base"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
            >
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Företagsnamn</dt>
                <dd className="font-semibold" style={{ color: "var(--text-primary)" }}>{company.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Organisationsnummer</dt>
                <dd className="font-semibold" style={{ color: "var(--text-primary)" }}>{displayValue(company.organizationNumber)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Adress</dt>
                <dd className="font-semibold whitespace-pre-line" style={{ color: "var(--text-primary)" }}>{displayValue(company.address)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">E-post</dt>
                <dd>
                  <a href={`mailto:${company.email}`} className="font-semibold text-gold-600 hover:text-gold-500 transition-colors">{company.email}</a>
                </dd>
              </div>
            </dl>
            <p className="mt-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Delívera är en beställningsplattform med flera restauranger. Vi förmedlar din
              beställning till vald restaurang. Köpeavtalet för maten ingås mellan dig och
              respektive restaurang. Delívera ansvarar för plattformen, betalningen och, vid
              plattformsleverans, för transporten.
            </p>
          </section>

          {/* 2. BESTÄLLNING & BETALNING */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Beställning och betalning
            </h2>
            <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              När du lägger en order via Delívera är beställningen bindande. Restaurangen
              påbörjar tillagningen så snart den bekräftat ordern. Priser anges inklusive moms.
              En eventuell leveransavgift visas tydligt innan du bekräftar köpet.
            </p>
            <p className="mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              All kortbetalning hanteras av Stripe (Stripe Payments Europe Ltd., PCI-DSS-certifierad).
              Delívera lagrar inga kortnummer eller CVC-koder, endast en token från Stripe används
              för att slutföra köpet. Vid återbetalning krediteras samma kort som användes vid köpet.
            </p>
          </section>

          {/* 3. LEVERANS */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Leverans och avhämtning
            </h2>
            <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Leverans sker på ett av två sätt, beroende på restaurang och område. Antingen
              levererar restaurangen själv, eller så sköts leveransen av Delíveras egna bud.
              Vilket alternativ som gäller framgår i kassan. Avhämtning sker direkt hos
              restaurangen mot beställningsnummer.
            </p>
            <p className="mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Den leveranstid vi visar är en uppskattning, inte en garanti. Vid plattformsleverans
              ansvarar Delívera för transporten. Vid restaurangleverans ansvarar restaurangen
              enligt sina egna leveransvillkor.
            </p>
          </section>

          {/* 4. DPOINTS */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Dpoints
            </h2>
            <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Dpoints är Delíveras lojalitetsprogram. Du samlar poäng på betalda beställningar och
              kan lösa in dem mot produkter eller rabatter. Poäng har inget kontantvärde, kan inte
              överlåtas och kan dras tillbaka vid missbruk eller om en order återbetalas. Delívera
              kan ändra eller avsluta programmet med rimligt varsel.
            </p>
          </section>

          {/* 5. ÅNGERRÄTT */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Ångerrätt och reklamation
            </h2>
            <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Enligt Distansavtalslagen 2 kap. 11 § har du normalt 14 dagars ångerrätt på
              distansavtal. Ångerrätten gäller dock inte för leverans av livsmedel eller andra
              varor som tillagats eller paketerats för en enskild beställning (2 kap. 11 § p. 4),
              det vill säga den färdiglagade maten du beställer via Delívera.
            </p>
            <p className="mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Om något är fel på din mat, till exempel felaktig leverans, kall mat eller
              allergiavvikelser, kontaktar du i första hand restaurangen direkt. Får du inte
              gehör hjälper Delívera till via{" "}
              <a href={`mailto:${company.email}`} className="text-gold-600 underline">{company.email}</a>.
            </p>
          </section>

          {/* 6. GDPR */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Personuppgifter och GDPR
            </h2>
            <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {company.name} är personuppgiftsansvarig för de uppgifter du lämnar. Vi behandlar
              namn, e-post, telefon, leveransadress och beställningshistorik för att kunna hantera
              dina ordrar. Restauranger och bud behandlar vissa uppgifter för att kunna leverera
              din order. Rättslig grund är avtal (orderhantering) samt, för frivillig analys, ditt
              samtycke via cookie-bannern.
            </p>
            <p className="mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Uppgifterna lagras så länge ditt konto är aktivt. Underlag som omfattas av
              bokföringsplikt sparas i sju (7) år enligt Bokföringslagen (1999:1078). Du har rätt
              till tillgång, rättelse, radering, dataportabilitet och att invända mot behandlingen.
              Se vår{" "}
              <Link href="/privacy" className="text-gold-600 underline">integritetspolicy</Link>{" "}
              för detaljer eller mejla {company.email}.
            </p>
          </section>

          {/* 7. KLAGOMÅL */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Klagomål och tvistlösning
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              Är du inte nöjd och vi inte kan lösa det själva kan du vända dig till:
            </p>
            <ul className="space-y-2" style={{ color: "var(--text-secondary)" }}>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Allmänna reklamationsnämnden (ARN)</strong>, arn.se</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Konsumentverket / Hallå konsument</strong>, hallakonsument.se</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Integritetsskyddsmyndigheten (IMY)</strong>, imy.se, vid GDPR-relaterade klagomål</span></li>
            </ul>
          </section>

          {/* Tillämplig lag */}
          <section
            className="p-6 md:p-8 rounded-2xl"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
          >
            <h2 className="text-base font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
              Tillämplig lag
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
              Dessa villkor regleras av svensk rätt. Tvist prövas i första hand av allmän domstol
              i Sverige om inte ARN eller annat tvistlösningsorgan är tillämpligt.
            </p>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-400">
              Version 2026.06, Sverige
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
