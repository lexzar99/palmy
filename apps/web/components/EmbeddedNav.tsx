"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ReceiptText, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useEffect, useState } from "react";

/**
 * Kiosk-navigation. Den ersätter ViaEats globala navbar när kunden kommer
 * från en partner. Det finns medvetet ingen hem/discover/profil-länk här:
 * kunden stannar i restaurangens meny-, cart- och trackingflöde.
 */
export default function EmbeddedNav() {
  const pathname = usePathname() || "";
  const [embedRestaurant, setEmbedRestaurant] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmbedRestaurant(params.get("embed") === "1" ? params.get("restaurant") || "" : "");
  }, [pathname]);
  const embedQuery = Boolean(embedRestaurant);
  const menuSlug = pathname.startsWith("/embed/")
    ? decodeURIComponent(pathname.split("/")[2] || "")
    : "";
  const embedPage = menuSlug
    || ((pathname === "/cart" || pathname === "/orders" || pathname.startsWith("/order/")) && embedQuery
      ? embedRestaurant
      : "");
  const itemCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));

  if (!embedPage) return null;

  const slugQuery = `?embed=1&restaurant=${encodeURIComponent(embedPage)}`;
  const menuHref = `/embed/${encodeURIComponent(embedPage)}`;
  const cartHref = `/cart${slugQuery}`;
  const ordersHref = `/orders${slugQuery}`;
  const items = [
    { href: menuHref, label: "Meny", icon: Menu, active: pathname.startsWith("/embed/") },
    { href: cartHref, label: "Kundvagn", icon: ShoppingBag, active: pathname === "/cart" },
    { href: ordersHref, label: "Mina order", icon: ReceiptText, active: pathname === "/orders" || pathname.startsWith("/order/") },
  ];

  return (
    <nav
      aria-label="Palmyra beställning"
      className="fixed inset-x-0 bottom-0 z-[1200] border-t md:top-0 md:bottom-auto md:border-b md:border-t-0"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-muted)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-2xl items-stretch justify-around px-2 md:max-w-5xl md:justify-start md:gap-8 md:px-6">
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold md:flex-none md:flex-row md:gap-2 md:px-3 md:text-[13px]"
            style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}
          >
            <span className="relative">
              <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
              {label === "Kundvagn" && itemCount > 0 ? (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black text-white" style={{ backgroundColor: "#F0531C" }}>
                  {itemCount}
                </span>
              ) : null}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
