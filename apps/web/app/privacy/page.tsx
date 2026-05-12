"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronLeft, Shield, Lock, Eye, Trash2, Smartphone, ChevronRight } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pb-32 md:pt-20" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="sticky top-0 md:top-20 z-30 backdrop-blur-xl p-6" style={{ backgroundColor: "rgba(252,252,249,0.8)", borderBottom: "1px solid var(--border-muted)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/profile" className="p-3 rounded-2xl transition-all active:scale-90" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-xl font-black uppercase italic tracking-tighter" style={{ color: "var(--text-primary)" }}>Integritets<span className="text-gold-500">policy</span></h1>
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
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-600 mb-2">GDPR & Säkerhet</div>
                <h2 className="text-3xl font-black italic mb-4 leading-none" style={{ color: "var(--text-primary)" }}>Din integritet är <br/>vår högsta prioritet.</h2>
                <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>På MatGo tar vi hand om dina data som om de vore vår egen mat — med passion och total respekt. Här kan du läsa om hur vi skyddar dig.</p>
             </div>
          </div>

          <div className="space-y-10 mt-12 px-2">
            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                     <Lock size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>Vilka data samlar vi in?</h3>
               </div>
               <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                 När du beställer mat genom MatGo samlar vi in nödvändig information för att kunna leverera din order:
               </p>
               <ul className="space-y-3" style={{ color: "var(--text-secondary)" }}>
                 <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0"/> <span>**Namn och kontaktuppgifter:** För att restaurangen ska veta vem de lagar mat åt.</span></li>
                 <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0"/> <span>**Leveransadress:** Så att maten hamnar på rätt bord.</span></li>
                 <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0"/> <span>**Orderhistorik:** För att ge dig personliga erbjudanden och en smidigare upplevelse.</span></li>
               </ul>
            </section>

            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                     <Eye size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>Hur använder vi din data?</h3>
               </div>
               <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                 Vi säljer **aldrig** din data vidare till tredje part. Den används uteslutande för att:
                 - Hantera och leverera dina beställningar.
                 - Skicka push-notiser om din orderstatus.
                 - Förbättra plattformens funktionalitet och användarupplevelse.
               </p>
            </section>

            <section className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-deep)" }}>
                     <Trash2 size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>Din rätt att bli raderad</h3>
               </div>
               <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                 Du äger din data. Du kan när som helst begära att vi raderar ditt konto och all personlig information direkt via profilinställningarna i appen.
               </p>
            </section>

            <section className="p-8 rounded-3xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
               <h4 className="font-black uppercase tracking-widest text-xs mb-4" style={{ color: "var(--text-primary)" }}>Har du frågor?</h4>
               <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>Kontakta vårt dataskyddsombud på privacy@matgo.se för hjälp med GDPR-relaterade ärenden.</p>
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
