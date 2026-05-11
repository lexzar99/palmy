"use client";

import Link from "next/link";
import { ShoppingCart, Menu, X, Sun, Moon } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTheme } from "@/app/providers";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  if (!mounted) return (
    <nav className="fixed top-0 left-0 right-0 z-[100]" style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
       <div className="flex items-center gap-3">
          <span className="text-2xl font-black italic tracking-tighter" style={{ color: "var(--text-primary)" }}>
            MAT<span className="text-gold-500">GO</span>
          </span>
       </div>
    </nav>
  );
  return (
    <nav className={`fixed top-0 left-0 right-0 border-b transition-all duration-300 ${isOpen ? 'z-[200]' : 'z-[100] backdrop-blur-md'}`} style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-muted)" }}>
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 group" aria-label="MatGo — startsidan">
          <span className="text-2xl font-black italic tracking-tighter leading-none transition-transform group-hover:scale-105" style={{ color: "var(--text-primary)" }}>
            MAT<span className="text-gold-500">GO</span>
          </span>
        </Link>

        {/* Desktop-links — plattform har ingen "meny" (det är hem), ingen
            partner-portal (admin nås via egen subdomän), och ingen
            öppet-status (plattformen är alltid live — restaurang-status
            visas per restaurang istället). */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
          <Link href="/" className="hover:text-gold-500 transition-colors">Hem</Link>
          <Link href="/discover" className="hover:text-gold-500 transition-colors">Upptäck</Link>
          <Link href="/about" className="hover:text-gold-500 transition-colors">Om oss</Link>
          <Link href="/contact" className="hover:text-gold-500 transition-colors">Kontakt</Link>
          <Link href="/orders" className="hover:text-gold-500 transition-colors border-l pl-8" style={{ borderColor: "var(--border-muted)" }}>Mina beställningar</Link>
          <Link href="/profile" className="hover:text-gold-500 transition-colors text-gold-500">Logga in</Link>
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
                  { name: "Upptäck", href: "/discover" },
                  { name: "Mina Beställningar", href: "/orders" },
                  { name: "Logga in", href: "/profile" },
                ].map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                     <Link
                       href={link.href}
                       onClick={() => setIsOpen(false)}
                       className="text-4xl font-black uppercase tracking-tighter italic"
                       style={{ color: link.name === 'Mina Beställningar' || link.name === 'Logga in' ? 'var(--gold-primary)' : 'var(--text-primary)' }}
                    >
                      {link.name}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
      </AnimatePresence>



    </nav>
  );
};

export default Navbar;
