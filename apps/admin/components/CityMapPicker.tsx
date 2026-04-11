"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Check, MapPin, PenLine } from "lucide-react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

interface LatLng { lat: number; lng: number; }

interface Props {
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number;
  polygon?: [number, number][] | null; // [[lng, lat], ...]
  onSave: (data: { centerLat: number; centerLng: number; radiusKm?: number; polygon?: [number, number][] }) => void;
}

type DrawMode = "circle" | "polygon";

declare global {
  interface Window { google: any; initCityMap?: () => void; }
}

let mapsLoaded = false;

function loadMapsScript(): Promise<void> {
  if (mapsLoaded || (window.google && window.google.maps)) {
    mapsLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    window.initCityMap = () => { mapsLoaded = true; resolve(); };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=drawing,geometry&callback=initCityMap`;
    s.async = true;
    s.defer = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function CityMapPicker({ centerLat, centerLng, radiusKm = 5, polygon, onSave }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const drawingManager = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<DrawMode>("circle");
  const [savedData, setSavedData] = useState<any>(null);
  const [radiusInput, setRadiusInput] = useState(radiusKm ?? 5);

  const defaultCenter = { lat: centerLat ?? 55.7047, lng: centerLng ?? 13.191 };

  useEffect(() => {
    loadMapsScript().then(() => setReady(true)).catch((e) => console.error("Maps load error:", e));
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const google = window.google;

    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8a9bb0" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d3b" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3a50" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b2a" }] },
      ],
      disableDefaultUI: false,
      zoomControl: true,
    });
    mapInstance.current = map;

    // Drawing manager
    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      circleOptions: {
        fillColor: "#d4a017",
        fillOpacity: 0.15,
        strokeColor: "#d4a017",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
      polygonOptions: {
        fillColor: "#d4a017",
        fillOpacity: 0.15,
        strokeColor: "#d4a017",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
    });
    dm.setMap(map);
    drawingManager.current = dm;

    // If existing data, draw it
    if (centerLat && centerLng) {
      if (polygon && polygon.length > 2) {
        const path = polygon.map(([lng, lat]) => ({ lat, lng }));
        const poly = new google.maps.Polygon({
          paths: path,
          fillColor: "#d4a017",
          fillOpacity: 0.15,
          strokeColor: "#d4a017",
          strokeWeight: 2,
          editable: true,
          map,
        });
        overlayRef.current = poly;
        setSavedData({ type: "polygon", polygon });
        map.setCenter({ lat: centerLat, lng: centerLng });
      } else {
        const circle = new google.maps.Circle({
          center: { lat: centerLat, lng: centerLng },
          radius: (radiusKm ?? 5) * 1000,
          fillColor: "#d4a017",
          fillOpacity: 0.15,
          strokeColor: "#d4a017",
          strokeWeight: 2,
          editable: true,
          map,
        });
        overlayRef.current = circle;
        setSavedData({ type: "circle", centerLat, centerLng, radiusKm });
        map.setCenter({ lat: centerLat, lng: centerLng });
      }
    }

    // Place center marker on map click (for circle mode)
    map.addListener("click", (e: any) => {
      if (mode === "circle") {
        // handled by drawing manager
      }
    });

    // Circle drawn
    google.maps.event.addListener(dm, "circlecomplete", (circle: any) => {
      if (overlayRef.current) overlayRef.current.setMap(null);
      overlayRef.current = circle;
      dm.setDrawingMode(null);
    });

    // Polygon drawn
    google.maps.event.addListener(dm, "polygoncomplete", (poly: any) => {
      if (overlayRef.current) overlayRef.current.setMap(null);
      overlayRef.current = poly;
      dm.setDrawingMode(null);
    });

    return () => {
      dm.setMap(null);
    };
  }, [ready]);

  const startDraw = () => {
    if (!drawingManager.current) return;
    if (overlayRef.current) overlayRef.current.setMap(null);
    overlayRef.current = null;
    const google = window.google;
    drawingManager.current.setDrawingMode(
      mode === "circle"
        ? google.maps.drawing.OverlayType.CIRCLE
        : google.maps.drawing.OverlayType.POLYGON
    );
  };

  const handleSave = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const google = window.google;

    if (mode === "circle" && overlay.getCenter) {
      const center = overlay.getCenter();
      const radius = overlay.getRadius() / 1000;
      const data = { centerLat: center.lat(), centerLng: center.lng(), radiusKm: Math.round(radius * 10) / 10 };
      setSavedData({ type: "circle", ...data });
      onSave(data);
    } else if (mode === "polygon" && overlay.getPath) {
      const path = overlay.getPath().getArray();
      const coords: [number, number][] = path.map((p: any) => [p.lng(), p.lat()]);
      // Close polygon
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
        coords.push(coords[0]);
      }
      const center = google.maps.geometry.spherical.computeDistanceBetween;
      // Compute centroid for centerLat/centerLng
      const lats = coords.map(c => c[1]);
      const lngs = coords.map(c => c[0]);
      const cLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const cLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      const data = { centerLat: cLat, centerLng: cLng, polygon: coords };
      setSavedData({ type: "polygon", ...data });
      onSave(data);
    }
  };

  const handleReset = () => {
    if (overlayRef.current) overlayRef.current.setMap(null);
    overlayRef.current = null;
    setSavedData(null);
  };

  if (!MAPS_KEY) {
    return (
      <div className="aspect-video rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-3 text-center p-10">
        <MapPin size={32} className="text-gold-500 opacity-40" />
        <p className="text-sm font-black text-[var(--text-primary)]">API-nyckel saknas</p>
        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">
          Lägg till NEXT_PUBLIC_GOOGLE_MAPS_KEY i apps/admin/.env.local
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {(["circle", "polygon"] as DrawMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                mode === m ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {m === "circle" ? "🔵 Cirkel" : "🔷 Polygon"}
            </button>
          ))}
        </div>

        {mode === "circle" && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-[var(--text-secondary)]">Radie (km):</span>
            <input
              type="number"
              min={0.5} max={100} step={0.5}
              className="w-20 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-[11px] font-black text-center outline-none focus:border-gold-500/30"
              value={radiusInput}
              onChange={(e) => setRadiusInput(Number(e.target.value))}
            />
          </div>
        )}

        <button
          onClick={startDraw}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-sky-500/20 transition-all"
        >
          <PenLine size={13} /> Rita ny zon
        </button>

        {overlayRef.current && (
          <>
            <button onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-500/20 transition-all">
              <Check size={13} /> Spara zon
            </button>
            <button onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[9px] font-black uppercase tracking-widest rounded-xl hover:text-rose-400 hover:border-rose-500/20 transition-all">
              <RotateCcw size={13} /> Rensa
            </button>
          </>
        )}
      </div>

      {/* Map canvas */}
      <div className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)]" style={{ height: 420 }}>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)] z-10">
            <Loader2 size={24} className="animate-spin text-gold-500" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Saved zone summary */}
      {savedData && (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-3">
          <Check size={14} className="text-emerald-400 shrink-0" />
          <div className="text-[10px] font-bold text-emerald-400">
            {savedData.type === "circle"
              ? `✅ Cirkulär zon sparad: center ${savedData.centerLat?.toFixed(4)}, ${savedData.centerLng?.toFixed(4)} — radie ${savedData.radiusKm} km`
              : `✅ Polygon sparad med ${(savedData.polygon?.length ?? 0) - 1} punkter`}
          </div>
        </div>
      )}

      <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">
        Rita en zon på kartan och tryck "Spara zon". Klicka sedan "Spara ändringar" för att synka med databasen.
      </p>
    </div>
  );
}
