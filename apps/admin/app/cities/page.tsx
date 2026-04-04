"use client";

import { useState, useEffect } from "react";
import { 
  MapPin, 
  Settings, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  Bike, 
  Store, 
  Navigation, 
  Layers, 
  Info,
  ShieldCheck,
  ChevronRight,
  Loader2,
  Save,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DeliveryZone {
  id: string;
  name: string;
  radiusKm: number;
  deliveryFee: number;
  minOrder: number;
}

interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  allowDelivery: boolean;
  allowPickup: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
  zones: DeliveryZone[];
}

const CitiesPage = () => {
  const [cities, setCities] = useState<City[]>([
    {
      id: "1",
      name: "Lund",
      slug: "lund",
      isActive: true,
      allowDelivery: true,
      allowPickup: true,
      deliveryMode: "ALL",
      zones: [
        { id: "z1", name: "Centrum", radiusKm: 3, deliveryFee: 0, minOrder: 150 },
        { id: "z2", name: "Utkant", radiusKm: 6, deliveryFee: 49, minOrder: 250 },
      ]
    },
    {
      id: "2",
      name: "Malmö",
      slug: "malmo",
      isActive: true,
      allowDelivery: false,
      allowPickup: true,
      deliveryMode: "ONLY_PICKUP",
      zones: []
    }
  ]);

  const [selectedCityId, setSelectedCityId] = useState<string | null>(cities[0].id);
  const selectedCity = cities.find(c => c.id === selectedCityId);

  const [isSaving, setIsSaving] = useState(false);
  const [showAddCityModal, setShowAddCityModal] = useState(false);
  const [newCityName, setNewCityName] = useState("");

  const handleAddCity = () => {
    if (!newCityName.trim()) return;
    const newCity: City = {
      id: Math.random().toString(),
      name: newCityName,
      slug: newCityName.toLowerCase().replace(/\s+/g, "-"),
      isActive: true,
      allowDelivery: true,
      allowPickup: true,
      deliveryMode: "ALL",
      zones: []
    };
    setCities([...cities, newCity]);
    setSelectedCityId(newCity.id);
    setNewCityName("");
    setShowAddCityModal(false);
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1000);
  };

  const addZone = () => {
    if (!selectedCityId) return;
    const newZone: DeliveryZone = {
      id: Math.random().toString(),
      name: "Ny Zon",
      radiusKm: 5,
      deliveryFee: 39,
      minOrder: 200
    };
    setCities(cities.map(c => c.id === selectedCityId ? { ...c, zones: [...c.zones, newZone] } : c));
  };

  const updateZone = (zoneId: string, field: keyof DeliveryZone, value: any) => {
    if (!selectedCityId) return;
    setCities(cities.map(c => c.id === selectedCityId ? {
      ...c,
      zones: c.zones.map(z => z.id === zoneId ? { ...z, [field]: value } : z)
    } : c));
  };

  const removeZone = (zoneId: string) => {
    if (!selectedCityId) return;
    setCities(cities.map(c => c.id === selectedCityId ? { ...c, zones: c.zones.filter(z => z.id !== zoneId) } : c));
  };

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
            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em]">Hantera zoner, räckvidd och leveranslägen</p>
          </div>
        </div>
        <button 
          onClick={() => setShowAddCityModal(true)}
          className="flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all border border-white/5"
        >
          <Plus size={18} />
          Lägg till Stad
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px,1fr] gap-10">
        {/* City List Sidebar */}
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 space-y-3">
             <div className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/20 italic">Aktiva Städer</div>
             {cities.map(city => (
               <button
                 key={city.id}
                 onClick={() => setSelectedCityId(city.id)}
                 className={`w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${
                   selectedCityId === city.id ? "bg-sky-500/10 border-sky-500/40" : "bg-white/5 border-transparent hover:bg-white/10"
                 }`}
               >
                 <div className="text-left">
                    <div className="text-lg font-black uppercase tracking-tight mb-1">{city.name}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                       {city.deliveryMode === "ALL" ? "Full Service" : "Endast Avhämtning"}
                    </div>
                 </div>
                 <ChevronRight size={18} className={selectedCityId === city.id ? "text-sky-500" : "text-white/10"} />
               </button>
             ))}
          </div>

          <div className="bg-sky-500/5 border border-sky-500/10 rounded-[2.5rem] p-8 space-y-4">
             <div className="flex items-center gap-3 text-sky-400">
                <Info size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Global Kontroll</span>
             </div>
             <p className="text-[10px] text-white/40 leading-relaxed uppercase font-bold">
               Här styr du vilka städer plattformen är aktiv i. Du kan stänga av utkörning för en hel stad vid t.ex. dåligt väder eller hög belastning.
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
               <div className="bg-white/5 border border-white/5 rounded-[3rem] p-10 space-y-10">
                  <div className="flex items-center justify-between">
                     <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                           <ShieldCheck className="text-sky-500" size={28} />
                           Konfiguration: {selectedCity.name}
                        </h2>
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Övergripande regler för staden</p>
                     </div>
                     <div className="flex items-center gap-3 p-1.5 bg-dark-500 border border-white/5 rounded-2xl">
                        <button 
                          onClick={() => setCities(cities.map(c => c.id === selectedCity.id ? {...c, isActive: true} : c))}
                          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedCity.isActive ? "bg-emerald-500 text-white" : "text-white/20 hover:text-white/40"}`}
                        >
                          Aktiv
                        </button>
                        <button 
                          onClick={() => setCities(cities.map(c => c.id === selectedCity.id ? {...c, isActive: false} : c))}
                          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!selectedCity.isActive ? "bg-red-500 text-white" : "text-white/20 hover:text-white/40"}`}
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
                         onClick={() => setCities(cities.map(c => c.id === selectedCity.id ? {...c, deliveryMode: mode.id as any} : c))}
                         className={`p-8 rounded-[2.5rem] border-2 text-left transition-all flex flex-col gap-4 ${
                           selectedCity.deliveryMode === mode.id ? "bg-sky-500/10 border-sky-500/40" : "bg-white/5 border-white/5 hover:border-white/10"
                         }`}
                       >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selectedCity.deliveryMode === mode.id ? "bg-sky-500 text-white" : "bg-white/5 text-white/30"}`}>
                             <mode.icon size={24} />
                          </div>
                          <div>
                             <div className="font-black uppercase tracking-widest text-xs mb-1">{mode.label}</div>
                             <div className="text-[10px] font-bold text-white/20 uppercase tracking-wide">{mode.desc}</div>
                          </div>
                       </button>
                     ))}
                  </div>
               </div>

               {/* Zones */}
               <div className="bg-white/5 border border-white/5 rounded-[3rem] p-10 space-y-10">
                  <div className="flex items-center justify-between">
                     <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                           <Layers className="text-sky-500" size={28} />
                           Leverans-zoner
                        </h2>
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Geofencing & prissättning per zon</p>
                     </div>
                     <button 
                       onClick={addZone}
                       className="p-4 bg-sky-500 text-white rounded-2xl hover:bg-sky-400 transition-all shadow-xl shadow-sky-500/20"
                     >
                       <Plus size={20} />
                     </button>
                  </div>

                  <div className="space-y-4">
                     {selectedCity.zones.map((zone, idx) => (
                       <div key={zone.id} className="p-8 rounded-[2.5rem] bg-dark-500 border border-white/10 grid md:grid-cols-4 gap-8 items-center">
                          <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-1">Namn på zon</label>
                             <input 
                               className="w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-bold text-sm" 
                               value={zone.name}
                               onChange={(e) => updateZone(zone.id, 'name', e.target.value)}
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-1">Gräns (Radius KM)</label>
                             <div className="relative">
                                <input 
                                  className="w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-black text-sm text-sky-400" 
                                  value={zone.radiusKm}
                                  onChange={(e) => updateZone(zone.id, 'radiusKm', parseInt(e.target.value) || 0)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/20">KM</span>
                             </div>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-1">Avgift (KR)</label>
                             <div className="relative">
                                <input 
                                  className="w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-black text-sm text-sky-400" 
                                  value={zone.deliveryFee}
                                  onChange={(e) => updateZone(zone.id, 'deliveryFee', parseInt(e.target.value) || 0)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/20">KR</span>
                             </div>
                          </div>
                          <div className="flex items-center gap-2 mt-4">
                             <div className="flex-1 space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-1">Minsta Order</label>
                                <input 
                                  className="w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 outline-none focus:ring-1 focus:ring-sky-500/30 font-black text-sm" 
                                  value={zone.minOrder}
                                  onChange={(e) => updateZone(zone.id, 'minOrder', parseInt(e.target.value) || 0)}
                                />
                             </div>
                             <button 
                               onClick={() => removeZone(zone.id)}
                               className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 transition-all hover:text-white mt-5"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>

               {/* Footer Save */}
               <div className="flex justify-end pt-4">
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-4 px-12 py-6 bg-emerald-500 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all text-sm"
                  >
                    {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                    Spara ändringar för {selectedCity.name}
                  </button>
               </div>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 text-white/10 gap-6">
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
              className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] p-10 space-y-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center space-y-2">
                 <div className="w-16 h-16 bg-sky-500/10 rounded-3xl flex items-center justify-center text-sky-500 mx-auto mb-4">
                    <MapPin size={32} />
                 </div>
                 <h2 className="text-2xl font-black uppercase tracking-tight">Lägg till ny stad</h2>
                 <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Ange namnet på staden du vill expandera till</p>
              </div>

              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Stadsnamn</label>
                    <input 
                      autoFocus
                      value={newCityName}
                      onChange={(e) => setNewCityName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddCity()}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-lg" 
                      placeholder="t.ex. Stockholm" 
                    />
                 </div>
                 
                 <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setShowAddCityModal(false)}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
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
