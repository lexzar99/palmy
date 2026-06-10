import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "./types";

export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unsupported";

export interface GeoState {
  status: GeoStatus;
  coords: LatLng | null;
  request: () => void;
}

/**
 * Live-position. Kuriren MÅSTE dela sin plats — request() startar en
 * watchPosition som uppdaterar coords och i en riktig backend skulle skicka
 * positionen vidare (POST /courier/location). Här hålls den lokalt.
 */
export function useGeolocation(): GeoState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const watchId = useRef<number | null>(null);

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("prompting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
        if (watchId.current == null) {
          watchId.current = navigator.geolocation.watchPosition(
            (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => {},
            { enableHighAccuracy: true, maximumAge: 10_000 },
          );
        }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "idle"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  return { status, coords, request };
}
