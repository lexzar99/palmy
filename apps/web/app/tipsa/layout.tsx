import Link from "next/link";
import localFont from "next/font/local";
const brandFont = localFont({ src: "../fonts/Baloo2-latin-variable.woff2", weight: "500 800", display: "swap", variable: "--font-baloo" });
import type { Metadata } from "next";
import "./partners.css";

export const metadata: Metadata = {
  title: "Ta med en restaurang. Få 800 kr. | viaeats",
  description: "Bli samarbetspartner till viaeats i Skåne. 500 kr efter godkänt restaurangavtal och 300 kr inom 30 dagar. Anmäl ditt intresse så hör vi av oss.",
  openGraph: { title: "Ditt nästa samtal kan vara värt 800 kr.", description: "Kontakta restaurangägare och hjälp dem byta till viaeats. Vi ger dig materialet och sköter tekniken.", images: [{ url: "/partners/share.png", width: 1200, height: 630 }] },
};
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <div className={`partner-site ${brandFont.variable}`}><a className="partner-skip" href="#partner-content">Till innehållet</a><header className="partner-header"><Link href="/tipsa" className="partner-wordmark" aria-label="viaeats partnerprogram">viaeats<span>partners</span></Link><nav aria-label="Partnerprogram"><Link href="/tipsa#sa-funkar-det">Så funkar det</Link><Link className="partner-header-cta" href="/tipsa#anmalan">Jag är intresserad <span aria-hidden="true">↗</span></Link></nav></header><div id="partner-content">{children}</div><footer className="partner-footer"><Link href="/tipsa" className="partner-wordmark">viaeats</Link><p>Lokala restauranger. Nya möjligheter.</p><div><Link href="/tipsa/villkor">Villkor & integritet</Link><Link href="/for-restauranger">För restauranger</Link><Link href="/contact">Kontakta oss</Link></div></footer></div>;
}
