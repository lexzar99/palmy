"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  Search,
  Store,
  Sun,
  X,
} from "lucide-react";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { logoutAdminSession } from "@/shared/auth/storage";
import {
  getStoredTheme,
  setStoredTheme,
  type Theme,
} from "@/shared/store/theme";
import {
  ADMIN_ROUTES,
  ADMIN_SECTIONS,
  isActiveAdminHref,
} from "@/shared/navigation/admin-routes";

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = useAdminSession();
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    live: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const name = session.data?.name?.trim() || "Administratör";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const active = (id: string, href: string) => {
    if (id === "finance") return pathname === "/finance";
    if (id === "finance-restaurant") {
      if (pathname.startsWith("/finance/restaurangekonomi")) return true;
      const part = pathname.split("/")[2] || "";
      return (
        pathname.startsWith("/finance/") &&
        Boolean(part) &&
        !["payouts", "avstamning", "installningar"].includes(part)
      );
    }
    if (id === "tiers")
      return (
        isActiveAdminHref(pathname, href) && searchParams.get("tab") === "tiers"
      );
    return isActiveAdminHref(pathname, href);
  };
  const current = ADMIN_ROUTES.find((item) => active(item.id, item.href));

  useEffect(() => {
    const element = drawer.current;
    if (!element || !mobileOpen) return;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    setTheme(next);
  };
  const themeButton = (
    <button
      type="button"
      className="workspace-icon"
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? "Byt till ljust tema" : "Byt till mörkt tema"
      }
      title={theme === "dark" ? "Ljust tema" : "Mörkt tema"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
  const closeMenu = () => setMobileOpen(false);
  const menu = (
    <>
      <div className="workspace-brand-row">
        <Link className="workspace-brand" href="/dashboard" onClick={closeMenu}>
          viaeats<span>·</span>
        </Link>
        <span className="workspace-admin-label">admin</span>
      </div>
      <button
        type="button"
        className="workspace-search"
        onClick={() => {
          closeMenu();
          onOpenPalette();
        }}
      >
        <Search size={16} />
        <span>Sök i panelen</span>
        <kbd>⌘ K</kbd>
      </button>
      <nav className="workspace-navigation" aria-label="Alla sidor">
        {ADMIN_SECTIONS.map((section) => {
          const containsCurrent = section.routes.some((item) =>
            active(item.id, item.href),
          );
          const open = expanded[section.id] ?? containsCurrent;
          return (
            <div className="workspace-nav-group" key={section.id}>
              <button
                type="button"
                className="workspace-section"
                aria-expanded={open}
                onClick={() =>
                  setExpanded((value) => ({ ...value, [section.id]: !open }))
                }
              >
                {section.label}
                <ChevronDown
                  size={13}
                  style={{ transform: open ? undefined : "rotate(-90deg)" }}
                />
              </button>
              {open &&
                section.routes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="workspace-nav-link"
                      aria-current={
                        active(item.id, item.href) ? "page" : undefined
                      }
                      onClick={closeMenu}
                    >
                      <Icon size={17} strokeWidth={1.7} />
                      <span>{item.shortLabel ?? item.label}</span>
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>
      <div className="workspace-user">
        <Link href="/users" onClick={closeMenu}>
          <span className="workspace-avatar">{initials}</span>
          <span>
            <strong>{name}</strong>
            <small>Administratör</small>
          </span>
        </Link>
        {themeButton}
      </div>
      <div className="workspace-account-actions">
        <button
          type="button"
          onClick={async () => {
            await logoutAdminSession();
            router.replace("/login");
          }}
        >
          <LogOut size={14} />
          Logga ut
        </button>
        <button
          type="button"
          onClick={async () => {
            if (window.confirm("Logga ut alla enheter för detta konto?")) {
              await logoutAdminSession(true);
              router.replace("/login");
            }
          }}
        >
          Alla enheter
        </button>
      </div>
    </>
  );
  return (
    <>
      <aside className="workspace-sidebar">{menu}</aside>
      <header className="workspace-toolbar">
        <span className="workspace-location">
          <span>viaeats</span>
          <span aria-hidden="true">/</span>
          {current?.shortLabel ?? current?.label ?? "Admin"}
        </span>
        <div className="workspace-toolbar-actions">
          <button
            type="button"
            className="workspace-icon"
            onClick={onOpenPalette}
            aria-label="Sök i panelen"
          >
            <Search size={18} />
          </button>
          {themeButton}
        </div>
      </header>
      <nav className="workspace-tabs" aria-label="Huvudnavigation">
        {[
          { href: "/dashboard", label: "Översikt", Icon: LayoutDashboard },
          { href: "/orders", label: "Ordrar", Icon: ReceiptText },
          { href: "/restaurants", label: "Restauranger", Icon: Store },
        ].map(({ href, label, Icon }) => (
          <Link
            href={href}
            key={href}
            aria-current={
              isActiveAdminHref(pathname, href) ? "page" : undefined
            }
          >
            <Icon size={21} strokeWidth={1.7} />
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Öppna hela menyn"
          aria-expanded={mobileOpen}
        >
          <Menu size={21} strokeWidth={1.7} />
          <span>Mer</span>
        </button>
      </nav>
      <dialog
        ref={drawer}
        className="workspace-drawer"
        aria-label="Navigation"
        onCancel={closeMenu}
        onClose={closeMenu}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div className="workspace-drawer-content">
          <button
            type="button"
            className="workspace-icon workspace-drawer-close"
            onClick={closeMenu}
            aria-label="Stäng meny"
          >
            <X size={20} />
          </button>
          {menu}
        </div>
      </dialog>
    </>
  );
}
