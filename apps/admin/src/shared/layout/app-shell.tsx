"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { clearStoredAdminSession } from "@/shared/auth/storage";
import { Button, Surface } from "@/shared/components/ui";
import { Sidebar } from "@/shared/layout/sidebar";
import { RealtimeSync } from "@/shared/layout/realtime-sync";

function LoadingScreen() {
  return (
    <div className="auth-shell">
      <Surface className="max-w-sm px-8 py-10 text-center">
        <p className="eyebrow">MatGo Admin</p>
        <h1 className="section-title mt-4">Verifierar session</h1>
        <p className="section-subtitle">Laddar kontrollpanelen...</p>
      </Surface>
    </div>
  );
}

function BlockedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="auth-shell">
      <Surface className="max-w-md px-8 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(239,107,115,0.1)] text-[var(--danger)]">
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useAdminSession();

  useEffect(() => {
    if (session.isError) {
      clearStoredAdminSession();
      router.replace("/login");
    }
  }, [router, session.isError]);

  const handleLogout = () => {
    clearStoredAdminSession();
    router.replace("/login");
  };

  if (session.isLoading || session.isError || !session.data) {
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
          {children}
        </div>
      </main>
    </div>
  );
}
