import Hero from "@/components/Hero";

export default function Home() {
  return (
    <div className="bg-dark-500 min-h-screen">
      <Hero />
      
      {/* Featured Section */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-4">
            Varför <span className="text-gold-500">Palmyra</span>?
          </h2>
          <div className="h-1 w-20 bg-gold-500 mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:border-gold-500/20 transition-all">
            <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mx-auto mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <h3 className="text-xl font-bold uppercase mb-4">Bra Deals</h3>
            <p className="text-white/40 text-sm leading-relaxed">Bygg kampanjer med riktiga mål, få live-progress i kassan och handla smartare utan krångel.</p>
          </div>

          <div className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:border-gold-500/20 transition-all">
            <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mx-auto mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 className="text-xl font-bold uppercase mb-4">Snabb Leverans</h3>
            <p className="text-white/40 text-sm leading-relaxed">Kund, restaurang och bud får samma statusflöde live så ordern går snabbare från kök till dörr.</p>
          </div>

          <div className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:border-gold-500/20 transition-all">
            <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mx-auto mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a5 5 0 0 1 0 7.07l-7.07 7.07a1 1 0 0 1-1.41 0L4.88 11.65a5 5 0 0 1 7.07-7.07l3.54 3.54 3.54-3.54Z"/></svg>
            </div>
            <h3 className="text-xl font-bold uppercase mb-4">Mer Än Pizza</h3>
            <p className="text-white/40 text-sm leading-relaxed">Pizzor, rullar, tallrikar, dryck och smarta små tillägg för kunden som vill beställa snabbt.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
