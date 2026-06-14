"use client";

import { memo, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type LL = { lat: number; lng: number };

/**
 * Live-karta för kund-tracking (endast vi-levererar-ordrar, visas vid DELIVERING).
 *
 * Rutten ritas STATISKT restaurang→kund EN gång — den ändras inte när budet
 * rör sig, så det syns tydligt om budet viker av från vägen. Budets prick
 * skapas vid första positionen och flyttas sedan mjukt (CSS-transition) vid
 * varje ping — den försvinner aldrig och visar alltid senast kända position.
 * Modern CARTO-stil. SSR-säker: Leaflet importeras dynamiskt i useEffect.
 */
function CourierTrackingMap({ pickup, dropoff, courier }: { pickup?: LL | null; dropoff?: LL | null; courier?: LL | null }) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courierMarkerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      LRef.current = L;
      const center = pickup ?? dropoff ?? courier ?? { lat: 55.7047, lng: 13.191 };
      const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([center.lat, center.lng], 14);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd" }).addTo(map);
      mapRef.current = map;

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
      // Statisk rutt restaurang→kund — ritas en gång, ändras aldrig.
      if (pickup && dropoff) drawRoute(L, mapRef, pickup, dropoff);
      // Om vi redan har en budposition (sällan vid mount) → rita pricken direkt.
      if (courier) upsertCourier(L, map, courierMarkerRef, courier);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Budets prick: skapas vid första positionen, flyttas sen mjukt. Beror BARA
  // på lat/lng (inte på objekt-referenser) så den aldrig tas bort i onödan.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !courier) return;
    upsertCourier(L, map, courierMarkerRef, courier);
  }, [courier?.lat, courier?.lng]);

  return <div ref={ref} style={{ height: 300, width: "100%" }} />;
}

// Skapar budpricken en gång och flyttar den sedan (setLatLng) — försvinner aldrig.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function upsertCourier(L: any, map: any, ref: { current: any }, courier: LL) {
  if (!ref.current) {
    const icon = L.divIcon({
      className: "",
      html: `<span style="position:relative;display:block;width:22px;height:22px"><span style="position:absolute;inset:-9px;border-radius:50%;background:rgba(231,178,75,.3)"></span><span style="position:relative;display:block;width:22px;height:22px;border-radius:50%;background:#e7b24b;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></span></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    ref.current = L.marker([courier.lat, courier.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    // Mjuk glidning mellan pings istället för att hoppa.
    const el = ref.current.getElement?.();
    if (el) el.style.transition = "transform 1s linear";
  } else {
    ref.current.setLatLng([courier.lat, courier.lng]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawRoute(L: any, mapRef: { current: any }, from: LL, to: LL) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let layer: any = null;
  const add = (latlngs: [number, number][], dashed: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (layer) map.removeLayer(layer);
      layer = L.polyline(latlngs, dashed ? { color: "#e7b24b", weight: 4, opacity: 0.55, dashArray: "6 8" } : { color: "#e7b24b", weight: 5, opacity: 0.95 }).addTo(map);
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

// Re-rendera bara när en koordinat faktiskt ändras (inte på varje parent-render),
// så kartan aldrig byggs om i onödan och pricken inte hinner blinka.
export default memo(CourierTrackingMap, (a, b) =>
  a.pickup?.lat === b.pickup?.lat &&
  a.pickup?.lng === b.pickup?.lng &&
  a.dropoff?.lat === b.dropoff?.lat &&
  a.dropoff?.lng === b.dropoff?.lng &&
  a.courier?.lat === b.courier?.lat &&
  a.courier?.lng === b.courier?.lng,
);
