"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { usePathname, useRouter } from "next/navigation";
import { Clock3, Command, LockKeyhole, ShieldCheck } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import AdminRealtimeBridge from "@/components/AdminRealtimeBridge";
import CommandPalette, { CommandPaletteTrigger } from "@/components/CommandPalette";
import { ToastProvider } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { clearStoredAdminSession, getStoredToken } from "@/lib/auth-storage";
import { useRestaurantStore } from "@/store/restaurantStore";

const getPageMeta = (pathname: string) => {
  if (pathname.startsWith("/dashboard") || pathname === "/") {
    return {
      eyebrow: "Översikt",
      title: "Det viktigaste för idag",
      description: "En enkel startsida för ordrar, restauranger och zonlogik utan flera parallella dashboards.",
    };
  }

  if (pathname.startsWith("/orders") || pathname.startsWith("/history")) {
    return {
      eyebrow: "Beställningar",
      title: "Orderflöde",
      description: "En plats för nya ordrar, pågående flöden och historik.",
    };
  }

  if (pathname.startsWith("/restaurant-ops")) {
    return {
      eyebrow: "Drift",
      title: "Restaurangkö",
      description: "Lista över restauranger som behöver uppföljning. Klicka vidare till en riktig sida i stället för inline-editor.",
    };
  }

  if (pathname.startsWith("/restaurants")) {
    return {
      eyebrow: "Restauranger",
      title: "Partneröversikt",
      description: "Varje restaurang öppnas på egen sida med modaler för redigering i stället för lång scroll.",
    };
  }

  if (pathname.startsWith("/cities")) {
    return {
      eyebrow: "Leverans",
      title: "Städer och zoner",
      description: "Stad och zon är källan för avgift och minimum. Restaurangsidorna är nu avskalade från den dupliceringen.",
    };
  }

  if (pathname.startsWith("/menu")) {
    return {
      eyebrow: "Meny",
      title: "Menyhantering",
      description: "Arbeta med kategorier och produkter utan att blanda ihop det med driftinställningar.",
    };
  }

  if (pathname.startsWith("/finance") || pathname.startsWith("/billing")) {
    return {
      eyebrow: "Ekonomi",
      title: "Ekonomi och payouts",
      description: "Utbetalningar och ekonomisk uppföljning i en egen yta.",
    };
  }

  if (pathname.startsWith("/customers")) {
    return {
      eyebrow: "Kunder",
      title: "Kundverktyg",
      description: "Support, historik och kundsignal på ett ställe.",
    };
  }

  return {
    eyebrow: "Admin",
    title: "Verktyg",
    description: "Förenklad adminyta med få tydliga huvudflöden.",
  };
};

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6">
      <div className="panel flex w-full max-w-[520px] flex-col items-center gap-5 rounded-[28px] px-8 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-xl font-black text-[#091018]">M</div>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[var(--text-muted)]">MatGo Admin</p>
          <h1 className="text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">Verifierar session</h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Laddar panelen och kontrollerar att du fortfarande är inloggad som superadmin.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-secondary)]">
          <Clock3 size={14} className="animate-spin-slow" /> Säker kontroll
        </div>
      </div>
    </div>
  );
}

function BlockedState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6">
      <div className="panel flex w-full max-w-[620px] flex-col gap-6 rounded-[28px] px-8 py-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200">
          <LockKeyhole size={30} />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[var(--text-muted)]">Rollen är begränsad</p>
          <h1 className="text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">Desktop-admin är låst till superadmin</h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Restaurangpersonalen fortsätter i Business-appen. Den här webbpanelen är bara för plattformsarbete.</p>
        </div>
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">
          <ShieldCheck size={14} /> Session verifierad
        </div>
        <button
          type="button"
          onClick={() => {
            clearStoredAdminSession();
            window.location.href = "/login";
          }}
          className="mx-auto inline-flex items-center justify-center rounded-2xl bg-gold-gradient px-6 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]"
        >
          Logga ut
        </button>
      </div>
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedRestaurantName } = useRestaurantStore();
  const isLoginPage = pathname === "/login";
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [notSuperAdmin, setNotSuperAdmin] = useState(false);

  useEffect(() => {
    if (isLoginPage) {
      setReady(true);
      setAuthed(true);
      return;
    }

    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      setReady(true);
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const response = await axios.post(`${API_URL}/api/account/verify`, { token });
        if (!response.data?.valid) {
          throw new Error("invalid-session");
        }

        if (cancelled) return;

        const admin = response.data.admin;
        localStorage.setItem("matgo_admin", JSON.stringify(admin));

        if (admin?.role !== "SUPER_ADMIN") {
          setNotSuperAdmin(true);
          setReady(true);
          return;
        }

        setAuthed(true);
        setReady(true);
      } catch {
        if (cancelled) return;
        clearStoredAdminSession();
        router.replace("/login");
        setReady(true);
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, router]);

  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!ready || !authed) {
    if (notSuperAdmin) {
      return <BlockedState />;
    }

    return <LoadingState />;
  }

  return (
    <ToastProvider>
      <div className="relative min-h-screen bg-admin-canvas text-[var(--text-primary)]">
        <AdminRealtimeBridge />
        <CommandPalette />
        <Sidebar />

        <div className="relative lg:pl-[300px]">
          <div className="sticky top-[61px] z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/92 backdrop-blur lg:top-0">
            <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="control-chip">{pageMeta.eyebrow}</span>
                    <span className="control-chip">
                      <ShieldCheck size={13} /> Live sync
                    </span>
                    {selectedRestaurantName ? <span className="control-chip">Scope: {selectedRestaurantName}</span> : null}
                  </div>
                  <div className="mt-3 space-y-1">
                    <h1 className="truncate text-[28px] font-black tracking-[-0.05em] text-[var(--text-primary)] sm:text-[34px]">{pageMeta.title}</h1>
                    <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{pageMeta.description}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="control-chip hidden md:inline-flex">
                    <Command size={13} /> Cmd/Ctrl + K
                  </span>
                  <CommandPaletteTrigger />
                </div>
              </div>
            </div>
          </div>

          <main className="mx-auto max-w-[1480px] px-4 pb-10 pt-28 sm:px-6 lg:px-8 lg:pb-14 lg:pt-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
