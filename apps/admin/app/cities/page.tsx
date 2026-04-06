"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { 
  MapPin, Trash2, Plus, Check, X, Bike, Store, Navigation, Layers, Info,
  ShieldCheck, ChevronRight, Loader2, Save, Globe, DollarSign, Target
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DeliveryZone {
  id: string;
  name: string;
  radiusKm: number;
  deliveryFee: number;
  minOrder: number;
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  deliveryZones?: string | DeliveryZone[];
  freeDeliveryAbove?: number;
}

interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
  zones: string | DeliveryZone[];
  latitude: number | null;
  longitude: number | null;
  freeDeliveryAbove: number;
  restaurants: Restaurant[];
}

import { API_URL } from "@/lib/api";

const getZones = (city: City): DeliveryZone[] => {
  if (!city.zones) return [];
  return typeof city.zones === 'string' ? JSON.parse(city.zones || '[]') : city.zones;
};

const CitiesPage = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const selectedCity = cities.find(c => c.id === selectedCityId);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddCityModal, setShowAddCityModal] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [editingRestaurantId, setEditingRestaurantId] = useState<string | null>(null);
  const selectedRestaurant = selectedCity?.restaurants?.find(r => r.id === editingRestaurantId);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("matgo_token") || "";
      const [citiesRes, restRes] = await Promise.all([
        axios.get(`${API_URL}/api/cities?all=true`),
        axios.get(`${API_URL}/api/restaurants`),
      ]);
      setCities(citiesRes.data);
      setAllRestaurants(restRes.data);
      if (citiesRes.data.length > 0 && (!selectedCityId || !citiesRes.data.find((c: City) => c.id === selectedCityId))) {
        setSelectedCityId(citiesRes.data[0].id);
      }
    } catch (err) {
      console.error("Cities fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCityId]);

  useEffect(() => { fetchData(); }, []);

  const handleAddCity = async () => {
    if (!newCityName.trim()) return;
    try {
      setIsSaving(true);
      const res = await axios.post(`${API_URL}/api/cities`, {
        name: newCityName,
        slug: newCityName.toLowerCase().replace(/\s+/g, "-"),
        deliveryMode: "ALL",
        zones: [],
        isActive: true
      });
      setCities([...cities, res.data]);
      setSelectedCityId(res.data.id);
      setNewCityName("");
      setShowAddCityModal(false);
    } catch (err) {
      alert("Kunde inte skapa stad");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCity) return;
    setIsSaving(true);
    try {
      const zones = getZones(selectedCity);
      const restaurantIds = (selectedCity.restaurants || []).map(r => r.id);
      
      // Collect all restaurant specific zones and delivery settings
      const restaurantZones: Record<string, any> = {};
      selectedCity.restaurants?.forEach(r => {
        restaurantZones[r.id] = {
          zones: typeof r.deliveryZones === 'string' ? r.deliveryZones : JSON.stringify(r.deliveryZones || []),
          freeDeliveryAbove: r.freeDeliveryAbove
        };
      });

      await axios.post(`${API_URL}/api/cities`, {
        id: selectedCity.id,
        name: selectedCity.name,
        slug: selectedCity.slug,
        deliveryMode: selectedCity.deliveryMode,
        isActive: selectedCity.isActive,
        latitude: selectedCity.latitude,
        longitude: selectedCity.longitude,
        freeDeliveryAbove: selectedCity.freeDeliveryAbove,
        zones: JSON.stringify(zones),
        restaurantIds,
        restaurantZones,
      });
      setTimeout(() => setIsSaving(false), 1200);
    } catch (err) {
      console.error("Save error:", err);
      alert("Kunde inte spara ändringar.");
      setIsSaving(false);
    }
  };

  const handleDeleteCity = async (id: string) => {
    if (!confirm("Radera staden permanent?")) return;
    try {
      await axios.delete(`${API_URL}/api/cities/${id}`);
      setCities(cities.filter(c => c.id !== id));
      if (selectedCityId === id) setSelectedCityId(null);
    } catch { alert("Kunde inte radera"); }
  };

  const updateCity = (field: string, value: any) => {
    if (!selectedCityId) return;
    setCities(cities.map(c => c.id === selectedCityId ? { ...c, [field]: value } : c));
  };

  const addZone = () => {
    if (!selectedCityId) return;
    const newZone: DeliveryZone = {
      id: Math.random().toString(36).slice(2),
      name: "Ny Zon",
      radiusKm: 5,
      deliveryFee: 39,
      minOrder: 200
    };

    setCities(cities.map(c => {
      if (c.id !== selectedCityId) return c;
      
      if (editingRestaurantId) {
        return {
          ...c,
          restaurants: (c.restaurants || []).map(r => {
            if (r.id !== editingRestaurantId) return r;
            const current = typeof r.deliveryZones === 'string' ? JSON.parse(r.deliveryZones || '[]') : (r.deliveryZones || []);
            return { ...r, deliveryZones: [...current, newZone] };
          })
        };
      }

      const current = getZones(c);
      return { ...c, zones: [...current, newZone] as any };
    }));
  };

  const updateZone = (zoneId: string, field: keyof DeliveryZone, value: any) => {
    if (!selectedCityId) return;
    setCities(cities.map(c => {
      if (c.id !== selectedCityId) return c;
      
      if (editingRestaurantId) {
        return {
          ...c,
          restaurants: (c.restaurants || []).map(r => {
            if (r.id !== editingRestaurantId) return r;
            const zones = typeof r.deliveryZones === 'string' ? JSON.parse(r.deliveryZones || '[]') : (r.deliveryZones || []);
            return { ...r, deliveryZones: zones.map((z: DeliveryZone) => z.id === zoneId ? { ...z, [field]: value } : z) };
          })
        };
      }

      const zones = getZones(c);
      return { ...c, zones: zones.map(z => z.id === zoneId ? { ...z, [field]: value } : z) as any };
    }));
  };

  const removeZone = (zoneId: string) => {
    if (!selectedCityId) return;
    setCities(cities.map(c => {
      if (c.id !== selectedCityId) return c;
      
      if (editingRestaurantId) {
        return {
          ...c,
          restaurants: (c.restaurants || []).map(r => {
            if (r.id !== editingRestaurantId) return r;
            const zones = typeof r.deliveryZones === 'string' ? JSON.parse(r.deliveryZones || '[]') : (r.deliveryZones || []);
            return { ...r, deliveryZones: zones.filter((z: DeliveryZone) => z.id !== zoneId) };
          })
        };
      }

      return { ...c, zones: getZones(c).filter(z => z.id !== zoneId) as any };
    }));
  };

  const updateRestaurantSetting = (restaurantId: string, field: string, value: any) => {
    setCities(cities.map(c => {
      if (c.id !== selectedCityId) return c;
      return {
        ...c,
        restaurants: (c.restaurants || []).map(r => r.id === restaurantId ? { ...r, [field]: value } : r)
      };
    }));
  };

  const toggleRestaurant = (restaurantId: string) => {
    if (!selectedCityId) return;
    setCities(cities.map(c => {
      if (c.id !== selectedCityId) return c;
      const linked = c.restaurants || [];
      const exists = linked.some(r => r.id === restaurantId);
      if (exists) {
        return { ...c, restaurants: linked.filter(r => r.id !== restaurantId) };
      } else {
        const full = allRestaurants.find(r => r.id === restaurantId);
        if (!full) return c;
        return { ...c, restaurants: [...linked, full] };
      }
    }));
  };

  const activeZones = editingRestaurantId 
    ? (typeof selectedRestaurant?.deliveryZones === 'string' ? JSON.parse(selectedRestaurant?.deliveryZones || '[]') : (selectedRestaurant?.deliveryZones || []))
    : (selectedCity ? getZones(selectedCity) : []);

  const linkedIds = selectedCity ? (selectedCity.restaurants || []).map(r => r.id) : [];

  return (
    <div className="space-y-10 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-sky-500/10 rounded-[1.8rem] border border-sky-500/20 flex items-center justify-center text-sky-500">
             <Globe size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-1">Stadshantering</h1>
            <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.4em]">Hantera zoner, räckvidd, restauranger och leveranslägen</p>
          </div>
        </div>
        <button 
          onClick={() => setShowAddCityModal(true)}
          className="flex items-center gap-3 px-8 py-4 bg-[var(--border-subtle)] hover:bg-white/10 text-[var(--text-primary)] rounded-2xl font-black uppercase tracking-widest text-xs transition-all border border-[var(--border-subtle)]"
        >
          <Plus size={18} />
          Lägg till Stad
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px,1fr] gap-10">
        {/* City List Sidebar */}
        <div className="space-y-4">
          <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[2.5rem] p-6 space-y-3">
             <div className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-primary)]/20 italic">Aktiva Städer</div>
             {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text-primary)]/10" /></div> : cities.map(city => (
               <div key={city.id} className="relative group/item">
                 <button
                   onClick={() => setSelectedCityId(city.id)}
                   className={`w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${
                     selectedCityId === city.id ? "bg-sky-500/10 border-sky-500/40" : "bg-[var(--border-subtle)] border-transparent hover:bg-white/10"
                   }`}
                 >
                   <div className="text-left">
                      <div className="text-lg font-black uppercase tracking-tight mb-1 flex items-center gap-2">
                        {city.name}
                        {!city.isActive && <span className="text-[8px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-black">INAKTIV</span>}
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 flex items-center gap-2">
                         {city.deliveryMode === "ALL" ? "Full Service" : city.deliveryMode === "ONLY_DELIVERY" ? "Endast Utkörning" : "Endast Avhämtning"}
                         <span className="text-[var(--text-primary)]/10">·</span>
                         <span>{(city.restaurants || []).length} restauranger</span>
                         <span className="text-[var(--text-primary)]/10">·</span>
                         <span>{getZones(city).length} zoner</span>
                      </div>
                   </div>
                   <ChevronRight size={18} className={selectedCityId === city.id ? "text-sky-500" : "text-[var(--text-primary)]/10"} />
                 </button>
                 <button 
                   onClick={() => handleDeleteCity(city.id)}
                   className="absolute top-4 right-4 opacity-0 group-hover/item:opacity-100 p-2 text-red-500 hover:scale-110 transition-all"
                 >
                   <Trash2 size={14} />
                 </button>
               </div>
             ))}
          </div>

          <div className="bg-sky-500/5 border border-sky-500/10 rounded-[2.5rem] p-8 space-y-4">
             <div className="flex items-center gap-3 text-sky-400">
                <Info size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Så fungerar zoner</span>
             </div>
             <p className="text-[10px] text-[var(--text-primary)]/40 leading-relaxed uppercase font-bold">
               Varje stad har en GPS-mittpunkt och radiuszoner. Kunder utanför alla zoner kan inte beställa leverans. Avgift och minimiorder sätts per zon.
             </p>
          </div>
        </div>

        {/* Main Content: City Settings */}
        <AnimatePresence mode="wait">
          {selectedCity ? (
            <motion.div
              key={selectedCity.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
               {/* Mode Selection */}
               <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 space-y-10">
                  <div className="flex items-center justify-between">
                     <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                           <ShieldCheck className="text-sky-500" size={28} />
                           {selectedCity.name}
                        </h2>
                        <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Övergripande regler för staden</p>
                     </div>
                     <div className="flex items-center gap-3 p-1.5 bg-dark-500 border border-[var(--border-subtle)] rounded-2xl">
                        <button 
                          onClick={() => updateCity('isActive', true)}
                          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedCity.isActive ? "bg-emerald-500 text-white" : "text-[var(--text-primary)]/20 hover:text-[var(--text-primary)]/40"}`}
                        >
                          Aktiv
                        </button>
                        <button 
                          onClick={() => updateCity('isActive', false)}
                          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!selectedCity.isActive ? "bg-red-500 text-white" : "text-[var(--text-primary)]/20 hover:text-[var(--text-primary)]/40"}`}
                        >
                          Inaktiv
                        </button>
                     </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-6">
                     {[
                       { id: "ALL", label: "Full Service", desc: "Utkörning + Avhämtning", icon: Navigation },
                       { id: "ONLY_DELIVERY", label: "Endast Utkörning", desc: "Ingen avhämtning", icon: Bike },
                       { id: "ONLY_PICKUP", label: "Endast Avhämtning", desc: "Ingen utkörning", icon: Store },
                     ].map(mode => (
                       <button
                         key={mode.id}
                         onClick={() => updateCity('deliveryMode', mode.id)}
                         className={`p-8 rounded-[2.5rem] border-2 text-left transition-all flex flex-col gap-4 ${
                           selectedCity.deliveryMode === mode.id ? "bg-sky-500/10 border-sky-500/40" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                         }`}
                       >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selectedCity.deliveryMode === mode.id ? "bg-sky-500 text-white" : "bg-[var(--border-subtle)] text-[var(--text-primary)]/30"}`}>
                             <mode.icon size={24} />
                          </div>
                          <div>
                             <div className="font-black uppercase tracking-widest text-xs mb-1">{mode.label}</div>
                             <div className="text-[10px] font-bold text-[var(--text-primary)]/20 uppercase tracking-wide">{mode.desc}</div>
                          </div>
                       </button>
                     ))}
                  </div>
               </div>

               {/* GPS Center & Delivery Settings */}
               <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 space-y-10">
                  <div>
                     <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                        <Target className="text-emerald-500" size={28} />
                        GPS & Leveransregler
                     </h2>
                     <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Stadens mittpunkt för radie-beräkning</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-8">
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Latitude (GPS)</label>
                        <input 
                          type="number" step="any"
                          className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono text-sm" 
                          value={selectedCity.latitude || ""}
                          onChange={(e) => updateCity('latitude', parseFloat(e.target.value) || null)}
                          placeholder="t.ex. 55.70"
                        />
                     </div>
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Longitude (GPS)</label>
                        <input 
                          type="number" step="any"
                          className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono text-sm" 
                          value={selectedCity.longitude || ""}
                          onChange={(e) => updateCity('longitude', parseFloat(e.target.value) || null)}
                          placeholder="t.ex. 13.19"
                        />
                     </div>
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Gratis leverans över (kr)</label>
                        <input 
                          type="number"
                          className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-emerald-500/30 font-bold text-sm text-emerald-500" 
                          value={selectedCity.freeDeliveryAbove || 0}
                          onChange={(e) => updateCity('freeDeliveryAbove', parseInt(e.target.value) || 0)}
                          placeholder="0 = ej gratis"
                        />
                     </div>
                  </div>

                  {selectedCity.latitude && selectedCity.longitude && (
                    <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl flex items-center gap-4">
                      <MapPin className="text-emerald-500 shrink-0" size={20} />
                      <p className="text-xs font-bold text-emerald-400">
                        GPS-center: {selectedCity.latitude.toFixed(4)}, {selectedCity.longitude.toFixed(4)} — 
                        Alla zoner beräknas som radie från denna punkt.
                      </p>
                    </div>
                  )}
               </div>

               {/* Linked Restaurants */}
               <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 space-y-10">
                  <div>
                     <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                        <Store className="text-gold-500" size={28} />
                        Kopplade Restauranger
                     </h2>
                     <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Vilka restauranger som levererar i {selectedCity.name}</p>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {allRestaurants.map(r => {
                       const isLinked = linkedIds.includes(r.id);
                       const cityRestaurant = selectedCity.restaurants?.find(cr => cr.id === r.id);
                       
                       return (
                         <div
                           key={r.id}
                           className={`p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${
                             isLinked 
                               ? "bg-gold-500/10 border-gold-500/40" 
                               : "bg-[var(--border-subtle)] border-transparent hover:border-[var(--border-strong)]"
                           }`}
                         >
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => toggleRestaurant(r.id)}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                                  isLinked ? "bg-gold-500 border-gold-500 text-dark-500" : "bg-[var(--border-subtle)] border-[var(--border-strong)] text-[var(--text-primary)]/20"
                                }`}
                              >
                                {isLinked ? <Check size={18} /> : <Plus size={18} />}
                              </button>
                              <div className="flex-1 min-w-0">
                                 <div className="text-sm font-black uppercase tracking-tight truncate">{r.name}</div>
                                 <div className="text-[9px] font-bold text-[var(--text-primary)]/20 uppercase tracking-widest">
                                   {r.isOpen ? "🟢 Öppen" : "⚪ Stängd"}
                                 </div>
                              </div>
                            </div>
                            
                            {isLinked && (
                              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                 <button
                                   onClick={() => setEditingRestaurantId(editingRestaurantId === r.id ? null : r.id)}
                                   className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                     editingRestaurantId === r.id ? "bg-sky-500 text-white" : "bg-white/5 text-zinc-500 hover:text-white"
                                   }`}
                                 >
                                   <Layers size={12} />
                                   {editingRestaurantId === r.id ? "Sluta ändra" : "Ändra zoner"}
                                 </button>
                              </div>
                            )}
                         </div>
                       );
                     })}
                     {allRestaurants.length === 0 && (
                       <div className="col-span-full py-10 text-center opacity-20 font-black text-xs uppercase tracking-widest border border-dashed border-white/10 rounded-3xl">
                         Inga restauranger att koppla
                       </div>
                     )}
                  </div>
               </div>

               {/* Zones */}
               <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 space-y-10">
                  <div className="flex items-center justify-between">
                     <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Layers className={editingRestaurantId ? "text-gold-500" : "text-sky-500"} size={28} />
                            {editingRestaurantId ? `Zoner: ${selectedRestaurant?.name}` : "Globala Leveranszoner"}
                        </h2>
                        <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Geofencing & prissättning per zon</p>
                     </div>
                     <button 
                       onClick={addZone}
                       className="flex items-center gap-2 px-6 py-3 bg-sky-500 text-white rounded-2xl hover:bg-sky-400 transition-all shadow-xl shadow-sky-500/20 font-black text-[10px] uppercase tracking-widest"
                     >
                       <Plus size={16} /> Lägg till zon
                     </button>
                  </div>

                  <div className="space-y-4">
                     {activeZones.length === 0 && (
                       <div className="py-16 text-center opacity-20 font-black text-xs uppercase tracking-widest border border-dashed border-white/10 rounded-3xl">
                         {editingRestaurantId ? "Restaurangen använder globala zoner" : "Inga globala zoner skapade"}
                       </div>
                     )}
                     {activeZones.map((zone: DeliveryZone, idx: number) => (
                       <div key={zone.id} className={`p-8 rounded-[2.5rem] bg-dark-500 border space-y-6 ${editingRestaurantId ? "border-gold-500/30" : "border-[var(--border-strong)]"}`}>
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                  idx === 0 ? "bg-emerald-500/20 text-emerald-500" : idx === 1 ? "bg-amber-500/20 text-amber-500" : "bg-red-500/20 text-red-500"
                                }`}>
                                  Z{idx + 1}
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]/40">Radie: {zone.radiusKm} km</span>
                             </div>
                             <button 
                               onClick={() => removeZone(zone.id)}
                               className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 transition-all hover:text-white"
                             >
                                <Trash2 size={14} />
                             </button>
                          </div>
                          <div className="grid md:grid-cols-4 gap-6">
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Zonnamn</label>
                                <input 
                                  className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-bold text-sm" 
                                  value={zone.name}
                                  onChange={(e) => updateZone(zone.id, 'name', e.target.value)}
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Radie (KM)</label>
                                <input 
                                  type="number"
                                  className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-black text-sm text-sky-400" 
                                  value={zone.radiusKm}
                                  onChange={(e) => updateZone(zone.id, 'radiusKm', parseFloat(e.target.value) || 0)}
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Leveransavgift (KR)</label>
                                <input 
                                  type="number"
                                  className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-black text-sm text-emerald-400" 
                                  value={zone.deliveryFee}
                                  onChange={(e) => updateZone(zone.id, 'deliveryFee', parseInt(e.target.value) || 0)}
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Minimiorder (KR)</label>
                                <input 
                                  type="number"
                                  className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-black text-sm" 
                                  value={zone.minOrder}
                                  onChange={(e) => updateZone(zone.id, 'minOrder', parseInt(e.target.value) || 0)}
                                />
                             </div>
                          </div>
                       </div>
                     ))}
                  </div>

                  {activeZones.length > 0 && (
                    <div className={`p-6 border rounded-3xl space-y-3 ${editingRestaurantId ? "bg-gold-500/5 border-gold-500/10" : "bg-sky-500/5 border-sky-500/10"}`}>
                       <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${editingRestaurantId ? "text-gold-500" : "text-sky-400"}`}>
                         <Info size={14} /> {editingRestaurantId ? "Restaurangens zoner" : "Zon-prioritet"}
                       </h4>
                       <p className="text-[9px] text-[var(--text-primary)]/30 font-bold leading-relaxed uppercase">
                         {editingRestaurantId 
                           ? "Dessa zoner gäller endast för denna restaurang och ersätter de globala zonerna." 
                           : "Zonerna matchas i ordning efter radie (minsta först). Kunder utanför alla zoner kan inte beställa leverans."}
                       </p>
                    </div>
                  )}
               </div>

               {/* Save */}
              <div className="flex justify-end pt-10 border-t border-[var(--border-subtle)]">
                 <button 
                   onClick={handleSave}
                   disabled={isSaving}
                   className={`flex items-center gap-4 px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] transition-all shadow-2xl ${
                     isSaving ? "bg-emerald-500 text-white scale-95" : "bg-sky-500 hover:bg-sky-400 text-white hover:scale-105"
                   }`}
                 >
                    {isSaving ? (
                      <><Check size={20} /> Sparat!</>
                    ) : (
                      <><Save size={20} /> Spara ändringar</>
                    )}
                 </button>
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 text-[var(--text-primary)]/10 gap-6">
               <MapPin size={64} />
               <p className="font-black uppercase tracking-[0.4em] text-sm">Välj en stad för att börja</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Add City Modal */}
      <AnimatePresence>
        {showAddCityModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
            onClick={() => setShowAddCityModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded-[2.5rem] p-10 space-y-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center space-y-2">
                 <div className="w-16 h-16 bg-sky-500/10 rounded-3xl flex items-center justify-center text-sky-500 mx-auto mb-4">
                    <MapPin size={32} />
                 </div>
                 <h2 className="text-2xl font-black uppercase tracking-tight">Lägg till ny stad</h2>
                 <p className="text-[var(--text-primary)]/20 text-[10px] font-black uppercase tracking-widest">Ange namnet på staden du vill expandera till</p>
              </div>

              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Stadsnamn</label>
                    <input 
                      autoFocus
                      value={newCityName}
                      onChange={(e) => setNewCityName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddCity()}
                      className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-lg" 
                      placeholder="t.ex. Stockholm" 
                    />
                 </div>
                 
                 <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setShowAddCityModal(false)}
                      className="flex-1 py-4 bg-[var(--border-subtle)] hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                    >
                      Avbryt
                    </button>
                    <button 
                      onClick={handleAddCity}
                      className="flex-1 py-4 bg-sky-500 hover:bg-sky-400 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-sky-500/20"
                    >
                      Spara stad
                    </button>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CitiesPage;
