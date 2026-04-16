"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AdminRealtimeBridge from "@/components/AdminRealtimeBridge";
import CommandPalette from "@/components/CommandPalette";
import { ToastProvider } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import axios from "axios";
import { useRestaurantStore } from "@/store/restaurantStore";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const { setRestaurant } = useRestaurantStore();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [notSuperAdmin, setNotSuperAdmin] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready) setShowRetry(true);
    }, 5000);

    if (isLoginPage) {
      setReady(true);
      setAuthed(true);
      clearTimeout(timer);
      return;
    }

    let token: string | null = null;
    try {
      if (typeof window !== "undefined") {
        token = localStorage.getItem("matgo_token");
      }
    } catch (e) {
      console.warn("LocalStorage access failed:", e);
    }

    if (token) {
      (async () => {
        try {
          const verifyRes = await axios.post(`${API_URL}/api/account/verify`, { token });
          if (!verifyRes.data?.valid) throw new Error("invalid");
          const admin = verifyRes.data.admin;
          localStorage.setItem("matgo_admin", JSON.stringify(admin));

          // This web panel is SUPER_ADMIN only.
          // Restaurant admins should use the MatGo Business Flutter app.
          if (admin?.role !== "SUPER_ADMIN") {
            setNotSuperAdmin(true);
            setReady(true);
            return;
          }

          // Super admin: clear any previously set restaurant scope
          // (super admin sees everything by default)
          setRestaurant(null, null);

          setAuthed(true);
          setReady(true);
        } catch (err: any) {
          if (err.response?.status === 404) {
            setRestaurant(null, null);
          }
          localStorage.removeItem("matgo_token");
          localStorage.removeItem("matgo_admin");
          router.replace("/login");
          setReady(true);
        }
      })();
    } else {
      router.replace("/login");
      const rTimer = setTimeout(() => setReady(true), 100);
      return () => clearTimeout(rTimer);
    }

    return () => clearTimeout(timer);
  }, [isLoginPage, router, pathname, setRestaurant]);

  if (isLoginPage) return <>{children}</>;

  // Restaurant admin tried to log in — show them a message
  if (notSuperAdmin) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
          flexDirection: "column",
          gap: "24px",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "rgba(231,178,75,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            marginBottom: 8,
          }}
        >
          📱
        </div>
        <p
          style={{
            color: "#e7b24b",
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 900,
            margin: 0,
          }}
        >
          Restaurang-konto
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 18,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            maxWidth: 380,
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          Denna panel är reserverad för Super Admin
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: 13,
            maxWidth: 320,
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          Restaurang-personal hanterar ordrar via <strong>MatGo Business</strong>-appen.
          Ladda ned appen för att komma igång.
        </p>
        <button
          onClick={() => {
            localStorage.removeItem("matgo_token");
            localStorage.removeItem("matgo_admin");
            window.location.href = "/login";
          }}
          style={{
            background: "linear-gradient(135deg, #F4D086 0%, #E7B24B 45%, #C28E2E 100%)",
            color: "#0d0d0d",
            border: "none",
            padding: "12px 28px",
            borderRadius: 12,
            fontWeight: 900,
            textTransform: "uppercase",
            fontSize: 11,
            letterSpacing: "0.2em",
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Logga ut
        </button>
      </div>
    );
  }

  if (!ready || !authed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          flexDirection: "column",
          gap: "24px",
          padding: "20px",
          textAlign: "center",
        }}
      >
        {/* Animated logo */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #F4D086 0%, #E7B24B 45%, #C28E2E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 40px rgba(231, 178, 75, 0.15)",
            animation: "pulse-glow-load 2s ease-in-out infinite",
          }}
        >
          <span style={{ color: "#0d0d0d", fontWeight: 900, fontSize: 24, fontStyle: "italic" }}>M</span>
        </div>

        <div
          style={{
            width: 28,
            height: 28,
            border: "2px solid rgba(231, 178, 75, 0.08)",
            borderTopColor: "#e7b24b",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-glow-load {
            0%, 100% { box-shadow: 0 0 20px rgba(231, 178, 75, 0.1); }
            50% { box-shadow: 0 0 50px rgba(231, 178, 75, 0.25); }
          }
        `}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <p
            style={{
              color: "#e7b24b",
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 900,
              margin: 0,
            }}
          >
            MatGo Control
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.2)",
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Laddar admin…
          </p>
          {showRetry && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, margin: 0 }}>
              Det tar lite längre tid...
            </p>
          )}
        </div>

        {showRetry && (
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "linear-gradient(135deg, #F4D086 0%, #E7B24B 45%, #C28E2E 100%)",
              color: "#0d0d0d",
              border: "none",
              padding: "10px 20px",
              borderRadius: "8px",
              fontWeight: 900,
              textTransform: "uppercase",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Ladda om
          </button>
        )}
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen text-[var(--text-primary)] bg-[var(--bg-primary)] overflow-x-hidden font-sans">
        <AdminRealtimeBridge />
        <CommandPalette />
        <Sidebar />
        <main className="flex-1 lg:ml-[260px] pt-14 lg:pt-0 min-h-screen bg-dot-pattern">
          <div className="p-5 lg:p-8 max-w-[1400px] mx-auto fade-in">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
