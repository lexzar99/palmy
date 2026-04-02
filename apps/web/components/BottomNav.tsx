"use client";

import Link from "next/link";
import { Home, Mail, ShoppingBag, User } from "lucide-react";
import { usePathname } from "next/navigation";

const BottomNav = () => {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-4 left-0 right-0 mx-auto flex max-w-md items-center justify-between rounded-xl bg-[#0d0d0d] border border-white/10 px-8 py-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50">
      <Link 
        href="/" 
        className={`flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${
          pathname === "/" ? "text-gold-500 scale-110" : "text-white/30 hover:text-white"
        }`}
      >
        <Home size={20} />
        Hem
      </Link>
      <Link 
        href="/contact" 
        className={`flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${
          pathname === "/contact" ? "text-gold-500 scale-110" : "text-white/30 hover:text-white"
        }`}
      >
        <Mail size={20} />
        Kontakt
      </Link>
      <Link 
        href="/cart" 
        className={`flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${
          pathname === "/cart" ? "text-gold-500 scale-110" : "text-white/30 hover:text-white"
        }`}
      >
        <ShoppingBag size={20} />
        Kasse
      </Link>
      <Link 
        href="/history" 
        className={`flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${
          pathname === "/history" ? "text-gold-500 scale-110" : "text-white/30 hover:text-white"
        }`}
      >
        <User size={20} />
        Profil
      </Link>
    </div>
  );
};

export default BottomNav;
