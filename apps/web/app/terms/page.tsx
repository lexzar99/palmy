"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronLeft, Scale, Award, ShoppingBag, Clock, Ban } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg-primary/80 backdrop-blur-xl border-b border-border-subtle p-6">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/profile" className="p-3 bg-bg-secondary rounded-2xl text-text-secondary hover:text-text-primary transition-all active:scale-90">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-xl font-black uppercase italic tracking-tighter">Allmänna <span className="text-gold-500">Villkor</span></h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-12 mt-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="p-8 rounded-[3rem] bg-amber-500/5 border border-amber-500/10 relative overflow-hidden">
             <Scale className="absolute -right-8 -top-8 text-amber-500/10 w-48 h-48 -rotate-12" />
             <div className="relative z-10">
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-2">Avtal & Trygghet</div>
                <h2 className="text-3xl font-black italic mb-4 leading-none">MatGo och dig.<br/>Detta gäller när du beställer.</h2>
                <p className="text-text-secondary leading-relaxed">Genom att använda MatGo-plattformen godkänner du våra användarvillkor. Vi vill att din upplevelse ska vara så smidig som möjligt — men här är det finstilta.</p>
             </div>
          </div>

          <div className="space-y-10 mt-12 px-2">
            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-amber-500">
                     <ShoppingBag size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic">Beställning & Betalning</h3>
               </div>
               <p className="text-text-secondary leading-relaxed">
                 När du lägger en order via MatGo är din beställning bindande. Restaurangen påbörjar tillagningen så snart de accepterat din order. Betalning sker genom våra auktoriserade betalpartners (Stripe).
               </p>
            </section>

            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-amber-500">
                     <Clock size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic">Leverans & Avhämtning</h3>
               </div>
               <p className="text-text-secondary leading-relaxed">
                 Vi beräknar en uppskattad tid för leverans (ETA) men detta är inte en garanti. Om du väljer leverans ansvarar restaurangen för att maten når dig enligt deras leveransvillkor.
               </p>
            </section>

            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-amber-500">
                     <Ban size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic">Ångerrätt & Reklamation</h3>
               </div>
               <p className="text-text-secondary leading-relaxed">
                 Då mat är en färskvara gäller **ej** ångerrätt enligt distansavtalslagen. Om något är fel på din mat förväntar vi oss att du kontaktar den berörda restaurangen direkt.
               </p>
            </section>

            <section className="p-8 rounded-3xl bg-bg-secondary border border-border-subtle">
               <h4 className="font-black uppercase tracking-widest text-xs mb-4">Om MatGo</h4>
               <p className="text-sm text-text-secondary mb-6">MatGo är en plattform som förmedlar din beställning till restaurangen. Avtalet för maten du äter sluts mellan dig och den restaurang du har valt.</p>
               <div className="text-[9px] uppercase tracking-widest font-black text-text-secondary/40">Version: 2026.04 | Lund, Sverige</div>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
