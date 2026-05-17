"use client";

import Link from "next/link";
import axios from "axios";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io as socketIO } from "socket.io-client";
import { ArrowRight, Sparkles, ShoppingBag, Clock, Phone } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { usePauseCountdown } from "@/lib/usePauseStatus";

const Hero = () => {
  const [settings, setSettings] = useState<{
    isOpen: boolean;
    estimatedPickupTime: number;
    deliveryFee: number;
    minOrderAmount: number;
    pausedUntil?: string | null;
    isPaused?: boolean;
  }>({
    isOpen: true,
    estimatedPickupTime: 20,
    deliveryFee: 0,
    minOrderAmount: 150,
  });

  const pause = usePauseCountdown(settings.pausedUntil ?? null);

  const showcaseItems = [
    { id: "pizza", src: "/pizza_new.png", alt: "Krispig Pizza", label: "Krispig Pizza" },
    { id: "fries", src: "/fries_new.png", alt: "Guldfrasiga Pommes", label: "Guldfrasiga Pommes" },
    { id: "pita", src: "/pita_new.png", alt: "Legendarisk Pita", label: "Legendarisk Pita" },
    { id: "kebab", src: "/kebab_new.png", alt: "Lyxig Kebabtallrik", label: "Lyxig Kebabtallrik" },
  ];

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % showcaseItems.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/api/settings`).then((res) => {
      setSettings((prev) => ({ ...prev, ...res.data }));
    }).catch(() => { });

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("settings:updated", (data: any) => {
      setSettings((prev) => ({ ...prev, ...data }));
    });

    return () => { socket.disconnect(); };
  }, []);

  return (
    <section
      className="relative flex flex-col items-center justify-center text-center px-4 py-24 sm:py-32 min-h-screen"
      style={{ background: "#050505" }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(212,167,74,0.12) 0%, transparent 65%)",
        }}
      />
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative w-full max-w-2xl mx-auto flex flex-col items-center" style={{ zIndex: 2 }}>
        {/* Status badge — pause åsidosätter både öppet/stängt */}
        <div
          className={`mb-8 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.35em] ${
            pause.isPaused
              ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
              : settings.isOpen
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {pause.isPaused
            ? `Tillfälligt pausad · återöppnar ${pause.resumeTime}`
            : settings.isOpen
            ? "Vi har öppet"
            : "Vi öppnar snart"}
        </div>

        {/* Heading */}
        <h1 className="font-black italic tracking-tighter leading-[1.15] select-none text-white mb-0"
          style={{ fontSize: "clamp(4rem, 18vw, 9rem)" }}>
          FOODGO
        </h1>
        <div
          className="font-black italic tracking-tighter leading-[1.15] select-none border-t border-b border-white/30 px-4 w-full text-center mb-10"
          style={{
            fontSize: "clamp(4rem, 18vw, 9rem)",
            WebkitTextStroke: "1px rgba(255,255,255,0.25)",
            color: "transparent",
          }}
        >
          LUND
        </div>

        {/* Product Showcase */}
        <div
          className="relative w-full flex items-center justify-center rounded-3xl my-6"
          style={{
            height: "clamp(240px, 55vw, 440px)",
          }}
        >
          {/* Glow behind image */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(212,167,74,0.2) 0%, transparent 60%)",
            }}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative w-full h-full flex items-center justify-center"
            >
              <img
                src={showcaseItems[activeIndex].src}
                alt={showcaseItems[activeIndex].alt}
                className="relative object-contain max-w-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] h-[85%]"
              />
              
              {/* CENTERED BUTTON OVER CONTENT */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10] w-full flex justify-center">
                <Link
                  href="/menu"
                  className="group relative flex items-center justify-center gap-4 px-12 py-5 bg-gold-500 text-dark-500 font-bold uppercase tracking-[0.4em] text-[11px] transition-all hover:bg-gold-400 active:scale-95 shadow-[0_20px_60px_rgba(212,167,74,0.5)] overflow-hidden"
                  style={{ borderRadius: "100px" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 -translate-x-full group-hover:animate-shimmer" />
                  Vår Meny
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Label badge */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`label-${activeIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full"
              style={{ zIndex: 20 }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-gold-400 whitespace-nowrap">
                {showcaseItems[activeIndex].label}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex gap-2 mt-4 mb-10">
          {showcaseItems.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`rounded-full transition-all ${i === activeIndex ? "w-6 h-2 bg-gold-500" : "w-2 h-2 bg-white/20"
                }`}
              aria-label={`Bild ${i + 1}`}
            />
          ))}
        </div>

        {/* Secondary CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mb-8 relative z-20">
          <a
            href="tel:046120612"
            className="flex items-center justify-center gap-3 px-10 py-5 border border-white/10 bg-white/5 text-white font-bold uppercase tracking-[0.3em] text-[10px] transition-all hover:bg-white/10 active:scale-95 w-full sm:w-auto"
            style={{ borderRadius: "100px" }}
          >
            <Phone size={14} className="text-gold-500" />
            046-120 612
          </a>
        </div>

        <div className="flex items-center justify-center gap-8 mb-12 flex-wrap">
          {["Alltid Färskt", "Snabb Leverans", "Äkta Ingredienser"].map((benefit) => (
            <div key={benefit} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gold-500 shadow-[0_0_8px_rgba(212,167,74,0.8)]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{benefit}</span>
            </div>
          ))}
        </div>

        {/* Info bar */}
        <div className="flex items-center gap-8 mt-8 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">
          <div className="flex items-center gap-2">
            <ShoppingBag size={13} className="text-gold-500/50" />
            <span>{settings.deliveryFee} kr</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-white/10" />
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-gold-500/50" />
            <span>~{settings.estimatedPickupTime} min</span>
          </div>
        </div>
      </div>

      {/* Sparkle decor */}
      <div className="absolute top-1/4 right-6 opacity-10 pointer-events-none hidden sm:block">
        <Sparkles size={80} className="text-gold-500 blur-sm" />
      </div>
      <div className="absolute bottom-1/4 left-6 opacity-8 pointer-events-none hidden sm:block">
        <Sparkles size={60} className="text-white blur-sm" />
      </div>
    </section>
  );
};

export default Hero;
