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
          const verifyRes = await axios.post(`${API_URL}/api/account/verify`, { token });
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
              ((pathname === "/settings" || pathname.startsWith("/settings/")) && !pathname.startsWith("/settings/global") && !pathname.startsWith("/settings/printing"));
            if (isRestaurantAdminBlocked) {
              router.replace("/orders");
              return;
            }
          }

          setAuthed(true);
          setReady(true);
        } catch (err: any) {
          if (err.response?.status === 404) {
            console.warn("Restaurant data missing, clearing store.");
            setRestaurant(null, null);
          }
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
  }, [isLoginPage, router, pathname, setRestaurant]);

  if (isLoginPage) return <>{children}</>;

  if (!ready || !authed) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#07080d",
        flexDirection: "column",
        gap: "24px",
        padding: "20px",
        textAlign: "center"
      }}>
        <div style={{
          width: 32,
          height: 32,
          border: "2px solid rgba(231, 178, 75, 0.1)",
          borderTopColor: "#e7b24b",
          borderRadius: "50%",
          animation: "spin 0.6s linear infinite"
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <p style={{ color: "#e7b24b", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 800, margin: 0 }}>
            Laddar Admin
          </p>
          {showRetry && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, margin: 0 }}>
              Det tar lite längre tid...
            </p>
          )}
        </div>

        {showRetry && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: "#e7b24b",
                color: "#1c1c1c",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: 900,
                textTransform: "uppercase",
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              Ladda om
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen text-text-primary bg-bg-primary overflow-x-hidden font-sans selection:bg-gold-500/30 selection:text-white">
      <AdminRealtimeBridge />
      <Sidebar />
      <main className="flex-1 p-6 lg:p-12 lg:ml-[260px] pt-24 lg:pt-12 transition-all duration-500 overflow-x-hidden">
        <div className="max-w-[1240px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
