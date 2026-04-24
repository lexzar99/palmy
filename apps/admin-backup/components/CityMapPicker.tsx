"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader2, RotateCcw, Check, MapPin, PenLine, Search,
  Navigation2, X, Layers, Info, ZoomIn, Target,
} from "lucide-react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

interface DeliveryZone {
  id: string;
  name: string;
  radiusKm: number;
  deliveryFee?: number;
  minOrder?: number;
  isActive?: boolean;
}

interface Props {
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number;
  polygon?: [number, number][] | null; // [[lng, lat], ...]
  zones?: DeliveryZone[];
  onSave: (data: {
    centerLat: number;
    centerLng: number;
    radiusKm?: number;
    polygon?: [number, number][];
  }) => void;
  onCenterChange?: (lat: number, lng: number) => void;
}

type DrawMode = "none" | "polygon";

// Foodora-style zone colors (innermost = green, outward = warmer/danger)
const ZONE_COLORS = [
  { fill: "#22c55e", stroke: "#16a34a", label: "Nära" },
  { fill: "#84cc16", stroke: "#65a30d", label: "Kort" },
  { fill: "#f59e0b", stroke: "#d97706", label: "Medel" },
  { fill: "#f97316", stroke: "#ea580c", label: "Långt" },
  { fill: "#ef4444", stroke: "#dc2626", label: "Max" },
  { fill: "#8b5cf6", stroke: "#7c3aed", label: "Extrem" },
];

declare global {
  interface Window { google: any; initCityMap?: () => void; }
}

let mapsScriptLoading = false;
let mapsScriptResolvers: Array<() => void> = [];
let mapsScriptRejectors: Array<(e: Error) => void> = [];
let mapsLoaded = false;

