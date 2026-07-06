"use client";

import { useState, useEffect } from "react";
import { Plus, X, Share } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const InstallPWA = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const isStandalone = 
      window.matchMedia("(display-mode: standalone)").matches || 
      (window.navigator as any).standalone === true;

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    const dismissedAtRaw = localStorage.getItem("viaeats_pwa_dismissed_at");
    const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : 0;
    const recentlyDismissed = dismissedAt > 0 && Date.now() - dismissedAt < 24 * 60 * 60 * 1000;
    
    const onBeforeInstallPrompt = (e: any) => {
      // Chrome/Edge: capture the event and show our own UI.
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isStandalone && !recentlyDismissed) {
        setShowPrompt(true);
      }
    };

    const handleManualTrigger = () => {
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt as any);
    window.addEventListener("trigger-pwa-install", handleManualTrigger);

    // iOS has no beforeinstallprompt; show the instructions banner.
    if (isIOSDevice && !isStandalone && !recentlyDismissed) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt as any);
      window.removeEventListener("trigger-pwa-install", handleManualTrigger);
    };
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    // Don't show again for 24 hours
    localStorage.setItem("viaeats_pwa_dismissed_at", Date.now().toString());
  };

  if (!showPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // No install prompt available (often due to missing SW/HTTPS or already installed).
      handleDismiss();
      return;
    }

    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      handleDismiss();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-6 right-6 z-[200] md:left-auto md:right-8 md:max-w-sm"
      >
        <div className="bg-zinc-900 border border-white/5 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden shadow-xl">
          {/* Subtle glow */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gold-500" />
          
          <button 
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 text-zinc-400/30 hover:text-zinc-100 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-gold-500 rounded-2xl flex items-center justify-center font-black text-white text-2xl shrink-0 shadow-lg shadow-gold-500/20">
              D
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-zinc-100 uppercase italic">
                Installera ViaEats
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                Appen funkar bäst när du lägger till den på hemskärmen!
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {isIOS ? (
              <div className="bg-zinc-950 rounded-2xl p-4 border border-white/5">
                <p className="text-xs font-bold text-zinc-400 flex items-center gap-2 mb-2 uppercase tracking-wider">
                  Hur man installerar på iPhone:
                </p>
                <ol className="text-xs text-zinc-400/80 space-y-3">
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800/50 flex items-center justify-center shrink-0 border border-white/5">
                      <Share size={14} className="text-blue-500" />
                    </div>
                    <span>Tryck på <strong>Delningsknappen</strong> i Safari</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800/50 flex items-center justify-center shrink-0 border border-white/5">
                      <Plus size={14} className="text-zinc-100" />
                    </div>
                    <span>Välj <strong>Lägg till på hemskärmen</strong></span>
                  </li>
                </ol>
              </div>
            ) : (
              <button 
                onClick={handleInstall}
                className="w-full py-4 bg-gold-500 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-gold-600 transition-colors shadow-lg shadow-gold-500/20"
              >
                Lägg till på hemskärmen
              </button>
            )}
            
            <p className="text-[9px] text-center text-zinc-400/40 font-black uppercase tracking-widest">
              Snabbt • Enkelt • Bulletproof
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InstallPWA;
