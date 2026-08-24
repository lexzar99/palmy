"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { loadGoogleMaps } from "@/shared/utils/google-maps";

type GoogleWindow = Window & {
  google?: any;
};

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
      .catch((e) => {
        // Laddaren signalerar med koder, kartan visar text för användaren.
        const code = e instanceof Error ? e.message : "";
        setError(code === "auth_error" ? "Google Maps kunde inte autentiseras" : "Kartan kunde inte laddas");
      });
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
