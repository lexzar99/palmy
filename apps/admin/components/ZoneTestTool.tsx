"use client";

/**
 * ZoneTestTool — Admin zone validator
 *
 * 1. Type any Swedish address → autocomplete → geocode
 * 2. Validates against /api/cities/validate-location
 * 3. Shows which city + zone the address falls in (name, fee, min order)
 * 4. Optional: select a specific restaurant → see that restaurant's zone result
 */

import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import {
  Search, MapPin, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Truck, Store, X, ChevronDown,
  DollarSign, Package, Layers,
} from "lucide-react";
import { API_URL } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Prediction { description: string; place_id: string }

interface ZoneInfo {
  id: string;
  name: string;
  deliveryFee: number; // öre
  minOrder: number;    // öre
}

interface RestaurantResult {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  matchedZone: ZoneInfo | null;
}

interface CityResult {
  id: string;
  name: string;
  matchedZone: ZoneInfo | null;
  restaurants: RestaurantResult[];
}

interface ValidateResult {
  covered: boolean;
  lat: number;
  lng: number;
  cities: CityResult[];
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const kr = (ore: number | null | undefined) =>
  ore != null ? `${(Math.abs(ore) >= 100 ? ore / 100 : ore).toFixed(0)} kr` : "—";

// ── Component ─────────────────────────────────────────────────────────────────
export default function ZoneTestTool() {
  const [query,       setQuery]       = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loadingPred, setLoadingPred] = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [result,      setResult]      = useState<ValidateResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  // Restaurant filter
  const [restaurants, setRestaurants]       = useState<Restaurant[]>([]);
  const [selectedRest, setSelectedRest]     = useState<Restaurant | null>(null);
  const [restDropOpen, setRestDropOpen]     = useState(false);

  const debRef = useRef<any>(null);

  // ── Fetch all restaurants for the selector ────────────────────────────────
  useEffect(() => {
    axios.get(`${API_URL}/api/restaurants`)
      .then(r => setRestaurants(
        (r.data || []).map((r: any) => ({ id: r.id, name: r.name, slug: r.slug }))
      ))
      .catch(() => {});
  }, []);

