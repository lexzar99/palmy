import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "./types";

export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unsupported";

export interface GeoState {
  status: GeoStatus;
  resuming: boolean; // true medan vi auto-återansluter vid start
  coords: LatLng | null;
  request: () => void;
}

const GRANTED_FLAG = "delivera_geo_ok";

/**
 * Live-position som MINNS att du delat plats: har du gett tillstånd förr
 * (localStorage-flagga eller Permissions API = granted) återansluts platsen
 * automatiskt vid start — ingen plats-gate varje gång. watchPosition håller
 * positionen färsk; i skarp backend skickas den vidare (POST /courier/location).
 */
export function useGeolocation(): GeoState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [resuming, setResuming] = useState(true);
  const [coords, setCoords] = useState<LatLng | null>(null);
  const watchId = useRef<number | null>(null);

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setResuming(false);
      return;
    }
    setStatus("prompting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
        setResuming(false);
        try {
          localStorage.setItem(GRANTED_FLAG, "1");
        } catch {
          /* ignore */
        }
        if (watchId.current == null) {
          watchId.current = navigator.geolocation.watchPosition(
            (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (e) => {
              // GPS krävs ALLTID. Tappas tillståndet mitt i passet → rensa flaggan
              // och gå tillbaka till plats-gaten så kuriren tvingas slå på GPS igen.
              if (e.code === e.PERMISSION_DENIED) {
                try { localStorage.removeItem(GRANTED_FLAG); } catch { /* ignore */ }
                if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
                setCoords(null);
                setStatus("denied");
              }
            },
            { enableHighAccuracy: true, maximumAge: 10_000 },
          );
        }
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "idle");
        setResuming(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // Auto-återanslut vid start om tillstånd redan finns → slipp gaten varje gång.
  useEffect(() => {
    let cancelled = false;
    const auto = (ok: boolean) => {
      if (cancelled) return;
      if (ok) request();
      else setResuming(false);
    };
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setResuming(false);
      return;
    }
    let flagged = false;
    try {
      flagged = localStorage.getItem(GRANTED_FLAG) === "1";
    } catch {
      /* ignore */
    }
    if (flagged) {
      auto(true);
      return;
    }
    const perms = (navigator as Navigator & { permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
    if (perms?.query) {
      perms
        .query({ name: "geolocation" })
        .then((p) => auto(p.state === "granted"))
        .catch(() => auto(false));
    } else {
      auto(false);
    }
    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(
    () => () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  return { status, resuming, coords, request };
}
