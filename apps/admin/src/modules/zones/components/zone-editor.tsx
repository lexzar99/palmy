"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle as CircleIcon, Loader2, MapPin, Navigation2, PenLine, Search, Trash2, X, ZoomIn } from "lucide-react";
import type { ZoneRecord } from "@/modules/zones/api";
import { Toggle } from "@/shared/components/ui";

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

// Distinkta färger per zon så ringarna går att skilja åt på kartan (panelens
// fyrkant använder samma colorAt(index), så de matchar). Orange är UI-temat,
// men zonerna behöver var sin egen färg.
const palette = [
  { main: "#F0531C" }, // orange
  { main: "#2563EB" }, // blå
  { main: "#16A34A" }, // grön
  { main: "#9333EA" }, // lila
  { main: "#0891B2" }, // cyan
  { main: "#DB2777" }, // rosa
  { main: "#CA8A04" }, // guld
  { main: "#DC2626" }, // röd
  { main: "#65A30D" }, // lime
  { main: "#4F46E5" }, // indigo
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
    // VIKTIGT: pinna v=3.62. DrawingManager (libraries=drawing) togs BORT i Maps
    // JS API v3.65 → utan pinning kastade `new g.maps.drawing.DrawingManager()`
    // och hela zon-sidan kraschade ("This page couldn't load"). 3.62 har kvar
    // drawing-biblioteket. (Koden nedan guardar dessutom mot att det saknas, så
    // sidan degraderar till visning/redigering i stället för att krascha om
    // Google någon gång rensar bort den pinnade versionen.)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=3.62&libraries=drawing,geometry&callback=_mapsZoneEditorCb`;
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
        { elementType: "geometry", stylers: [{ color: "#f3f4f1" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f1e4db" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbe6ea" }] },
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

    // Guard: DrawingManager togs bort i Maps JS API v3.65. Saknas det (t.ex. om
    // den pinnade versionen rensas av Google) hoppar vi över rit-verktyget i
    // stället för att krascha sidan — kartan + redigering av befintliga zoner
    // fungerar ändå, och rita-knapparna är redan no-op när drawingManager=null.
    if (g.maps.drawing?.DrawingManager) {
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
    } // slut på DrawingManager-guard

    map.addListener("click", () => setSelectedId(null));

    if (centerLat != null && centerLng != null) {
      placeCenter(centerLat, centerLng);
      map.setCenter({ lat: centerLat, lng: centerLng });
    }

    syncOverlays(zonesRef.current, null);
    const overlayMap = overlays.current;

    return () => {
      // drawingManager.current i stället för det guard-scopade `manager`
      // (null om DrawingManager saknades).
      drawingManager.current?.setMap(null);
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
          <div className="flex flex-1 items-center gap-2 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2.5 transition-colors focus-within:border-[var(--accent)]">
            <Search size={14} className="shrink-0 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSuggestions([]);
                  geocodeSearch();
                }
              }}
              placeholder={cityName ? `Sök adress i ${cityName}` : "Sök stad eller adress"}
              className="flex-1 bg-transparent text-[13px] font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {loadingSuggestions ? <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" /> : null}
          </div>
          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[var(--shadow-lift)]">
              {suggestions.map((suggestion) => (
                <button key={suggestion.place_id} type="button" onClick={() => void selectSuggestion(suggestion.place_id, suggestion.description)} className="flex w-full items-center gap-3 border-b border-[var(--row-divider)] px-4 py-3 text-left transition-colors last:border-none hover:bg-[var(--bg-hover)]">
                  <MapPin size={12} className="shrink-0 text-[var(--accent-ink)]" />
                  <div>
                    <span className="block text-[12px] font-bold text-[var(--text-primary)]">{suggestion.description.split(",")[0]}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{suggestion.description.split(",").slice(1).join(",").trim()}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button type="button" onClick={geocodeSearch} disabled={searching || !search.trim() || !mapsReady} className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40">
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Navigation2 size={14} />} Sätt center
        </button>

        {drawing ? (
          <button type="button" onClick={cancelDraw} className="inline-flex items-center gap-1.5 rounded-[11px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--danger-text)]">
            <X size={14} /> Avbryt
          </button>
        ) : (
          <>
            <button type="button" onClick={() => startDraw("circle")} disabled={!mapsReady} className="inline-flex items-center gap-1.5 rounded-[11px] bg-[var(--accent)] px-3.5 py-2.5 text-[13px] font-extrabold text-[var(--accent-fg)] shadow-[var(--shadow-cta)] transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-40">
              <CircleIcon size={14} /> Cirkel
            </button>
            <button type="button" onClick={() => startDraw("polygon")} disabled={!mapsReady} className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40">
              <PenLine size={14} /> Polygon
            </button>
          </>
        )}

        {zones.length > 0 ? (
          <button type="button" onClick={fitBounds} disabled={!mapsReady} className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40">
            <ZoomIn size={14} /> Anpassa
          </button>
        ) : null}
      </div>

      <div className="flex gap-4" style={{ minHeight: mapHeight }}>
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-[14px] border border-[var(--border-subtle)]" style={{ height: mapHeight }}>
          {!mapsReady ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--bg-page)]">
              <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
              <span className="text-[11px] font-bold text-[var(--text-muted)]">Laddar Google Maps</span>
            </div>
          ) : null}
          <div ref={mapRef} className="h-full w-full" />
          {drawing ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[12px] font-extrabold text-white shadow-[var(--shadow-cta)]">
              {drawing === "circle" ? "Klicka och dra för att rita en cirkel" : "Klicka punkter, dubbelklicka för att avsluta polygonen"}
            </div>
          ) : null}
          {mapsReady ? (
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-full bg-[var(--bg-panel)] px-3.5 py-2 shadow-[0_2px_8px_rgba(17,17,19,0.12)]">
              <div className="h-2.5 w-2.5 rounded-full border-2 border-white bg-[#111113]" />
              <span className="text-[11.5px] font-bold text-[var(--text-secondary)]">Restaurangens center</span>
            </div>
          ) : null}
          {zones.length === 0 && !drawing && mapsReady ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 text-center">
              <div className="rounded-full bg-[var(--bg-panel)] px-4 py-2 shadow-[0_2px_8px_rgba(17,17,19,0.12)]">
                <p className="text-[12px] font-bold text-[var(--text-secondary)]">Rita din första leveranszon med Cirkel eller Polygon</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex w-[340px] shrink-0 flex-col overflow-y-auto rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5" style={{ maxHeight: mapHeight }}>
          {/* Vald zons editor */}
          {selectedZone ? (
            <div className="mb-5">
              <input
                className="w-full bg-transparent text-[16px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)] outline-none"
                value={selectedZone.name}
                onChange={(event) => updateZone(selectedZone.id, { name: event.target.value })}
                aria-label="Zonnamn"
              />

              {selectedZone.type === "circle" ? (
                <div className="mt-4">
                  <p className="eyebrow mb-2">Avstånd (radie)</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      className="w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3 py-2 text-center text-[14px] font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={selectedZone.radiusKm ?? 0}
                      onChange={(event) => updateZone(selectedZone.id, { radiusKm: Math.max(0.1, Number(event.target.value)) })}
                      aria-label="Radie (km)"
                    />
                    <span className="text-[13px] font-bold text-[var(--text-muted)]">km</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-[var(--text-muted)]">Polygon med {Math.max((selectedZone.polygon?.length || 1) - 1, 0)} punkter. Dra hörnen på kartan för att ändra formen.</p>
              )}

              <div className="mt-5 flex items-center justify-between border-t border-[var(--row-divider)] pt-4">
                <span className="text-[13px] font-semibold">Leveransavgift</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-[88px] rounded-[10px] border-2 border-[var(--accent)] bg-[var(--bg-panel)] px-3 py-2 text-right text-[14px] font-bold text-[var(--text-primary)] outline-none"
                    value={draftFee[selectedZone.id] ?? String(selectedZone.deliveryFee)}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^0-9]/g, "");
                      setDraftFee((current) => ({ ...current, [selectedZone.id]: raw }));
                      if (raw !== "") updateZone(selectedZone.id, { deliveryFee: Number(raw) });
                    }}
                    onBlur={() => {
                      const nextValue = Math.max(0, Number(draftFee[selectedZone.id] ?? selectedZone.deliveryFee) || 0);
                      setDraftFee((current) => ({ ...current, [selectedZone.id]: String(nextValue) }));
                      updateZone(selectedZone.id, { deliveryFee: nextValue });
                    }}
                    aria-label="Leveransavgift (kr)"
                  />
                  <span className="text-[13px] font-bold text-[var(--text-muted)]">kr</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--row-divider)] pt-4">
                <span className="text-[13px] font-semibold">Min. ordervärde</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-[88px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3 py-2 text-right text-[14px] font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={draftMin[selectedZone.id] ?? String(selectedZone.minOrder)}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^0-9]/g, "");
                      setDraftMin((current) => ({ ...current, [selectedZone.id]: raw }));
                      if (raw !== "") updateZone(selectedZone.id, { minOrder: Number(raw) });
                    }}
                    onBlur={() => {
                      const nextValue = Math.max(0, Number(draftMin[selectedZone.id] ?? selectedZone.minOrder) || 0);
                      setDraftMin((current) => ({ ...current, [selectedZone.id]: String(nextValue) }));
                      updateZone(selectedZone.id, { minOrder: nextValue });
                    }}
                    aria-label="Min. ordervärde (kr)"
                  />
                  <span className="text-[13px] font-bold text-[var(--text-muted)]">kr</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--row-divider)] pt-4">
                <div>
                  <span className="block text-[13px] font-semibold">Leveranstid</span>
                  <span className="text-[11.5px] text-[var(--text-muted)]">minuter, valfritt</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="–"
                  className="w-[88px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-panel)] px-3 py-2 text-right text-[14px] font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={draftEta[selectedZone.id] ?? (selectedZone.etaMinutes != null ? String(selectedZone.etaMinutes) : "")}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[^0-9]/g, "");
                    setDraftEta((current) => ({ ...current, [selectedZone.id]: raw }));
                    updateZone(selectedZone.id, { etaMinutes: raw === "" ? undefined : Number(raw) });
                  }}
                  onBlur={() => {
                    const raw = draftEta[selectedZone.id] ?? "";
                    if (raw === "") {
                      updateZone(selectedZone.id, { etaMinutes: undefined });
                    } else {
                      const nextValue = Math.max(1, Number(raw) || 30);
                      setDraftEta((current) => ({ ...current, [selectedZone.id]: String(nextValue) }));
                      updateZone(selectedZone.id, { etaMinutes: nextValue });
                    }
                  }}
                  aria-label="Leveranstid (min)"
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--row-divider)] pt-4">
                <span className="text-[13px] font-semibold">Aktiv</span>
                <Toggle checked={selectedZone.isActive} onChange={(v) => updateZone(selectedZone.id, { isActive: v })} />
              </div>

              <button
                type="button"
                onClick={() => removeZone(selectedZone.id)}
                className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--danger-text)]"
              >
                <Trash2 size={14} /> Ta bort zon
              </button>
            </div>
          ) : null}

          {/* Restaurangens zoner */}
          <p className="eyebrow mb-3">Restaurangens zoner</p>
          {zones.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">Rita en zon på kartan med Cirkel eller Polygon för att börja.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {zones.map((zone, index) => {
                const selected = zone.id === selectedId;
                // Matcha exakt kartans overlay-färg (palett per index, samma som renderOverlay).
                const color = colorAt(index).main;
                const meta = zone.type === "circle" ? `${zone.radiusKm ?? 0} km` : `${Math.max((zone.polygon?.length || 1) - 1, 0)} pkt`;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setSelectedId(selected ? null : zone.id)}
                    className={`flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                      selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--bg-hover)]"
                    } ${zone.isActive ? "" : "opacity-55"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="h-[11px] w-[11px] shrink-0 rounded-[3px]" style={{ background: color }} />
                      <span className="min-w-0">
                        <span className={`block truncate text-[13.5px] ${selected ? "font-extrabold text-[var(--accent-ink)]" : "font-semibold text-[var(--text-secondary)]"}`}>
                          {zone.name}
                        </span>
                        <span className="block text-[11px] font-medium text-[var(--text-muted)]">{meta}{zone.isActive ? "" : " · inaktiv"}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 text-[13px] font-bold ${selected ? "text-[var(--accent-ink)]" : "text-[var(--text-primary)]"}`}>
                      {zone.deliveryFee} kr
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
