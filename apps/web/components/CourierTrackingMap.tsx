"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type LL = { lat: number; lng: number };

/**
 * Live-karta för kund-tracking (endast vi-levererar-ordrar, visas vid DELIVERING).
 * Visar budets position + rutt till kunden. Modern CARTO-stil. SSR-säker:
 * Leaflet importeras dynamiskt i useEffect så den aldrig körs på servern.
 */
export default function CourierTrackingMap({ courier, dropoff }: { courier: LL; dropoff?: LL | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const LRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([courier.lat, courier.lng], 14);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd" }).addTo(map);
      mapRef.current = map;

      const courierIcon = L.divIcon({
        className: "",
        html: `<span style="position:relative;display:block;width:20px;height:20px"><span style="position:absolute;inset:-8px;border-radius:50%;background:rgba(231,178,75,.3)"></span><span style="position:relative;display:block;width:20px;height:20px;border-radius:50%;background:#e7b24b;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span></span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      markerRef.current = L.marker([courier.lat, courier.lng], { icon: courierIcon, zIndexOffset: 1000 }).addTo(map);

      const pts: [number, number][] = [[courier.lat, courier.lng]];
      if (dropoff) {
        const homeIcon = L.divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0C0B0C;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><span style="width:9px;height:9px;border-radius:50%;background:#fff;transform:rotate(45deg)"></span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });
        L.marker([dropoff.lat, dropoff.lng], { icon: homeIcon }).addTo(map);
        pts.push([dropoff.lat, dropoff.lng]);
        const straight = () => L.polyline(pts, { color: "#e7b24b", weight: 4, opacity: 0.5, dashArray: "6 8" }).addTo(map);
        fetch(`https://router.project-osrm.org/route/v1/driving/${courier.lng},${courier.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`)
          .then((r) => r.json())
          .then((d) => {
            if (cancelled || mapRef.current !== map) return;
            const c = d?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
            if (c && c.length > 1) {
              const ll = c.map((x) => [x[1], x[0]] as [number, number]);
              L.polyline(ll, { color: "#e7b24b", weight: 5, opacity: 0.95 }).addTo(map);
              map.fitBounds(L.latLngBounds(ll).pad(0.2));
            } else {
              straight();
            }
          })
          .catch(() => {
            if (mapRef.current === map) straight();
          });
      }
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.3));
      setTimeout(() => {
        if (mapRef.current === map) map.invalidateSize();
      }, 200);
    })();
    return () => {
      cancelled = true;
      const map = mapRef.current as { remove?: () => void } | null;
      if (map?.remove) map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uppdatera budets markör när ny position kommer in.
  useEffect(() => {
    const marker = markerRef.current as { setLatLng?: (ll: [number, number]) => void } | null;
    if (marker?.setLatLng) marker.setLatLng([courier.lat, courier.lng]);
  }, [courier.lat, courier.lng]);

  return <div ref={ref} style={{ height: 280, width: "100%", borderRadius: 24, overflow: "hidden" }} />;
}
