"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AdminRealtimeBridge from "@/components/AdminRealtimeBridge";
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

  useEffect(() => {
    // Timeout to show retry if stuck
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
        token = localStorage.getItem("palmyra_token");
      }
    } catch (e) {
      console.warn("LocalStorage access failed:", e);
    }

    if (token) {
      // Verify token and also hydrate session data (role + restaurant scope).
      (async () => {
        try {
          const verifyRes = await axios.post(`${API_URL}/api/auth/verify`, { token });
          if (!verifyRes.data?.valid) throw new Error("invalid");
          const admin = verifyRes.data.admin;
          localStorage.setItem("palmyra_admin", JSON.stringify(admin));

          if (admin?.role !== "SUPER_ADMIN" && admin?.restaurantId) {
            setRestaurant(admin.restaurantId, admin.restaurantName || admin.restaurantSlug || "Restaurang");
          }

          // Prevent restaurant admins from entering super admin pages.
          if (admin?.role !== "SUPER_ADMIN") {
            const isRestaurantAdminBlocked =
              pathname.startsWith("/restaurants") ||
              ((pathname === "/settings" || pathname.startsWith("/settings/")) && !pathname.startsWith("/settings/global"));
            if (isRestaurantAdminBlocked) {
              router.replace("/orders");
              return;
            }
          }

          setAuthed(true);
          setReady(true);
        } catch {
          localStorage.removeItem("palmyra_token");
          localStorage.removeItem("palmyra_admin");
          router.replace("/login");
          setReady(true);
        }
      })();
    } else {
      router.replace("/login");
      // Give the router a moment before showing shell
      const rTimer = setTimeout(() => setReady(true), 100);
      return () => clearTimeout(rTimer);
    }

    return () => clearTimeout(timer);
  }, [isLoginPage, router, ready, pathname, setRestaurant]);

  if (isLoginPage) return <>{children}</>;

  if (!ready || !authed) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-dark-500)",
        flexDirection: "column",
        gap: "24px",
        padding: "20px",
        textAlign: "center"
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: "3px solid rgba(212,167,74,0.1)",
          borderTopColor: "#d4a74a",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 800, margin: 0 }}>
            Palmyra Admin
          </p>
          {showRetry && (
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 13, margin: 0 }}>
              Det tar ovanligt lång tid att ladda...
            </p>
          )}
        </div>

        {showRetry && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: "#d4a74a",
                color: "#0d0d0d",
                border: "none",
                padding: "12px 24px",
                borderRadius: "12px",
                fontWeight: 900,
                textTransform: "uppercase",
                fontSize: 12,
                letterSpacing: "0.1em",
                cursor: "pointer"
              }}
            >
              Ladda om sidan
            </button>
            <p style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>
              API: {API_URL}
            </p>
          </div>
        )}
      </div>
    );
  }


  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--color-dark-500)", overflowX: "hidden" }}>
      <AdminRealtimeBridge />
      <Sidebar />
      <main className="flex-1 p-6 lg:p-12 lg:ml-80 transition-all duration-300">
        <div className="max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
