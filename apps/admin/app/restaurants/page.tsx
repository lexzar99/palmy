"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { 
  Check, 
  Loader2, 
  Plus, 
  Save, 
  Trash2, 
  Upload, 
  ImageIcon, 
  Star, 
  Clock, 
  Bike, 
  Search,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Sparkles,
  MapPin,
  Phone,
  Info,
  Lock,
  Users,
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  cuisine?: string;
  city?: string;
  address?: string;
  zip?: string;
  phone?: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  heroImageUrl?: string;
  minOrderAmount?: number;
  deliveryFee?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  featuredClass?: number;
  tags?: string; // JSON string from API
  openingHours?: string; // JSON string from API
  adminPassword?: string;
  internalInfo?: string;
}

const emptyForm: Partial<Restaurant> = {
  name: "",
  slug: "",
  description: "",
  cuisine: "",
  city: "Lund",
  address: "",
  zip: "",
  phone: "",
  minOrderAmount: 0,
  deliveryFee: 0,
  etaMinutes: 30,
  isOpen: true,
  featuredClass: 3,
  tags: "[]",
  openingHours: "{}",
  imageUrl: "",
  heroImageUrl: "",
  adminPassword: "",
  internalInfo: "",
};

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "EDIT">("OVERVIEW");
  const [form, setForm] = useState<Partial<Restaurant>>(emptyForm);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/restaurants`);
      setRestaurants(res.data);
    } catch (error) {
      console.error("Failed to fetch restaurants", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter(r => 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      r.cuisine?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [restaurants, searchTerm]);

  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId),
    [restaurants, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setForm({
        ...selected,
        tags: typeof selected.tags === 'string' ? selected.tags : JSON.stringify(selected.tags || []),
        openingHours: typeof selected.openingHours === 'string' ? selected.openingHours : JSON.stringify(selected.openingHours || {}),
        adminPassword: "", // Don't load password
      });
    }
  }, [selected]);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        deliveryFee: Number(form.deliveryFee || 0),
        minOrderAmount: Number(form.minOrderAmount || 0),
        etaMinutes: Number(form.etaMinutes || 30),
        zip: form.zip || "",
        phone: form.phone || "",
        address: form.address || "",
        tags: typeof form.tags === 'string' ? JSON.parse(form.tags || "[]") : (form.tags || []),
        openingHours: typeof form.openingHours === 'string' ? JSON.parse(form.openingHours || "{}") : (form.openingHours || {}),
      };

      if (selectedId) {
        await axios.patch(`${API_URL}/api/restaurants/${selectedId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_URL}/api/restaurants`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      await fetchRestaurants();
      setActiveTab("OVERVIEW");
      setSelectedId(null);
    } catch (error: any) {
      alert(error.response?.data?.error || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Radera restaurangen permanent? Detta tar även bort alla dess ordrar och menyprodukter.")) return;
    try {
      await axios.delete(`${API_URL}/api/restaurants/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchRestaurants();
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      alert("Kunde inte radera restaurang");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'imageUrl' | 'heroImageUrl') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-gold-500" size={48} />
        <p className="text-white/40 font-black uppercase tracking-[0.3em] text-xs">Laddar plattformen...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Superior Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 border border-gold-500/20 text-gold-500">
               <LayoutDashboard size={24} />
            </div>
            <div>
               <h1 className="text-4xl font-black uppercase tracking-tight">Plattformsöversikt</h1>
               <p className="text-white/40 font-medium tracking-wide">Hantera alla anslutna restauranger och deras synlighet.</p>
            </div>
          </div>
          
          <div className="flex gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl w-fit">
            <button 
              onClick={() => { setActiveTab("OVERVIEW"); setSelectedId(null); }}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "OVERVIEW" ? "bg-gold-500 text-dark-500" : "text-white/40 hover:text-white"}`}
            >
              Lista
            </button>
            <button 
              onClick={() => { setActiveTab("EDIT"); setForm(emptyForm); setSelectedId(null); }}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "EDIT" && !selectedId ? "bg-gold-500 text-dark-500" : "text-white/40 hover:text-white"}`}
            >
              Lägg till ny
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Sök restauranger..."
                className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 outline-none focus:ring-2 focus:ring-gold-500/20 transition-all text-sm w-full lg:w-72"
              />
           </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "OVERVIEW" ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
          >
            {filteredRestaurants.map((r) => (
              <div 
                key={r.id} 
                onClick={() => { setSelectedId(r.id); setActiveTab("EDIT"); }}
                className="group relative bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-gold-500/30 transition-all cursor-pointer flex flex-col h-[480px]"
              >
                 {/* Hero Header */}
                 <div className="h-44 w-full bg-dark-500 relative">
                    {r.heroImageUrl ? (
                      <img src={r.heroImageUrl.startsWith('/') ? `${API_URL}${r.heroImageUrl}` : r.heroImageUrl} className="h-full w-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" alt={r.name} />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center opacity-10"><ImageIcon size={48} /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/40 to-transparent" />
                    
                    {/* Floating Avatar */}
                    <div className="absolute -bottom-6 left-8 h-20 w-20 rounded-2xl border-4 border-[#0d0d0d] overflow-hidden bg-dark-400 shadow-2xl shadow-black/50">
                       {r.imageUrl ? <img src={r.imageUrl.startsWith('/') ? `${API_URL}${r.imageUrl}` : r.imageUrl} className="h-full w-full object-cover" alt="" /> : <div className="h-full w-full flex items-center justify-center opacity-20"><Sparkles /></div>}
                    </div>

                    {/* Featured Badge */}
                    <div className="absolute top-4 right-6 flex flex-col items-end gap-2">
                       <span className={`rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest ${
                         r.featuredClass === 1 ? "bg-gold-500 text-dark-500 shadow-[0_0_20px_rgba(212,167,74,0.4)]" : 
                         r.featuredClass === 2 ? "bg-white/10 text-white/50 backdrop-blur-md" : 
                         "bg-white/5 text-white/20 border border-white/5"
                       }`}>
                          {r.featuredClass === 1 ? "Premium" : r.featuredClass === 2 ? "Standard" : "Dold"}
                       </span>
                    </div>
                 </div>

                 <div className="p-8 pt-10 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <h3 className="text-2xl font-black uppercase tracking-tight">{r.name}</h3>
                          <p className="text-xs text-gold-500 font-black uppercase tracking-[0.2em] mt-1">{r.cuisine || "Okänd genre"}</p>
                       </div>
                       <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                          <Star className="fill-gold-500 text-gold-500" size={14} />
                          <span className="text-xs font-black">{(r.rating ?? 4.6).toFixed(1)}</span>
                       </div>
                    </div>

                    <p className="text-sm text-white/40 line-clamp-2 mb-6 flex-1 italic leading-relaxed">
                       {r.description || "Ingen beskrivning tillagd."}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                       <div className="flex items-center gap-3 text-white/30">
                          <Clock size={16} className="text-gold-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest">{r.etaMinutes} MIN</span>
                       </div>
                       <div className="flex items-center gap-3 text-white/30">
                          <Bike size={16} className="text-gold-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest">{r.deliveryFee} KR</span>
                       </div>
                       <div className="flex items-center gap-3 text-white/30">
                          <MapPin size={16} className="text-gold-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest truncate">{r.city || "Lund"}</span>
                       </div>
                       <div className="flex items-center gap-3 text-white/30">
                          <Check size={16} className={r.isOpen ? "text-emerald-500" : "text-red-500"} />
                          <span className="text-[10px] font-black uppercase tracking-widest">{r.isOpen ? "Aktiv" : "Stängd"}</span>
                       </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-white/10 mt-auto">
                       <div className="flex gap-2">
                          <button 
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                            onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); setActiveTab("EDIT"); }}
                          >
                             <Settings size={16} />
                          </button>
                          <button 
                             onClick={(e) => handleDelete(r.id, e)}
                             className="p-3 bg-red-500/5 hover:bg-red-500/20 text-red-500 rounded-xl transition-all"
                          >
                             <Trash2 size={16} />
                          </button>
                       </div>
                       <div className="flex items-center gap-2 text-gold-500 text-[10px] font-black uppercase tracking-[0.2em]">
                          Redigera <ChevronRight size={14} />
                       </div>
                    </div>
                 </div>
              </div>
            ))}

            {/* Add New Card */}
            <div 
              onClick={() => { setActiveTab("EDIT"); setForm(emptyForm); setSelectedId(null); }}
              className="group border-4 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center p-12 hover:border-gold-500/30 transition-all bg-white/[0.02]"
            >
               <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-white/20 group-hover:text-gold-500 group-hover:scale-110 transition-all mb-6">
                  <Plus size={40} />
               </div>
               <h3 className="text-xl font-black uppercase tracking-tight text-white/20 group-hover:text-white transition-colors">Lägg till Restaurang</h3>
               <p className="text-white/10 text-xs font-bold uppercase tracking-widest mt-2">Expansion</p>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-6xl mx-auto"
          >
             <div className="grid lg:grid-cols-[1fr,380px] gap-10">
                {/* Main Form */}
                <div className="space-y-8">
                   <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-10 space-y-10">
                      <div>
                         <h2 className="text-2xl font-black uppercase tracking-tight mb-2 flex items-center gap-3">
                           <Sparkles className="text-gold-500" size={24} />
                           Grundlig information
                         </h2>
                         <p className="text-white/30 text-xs font-medium uppercase tracking-[0.2em]">Hur restaurangen presenteras för kunderna.</p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Restaurangnamn</label>
                            <input 
                              value={form.name} 
                              onChange={e => setForm({...form, name: e.target.value})}
                              className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" 
                              placeholder="t.ex. MatGo Sushi"
                            />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Kök / Genre</label>
                            <input 
                              value={form.cuisine} 
                              onChange={e => setForm({...form, cuisine: e.target.value})}
                              className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" 
                              placeholder="t.ex. Japanskt & Fusion"
                            />
                         </div>
                         <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Kort Pitch / Beskrivning</label>
                            <textarea 
                              value={form.description} 
                              onChange={e => setForm({...form, description: e.target.value})}
                              className="w-full bg-white/5 border border-white/5 rounded-3xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold h-32 resize-none" 
                              placeholder="Fånga kundens intresse..."
                            />
                         </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-8">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">City</label>
                            <div className="relative">
                               <MapPin size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" />
                               <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-14 pr-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" />
                            </div>
                         </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Telefonnummer</label>
                             <div className="relative">
                                <Phone size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" />
                                <input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-14 pr-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" placeholder="046-XXX XXX" />
                             </div>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Postnummer</label>
                             <input value={form.zip || ""} onChange={e => setForm({...form, zip: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" placeholder="222 10" />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Adress</label>
                          <input value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" placeholder="Gatan 10" />
                       </div>
                   </div>

                   <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-10 space-y-10">
                      <div>
                         <h2 className="text-2xl font-black uppercase tracking-tight mb-2 flex items-center gap-3">
                           <Bike className="text-gold-500" size={24} />
                           Logistik & Operations
                         </h2>
                         <p className="text-white/30 text-xs font-medium uppercase tracking-[0.2em]">Leveransvillkor och räckvidd.</p>
                      </div>

                      <div className="grid md:grid-cols-3 gap-6">
                         <div className="bg-dark-500 p-6 rounded-3xl border border-white/5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4 block">Minsta Order</label>
                            <div className="flex items-end gap-2">
                               <input type="number" value={form.minOrderAmount} onChange={e => setForm({...form, minOrderAmount: Number(e.target.value)})} className="bg-transparent text-3xl font-black w-full outline-none text-gold-500" />
                               <span className="font-black text-white/20 mb-1">KR</span>
                            </div>
                         </div>
                         <div className="bg-dark-500 p-6 rounded-3xl border border-white/5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4 block">Leveransavgift</label>
                            <div className="flex items-end gap-2">
                               <input type="number" value={form.deliveryFee} onChange={e => setForm({...form, deliveryFee: Number(e.target.value)})} className="bg-transparent text-3xl font-black w-full outline-none text-gold-500" />
                               <span className="font-black text-white/20 mb-1">KR</span>
                            </div>
                         </div>
                         <div className="bg-dark-500 p-6 rounded-3xl border border-white/5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4 block">ETA (Minuter)</label>
                            <div className="flex items-end gap-2">
                               <input type="number" value={form.etaMinutes} onChange={e => setForm({...form, etaMinutes: Number(e.target.value)})} className="bg-transparent text-3xl font-black w-full outline-none text-gold-500" />
                               <span className="font-black text-white/20 mb-1">MIN</span>
                            </div>
                         </div>
                      </div>

                      <div className="space-y-6">
                         <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Öppettider (Visuell hantering)</label>
                            <button 
                              type="button"
                              onClick={() => {
                                const current = JSON.parse(form.openingHours || "{}");
                                const next = { ...current };
                                const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
                                days.forEach(day => {
                                  if (!next[day]) next[day] = [];
                                  if (next[day].length === 0) {
                                    next[day].push({ open: "11:00", close: "22:00" });
                                  }
                                });
                                setForm({ ...form, openingHours: JSON.stringify(next) });
                              }}
                              className="text-[10px] font-black uppercase text-gold-500 hover:text-gold-400"
                            >
                              Lägg till standardtider
                            </button>
                         </div>
                         
                         <div className="grid md:grid-cols-2 gap-4">
                            {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => {
                              let hoursObj: any = {};
                              try { hoursObj = JSON.parse(form.openingHours || "{}"); } catch { hoursObj = {}; }
                              const slots = hoursObj[day] || [];
                              const dayNames: any = { monday: "Måndag", tuesday: "Tisdag", wednesday: "Onsdag", thursday: "Torsdag", friday: "Fredag", saturday: "Lördag", sunday: "Söndag" };
                              
                              return (
                                <div key={day} className="bg-dark-500 rounded-2xl border border-white/5 p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-black uppercase tracking-widest text-white/60">{dayNames[day]}</span>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const next = { ...hoursObj };
                                        if (!next[day]) next[day] = [];
                                        next[day].push({ open: "11:00", close: "22:00" });
                                        setForm({ ...form, openingHours: JSON.stringify(next) });
                                      }}
                                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gold-500 transition-all"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    {slots.length === 0 ? (
                                      <div className="text-[10px] font-bold text-red-500/50 uppercase italic px-2 py-1">Stängt</div>
                                    ) : (
                                      slots.map((slot: any, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2">
                                          <input 
                                            type="time" 
                                            value={slot.open} 
                                            onChange={e => {
                                              const next = { ...hoursObj };
                                              next[day][idx].open = e.target.value;
                                              setForm({ ...form, openingHours: JSON.stringify(next) });
                                            }}
                                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-gold-500/30 outline-none" 
                                          />
                                          <span className="text-white/20">-</span>
                                          <input 
                                            type="time" 
                                            value={slot.close} 
                                            onChange={e => {
                                              const next = { ...hoursObj };
                                              next[day][idx].close = e.target.value;
                                              setForm({ ...form, openingHours: JSON.stringify(next) });
                                            }}
                                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-gold-500/30 outline-none" 
                                          />
                                          <button 
                                            type="button"
                                            onClick={() => {
                                              const next = { ...hoursObj };
                                              next[day].splice(idx, 1);
                                              setForm({ ...form, openingHours: JSON.stringify(next) });
                                            }}
                                            className="p-1.5 text-red-500/30 hover:text-red-500 transition-colors"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                         </div>
                      </div>
                   </div>

                   <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-10 space-y-10">
                      <div>
                         <h2 className="text-2xl font-black uppercase tracking-tight mb-2 flex items-center gap-3 text-red-400">
                           <Lock size={24} />
                           Admin-inloggning
                         </h2>
                         <p className="text-white/30 text-xs font-medium uppercase tracking-[0.2em]">Hantera inloggningsuppgifter för denna restaurang.</p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Användarnamn (Slug)</label>
                            <input 
                              value={form.slug} 
                              onChange={e => setForm({...form, slug: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-mono text-sm" 
                            />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Nytt Lösenord</label>
                            <input 
                              type="password"
                              value={form.adminPassword || ""} 
                              onChange={e => setForm({...form, adminPassword: e.target.value})}
                              className="w-full bg-white/10 border border-gold-500/30 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold" 
                              placeholder="Lämna tomt för att behålla"
                            />
                         </div>
                      </div>
                      <div className="p-4 bg-gold-500/5 border border-gold-500/10 rounded-2xl flex items-start gap-3">
                        <Info size={16} className="text-gold-500 mt-0.5" />
                        <p className="text-[10px] font-medium leading-relaxed uppercase opacity-50">
                          Restaurangens admin loggar in med användarnamnet <span className="text-gold-500 font-black">{form.slug}</span> och det lösenord du anger här.
                        </p>
                      </div>
                   </div>

                   <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-10 space-y-10">
                      <div>
                         <h2 className="text-2xl font-black uppercase tracking-tight mb-2 flex items-center gap-3 text-sky-400">
                           <Users size={24} />
                           Endast Superior (Intern Info)
                         </h2>
                         <p className="text-white/30 text-xs font-medium uppercase tracking-[0.2em]">Information som endast du som Super Admin kan se.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Interna anteckningar</label>
                        <textarea 
                          value={form.internalInfo || ""} 
                          onChange={e => setForm({...form, internalInfo: e.target.value})}
                          className="w-full bg-white/5 border border-white/5 rounded-3xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold h-32 resize-none border-l-4 border-l-sky-500" 
                          placeholder="T.ex. Kontaktperson, Avtalsdetaljer, Swish-nummer..."
                        />
                      </div>
                   </div>
                </div>

                {/* Sidebar Controls */}
                <div className="space-y-8">
                   {/* Coverage Images */}
                   <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-10 shadow-2xl">
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight mb-6 italic">Visuellt</h3>
                        
                        {/* Cover (Hero) Photo */}
                        <div className="space-y-4 mb-8">
                           <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Cover Photo (Banner)</label>
                           <div 
                             onClick={() => heroInputRef.current?.click()}
                             className="group relative h-40 w-full rounded-2xl border-2 border-dashed border-white/10 overflow-hidden bg-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-gold-500/30 transition-all shadow-xl"
                           >
                              {form.heroImageUrl ? (
                                <>
                                  <img src={form.heroImageUrl.startsWith('data:') ? form.heroImageUrl : (form.heroImageUrl.startsWith('/') ? `${API_URL}${form.heroImageUrl}` : form.heroImageUrl)} className="h-full w-full object-cover opacity-60 group-hover:scale-105 transition-all" alt="" />
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all">
                                     <Upload className="text-white" />
                                  </div>
                                </>
                              ) : (
                                <>
                                   <ImageIcon className="text-white/10 group-hover:text-gold-500 mb-2" size={32} />
                                   <span className="text-[10px] font-black text-white/20 uppercase">Byt Cover</span>
                                </>
                              )}
                              <input ref={heroInputRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'heroImageUrl')} />
                           </div>
                        </div>

                        {/* Profile Photo */}
                        <div className="space-y-4">
                           <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Logo / Avatar</label>
                           <div className="flex items-center gap-6">
                              <div className="h-24 w-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-2xl ring-1 ring-white/5 leading-none">
                                {form.imageUrl ? <img src={form.imageUrl.startsWith('data:') ? form.imageUrl : (form.imageUrl.startsWith('/') ? `${API_URL}${form.imageUrl}` : form.imageUrl)} className="h-full w-full object-cover" alt="" /> : <Plus className="text-white/10" />}
                              </div>
                              <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest transition-all"
                              >
                                Välj Bild
                              </button>
                              <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'imageUrl')} />
                           </div>
                        </div>
                      </div>
                   </div>

                   {/* Visibility Controls */}
                   <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-8">
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight mb-4">Synlighet</h3>
                        <div className="space-y-4">
                           <div className="flex items-center justify-between p-4 bg-dark-500 rounded-2xl border border-white/5">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black uppercase tracking-widest">Öppen för köp</span>
                              </div>
                              <button 
                                onClick={() => setForm({...form, isOpen: !form.isOpen})}
                                className={`h-8 w-14 rounded-full relative transition-all ${form.isOpen ? 'bg-gold-500' : 'bg-white/10'}`}
                              >
                                 <motion.div 
                                   animate={{ x: form.isOpen ? 24 : 4 }}
                                   className={`h-6 w-6 rounded-full bg-dark-500 absolute top-1 shadow-md`} 
                                 />
                              </button>
                           </div>

                           <div className="p-4 bg-dark-500 rounded-2xl border border-white/5 space-y-4">
                              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 block">Featured Class (Nivå)</label>
                              <div className="flex gap-2">
                                 {[1, 2, 3].map(cls => (
                                    <button 
                                      key={cls}
                                      onClick={() => setForm({...form, featuredClass: cls})}
                                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.featuredClass === cls ? 'bg-gold-500 text-dark-500 shadow-[0_0_15px_rgba(212,167,74,0.3)]' : 'bg-white/5 text-white/30'}`}
                                    >
                                       {cls === 1 ? '🥇' : cls === 2 ? '🥈' : '🥉'}
                                    </button>
                                 ))}
                              </div>
                              <div className="flex items-start gap-2 pt-2 opacity-40">
                                 <Info size={12} className="shrink-0 mt-0.5" />
                                 <p className="text-[9px] font-medium leading-relaxed uppercase">Klass 1 & 2 syns på sidan. Klass 3 är dold plattform-vid.</p>
                              </div>
                           </div>
                        </div>
                      </div>

                      <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-5 bg-gold-500 hover:bg-gold-400 text-dark-500 font-extrabold rounded-2xl shadow-2xl transition-all shadow-gold-500/20 active:scale-95 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-sm"
                      >
                        {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        Publicera ändringar
                      </button>
                   </div>

                   {selectedId && (
                     <div className="bg-red-500/5 border border-red-500/10 rounded-[2.5rem] p-8 text-center space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Fara</p>
                        <button 
                          onClick={(e) => handleDelete(selectedId, e)}
                          className="text-red-500/30 hover:text-red-500 text-xs font-bold uppercase tracking-widest underline decoration-2 underline-offset-8 transition-colors"
                        >
                          Radera Restaurang Permanent
                        </button>
                     </div>
                   )}
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
