"use client";

import dynamic from "next/dynamic";

const LiveOrderBanner = dynamic(() => import("@/components/LiveOrderBanner"), { ssr: false });
const PWAInstallPrompt = dynamic(() => import("@/components/PWAInstallPrompt"), { ssr: false });
const SupportChat = dynamic(() => import("@/components/SupportChat"), { ssr: false });

export default function DeferredGlobalClients() {
  return (
    <>
      <LiveOrderBanner />
      <PWAInstallPrompt />
      <SupportChat />
    </>
  );
}
