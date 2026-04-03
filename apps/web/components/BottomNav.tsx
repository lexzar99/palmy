"use client";

import Link from "next/link";
import { Home, Search, ShoppingBag, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/store/cartStore";

const BottomNav = () => {
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const links = [
    { href: "/", icon: Home, label: "Hem" },
    { href: "/search", icon: Search, label: "Sök" },
    { href: "/cart", icon: ShoppingBag, label: "Kasse" },
    { href: "/history", icon: User, label: "Profil" },
  ];

  return (
    <div className="fixed bottom-4 left-0 right-0 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-white border border-light-400 px-6 py-3 text-dark-text premium-shadow z-50">
      {links.map(({ href, icon: Icon, label }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href.split("?")[0]);
        const isCart = href === "/cart";
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${
              isActive ? "text-gold-600 scale-110" : "text-dark-sub/50 hover:text-dark-text"
            }`}
          >
            <div className="relative">
              <Icon size={20} />
              {isCart && totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-gold-500 text-white text-[8px] font-black px-1">
                  {totalItems}
                </span>
              )}
            </div>
            {label}
          </Link>
        );
      })}
    </div>
  );
};

export default BottomNav;
