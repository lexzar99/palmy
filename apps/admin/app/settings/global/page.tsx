"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Save, ToggleLeft, ToggleRight, Clock, Store } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const DAYS = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
  { key: "saturday", label: "Lördag" },
  { key: "sunday", label: "Söndag" },
];

const defaultHours = { open: "11:00", close: "22:00", closed: false };

const GlobalSettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { selectedRestaurantId, selectedRestaurantName } = useRestaurantStore();
  
  const [settings, setSettings] = useState<any>({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    deliveryRadius: 10,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
    openingHours: DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...defaultHours } }), {}),
  });

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    if (!selectedRestaurantId) return;
    
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/restaurants/${selectedRestaurantId}`);
        const data = res.data;
        
        // Parse opening hours if string
        let oh = data.openingHours;
        if (typeof oh === 'string') {
          try { oh = JSON.parse(oh); } catch { oh = {}; }
        }

        setSettings({
          isOpen: data.isOpen ?? true,
          deliveryFee: data.deliveryFee ?? 49,
          minOrderAmount: data.minOrderAmount ?? 150,
          deliveryRadius: data.deliveryRadius ?? 10,
          estimatedPickupTime: data.estimatedPickupTime ?? 20,
          estimatedDeliveryTime: data.estimatedDeliveryTime ?? 35,
          openingHours: {
            ...DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...defaultHours } }), {}),
            ...(oh || {}),
          },
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [selectedRestaurantId]);

  const handleSave = async () => {
    if (!selectedRestaurantId) return;
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/api/restaurants/${selectedRestaurantId}`, settings, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      alert(`✅ Inställningar sparade för ${selectedRestaurantName}!`);
    } catch (err: any) {
      alert("Fel vid sparning");
    } finally {
      setSaving(false);
    }
  };

  const updateHours = (day: string, field: string, value: string | boolean) => {
    setSettings((prev: any) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day], [field]: value },
      },
    }));
  };

  if (!selectedRestaurantId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/20">
        <Store size={48} className="mb-4" />
        <p className="uppercase font-black tracking-widest text-sm">Välj en restaurang i menyn för att hantera dess inställningar</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-gold-500" size={40} /></div>;
  }

  return (
    <div className="space-y-12 pb-24 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Globala <span className="text-gold-500">Inställningar</span></h1>
          <p className="text-white/40 font-medium tracking-wide">Du hanterar nu: <span className="text-white font-bold">{selectedRestaurantName}</span></p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-3 px-8 py-4 bg-gold-500 text-dark-500 font-extrabold rounded-2xl hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20 uppercase tracking-widest disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Spara ändringar
        </button>
      </div>

      {/* Main Status */}
      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10">
        <h2 className="text-sm font-black uppercase tracking-[0.3em] mb-8 text-white/20">Status & Tillgänglighet</h2>
        <button
          onClick={() => setSettings({ ...settings, isOpen: !settings.isOpen })}
          className={`group flex items-center gap-8 p-8 rounded-3xl border transition-all w-full text-left ${
            settings.isOpen ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
          }`}
        >
          <div className={`p-4 rounded-2xl ${settings.isOpen ? "bg-emerald-500 text-dark-500" : "bg-red-500 text-white"}`}>
            {settings.isOpen ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </div>
          <div>
            <div className={`text-2xl font-black uppercase tracking-tight ${settings.isOpen ? "text-emerald-400" : "text-red-400"}`}>
              {settings.isOpen ? "Öppen för beställning" : "Stängd för tillfället"}
            </div>
            <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-1">Klicka för att ändra butikens status direkt</p>
          </div>
        </button>
      </div>

      {/* Operations */}
      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10">
        <h2 className="text-sm font-black uppercase tracking-[0.3em] mb-8 text-white/20">Leverans & Tider</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Leveransavgift (kr)</label>
              <input type="number" value={settings.deliveryFee} onChange={e => setSettings({...settings, deliveryFee: Number(e.target.value)})} className="w-full bg-dark-500 border border-white/5 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold text-xl" />
           </div>
           <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Minsta order (kr)</label>
              <input type="number" value={settings.minOrderAmount} onChange={e => setSettings({...settings, minOrderAmount: Number(e.target.value)})} className="w-full bg-dark-500 border border-white/5 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold text-xl" />
           </div>
           <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Hämtningstid (min)</label>
              <div className="relative">
                <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                <input type="number" value={settings.estimatedPickupTime} onChange={e => setSettings({...settings, estimatedPickupTime: Number(e.target.value)})} className="w-full bg-dark-500 border border-white/5 rounded-2xl p-5 pl-16 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold text-xl" />
              </div>
           </div>
           <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Leveranstid (min)</label>
              <div className="relative">
                <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                <input type="number" value={settings.estimatedDeliveryTime} onChange={e => setSettings({...settings, estimatedDeliveryTime: Number(e.target.value)})} className="w-full bg-dark-500 border border-white/5 rounded-2xl p-5 pl-16 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold text-xl" />
              </div>
           </div>
        </div>
      </div>

      {/* Opening Hours removed - handled in /settings/hours hub */}
    </div>
  );
};

export default GlobalSettingsPage;
