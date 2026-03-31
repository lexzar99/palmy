"use client";

import Link from "next/link";
import { ShoppingCart, Menu, X, User } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";

const Navbar = () => {
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [restaurantOpen, setRestaurantOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);

    const loadStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settings`);
        setRestaurantOpen(Boolean(res.data.isOpen));
      } catch {}
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
      ? "bg-white/10 text-white/50 border border-white/10"
      : restaurantOpen
        ? "bg-green-500/10 text-green-300 border border-green-500/20"
        : "bg-red-500/10 text-red-300 border border-red-500/20";

  const statusLabel =
    restaurantOpen === null ? "STATUS" : restaurantOpen ? "ÖPPET" : "STÄNGT";

  if (!mounted) return (
    <nav className="fixed top-0 left-0 right-0 z-[100]" style={{ background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
       <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center font-bold text-dark-500 text-xl">P</div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            PALMYRA <span className="text-gold-500">PIZZERIA</span>
          </span>
       </div>
    </nav>
  );
  return (
    <nav className={`fixed top-0 left-0 right-0 border-b border-white/5 transition-all duration-300 ${isOpen ? 'z-[200] bg-dark-500' : 'z-[100] bg-[#0d0d0d]/95 backdrop-blur-md'}`}>
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center font-bold text-dark-500 text-xl group-hover:bg-gold-400 transition-colors">
            P
          </div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            PALMYRA <span className="text-gold-500">PIZZERIA</span>
          </span>
        </Link>
        
        {/* Desktops links... */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60 uppercase tracking-widest">
          <Link href="/" className="hover:text-gold-500 transition-colors">Hem</Link>
          <Link href="/menu" className="hover:text-gold-500 transition-colors">Meny</Link>
          <Link href="/about" className="hover:text-gold-500 transition-colors">Om oss</Link>
          <Link href="/contact" className="hover:text-gold-500 transition-colors">Kontakt</Link>
          <Link href="/history" className="hover:text-gold-500 transition-colors border-l border-white/10 pl-8">Mina Beställningar</Link>
          <div className={`rounded-full px-3 py-1 text-[10px] font-black tracking-[0.25em] ${statusClass}`}>
            {statusLabel}
          </div>
        </div>

        <div className="flex items-center gap-4 relative z-[100]">
          <Link 
            href="/cart" 
            className="relative p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors group"
          >
            <ShoppingCart size={20} className="text-gold-500 group-hover:scale-110 transition-transform" />
            {itemCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-gold-500 text-dark-500 text-[10px] font-bold rounded-full flex items-center justify-center"
              >
                {itemCount}
              </motion.span>
            )}
          </Link>
          <button 
            type="button" 
            onClick={() => setIsOpen(!isOpen)} 
            className="md:hidden p-3 -mr-2 text-white bg-white/5 rounded-xl hover:bg-white/10 active:scale-95 transition-all select-none touch-manipulation"
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] md:hidden bg-[#0d0d0d] flex flex-col pt-24 pb-12 px-6 overflow-y-auto"
          >

            {/* Close button for full screen menu */}
            <div className="flex justify-between items-center mb-10">
              <Link href="/" onClick={() => setIsOpen(false)} className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gold-500 rounded flex items-center justify-center font-bold text-dark-500 text-lg">P</div>
                <span className="text-sm font-black tracking-widest text-white uppercase italic">Palmyra</span>
              </Link>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-3 text-white bg-white/10 rounded-xl active:scale-90 transition-all border border-white/10"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {[
                { name: "Hem", href: "/" },
                { name: "Meny", href: "/menu" },
                { name: "Om oss", href: "/about" },
                { name: "Kontakt", href: "/contact" },
              ].map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link 
                    href={link.href} 
                    onClick={() => setIsOpen(false)} 
                    className="text-4xl font-black uppercase tracking-tight text-white hover:text-gold-500 active:text-gold-500 transition-colors"
                  >
                    {link.name}
                  </Link>
                </motion.div>
              ))}
              
              <div className="h-px bg-white/10 my-4" />
              
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Link 
                  href="/history" 
                  onClick={() => setIsOpen(false)} 
                  className="text-xl font-black uppercase tracking-tight text-gold-500/80"
                >
                  Mina Beställningar
                </Link>
              </motion.div>
            </div>

            <div className="mt-auto">
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
