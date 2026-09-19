import type { Metadata } from "next";
import PartnerForm from "../PartnerForm";
export const metadata: Metadata = { title: "Planera installation för din restaurang | viaeats", alternates: { canonical: "/tipsa/installation" } };
export default function InstallationPage() {
  return <section className="partner-install"><div className="partner-wrap partner-two-col"><div><p className="partner-eyebrow">För restaurangägare</p><h1>Nästa steg?<br/>Vi tar hand<br/>om tekniken.</h1><p>Har du pratat med oss eller en av våra samarbetspartners? Lämna dina uppgifter och en tid som passar, så kontaktar vi dig för att planera installationen.</p><p className="partner-small">Vi går igenom avtal, meny och hur beställningarna ska fungera innan uppstart. Ingen tid är bokad förrän vi har bekräftat den.</p></div><div className="partner-form-card"><h3>Planera din uppstart.</h3><p>Vi bekräftar tid och upplägg via e-post.</p><PartnerForm installation/></div></div></section>;
}
