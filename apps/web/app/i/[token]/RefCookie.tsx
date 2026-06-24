"use client";

import { useEffect } from "react";

// Sätter förstaparts-cookien `dlv_ref` klient-sida (Next 15 tillåter inte
// cookie-set under page-render). Register-sidan läser den för attribution.
export default function RefCookie({ token }: { token: string }) {
  useEffect(() => {
    if (!token) return;
    document.cookie = `dlv_ref=${token}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [token]);
  return null;
}
