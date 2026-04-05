"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, ShoppingBag, User } from "lucide-react";
import { motion } from "framer-motion";
import { useCartStore } from "@/store/cartStore";

const BottomNav = () => {
  const pathname = usePathname();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const navItems = [
    { href: "/", label: "Hem", icon: Home },
    { href: "/search", label: "Sök", icon: Search },
    { href: "/cart", label: "Kasse", icon: ShoppingBag, count: itemCount },
    { href: "/profile", label: "Profil", icon: User },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-48px)] max-w-md">
      <nav className="glass-panel rounded-[2.5rem] p-2 flex items-center justify-between shadow-2xl shadow-black/50 border border-white/10">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center py-3 px-6 rounded-[2rem] transition-all duration-500 group ${
                isActive ? "bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20" : "text-zinc-500 hover:text-zinc-100"
              }`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="transition-transform group-active:scale-95" />
                {item.count !== undefined && item.count > 0 && !isActive && (
                  <span className="absolute -top-1.5 -right-1.5 bg-gold-500 text-zinc-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-zinc-950">
                    {item.count}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest mt-1.5 transition-all ${
                isActive ? "opacity-100 scale-100" : "opacity-0 scale-50 h-0 w-0 pointer-events-none"
              }`}>
                {item.label}
              </span>
              
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-gold-500 rounded-[2rem] -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
