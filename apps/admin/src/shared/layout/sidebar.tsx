"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BellRing,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Filter,
  Gift,
  LayoutDashboard,
  LogOut,
  Map,
  MenuSquare,
  ReceiptText,
  Shield,
  Star,
  Store,
  Tag,
  TicketPercent,
  Users,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { clearStoredAdminSession } from "@/shared/auth/storage";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/restaurants", label: "Restaurants", icon: Store },
  { href: "/orders", label: "Orders", icon: Shield },
  { href: "/order-history", label: "Historik", icon: ClipboardList },
  { href: "/menu", label: "Menu", icon: MenuSquare },
  { href: "/categories", label: "Kategorier", icon: Filter },
  { href: "/zones", label: "Zones", icon: Map },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
  { href: "/customers", label: "Customers", icon: ContactRound },
  { href: "/users", label: "Users", icon: Users },
  { href: "/sponsors", label: "Sponsors", icon: TicketPercent },
  { href: "/deals", label: "Deals", icon: Gift },
  { href: "/coupons", label: "Kupongkoder", icon: Tag },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/push", label: "Push", icon: BellRing },
  { href: "/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/tiers", label: "Tiers", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearStoredAdminSession();
    router.replace("/login");
  };

  return (
    <aside className="sidebar-shell">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 py-2.5 mb-1">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-[10px] font-black text-[#11151b]">
          M
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-[var(--text-secondary)]">
          MATGO
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <div className="grid gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-link", active && "nav-link-active")}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer — logout */}
      <div className="mt-1.5 border-t border-[var(--border-subtle)] pt-1.5">
        <button
          type="button"
          onClick={handleLogout}
          className="nav-link w-full text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <LogOut size={14} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
