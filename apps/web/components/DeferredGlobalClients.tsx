"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LiveOrderBanner = dynamic(() => import("@/components/LiveOrderBanner"), { ssr: false });
const PWAInstallPrompt = dynamic(() => import("@/components/PWAInstallPrompt"), { ssr: false });
const SupportChat = dynamic(() => import("@/components/SupportChat"), { ssr: false });

export default function DeferredGlobalClients() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: 15000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 12000);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) return null;

  return (
    <>
      <LiveOrderBanner />
      <PWAInstallPrompt />
      <SupportChat />
    </>
  );
}
