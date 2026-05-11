"use client";

import Link from "next/link";
import { ShoppingCart, Menu, X, Sun, Moon, User as UserIcon } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTheme } from "@/app/providers";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import axios from "axios";
import { PLATFORM_SESSION_CHANGED_EVENT } from "@/lib/platformSessionClient";

type SessionUser = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setMounted(true);

    let cancelled = false;
    const loadUser = async () => {
      try {
        const res = await axios.get(`/api/platform/profile`);
        if (!cancelled && res.data) setUser(res.data);
      } catch {
        if (!cancelled) setUser(null);
      }
    };

    loadUser();

    // Lyssna på session-events (login/logout i samma flik eller annan flik)
    const onChange = () => { void loadUser(); };
    window.addEventListener(PLATFORM_SESSION_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PLATFORM_SESSION_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  // Visningsnamn: först + efternamn om finns, annars name-fältet, annars null
  const displayName = user
    ? ((user.firstName?.trim() || "") + " " + (user.lastName?.trim() || "")).trim()
      || user.name?.trim()
      || null
    : null;

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
    <nav
      className={`fixed top-0 left-0 right-0 border-b transition-all duration-300 ${isOpen ? 'z-[200]' : 'z-[100] backdrop-blur-md'}`}
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-muted)",
        // Subtle skugga under navbaren ger separation från content i båda
        // tema-lägena. Mörkare/tunnare på dark, ljusare på light.
        boxShadow: "0 1px 0 var(--border-muted), 0 4px 16px rgba(0,0,0,0.06)",
      }}
    >
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
        <div className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-widest">
          <Link href="/" className="hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>Hem</Link>
          <Link href="/discover" className="hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>Upptäck</Link>
          <Link href="/about" className="hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>Om oss</Link>
          <Link href="/contact" className="hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>Kontakt</Link>
          <Link href="/orders" className="hover:text-gold-500 transition-colors border-l pl-8" style={{ borderColor: "var(--border-muted)", color: "var(--text-primary)" }}>Mina beställningar</Link>
          {displayName ? (
            <Link href="/profile" className="flex items-center gap-2 text-gold-500 hover:text-gold-400 transition-colors">
              <UserIcon size={14} />
              <span className="truncate max-w-[160px]">{displayName}</span>
            </Link>
          ) : (
            <Link href="/profile" className="text-gold-500 hover:text-gold-400 transition-colors">Logga in</Link>
          )}
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
                  // Visa namn om inloggad, annars "Logga in"
                  { name: displayName ?? "Logga in", href: "/profile", isUser: true },
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
                       style={{ color: link.name === 'Mina Beställningar' || (link as { isUser?: boolean }).isUser ? 'var(--gold-primary)' : 'var(--text-primary)' }}
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
