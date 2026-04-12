"use client";

/**
 * ZoneEditor — Multi-zone map editor for admin
 *
 * Fixed bugs vs. v1:
 *  - Stale-closure bug: event handlers use zonesRef so new zones append
 *    correctly instead of replacing all previous zones.
 *  - City-center marker: draggable gold pin, placed by geocoder + on load.
 *  - Invisible zones filtered: old "radiusKm-only" zones without coordinates
 *    are never rendered (would be invisible) — normalizer rejects them at save.
 *  - Google Maps auth error detected via gm_authFailure callback.
 *  - All zone overlays stay visible simultaneously with per-zone colours.
 *  - Selection highlight is applied without removing/recreating overlays.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Search, Navigation2, Plus, PenLine, Trash2,
  Check, X, Loader2, MapPin, Info, ZoomIn, Eye, EyeOff,
  Circle as CircleIcon, AlertTriangle, ExternalLink,
} from "lucide-react";

// ── Zone type (also exported for parent use) ──────────────────────────────────
export interface Zone {
  id: string;
  name: string;
  type: "circle" | "polygon";
  // circle fields
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  // polygon fields — [lng, lat][] (GeoJSON)
  polygon?: [number, number][];
  // pricing in kr (UI), stored in öre in DB
  deliveryFee: number;
  minOrder: number;
  /** Estimated delivery time for this zone in minutes (optional) */
  etaMinutes?: number;
  isActive: boolean;
  color: string;
}

interface Props {
  zones: Zone[];
  onChange: (zones: Zone[]) => void;
  cityName?: string;
  centerLat?: number | null;
  centerLng?: number | null;
  onCenterChange?: (lat: number, lng: number) => void;
  mapHeight?: number;
}

// ── Colour palette ────────────────────────────────────────────────────────────
const PALETTE = [
  { main: "#22c55e", fill: "#22c55e28", stroke: "#16a34a" },
  { main: "#3b82f6", fill: "#3b82f628", stroke: "#2563eb" },
  { main: "#f59e0b", fill: "#f59e0b28", stroke: "#d97706" },
  { main: "#ef4444", fill: "#ef444428", stroke: "#dc2626" },
  { main: "#8b5cf6", fill: "#8b5cf628", stroke: "#7c3aed" },
  { main: "#06b6d4", fill: "#06b6d428", stroke: "#0891b2" },
  { main: "#ec4899", fill: "#ec489928", stroke: "#db2777" },
  { main: "#f97316", fill: "#f9731628", stroke: "#ea580c" },
  { main: "#84cc16", fill: "#84cc1628", stroke: "#65a30d" },
  { main: "#a855f7", fill: "#a855f728", stroke: "#9333ea" },
];
const col = (i: number) => PALETTE[i % PALETTE.length];
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Google Maps loader ────────────────────────────────────────────────────────
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

declare global {
  interface Window {
    google: any;
    _mapsZoneEditorCb?: () => void;
    gm_authFailure?: () => void;
  }
}

type MapsState = "idle" | "loading" | "ready" | "auth_error" | "load_error";
let _mapsState: MapsState = "idle";
const _waiters: Array<{ ok: () => void; err: (e: unknown) => void }> = [];

