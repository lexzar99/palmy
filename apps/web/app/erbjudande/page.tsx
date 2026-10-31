import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { ArrowRight, Check } from "lucide-react";
import LeadSheet from "./LeadSheet";
import StickyCta from "./StickyCta";
import { SITE_URL } from "@/lib/siteUrl";
import "./erbjudande.css";

const brandFont = localFont({ src: "../fonts/Baloo2-latin-variable.woff2", weight: "500 800", display: "swap", variable: "--font-baloo" });
const sansFont = localFont({ src: "../fonts/InterTight-Variable-latin.woff2", weight: "300 900", display: "swap", variable: "--font-offer-sans" });
const serifFont = localFont({ src: "../fonts/InstrumentSerif-Italic-latin.woff2", weight: "400", style: "italic", display: "swap", variable: "--font-offer-serif" });

/** Antal lediga platser (terminaler) just nu. Ändra här när en restaurang skrivit på. */
const SEATS_LEFT = 17;
const BOOK = "/boka?utm_source=erbjudande";
const SIGNUP = "#registrera";

const TITLE = "Beställningssystem för restauranger: 5 % per order | viaeats";
const DESCRIPTION = "Gratis hemsida, beställningssystem och terminal för din restaurang. Bara 5 % per order. Ingen startavgift, månadsavgift, bindningstid eller uppsägningstid.";
const PAGE_URL = `${SITE_URL}/erbjudande`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "viaeats",
    title: "Gratis hemsida och beställningssystem. Bara 5 % per order.",
    description: "Ingen startavgift, ingen månadsavgift, ingen bindningstid och ingen uppsägningstid.",
    url: PAGE_URL,
    images: [{ url: "/erbjudande/og.jpg", width: 1200, height: 630, alt: "viaeats: gratis hemsida och beställningssystem för restauranger, 5 % per order" }],
  },
  twitter: { card: "summary_large_image", title: "Gratis hemsida och beställningssystem. Bara 5 % per order.", description: DESCRIPTION, images: ["/erbjudande/og.jpg"] },
};

const TERMS = ["Ingen startavgift", "Ingen månadsavgift", "Ingen bindningstid", "Ingen uppsägningstid"];

const INCLUDED = [
  { title: "Modern hemsida", text: "Byggd för mobilen, så att gästen hittar rätt och beställer direkt. Vi gör den åt dig.", tag: "Gratis" },
  { title: "Beställningssystem online", text: "Din egen beställningssida. Kunderna betalar med Swish eller kort.", tag: "Gratis" },
  { title: "Terminal i köket", text: "Beställningen dyker upp och kvittot skrivs ut direkt. Du lånar terminalen av oss.", tag: "Gratis lån" },
  { title: "Vi fixar allt", text: "Vi lägger upp menyn, bygger sidan och installerar terminalen. Du lagar maten.", tag: "Ingår" },
];

const COMPARE = [
  { name: "foodora", note: "med bud", value: "20–30 %", width: "100%", tone: "rust" },
  { name: "Lumit", note: "upp till", value: "7 %", width: "23.3%", tone: "stone" },
  { name: "viaeats", note: "", value: "5 %", width: "16.7%", tone: "us" },
];

const STEPS = [
  { title: "Fyll i dina uppgifter", text: "Det tar 20 sekunder. Vi ringer upp inom en arbetsdag." },
  { title: "Vi bygger allt", text: "Hemsida, meny och beställning kan vara klara inom 24 timmar." },
  { title: "Beställningarna rullar in", text: "Du lagar maten. Kunderna betalar med Swish eller kort." },
];

