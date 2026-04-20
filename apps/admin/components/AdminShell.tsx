"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { usePathname, useRouter } from "next/navigation";
import { Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import AdminRealtimeBridge from "@/components/AdminRealtimeBridge";
import CommandPalette, { CommandPaletteTrigger } from "@/components/CommandPalette";
import { ToastProvider } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { clearStoredAdminSession, getStoredToken } from "@/lib/auth-storage";

const getPageMeta = (pathname: string) => {
  if (pathname.startsWith("/dashboard") || pathname === "/") {
    return { eyebrow: "Control", title: "Control Tower", description: "Samlad driftvy för orders, restauranger, payouts och risker." };
  }
  if (pathname.startsWith("/orders") || pathname.startsWith("/history")) {
    return { eyebrow: "Orders", title: "Order Flow", description: "Köer, live-status och återställning utan överlappande dashboards." };
  }
  if (pathname.startsWith("/restaurant-ops")) {
    return { eyebrow: "Restaurants", title: "Restauranghub", description: "Öppettider, leveransinställningar, admin-alias och status i en central hub." };
  }
  if (pathname.startsWith("/finance") || pathname.startsWith("/billing")) {
    return { eyebrow: "Finance", title: "Finance HQ", description: "Utbetalningar, provisioner och restaurangernas payout-beredskap." };
  }
  if (pathname.startsWith("/performance") || pathname.startsWith("/analytics") || pathname.startsWith("/bi") || pathname.startsWith("/stats")) {
    return { eyebrow: "Insights", title: "Performance", description: "En gemensam analysyta för BI, statistik, reviews och kundsignaler." };
  }
  if (pathname.startsWith("/restaurants")) {
    return { eyebrow: "Catalog", title: "Restauranger", description: "Profil, onboarding och djupare restaurangdetaljer." };
  }
  if (pathname.startsWith("/customers")) {
    return { eyebrow: "Growth", title: "Kunder", description: "CRM, supportärenden och kundlojalitet i samma vy." };
  }
  if (pathname.startsWith("/deals") || pathname.startsWith("/discounts") || pathname.startsWith("/push") || pathname.startsWith("/reviews") || pathname.startsWith("/sponsors")) {
    return { eyebrow: "Growth", title: "Growth Tools", description: "Deals, rabattkoder, push och kvalitetssignaler utan splittrade kampanjsidor." };
  }
  if (pathname.startsWith("/menu") || pathname.startsWith("/categories") || pathname.startsWith("/cities")) {
    return { eyebrow: "Catalog", title: "Catalog Ops", description: "Meny, zoner och hemsidessektioner på ett tydligare sätt." };
  }
  if (pathname.startsWith("/settings/receipt") || pathname.startsWith("/settings/printing") || pathname.startsWith("/system") || pathname.startsWith("/staff") || pathname.startsWith("/log")) {
    return { eyebrow: "Platform", title: "Platform Tools", description: "Systemhälsa, kvitton, utskrift och åtkomsthantering." };
  }

  return { eyebrow: "MatGo", title: "Admin", description: "Nyrenoverad kontrollpanel med mindre duplicering och tydligare arbetsflöden." };
};

const LoadingState = () => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6">
    <div className="panel flex w-full max-w-[540px] flex-col items-center gap-6 rounded-[36px] px-8 py-10 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[28px] bg-gold-gradient text-3xl font-black text-[#091018] shadow-[0_30px_90px_rgba(245,191,91,0.2)]">
        M
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[var(--text-muted)]">
          MatGo Control
        </p>
        <h1 className="text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">Verifierar säker session</h1>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Laddar den nya adminpanelen och kontrollerar att sessionen fortfarande har rätt scope.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-full border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.26em] text-[var(--text-muted)]">
        <Clock3 size={14} className="animate-spin-slow" /> Secure bootstrap
      </div>
    </div>
  </div>
);

const BlockedState = () => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6">
    <div className="panel flex w-full max-w-[620px] flex-col gap-6 rounded-[36px] px-8 py-10 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-amber-300/10 text-amber-200">
        <LockKeyhole size={34} />
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[var(--text-muted)]">
          Restaurangkonto upptäckt
        </p>
        <h1 className="text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">Desktoppanelen är nu låst till superadmin</h1>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Restaurangpersonalen fortsätter arbeta i MatGo Business-appen. Den här webbpanelen är reserverad för plattformsstyrning,
          payouts, kvalitet och övervakning på desktop.
        </p>
      </div>
      <div className="mx-auto flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">
        <ShieldCheck size={14} /> Session verifierad men rollen är inte superadmin
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

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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

        <div className="relative lg:pl-[320px]">
          <div className="sticky top-[61px] z-20 border-b border-[var(--border-subtle)] bg-[rgba(8,12,24,0.78)] backdrop-blur-xl lg:top-0">
            <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="control-chip">{pageMeta.eyebrow}</span>
                    <span className="control-chip">
                      <ShieldCheck size={13} /> Safe session
                    </span>
                    <span className="control-chip">
                      <Clock3 size={13} /> Live sync
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-1 lg:flex-row lg:items-end lg:gap-3">
                    <h1 className="truncate text-[28px] font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-[34px]">
                      {pageMeta.title}
                    </h1>
                    <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)] lg:pb-1">
                      {pageMeta.description}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <CommandPaletteTrigger />
                  <span className="control-chip hidden xl:inline-flex">
                    <LockKeyhole size={13} /> Role gated
                  </span>
                </div>
              </div>
            </div>
          </div>

          <main className="mx-auto max-w-[1680px] px-4 pb-10 pt-28 sm:px-6 lg:px-8 lg:pb-14 lg:pt-6">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
