"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Filter,
  Gift,
  Megaphone,
  LayoutDashboard,
  Map,
  MenuSquare,
  ReceiptText,
  Shield,
  Star,
  Store,
  TicketPercent,
  Users,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/restaurants", label: "Restaurants", icon: Store },
  { href: "/orders", label: "Orders", icon: Shield },
  { href: "/order-history", label: "Order-historik", icon: ClipboardList },
  { href: "/menu", label: "Menu", icon: MenuSquare },
  { href: "/categories", label: "Kategorier", icon: Filter },
  { href: "/zones", label: "Zones", icon: Map },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
  { href: "/customers", label: "Customers", icon: ContactRound },
  { href: "/users", label: "Users", icon: Users },
  { href: "/sponsors", label: "Sponsors", icon: TicketPercent },
  { href: "/deals", label: "Deals", icon: Gift },
  { href: "/popup-builder", label: "Popup Builder", icon: Megaphone },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/push", label: "Push", icon: BellRing },
  { href: "/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/tiers", label: "Tier System", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar-shell">
      <div className="flex h-full flex-col gap-6">
        <div className="surface px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-lg font-black text-[#11151b]">
              M
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">MatGo</p>
              <p className="text-xl font-black tracking-[-0.04em]">Admin Control</p>
            </div>
          </div>
        </div>

        <nav className="surface flex-1 px-3 py-3">
          <div className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Modules</div>
          <div className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link key={item.href} href={item.href} className={cn("nav-link", active && "nav-link-active")}>
                  <Icon size={18} />
                  <span className="font-semibold">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

      </div>
    </aside>
  );
}
