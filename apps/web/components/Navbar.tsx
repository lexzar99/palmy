"use client";

import Link from "next/link";
import { ShoppingCart, Menu, X, User, Sun, Moon } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTheme } from "@/app/providers";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [restaurantOpen, setRestaurantOpen] = useState<boolean | null>(null);

  const partnerPortalUrl = mounted
    ? (() => {
        if (process.env.NEXT_PUBLIC_ADMIN_APP_URL) return process.env.NEXT_PUBLIC_ADMIN_APP_URL;
        const { protocol, hostname, origin } = window.location;
        const isLocal = hostname.includes("localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
        return isLocal ? `${protocol}//${hostname}:3001/login` : `${origin}/admin`;
      })()
    : "/admin";

  useEffect(() => {
    setMounted(true);

    const loadStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settings`);
        setRestaurantOpen(Boolean(res.data.isOpen));
      } catch (err) {
        console.warn("Failed to load restaurant status:", err);
      }
    };

    loadStatus();

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socket.on("settings:updated", (data: any) => {
      setRestaurantOpen(typeof data.isOpen === "boolean" ? data.isOpen : null);
    });

    const interval = window.setInterval(loadStatus, 15000);

    return () => {
      window.clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);


  const statusClass =
    restaurantOpen === null
      ? "bg-zinc-100 text-zinc-400 border border-zinc-200"
      : restaurantOpen
        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
        : "bg-rose-500/10 text-rose-600 border border-rose-500/20";

  const statusLabel =
    restaurantOpen === null ? "STATUS" : restaurantOpen ? "ÖPPET" : "STÄNGT";

  if (!mounted) return (
    <nav className="fixed top-0 left-0 right-0 z-[100]" style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
       <div className="flex items-center gap-3">
          <img src="/logo.png" alt="MatGo Logo" className="w-10 h-10" />
          <span className="text-xl font-black" style={{ color: "var(--text-primary)" }}>MATGO</span>
       </div>
    </nav>
  );
  return (
    <nav className={`fixed top-0 left-0 right-0 border-b transition-all duration-300 ${isOpen ? 'z-[200]' : 'z-[100] backdrop-blur-md'}`} style={{ backgroundColor: isOpen ? "var(--bg-primary)" : "rgba(252,252,249,0.95)", borderColor: "var(--border-muted)" }}>
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-12 h-12 flex-shrink-0">
            <img src="/logo.png" alt="MatGo Logo" className="w-full h-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex flex-col -gap-1">
            <span className="text-xl font-black tracking-tighter leading-none" style={{ color: "var(--text-primary)" }}>
              MATGO
            </span>
          </div>
        </Link>
        
        {/* Desktops links... */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
          <Link href="/" className="hover:text-gold-500 transition-colors">Hem</Link>
          <Link href="/menu" className="hover:text-gold-500 transition-colors">Meny</Link>
          <Link href="/about" className="hover:text-gold-500 transition-colors">Om oss</Link>
          <Link href="/contact" className="hover:text-gold-500 transition-colors">Kontakt</Link>
          <Link href={partnerPortalUrl} target="_blank" rel="noreferrer" className="hover:text-gold-500 transition-colors">Partnerportal</Link>
          <Link href="/profile?tab=orders" className="hover:text-gold-500 transition-colors border-l pl-8" style={{ borderColor: "var(--border-muted)" }}>Mina Beställningar</Link>
          <div className={`rounded-full px-3 py-1 text-[10px] font-black tracking-[0.25em] ${statusClass}`}>
            {statusLabel}
          </div>
        </div>

        <div className="flex items-center gap-4 relative z-[100]">
          <button 
            onClick={toggleTheme}
            className="p-2 transition-colors rounded-full"
            style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}
          >
            {theme === 'dark' ? <Sun size={20} className="text-gold-500" /> : <Moon size={20} className="text-gold-600" />}
          </button>

          <Link 
            href="/cart" 
            className="relative p-2 transition-colors group rounded-full"
            style={{ backgroundColor: "var(--bg-deep)" }}
          >
            <ShoppingCart size={20} className="text-gold-600 group-hover:scale-110 transition-transform" />
            {itemCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-gold-500 text-zinc-950 text-[10px] font-bold rounded-full flex items-center justify-center"
              >
                {itemCount}
              </motion.span>
            )}
          </Link>
          <button 
            type="button" 
            onClick={() => setIsOpen(!isOpen)} 
            className="md:hidden p-3 -mr-2 rounded-xl active:scale-95 transition-all select-none touch-manipulation" 
            style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}
            aria-label="Toggle Menu"
          >
            {isOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "100%" }}
              className="fixed inset-0 z-[190] md:hidden flex flex-col pt-32 pb-12 px-8 overflow-y-auto"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <div className="flex flex-col gap-8">
                {[
                  { name: "Hem", href: "/" },
                  { name: "Meny", href: "/menu" },
                  { name: "Om oss", href: "/about" },
                  { name: "Kontakt", href: "/contact" },
                  { name: "Partnerportal", href: partnerPortalUrl },
                  { name: "Mina Beställningar", href: "/history" },
                ].map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                     <Link 
                       href={link.href} 
                       target={link.name === 'Partnerportal' ? '_blank' : undefined}
                       rel={link.name === 'Partnerportal' ? 'noreferrer' : undefined}
                       onClick={() => setIsOpen(false)} 
                       className={`text-4xl font-black uppercase tracking-tighter italic ${link.name === 'Beställningar' ? 'text-gold-500/80 text-2xl mt-4' : ''}`}
                       style={{ color: link.name === 'Mina Beställningar' ? 'var(--gold-primary)' : 'var(--text-primary)' }}
                    >
                      {link.name}
                    </Link>
                  </motion.div>
                ))}
              </div>

              <div className="mt-auto pt-10">
                <div className={`rounded-2xl px-6 py-5 text-[10px] font-black uppercase tracking-[0.35em] flex items-center justify-center text-center ${statusClass}`}>
                  {restaurantOpen === null ? "Laddar status..." : restaurantOpen ? "✓ Öppet för beställning" : "✕ Restaurangen är stängd"}
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>



    </nav>
  );
};

export default Navbar;
