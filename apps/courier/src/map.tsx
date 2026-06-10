import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "./lib/types";

const meIcon = () =>
  L.divIcon({
    className: "",
    html: `<span style="position:relative;display:block;width:18px;height:18px">
      <span style="position:absolute;inset:-7px;border-radius:50%;background:rgba(37,99,235,.25)"></span>
      <span style="position:relative;display:block;width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>
    </span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const pin = (bg: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};box-shadow:0 2px 6px rgba(0,0,0,.3)">
      <span style="width:9px;height:9px;border-radius:50%;background:#fff;transform:rotate(45deg)"></span>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });

/** Äkta karta med OSM-tiles, kurirens position och pickup/dropoff-pins. */
export function LiveMap({ me, pickup, dropoff, height = 220 }: { me?: LatLng | null; pickup?: LatLng; dropoff?: LatLng; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const meMarker = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const center: L.LatLngExpression = me ? [me.lat, me.lng] : pickup ? [pickup.lat, pickup.lng] : [55.7047, 13.191];
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false, dragging: true }).setView(center, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    const pts: L.LatLngExpression[] = [];
    if (pickup) {
      L.marker([pickup.lat, pickup.lng], { icon: pin("#0C0B0C") }).addTo(map);
      pts.push([pickup.lat, pickup.lng]);
    }
    if (dropoff) {
      L.marker([dropoff.lat, dropoff.lng], { icon: pin("#e7b24b") }).addTo(map);
      pts.push([dropoff.lat, dropoff.lng]);
    }
    if (pickup && dropoff) {
      L.polyline([[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]], { color: "#e7b24b", weight: 4, opacity: 0.9 }).addTo(map);
    }
    if (me) {
      meMarker.current = L.marker([me.lat, me.lng], { icon: meIcon(), zIndexOffset: 1000 }).addTo(map);
      pts.push([me.lat, me.lng]);
    }
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.35));

    // Säkerställ korrekt storlek efter layout
    setTimeout(() => map.invalidateSize(), 60);

    return () => {
      map.remove();
      mapRef.current = null;
      meMarker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !me) return;
    if (meMarker.current) meMarker.current.setLatLng([me.lat, me.lng]);
    else meMarker.current = L.marker([me.lat, me.lng], { icon: meIcon(), zIndexOffset: 1000 }).addTo(mapRef.current);
  }, [me?.lat, me?.lng]);

  return <div ref={ref} className="overflow-hidden rounded-3xl border border-[var(--color-line)]" style={{ height }} />;
}

export function MapSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#e9e9e4]" style={{ height }}>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {[18, 38, 58, 78].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#dcdcd5" strokeWidth="0.6" />
        ))}
        {[20, 45, 70, 88].map((x) => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100" stroke="#dcdcd5" strokeWidth="0.6" />
        ))}
      </svg>
    </div>
  );
}
