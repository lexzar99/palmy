"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Cookie, X, ShieldCheck } from "lucide-react";

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("matgo_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptAll = () => {
    localStorage.setItem("matgo_cookie_consent", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-32 md:bottom-8 left-6 right-6 md:left-8 md:right-auto md:max-w-md z-[100]"
      >
        <div className="glass-panel p-6 rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/50 overflow-hidden relative group">
           {/* Background glow */}
           <div className="absolute -right-10 -top-10 w-32 h-32 bg-gold-500/10 rounded-full blur-3xl group-hover:bg-gold-500/20 transition-all duration-700" />
           
           <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                 <div className="w-12 h-12 rounded-2xl bg-gold-500 flex items-center justify-center text-dark-500 shadow-lg shadow-gold-500/20">
                    <Cookie size={24} />
                 </div>
                 <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-text-primary">Cookies & Mat</h3>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em]">Vi vill ge dig den bästa smaken.</p>
                 </div>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed font-medium">
                Vi använder cookies för att anpassa din upplevelse och analysera hur vår app används. Genom att fortsätta äta med oss godkänner du vår <Link href="/privacy" className="text-gold-500 hover:underline">Integritetspolicy</Link>.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                 <button 
                   onClick={acceptAll}
                   className="flex-1 py-4 bg-gold-500 text-dark-500 font-black uppercase tracking-widest text-[10px] rounded-2xl active:scale-95 transition-transform shadow-lg shadow-gold-500/10"
                 >
                    Acceptera Allt
                 </button>
                 <button 
                   onClick={() => setIsVisible(false)}
                   className="flex-1 py-4 bg-bg-secondary text-text-primary border border-border-subtle font-black uppercase tracking-widest text-[10px] rounded-2xl active:scale-95 transition-transform"
                 >
                    Inställningar
                 </button>
              </div>
           </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
