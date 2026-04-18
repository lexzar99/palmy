import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Om oss | MatGo Lund",
  description: "Lär känna MatGo Lund och vår resa sedan 2019.",
};

export default function OmOssPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#171513" }}>
      <div className="pt-32 pb-24 px-6 max-w-5xl mx-auto">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/20 text-gold-500 text-xs font-bold uppercase tracking-wider mb-8 border border-gold-500/20">
            Sedan 2019
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-tight" style={{ color: "#FFF8EA" }}>
            Om <span className="text-gold-500">MatGo</span>
          </h1>

          <div className="space-y-6 text-lg leading-relaxed" style={{ color: "#B8AA95" }}>
            <p>
              MatGo Lund är en modern restaurang i hjärtat av Lund. Sedan 2019 har vi byggt upp ett brett utbud av
              pizza, rullar, tallrikar och kvällsmat med <span style={{ color: "#FFF8EA" }} className="font-medium">snabb service</span>
              och ett tydligt fokus på smak.
            </p>
            <p>
              Vi jobbar med ett enkelt mål: maten ska vara god, beställningen ska vara smidig och kunden ska kunna följa
              allt live utan att behöva ringa och jaga status.
            </p>
            <p>
              Menyn växer hela tiden med allt från klassiska pizzor till crispy chicken, boxar och deals som gör det
              lättare att beställa lite mer smart.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
            {[
              { number: "2019", label: "Startår" },
              { number: "100+", label: "Rätter på menyn" },
              { number: "4.8/5", label: "Genomsnittligt betyg" },
            ].map((stat) => (
              <div key={stat.label} className="p-8 rounded-3xl text-center" style={{ backgroundColor: "#211C19", border: "1px solid rgba(255,248,234,0.08)" }}>
                <div className="text-4xl font-black text-gold-500 mb-2">{stat.number}</div>
                <div className="text-xs uppercase font-black tracking-widest" style={{ color: "rgba(184,170,149,0.4)" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-20 p-10 rounded-[2rem]" style={{ backgroundColor: "#211C19", border: "1px solid rgba(255,248,234,0.08)" }}>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6" style={{ color: "#FFF8EA" }}>Hitta oss</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ color: "#B8AA95" }}>
              <div>
                <div className="text-[10px] uppercase font-black tracking-widest mb-2" style={{ color: "rgba(184,170,149,0.4)" }}>Adress</div>
                <div className="font-bold" style={{ color: "#FFF8EA" }}>Kiliansgatan 14</div>
                <div>223 50 Lund</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-black tracking-widest mb-2" style={{ color: "rgba(184,170,149,0.4)" }}>Öppettider</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Mån-Tis</span><span className="font-bold" style={{ color: "#FFF8EA" }}>11:00 – 22:00</span></div>
                  <div className="flex justify-between"><span>Ons-Lör</span><span className="font-bold" style={{ color: "#FFF8EA" }}>11:00 – 02:00</span></div>
                  <div className="flex justify-between"><span>Söndag</span><span className="font-bold" style={{ color: "#FFF8EA" }}>11:00 – 22:00</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