const FAQ = [
  { q: "Vad är ett beställningssystem för restauranger?", a: "Det är en tjänst där gästerna beställer och betalar online, direkt på restaurangens egen hemsida. Beställningen kommer sedan in till en terminal i köket." },
  { q: "Vad kostar det?", a: "5 % per order. Ingen startavgift, ingen månadsavgift, ingen bindningstid och ingen uppsägningstid. Hemsidan, beställningssystemet och lånet av terminalen är gratis. Alla villkor står i avtalet, som du läser innan du skriver på." },
  { q: "Jag har redan Lumit eller något annat. Kan jag byta?", a: "Ja. Vi flyttar över menyn och sköter bytet åt dig." },
  { q: "Hur snabbt kommer jag igång?", a: "Din hemsida och onlinebeställning kan vara klara inom 24 timmar från att vi har din meny." },
  { q: "Hur betalar kunderna?", a: "Med Swish eller kort, direkt i beställningen. Du får snabba utbetalningar till ditt företagskonto." },
  { q: "Vad kostar en hemsida för en restaurang?", a: "Hos viaeats är hemsidan gratis. Vi bygger den åt dig, och du betalar 5 % per order som kommer in via viaeats." },
  { q: "Vad kostar ett beställningssystem för en restaurang?", a: "Beställningssystemet är gratis att komma igång med. Du betalar ingen startavgift eller månadsavgift, bara 5 % per order." },
  { q: "Hur får min restaurang egen onlinebeställning?", a: "Fyll i dina uppgifter på den här sidan så ringer vi upp. Vi bygger hemsidan, lägger upp menyn och installerar terminalen." },
  { q: "Kan jag ta emot beställningar online utan foodora?", a: "Ja. Med en egen hemsida och ett eget beställningssystem beställer gästerna direkt av din restaurang." },
  { q: "Hur byter jag från Lumit till viaeats?", a: "Hör av dig så går vi igenom bytet. Vi lägger upp din meny och bygger din nya hemsida, och du har ingen bindningstid hos oss." },
  { q: "Kan kunderna betala med Swish på min hemsida?", a: "Ja. Kunderna kan betala med Swish eller kort direkt när de beställer." },
  { q: "Behöver kunderna ladda ner en app?", a: "Nej. Kunderna beställer direkt i webbläsaren på din hemsida." },
  { q: "Fungerar det för avhämtning och hemleverans?", a: "Ja. Du kan ta emot avhämtning, egen hemleverans eller båda delarna." },
  { q: "Fungerar det för pizzerior och foodtrucks?", a: "Ja. Systemet klarar menyer med storlekar, tillval och drycker, och passar pizzerior, grillar, foodtrucks och restauranger." },
  { q: "Finns det bindningstid eller uppsägningstid?", a: "Nej. Det finns ingen bindningstid och ingen uppsägningstid." },
  { q: "Vad händer med terminalen om jag slutar?", a: "Terminalen är vår och du lånar den så länge du använder viaeats. Slutar du lämnar du tillbaka den." },
];

