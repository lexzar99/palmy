"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Circle as CircleIcon, Loader2, MapPin, Navigation2, PenLine, Search, Trash2, X, ZoomIn } from "lucide-react";
import type { ZoneRecord } from "@/modules/zones/api";
import { Button, DurationInput, Field, Input, MoneyInput, NumberInput, SwitchField } from "@/shared/components/ui";
import { loadGoogleMaps, onGoogleMapsAuthError } from "@/shared/utils/google-maps";

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

const parseNumericDraft = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeDraft = (value: string, fallback: number, min: number, integer = false) => {
  const parsed = parseNumericDraft(value);
  const numeric = Math.max(min, parsed ?? fallback);
  return integer ? Math.round(numeric) : numeric;
};

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
  const drawControls = useRef<{ start: (type: "circle" | "polygon") => void; cancel: () => void } | null>(null);
  const drawMode = useRef<"circle" | "polygon" | null>(null);
  const drawPreview = useRef<any>(null);
  const drawVertices = useRef<any[]>([]);
  const drawPoints = useRef<any[]>([]);
  const drawCenter = useRef<any>(null);
  const drawRadius = useRef(0);
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
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const searchInputId = useId();
  const suggestionsId = useId();

  const [draftRadius, setDraftRadius] = useState<Record<string, string>>({});
  const [draftFee, setDraftFee] = useState<Record<string, string>>({});
  const [draftMin, setDraftMin] = useState<Record<string, string>>({});
  const [draftEta, setDraftEta] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedId) return;
    const selected = zonesRef.current.find((zone) => zone.id === selectedId);
    if (!selected) return;
    setDraftRadius((current) => ({ ...current, [selectedId]: String(selected.radiusKm ?? 0) }));
    setDraftFee((current) => ({ ...current, [selectedId]: String(selected.deliveryFee) }));
    setDraftMin((current) => ({ ...current, [selectedId]: String(selected.minOrder) }));
    setDraftEta((current) => ({ ...current, [selectedId]: selected.etaMinutes != null ? String(selected.etaMinutes) : "" }));
  }, [selectedId]);

  const fallbackCenter = useMemo(
    () => ({
      lat: centerLat != null && centerLat !== 0 ? centerLat : 55.7047,
      lng: centerLng != null && centerLng !== 0 ? centerLng : 13.191,
    }),
    [centerLat, centerLng],
  );

  useEffect(() => {
    const unsubscribe = onGoogleMapsAuthError(() => setAuthError(true));
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "auth_error") setAuthError(true);
        else setLoadError(true);
      });
    return unsubscribe;
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

    // Eget ritverktyg. DrawingManager togs bort i Maps JS API v3.65, så cirklar
    // och polygoner ritas med kartans egna mus-events i stället. Beteendet är
    // detsamma som tidigare: cirkel = klicka och dra, polygon = klicka punkter
    // och dubbelklicka (eller Enter) för att avsluta. Escape avbryter.
    const previewStyle = {
      fillColor: "#ffffff",
      fillOpacity: 0.22,
      strokeColor: "#ffffff",
      strokeOpacity: 0.95,
      strokeWeight: 3,
      clickable: false,
      zIndex: 60,
    };

    const metersPerPixel = () => {
      const lat = ((map.getCenter()?.lat?.() as number) ?? 0) * (Math.PI / 180);
      return (156543.03392 * Math.cos(lat)) / Math.pow(2, map.getZoom() || 12);
    };

    const clearPreview = () => {
      drawPreview.current?.setMap(null);
      drawPreview.current = null;
      drawVertices.current.forEach((marker: any) => marker.setMap(null));
      drawVertices.current = [];
      drawPoints.current = [];
      drawCenter.current = null;
      drawRadius.current = 0;
    };

    const resetMapInteraction = () => {
      map.setOptions({ draggable: true, disableDoubleClickZoom: false, draggableCursor: null });
    };

    const stopDrawing = () => {
      clearPreview();
      drawMode.current = null;
      resetMapInteraction();
      setDrawing(null);
    };

    const createZone = (shape: Pick<ZoneRecord, "type"> & Partial<ZoneRecord>) => {
      const current = zonesRef.current;
      const index = current.length;
      const nextZone: ZoneRecord = {
        id: uid(),
        name: cityName ? `${cityName} Zone ${index + 1}` : `Zone ${index + 1}`,
        deliveryFee: 39,
        minOrder: 199,
        isActive: true,
        color: colorAt(index).main,
        ...shape,
      };

      onChange([...current, nextZone]);
      setSelectedId(nextZone.id);
    };

    const renderCirclePreview = () => {
      if (!drawCenter.current) return;
      if (drawPreview.current) {
        drawPreview.current.setCenter(drawCenter.current);
        drawPreview.current.setRadius(drawRadius.current);
        return;
      }
      drawPreview.current = new g.maps.Circle({ ...previewStyle, map, center: drawCenter.current, radius: drawRadius.current });
    };

    const renderPolygonPreview = (cursor?: any) => {
      const path = cursor ? [...drawPoints.current, cursor] : [...drawPoints.current];
      if (drawPreview.current) {
        drawPreview.current.setPath(path);
        return;
      }
      drawPreview.current = new g.maps.Polyline({ ...previewStyle, map, path });
    };

    const addVertexMarker = (position: any) => {
      drawVertices.current.push(
        new g.maps.Marker({
          position,
          map,
          clickable: false,
          zIndex: 61,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: "#111113",
            strokeWeight: 2,
          },
        }),
      );
    };

    const finishCircle = () => {
      if (drawMode.current !== "circle" || !drawCenter.current) return;
      const center = drawCenter.current;
      const meters = drawRadius.current;
      stopDrawing();
      // Ett klick utan drag ska inte skapa en zon av misstag.
      if (meters < 50) return;
      createZone({
        type: "circle",
        centerLat: center.lat(),
        centerLng: center.lng(),
        radiusKm: Math.max(0.1, Math.round((meters / 1000) * 10) / 10),
      });
    };

    const finishPolygon = () => {
      if (drawMode.current !== "polygon") return;
      const points = [...drawPoints.current];
      stopDrawing();
      if (points.length < 3) return;

      const coordinates: [number, number][] = points.map((point: any) => [point.lng(), point.lat()]);
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([first[0], first[1]]);

      createZone({ type: "polygon", polygon: coordinates });
    };

    const listeners: any[] = [];

    listeners.push(
      map.addListener("mousedown", (event: any) => {
        if (drawMode.current !== "circle" || !event.latLng) return;
        drawCenter.current = event.latLng;
        drawRadius.current = 0;
        renderCirclePreview();
      }),
    );

    listeners.push(
      map.addListener("mousemove", (event: any) => {
        if (!event.latLng) return;
        if (drawMode.current === "circle" && drawCenter.current) {
          drawRadius.current = g.maps.geometry.spherical.computeDistanceBetween(drawCenter.current, event.latLng);
          renderCirclePreview();
        } else if (drawMode.current === "polygon" && drawPoints.current.length > 0) {
          renderPolygonPreview(event.latLng);
        }
      }),
    );

    listeners.push(map.addListener("mouseup", () => finishCircle()));

    listeners.push(
      map.addListener("click", (event: any) => {
        if (drawMode.current === "circle") return;
        if (drawMode.current !== "polygon") {
          setSelectedId(null);
          return;
        }
        if (!event.latLng) return;

        // Ett dubbelklick ger två click-events före dblclick — hoppa över den
        // dubbletten så polygonen inte får en punkt ovanpå föregående.
        const previous = drawPoints.current[drawPoints.current.length - 1];
        if (previous && g.maps.geometry.spherical.computeDistanceBetween(previous, event.latLng) < metersPerPixel() * 4) return;

        drawPoints.current.push(event.latLng);
        addVertexMarker(event.latLng);
        renderPolygonPreview();
      }),
    );

    listeners.push(map.addListener("dblclick", () => finishPolygon()));

    const handleWindowMouseUp = () => finishCircle();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!drawMode.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        stopDrawing();
      } else if (event.key === "Enter" && drawMode.current === "polygon") {
        event.preventDefault();
        finishPolygon();
      }
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    drawControls.current = {
      start: (type) => {
        clearPreview();
        drawMode.current = type;
        setDrawing(type);
        setSelectedId(null);
        map.setOptions({
          // Cirkeln ritas med drag, då får kartan inte panorera samtidigt.
          draggable: type !== "circle",
          disableDoubleClickZoom: type === "polygon",
          draggableCursor: "crosshair",
        });
      },
      cancel: stopDrawing,
    };

    if (centerLat != null && centerLng != null) {
      placeCenter(centerLat, centerLng);
      map.setCenter({ lat: centerLat, lng: centerLng });
    }

    syncOverlays(zonesRef.current, null);
    const overlayMap = overlays.current;

    return () => {
      drawControls.current = null;
      drawMode.current = null;
      listeners.forEach((listener) => listener.remove());
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
      clearPreview();
      if (centerMarker.current) centerMarker.current.setMap(null);
      overlayMap.forEach((overlay) => overlay.setMap(null));
      overlayMap.clear();
    };
  }, [centerLat, centerLng, cityName, fallbackCenter, mapsReady, onChange, placeCenter, syncOverlays]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
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
      setActiveSuggestionIndex(-1);
    } catch {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(value);
    }, 320);
  };

  const selectSuggestion = useCallback(async (placeId: string, description: string) => {
    setSearch(description.split(",")[0]);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
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
    setActiveSuggestionIndex(-1);
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

  const startDraw = (type: "circle" | "polygon") => drawControls.current?.start(type);

  const cancelDraw = () => drawControls.current?.cancel();

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
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[var(--warning-soft)] p-6 text-sm text-[var(--warning-text)]" role="alert">
        Google Maps kunde inte autentiseras. Kontrollera att Maps JavaScript, Places och Geocoding är aktiverade för `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[var(--danger-soft)] p-6 text-sm text-[var(--danger-text)]" role="alert">
        Google Maps kunde inte laddas.
      </div>
    );
  }

  const selectedZone = zones.find((zone) => zone.id === selectedId) || null;
  const responsiveMapHeight = `clamp(420px, 68vh, ${mapHeight}px)`;
  const inspectorStyle = { "--zone-editor-max-height": `${mapHeight}px` } as CSSProperties;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex w-full min-w-0 sm:min-w-[220px] sm:flex-1">
          <div className="flex flex-1 items-center gap-2 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2.5 transition-colors focus-within:border-[var(--accent)]">
            <Search size={14} className="shrink-0 text-[var(--text-muted)]" />
            <label htmlFor={searchInputId} className="sr-only">Sök adress eller stad</label>
            <input
              id={searchInputId}
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && suggestions.length > 0) {
                  event.preventDefault();
                  setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
                } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                  event.preventDefault();
                  setActiveSuggestionIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const activeSuggestion = suggestions[activeSuggestionIndex];
                  if (activeSuggestion) {
                    void selectSuggestion(activeSuggestion.place_id, activeSuggestion.description);
                    return;
                  }
                  setSuggestions([]);
                  geocodeSearch();
                } else if (event.key === "Escape") {
                  setSuggestions([]);
                  setActiveSuggestionIndex(-1);
                }
              }}
              placeholder={cityName ? `Sök adress i ${cityName}` : "Sök stad eller adress"}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              aria-controls={suggestions.length > 0 ? suggestionsId : undefined}
              aria-activedescendant={activeSuggestionIndex >= 0 ? `${suggestionsId}-${activeSuggestionIndex}` : undefined}
              className="flex-1 bg-transparent text-[13px] font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {loadingSuggestions ? <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" aria-hidden /> : null}
            {loadingSuggestions ? <span className="sr-only" role="status">Laddar adressförslag</span> : null}
          </div>
          {suggestions.length > 0 ? (
            <div id={suggestionsId} role="listbox" aria-label="Adressförslag" className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[var(--shadow-lift)]">
              {suggestions.map((suggestion, index) => (
                <button
                  id={`${suggestionsId}-${index}`}
                  key={suggestion.place_id}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => void selectSuggestion(suggestion.place_id, suggestion.description)}
                  className={`flex w-full items-center gap-3 border-b border-[var(--row-divider)] px-4 py-3 text-left transition-colors last:border-none ${index === activeSuggestionIndex ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]"}`}
                >
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

        <Button type="button" onClick={geocodeSearch} disabled={searching || !search.trim() || !mapsReady} loading={searching}>
          {!searching ? <Navigation2 size={14} /> : null} Sätt center
        </Button>

        {drawing ? (
          <Button type="button" variant="danger" onClick={cancelDraw}>
            <X size={14} /> Avbryt
          </Button>
        ) : (
          <>
            <Button type="button" variant="primary" onClick={() => startDraw("circle")} disabled={!mapsReady}>
              <CircleIcon size={14} /> Cirkel
            </Button>
            <Button type="button" onClick={() => startDraw("polygon")} disabled={!mapsReady}>
              <PenLine size={14} /> Polygon
            </Button>
          </>
        )}

        {zones.length > 0 ? (
          <Button type="button" onClick={fitBounds} disabled={!mapsReady}>
            <ZoomIn size={14} /> Anpassa
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-[var(--border-subtle)]" style={{ height: responsiveMapHeight }}>
          {!mapsReady ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--bg-page)]">
              <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
              <span className="text-[11px] font-bold text-[var(--text-muted)]">Laddar Google Maps</span>
            </div>
          ) : null}
          <div ref={mapRef} className="h-full w-full" />
          {drawing ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-center text-[12px] font-extrabold text-white shadow-[var(--shadow-cta)]">
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

        <aside
          className="flex min-w-0 flex-col rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 sm:p-5 xl:max-h-[var(--zone-editor-max-height)] xl:overflow-y-auto"
          style={inspectorStyle}
          aria-label="Zoninställningar"
        >
          {/* Vald zons editor */}
          {selectedZone ? (
            <div className="mb-5">
              <Field label="Zonnamn">
                <Input
                  className="text-[16px] font-extrabold tracking-[-0.3px]"
                  value={selectedZone.name}
                  onChange={(event) => updateZone(selectedZone.id, { name: event.target.value })}
                />
              </Field>

              {selectedZone.type === "circle" ? (
                <div className="mt-4">
                  <Field label="Radie" hint="Cirkelns avstånd från restaurangen.">
                    <NumberInput
                      value={draftRadius[selectedZone.id] ?? String(selectedZone.radiusKm ?? 0)}
                      onValueChange={(raw) => {
                        setDraftRadius((current) => ({ ...current, [selectedZone.id]: raw }));
                        const parsed = parseNumericDraft(raw);
                        if (parsed != null) updateZone(selectedZone.id, { radiusKm: Math.max(0.1, parsed) });
                      }}
                      onBlur={() => {
                        const next = normalizeDraft(draftRadius[selectedZone.id] ?? "", selectedZone.radiusKm ?? 0.1, 0.1);
                        setDraftRadius((current) => ({ ...current, [selectedZone.id]: String(next) }));
                        updateZone(selectedZone.id, { radiusKm: next });
                      }}
                      min={0.1}
                      step={0.1}
                      suffix="km"
                    />
                  </Field>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-[var(--text-muted)]">Polygon med {Math.max((selectedZone.polygon?.length || 1) - 1, 0)} punkter. Dra hörnen på kartan för att ändra formen.</p>
              )}

              <div className="mt-5 grid gap-3 border-t border-[var(--row-divider)] pt-4 sm:grid-cols-3 xl:grid-cols-1">
                <Field label="Leveransavgift">
                  <MoneyInput
                    value={draftFee[selectedZone.id] ?? String(selectedZone.deliveryFee)}
                    onValueChange={(raw) => {
                      setDraftFee((current) => ({ ...current, [selectedZone.id]: raw }));
                      const parsed = parseNumericDraft(raw);
                      if (parsed != null) updateZone(selectedZone.id, { deliveryFee: Math.max(0, parsed) });
                    }}
                    onBlur={() => {
                      const next = normalizeDraft(draftFee[selectedZone.id] ?? "", selectedZone.deliveryFee, 0);
                      setDraftFee((current) => ({ ...current, [selectedZone.id]: String(next) }));
                      updateZone(selectedZone.id, { deliveryFee: next });
                    }}
                    min={0}
                    placeholder="0"
                  />
                </Field>

                <Field label="Minsta ordervärde">
                  <MoneyInput
                    value={draftMin[selectedZone.id] ?? String(selectedZone.minOrder)}
                    onValueChange={(raw) => {
                      setDraftMin((current) => ({ ...current, [selectedZone.id]: raw }));
                      const parsed = parseNumericDraft(raw);
                      if (parsed != null) updateZone(selectedZone.id, { minOrder: Math.max(0, parsed) });
                    }}
                    onBlur={() => {
                      const next = normalizeDraft(draftMin[selectedZone.id] ?? "", selectedZone.minOrder, 0);
                      setDraftMin((current) => ({ ...current, [selectedZone.id]: String(next) }));
                      updateZone(selectedZone.id, { minOrder: next });
                    }}
                    min={0}
                    placeholder="0"
                  />
                </Field>

                <Field label="Leveranstid" optional>
                  <DurationInput
                    value={draftEta[selectedZone.id] ?? (selectedZone.etaMinutes != null ? String(selectedZone.etaMinutes) : "")}
                    onValueChange={(raw) => {
                      setDraftEta((current) => ({ ...current, [selectedZone.id]: raw }));
                      if (!raw.trim()) {
                        updateZone(selectedZone.id, { etaMinutes: undefined });
                        return;
                      }
                      const parsed = parseNumericDraft(raw);
                      if (parsed != null) updateZone(selectedZone.id, { etaMinutes: Math.max(1, Math.round(parsed)) });
                    }}
                    onBlur={() => {
                      const raw = draftEta[selectedZone.id] ?? "";
                      if (!raw.trim()) {
                        setDraftEta((current) => ({ ...current, [selectedZone.id]: "" }));
                        updateZone(selectedZone.id, { etaMinutes: undefined });
                        return;
                      }
                      const next = normalizeDraft(raw, selectedZone.etaMinutes ?? 30, 1, true);
                      setDraftEta((current) => ({ ...current, [selectedZone.id]: String(next) }));
                      updateZone(selectedZone.id, { etaMinutes: next });
                    }}
                    integer
                    min={1}
                    placeholder="–"
                  />
                </Field>
              </div>

              <SwitchField
                className="mt-4 border-t border-[var(--row-divider)] pt-4"
                label="Aktiv zon"
                hint={selectedZone.isActive ? "Zonen används vid leveransberäkning." : "Zonen ignoreras tills den aktiveras."}
                checked={selectedZone.isActive}
                onChange={(isActive) => updateZone(selectedZone.id, { isActive })}
              />

              <Button
                type="button"
                variant="danger"
                onClick={() => removeZone(selectedZone.id)}
                className="mt-4"
              >
                <Trash2 size={14} /> Ta bort zon
              </Button>
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
        </aside>
      </div>

    </div>
  );
}
