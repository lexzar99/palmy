"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Håller telefonens tangentbord fritt och visar när anslutningen försvinner. */
export function DeviceState() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    const keyboard = () => {
      const active = document.activeElement;
      const editable = active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && !["checkbox", "radio", "range", "button", "submit", "file", "color"].includes(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable);
      const compressed = Boolean(window.visualViewport && window.innerHeight - window.visualViewport.height > 140);
      document.documentElement.dataset.keyboardOpen = String(editable || compressed);
    };
    const blur = () => requestAnimationFrame(keyboard);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    document.addEventListener("focusin", keyboard);
    document.addEventListener("focusout", blur);
    window.visualViewport?.addEventListener("resize", keyboard);
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("focusin", keyboard);
      document.removeEventListener("focusout", blur);
      window.visualViewport?.removeEventListener("resize", keyboard);
      delete document.documentElement.dataset.keyboardOpen;
    };
  }, []);
  return offline ? <div className="panel-offline" role="status"><WifiOff size={16} />Ingen internetanslutning</div> : null;
}
