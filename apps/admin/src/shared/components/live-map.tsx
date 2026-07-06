"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

type GoogleWindow = Window & {
  google?: any;
  _viaeatsLiveMapReady?: () => void;
};

let mapsPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as GoogleWindow;
  if (w.google?.maps) return Promise.resolve();
  if (!MAPS_KEY) return Promise.reject(new Error("Google Maps key saknas"));
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    w._viaeatsLiveMapReady = () => resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-viaeats-live-map="1"]');
    if (existing) return;
    const script = document.createElement("script");
    script.dataset.viaeatsLiveMap = "1";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps kunde inte laddas"));
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=3.62&callback=_viaeatsLiveMapReady`;
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export interface LiveMapMarker {
  id: string;
  label: string;
  subtitle?: string | null;
  lat: number | null | undefined;
  lng: number | null | undefined;
  tone?: "courier" | "pickup" | "dropoff";
}

function validMarker(marker: LiveMapMarker): marker is LiveMapMarker & { lat: number; lng: number } {
  return (
    typeof marker.lat === "number" &&
    typeof marker.lng === "number" &&
    Number.isFinite(marker.lat) &&
    Number.isFinite(marker.lng) &&
    (marker.lat !== 0 || marker.lng !== 0)
  );
}

const markerColor = (tone: LiveMapMarker["tone"]) =>
  tone === "pickup" ? "#2563EB" : tone === "dropoff" ? "#16A34A" : "#F0531C";

export function LiveMap({
  markers,
  height = 260,
  onMarkerClick,
}: {
  markers: LiveMapMarker[];
  height?: number;
  onMarkerClick?: (marker: LiveMapMarker) => void;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = useMemo(() => markers.filter(validMarker), [markers]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !divRef.current) return;
        const w = window as GoogleWindow;
        const center = valid[0] ? { lat: valid[0].lat, lng: valid[0].lng } : { lat: 55.7047, lng: 13.191 };
        if (!mapRef.current) {
          mapRef.current = new w.google.maps.Map(divRef.current, {
            center,
            zoom: valid.length > 1 ? 12 : 14,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            styles: [
              { featureType: "poi", stylers: [{ visibility: "off" }] },
              { featureType: "transit", stylers: [{ visibility: "off" }] },
            ],
          });
          infoRef.current = new w.google.maps.InfoWindow();
        }

        markerRefs.current.forEach((marker) => marker.setMap(null));
        markerRefs.current = valid.map((marker) => {
          const pin = new w.google.maps.Marker({
            position: { lat: marker.lat, lng: marker.lng },
            map: mapRef.current,
            title: marker.label,
            label: { text: marker.label.slice(0, 1).toUpperCase(), color: "#fff", fontWeight: "800" },
            icon: {
              path: w.google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: markerColor(marker.tone),
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 3,
            },
          });
          pin.addListener("click", () => {
            infoRef.current?.setContent(`<strong>${marker.label}</strong>${marker.subtitle ? `<br>${marker.subtitle}` : ""}`);
            infoRef.current?.open({ anchor: pin, map: mapRef.current });
            onMarkerClick?.(marker);
          });
          return pin;
        });

        if (valid.length > 1) {
          const bounds = new w.google.maps.LatLngBounds();
          valid.forEach((marker) => bounds.extend({ lat: marker.lat, lng: marker.lng }));
          mapRef.current.fitBounds(bounds, 48);
        } else if (valid[0]) {
          mapRef.current.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
          mapRef.current.setZoom(14);
        }
      })
      .catch((e) => setError(e?.message || "Kartan kunde inte laddas"));
    return () => {
      cancelled = true;
    };
  }, [valid, onMarkerClick]);

  if (valid.length === 0 || error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] text-xs font-semibold text-[var(--text-muted)]"
        style={{ height }}
      >
        {valid.length === 0 ? "Ingen liveposition" : error}
      </div>
    );
  }

  return <div ref={divRef} className="overflow-hidden rounded-xl border border-[var(--border-subtle)]" style={{ height }} />;
}
