"use client";

import { memo, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { MAP_TILES } from "@/lib/mapTiles";

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
function CourierTrackingMap({
  pickup,
  dropoff,
  courier,
  accentColor = "#2E7D4F",
}: {
  pickup?: LL | null;
  dropoff?: LL | null;
  courier?: LL | null;
  accentColor?: string;
}) {
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
      L.tileLayer(MAP_TILES.voyager.url, { maxZoom: MAP_TILES.voyager.maxZoom, subdomains: MAP_TILES.voyager.subdomains }).addTo(map);
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
        L.marker([pickup.lat, pickup.lng], { icon: pinIcon(accentColor, "🍽️") }).addTo(map);
        bounds.push([pickup.lat, pickup.lng]);
      }
      if (dropoff) {
        L.marker([dropoff.lat, dropoff.lng], { icon: pinIcon("#0C0B0C", "🏠") }).addTo(map);
        bounds.push([dropoff.lat, dropoff.lng]);
      }
      // Statisk rutt restaurang→kund — ritas en gång, ändras aldrig.
      if (pickup && dropoff) drawRoute(L, mapRef, pickup, dropoff, accentColor);
      // Om vi redan har en budposition (sällan vid mount) → rita pricken direkt.
      if (courier) upsertCourier(L, map, courierMarkerRef, courier, accentColor);
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
    upsertCourier(L, map, courierMarkerRef, courier, accentColor);
  }, [courier?.lat, courier?.lng, accentColor]);

  // Re-centrera: passa in hela rutten + budet igen — för kunden som zoomat/
  // pannat bort. Räknar bounds från aktuella props vid klick.
  const recenter = () => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const pts: [number, number][] = [];
    if (pickup) pts.push([pickup.lat, pickup.lng]);
    if (dropoff) pts.push([dropoff.lat, dropoff.lng]);
    if (courier) pts.push([courier.lat, courier.lng]);
    if (pts.length === 1) map.setView(pts[0], 15, { animate: true });
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.3), { animate: true });
  };

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 120, width: "100%" }}>
      <div ref={ref} style={{ height: "100%", width: "100%" }} />
      <button
        type="button"
        onClick={recenter}
        aria-label="Centrera kartan"
        title="Centrera kartan"
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          zIndex: 1000,
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          border: "1px solid rgba(12,11,12,.12)",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,.18)",
          cursor: "pointer",
          color: "#0C0B0C",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </div>
  );
}

// Skapar budpricken en gång och flyttar den sedan (setLatLng) — försvinner aldrig.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function upsertCourier(L: any, map: any, ref: { current: any }, courier: LL, accentColor: string) {
  if (!ref.current) {
    const icon = L.divIcon({
      className: "",
      html: `<span style="position:relative;display:block;width:22px;height:22px"><span style="position:absolute;inset:-9px;border-radius:50%;background:${hexToRgba(accentColor, 0.28)}"></span><span style="position:relative;display:block;width:22px;height:22px;border-radius:50%;background:${accentColor};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></span></span>`,
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
function drawRoute(L: any, mapRef: { current: any }, from: LL, to: LL, accentColor: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let layer: any = null;
  const add = (latlngs: [number, number][], dashed: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (layer) map.removeLayer(layer);
      layer = L.polyline(latlngs, dashed ? { color: accentColor, weight: 4, opacity: 0.55, dashArray: "6 8" } : { color: accentColor, weight: 5, opacity: 0.95 }).addTo(map);
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

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(46,125,79,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Re-rendera bara när en koordinat faktiskt ändras (inte på varje parent-render),
// så kartan aldrig byggs om i onödan och pricken inte hinner blinka.
export default memo(CourierTrackingMap, (a, b) =>
  a.pickup?.lat === b.pickup?.lat &&
  a.pickup?.lng === b.pickup?.lng &&
  a.dropoff?.lat === b.dropoff?.lat &&
  a.dropoff?.lng === b.dropoff?.lng &&
  a.courier?.lat === b.courier?.lat &&
  a.courier?.lng === b.courier?.lng &&
  a.accentColor === b.accentColor,
);
