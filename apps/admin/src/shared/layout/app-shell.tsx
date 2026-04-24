"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { clearStoredAdminSession } from "@/shared/auth/storage";
import { Button, Surface } from "@/shared/components/ui";
import { Sidebar } from "@/shared/layout/sidebar";
import { RealtimeSync } from "@/shared/layout/realtime-sync";

const metaByPath = [
  { prefix: "/dashboard", title: "Platform overview", description: "Live operations, system health and quick interventions." },
  { prefix: "/restaurants", title: "Restaurant control", description: "Partner operations, restaurant status and configuration." },
  { prefix: "/orders", title: "Order stream", description: "Live orders, status handling and exception control." },
  { prefix: "/menu", title: "Menu operations", description: "Categories, products and extras without cross-module coupling." },
  { prefix: "/zones", title: "Zones and delivery", description: "Cities, polygons, fees and restaurant overrides." },
  { prefix: "/finance", title: "Finance control", description: "Payouts, transactions and report-driven adjustments." },
  { prefix: "/users", title: "Users and roles", description: "Admin access, role changes and credential management." },
  { prefix: "/sponsors", title: "Sponsor placements", description: "Homepage placements and partner campaign management." },
  { prefix: "/deals", title: "Deals and offers", description: "Global deals, restaurant deals and customer-targeted incentives." },
  { prefix: "/reviews", title: "Review operations", description: "Reply, flag and remove customer reviews." },
  { prefix: "/push", title: "Push notifications", description: "Send operational or campaign pushes through the existing API." },
  { prefix: "/receipts", title: "Receipts and printers", description: "Receipt template logic, printer scope and output control." },
  { prefix: "/tiers", title: "Tier system", description: "Preserve and manage restaurant tier classes centrally." },
];

function LoadingScreen() {
  return (
    <div className="auth-shell">
      <Surface className="max-w-xl px-8 py-10 text-center">
        <p className="eyebrow">MatGo Admin</p>
        <h1 className="section-title mt-5">Verifierar session</h1>
        <p className="section-subtitle">Laddar den nya kontrollpanelen och validerar admin-access.</p>
      </Surface>
    </div>
  );
}

function BlockedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="auth-shell">
      <Surface className="max-w-2xl px-8 py-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(239,107,115,0.12)] text-[var(--danger)]">
          <ShieldAlert size={30} />
        </div>
        <h1 className="section-title mt-5">Desktop admin is restricted</h1>
        <p className="section-subtitle">This control system is limited to super admins. Restaurant operators continue in the business/mobile flows.</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={onLogout}>Log out</Button>
        </div>
      </Surface>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useAdminSession();

  useEffect(() => {
    if (session.isError) {
      clearStoredAdminSession();
      router.replace("/login");
    }
  }, [router, session.isError]);

  const meta = useMemo(
    () => metaByPath.find((entry) => pathname.startsWith(entry.prefix)) || metaByPath[0],
    [pathname],
  );

  const handleLogout = () => {
    clearStoredAdminSession();
    router.replace("/login");
  };

  if (session.isLoading) {
    return <LoadingScreen />;
  }

  if (session.isError) {
    return <LoadingScreen />;
  }

  if (!session.data) {
    return <LoadingScreen />;
  }

  if (session.data.role !== "SUPER_ADMIN") {
    return <BlockedScreen onLogout={handleLogout} />;
  }

  return (
    <div className="app-shell">
      <RealtimeSync />
      <Sidebar />
      <main className="content-shell">
        <div className="content-frame page-stack">
          <Surface className="px-6 py-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span className="eyebrow">{meta.title}</span>
                <h1 className="section-title mt-4">{meta.title}</h1>
                <p className="section-subtitle">{meta.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="badge badge-success">Live sync active</div>
                <Button variant="secondary" onClick={handleLogout}>
                  <LogOut size={16} /> Log out
                </Button>
              </div>
            </div>
          </Surface>
          {children}
        </div>
      </main>
    </div>
  );
}
