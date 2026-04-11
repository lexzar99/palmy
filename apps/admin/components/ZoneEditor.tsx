"use client";

/**
 * ZoneEditor — Full multi-zone map editor for admin
 *
 * Features:
 * - Draw circle or polygon zones on the map — each with its own geometry
 * - Every zone stores its own center (circle) or polygon coordinates
 * - Multiple overlapping zones supported
 * - Inline name / deliveryFee / minOrder editing per zone
 * - Active/inactive toggle per zone
 * - Delete zones
 * - City search to center the map
 * - All changes call onChange() — parent saves to DB when ready
 */

import { useEffect, useRef, useState, useCallback, useId } from "react";
import {
  Search, Navigation2, Plus, PenLine, Circle, Trash2,
  Check, X, Loader2, MapPin, Info, ZoomIn, Eye, EyeOff,
  ChevronDown, ChevronUp,
} from "lucide-react";

export interface Zone {
  id: string;
  name: string;
  type: "circle" | "polygon";
  // circle
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  // polygon — [lng, lat][] GeoJSON order
  polygon?: [number, number][];
  // pricing (shown in kr in UI, stored in öre in DB)
  deliveryFee: number; // kr
  minOrder: number;    // kr
  isActive: boolean;
  color: string;
}

interface Props {
  zones: Zone[];
  onChange: (zones: Zone[]) => void;
  cityName?: string;
  /** Initial map center (city center). Also updated when user clicks map. */
  centerLat?: number | null;
  centerLng?: number | null;
  onCenterChange?: (lat: number, lng: number) => void;
  /** Height of the map canvas */
  mapHeight?: number;
}

// ── Color palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  { main: "#22c55e", light: "#22c55e30", stroke: "#16a34a" },
  { main: "#3b82f6", light: "#3b82f630", stroke: "#2563eb" },
  { main: "#f59e0b", light: "#f59e0b30", stroke: "#d97706" },
  { main: "#ef4444", light: "#ef444430", stroke: "#dc2626" },
  { main: "#8b5cf6", light: "#8b5cf630", stroke: "#7c3aed" },
  { main: "#06b6d4", light: "#06b6d430", stroke: "#0891b2" },
  { main: "#ec4899", light: "#ec489930", stroke: "#db2777" },
  { main: "#f97316", light: "#f9731630", stroke: "#ea580c" },
  { main: "#84cc16", light: "#84cc1630", stroke: "#65a30d" },
  { main: "#a855f7", light: "#a855f730", stroke: "#9333ea" },
];

const getColor = (idx: number) => PALETTE[idx % PALETTE.length];
const makeId = () => Math.random().toString(36).slice(2, 10);

// ── Maps loader ───────────────────────────────────────────────────────────────
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

declare global { interface Window { google: any; _mapsCallback?: () => void } }

let _mapsLoaded = false;
let _mapsLoading = false;
const _mapsWaiters: Array<{ res: () => void; rej: (e: unknown) => void }> = [];