function loadMapsScript(): Promise<void> {
  if (mapsLoaded || (typeof window !== "undefined" && window.google?.maps)) {
    mapsLoaded = true;
    return Promise.resolve();
  }
  if (mapsScriptLoading) {
    return new Promise((res, rej) => {
      mapsScriptResolvers.push(res);
      mapsScriptRejectors.push(rej);
    });
  }
  mapsScriptLoading = true;
  return new Promise((resolve, reject) => {
    mapsScriptResolvers.push(resolve);
    mapsScriptRejectors.push(reject);

    window.initCityMap = () => {
      mapsLoaded = true;
      mapsScriptLoading = false;
      mapsScriptResolvers.forEach(r => r());
      mapsScriptResolvers = [];
      mapsScriptRejectors = [];
    };

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=drawing,geometry&callback=initCityMap`;
    s.async = true;
    s.defer = true;
    s.onerror = (e) => {
      mapsScriptLoading = false;
      mapsScriptRejectors.forEach(r => r(new Error("Maps failed to load")));
      mapsScriptResolvers = [];
      mapsScriptRejectors = [];
      reject(e);
    };
    document.head.appendChild(s);
  });
}

export default function CityMapPicker({
  centerLat,
  centerLng,
  radiusKm = 5,
  polygon,
  zones = [],
  onSave,
  onCenterChange,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const drawingManager = useRef<any>(null);
  const polygonOverlay = useRef<any>(null);
  const centerMarker = useRef<any>(null);
  const zoneOverlays = useRef<any[]>([]);
  const infoWindows = useRef<any[]>([]);

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<DrawMode>("none");
  const [currentCenter, setCurrentCenter] = useState<{ lat: number; lng: number } | null>(
    centerLat && centerLng ? { lat: centerLat, lng: centerLng } : null
  );
  const [hasSaved, setHasSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const defaultCenter = { lat: centerLat ?? 55.7047, lng: centerLng ?? 13.191 };

  // ── Load Maps SDK ────────────────────────────────────────────────
  useEffect(() => {
    loadMapsScript()
      .then(() => setReady(true))
      .catch(() => setLoadError(true));
  }, []);

  // ── Draw zone circles ─────────────────────────────────────────────
  const renderZoneCircles = useCallback((center: { lat: number; lng: number } | null) => {
    if (!mapInstance.current || !center) return;
    const google = window.google;

    // Clear previous circles + labels
    zoneOverlays.current.forEach(o => o.setMap(null));
    infoWindows.current.forEach(w => w.close());
    zoneOverlays.current = [];
    infoWindows.current = [];

    const active = [...zones]
      .filter(z => z.isActive !== false && z.radiusKm > 0)
      .sort((a, b) => b.radiusKm - a.radiusKm); // largest first so smallest on top

    active.forEach((zone, i) => {
      const colorIdx = active.length - 1 - i; // innermost gets index 0 (green)
      const color = ZONE_COLORS[Math.min(colorIdx, ZONE_COLORS.length - 1)];

      const circle = new google.maps.Circle({
        center: { lat: center.lat, lng: center.lng },
        radius: zone.radiusKm * 1000,
        fillColor: color.fill,
        fillOpacity: 0.09,
        strokeColor: color.stroke,
        strokeOpacity: 0.75,
        strokeWeight: 2,
        map: mapInstance.current,
        zIndex: i + 1,
      });
      zoneOverlays.current.push(circle);

      // Zone label at the top edge of the circle
      const labelPos = google.maps.geometry.spherical.computeOffset(
        new google.maps.LatLng(center.lat, center.lng),
        zone.radiusKm * 1000 * 0.97,
        0 // north
      );

      const iw = new google.maps.InfoWindow({
        content: `<div style="background:#1a1a2e;color:${color.stroke};padding:4px 10px;border-radius:8px;font-size:11px;font-weight:900;font-family:monospace;border:1px solid ${color.stroke}40;white-space:nowrap;">${zone.name} — ${zone.radiusKm}km${zone.deliveryFee ? ` • ${(zone.deliveryFee / 100).toFixed(0)}kr` : ""}</div>`,
        position: labelPos,
        disableAutoPan: true,
        pixelOffset: new google.maps.Size(0, 15),
      });
      iw.open(mapInstance.current);
      infoWindows.current.push(iw);
    });
  }, [zones]);

  // ── Place draggable center marker ────────────────────────────────
  const placeCenter = useCallback((lat: number, lng: number, notifyParent = true) => {
    if (!mapInstance.current) return;
    const google = window.google;

    if (centerMarker.current) centerMarker.current.setMap(null);

    centerMarker.current = new google.maps.Marker({
      position: { lat, lng },
      map: mapInstance.current,
      draggable: true,
      cursor: "grab",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: "#d4a017",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
      title: "Stadens centrum — dra för att flytta",
      zIndex: 2000,
    });

    centerMarker.current.addListener("dragend", (e: any) => {
      const newLat = e.latLng.lat();
      const newLng = e.latLng.lng();
      setCurrentCenter({ lat: newLat, lng: newLng });
      if (onCenterChange) onCenterChange(newLat, newLng);
      renderZoneCircles({ lat: newLat, lng: newLng });
    });

    const center = { lat, lng };
    setCurrentCenter(center);
    renderZoneCircles(center);
    if (notifyParent && onCenterChange) onCenterChange(lat, lng);
  }, [onCenterChange, renderZoneCircles]);

  // ── Initialize map ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const google = window.google;

    const map = new google.maps.Map(mapRef.current, {
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
        { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
      ],
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "cooperative",
    });
    mapInstance.current = map;

    // Drawing manager (polygon only — circles are shown automatically from zone table)
    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        fillColor: "#d4a017",
        fillOpacity: 0.12,
        strokeColor: "#d4a017",
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        editable: true,
        draggable: true,
      },
    });
    dm.setMap(map);
    drawingManager.current = dm;

    // Click on map → set/move center
    map.addListener("click", (e: any) => {
      if (mode === "polygon") return; // Don't set center while drawing
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      placeCenter(lat, lng);
      map.setCenter({ lat, lng });
    });

    // Polygon drawn
    google.maps.event.addListener(dm, "polygoncomplete", (poly: any) => {
      if (polygonOverlay.current) polygonOverlay.current.setMap(null);
      polygonOverlay.current = poly;
      dm.setDrawingMode(null);
      setMode("none");
      setHasPolygon(true);
    });

    // Restore existing center
    if (centerLat && centerLng) {
      placeCenter(centerLat, centerLng, false);
      map.setCenter({ lat: centerLat, lng: centerLng });
    }

    // Restore existing polygon
    if (polygon && polygon.length > 2) {
      const path = polygon.map(([lng, lat]) => ({ lat, lng }));
      const poly = new google.maps.Polygon({
        paths: path,
        fillColor: "#d4a017",
        fillOpacity: 0.12,
        strokeColor: "#d4a017",
        strokeWeight: 2.5,
        editable: true,
        map,
      });
      polygonOverlay.current = poly;
      setHasPolygon(true);
    }

    return () => {
      dm.setMap(null);
      zoneOverlays.current.forEach(o => o.setMap(null));
      infoWindows.current.forEach(w => w.close());
    };
     
  }, [ready]);

  // Re-draw zone circles whenever zones or center changes
  useEffect(() => {
    if (!ready || !mapInstance.current) return;
    const center = currentCenter ?? (centerLat && centerLng ? { lat: centerLat, lng: centerLng } : null);
    renderZoneCircles(center);
  }, [zones, currentCenter, centerLat, centerLng, ready, renderZoneCircles]);

  // ── Geocode city search ───────────────────────────────────────────
  const geocodeCity = async () => {
    if (!searchQuery.trim() || !mapInstance.current) return;
    setIsSearching(true);
    try {
      const google = window.google;
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(
        { address: `${searchQuery.trim()}, Sverige`, region: "SE" },
        (results: any[], status: string) => {
          if (status === "OK" && results[0]) {
            const loc = results[0].geometry.location;
            const lat = loc.lat();
            const lng = loc.lng();
            mapInstance.current.setCenter({ lat, lng });
            mapInstance.current.setZoom(12);
            placeCenter(lat, lng);
          }
          setIsSearching(false);
        }
      );
    } catch {
      setIsSearching(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = () => {
    const center = currentCenter ?? (centerLat && centerLng ? { lat: centerLat, lng: centerLng } : null);
    if (!center) return;

    if (polygonOverlay.current && polygonOverlay.current.getPath) {
      const path = polygonOverlay.current.getPath().getArray();
      const coords: [number, number][] = path.map((p: any) => [p.lng(), p.lat()]);
      if (
        coords.length > 0 &&
        (coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1])
      ) {
        coords.push(coords[0]);
      }
      onSave({ centerLat: center.lat, centerLng: center.lng, polygon: coords });
    } else {
      onSave({ centerLat: center.lat, centerLng: center.lng });
    }
    setHasSaved(true);
    setTimeout(() => setHasSaved(false), 3000);
  };

  // ── Clear polygon ─────────────────────────────────────────────────
  const clearPolygon = () => {
    if (polygonOverlay.current) polygonOverlay.current.setMap(null);
    polygonOverlay.current = null;
    setHasPolygon(false);
  };

  // ── Start drawing polygon ─────────────────────────────────────────
  const startPolygonDraw = () => {
    if (!drawingManager.current) return;
    clearPolygon();
    const google = window.google;
    drawingManager.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    setMode("polygon");
  };

  // ── Fit map to show all zones ─────────────────────────────────────
  const fitToZones = () => {
    if (!mapInstance.current || !currentCenter) return;
    const google = window.google;
    const maxRadius = Math.max(...zones.map(z => z.radiusKm), 5);
    const bounds = new google.maps.Circle({
      center: currentCenter,
      radius: maxRadius * 1000,
    }).getBounds();
    if (bounds) mapInstance.current.fitBounds(bounds);
  };

  // ── Load error fallback ───────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center gap-4 text-center p-10" style={{ height: 500 }}>
        <MapPin size={32} className="text-red-400 opacity-60" />
        <div className="space-y-2">
          <p className="text-sm font-black text-red-400">Kunde inte ladda Google Maps</p>
          <p className="text-[10px] text-red-400/60 font-bold leading-relaxed">
            {!MAPS_KEY
              ? "API-nyckel saknas – lägg till NEXT_PUBLIC_GOOGLE_MAPS_KEY i apps/admin/.env.local och starta om servern."
              : "Kontrollera att Maps JavaScript API är aktiverat i Google Cloud Console, och att nyckeln saknar restriktioner som blockerar admin-domänen."}
          </p>
          {!MAPS_KEY && (
            <code className="block mt-3 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-mono text-red-400">
              NEXT_PUBLIC_GOOGLE_MAPS_KEY=din_nyckel_här
            </code>
          )}
        </div>
      </div>
    );
  }

  const activeZoneCount = zones.filter(z => z.isActive !== false && z.radiusKm > 0).length;
  const sortedZones = [...zones]
    .filter(z => z.isActive !== false && z.radiusKm > 0)
    .sort((a, b) => a.radiusKm - b.radiusKm);

  return (
    <div className="space-y-4">
      {/* ── City Search ── */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 focus-within:border-gold-500/40 transition-all">
          <Search size={14} className="text-[var(--text-secondary)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && geocodeCity()}
            placeholder="Sök stad eller adress för att sätta centrum..."
            className="flex-1 bg-transparent text-xs font-bold outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={geocodeCity}
          disabled={isSearching || !searchQuery.trim() || !ready}
          className="flex items-center gap-2 px-4 py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-[#0d0d0d] text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-gold-500/20"
        >
          {isSearching ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Navigation2 size={13} />
          )}
          Hitta
        </button>
      </div>

      {/* ── Controls Row ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-xl">
          <Target size={12} className="text-gold-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Klicka på kartan för att sätta centrum
          </span>
        </div>

        <button
          onClick={startPolygonDraw}
          className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
            mode === "polygon"
              ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
              : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-sky-400 hover:border-sky-500/30"
          }`}
        >
          <PenLine size={12} />
          {mode === "polygon" ? "Rita pågår…" : "Rita leveransgräns"}
        </button>

        {hasPolygon && (
          <button
            onClick={clearPolygon}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-primary)] border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500/10 transition-all"
          >
            <RotateCcw size={12} /> Rensa gräns
          </button>
        )}

        {currentCenter && (
          <button
            onClick={fitToZones}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest rounded-xl hover:text-[var(--text-primary)] transition-all"
          >
            <ZoomIn size={12} /> Anpassa vy
          </button>
        )}

        {currentCenter && (
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg transition-all ${
              hasSaved
                ? "bg-emerald-500 text-white shadow-emerald-500/30"
                : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20"
            }`}
          >
            <Check size={12} />
            {hasSaved ? "Sparat!" : "Spara position"}
          </button>
        )}
      </div>

      {/* ── Zone Legend ── */}
      {activeZoneCount > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-[var(--bg-primary)]/50 rounded-2xl border border-[var(--border-subtle)]">
          <div className="w-full flex items-center gap-2 mb-1">
            <Layers size={11} className="text-[var(--text-secondary)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Leveranszoner ({activeZoneCount})</span>
          </div>
          {sortedZones.map((zone, i) => {
            const color = ZONE_COLORS[Math.min(i, ZONE_COLORS.length - 1)];
            return (
              <div
                key={zone.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
                style={{
                  borderColor: color.stroke + "50",
                  backgroundColor: color.fill + "18",
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full border border-current"
                  style={{ backgroundColor: color.fill, borderColor: color.stroke }}
                />
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: color.stroke }}
                >
                  {zone.name} • {zone.radiusKm} km
                  {zone.deliveryFee ? ` • ${(zone.deliveryFee / 100).toFixed(0)} kr` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Map Canvas ── */}
      <div
        className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)]"
        style={{ height: 500 }}
      >
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] z-10">
            <Loader2 size={28} className="animate-spin text-gold-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Laddar Google Maps…
            </span>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Drawing mode overlay hint */}
        {mode === "polygon" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-5 py-2.5 bg-sky-500/95 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-sky-500/30 pointer-events-none">
            Klicka för punkter — dubbelklicka för att avsluta polygon
          </div>
        )}

        {/* Center info overlay */}
        {currentCenter && (
          <div className="absolute bottom-4 left-4 z-10 px-4 py-2.5 bg-[var(--bg-primary)]/90 backdrop-blur-sm border border-gold-500/30 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gold-400">
                Centrum: {currentCenter.lat.toFixed(5)}, {currentCenter.lng.toFixed(5)}
              </span>
            </div>
          </div>
        )}

        {/* No center hint */}
        {!currentCenter && ready && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none text-center">
            <div className="px-5 py-3 bg-[var(--bg-primary)]/80 backdrop-blur-sm border border-[var(--border-subtle)] rounded-2xl">
              <MapPin size={20} className="text-gold-500 mx-auto mb-1" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                Klicka på kartan för att sätta stadens centrum
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Info footer ── */}
      <div className="flex items-start gap-3 p-4 bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)] rounded-2xl">
        <Info size={13} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
        <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wide leading-relaxed">
          Klicka på kartan för att sätta centrum · Dra guldmarkören för att flytta · Cirklar genereras automatiskt från zon-tabellen nedan · Rita polygon för en anpassad leveransgräns · Tryck "Spara position" och sedan "Spara ändringar" för att synka med databasen.
        </p>
      </div>
    </div>
  );
}
