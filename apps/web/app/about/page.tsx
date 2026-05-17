import type { Metadata } from "next";
import { Sparkles, Building2 } from "lucide-react";
import { API_URL } from "@/lib/api";

export const metadata: Metadata = {
  title: "Om oss | FoodGo",
  description: "FoodGo är en online beställningsplattform som kopplar dig till lokala restauranger.",
};

type PlatformSettings = {
  contactAddress?: string | null;
  aboutBody?: string | null;
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

export default async function OmOssPage() {
  const settings = await getPlatformSettings();
  const customBody = settings.aboutBody?.trim();

  return (
    <div className="min-h-screen md:pt-20" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="pt-20 pb-24 px-6 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 text-gold-600 text-xs font-bold uppercase tracking-wider mb-8 border border-gold-500/20">
          <Sparkles size={12} /> Beställningsplattform
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-tight" style={{ color: "var(--text-primary)" }}>
          Om <span className="text-gold-500">FoodGo</span>
        </h1>
        <div className="space-y-6 text-lg leading-relaxed max-w-3xl" style={{ color: "var(--text-secondary)" }}>
          {customBody ? (
            // Admin-skriven text — splittra på blankrader till stycken
            customBody.split(/\n\s*\n/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))
          ) : (
            <>
              <p>
                FoodGo är en <span style={{ color: "var(--text-primary)" }} className="font-medium">online beställningsplattform</span> som kopplar
                hungriga kunder till lokala restauranger. Vi är inte en restaurang själva — vi hjälper restaurangerna nå dig snabbare
                och dig att hitta dem enklare.
              </p>
              <p>
                Varje restaurang du ser här har sin egen meny, sina egna deals och sina egna öppettider. Vi sköter beställningen
                och betalningen så att restaurangerna kan fokusera på maten.
              </p>
              <p>
                Snabb leverans, säker betalning och support när du behöver det. Det är det FoodGo är till för.
              </p>
            </>
          )}
        </div>

        {/* Företagsinfo om admin har lagt in adress */}
        {settings.contactAddress && (
          <div className="mt-20 p-10 rounded-[2rem] shadow-sm max-w-3xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500">
                <Building2 size={18} />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>Företagsadress</h2>
            </div>
            <div className="whitespace-pre-line text-base font-bold" style={{ color: "var(--text-primary)" }}>
              {settings.contactAddress}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
