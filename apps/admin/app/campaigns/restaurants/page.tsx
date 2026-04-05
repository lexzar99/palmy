/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Store, 
  Plus, 
  Search, 
  ChevronRight, 
  Percent, 
  Gift, 
  X, 
  Trash2,
  Settings2,
  ArrowLeft,
  CheckCircle2,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export default function RestaurantCampaignsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);

  const getToken = () => localStorage.getItem("palmyra_token");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dealsRes, restaurantsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/deals`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        }),
        axios.get(`${API_URL}/api/restaurants`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })
      ]);
      setDeals(dealsRes.data);
      setRestaurants(restaurantsRes.data);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateDeal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    
    try {
      await axios.post(`${API_URL}/api/admin/deals`, {
        ...data,
        discountValue: Number(data.discountValue),
        minOrder: Number(data.minOrder || 0),
        sortOrder: Number(data.sortOrder || 0),
        isActive: true,
        showOnSite: true,
        isGlobal: !data.restaurantId
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setShowCreateModal(false);
      fetchData();
    } catch { alert("Kunde inte skapa erbjudande"); }
  };

  const handleDeleteDeal = async (id: string) => {
    if (!confirm("Är du säker på att du vill radera detta erbjudande?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/deals/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSelectedDeal(null);
      fetchData();
    } catch { alert("Kunde inte radera"); }
  };

  const toggleDealStatus = async (id: string, current: boolean) => {
    try {
      await axios.patch(`${API_URL}/api/admin/deals/${id}`, { isActive: !current }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchData();
    } catch { alert("Kunde inte uppdatera"); }
  };

  return (
    <div className="min-h-screen bg-[#02040a] p-4 lg:p-10 text-white font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div className="flex flex-col gap-4">
             <Link href="/campaigns" className="flex items-center gap-2 text-white/20 hover:text-white transition-all text-xs font-black uppercase tracking-widest">
                <ArrowLeft size={14} /> Tillbaka
             </Link>
             <div>
                <div className="flex items-center gap-3 mb-2 text-emerald-500">
                  <Store size={20} />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none">Meny-erbjudanden</span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase italic leading-none">
                  RESTAURANG <span className="text-emerald-500">DEALS</span>
                </h1>
             </div>
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-4 px-8 py-5 bg-emerald-500 text-dark-500 font-black uppercase tracking-widest text-[11px] rounded-[2rem] hover:bg-emerald-400 transition-all shadow-2xl shadow-emerald-500/10 active:scale-95"
          >
            <Plus size={18} /> Nytt Erbjudande
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          
          {/* List Section */}
          <div className="space-y-4">
             <div className="flex items-center justify-between px-8 py-4 bg-[#0a0c14] border border-white/5 rounded-3xl mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Aktiva i Menyn ({deals.length})</span>
                <Settings2 size={16} className="text-white/10" />
             </div>

             {loading ? (
                [1,2,3].map(i => <div key={i} className="h-32 rounded-3xl bg-white/5 animate-pulse border border-white/5" />)
             ) : deals.length === 0 ? (
                <div className="py-20 text-center bg-[#0a0c14] rounded-3xl border border-dashed border-white/5 flex flex-col items-center">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4"><Gift className="text-white/10" size={32} /></div>
                   <p className="font-black uppercase tracking-widest text-white/20">Inga erbjudanden än</p>
                </div>
             ) : (
                deals.map(d => (
                  <button 
                    key={d.id} 
                    onClick={() => setSelectedDeal(d)}
                    className={`w-full text-left group p-8 rounded-[2.5rem] border transition-all hover:pl-10 ${selectedDeal?.id === d.id ? "bg-emerald-500/5 border-emerald-500 shadow-2xl" : "bg-[#0a0c14] border-white/5 hover:border-white/10"}`}
                  >
                    <div className="flex items-start justify-between mb-6">
                       <div className="flex-1 min-w-0 pr-4">
                          <h3 className="text-2xl font-black italic tracking-tighter uppercase mb-2 group-hover:text-emerald-500 transition-colors truncate">{d.title}</h3>
                          <div className="flex items-center gap-4">
                             <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                {d.discountValue} {d.discountType === "PERCENTAGE" ? "%" : "KR"}
                             </div>
                             <div className="text-[10px] font-black uppercase tracking-widest text-white/20 truncate">{d.restaurant?.name || "Global / Alla"}</div>
                          </div>
                       </div>
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${d.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                          {d.isActive ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                       </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-white/20">Min: {d.minOrder} kr</div>
                        <div className="flex items-center gap-3">
                           <button 
                             onClick={(e) => { e.stopPropagation(); toggleDealStatus(d.id, d.isActive); }}
                             className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${d.isActive ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}
                           >
                             {d.isActive ? "Pausa" : "Aktivera"}
                           </button>
                        </div>
                    </div>
                  </button>
                ))
             )}
          </div>

          {/* Settings Section */}
          <div className="relative">
             <AnimatePresence mode="wait">
                {selectedDeal ? (
                  <motion.div 
                    key={selectedDeal.id}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    className="sticky top-10 space-y-6"
                  >
                     <div className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] p-10 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl pointer-events-none" />
                        
                        <div className="flex items-start justify-between mb-8">
                           <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-2">Erbjudande Inställningar</div>
                              <h2 className="text-3xl font-black tracking-tighter uppercase italic">{selectedDeal.title}</h2>
                           </div>
                           <button onClick={() => setSelectedDeal(null)} className="p-2 hover:bg-white/5 rounded-xl transition-all"><X size={20} className="text-white/20" /></button>
                        </div>

                        <p className="text-sm font-bold text-white/40 mb-10 leading-relaxed max-w-md">{selectedDeal.description || "Ingen beskrivning angiven."}</p>

                        <div className="grid grid-cols-2 gap-4 mb-10">
                           {[
                              { label: "Värde", val: `${selectedDeal.discountValue}${selectedDeal.discountType === "PERCENTAGE" ? "%" : " kr"}` },
                              { label: "Minsta Order", val: `${selectedDeal.minOrder} kr` },
                              { label: "Prioritet (Sjö)", val: selectedDeal.sortOrder },
                              { label: "Synlig på sajt", val: selectedDeal.showOnSite ? "Ja" : "Nej" }
                           ].map(stat => (
                             <div key={stat.label} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{stat.label}</div>
                                <div className="text-xs font-black uppercase tracking-tight text-white/80">{stat.val}</div>
                             </div>
                           ))}
                        </div>

                        <div className="space-y-4">
                           <button 
                             onClick={() => toggleDealStatus(selectedDeal.id, selectedDeal.isActive)}
                             className={`w-full py-5 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${selectedDeal.isActive ? "border-rose-500/20 text-rose-500 bg-rose-500/5" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"}`}
                           >
                              {selectedDeal.isActive ? "Avaktivera Erbjudande" : "Aktivera Erbjudande"}
                           </button>
                           <button 
                             onClick={() => handleDeleteDeal(selectedDeal.id)}
                             className="w-full py-5 rounded-2xl bg-white/2 border border-white/5 text-[11px] font-black uppercase tracking-widest text-white/10 hover:text-rose-500 hover:border-rose-500/30 transition-all flex items-center justify-center gap-3"
                           >
                              <Trash2 size={16} /> Radera Permanent
                           </button>
                        </div>
                     </div>
                  </motion.div>
                ) : (
                  <div className="sticky top-10 h-[500px] border border-dashed border-white/10 rounded-[2.5rem] bg-[#0a0c14] flex flex-col items-center justify-center text-center p-10">
                     <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6"><Gift className="text-white/10" size={40} /></div>
                     <h3 className="text-xl font-black uppercase tracking-widest text-white/20 mb-2">Välj ett erbjudande</h3>
                     <p className="text-[10px] font-bold uppercase tracking-widest text-white/10 leading-relaxed max-w-[200px]">Justera villkor och synlighet för dina restaurangerbjudanden.</p>
                  </div>
                )}
             </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl bg-[#0a0c14] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="p-10 border-b border-white/5 flex items-center justify-between">
                   <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Skapa <span className="text-emerald-500">Nytt Deal</span></h2>
                   <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white/5 rounded-xl"><X size={24} className="text-white/20" /></button>
                </div>
                
                <form onSubmit={handleCreateDeal} className="p-10 space-y-6">
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Titel (Synlig för kund)</label>
                        <input name="title" required placeholder="t.ex. 20% på hela menyn" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none placeholder:text-white/10" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Restaurang</label>
                        <select name="restaurantId" className="w-full bg-[#121421] border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none appearance-none">
                           <option value="">Global (Alla restauranger)</option>
                           {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Rabatt-typ</label>
                        <select name="discountType" className="w-full bg-[#121421] border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none appearance-none">
                           <option value="PERCENTAGE">Procent (%)</option>
                           <option value="FIXED">Fast Belopp (kr)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Rabattvärde</label>
                        <input name="discountValue" type="number" required placeholder="t.ex 15" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Minsta Ordersumma (kr)</label>
                        <input name="minOrder" type="number" defaultValue="0" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Sorteringsordning</label>
                        <input name="sortOrder" type="number" defaultValue="0" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none" />
                      </div>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Kort beskrivning</label>
                      <textarea name="description" placeholder="Berätta kort om villkoren..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none h-24" />
                   </div>
                   
                   <div className="pt-6 flex gap-4">
                      <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[11px] font-black uppercase tracking-[0.2em] transition-all">Avbryt</button>
                      <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-dark-500 text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-500/10">Skapa Erbjudande</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
