"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronLeft, Shield, Lock, Eye, Trash2, Smartphone, ChevronRight } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg-primary/80 backdrop-blur-xl border-b border-border-subtle p-6">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/profile" className="p-3 bg-bg-secondary rounded-2xl text-text-secondary hover:text-text-primary transition-all active:scale-90">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-xl font-black uppercase italic tracking-tighter">Integritets<span className="text-gold-500">policy</span></h1>
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
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500 mb-2">GDPR & Säkerhet</div>
                <h2 className="text-3xl font-black italic mb-4 leading-none">Din integritet är <br/>vår högsta prioritet.</h2>
                <p className="text-text-secondary leading-relaxed">På MatGo tar vi hand om dina data som om de vore vår egen mat — med passion och total respekt. Här kan du läsa om hur vi skyddar dig.</p>
             </div>
          </div>

          <div className="space-y-10 mt-12 px-2">
            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-gold-500">
                     <Lock size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic">Vilka data samlar vi in?</h3>
               </div>
               <p className="text-text-secondary leading-relaxed">
                 När du beställer mat genom MatGo samlar vi in nödvändig information för att kunna leverera din order:
               </p>
               <ul className="space-y-3 text-text-secondary">
                 <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0"/> <span>**Namn och kontaktuppgifter:** För att restaurangen ska veta vem de lagar mat åt.</span></li>
                 <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0"/> <span>**Leveransadress:** Så att maten hamnar på rätt bord.</span></li>
                 <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0"/> <span>**Orderhistorik:** För att ge dig personliga erbjudanden och en smidigare upplevelse.</span></li>
               </ul>
            </section>

            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-gold-500">
                     <Eye size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic">Hur använder vi din data?</h3>
               </div>
               <p className="text-text-secondary leading-relaxed">
                 Vi säljer **aldrig** din data vidare till tredje part. Den används uteslutande för att:
                 - Hantera och leverera dina beställningar.
                 - Skicka push-notiser om din orderstatus.
                 - Förbättra plattformens funktionalitet och användarupplevelse.
               </p>
            </section>

            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center text-gold-500">
                     <Trash2 size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic">Din rätt att bli raderad</h3>
               </div>
               <p className="text-text-secondary leading-relaxed">
                 Du äger din data. Du kan när som helst begära att vi raderar ditt konto och all personlig information direkt via profilinställningarna i appen.
               </p>
            </section>

            <section className="p-8 rounded-3xl bg-bg-secondary border border-border-subtle">
               <h4 className="font-black uppercase tracking-widest text-xs mb-4">Har du frågor?</h4>
               <p className="text-sm text-text-secondary mb-6">Kontakta vårt dataskyddsombud på privacy@matgo.se för hjälp med GDPR-relaterade ärenden.</p>
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
