import type { Metadata } from "next";
import { Sparkles, Building2, Mail } from "lucide-react";
import { getCompanyInfo } from "@/lib/companyInfo";

export const metadata: Metadata = {
  title: "Om oss | Delívera",
  description: "Delívera är en online beställningsplattform som kopplar dig till lokala restauranger.",
};

export default async function OmOssPage() {
  const company = await getCompanyInfo();
  const customBody = company.aboutBody?.trim();
  const address = company.address || company.contactAddress || "";

  return (
    <div className="min-h-screen pt-[env(safe-area-inset-top,0px)] md:pt-20" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="pt-12 md:pt-20 pb-24 px-6 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 text-gold-600 text-xs font-bold uppercase tracking-wider mb-8 border border-gold-500/20">
          <Sparkles size={12} /> Beställningsplattform
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-tight" style={{ color: "var(--text-primary)" }}>
          Om <span className="text-gold-500">Delívera</span>
        </h1>
        <div className="space-y-6 text-lg leading-relaxed max-w-3xl" style={{ color: "var(--text-secondary)" }}>
          {customBody ? (
            customBody.split(/\n\s*\n/).map((paragraph: string, i: number) => (
              <p key={i}>{paragraph}</p>
            ))
          ) : (
            <>
              <p>
                Delívera är en <span style={{ color: "var(--text-primary)" }} className="font-medium">beställningsplattform</span> som
                kopplar samman dig med lokala restauranger. Vi lagar ingen mat själva, vi gör det enkelt för dig att hitta
                restaurangerna och för dem att nå dig snabbt.
              </p>
              <p>
                Varje restaurang har sin egen meny, sina egna erbjudanden och sina egna öppettider. Vi sköter beställningen,
                betalningen och spårningen så att köken kan fokusera på det de är bäst på, maten.
              </p>
              <p>
                Leveransen sköts antingen av restaurangen själv eller av Delíveras egna bud, beroende på område. Du samlar
                Dpoints på varje betald order och kan lösa in dem mot produkter och rabatter.
              </p>
              <p>
                Snabb leverans, trygg betalning via Mollie och support när du behöver den. Det är vad Delívera finns till för.
              </p>
            </>
          )}
        </div>

        {/* Företagsuppgifter: juridiskt namn, orgnr, adress och support hämtas
            live från admin (Plattform-inställningar → GET /api/settings). */}
        <div className="mt-16 md:mt-20 p-8 md:p-10 rounded-[2rem] shadow-sm max-w-3xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500">
              <Building2 size={18} />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>Företagsuppgifter</h2>
          </div>
          <dl className="space-y-4 text-base">
            <div>
              <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Juridiskt namn</dt>
              <dd className="font-bold" style={{ color: "var(--text-primary)" }}>{company.name}</dd>
            </div>
            {company.organizationNumber && (
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Organisationsnummer</dt>
                <dd className="font-bold" style={{ color: "var(--text-primary)" }}>{company.organizationNumber}</dd>
              </div>
            )}
            {address && (
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Adress</dt>
                <dd className="whitespace-pre-line font-bold" style={{ color: "var(--text-primary)" }}>{address}</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5">Support</dt>
              <dd>
                <a href={`mailto:${company.supportEmail}`} className="inline-flex items-center gap-2 font-bold text-gold-600 hover:text-gold-500 transition-colors">
                  <Mail size={15} /> {company.supportEmail}
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
