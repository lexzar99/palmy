"use client";

import { memo, useEffect, useRef } from "react";
import { loadGoogleMaps, DARK_MAP_STYLE, DEFAULT_MAP_CENTER } from "@/lib/googleMaps";

type LL = { lat: number; lng: number };

/**
 * Live-karta för kund-tracking (endast vi-levererar-ordrar, visas vid DELIVERING).
 *
 * Rutten ritas STATISKT restaurang→kund EN gång — den ändras inte när budet
 * rör sig, så det syns tydligt om budet viker av från vägen. Budets prick
 * skapas vid första positionen och flyttas sedan vid varje ping — den
 * försvinner aldrig och visar alltid senast kända position.
 * Google Maps med mörk stil. SSR-säker: API:t laddas i useEffect.
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
  const GRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courierMarkerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((G: any) => {
        if (cancelled || !ref.current || mapRef.current) return;
        GRef.current = G;
        const center = pickup ?? dropoff ?? courier ?? DEFAULT_MAP_CENTER;
        const map = new G.Map(ref.current, {
          center,
          zoom: 14,
          styles: DARK_MAP_STYLE,
          backgroundColor: "#1d1d20",
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        const bounds = new G.LatLngBounds();
        let points = 0;
        if (pickup) {
          new G.Marker({ map, position: pickup, icon: pinIcon(accentColor), label: { text: "🍽️", fontSize: "12px" } });
          bounds.extend(pickup);
          points++;
        }
        if (dropoff) {
          new G.Marker({ map, position: dropoff, icon: pinIcon("#0C0B0C"), label: { text: "🏠", fontSize: "12px" } });
          bounds.extend(dropoff);
          points++;
        }
        // Statisk rutt restaurang→kund — ritas en gång, ändras aldrig.
        if (pickup && dropoff) drawRoute(G, mapRef, pickup, dropoff, accentColor);
        // Om vi redan har en budposition (sällan vid mount) → rita pricken direkt.
        if (courier) upsertCourier(G, map, courierMarkerRef, courier, accentColor);
        if (points > 1) map.fitBounds(bounds, 48);
      })
      .catch(() => { /* kartan uteblir; spårningskortet visar status ändå */ });
    return () => {
      cancelled = true;
      courierMarkerRef.current?.setMap?.(null);
      mapRef.current = null;
      courierMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Budets prick: skapas vid första positionen, flyttas sen. Beror BARA
  // på lat/lng (inte på objekt-referenser) så den aldrig tas bort i onödan.
  useEffect(() => {
    const G = GRef.current;
    const map = mapRef.current;
    if (!G || !map || !courier) return;
    upsertCourier(G, map, courierMarkerRef, courier, accentColor);
  }, [courier?.lat, courier?.lng, accentColor]);

  // Re-centrera: passa in hela rutten + budet igen — för kunden som zoomat/
  // pannat bort. Räknar bounds från aktuella props vid klick.
  const recenter = () => {
    const G = GRef.current;
    const map = mapRef.current;
    if (!G || !map) return;
    const pts = [pickup, dropoff, courier].filter(Boolean) as LL[];
    if (pts.length === 1) { map.panTo(pts[0]); map.setZoom(15); }
    else if (pts.length > 1) {
      const b = new G.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      map.fitBounds(b, 48);
    }
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

// Droppformad nål i given färg (SVG-path, ankrad i spetsen).
function pinIcon(fill: string) {
  return {
    path: "M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z",
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 1.5,
    scale: 1,
    anchor: { x: 12, y: 32 },
    labelOrigin: { x: 12, y: 12 },
  };
}

// Skapar budpricken en gång och flyttar den sedan (setPosition) — försvinner aldrig.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function upsertCourier(G: any, map: any, ref: { current: any }, courier: LL, accentColor: string) {
  if (!ref.current) {
    ref.current = new G.Marker({
      map,
      position: courier,
      zIndex: 1000,
      icon: {
        path: G.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: accentColor,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
    });
  } else {
    ref.current.setPosition(courier);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawRoute(G: any, mapRef: { current: any }, from: LL, to: LL, accentColor: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let line: any = null;
  const add = (path: LL[], dashed: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    line?.setMap(null);
    line = new G.Polyline(
      dashed
        ? {
            map,
            path,
            strokeOpacity: 0,
            icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.55, strokeColor: accentColor, scale: 3 }, offset: "0", repeat: "14px" }],
          }
        : { map, path, strokeColor: accentColor, strokeWeight: 5, strokeOpacity: 0.95 },
    );
  };
  const straight = () => add([from, to], true);
  fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)
    .then((r) => r.json())
    .then((d) => {
      const c = d?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
      if (c && c.length > 1) add(c.map((x) => ({ lat: x[1], lng: x[0] })), false);
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
  a.courier?.lng === b.courier?.lng &&
  a.accentColor === b.accentColor,
);
