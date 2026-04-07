"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { API_URL } from "@/lib/api";
import axios from "axios";

export default function RestaurantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (isLoginPage) {
      setReady(true);
      setAuthed(true);
      return;
    }

    const token = localStorage.getItem("matgo_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    (async () => {
      try {
        const verifyRes = await axios.post(`${API_URL}/api/account/verify`, { token });
        if (!verifyRes.data?.valid) throw new Error("invalid");
        
        const admin = verifyRes.data.admin;
        localStorage.setItem("matgo_admin", JSON.stringify(admin));

        // If the user isn't assigned to a restaurant, they shouldn't be in this app.
        if (!admin?.restaurantId && admin?.role !== "SUPER_ADMIN") {
          throw new Error("No restaurant assigned.");
        }

        setAuthed(true);
        setReady(true);
      } catch (err: any) {
        localStorage.removeItem("matgo_token");
        localStorage.removeItem("matgo_admin");
        router.replace("/login");
        setReady(true);
      }
    })();
  }, [isLoginPage, router, pathname]);

  if (isLoginPage) return <>{children}</>;

  if (!ready || !authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6">
        <div className="w-8 h-8 border-2 border-gold-500/10 border-t-gold-500 rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500">Laddar Partner Hub</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white font-sans selection:bg-gold-500/30">
      <Sidebar />
      <main className="flex-1 p-6 lg:ml-[260px] pt-24 lg:pt-8 overflow-x-hidden">
        <div className="max-w-[1200px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
