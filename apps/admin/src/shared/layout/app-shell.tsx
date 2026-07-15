"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { isAuthoritativeAuthError, useAdminSession } from "@/shared/hooks/use-admin-session";
import { logoutAdminSession } from "@/shared/auth/storage";
import { Button, Surface } from "@/shared/components/ui";
import { Sidebar } from "@/shared/layout/sidebar";
import { RealtimeSync } from "@/shared/layout/realtime-sync";
import { CommandPalette, useCommandPalette } from "@/shared/layout/command-palette";
import { ToastProvider } from "@/shared/components/toast";

function LoadingScreen() {
  return (
    <div className="auth-shell">
      <Surface className="max-w-sm px-8 py-10 text-center">
        <p className="eyebrow">ViaEats Admin</p>
        <h1 className="section-title mt-4">Verifierar session</h1>
        <p className="section-subtitle">Laddar kontrollpanelen…</p>
      </Surface>
    </div>
  );
}

function BlockedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="auth-shell">
      <Surface className="max-w-md px-8 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(251,113,133,0.1)] text-[var(--danger)]">
          <ShieldAlert size={22} />
        </div>
        <h1 className="section-title mt-5">Åtkomst nekad</h1>
        <p className="section-subtitle">Det här systemet kräver super-admin-behörighet.</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={onLogout}>Logga ut</Button>
        </div>
      </Surface>
    </div>
  );
}

function VerificationOutageScreen({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div className="auth-shell">
      <Surface className="max-w-md px-8 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--warning-soft)] text-[var(--warning-text)]">
          <WifiOff size={22} />
        </div>
        <h1 className="section-title mt-5">Kunde inte verifiera sessionen</h1>
        <p className="section-subtitle">Admin-API:t går inte att nå just nu. Du är inte utloggad och kan försöka igen.</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={onRetry} disabled={retrying}>
            <RefreshCw size={16} className={retrying ? "animate-spin" : ""} /> Försök igen
          </Button>
        </div>
      </Surface>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useAdminSession();
  const palette = useCommandPalette();
  const authRejected = session.isError && isAuthoritativeAuthError(session.error);

  useEffect(() => {
    if (!authRejected) return;
    void logoutAdminSession().finally(() => router.replace("/login"));
  }, [authRejected, router]);

  const handleLogout = () => {
    void logoutAdminSession().finally(() => router.replace("/login"));
  };

  if (session.isLoading || authRejected) {
    return <LoadingScreen />;
  }

  if (session.isError || !session.data) {
    return <VerificationOutageScreen retrying={session.isFetching} onRetry={() => void session.refetch()} />;
  }

  if (session.data.role !== "SUPER_ADMIN") {
    return <BlockedScreen onLogout={handleLogout} />;
  }

  return (
    <ToastProvider>
      <div className="app-shell">
        <a className="skip-link" href="#admin-main">Hoppa till innehåll</a>
        <RealtimeSync />
        <Sidebar onOpenPalette={palette.openPalette} />
        <main id="admin-main" className="content-shell" tabIndex={-1}>
          <div className="content-frame page-stack">{children}</div>
        </main>
        <CommandPalette open={palette.open} onClose={palette.close} />
      </div>
    </ToastProvider>
  );
}
