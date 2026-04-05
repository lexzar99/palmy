/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, use } from "react";
import axios from "axios";
import { 
  Loader2, 
  Save, 
  Clock, 
  ChevronLeft,
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  Moon,
  Sun,
  PlusCircle,
  MinusCircle
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

const defaultShift = { open: "11:00", close: "22:00" };

export default function RestaurantHoursPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  
  const [settings, setSettings] = useState<any>({
    openingHours: DAYS.reduce((acc, d) => ({ 
      ...acc, 
      [d.key]: { closed: false, shifts: [{ ...defaultShift }] } 
    }), {}),
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

        const rawRegular = oh?.regular || oh || {};
        
        // Migrate old format to new shift format if needed
        const migratedHours: any = {};
        DAYS.forEach(day => {
          const dData = rawRegular[day.key];
          if (dData?.shifts) {
            migratedHours[day.key] = dData;
          } else if (dData?.open) {
            migratedHours[day.key] = { 
              closed: dData.closed || false, 
              shifts: [{ open: dData.open, close: dData.close }] 
            };
          } else {
            migratedHours[day.key] = { closed: false, shifts: [{ ...defaultShift }] };
          }
        });

        setSettings({
          openingHours: migratedHours,
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

  const updateDayStatus = (day: string, closed: boolean) => {
    setSettings((prev: any) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day], closed }
      }
    }));
  };

  const updateShift = (day: string, index: number, field: string, value: string) => {
    setSettings((prev: any) => {
       const shifts = [...prev.openingHours[day].shifts];
       shifts[index] = { ...shifts[index], [field]: value };
       return {
         ...prev,
         openingHours: {
           ...prev.openingHours,
           [day]: { ...prev.openingHours[day], shifts }
         }
       };
    });
  };

  const addShift = (day: string) => {
    setSettings((prev: any) => {
      const shifts = [...prev.openingHours[day].shifts];
      if (shifts.length >= 2) return prev;
      return {
        ...prev,
        openingHours: {
          ...prev.openingHours,
          [day]: { ...prev.openingHours[day], shifts: [...shifts, { open: "17:00", close: "22:00" }] }
        }
      };
    });
  };

  const removeShift = (day: string, index: number) => {
    setSettings((prev: any) => {
       const shifts = prev.openingHours[day].shifts.filter((_: any, i: number) => i !== index);
       return {
         ...prev,
         openingHours: {
           ...prev.openingHours,
           [day]: { ...prev.openingHours[day], shifts: shifts.length > 0 ? shifts : [{ ...defaultShift }] }
         }
       };
    });
  };

  const updateSpecialHour = (index: number, field: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      specialHours: prev.specialHours.map((sh: any, i: number) => i === index ? { ...sh, [field]: value } : sh)
    }));
  };

  if (loading) return <div className="min-h-screen bg-[#02040a] flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#02040a] p-4 lg:p-10 text-[var(--text-primary)] font-sans">
      <div className="max-w-[1200px] mx-auto space-y-12 pb-32">
        
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
           <div className="space-y-4">
              <Link href="/settings/hours" className="flex items-center gap-2 text-[var(--text-primary)]/20 hover:text-[var(--text-primary)] transition-all text-xs font-black uppercase tracking-widest pl-1">
                 <ChevronLeft size={14} /> Tillbaka till urval
              </Link>
              <div>
                 <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter italic leading-none">{restaurantName} <span className="text-gold-500">Schema</span></h1>
                 <p className="text-[var(--text-primary)]/40 text-[11px] font-black uppercase tracking-widest mt-3 ml-1">Hantera skift, nattöppet och specialtider</p>
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 items-start">
           
           {/* Regular Hours with Shifts */}
           <div className="bg-[#0a0c14] border border-[var(--border-subtle)] rounded-[3rem] p-10 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 blur-[100px] pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-10 relative z-10">
                 <div className="w-10 h-10 rounded-xl bg-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]/40"><Clock size={20} /></div>
                 <div>
                    <h2 className="text-xl font-black uppercase tracking-tight italic">Veckoschema <span className="text-gold-500">(2 skift)</span></h2>
                    <p className="text-[10px] font-black text-[var(--text-primary)]/20 uppercase tracking-widest mt-1">Stöd för delade pass och nattöppet.</p>
                 </div>
              </div>

              <div className="space-y-6 relative z-10">
                {DAYS.map((day) => {
                  const dayData = settings.openingHours[day.key] || { closed: false, shifts: [{ ...defaultShift }] };
                  return (
                    <div key={day.key} className={`p-6 rounded-[2rem] transition-all border ${dayData.closed ? "bg-rose-500/5 border-rose-500/20" : "bg-white/2 border-[var(--border-subtle)]"}`}>
                      <div className="flex items-center justify-between mb-4 px-2">
                         <div className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">{day.label}</div>
                         <button 
                           onClick={() => updateDayStatus(day.key, !dayData.closed)} 
                           className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${dayData.closed ? "bg-rose-500 text-[var(--text-primary)]" : "bg-[var(--border-subtle)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"}`}
                         >
                           {dayData.closed ? "Stängd" : "Öppen"}
                         </button>
                      </div>

                      {!dayData.closed && (
                        <div className="space-y-3">
                           {dayData.shifts.map((shift: any, idx: number) => (
                             <div key={idx} className="flex flex-col md:flex-row md:items-center gap-4 bg-black/40 p-4 rounded-2xl border border-[var(--border-subtle)] group">
                                <div className="flex items-center gap-3 flex-1">
                                   <div className="w-8 h-8 rounded-lg bg-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]/20 text-[9px] font-black">{idx + 1}</div>
                                   <div className="flex items-center gap-2 flex-1">
                                      <input type="time" value={shift.open} onChange={(e) => updateShift(day.key, idx, "open", e.target.value)} className="flex-1 bg-[#02040a] border border-[var(--border-strong)] rounded-xl px-3 py-2 text-xs font-black text-[var(--text-primary)] focus:border-gold-500/40 outline-none" />
                                      <span className="text-[var(--text-primary)]/10">-</span>
                                      <div className="flex-1 relative">
                                        <input type="time" value={shift.close} onChange={(e) => updateShift(day.key, idx, "close", e.target.value)} className="w-full bg-[#02040a] border border-[var(--border-strong)] rounded-xl px-3 py-2 text-xs font-black text-[var(--text-primary)] focus:border-gold-500/40 outline-none" />
                                        {shift.close < shift.open && shift.close !== "00:00" && (
                                           <div className="absolute -top-6 right-0 text-[7px] font-black uppercase text-gold-500 flex items-center gap-1"><Moon size={8}/> Nästa dag</div>
                                        )}
                                      </div>
                                   </div>
                                </div>
                                <div className="flex items-center gap-2">
                                   {dayData.shifts.length > 1 && (
                                      <button onClick={() => removeShift(day.key, idx)} className="p-2.5 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500/20 transition-all"><MinusCircle size={14}/></button>
                                   )}
                                   {dayData.shifts.length === 1 && idx === 0 && (
                                      <button onClick={() => addShift(day.key)} className="p-2.5 bg-gold-500/10 text-gold-500 rounded-xl hover:bg-gold-500/20 transition-all flex items-center gap-2 text-[8px] font-black uppercase"><PlusCircle size={14}/> Extra skift</button>
                                   )}
                                </div>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
           </div>

           {/* Special Hours */}
           <div className="bg-[#0a0c14] border border-[var(--border-subtle)] rounded-[3rem] p-10">
              <div className="flex items-center justify-between mb-10">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center text-gold-500"><CalendarDays size={20} /></div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight italic">Speciella <span className="text-gold-500">Dagar</span></h2>
                       <p className="text-[10px] font-black text-[var(--text-primary)]/20 uppercase tracking-widest mt-1">Högtider, röda dagar eller event.</p>
                    </div>
                 </div>
                 <button onClick={() => setSettings((p:any)=>({...p, specialHours: [...p.specialHours, { date: "", open: "11:00", close: "22:00", closed: false, note: "" }]}))} className="p-3 bg-gold-500 text-dark-500 rounded-xl hover:bg-gold-400 transition-all font-black uppercase text-[10px]"><Plus size={16} /></button>
              </div>

              <div className="space-y-4 max-h-[800px] overflow-y-auto custom-scrollbar">
                 {settings.specialHours.map((sh: any, i: number) => (
                   <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key={i} className="p-6 rounded-2xl bg-white/2 border border-[var(--border-subtle)] space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase text-[var(--text-primary)]/20 ml-2">Datum</label>
                            <input type="date" value={sh.date} onChange={(e) => updateSpecialHour(i, "date", e.target.value)} className="w-full bg-[#02040a] border border-[var(--border-strong)] rounded-xl px-4 py-2 text-xs font-black text-[var(--text-primary)] focus:border-gold-500/40 outline-none" />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase text-[var(--text-primary)]/20 ml-2">Status</label>
                            <button onClick={() => updateSpecialHour(i, "closed", !sh.closed)} className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${sh.closed ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                               {sh.closed ? "Helt Stängd" : "Specialtider"}
                            </button>
                         </div>
                      </div>
                      
                      {!sh.closed && (
                        <div className="flex items-center gap-3">
                           <input type="time" value={sh.open} onChange={(e) => updateSpecialHour(i, "open", e.target.value)} className="flex-1 bg-[#02040a] border border-[var(--border-strong)] rounded-xl px-4 py-2 text-xs font-black text-[var(--text-primary)] focus:border-gold-500/40 outline-none" />
                           <span className="text-[var(--text-primary)]/10">-</span>
                           <div className="flex-1 relative">
                             <input type="time" value={sh.close} onChange={(e) => updateSpecialHour(i, "close", e.target.value)} className="w-full bg-[#02040a] border border-[var(--border-strong)] rounded-xl px-4 py-2 text-xs font-black text-[var(--text-primary)] focus:border-gold-500/40 outline-none" />
                             {sh.close < sh.open && sh.close !== "00:00" && <div className="absolute -top-6 right-0 text-[7px] font-black uppercase text-gold-500 flex items-center gap-1"><Moon size={8}/> Nästa dag</div>}
                           </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                         <input placeholder="Kommentar (t.ex Påskdagen)" value={sh.note} onChange={(e) => updateSpecialHour(i, "note", e.target.value)} className="flex-1 bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-primary)]/60 focus:border-gold-500/40 outline-none" />
                         <button onClick={() => setSettings((p:any)=>({...p, specialHours: p.specialHours.filter((_:any,idx:number)=>idx!==i)}))} className="p-2.5 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl text-rose-500/40 hover:text-rose-500 transition-all"><Trash2 size={16} /></button>
                      </div>
                   </motion.div>
                 ))}

                 {settings.specialHours.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-3xl flex flex-col items-center">
                       <AlertCircle size={32} className="text-[var(--text-primary)]/5 mb-4" />
                       <p className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 tracking-[0.2em]">Inga specialtider tillagda</p>
                    </div>
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
