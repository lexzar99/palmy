"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Circle as CircleIcon, Eye, EyeOff, Loader2, MapPin, Navigation2, PenLine, Plus, Search, Trash2, X, ZoomIn } from "lucide-react";
import type { ZoneRecord } from "@/modules/zones/api";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

declare global {
  interface Window {
    google: any;
    _mapsZoneEditorCb?: () => void;
    gm_authFailure?: () => void;
  }
}

type MapsState = "idle" | "loading" | "ready" | "auth_error" | "load_error";
let mapsState: MapsState = "idle";
const mapsWaiters: Array<{ ok: () => void; err: (error: unknown) => void }> = [];

const palette = [
  { main: "#22c55e" },
  { main: "#3b82f6" },
  { main: "#f59e0b" },
  { main: "#ef4444" },
  { main: "#8b5cf6" },
  { main: "#06b6d4" },
  { main: "#ec4899" },
  { main: "#f97316" },
  { main: "#84cc16" },
  { main: "#a855f7" },
];

const colorAt = (index: number) => palette[index % palette.length];
const uid = () => Math.random().toString(36).slice(2, 10);

function loadGoogleMaps(onAuthError: () => void): Promise<void> {
  window.gm_authFailure = () => {
    mapsState = "auth_error";
    onAuthError();
    mapsWaiters.forEach((waiter) => waiter.err(new Error("auth")));
    mapsWaiters.length = 0;
  };

  if (mapsState === "ready" || window.google?.maps) {
    mapsState = "ready";
    return Promise.resolve();
  }

  if (mapsState === "auth_error" || mapsState === "load_error") {
    return Promise.reject(new Error(mapsState));
  }

  if (mapsState === "loading") {
    return new Promise((ok, err) => mapsWaiters.push({ ok, err }));
  }

  mapsState = "loading";
  return new Promise((ok, err) => {
    mapsWaiters.push({ ok, err });
    window._mapsZoneEditorCb = () => {
      mapsState = "ready";
      mapsWaiters.forEach((waiter) => waiter.ok());
      mapsWaiters.length = 0;
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=drawing,geometry&callback=_mapsZoneEditorCb`;
    script.async = true;
    script.defer = true;
    script.onerror = (error) => {
      mapsState = "load_error";
      mapsWaiters.forEach((waiter) => waiter.err(error));
      mapsWaiters.length = 0;
    };
    document.head.appendChild(script);
  });
}

interface Props {
  zones: ZoneRecord[];
  onChange: (zones: ZoneRecord[]) => void;
  cityName?: string;
  centerLat?: number | null;
  centerLng?: number | null;
  onCenterChange?: (lat: number, lng: number) => void;
  mapHeight?: number;
}

export default function ZoneEditor({ zones, onChange, cityName = "", centerLat, centerLng, onCenterChange, mapHeight = 720 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const drawingManager = useRef<any>(null);
  const overlays = useRef<Map<string, any>>(new Map());
  const centerMarker = useRef<any>(null);
  const zonesRef = useRef<ZoneRecord[]>(zones);
  zonesRef.current = zones;

  const [mapsReady, setMapsReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [drawing, setDrawing] = useState<"circle" | "polygon" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ description: string; place_id: string }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const [draftFee, setDraftFee] = useState<Record<string, string>>({});
  const [draftMin, setDraftMin] = useState<Record<string, string>>({});
  const [draftEta, setDraftEta] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedId) return;
    const selected = zones.find((zone) => zone.id === selectedId);
    if (!selected) return;
    setDraftFee((current) => ({ ...current, [selectedId]: String(selected.deliveryFee) }));
    setDraftMin((current) => ({ ...current, [selectedId]: String(selected.minOrder) }));
    setDraftEta((current) => ({ ...current, [selectedId]: selected.etaMinutes != null ? String(selected.etaMinutes) : "" }));
  }, [selectedId, zones]);

  const fallbackCenter = useMemo(
    () => ({
      lat: centerLat != null && centerLat !== 0 ? centerLat : 55.7047,
      lng: centerLng != null && centerLng !== 0 ? centerLng : 13.191,
    }),
    [centerLat, centerLng],
  );

  useEffect(() => {
    loadGoogleMaps(() => setAuthError(true))
      .then(() => setMapsReady(true))
      .catch(() => setLoadError(true));
  }, []);

  const renderOverlay = useCallback((zone: ZoneRecord, index: number, isSelected: boolean) => {
    if (!mapInstance.current) return;
    const g = window.google;
    const color = colorAt(index).main;
    const fillOpacity = isSelected ? 0.38 : 0.18;
    const strokeWeight = isSelected ? 4 : 2.4;
    const opacity = zone.isActive ? 1 : 0.35;

    const previous = overlays.current.get(zone.id);
    if (previous) previous.setMap(null);

    let overlay: any;

    if (zone.type === "polygon" && zone.polygon && zone.polygon.length > 2) {
      overlay = new g.maps.Polygon({
        paths: zone.polygon.map(([lng, lat]) => ({ lat, lng })),
        fillColor: color,
        fillOpacity: fillOpacity * opacity,
        strokeColor: color,
        strokeOpacity: 0.9 * opacity,
        strokeWeight,
        map: mapInstance.current,
        zIndex: isSelected ? 30 : 10 + index,
        clickable: true,
      });
    } else if (zone.type === "circle" && zone.centerLat != null && zone.centerLng != null && zone.radiusKm && zone.radiusKm > 0) {
      overlay = new g.maps.Circle({
        center: { lat: zone.centerLat, lng: zone.centerLng },
        radius: zone.radiusKm * 1000,
        fillColor: color,
        fillOpacity: fillOpacity * opacity,
        strokeColor: color,
        strokeOpacity: 0.9 * opacity,
        strokeWeight,
        map: mapInstance.current,
        zIndex: isSelected ? 30 : 10 + index,
        clickable: true,
      });
    } else {
      overlays.current.delete(zone.id);
      return;
    }

    g.maps.event.addListener(overlay, "click", () => setSelectedId((current) => (current === zone.id ? null : zone.id)));
    overlays.current.set(zone.id, overlay);
  }, []);

  const syncOverlays = useCallback((currentZones: ZoneRecord[], currentSelected: string | null) => {
    if (!mapInstance.current) return;

    const ids = new Set(currentZones.map((zone) => zone.id));
    overlays.current.forEach((overlay, id) => {
      if (!ids.has(id)) {
        overlay.setMap(null);
        overlays.current.delete(id);
      }
    });

    currentZones.forEach((zone, index) => renderOverlay(zone, index, zone.id === currentSelected));
  }, [renderOverlay]);

  useEffect(() => {
    if (mapsReady) syncOverlays(zones, selectedId);
  }, [mapsReady, selectedId, syncOverlays, zones]);

  const placeCenter = useCallback((lat: number, lng: number) => {
    if (!mapInstance.current) return;
    const g = window.google;

    if (centerMarker.current) centerMarker.current.setMap(null);
    centerMarker.current = new g.maps.Marker({
      position: { lat, lng },
      map: mapInstance.current,
      draggable: true,
      zIndex: 1000,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeColor: "#08090b",
        strokeWeight: 2.5,
      },
      title: "Drag to move city center",
    });

    centerMarker.current.addListener("dragend", (event: any) => {
      onCenterChange?.(event.latLng.lat(), event.latLng.lng());
    });
  }, [onCenterChange]);

  useEffect(() => {
    if (mapsReady && centerLat != null && centerLng != null) {
      placeCenter(centerLat, centerLng);
    }
  }, [centerLat, centerLng, mapsReady, placeCenter]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    const g = window.google;

    const map = new g.maps.Map(mapRef.current, {
      center: fallbackCenter,
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
    mapInstance.current = map;

    const manager = new g.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      circleOptions: {
        fillColor: "#ffffff",
        fillOpacity: 0.22,
        strokeColor: "#ffffff",
        strokeOpacity: 0.95,
        strokeWeight: 3,
        editable: true,
        draggable: true,
      },
      polygonOptions: {
        fillColor: "#ffffff",
        fillOpacity: 0.22,
        strokeColor: "#ffffff",
        strokeOpacity: 0.95,
        strokeWeight: 3,
        editable: true,
        draggable: true,
      },
    });
    manager.setMap(map);
    drawingManager.current = manager;

    g.maps.event.addListener(manager, "circlecomplete", (circle: any) => {
      const center = circle.getCenter();
      const radius = Math.max(0.1, Math.round((circle.getRadius() / 1000) * 10) / 10);
      circle.setMap(null);
      manager.setDrawingMode(null);
      setDrawing(null);

      const current = zonesRef.current;
      const index = current.length;
      const nextZone: ZoneRecord = {
        id: uid(),
        name: cityName ? `${cityName} Zone ${index + 1}` : `Zone ${index + 1}`,
        type: "circle",
        centerLat: center.lat(),
        centerLng: center.lng(),
        radiusKm: radius,
        deliveryFee: 39,
        minOrder: 199,
        isActive: true,
        color: colorAt(index).main,
      };

      onChange([...current, nextZone]);
      setSelectedId(nextZone.id);
    });

    g.maps.event.addListener(manager, "polygoncomplete", (polygon: any) => {
      const points = polygon.getPath().getArray();
      const coordinates: [number, number][] = points.map((point: any) => [point.lng(), point.lat()]);
      if (coordinates.length > 0 && (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
        coordinates.push(coordinates[0]);
      }

      polygon.setMap(null);
      manager.setDrawingMode(null);
      setDrawing(null);

      const current = zonesRef.current;
      const index = current.length;
      const nextZone: ZoneRecord = {
        id: uid(),
        name: cityName ? `${cityName} Zone ${index + 1}` : `Zone ${index + 1}`,
        type: "polygon",
        polygon: coordinates,
        deliveryFee: 39,
        minOrder: 199,
        isActive: true,
        color: colorAt(index).main,
      };

      onChange([...current, nextZone]);
      setSelectedId(nextZone.id);
    });

    map.addListener("click", () => setSelectedId(null));

    if (centerLat != null && centerLng != null) {
      placeCenter(centerLat, centerLng);
      map.setCenter({ lat: centerLat, lng: centerLng });
    }

    syncOverlays(zonesRef.current, null);
    const overlayMap = overlays.current;

    return () => {
      manager.setMap(null);
      if (centerMarker.current) centerMarker.current.setMap(null);
      overlayMap.forEach((overlay) => overlay.setMap(null));
      overlayMap.clear();
    };
  }, [centerLat, centerLng, cityName, fallbackCenter, mapsReady, onChange, placeCenter, syncOverlays]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const response = await fetch("/api/places/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      const data = await response.json();
      setSuggestions(data.predictions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSuggestions([]);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(value);
    }, 320);
  };

  const selectSuggestion = useCallback(async (placeId: string, description: string) => {
    setSearch(description.split(",")[0]);
    setSuggestions([]);
    setSearching(true);
    try {
      const response = await fetch("/api/places/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      });
      const data = await response.json();
      if (data.location && mapInstance.current) {
        const { lat, lng } = data.location;
        mapInstance.current.setCenter({ lat, lng });
        mapInstance.current.setZoom(12);
        placeCenter(lat, lng);
        onCenterChange?.(lat, lng);
      }
    } finally {
      setSearching(false);
    }
  }, [onCenterChange, placeCenter]);

  const geocodeSearch = useCallback(() => {
    if (!search.trim() || !mapInstance.current) return;
    setSearching(true);
    setSuggestions([]);
    const g = window.google;
    new g.maps.Geocoder().geocode({ address: `${search.trim()}, Sverige`, region: "SE" }, (results: any[], status: string) => {
      setSearching(false);
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        mapInstance.current.setCenter({ lat, lng });
        mapInstance.current.setZoom(12);
        placeCenter(lat, lng);
        onCenterChange?.(lat, lng);
      }
    });
  }, [onCenterChange, placeCenter, search]);

  const fitBounds = useCallback(() => {
    if (!mapInstance.current || zones.length === 0) return;
    const g = window.google;
    const bounds = new g.maps.LatLngBounds();
    let hasGeometry = false;
    zones.forEach((zone) => {
      if (zone.type === "circle" && zone.centerLat && zone.centerLng && zone.radiusKm) {
        const circleBounds = new g.maps.Circle({ center: { lat: zone.centerLat, lng: zone.centerLng }, radius: zone.radiusKm * 1000 });
        bounds.union(circleBounds.getBounds());
        hasGeometry = true;
      } else if (zone.type === "polygon" && zone.polygon) {
        zone.polygon.forEach(([lng, lat]) => {
          bounds.extend({ lat, lng });
          hasGeometry = true;
        });
      }
    });
    if (hasGeometry) mapInstance.current.fitBounds(bounds, 50);
  }, [zones]);

  const startDraw = (type: "circle" | "polygon") => {
    if (!drawingManager.current) return;
    const g = window.google;
    setDrawing(type);
    setSelectedId(null);
    drawingManager.current.setDrawingMode(type === "circle" ? g.maps.drawing.OverlayType.CIRCLE : g.maps.drawing.OverlayType.POLYGON);
  };

  const cancelDraw = () => {
    drawingManager.current?.setDrawingMode(null);
    setDrawing(null);
  };

  const updateZone = (zoneId: string, patch: Partial<ZoneRecord>) => onChange(zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)));

  const removeZone = (zoneId: string) => {
    const overlay = overlays.current.get(zoneId);
    if (overlay) {
      overlay.setMap(null);
      overlays.current.delete(zoneId);
    }
    onChange(zones.filter((zone) => zone.id !== zoneId));
    if (selectedId === zoneId) setSelectedId(null);
  };

  if (authError) {
    return (
      <div className="rounded-2xl border border-[rgba(240,178,79,0.28)] bg-[rgba(240,178,79,0.08)] p-8 text-sm text-[#ffe6bf]">
        Google Maps could not authenticate. Check that Maps JavaScript, Places and Geocoding APIs are enabled for `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-[rgba(239,107,115,0.2)] bg-[rgba(239,107,115,0.08)] text-sm text-[#ffd2d5]" style={{ height: mapHeight }}>
        Unable to load the Google Maps script.
      </div>
    );
  }

  const selectedZone = zones.find((zone) => zone.id === selectedId) || null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex min-w-[220px] flex-1">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2.5 transition-all focus-within:border-[var(--accent)]">
            <Search size={13} className="shrink-0 text-[var(--text-secondary)]" />
            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSuggestions([]);
                  geocodeSearch();
                }
              }}
              placeholder={cityName ? `Search address in ${cityName}` : "Search city or address"}
              className="flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]/50"
            />
            {loadingSuggestions ? <Loader2 size={11} className="animate-spin text-[var(--text-secondary)]" /> : null}
          </div>
          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-2xl">
              {suggestions.map((suggestion) => (
                <button key={suggestion.place_id} type="button" onClick={() => void selectSuggestion(suggestion.place_id, suggestion.description)} className="flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left transition-all hover:bg-white/5 last:border-none">
                  <MapPin size={11} className="shrink-0 text-[var(--accent-strong)]" />
                  <div>
                    <span className="block text-[11px] font-bold text-[var(--text-primary)]">{suggestion.description.split(",")[0]}</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{suggestion.description.split(",").slice(1).join(",").trim()}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button type="button" onClick={geocodeSearch} disabled={searching || !search.trim() || !mapsReady} className="rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-fg)] transition-all hover:bg-[var(--accent-strong)] disabled:opacity-40">
          {searching ? <Loader2 size={12} className="inline animate-spin" /> : <Navigation2 size={12} className="inline" />} Set center
        </button>

        {drawing ? (
          <button type="button" onClick={cancelDraw} className="rounded-2xl bg-[#ef6b73] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">
            <X size={12} className="inline" /> Cancel
          </button>
        ) : (
          <>
            <button type="button" onClick={() => startDraw("circle")} disabled={!mapsReady} className="rounded-2xl bg-[#3b82f6] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-40">
              <Plus size={11} className="mr-1 inline" /><CircleIcon size={10} className="mr-1 inline" />Circle
            </button>
            <button type="button" onClick={() => startDraw("polygon")} disabled={!mapsReady} className="rounded-2xl bg-[#8b5cf6] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-40">
              <Plus size={11} className="mr-1 inline" /><PenLine size={10} className="mr-1 inline" />Polygon
            </button>
          </>
        )}

        {zones.length > 0 ? (
          <button type="button" onClick={fitBounds} disabled={!mapsReady} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)]">
            <ZoomIn size={12} className="mr-1 inline" /> Fit view
          </button>
        ) : null}
      </div>

      <div className="flex gap-4" style={{ minHeight: mapHeight }}>
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)]" style={{ height: mapHeight }}>
          {!mapsReady ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)]">
              <Loader2 size={24} className="animate-spin text-[var(--accent-strong)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Loading Google Maps</span>
            </div>
          ) : null}
          <div ref={mapRef} className="h-full w-full" />
          {drawing ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-2xl px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white" style={{ background: drawing === "circle" ? "rgba(59,130,246,0.92)" : "rgba(139,92,246,0.92)" }}>
              {drawing === "circle" ? "Click and drag to draw a circle" : "Click points and double-click to finish the polygon"}
            </div>
          ) : null}
          {mapsReady ? (
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-xl border border-[var(--accent-soft)] bg-[rgba(10,11,14,0.9)] px-3 py-2 backdrop-blur-sm">
              <div className="h-3 w-3 rounded-full border-2 border-white bg-[var(--accent)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent-strong)]">City center</span>
            </div>
          ) : null}
          {zones.length === 0 && !drawing && mapsReady ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(15,19,27,0.85)] px-5 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Draw the first delivery zone</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto pr-0.5" style={{ maxHeight: mapHeight }}>
          {zones.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] p-6 text-center">
              <MapPin size={22} className="text-[var(--text-secondary)]/40" />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]/60">Draw a zone on the map to start editing</p>
            </div>
          ) : (
            zones.map((zone, index) => {
              const selected = zone.id === selectedId;
              const color = colorAt(index).main;

              return (
                <div key={zone.id} className="cursor-pointer rounded-2xl border transition-all" style={selected ? { borderColor: `${color}80`, backgroundColor: `${color}15` } : { borderColor: "var(--border-subtle)", backgroundColor: "transparent" }} onClick={() => setSelectedId(selected ? null : zone.id)}>
                  <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3.5">
                    <div className="h-3 w-3 shrink-0 rounded-full border-2 border-white/20" style={{ backgroundColor: color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-black text-[var(--text-primary)]">{zone.name}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{zone.type === "circle" ? `Circle${zone.radiusKm ? ` • ${zone.radiusKm} km` : ""}` : `Polygon • ${Math.max((zone.polygon?.length || 1) - 1, 0)} pts`}{!zone.isActive ? <span className="ml-1 text-[#ef6b73]">• inactive</span> : null}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button type="button" title={zone.isActive ? "Disable" : "Enable"} onClick={(event) => { event.stopPropagation(); updateZone(zone.id, { isActive: !zone.isActive }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-all hover:bg-white/10 hover:text-[var(--text-primary)]">
                        {zone.isActive ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                      <button type="button" title="Delete zone" onClick={(event) => { event.stopPropagation(); removeZone(zone.id); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-all hover:bg-[rgba(239,107,115,0.16)] hover:text-[#ef6b73]">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {selected ? (
                    <div className="space-y-2.5 px-3.5 pb-3.5" onClick={(event) => event.stopPropagation()}>
                      <div>
                        <label className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Zone name</label>
                        <input className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-black text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" value={zone.name} onChange={(event) => updateZone(zone.id, { name: event.target.value })} />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Fee</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-black text-[#8bf0c9] outline-none"
                            value={draftFee[zone.id] ?? String(zone.deliveryFee)}
                            onChange={(event) => {
                              const raw = event.target.value.replace(/[^0-9]/g, "");
                              setDraftFee((current) => ({ ...current, [zone.id]: raw }));
                              if (raw !== "") updateZone(zone.id, { deliveryFee: Number(raw) });
                            }}
                            onBlur={() => {
                              const nextValue = Math.max(0, Number(draftFee[zone.id] ?? zone.deliveryFee) || 0);
                              setDraftFee((current) => ({ ...current, [zone.id]: String(nextValue) }));
                              updateZone(zone.id, { deliveryFee: nextValue });
                            }}
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Min order</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-black text-[#b7dcff] outline-none"
                            value={draftMin[zone.id] ?? String(zone.minOrder)}
                            onChange={(event) => {
                              const raw = event.target.value.replace(/[^0-9]/g, "");
                              setDraftMin((current) => ({ ...current, [zone.id]: raw }));
                              if (raw !== "") updateZone(zone.id, { minOrder: Number(raw) });
                            }}
                            onBlur={() => {
                              const nextValue = Math.max(0, Number(draftMin[zone.id] ?? zone.minOrder) || 0);
                              setDraftMin((current) => ({ ...current, [zone.id]: String(nextValue) }));
                              updateZone(zone.id, { minOrder: nextValue });
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">ETA minutes</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-black text-[#d9b7ff] outline-none"
                          value={draftEta[zone.id] ?? (zone.etaMinutes != null ? String(zone.etaMinutes) : "")}
                          onChange={(event) => {
                            const raw = event.target.value.replace(/[^0-9]/g, "");
                            setDraftEta((current) => ({ ...current, [zone.id]: raw }));
                            updateZone(zone.id, { etaMinutes: raw === "" ? undefined : Number(raw) });
                          }}
                          onBlur={() => {
                            const raw = draftEta[zone.id] ?? "";
                            if (raw === "") {
                              updateZone(zone.id, { etaMinutes: undefined });
                            } else {
                              const nextValue = Math.max(1, Number(raw) || 30);
                              setDraftEta((current) => ({ ...current, [zone.id]: String(nextValue) }));
                              updateZone(zone.id, { etaMinutes: nextValue });
                            }
                          }}
                        />
                      </div>

                      <div className="rounded-xl border px-3 py-2 text-[10px] font-bold text-[var(--text-secondary)]" style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}>
                        {zone.deliveryFee === 0 ? "Free delivery" : `${zone.deliveryFee} kr delivery`} • {zone.minOrder > 0 ? `minimum ${zone.minOrder} kr` : "no minimum"}{zone.etaMinutes ? ` • ${zone.etaMinutes} min` : ""}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
