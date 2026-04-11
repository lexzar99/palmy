"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, ShoppingBag, User, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "@/store/cartStore";

const BottomNav = () => {
  const pathname = usePathname();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const navItems = [
    { href: "/", label: "Hem", icon: Home },
    { href: "/discover", label: "Upptäck", icon: Compass },
    { href: "/cart", label: "Kasse", icon: ShoppingBag, count: itemCount },
    { href: "/profile", label: "Profil", icon: User },
  ];

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6">
      <nav className="bg-[#121214]/80 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-2 flex items-center justify-between shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex-1 flex flex-col items-center justify-center py-4 px-2 rounded-[2.5rem] transition-colors duration-300"
            >
              <div className="relative z-10 flex flex-col items-center gap-1">
                <motion.div
                  animate={{ 
                    scale: isActive ? 1.1 : 1,
                    color: isActive ? "#09090b" : "#52525b"
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Icon 
                    size={20} 
                    strokeWidth={isActive ? 2.5 : 2} 
                    fill={isActive ? "currentColor" : "none"} 
                  />
                </motion.div>
                
                <AnimatePresence>
                  {isActive && (
                    <motion.span 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-950"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {item.count !== undefined && item.count > 0 && !isActive && (
                  <span className="absolute -top-1 -right-2 bg-gold-500 text-zinc-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#121214] shadow-sm">
                    {item.count}
                  </span>
                )}
              </div>
              
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-1 bg-gold-gradient rounded-[2.2rem] shadow-[0_8px_20px_-4px_rgba(234,179,8,0.3)]"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
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
