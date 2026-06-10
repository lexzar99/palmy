"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type LL = { lat: number; lng: number };

/**
 * Live-karta för kund-tracking (endast vi-levererar-ordrar, visas vid DELIVERING).
 * Visar restaurang→kund-rutten direkt, och budets prick fylls i + flyttas när
 * positionen kommer in via socket. Modern CARTO-stil. SSR-säker: Leaflet
 * importeras dynamiskt i useEffect så den aldrig körs på servern.
 */
export default function CourierTrackingMap({ pickup, dropoff, courier }: { pickup?: LL | null; dropoff?: LL | null; courier?: LL | null }) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courierMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeRef = useRef<any>(null);
  const routeDrawnRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      LRef.current = L;
      const center = courier ?? pickup ?? dropoff ?? { lat: 55.7047, lng: 13.191 };
      const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([center.lat, center.lng], 14);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd" }).addTo(map);
      mapRef.current = map;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pinIcon = (bg: string, glyph = "") =>
        L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:12px;line-height:1">${glyph}</span></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });

      const bounds: [number, number][] = [];
      if (pickup) {
        L.marker([pickup.lat, pickup.lng], { icon: pinIcon("#e7b24b", "🍽️") }).addTo(map);
        bounds.push([pickup.lat, pickup.lng]);
      }
      if (dropoff) {
        L.marker([dropoff.lat, dropoff.lng], { icon: pinIcon("#0C0B0C", "🏠") }).addTo(map);
        bounds.push([dropoff.lat, dropoff.lng]);
      }
      const from = courier ?? pickup;
      if (from && dropoff) drawRoute(L, mapRef, routeRef, from, dropoff, routeDrawnRef);
      if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds).pad(0.3));
      setTimeout(() => {
        if (mapRef.current === map) map.invalidateSize();
      }, 200);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current?.remove) mapRef.current.remove();
      mapRef.current = null;
      courierMarkerRef.current = null;
      routeRef.current = null;
      routeDrawnRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Budets prick: skapas vid första positionen, flyttas sen.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !courier) return;
    if (!courierMarkerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: `<span style="position:relative;display:block;width:22px;height:22px"><span style="position:absolute;inset:-9px;border-radius:50%;background:rgba(231,178,75,.3)"></span><span style="position:relative;display:block;width:22px;height:22px;border-radius:50%;background:#e7b24b;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></span></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      courierMarkerRef.current = L.marker([courier.lat, courier.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      if (!routeDrawnRef.current && dropoff) drawRoute(L, mapRef, routeRef, courier, dropoff, routeDrawnRef);
    } else {
      courierMarkerRef.current.setLatLng([courier.lat, courier.lng]);
    }
  }, [courier?.lat, courier?.lng, dropoff]);

  return <div ref={ref} style={{ height: 300, width: "100%" }} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawRoute(L: any, mapRef: { current: any }, routeRef: { current: any }, from: LL, to: LL, drawnRef: { current: boolean }) {
  const add = (latlngs: [number, number][], dashed: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (routeRef.current) map.removeLayer(routeRef.current);
      routeRef.current = L.polyline(latlngs, dashed ? { color: "#e7b24b", weight: 4, opacity: 0.55, dashArray: "6 8" } : { color: "#e7b24b", weight: 5, opacity: 0.95 }).addTo(map);
      drawnRef.current = true;
    } catch {
      /* karta borttagen */
    }
  };
  const straight = () => add([[from.lat, from.lng], [to.lat, to.lng]], true);
  fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)
    .then((r) => r.json())
    .then((d) => {
      const c = d?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
      if (c && c.length > 1) add(c.map((x) => [x[1], x[0]] as [number, number]), false);
      else straight();
    })
    .catch(straight);
}
