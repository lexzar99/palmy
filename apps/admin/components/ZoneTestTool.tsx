"use client";

/**
 * ZoneTestTool — Admin utility
 *
 * Type any address → geocode via backend proxy → call /api/cities/validate-location
 * → show which zone the address falls in, the delivery fee, and which restaurants cover it.
 *
 * Great for verifying zone configurations are correct before going live.
 */

import { useState, useRef, useCallback } from "react";
import axios from "axios";
import {
  Search, MapPin, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Truck, Store, Package, X,
} from "lucide-react";
import { API_URL } from "@/lib/api";

interface ZoneResult {
  covered: boolean;
  lat: number;
  lng: number;
  cities: Array<{
    id: string;
    name: string;
    zones: string;
    restaurants: Array<{
      id: string;
      name: string;
      deliveryZones?: string;
      deliveryFee?: number;
      minOrderAmount?: number;
    }>;
  }>;
}

const toKr = (v: number | null | undefined) => {
  if (!v) return null;
  return v >= 1000 ? (v / 100).toFixed(0) : String(v);
};

export default function ZoneTestTool() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ZoneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<{ description: string; place_id: string }[]>([]);
  const [loadingPred, setLoadingPred] = useState(false);
  const debRef = useRef<any>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setLoadingPred(true);
    try {
      const res = await fetch(`${API_URL}/api/places/autocomplete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch {
      setPredictions([]);
    } finally {
      setLoadingPred(false);
    }
  }, []);

  const handleInput = (v: string) => {
    setQuery(v);
    setResult(null);
    setError(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchPredictions(v), 320);
  };

  const testAddress = async (placeId: string, description: string) => {
    setQuery(description);
    setPredictions([]);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // 1. Geocode the address
      const geoRes = await fetch(`${API_URL}/api/places/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      });
      const geoData = await geoRes.json();
      if (!geoData.location) throw new Error("Kunde inte hämta koordinater");

      const { lat, lng } = geoData.location;

      // 2. Validate zone
      const zoneRes = await axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng });
      setResult({ ...zoneRes.data, lat, lng });
    } catch (e: any) {
      setError(e?.message || "Testa misslyckades. Försök igen.");
    } finally {
      setLoading(false);
    }
  };

  const getZoneForCoords = (lat: number, lng: number, city: any) => {
    // Parse the city's zones and find which one the coords fall in
    try {
      const zones = typeof city.zones === "string" ? JSON.parse(city.zones) : (city.zones || []);
      if (!Array.isArray(zones) || !city.centerLat || !city.centerLng) return null;
      const R = 6371;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dist = R * 2 * Math.atan2(
        Math.sqrt(
          Math.sin(toRad(lat - city.centerLat) / 2) ** 2 +
          Math.cos(toRad(city.centerLat)) * Math.cos(toRad(lat)) *
          Math.sin(toRad(lng - city.centerLng) / 2) ** 2
        ),
        Math.sqrt(1 - (
          Math.sin(toRad(lat - city.centerLat) / 2) ** 2 +
          Math.cos(toRad(city.centerLat)) * Math.cos(toRad(lat)) *
          Math.sin(toRad(lng - city.centerLng) / 2) ** 2
        ))
      );
      const sorted = [...zones].filter((z: any) => z.isActive !== false).sort((a: any, b: any) => a.radiusKm - b.radiusKm);
      return sorted.find((z: any) => dist <= z.radiusKm) || null;
    } catch {
      return null;
    }
  };

  return (
    <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center text-violet-400">
          <Search size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
            Zontest
          </h2>
          <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.3em] mt-0.5">
            Testa vilken zon en adress faller i
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <div className={`flex items-center gap-3 bg-[var(--bg-primary)] border rounded-2xl px-5 py-4 transition-all ${
          result?.covered === false ? "border-red-500/40" : result?.covered ? "border-emerald-500/40" : "border-[var(--border-subtle)] focus-within:border-violet-500/30"
        }`}>
          {loading || loadingPred
            ? <Loader2 size={16} className="animate-spin text-violet-400 shrink-0" />
            : result?.covered
            ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            : result?.covered === false
            ? <XCircle size={16} className="text-red-400 shrink-0" />
            : <MapPin size={16} className="text-violet-400 shrink-0" />
          }
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Ange en adress för att testa leveranszon…"
            className="flex-1 bg-transparent text-sm font-bold outline-none text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20"
          />
          {query && (
            <button onClick={() => { setQuery(""); setPredictions([]); setResult(null); setError(null); }}>
              <X size={14} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {predictions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden z-50 shadow-2xl">
            {predictions.map((pred, idx) => (
              <button
                key={pred.place_id}
                onClick={() => testAddress(pred.place_id, pred.description)}
                className="w-full text-left px-5 py-3.5 hover:bg-white/5 transition-all flex items-center gap-3 border-b border-[var(--border-subtle)] last:border-none"
              >
                <MapPin size={13} className="text-violet-400 shrink-0" />
                <div>
                  <span className="text-[11px] font-bold text-[var(--text-primary)] block">{pred.description.split(",")[0]}</span>
                  <span className="text-[9px] text-[var(--text-secondary)]">{pred.description.split(",").slice(1).join(",").trim()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm font-bold text-red-400">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-5">
          {/* Covered / Not covered */}
          <div className={`flex items-center gap-4 p-6 rounded-3xl border-2 ${
            result.covered
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-red-500/5 border-red-500/30"
          }`}>
            {result.covered
              ? <CheckCircle2 size={28} className="text-emerald-400 shrink-0" />
              : <XCircle size={28} className="text-red-400 shrink-0" />
            }
            <div>
              <p className={`text-lg font-black uppercase tracking-tight ${result.covered ? "text-emerald-400" : "text-red-400"}`}>
                {result.covered ? "Adressen täcks av leveranszon!" : "Adressen täcks INTE av leveranszon"}
              </p>
              <p className="text-[9px] font-bold text-[var(--text-primary)]/30 uppercase tracking-widest mt-1">
                GPS: {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
              </p>
            </div>
          </div>

          {/* City details */}
          {result.cities.map((city) => {
            const matchedZone = getZoneForCoords(result.lat, result.lng, city);
            return (
              <div key={city.id} className="space-y-4 p-6 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-3xl">
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-sky-400" />
                  <h3 className="text-sm font-black uppercase tracking-widest">{city.name}</h3>
                </div>

                {matchedZone && (
                  <div className="flex flex-wrap gap-3">
                    <div className="px-4 py-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                      <p className="text-[8px] font-black uppercase tracking-widest text-sky-400 mb-0.5">Matchad zon</p>
                      <p className="text-sm font-black text-sky-300">{matchedZone.name} ({matchedZone.radiusKm} km)</p>
                    </div>
                    {matchedZone.fee != null && (
                      <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400 mb-0.5">Leveransavgift</p>
                        <p className="text-sm font-black text-emerald-300">{toKr(matchedZone.fee) || "0"} kr</p>
                      </div>
                    )}
                    {matchedZone.minOrder != null && (
                      <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <p className="text-[8px] font-black uppercase tracking-widest text-amber-400 mb-0.5">Minimiorder</p>
                        <p className="text-sm font-black text-amber-300">{toKr(matchedZone.minOrder) || "0"} kr</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Restaurants */}
                {city.restaurants.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">
                      Restauranger som levererar ({city.restaurants.length})
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {city.restaurants.map((r) => (
                        <div key={r.id} className="px-3 py-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                          <Truck size={11} className="text-emerald-400 shrink-0" />
                          <span className="text-[10px] font-black text-emerald-400 truncate">{r.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {city.restaurants.length === 0 && (
                  <div className="flex items-center gap-2 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                    <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                    <p className="text-xs font-bold text-amber-400">
                      Inga restauranger levererar till den här adressen just nu.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hint */}
      {!result && !loading && !error && (
        <p className="text-[9px] text-[var(--text-primary)]/20 font-bold uppercase tracking-widest text-center">
          Skriv en gatuadress ovan för att se vilken zon den faller i och vilka restauranger som kan leverera dit
        </p>
      )}
    </div>
  );
}
