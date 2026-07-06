"use client";

import Link from "next/link";
import { Shield, ChevronRight } from "lucide-react";

interface CompanyProps {
  name: string;
  organizationNumber: string;
  address: string;
  email: string;
  privacyEmail: string;
}

export default function PrivacyContent({ company }: { company: CompanyProps }) {
  const displayValue = (value: string) => (value && value.trim() ? value : "-");

  return (
    <div
      className="min-h-screen pt-[env(safe-area-inset-top,0px)] md:pt-20"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="pt-12 md:pt-20 pb-24 px-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 text-gold-600 text-xs font-bold uppercase tracking-wider mb-8 border border-gold-500/20">
          <Shield size={12} /> Integritetspolicy
        </div>
        <h1
          className="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Din data hos <span className="text-gold-500">ViaEats</span>
        </h1>
        <p className="text-lg leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          {company.name} är personuppgiftsansvarig för dina uppgifter. Vi följer
          Dataskyddsförordningen (GDPR), behandlar bara det vi behöver för att leverera din mat
          och säljer aldrig din data vidare.
        </p>

        <div className="mt-14 space-y-12">
          {/* Personuppgiftsansvarig */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Personuppgiftsansvarig
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
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Dataskyddsombud</dt>
                <dd>
                  <a href={`mailto:${company.privacyEmail}`} className="font-semibold text-gold-600 hover:text-gold-500 transition-colors">{company.privacyEmail}</a>
                </dd>
              </div>
            </dl>
          </section>

          {/* Vilka uppgifter */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Vilka uppgifter samlar vi in?
            </h2>
            <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Konto:</strong> namn, e-post, telefonnummer, krypterat lösenord.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Beställningar:</strong> orderhistorik, leveransadresser, valda restauranger och rätter.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Betalning:</strong> hanteras av Mollie. Vi lagrar aldrig kortnummer eller CVC.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Vpoints:</strong> intjänade och inlösta poäng kopplade till ditt konto.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Teknisk data:</strong> IP-adress, enhetstyp, push-token för orderstatus-notiser.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Analys (frivillig):</strong> felrapporter via Sentry, endast om du accepterar i cookie-bannern.</span></li>
            </ul>
          </section>

          {/* Rättslig grund + ändamål */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Rättslig grund och ändamål
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              Vi behandlar dina uppgifter på följande grunder:
            </p>
            <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Avtal (GDPR art. 6.1 b):</strong> hantera ditt konto, vidarebefordra beställningar till restauranger, ta betalt och skicka orderstatus.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Rättslig förpliktelse (art. 6.1 c):</strong> bokföring och skattekrav.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Samtycke (art. 6.1 a):</strong> valfri analys och felrapportering. Du kan när som helst återkalla via cookie-inställningarna.</span></li>
            </ul>
            <p className="mt-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Vi delar uppgifter med restaurangen som tar emot din beställning, med det bud som
              levererar (eget bud från ViaEats eller restaurangens egen leverans), vår
              betaltjänstleverantör (Mollie B.V.), e-postleverantör (Resend) och push-tjänst (APNs).
              Dessa är personuppgiftsbiträden som bara behandlar uppgifterna för att fullgöra din
              order. Vi säljer <strong>aldrig</strong> data vidare till tredje part.
            </p>
          </section>

          {/* Lagringstid */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Lagringstid
            </h2>
            <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Kontouppgifter sparas så länge ditt konto är aktivt. När du raderar kontot tas dina
              personuppgifter bort inom 30 dagar, med undantag för order- och bokföringsunderlag
              som enligt Bokföringslagen (1999:1078) ska sparas i sju (7) år.
            </p>
          </section>

          {/* Dina rättigheter */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              Dina rättigheter
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              Enligt GDPR har du rätt till:
            </p>
            <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Tillgång</strong> till uppgifter vi har om dig (art. 15).</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Rättelse</strong> av felaktig information (art. 16).</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Radering</strong> (&rdquo;rätten att bli glömd&rdquo;, art. 17). Gör det själv via profilen i appen.</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Dataportabilitet</strong>, export i läsbart format (art. 20).</span></li>
              <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 shrink-0" /><span><strong>Invändning</strong> mot behandling (art. 21) och rätt att <strong>återkalla samtycke</strong> när som helst.</span></li>
            </ul>
            <p className="mt-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Klagomål kan lämnas till tillsynsmyndigheten{" "}
              <a href="https://imy.se" className="text-gold-600 underline">Integritetsskyddsmyndigheten (IMY)</a>.
            </p>
          </section>

          {/* Frågor */}
          <section
            className="p-6 md:p-8 rounded-2xl"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
          >
            <h2 className="text-base font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
              Har du frågor?
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
              Kontakta vårt dataskyddsombud på{" "}
              <a href={`mailto:${company.privacyEmail}`} className="text-gold-600 underline">{company.privacyEmail}</a>{" "}
              för hjälp med GDPR-relaterade ärenden.
            </p>
            <Link href="/contact" className="inline-flex items-center gap-1.5 text-gold-600 font-bold text-sm hover:text-gold-500 transition-colors">
              Kontakta support <ChevronRight size={15} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
