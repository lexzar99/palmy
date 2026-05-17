"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Global offline-banner. Mountas i root layout och lyssnar på
 * window.online/offline-events. När kunden tappar uppkoppling visas
 * en röd banner högst upp — annars hade kunden klickat "Slutför Köp"
 * och fått en obegriplig timeout-error.
 *
 * navigator.onLine ger first-pass-detection vid mount. Browser-events
 * driver real-time-updates.
 */
export default function OfflineBanner() {
  // Default true så vi inte visar bannern under SSR. Klient-side
  // useEffect uppdaterar med faktisk status vid mount.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[500] bg-rose-600 text-white text-center text-xs font-bold py-2 px-4 flex items-center justify-center gap-2 shadow-lg"
    >
      <WifiOff size={14} />
      <span>Du är offline. Funktioner kan vara begränsade tills anslutningen återställs.</span>
    </div>
  );
}