  // ── Autocomplete ──────────────────────────────────────────────────────────
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
    } catch { setPredictions([]); }
    finally { setLoadingPred(false); }
  }, []);

  const handleInput = (v: string) => {
    setQuery(v); setResult(null); setError(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchPredictions(v), 320);
  };

  // ── Test address ──────────────────────────────────────────────────────────
  const testAddress = async (placeId: string, description: string) => {
    setQuery(description);
    setPredictions([]);
    setTesting(true); setError(null); setResult(null);
    try {
      // Geocode
      const geoRes = await fetch(`${API_URL}/api/places/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      });
      const geoData = await geoRes.json();
      if (!geoData.location) throw new Error("Kunde inte hämta koordinater");

      const { lat, lng } = geoData.location;

      // Zone validation
      const zRes = await axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng });
      setResult({ ...zRes.data, lat, lng });
    } catch (e: any) {
      setError(e?.message || "Valideringen misslyckades. Försök igen.");
    } finally {
      setTesting(false);
    }
  };

  // ── Filter results to selected restaurant (if any) ────────────────────────
  const displayedCities: CityResult[] = result
    ? result.cities.map(city => ({
        ...city,
        restaurants: selectedRest
          ? city.restaurants.filter(r => r.id === selectedRest.id)
          : city.restaurants,
      })).filter(city => !selectedRest || city.restaurants.length > 0)
    : [];

  const hasResult = result !== null;
  const isCovered = result?.covered ?? false;

  return (
    <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center text-violet-400 shrink-0">
          <Layers size={20} />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Adress- & Zonkontroll</h2>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-primary)]/30 mt-0.5">
            Testa vilken zon en adress faller i — per stad och per restaurang
          </p>
        </div>
      </div>

      {/* ── Controls row ── */}
      <div className="flex flex-wrap gap-3">

        {/* Address search */}
        <div className="flex-1 min-w-[240px] relative">
          <div className={`flex items-center gap-3 bg-[var(--bg-primary)] border rounded-2xl px-4 py-3 transition-all ${
            hasResult
              ? isCovered ? "border-emerald-500/40" : "border-red-500/40"
              : "border-[var(--border-subtle)] focus-within:border-violet-500/30"
          }`}>
            {testing
              ? <Loader2 size={15} className="animate-spin text-violet-400 shrink-0" />
              : hasResult
                ? isCovered
                  ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  : <XCircle size={15} className="text-red-400 shrink-0" />
                : <MapPin size={15} className="text-violet-400 shrink-0" />
            }
            <input
              type="text"
              value={query}
              onChange={e => handleInput(e.target.value)}
              placeholder="Ange adress för att testa zon…"
              className="flex-1 bg-transparent text-sm font-bold outline-none text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20"
            />
            {(loadingPred) && <Loader2 size={13} className="animate-spin text-violet-400 shrink-0" />}
            {query && !testing && (
              <button onClick={() => { setQuery(""); setPredictions([]); setResult(null); setError(null); }}>
                <X size={13} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {predictions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden z-50 shadow-2xl">
              {predictions.map(pred => (
                <button key={pred.place_id} onClick={() => testAddress(pred.place_id, pred.description)}
                  className="w-full text-left px-5 py-3 hover:bg-white/5 transition-all flex items-center gap-3 border-b border-[var(--border-subtle)] last:border-none">
                  <MapPin size={12} className="text-violet-400 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold text-[var(--text-primary)] block">{pred.description.split(",")[0]}</span>
                    <span className="text-[9px] text-[var(--text-secondary)]">{pred.description.split(",").slice(1).join(",").trim()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Restaurant filter */}
        <div className="relative">
          <button onClick={() => setRestDropOpen(o => !o)}
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-sm font-bold transition-all whitespace-nowrap ${
              selectedRest
                ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}>
            <Store size={14} />
            {selectedRest ? selectedRest.name : "Alla restauranger"}
            {selectedRest
              ? <X size={13} onClick={e => { e.stopPropagation(); setSelectedRest(null); setRestDropOpen(false); }} className="hover:text-red-400" />
              : <ChevronDown size={13} />
            }
          </button>

          {restDropOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden z-50 shadow-2xl max-h-60 overflow-y-auto">
              <button onClick={() => { setSelectedRest(null); setRestDropOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-[var(--border-subtle)] text-xs font-bold text-[var(--text-secondary)]">
                Alla restauranger
              </button>
              {restaurants.map(r => (
                <button key={r.id} onClick={() => { setSelectedRest(r); setRestDropOpen(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-[var(--border-subtle)] last:border-none text-xs font-bold ${
                    selectedRest?.id === r.id ? "text-sky-400 bg-sky-500/5" : "text-[var(--text-primary)]"
                  }`}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <AlertTriangle size={15} className="text-red-400 shrink-0" />
          <p className="text-sm font-bold text-red-400">{error}</p>
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <div className="space-y-5">

          {/* Coverage verdict */}
          <div className={`flex items-center gap-4 p-5 rounded-3xl border-2 ${
            result.covered
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-red-500/5 border-red-500/30"
          }`}>
            {result.covered
              ? <CheckCircle2 size={26} className="text-emerald-400 shrink-0" />
              : <XCircle     size={26} className="text-red-400 shrink-0" />
            }
            <div>
              <p className={`text-base font-black uppercase tracking-tight ${result.covered ? "text-emerald-400" : "text-red-400"}`}>
                {result.covered ? "Adressen täcks av leveranszon" : "Adressen täcks INTE av någon leveranszon"}
              </p>
              <p className="text-[9px] font-bold text-[var(--text-primary)]/30 uppercase tracking-widest mt-0.5">
                {query.split(",")[0]} · GPS {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
              </p>
            </div>
          </div>

          {/* Per-city breakdown */}
          {displayedCities.length === 0 && result.covered && selectedRest && (
            <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-xs font-bold text-amber-400">
                <strong>{selectedRest.name}</strong> levererar inte till denna adress (restaurangen har egna zoner som inte täcker adressen, eller är inte kopplad till rätt stad).
              </p>
            </div>
          )}

          {displayedCities.map(city => (
            <div key={city.id} className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/50 overflow-hidden">

              {/* City header + city zone */}
              <div className="px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-3 mb-3">
                  <MapPin size={15} className="text-sky-400 shrink-0" />
                  <span className="text-sm font-black uppercase tracking-widest text-sky-400">{city.name}</span>
                </div>

                {city.matchedZone ? (
                  <div className="flex flex-wrap gap-2">
                    {/* Zone name */}
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                      <Layers size={12} className="text-sky-400" />
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-sky-400/70">Stadszon</p>
                        <p className="text-sm font-black text-sky-300">{city.matchedZone.name}</p>
                      </div>
                    </div>
                    {/* Delivery fee */}
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <Truck size={12} className="text-emerald-400" />
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/70">Leveransavgift</p>
                        <p className="text-sm font-black text-emerald-300">{kr(city.matchedZone.deliveryFee)}</p>
                      </div>
                    </div>
                    {/* Min order */}
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <Package size={12} className="text-amber-400" />
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-amber-400/70">Minimiorder</p>
                        <p className="text-sm font-black text-amber-300">{kr(city.matchedZone.minOrder)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-[var(--text-secondary)]">Inga zonregler konfigurerade för denna stad</p>
                )}
              </div>

              {/* Restaurants in this city */}
              {city.restaurants.length > 0 && (
                <div className="p-4 space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-2 mb-2">
                    Restauranger som levererar ({city.restaurants.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {city.restaurants.map(r => (
                      <div key={r.id} className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl space-y-2">
                        {/* Restaurant name */}
                        <div className="flex items-center gap-2">
                          <Store size={13} className="text-gold-500 shrink-0" />
                          <span className="text-[11px] font-black text-[var(--text-primary)] truncate">{r.name}</span>
                          <span className={`ml-auto text-[8px] font-black px-1.5 py-0.5 rounded-full ${r.isOpen ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                            {r.isOpen ? "Öppen" : "Stängd"}
                          </span>
                        </div>

                        {/* Restaurant zone */}
                        {r.matchedZone ? (
                          <div className="grid grid-cols-3 gap-1.5 text-center">
                            <div className="px-2 py-1.5 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                              <p className="text-[7px] font-black uppercase tracking-widest text-sky-400/70">Zon</p>
                              <p className="text-[10px] font-black text-sky-300 truncate">{r.matchedZone.name}</p>
                            </div>
                            <div className="px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                              <p className="text-[7px] font-black uppercase tracking-widest text-emerald-400/70">Avgift</p>
                              <p className="text-[10px] font-black text-emerald-300">{kr(r.matchedZone.deliveryFee)}</p>
                            </div>
                            <div className="px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                              <p className="text-[7px] font-black uppercase tracking-widest text-amber-400/70">Min</p>
                              <p className="text-[10px] font-black text-amber-300">{kr(r.matchedZone.minOrder)}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[9px] font-bold text-[var(--text-secondary)] bg-[var(--bg-primary)] px-3 py-2 rounded-xl">
                            Restaurangens zoner täcker inte denna adress
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {city.restaurants.length === 0 && (
                <div className="px-6 py-4">
                  <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                    <p className="text-[10px] font-bold text-amber-400">Inga öppna restauranger levererar till denna adress just nu.</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !testing && !error && (
        <div className="py-8 text-center border border-dashed border-[var(--border-subtle)] rounded-3xl">
          <MapPin size={24} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-2" />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Ange en adress ovan och välj från listan — systemet visar zon, avgift och vilka restauranger som kan leverera dit
          </p>
        </div>
      )}
    </div>
  );
}