function loadGoogleMaps(onAuthError: () => void): Promise<void> {
  // Install global auth-failure hook (fires when key is invalid / API not enabled)
  window.gm_authFailure = () => {
    _mapsState = "auth_error";
    onAuthError();
    _waiters.forEach(w => w.err(new Error("auth")));
    _waiters.length = 0;
  };

  if (_mapsState === "ready" || window.google?.maps) {
    _mapsState = "ready";
    return Promise.resolve();
  }
  if (_mapsState === "auth_error" || _mapsState === "load_error") {
    return Promise.reject(new Error(_mapsState));
  }
  if (_mapsState === "loading") {
    return new Promise((ok, err) => _waiters.push({ ok, err }));
  }

  _mapsState = "loading";
  return new Promise((ok, err) => {
    _waiters.push({ ok, err });

    window._mapsZoneEditorCb = () => {
      _mapsState = "ready";
      _waiters.forEach(w => w.ok());
      _waiters.length = 0;
    };

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=drawing,geometry&callback=_mapsZoneEditorCb`;
    s.async = true;
    s.defer = true;
    s.onerror = (e) => {
      _mapsState = "load_error";
      _waiters.forEach(w => w.err(e));
      _waiters.length = 0;
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
  const mapRef    = useRef<HTMLDivElement>(null);
  const mapInst   = useRef<any>(null);
  const dmRef     = useRef<any>(null);
  // overlay map: zoneId → google overlay
  const overlays  = useRef<Map<string, any>>(new Map());
  // centre marker
  const cMarker   = useRef<any>(null);

  // ── CRITICAL: zones ref prevents stale-closure bugs in map event handlers ──
  const zonesRef  = useRef<Zone[]>(zones);
  zonesRef.current = zones; // always up-to-date, no async lag

  const [mapsReady, setMapsReady]   = useState(false);
  const [authErr,   setAuthErr]     = useState(false);
  const [loadErr,   setLoadErr]     = useState(false);
  const [drawing,     setDrawing]     = useState<"circle" | "polygon" | null>(null);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [searching,   setSearching]   = useState(false);
  const [suggestions, setSuggestions] = useState<{ description: string; place_id: string }[]>([]);
  const [loadingSug,  setLoadingSug]  = useState(false);
  const sugDebounce   = useRef<any>(null);

  const ADMIN_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  // ── Draft strings for number inputs ─────────────────────────────────────────
  // Controlled inputs with Number(val)||0 snap empty→0; draft strings avoid this.
  const [draftFee, setDraftFee] = useState<Record<string, string>>({});
  const [draftMin, setDraftMin] = useState<Record<string, string>>({});
  const [draftEta, setDraftEta] = useState<Record<string, string>>({});

  // Seed drafts when a zone is selected
  useEffect(() => {
    if (!selectedId) return;
    const z = zones.find(z => z.id === selectedId);
    if (!z) return;
    setDraftFee(prev => ({ ...prev, [selectedId]: String(z.deliveryFee) }));
    setDraftMin(prev => ({ ...prev, [selectedId]: String(z.minOrder) }));
    setDraftEta(prev => ({ ...prev, [selectedId]: String(z.etaMinutes ?? "") }));
  }, [selectedId]);

  // Protect against 0 being passed (0 ?? x = 0, but 0 is invalid coords)
  const safeCoord = (v: number | null | undefined, def: number) =>
    v != null && v !== 0 ? v : def;
  const fallbackCenter = {
    lat: safeCoord(centerLat, 55.7047),
    lng: safeCoord(centerLng, 13.191),
  };

  // ── Load Maps SDK ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadGoogleMaps(() => setAuthErr(true))
      .then(() => setMapsReady(true))
      .catch(() => setLoadErr(true));
  }, []);

  // ── Render ONE zone overlay ───────────────────────────────────────────────────
  const renderOverlay = useCallback((zone: Zone, idx: number, isSelected: boolean) => {
    if (!mapInst.current) return;
    const g = window.google;
    const c = col(idx);
    const fillOp   = isSelected ? 0.4  : 0.2;
    const strokeW  = isSelected ? 4    : 2.5;
    const zIdx     = isSelected ? 20   : 10 + idx;
    const opacity  = zone.isActive ? 1 : 0.4;

    // Remove old overlay for this zone if it exists
    const prev = overlays.current.get(zone.id);
    if (prev) prev.setMap(null);

    let ov: any;

    if (zone.type === "polygon" && zone.polygon && zone.polygon.length > 2) {
      const path = zone.polygon.map(([lng, lat]) => ({ lat, lng }));
      ov = new g.maps.Polygon({
        paths: path,
        fillColor:   c.main,
        fillOpacity: fillOp * opacity,
        strokeColor: c.main,
        strokeOpacity: 0.9 * opacity,
        strokeWeight: strokeW,
        map: mapInst.current,
        zIndex: zIdx,
        clickable: true,
      });
    } else if (
      zone.type === "circle" &&
      zone.centerLat != null && zone.centerLng != null &&
      zone.radiusKm && zone.radiusKm > 0
    ) {
      ov = new g.maps.Circle({
        center: { lat: zone.centerLat, lng: zone.centerLng },
        radius: zone.radiusKm * 1000,
        fillColor:   c.main,
        fillOpacity: fillOp * opacity,
        strokeColor: c.main,
        strokeOpacity: 0.9 * opacity,
        strokeWeight: strokeW,
        map: mapInst.current,
        zIndex: zIdx,
        clickable: true,
      });
    } else {
      // Cannot render this zone (no valid geometry)
      overlays.current.delete(zone.id);
      return;
    }

    g.maps.event.addListener(ov, "click", () => setSelectedId(id => id === zone.id ? null : zone.id));
    overlays.current.set(zone.id, ov);
  }, []);

  // ── Sync ALL overlays with current zones state ────────────────────────────────
  const syncOverlays = useCallback((currentZones: Zone[], currentSelected: string | null) => {
    if (!mapInst.current) return;
    const ids = new Set(currentZones.map(z => z.id));
    // Remove stale overlays
    overlays.current.forEach((ov, id) => {
      if (!ids.has(id)) { ov.setMap(null); overlays.current.delete(id); }
    });
    // Render each zone
    currentZones.forEach((z, i) => renderOverlay(z, i, z.id === currentSelected));
  }, [renderOverlay]);

  // Re-sync overlays whenever zones or selectedId changes
  useEffect(() => {
    if (mapsReady) syncOverlays(zones, selectedId);
  }, [zones, selectedId, mapsReady, syncOverlays]);

  // ── Place / move the city-centre marker ──────────────────────────────────────
  const placeCentre = useCallback((lat: number, lng: number) => {
    if (!mapInst.current) return;
    const g = window.google;
    if (cMarker.current) cMarker.current.setMap(null);

    cMarker.current = new g.maps.Marker({
      position: { lat, lng },
      map: mapInst.current,
      draggable: true,
      zIndex: 1000,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor:   "#d4a017",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
      },
      title: "Stadsmitt — dra för att flytta",
    });

    cMarker.current.addListener("dragend", (e: any) => {
      const nlat = e.latLng.lat();
      const nlng = e.latLng.lng();
      if (onCenterChange) onCenterChange(nlat, nlng);
    });
  }, [onCenterChange]);

  // Place centre marker when props change (e.g. loaded from DB)
  useEffect(() => {
    if (mapsReady && centerLat != null && centerLng != null) {
      placeCentre(centerLat, centerLng);
    }
  }, [mapsReady, centerLat, centerLng, placeCentre]);

  // ── Initialize map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    const g = window.google;

    const map = new g.maps.Map(mapRef.current, {
      center: fallbackCenter,
      zoom: 12,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry",           stylers: [{ color: "#12121e" }] },
        { elementType: "labels.text.fill",   stylers: [{ color: "#8a9bb0" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#12121e" }] },
        { featureType: "road",              elementType: "geometry", stylers: [{ color: "#232336" }] },
        { featureType: "road.highway",      elementType: "geometry", stylers: [{ color: "#2e2e46" }] },
        { featureType: "water",             elementType: "geometry", stylers: [{ color: "#0d1b2a" }] },
        { featureType: "poi",               stylers: [{ visibility: "off" }] },
        { featureType: "transit",           stylers: [{ visibility: "off" }] },
      ],
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "cooperative",
    });
    mapInst.current = map;

    // DrawingManager
    const dm = new g.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      circleOptions: {
        fillColor: "#d4a017", fillOpacity: 0.22,
        strokeColor: "#d4a017", strokeOpacity: 0.95, strokeWeight: 3,
        editable: true, draggable: true,
      },
      polygonOptions: {
        fillColor: "#d4a017", fillOpacity: 0.22,
        strokeColor: "#d4a017", strokeOpacity: 0.95, strokeWeight: 3,
        editable: true, draggable: true,
      },
    });
    dm.setMap(map);
    dmRef.current = dm;

    // ── CIRCLE complete ──────────────────────────────────────────────────────────
    // Uses zonesRef.current — NOT stale `zones` closure
    g.maps.event.addListener(dm, "circlecomplete", (circle: any) => {
      const centre = circle.getCenter();
      const radius = Math.max(0.1, Math.round((circle.getRadius() / 1000) * 10) / 10);
      circle.setMap(null);   // remove the temp gold overlay
      dm.setDrawingMode(null);
      setDrawing(null);

      const current = zonesRef.current;          // ← always fresh
      const idx     = current.length;
      const newZone: Zone = {
        id:          uid(),
        name:        cityName ? `${cityName} - Zon ${idx + 1}` : `Zon ${idx + 1}`,
        type:        "circle",
        centerLat:   centre.lat(),
        centerLng:   centre.lng(),
        radiusKm:    radius,
        deliveryFee: 39,
        minOrder:    199,
        etaMinutes:  undefined,
        isActive:    true,
        color:       col(idx).main,
      };

      const updated = [...current, newZone];     // ← append, never overwrite
      onChange(updated);
      setSelectedId(newZone.id);
    });

    // ── POLYGON complete ─────────────────────────────────────────────────────────
    g.maps.event.addListener(dm, "polygoncomplete", (poly: any) => {
      const pts = poly.getPath().getArray();
      const coords: [number, number][] = pts.map((p: any) => [p.lng(), p.lat()]);
      // Close the polygon
      if (
        coords.length > 0 &&
        (coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1])
      ) coords.push(coords[0]);

      poly.setMap(null);
      dm.setDrawingMode(null);
      setDrawing(null);

      const current = zonesRef.current;
      const idx     = current.length;
      const newZone: Zone = {
        id:          uid(),
        name:        cityName ? `${cityName} - Zon ${idx + 1}` : `Zon ${idx + 1}`,
        type:        "polygon",
        polygon:     coords,
        radiusKm:    0,
        deliveryFee: 39,
        minOrder:    199,
        etaMinutes:  undefined,
        isActive:    true,
        color:       col(idx).main,
      };

      const updated = [...current, newZone];
      onChange(updated);
      setSelectedId(newZone.id);
    });

    // Click empty map → deselect
    map.addListener("click", () => setSelectedId(null));

    // Place initial centre marker
    if (centerLat != null && centerLng != null) {
      placeCentre(centerLat, centerLng);
      map.setCenter({ lat: centerLat, lng: centerLng });
    }

    // Initial sync
    syncOverlays(zonesRef.current, null);

    return () => {
      dm.setMap(null);
      if (cMarker.current) cMarker.current.setMap(null);
      overlays.current.forEach(ov => ov.setMap(null));
      overlays.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsReady]);

  // ── City-centre search with Places autocomplete ────────────────────────────
  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) { setSuggestions([]); return; }
    setLoadingSug(true);
    try {
      const res = await fetch(`${ADMIN_API}/api/places/autocomplete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      const data = await res.json();
      setSuggestions(data.predictions || []);
    } catch { setSuggestions([]); }
    finally { setLoadingSug(false); }
  }, [ADMIN_API]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setSuggestions([]);
    if (sugDebounce.current) clearTimeout(sugDebounce.current);
    sugDebounce.current = setTimeout(() => fetchSuggestions(val), 320);
  };

  const selectSuggestion = useCallback(async (placeId: string, description: string) => {
    setSearch(description.split(",")[0]);
    setSuggestions([]);
    setSearching(true);
    try {
      const res = await fetch(`${ADMIN_API}/api/places/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      });
      const data = await res.json();
      if (data.location && mapInst.current) {
        const { lat, lng } = data.location;
        mapInst.current.setCenter({ lat, lng });
        mapInst.current.setZoom(12);
        placeCentre(lat, lng);
        if (onCenterChange) onCenterChange(lat, lng);
      }
    } catch {}
    finally { setSearching(false); }
  }, [ADMIN_API, onCenterChange, placeCentre]);

  const geocodeSearch = useCallback(() => {
    if (!search.trim() || !mapInst.current) return;
    setSearching(true);
    setSuggestions([]);
    const g = window.google;
    new g.maps.Geocoder().geocode(
      { address: `${search.trim()}, Sverige`, region: "SE" },
      (results: any[], status: string) => {
        setSearching(false);
        if (status === "OK" && results[0]) {
          const loc = results[0].geometry.location;
          const lat = loc.lat(), lng = loc.lng();
          mapInst.current.setCenter({ lat, lng });
          mapInst.current.setZoom(12);
          placeCentre(lat, lng);
          if (onCenterChange) onCenterChange(lat, lng);
        }
      }
    );
  }, [search, onCenterChange, placeCentre]);

  // ── Fit map bounds to all zones ───────────────────────────────────────────────
  const fitBounds = useCallback(() => {
    if (!mapInst.current || zones.length === 0) return;
    const g = window.google;
    const bounds = new g.maps.LatLngBounds();
    let any = false;

    zones.forEach(z => {
      if (z.type === "circle" && z.centerLat && z.centerLng && z.radiusKm) {
        const cb = new g.maps.Circle({ center: { lat: z.centerLat, lng: z.centerLng }, radius: z.radiusKm * 1000 });
        bounds.union(cb.getBounds());
        any = true;
      } else if (z.type === "polygon" && z.polygon) {
        z.polygon.forEach(([lng, lat]) => { bounds.extend({ lat, lng }); any = true; });
      }
    });

    if (any) mapInst.current.fitBounds(bounds, 50);
  }, [zones]);

  // ── Start / cancel drawing ────────────────────────────────────────────────────
  const startDraw = (type: "circle" | "polygon") => {
    if (!dmRef.current) return;
    const g = window.google;
    setDrawing(type);
    setSelectedId(null);
    dmRef.current.setDrawingMode(
      type === "circle"
        ? g.maps.drawing.OverlayType.CIRCLE
        : g.maps.drawing.OverlayType.POLYGON
    );
  };

  const cancelDraw = () => {
    if (dmRef.current) dmRef.current.setDrawingMode(null);
    setDrawing(null);
  };

  // ── Mutate a zone field ───────────────────────────────────────────────────────
  const updateZone = (id: string, patch: Partial<Zone>) =>
    onChange(zones.map(z => (z.id === id ? { ...z, ...patch } : z)));

  const deleteZone = (id: string) => {
    const ov = overlays.current.get(id);
    if (ov) { ov.setMap(null); overlays.current.delete(id); }
    onChange(zones.filter(z => z.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // ── Error screens ─────────────────────────────────────────────────────────────
  if (authErr) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 space-y-5" style={{ minHeight: 200 }}>
        <div className="flex items-start gap-4">
          <AlertTriangle size={28} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-amber-400 mb-1">Google Maps API — autentiseringsfel</p>
            <p className="text-[10px] font-bold text-amber-400/70 leading-relaxed">
              Kartan kan inte laddas. Kontrollera att dessa API:er är aktiverade i{" "}
              <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="underline">
                Google Cloud Console
              </a>:
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 ml-10">
          {["Maps JavaScript API", "Places API", "Geocoding API"].map(api => (
            <div key={api} className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[10px] font-black text-amber-300">{api}</span>
            </div>
          ))}
        </div>
        <div className="ml-10 p-3 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)]">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">API-nyckel</p>
          <code className="text-[10px] font-mono text-gold-400">{MAPS_KEY || "NEXT_PUBLIC_GOOGLE_MAPS_KEY ej satt"}</code>
        </div>
        <a href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com" target="_blank" rel="noopener noreferrer"
          className="ml-10 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
          <ExternalLink size={12} /> Aktivera Maps JavaScript API
        </a>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center gap-3 p-10 text-center" style={{ height: mapHeight }}>
        <MapPin size={28} className="text-red-400/60" />
        <p className="text-sm font-black text-red-400">Kunde inte ladda Google Maps-skriptet</p>
        <p className="text-[10px] text-red-400/50 font-bold">
          {!MAPS_KEY ? "NEXT_PUBLIC_GOOGLE_MAPS_KEY saknas i apps/admin/.env.local" : "Nätverksproblem eller ogiltig nyckel"}
        </p>
      </div>
    );
  }

  const selected = zones.find(z => z.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Top controls ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* City search with autocomplete */}
        <div className="relative flex flex-1 min-w-[200px]">
          <div className="flex flex-1 items-center gap-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl px-4 py-2.5 focus-within:border-gold-500/40 transition-all">
            <Search size={13} className="text-[var(--text-secondary)] shrink-0" />
            <input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setSuggestions([]); geocodeSearch(); } }}
              placeholder={cityName ? `Sök adress i ${cityName}…` : "Sök stad eller adress för stadsmitt…"}
              className="flex-1 bg-transparent text-xs font-bold outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40"
            />
            {loadingSug && <Loader2 size={11} className="animate-spin text-[var(--text-secondary)] shrink-0" />}
          </div>
          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden z-50 shadow-2xl">
              {suggestions.map(s => (
                <button key={s.place_id} onClick={() => selectSuggestion(s.place_id, s.description)}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-all flex items-center gap-3 border-b border-[var(--border-subtle)] last:border-none">
                  <MapPin size={11} className="text-gold-500 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold text-[var(--text-primary)] block">{s.description.split(",")[0]}</span>
                    <span className="text-[9px] text-[var(--text-secondary)]">{s.description.split(",").slice(1).join(",").trim()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={geocodeSearch} disabled={searching || !search.trim() || !mapsReady}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-[#0d0d0d] text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-gold-500/20 shrink-0">
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Navigation2 size={12} />}
          Sätt stadsmitt
        </button>

        {/* Drawing mode */}
        {drawing ? (
          <button onClick={cancelDraw}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all">
            <X size={12} /> Avbryt
          </button>
        ) : (
          <>
            <button onClick={() => startDraw("circle")} disabled={!mapsReady}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-sky-500/20">
              <Plus size={11} /><CircleIcon size={10} /> Cirkel
            </button>
            <button onClick={() => startDraw("polygon")} disabled={!mapsReady}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-violet-500/20">
              <Plus size={11} /><PenLine size={10} /> Polygon
            </button>
          </>
        )}

        {zones.length > 0 && (
          <button onClick={fitBounds} disabled={!mapsReady}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all">
            <ZoomIn size={12} /> Anpassa vy
          </button>
        )}
      </div>

      {/* ── Map + list ── */}
      <div className="flex gap-4" style={{ minHeight: mapHeight }}>

        {/* Map canvas */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] min-w-0" style={{ height: mapHeight }}>
          {!mapsReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] z-10">
              <Loader2 size={24} className="animate-spin text-gold-500" />
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Laddar Google Maps…</span>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />

          {/* Drawing hint banner */}
          {drawing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-5 py-2.5 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-widest rounded-2xl shadow-xl"
              style={{ background: drawing === "circle" ? "rgba(59,130,246,0.92)" : "rgba(139,92,246,0.92)" }}>
              {drawing === "circle"
                ? "Klicka + håll nere musen och dra för att rita en cirkel"
                : "Klicka för varje punkt — dubbelklicka för att avsluta polygonen"}
            </div>
          )}

          {/* Centre marker legend */}
          {mapsReady && (
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)]/90 backdrop-blur-sm border border-gold-500/30 rounded-xl">
              <div className="w-3 h-3 rounded-full bg-gold-500 border-2 border-white" />
              <span className="text-[8px] font-black uppercase tracking-widest text-gold-400">Stadsmitt — dra för att flytta</span>
            </div>
          )}

          {/* Empty state hint */}
          {zones.length === 0 && !drawing && mapsReady && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none text-center">
              <div className="px-5 py-3 bg-[var(--bg-primary)]/85 backdrop-blur-sm border border-[var(--border-subtle)] rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                  Klicka "Cirkel" eller "Polygon" ovan för att rita din första leveranszon
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Zone list panel */}
        <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto pr-0.5" style={{ maxHeight: mapHeight }}>
          {zones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center border border-dashed border-[var(--border-subtle)] rounded-2xl">
              <MapPin size={22} className="text-[var(--text-secondary)] opacity-30" />
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40 leading-relaxed">
                Rita en zon på kartan — den dyker upp här
              </p>
            </div>
          ) : (
            zones.map((zone, idx) => {
              const c = col(idx);
              const isSel = zone.id === selectedId;

              return (
                <div key={zone.id}
                  className="rounded-2xl border transition-all cursor-pointer"
                  style={isSel
                    ? { borderColor: c.main + "70", backgroundColor: c.main + "12" }
                    : { borderColor: "var(--border-subtle)", backgroundColor: "transparent" }}
                  onClick={() => setSelectedId(isSel ? null : zone.id)}>

                  {/* Zone header row */}
                  <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2">
                    {/* Colour dot */}
                    <div className="w-3 h-3 rounded-full shrink-0 border-2 border-white/20"
                      style={{ backgroundColor: c.main }} />

                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black truncate text-[var(--text-primary)]">{zone.name}</p>
                      <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mt-0.5">
                        {zone.type === "circle"
                          ? `● Cirkel${zone.radiusKm ? ` — ${zone.radiusKm} km` : ""}`
                          : `◆ Polygon${zone.polygon ? ` — ${zone.polygon.length - 1} pts` : ""}`}
                        {!zone.isActive && <span className="text-red-400 ml-1">· INAKTIV</span>}
                      </p>
                    </div>

                    {/* Icon buttons */}
                    <div className="flex items-center gap-0.5">
                      <button title={zone.isActive ? "Inaktivera" : "Aktivera"}
                        onClick={e => { e.stopPropagation(); updateZone(zone.id, { isActive: !zone.isActive }); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
                        {zone.isActive ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                      <button title="Ta bort zon"
                        onClick={e => { e.stopPropagation(); deleteZone(zone.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit area */}
                  {isSel && (
                    <div className="px-3.5 pb-3.5 space-y-2.5" onClick={e => e.stopPropagation()}>
                      {/* Name */}
                      <div>
                        <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-0.5">Zonnamn</label>
                        <input
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-gold-500/40 text-[var(--text-primary)]"
                          value={zone.name}
                          onChange={e => updateZone(zone.id, { name: e.target.value })}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>

                      {/* Fee + MinOrder — use draft strings so the user can clear & retype */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-0.5">Avgift (kr)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-emerald-500/30 text-emerald-400"
                            value={draftFee[zone.id] ?? String(zone.deliveryFee)}
                            onChange={e => {
                              // Allow empty string, digits only
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setDraftFee(prev => ({ ...prev, [zone.id]: raw }));
                              // Live update only when we have a valid number
                              if (raw !== "") updateZone(zone.id, { deliveryFee: Number(raw) });
                            }}
                            onBlur={() => {
                              // Commit: empty → 0
                              const val = Math.max(0, Number(draftFee[zone.id] ?? zone.deliveryFee) || 0);
                              setDraftFee(prev => ({ ...prev, [zone.id]: String(val) }));
                              updateZone(zone.id, { deliveryFee: val });
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-0.5">Minimiorder (kr)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-sky-500/30 text-sky-400"
                            value={draftMin[zone.id] ?? String(zone.minOrder)}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setDraftMin(prev => ({ ...prev, [zone.id]: raw }));
                              if (raw !== "") updateZone(zone.id, { minOrder: Number(raw) });
                            }}
                            onBlur={() => {
                              const val = Math.max(0, Number(draftMin[zone.id] ?? zone.minOrder) || 0);
                              setDraftMin(prev => ({ ...prev, [zone.id]: String(val) }));
                              updateZone(zone.id, { minOrder: val });
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* ETA */}
                      <div>
                        <label className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-0.5">ETA (minuter, lämna tomt = restaurangens standard)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="t.ex. 30"
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] font-black outline-none focus:border-violet-500/30 text-violet-400 placeholder:text-[var(--text-secondary)]/30"
                          value={draftEta[zone.id] ?? (zone.etaMinutes != null ? String(zone.etaMinutes) : "")}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            setDraftEta(prev => ({ ...prev, [zone.id]: raw }));
                            updateZone(zone.id, { etaMinutes: raw === "" ? undefined : Number(raw) });
                          }}
                          onBlur={() => {
                            const raw = draftEta[zone.id] ?? "";
                            if (raw === "") {
                              updateZone(zone.id, { etaMinutes: undefined });
                            } else {
                              const val = Math.max(1, Number(raw) || 30);
                              setDraftEta(prev => ({ ...prev, [zone.id]: String(val) }));
                              updateZone(zone.id, { etaMinutes: val });
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>

                      {/* Summary pill */}
                      <div className="px-3 py-2 rounded-xl border text-[8px] font-bold text-[var(--text-secondary)]"
                        style={{ borderColor: c.main + "40", backgroundColor: c.main + "0a" }}>
                        {zone.deliveryFee === 0 ? "✅ Gratis leverans" : `🚚 ${zone.deliveryFee} kr`}
                        {" · "}{zone.minOrder > 0 ? `min ${zone.minOrder} kr` : "ingen min"}
                        {zone.etaMinutes ? ` · ⏱ ${zone.etaMinutes} min` : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Info bar ── */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-2xl">
        <Info size={12} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
        <p className="text-[8px] text-[var(--text-secondary)] font-bold uppercase tracking-wide leading-relaxed">
          Söka stad → Sätt stadsmitt (guldpunkt) · Cirkel = klicka+dra · Polygon = klicka punkter, dubbelklicka avsluta ·
          Klicka zon i listan för att redigera · Dra guldpunkten för att flytta stadsmitt ·
          Spara via knappen längst ned
        </p>
      </div>
    </div>
  );
}
