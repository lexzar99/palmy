/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, use } from "react";
import axios from "axios";
import { 
  Loader2, 
  Save, 
  ToggleLeft, 
  ToggleRight, 
  Clock, 
  Store,
  ChevronLeft,
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";

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

export default function RestaurantHoursPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  
  const [settings, setSettings] = useState<any>({
    openingHours: DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...defaultHours } }), {}),
    specialHours: [] as { date: string; open: string; close: string; closed: boolean; note?: string }[],
  });

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    if (!restaurantId) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/restaurants/${restaurantId}`);
        const data = res.data;
        setRestaurantName(data.name);
        
        let oh = data.openingHours;
        if (typeof oh === 'string') {
          try { oh = JSON.parse(oh); } catch { oh = {}; }
        }

        setSettings({
          openingHours: {
            ...DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...defaultHours } }), {}),
            ...(oh?.regular || oh || {}),
          },
          specialHours: oh?.special || [],
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [restaurantId]);

  const handleSave = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const payload = {
        openingHours: {
          regular: settings.openingHours,
          special: settings.specialHours,
        }
      };
      await axios.patch(`${API_URL}/api/restaurants/${restaurantId}`, payload, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      alert(`✅ Öppettider sparade för ${restaurantName}!`);
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

  const addSpecialHour = () => {
    setSettings((prev: any) => ({
      ...prev,
      specialHours: [...prev.specialHours, { date: "", open: "11:00", close: "22:00", closed: false, note: "" }]
    }));
  };

  const removeSpecialHour = (index: number) => {
    setSettings((prev: any) => ({
      ...prev,
      specialHours: prev.specialHours.filter((_: any, i: number) => i !== index)
    }));
  };

  const updateSpecialHour = (index: number, field: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      specialHours: prev.specialHours.map((sh: any, i: number) => i === index ? { ...sh, [field]: value } : sh)
    }));
  };

  if (loading) return <div className="min-h-screen bg-[#02040a] flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#02040a] p-4 lg:p-10 text-white font-sans">
      <div className="max-w-[1000px] mx-auto space-y-12 pb-32">
        
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
           <div className="space-y-4">
              <Link href="/settings/hours" className="flex items-center gap-2 text-white/20 hover:text-white transition-all text-xs font-black uppercase tracking-widest pl-1">
                 <ChevronLeft size={14} /> Tillbaka till urval
              </Link>
              <div>
                 <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter italic leading-none">{restaurantName} <span className="text-gold-500">Schema</span></h1>
                 <p className="text-white/40 text-[11px] font-black uppercase tracking-widest mt-3 ml-1">Hantera ordinarie och speciella öppettider</p>
              </div>
           </div>

           <button 
             onClick={handleSave} 
             disabled={saving}
             className="flex items-center gap-3 px-8 py-4 bg-gold-500 text-dark-500 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-gold-400 transition-all shadow-xl shadow-gold-500/10 disabled:opacity-50"
           >
             {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Spara Ändringar
           </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
           
           {/* Regular Hours */}
           <div className="bg-[#0a0c14] border border-white/5 rounded-[3rem] p-10">
              <div className="flex items-center gap-3 mb-10">
                 <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40"><Clock size={20} /></div>
                 <div>
                    <h2 className="text-xl font-black uppercase tracking-tight italic">Ordinarie <span className="text-gold-500">Öppet</span></h2>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-1">Veckoschema som upprepas varje vecka.</p>
                 </div>
              </div>

              <div className="space-y-4">
                {DAYS.map((day) => {
                  const hours = settings.openingHours[day.key] || defaultHours;
                  return (
                    <div key={day.key} className={`flex items-center gap-4 p-5 rounded-2xl transition-all border ${hours.closed ? "bg-red-500/5 border-red-500/20" : "bg-white/2 border-white/5"}`}>
                      <div className="w-24 font-black uppercase text-[10px] tracking-widest text-white/40">{day.label}</div>
                      <div className="flex items-center gap-3 flex-1 px-4">
                        <input type="time" value={hours.open} disabled={hours.closed} onChange={(e) => updateHours(day.key, "open", e.target.value)} className="bg-[#02040a] border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white/80 focus:border-gold-500/40 outline-none disabled:opacity-20" />
                        <span className="text-white/10">-</span>
                        <input type="time" value={hours.close} disabled={hours.closed} onChange={(e) => updateHours(day.key, "close", e.target.value)} className="bg-[#02040a] border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white/80 focus:border-gold-500/40 outline-none disabled:opacity-20" />
                      </div>
                      <button onClick={() => updateHours(day.key, "closed", !hours.closed)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${hours.closed ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                        {hours.closed ? "Stängd" : "Öppen"}
                      </button>
                    </div>
                  );
                })}
              </div>
           </div>

           {/* Special Hours */}
           <div className="bg-[#0a0c14] border border-white/5 rounded-[3rem] p-10">
              <div className="flex items-center justify-between mb-10">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center text-gold-500"><CalendarDays size={20} /></div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight italic">Speciella <span className="text-gold-500">Dagar</span></h2>
                       <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-1">Högtider, röda dagar eller event.</p>
                    </div>
                 </div>
                 <button onClick={addSpecialHour} className="p-3 bg-gold-500 text-dark-500 rounded-xl hover:bg-gold-400 transition-all font-black uppercase text-[10px]"><Plus size={16} /></button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto no-scrollbar">
                 {settings.specialHours.map((sh: any, i: number) => (
                   <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key={i} className="p-6 rounded-2xl bg-white/2 border border-white/5 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase text-white/20 ml-2">Datum</label>
                            <input type="date" value={sh.date} onChange={(e) => updateSpecialHour(i, "date", e.target.value)} className="w-full bg-[#02040a] border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-white focus:border-gold-500/40 outline-none" />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase text-white/20 ml-2">Status</label>
                            <button onClick={() => updateSpecialHour(i, "closed", !sh.closed)} className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${sh.closed ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                               {sh.closed ? "Helt Stängd" : "Specialtider"}
                            </button>
                         </div>
                      </div>
                      
                      {!sh.closed && (
                        <div className="flex items-center gap-3">
                           <input type="time" value={sh.open} onChange={(e) => updateSpecialHour(i, "open", e.target.value)} className="flex-1 bg-[#02040a] border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-white focus:border-gold-500/40 outline-none" />
                           <span className="text-white/10">-</span>
                           <input type="time" value={sh.close} onChange={(e) => updateSpecialHour(i, "close", e.target.value)} className="flex-1 bg-[#02040a] border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-white focus:border-gold-500/40 outline-none" />
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                         <input placeholder="Kommentar (t.ex Påskdagen)" value={sh.note} onChange={(e) => updateSpecialHour(i, "note", e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-medium text-white/60 focus:border-gold-500/40 outline-none" />
                         <button onClick={() => removeSpecialHour(i)} className="p-2.5 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl text-rose-500/40 hover:text-rose-500 transition-all"><Trash2 size={16} /></button>
                      </div>
                   </motion.div>
                 ))}

                 {settings.specialHours.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center">
                       <AlertCircle size={32} className="text-white/5 mb-4" />
                       <p className="text-[10px] font-black uppercase text-white/10 tracking-[0.2em]">Inga specialtider tillagda</p>
                    </div>
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
