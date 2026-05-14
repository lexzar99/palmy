"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronLeft,
  Shield,
  Lock,
  Eye,
  Trash2,
  Building2,
  Scale,
  ChevronRight,
} from "lucide-react";

interface CompanyProps {
  name: string;
  organizationNumber: string;
  address: string;
  email: string;
  privacyEmail: string;
}

export default function PrivacyContent({ company }: { company: CompanyProps }) {
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
            Integritets<span className="text-gold-500">policy</span>
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
            <Shield className="absolute -right-8 -top-8 text-gold-500/10 w-48 h-48 -rotate-12" />
            <div className="relative z-10">
              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-600 mb-2">GDPR &amp; Säkerhet</div>
              <h2 className="text-3xl font-black italic mb-4 leading-none" style={{ color: "var(--text-primary)" }}>
                Din integritet är <br />vår högsta prioritet.
              </h2>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {company.name} är personuppgiftsansvarig för dina uppgifter. Vi följer Dataskyddsförordningen (GDPR) och säljer aldrig din data vidare.
              </p>
            </div>
          </div>

          <div className="space-y-10 mt-12 px-2">
            {/* Personuppgiftsansvarig */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Building2 size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Personuppgiftsansvarig
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
                  <span className="font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>Dataskyddsombud</span>
                  <a href={`mailto:${company.privacyEmail}`} className="text-gold-500 underline">{company.privacyEmail}</a>
                </div>
              </div>
            </section>

            {/* Vilka uppgifter */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Lock size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Vilka uppgifter samlar vi in?
                </h3>
              </div>
              <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Konto:</strong> namn, e-post, telefonnummer, krypterat lösenord.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Beställningar:</strong> orderhistorik, leveransadresser, valda restauranger och rätter.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Betalning:</strong> token från Stripe (vi lagrar aldrig kortnummer eller CVC).</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Teknisk data:</strong> IP-adress, enhetstyp, push-token (för orderstatus-notiser).</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Analys (frivillig):</strong> felrapporter via Sentry — endast om du accepterar i cookie-bannern.</span></li>
              </ul>
            </section>

            {/* Rättslig grund + ändamål */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Eye size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Rättslig grund &amp; ändamål
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Vi behandlar dina uppgifter på följande grunder:
              </p>
              <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Avtal (GDPR art. 6.1 b):</strong> hantera ditt konto, vidarebefordra beställningar till restauranger, ta betalt och skicka orderstatus.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Rättslig förpliktelse (art. 6.1 c):</strong> bokföring och skattekrav.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Samtycke (art. 6.1 a):</strong> valfri analys / felrapportering. Du kan när som helst återkalla via cookie-inställningarna.</span></li>
              </ul>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Vi delar uppgifter med restaurangen som tar emot din beställning, vår betaltjänstleverantör (Stripe), e-post-leverantör (Resend) och push-tjänster (APNs). Vi säljer <strong>aldrig</strong> data vidare till tredje part.
              </p>
            </section>

            {/* Lagringstid */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Scale size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Lagringstid
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Kontouppgifter sparas så länge ditt konto är aktivt. När du raderar kontot tas dina personuppgifter bort inom 30 dagar — med undantag för bokföringsunderlag som enligt Bokföringslagen (1999:1078) ska sparas i sju (7) år.
              </p>
            </section>

            {/* Dina rättigheter */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Trash2 size={20} />
                </div>
                <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
                  Dina rättigheter
                </h3>
              </div>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Enligt GDPR har du rätt till:
              </p>
              <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Tillgång</strong> till uppgifter vi har om dig (art. 15).</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Rättelse</strong> av felaktig information (art. 16).</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Radering</strong> ("rätten att bli glömd", art. 17) — gör det själv via profilen i appen.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Dataportabilitet</strong> — export i läsbart format (art. 20).</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0" /><span><strong>Invändning</strong> mot behandling (art. 21) och att <strong>återkalla samtycke</strong> när som helst.</span></li>
              </ul>
              <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Klagomål kan lämnas till tillsynsmyndigheten <a href="https://imy.se" className="text-gold-500 underline">Integritetsskyddsmyndigheten (IMY)</a>.
              </p>
            </section>

            <section className="p-8 rounded-3xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
              <h4 className="font-black uppercase tracking-widest text-xs mb-4" style={{ color: "var(--text-primary)" }}>Har du frågor?</h4>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Kontakta vårt dataskyddsombud på <a href={`mailto:${company.privacyEmail}`} className="text-gold-500 underline">{company.privacyEmail}</a> för hjälp med GDPR-relaterade ärenden.
              </p>
              <Link href="/contact" className="inline-flex items-center gap-2 text-gold-500 font-black uppercase tracking-widest text-[10px]">
                Kontakta support <ChevronRight size={14} />
              </Link>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