/** Strukturerad data. Frågorna måste vara samma som på sidan, annars ignorerar Google dem. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "viaeats", url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
    { "@type": "WebPage", "@id": `${PAGE_URL}#webpage`, url: PAGE_URL, name: TITLE, description: DESCRIPTION, inLanguage: "sv-SE", isPartOf: { "@type": "WebSite", url: SITE_URL, name: "viaeats" }, publisher: { "@id": `${SITE_URL}/#organization` } },
    { "@type": "Service", name: "Beställningssystem för restauranger", serviceType: "Beställningssystem online och hemsida för restauranger", provider: { "@id": `${SITE_URL}/#organization` }, areaServed: { "@type": "Country", name: "Sverige" }, url: PAGE_URL, description: DESCRIPTION },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "viaeats", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Beställningssystem för restauranger", item: PAGE_URL }] },
    { "@type": "FAQPage", mainEntity: FAQ.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) },
  ],
};

export default function ErbjudandePage() {
  return (
    <div className={`offer-site ${brandFont.variable} ${sansFont.variable} ${serifFont.variable}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="offer-header">
        <span className="offer-wordmark">viaeats<span>för restauranger</span></span>
        <a href={SIGNUP} className="offer-header-cta">Testa gratis</a>
      </header>

      <main>
        <section className="offer-hero offer-hero-lead">
          <div className="offer-hero-copy">
            <p className="offer-seats-pill"><span className="offer-live" aria-hidden="true" />{SEATS_LEFT} platser kvar</p>
            <h1>Gratis hemsida och beställnings{"\u00AD"}system för din restaurang. <em>Bara 5 % per order.</em></h1>
            <p className="offer-lead">Onlinebeställning med Swish och kort, och terminal i köket. Vi lägger upp menyn och fixar allt.</p>
            <ul className="offer-ticks" aria-label="Villkor">
              {TERMS.map((term) => <li key={term}><Check size={16} aria-hidden="true" />{term}</li>)}
            </ul>
            <a href={SIGNUP} className="offer-btn offer-btn-primary offer-hero-cta">Testa gratis <ArrowRight size={20} aria-hidden="true" /></a>
            <p className="offer-hero-alt">Tar 20 sekunder. Vi ringer upp. <Link href={BOOK}>Eller boka en tid</Link></p>
          </div>
          <div className="offer-hero-media">
            <div className="offer-phone">
              <video src="/erbjudande/film.mp4" poster="/erbjudande/poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-label="Film: så här beställer kunden med viaeats" />
            </div>
          </div>
        </section>

        <section className="offer-section offer-compare" aria-labelledby="jamfor">
          <p className="offer-kicker offer-kicker-light">Jämför själv</p>
          <h2 id="jamfor">Billigare än Lumit och foodora.</h2>
          <div className="offer-bars">
            {COMPARE.map((row) => (
              <div key={row.name} className={`offer-bar offer-bar-${row.tone}`}>
                <div className="offer-bar-head"><span><b>{row.name}</b>{row.note && <small>{row.note}</small>}</span><strong>{row.value}</strong></div>
                <div className="offer-bar-track"><span style={{ width: row.width }} /></div>
              </div>
            ))}
          </div>
          <p className="offer-compare-note">Lumit: högst 7 % enligt lumit.com. foodora: med bud, varierar per avtal. Priser exklusive moms.</p>
          <a href={SIGNUP} className="offer-btn offer-btn-light">Testa gratis <ArrowRight size={18} aria-hidden="true" /></a>
        </section>

        <section className="offer-section" aria-labelledby="ingar">
          <p className="offer-kicker">Det här får du</p>
          <h2 id="ingar">Allt din restaurang behöver för att ta emot beställningar online.</h2>
          <div className="offer-grid">
            {INCLUDED.map((item, i) => (
              <article key={item.title} className="offer-card">
                <span className="offer-num">0{i + 1}</span>
                <span className="offer-free">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="offer-section offer-proof" aria-labelledby="bevis">
          <div>
            <p className="offer-kicker">Riktig partner</p>
            <h2 id="bevis">Palmyra Pizzeria gick från 150 kr till <em>230 kr</em> i snittorder.</h2>
            <p>När det är enkelt att välja storlek, dryck och tillbehör beställer kunden mer. Det blir mer pengar till dig.</p>
            <a href={SIGNUP} className="offer-btn offer-btn-primary">Testa gratis <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </section>

        <section className="offer-section" aria-labelledby="sa">
          <p className="offer-kicker">Så går det till</p>
          <h2 id="sa">Tre steg. Sedan är du igång.</h2>
          <ol className="offer-steps">
            {STEPS.map((step, i) => <li key={step.title}><span>{i + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}
          </ol>
        </section>

        <section className="offer-section offer-prose" aria-labelledby="om">
          <p className="offer-kicker">Beställningssystem för restauranger</p>
          <h2 id="om">Ta emot beställningar online på din egen hemsida.</h2>
          <div>
            <p>Med ett eget beställningssystem beställer gästerna direkt av din restaurang. viaeats bygger en modern hemsida åt dig, kopplar på onlinebeställning och ställer en terminal i köket. Gästen väljer rätter och tillval, betalar med Swish eller kort, och beställningen kommer rakt in i köket.</p>
            <h3>Passar pizzerior, foodtrucks, grillar och restauranger</h3>
            <p>Du kan ta emot avhämtning och egen hemleverans. Vi lägger upp hela menyn med storlekar och tillval, så att du slipper göra det själv. Din hemsida och onlinebeställning kan vara klara inom 24 timmar från att vi har din meny.</p>
            <h3>Ett alternativ till Lumit och foodora</h3>
            <p>Lumit tar upp till 7 % per order och foodora med bud ofta 20–30 %. Hos viaeats betalar du 5 % per order, utan startavgift, månadsavgift, bindningstid och uppsägningstid. Har du redan ett beställningssystem hjälper vi dig att byta.</p>
          </div>
        </section>

        <section className="offer-section" aria-labelledby="fragor">
          <p className="offer-kicker">Frågor</p>
          <h2 id="fragor">Vanliga frågor om beställningssystem för restauranger.</h2>
          <div className="offer-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="offer-final">
          <h2>Bara {SEATS_LEFT} platser kvar. <em>Testa gratis.</em></h2>
          <p>{TERMS.join(" · ")}</p>
          <a href={SIGNUP} className="offer-btn offer-btn-light">Testa gratis <ArrowRight size={18} aria-hidden="true" /></a>
        </section>
      </main>

      <footer className="offer-footer">
        <span className="offer-wordmark">viaeats</span>
        <div><Link href="/boka">Boka genomgång</Link><Link href="/privacy">Integritet</Link></div>
      </footer>
      <StickyCta />
      <LeadSheet />
    </div>
  );
}