function loadMaps(): Promise<void> {
  if (_mapsLoaded || window.google?.maps) { _mapsLoaded = true; return Promise.resolve(); }
  if (_mapsLoading) return new Promise((res, rej) => _mapsWaiters.push({ res, rej }));
  _mapsLoading = true;

  return new Promise((res, rej) => {
    _mapsWaiters.push({ res, rej });

    window._mapsCallback = () => {
      _mapsLoaded = true; _mapsLoading = false;
      _mapsWaiters.forEach(w => w.res()); _mapsWaiters.length = 0;
    };

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=drawing,geometry&callback=_mapsCallback`;
    s.async = true; s.defer = true;
    s.onerror = (e) => {
      _mapsLoading = false;
      _mapsWaiters.forEach(w => w.rej(e)); _mapsWaiters.length = 0;
    };
    document.head.appendChild(s);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ZoneEditor({
  zones,
  onChange,
  cityName = "",
  centerLat,
  centerLng,
  onCenterChange,
  mapHeight = 520,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const dm = useRef<any>(null);
  const overlays = useRef<Map<string, any>>(new Map());
  const centerMarker = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [drawing, setDrawing] = useState<"circle" | "polygon" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  const defaultCenter = { lat: centerLat ?? 55.7047, lng: centerLng ?? 13.191 };

  // ── Load SDK ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadMaps().then(() => setReady(true)).catch(() => setLoadErr(true));
  }, []);

  // ── Render a zone on the map ──────────────────────────────────────────────────
  const renderZone = useCallback((zone: Zone, zoneIdx: number) => {
    if (!mapInst.current) return;
    const g = window.google;
    const color = getColor(zoneIdx);

    // Remove existing overlay for this zone
    const existing = overlays.current.get(zone.id);
    if (existing) existing.setMap(null);

    let overlay: any;

    if (zone.type === "polygon" && zone.polygon && zone.polygon.length > 2) {
      const path = zone.polygon.map(([lng, lat]) => ({ lat, lng }));
      overlay = new g.maps.Polygon({
        paths: path,
        fillColor: color.main,
        fillOpacity: 0.18,
        strokeColor: color.main,
        strokeOpacity: 0.9,
        strokeWeight: 2.5,
        editable: false,
        map: mapInst.current,
        zIndex: 10,
      });
    } else if (zone.type === "circle" && zone.centerLat && zone.centerLng && zone.radiusKm) {
      overlay = new g.maps.Circle({
        center: { lat: zone.centerLat, lng: zone.centerLng },
        radius: zone.radiusKm * 1000,
        fillColor: color.main,
        fillOpacity: 0.18,
        strokeColor: color.main,
        strokeOpacity: 0.9,
        strokeWeight: 2.5,
        editable: false,
        map: mapInst.current,
        zIndex: 10,
      });
    } else {
      return;
    }

    // Click on overlay → select zone
    g.maps.event.addListener(overlay, "click", () => setSelectedId(zone.id));

    overlays.current.set(zone.id, overlay);
  }, []);

  // ── Render all zones ──────────────────────────────────────────────────────────
  const renderAllZones = useCallback(() => {
    if (!mapInst.current) return;
    // Clear overlays not in current zones
    const currentIds = new Set(zones.map(z => z.id));
    overlays.current.forEach((ov, id) => {
      if (!currentIds.has(id)) { ov.setMap(null); overlays.current.delete(id); }
    });
    zones.forEach((z, i) => renderZone(z, i));
  }, [zones, renderZone]);

  // ── Update overlay opacity when selection changes ─────────────────────────────
  useEffect(() => {
    overlays.current.forEach((ov, id) => {
      const isSelected = id === selectedId;
      if (ov.setOptions) {
        ov.setOptions({
          fillOpacity: isSelected ? 0.35 : 0.18,
          strokeWeight: isSelected ? 4 : 2.5,
          zIndex: isSelected ? 20 : 10,
        });
      }
    });
  }, [selectedId]);

  // ── Initialize map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google;

    const map = new g.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#12121e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8a9bb0" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#12121e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#232336" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2e2e46" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b2a" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "cooperative",
    });
    mapInst.current = map;

    // DrawingManager — not shown until user clicks Add
    const drawManager = new g.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      circleOptions: {
        fillColor: "#d4a017", fillOpacity: 0.2,
        strokeColor: "#d4a017", strokeOpacity: 0.9, strokeWeight: 2.5,
        editable: true, draggable: true,
      },
      polygonOptions: {
        fillColor: "#d4a017", fillOpacity: 0.2,
        strokeColor: "#d4a017", strokeOpacity: 0.9, strokeWeight: 2.5,
        editable: true, draggable: true,
      },
    });
    drawManager.setMap(map);
    dm.current = drawManager;

    // ── Circle complete ──────────────────────────────────────────────────────────
    g.maps.event.addListener(drawManager, "circlecomplete", (circle: any) => {
      const center = circle.getCenter();
      const radius = circle.getRadius() / 1000;
      circle.setMap(null); // remove temp overlay
      drawManager.setDrawingMode(null);
      setDrawing(null);

      const idx = zones.length;
      const color = getColor(idx);
      const newZone: Zone = {
        id: makeId(),
        name: `Zon ${idx + 1}`,
        type: "circle",
        centerLat: center.lat(),
        centerLng: center.lng(),
        radiusKm: Math.round(radius * 10) / 10,
        deliveryFee: 39,
        minOrder: 199,
        isActive: true,
        color: color.main,
      };

      const updated = [...zones, newZone];
      onChange(updated);
      setSelectedId(newZone.id);
    });

    // ── Polygon complete ─────────────────────────────────────────────────────────
    g.maps.event.addListener(drawManager, "polygoncomplete", (poly: any) => {
      const path = poly.getPath().getArray();
      const coords: [number, number][] = path.map((p: any) => [p.lng(), p.lat()]);
      // Close polygon
      if (coords.length > 0 &&
        (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      poly.setMap(null);
      drawManager.setDrawingMode(null);
      setDrawing(null);

      const idx = zones.length;
      const color = getColor(idx);
      const newZone: Zone = {
        id: makeId(),
        name: `Zon ${idx + 1}`,
        type: "polygon",
        polygon: coords,
        radiusKm: 0,
        deliveryFee: 39,
        minOrder: 199,
        isActive: true,
        color: color.main,
      };

      const updated = [...zones, newZone];
      onChange(updated);
      setSelectedId(newZone.id);
    });

    // Click on empty map → deselect
    map.addListener("click", () => setSelectedId(null));

    // Render existing zones
    renderAllZones();

    return () => {
      drawManager.setMap(null);
      overlays.current.forEach(ov => ov.setMap(null));
      overlays.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-render zones when they change
  useEffect(() => {
    if (mapInst.current) renderAllZones();
  }, [zones, renderAllZones]);

  // ── City search ───────────────────────────────────────────────────────────────
  const geocodeSearch = useCallback(async () => {
    if (!search.trim() || !mapInst.current) return;
    setSearching(true);
    const g = window.google;
    new g.maps.Geocoder().geocode(
      { address: `${search.trim()}, Sverige`, region: "SE" },
      (results: any[], status: string) => {
        if (status === "OK" && results[0]) {
          const loc = results[0].geometry.location;
          mapInst.current.setCenter({ lat: loc.lat(), lng: loc.lng() });
          mapInst.current.setZoom(12);
          if (onCenterChange) onCenterChange(loc.lat(), loc.lng());
        }
        setSearching(false);
      }
    );
  }, [search, onCenterChange]);

  // ── Fit bounds to all zones ───────────────────────────────────────────────────
  const fitBounds = useCallback(() => {
    if (!mapInst.current || zones.length === 0) return;
    const g = window.google;
    const bounds = new g.maps.LatLngBounds();
    let hasBounds = false;

    zones.forEach(z => {
      if (z.type === "circle" && z.centerLat && z.centerLng && z.radiusKm) {
        const c = new g.maps.Circle({ center: { lat: z.centerLat, lng: z.centerLng }, radius: z.radiusKm * 1000 });
        bounds.union(c.getBounds());
        hasBounds = true;
      } else if (z.type === "polygon" && z.polygon) {
        z.polygon.forEach(([lng, lat]) => { bounds.extend({ lat, lng }); hasBounds = true; });
      }
    });

    if (hasBounds) mapInst.current.fitBounds(bounds, 40);
  }, [zones]);

  // ── Start drawing ─────────────────────────────────────────────────────────────
  const startDraw = (type: "circle" | "polygon") => {
    if (!dm.current) return;
    setDrawing(type);
    setSelectedId(null);
    const g = window.google;
    dm.current.setDrawingMode(
      type === "circle" ? g.maps.drawing.OverlayType.CIRCLE : g.maps.drawing.OverlayType.POLYGON
    );
  };

  const cancelDraw = () => {
    if (dm.current) dm.current.setDrawingMode(null);
    setDrawing(null);
  };

  // ── Update zone field ─────────────────────────────────────────────────────────
  const updateZone = (id: string, patch: Partial<Zone>) => {
    onChange(zones.map(z => z.id === id ? { ...z, ...patch } : z));
  };

  const deleteZone = (id: string) => {
    const ov = overlays.current.get(id);
    if (ov) { ov.setMap(null); overlays.current.delete(id); }
    onChange(zones.filter(z => z.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // ── Error / no key ────────────────────────────────────────────────────────────
  if (loadErr) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center gap-3 p-10 text-center" style={{ height: mapHeight }}>
        <MapPin size={28} className="text-red-400/60" />
        <p className="text-sm font-black text-red-400">Kunde inte ladda Google Maps</p>
        <p className="text-[10px] text-red-400/50 font-bold leading-relaxed max-w-xs">
          {!MAPS_KEY
            ? "Lägg till NEXT_PUBLIC_GOOGLE_MAPS_KEY i apps/admin/.env.local och starta om servern."
            : "Kontrollera att Maps JavaScript API är aktiverat i Google Cloud Console och att API-nyckeln saknar restriktioner."}
        </p>
      </div>
    );
  }

  const selected = zones.find(z => z.id === selectedId) ?? null;
  const selectedIdx = zones.findIndex(z => z.id === selectedId);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Search + controls ── */}
      <div className="flex flex-wrap gap-2">
        {/* City search */}
        <div className="flex flex-1 min-w-[220px] items-center gap-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl px-4 py-2.5 focus-within:border-gold-500/40 transition-all">
          <Search size={13} className="text-[var(--text-secondary)] shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && geocodeSearch()}
            placeholder={cityName ? `Sök i ${cityName}…` : "Sök stad eller adress…"}
            className="flex-1 bg-transparent text-xs font-bold outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40"
          />
        </div>
        <button onClick={geocodeSearch} disabled={searching || !search.trim() || !ready}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-[#0d0d0d] text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-gold-500/20">
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Navigation2 size={12} />}
          Hitta
        </button>

        {/* Add zone buttons */}
        {drawing ? (
          <button onClick={cancelDraw}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all">
            <X size={12} /> Avbryt ritning
          </button>
        ) : (
          <>
            <button onClick={() => startDraw("circle")} disabled={!ready}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-sky-500/20">
              <Plus size={12} /><Circle size={10} /> Cirkelzon
            </button>
            <button onClick={() => startDraw("polygon")} disabled={!ready}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-violet-500/20">
              <Plus size={12} /><PenLine size={10} /> Polygonzon
            </button>
          </>
        )}

        {zones.length > 0 && (
          <button onClick={fitBounds} disabled={!ready}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all">
            <ZoomIn size={12} /> Anpassa vy
          </button>
        )}
      </div>

      {/* ── Map + Zone list (side by side) ── */}
      <div className="flex gap-4" style={{ minHeight: mapHeight }}>
        {/* Map */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] min-w-0" style={{ height: mapHeight }}>
          {!ready && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] z-10">
              <Loader2 size={24} className="animate-spin text-gold-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Laddar Google Maps…</span>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />

          {/* Drawing hint */}
          {drawing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className={`px-5 py-2.5 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl shadow-xl backdrop-blur-sm ${drawing === "circle" ? "bg-sky-500/90 shadow-sky-500/30" : "bg-violet-500/90 shadow-violet-500/30"}`}>
                {drawing === "circle"
                  ? "Klicka och dra för att rita en cirkelzon"
                  : "Klicka för att lägga till punkter — dubbelklicka för att avsluta"}
              </div>
            </div>
          )}

          {/* Zone count overlay */}
          {zones.length === 0 && !drawing && ready && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="px-4 py-2 bg-[var(--bg-primary)]/90 backdrop-blur-sm border border-[var(--border-subtle)] rounded-xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] text-center">
                  Inga zoner ännu — klicka "Cirkelzon" eller "Polygonzon" ovan
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Zone list (right panel) */}
        <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: mapHeight }}>
          {zones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center border border-dashed border-[var(--border-subtle)] rounded-2xl">
              <MapPin size={24} className="text-[var(--text-secondary)] opacity-30" />
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">
                Rita en zon på kartan för att komma igång
              </p>
            </div>
          ) : (
            zones.map((zone, idx) => {
              const color = getColor(idx);
              const isSelected = zone.id === selectedId;

              return (
                <div
                  key={zone.id}
                  className={`rounded-2xl border transition-all cursor-pointer ${isSelected
                    ? "border-opacity-60 bg-opacity-10"
                    : "border-[var(--border-subtle)] bg-[var(--bg-primary)]/40 hover:bg-[var(--bg-primary)]/80"
                  }`}
                  style={isSelected ? {
                    borderColor: color.main + "80",
                    backgroundColor: color.main + "12",
                  } : {}}
                  onClick={() => setSelectedId(isSelected ? null : zone.id)}
                >
                  {/* Zone header */}
                  <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color.main }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black truncate text-[var(--text-primary)]">{zone.name}</p>
                      <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                        {zone.type === "circle"
                          ? `● Cirkel${zone.radiusKm ? ` ${zone.radiusKm} km` : ""}`
                          : `◆ Polygon${zone.polygon ? ` (${zone.polygon.length - 1} pts)` : ""}`}
                        {!zone.isActive && " · INAKTIV"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); updateZone(zone.id, { isActive: !zone.isActive }); }}
                        title={zone.isActive ? "Inaktivera" : "Aktivera"}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {zone.isActive ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteZone(zone.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all text-[var(--text-secondary)] hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit fields */}
                  {isSelected && (
                    <div
                      className="px-3.5 pb-3.5 space-y-2.5"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Name */}
                      <div>
                        <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-0.5 block">Zonnamn</label>
                        <input
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-gold-500/40 text-[var(--text-primary)]"
                          value={zone.name}
                          onChange={e => updateZone(zone.id, { name: e.target.value })}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      {/* Fee + MinOrder */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-0.5 block">Avgift (kr)</label>
                          <input
                            type="number" min={0}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-gold-500/40 text-emerald-400"
                            value={zone.deliveryFee}
                            onChange={e => updateZone(zone.id, { deliveryFee: Number(e.target.value) || 0 })}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-0.5 block">Min. order (kr)</label>
                          <input
                            type="number" min={0}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-gold-500/40 text-sky-400"
                            value={zone.minOrder}
                            onChange={e => updateZone(zone.id, { minOrder: Number(e.target.value) || 0 })}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {/* Summary */}
                      <div className="px-2 py-1.5 rounded-lg text-[8px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        {zone.deliveryFee === 0 ? "Gratis leverans" : `${zone.deliveryFee} kr leveransavgift`} · Min {zone.minOrder} kr
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Info footer ── */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-2xl">
        <Info size={12} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
        <p className="text-[8px] text-[var(--text-secondary)] font-bold uppercase tracking-wide leading-relaxed">
          Rita zoner med "Cirkelzon" (klicka+dra) eller "Polygonzon" (klicka för punkter, dubbelklicka avsluta) · Klicka på en zon i listan för att redigera · Zoner kan överlappa — kunden hamnar i den minsta matchande zonen · Tryck "Spara ändringar" för att synkronisera med databasen
        </p>
      </div>
    </div>
  );
}
