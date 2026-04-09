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
  XCircle,
  ImageIcon,
  Upload
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

  const getToken = () => localStorage.getItem("matgo_token");

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
    const selectedRestaurantId = typeof data.restaurantId === "string" && data.restaurantId.trim() ? data.restaurantId : null;
    
    try {
      await axios.post(`${API_URL}/api/admin/deals`, {
        ...data,
        discountValue: Number(data.discountValue),
        minOrder: Number(data.minOrder || 0),
        sortOrder: Number(data.sortOrder || 0),
        isActive: true,
        showOnSite: true,
        restaurantId: selectedRestaurantId,
        isGlobal: !selectedRestaurantId,
        applicableRestaurantIds: JSON.stringify(selectedRestaurantId ? [selectedRestaurantId] : [])
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
    <div className="min-h-screen glass p-4 lg:p-10 text-[var(--text-primary)] font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div className="flex flex-col gap-4">
             <Link href="/campaigns" className="flex items-center gap-2 text-[var(--text-primary)]/20 hover:text-[var(--text-primary)] transition-all text-xs font-black uppercase tracking-widest">
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
             <div className="flex items-center justify-between px-8 py-4 glass border border-[var(--border-subtle)] rounded-3xl mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20">Aktiva i Menyn ({deals.length})</span>
                <Settings2 size={16} className="text-[var(--text-primary)]/10" />
              </div>

             <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-5 text-[11px] font-bold leading-relaxed text-[var(--text-primary)]/60">
               Publika deals skickas ut via `api/deals` och kan visas i webben samt i `REACT MATGO`. Välj en restaurang om erbjudandet bara ska gälla där, eller lämna tomt för en global deal.
             </div>

             {loading ? (
                [1,2,3].map(i => <div key={i} className="h-32 rounded-3xl bg-[var(--border-subtle)] animate-pulse border border-[var(--border-subtle)]" />)
             ) : deals.length === 0 ? (
                <div className="py-20 text-center glass rounded-3xl border border-dashed border-[var(--border-subtle)] flex flex-col items-center">
                   <div className="w-16 h-16 bg-[var(--border-subtle)] rounded-full flex items-center justify-center mb-4"><Gift className="text-[var(--text-primary)]/10" size={32} /></div>
                   <p className="font-black uppercase tracking-widest text-[var(--text-primary)]/20">Inga erbjudanden än</p>
                </div>
             ) : (
                deals.map(d => (
                  <button 
                    key={d.id} 
                    onClick={() => setSelectedDeal(d)}
                    className={`w-full text-left group p-8 rounded-[2.5rem] border transition-all hover:pl-10 ${selectedDeal?.id === d.id ? "bg-emerald-500/5 border-emerald-500 shadow-2xl" : "glass border-[var(--border-subtle)] hover:border-[var(--border-strong)]"}`}
                  >
                    <div className="flex items-start justify-between mb-6">
                       <div className="flex-1 min-w-0 pr-4">
                          <h3 className="text-2xl font-black italic tracking-tighter uppercase mb-2 group-hover:text-emerald-500 transition-colors truncate">{d.title}</h3>
                             <div className="flex items-center gap-4">
                               <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                 {d.discountValue} {d.discountType === "PERCENTAGE" ? "%" : "KR"}
                               </div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 truncate">
                                {d.restaurant?.name || (d.applicableRestaurantIds?.length ? "Utvalda restauranger" : "Global / Alla")}
                              </div>
                           </div>
                       </div>
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${d.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                          {d.isActive ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                       </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-[var(--border-subtle)]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20">Min: {d.minOrder} kr</div>
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
                     <div className="glass border border-[var(--border-strong)] rounded-[2.5rem] p-10 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl pointer-events-none" />
                        
                        <div className="flex items-start justify-between mb-8">
                           <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-2">Erbjudande Inställningar</div>
                              <h2 className="text-3xl font-black tracking-tighter uppercase italic">{selectedDeal.title}</h2>
                           </div>
                           <button onClick={() => setSelectedDeal(null)} className="p-2 hover:bg-[var(--border-subtle)] rounded-xl transition-all"><X size={20} className="text-[var(--text-primary)]/20" /></button>
                        </div>

                        <p className="text-sm font-bold text-[var(--text-primary)]/40 mb-10 leading-relaxed max-w-md">{selectedDeal.description || "Ingen beskrivning angiven."}</p>

                        <div className="grid grid-cols-2 gap-4 mb-10">
                           <div className="space-y-4">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Rabattvärde</label>
                              <div className="flex bg-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] p-2 overflow-hidden items-center">
                                <input 
                                  type="number"
                                  value={selectedDeal.discountValue}
                                  onChange={e => setSelectedDeal({ ...selectedDeal, discountValue: Number(e.target.value) })}
                                  className="bg-transparent flex-1 outline-none px-4 text-sm font-black"
                                />
                                <div className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase">
                                  {selectedDeal.discountType === "PERCENTAGE" ? "%" : "kr"}
                                </div>
                              </div>
                           </div>
                           <div className="space-y-4">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Minsta Order</label>
                              <div className="flex bg-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] p-2 overflow-hidden items-center">
                                <input 
                                  type="number"
                                  value={selectedDeal.minOrder}
                                  onChange={e => setSelectedDeal({ ...selectedDeal, minOrder: Number(e.target.value) })}
                                  className="bg-transparent flex-1 outline-none px-4 text-sm font-black"
                                />
                                <div className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                  KR
                                </div>
                              </div>
                           </div>
                           <div className="space-y-4">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Sortering (Högst först)</label>
                              <input 
                                type="number"
                                value={selectedDeal.sortOrder}
                                onChange={e => setSelectedDeal({ ...selectedDeal, sortOrder: Number(e.target.value) })}
                                className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl p-4 text-sm font-black outline-none focus:ring-1 focus:ring-emerald-500/50"
                              />
                           </div>
                           <div className="space-y-4 col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Erbjudande Bild (Frivillig)</label>
                              <div className="flex items-center gap-4">
                                <div className="h-20 w-20 rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center text-emerald-500/20">
                                   {selectedDeal.imageUrl ? <img src={selectedDeal.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon size={30} />}
                                </div>
                                <div className="flex-1">
                                   <input 
                                     type="text"
                                     value={selectedDeal.imageUrl || ""}
                                     onChange={e => setSelectedDeal({ ...selectedDeal, imageUrl: e.target.value })}
                                     placeholder="Bild URL (t.ex. /burger.png)"
                                     className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs font-bold outline-none mb-2"
                                   />
                                   <div className="flex items-center gap-2">
                                      <button 
                                        className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400 transition-all flex items-center gap-1"
                                        onClick={() => {
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.accept = 'image/*';
                                          input.onchange = (e: any) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                              const reader = new FileReader();
                                              reader.onload = () => setSelectedDeal({ ...selectedDeal, imageUrl: reader.result });
                                              reader.readAsDataURL(file);
                                            }
                                          };
                                          input.click();
                                        }}
                                      >
                                         <Upload size={12} /> Ladda upp bild
                                      </button>
                                   </div>
                                </div>
                              </div>
                           </div>

                           <div className="space-y-4 col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Kopplade Restauranger</label>
                              <div className="p-4 bg-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] max-h-40 overflow-y-auto space-y-2 no-scrollbar">
                                 <label className="flex items-center gap-3 cursor-pointer group">
                                     <input 
                                       type="checkbox"
                                       checked={selectedDeal.isGlobal}
                                       onChange={() => setSelectedDeal({ ...selectedDeal, isGlobal: !selectedDeal.isGlobal, applicableRestaurantIds: [], restaurantId: null })}
                                       className="w-5 h-5 rounded-lg border-2 border-[var(--border-strong)] bg-obsidian text-emerald-500 focus:ring-emerald-500/50"
                                     />
                                    <span className="text-[11px] font-black uppercase tracking-widest group-hover:text-emerald-500 transition-colors">Global (Alla restauranger)</span>
                                 </label>
                                      {!selectedDeal.isGlobal && (
                                        <div className="pt-2 border-t border-[var(--border-strong)] space-y-2">
                                       {restaurants.map(r => {
                                          const ids = Array.isArray(selectedDeal.applicableRestaurantIds) ? selectedDeal.applicableRestaurantIds : [];
                                          return (
                                            <label key={r.id} className="flex items-center gap-3 cursor-pointer group">
                                              <input 
                                                type="checkbox"
                                                checked={ids.includes(r.id)}
                                                onChange={() => {
                                                    const newIds = ids.includes(r.id) ? ids.filter((id: string) => id !== r.id) : [...ids, r.id];
                                                    setSelectedDeal({ ...selectedDeal, applicableRestaurantIds: newIds, restaurantId: newIds.length === 1 ? newIds[0] : null });
                                                 }}
                                                className="w-5 h-5 rounded-lg border-2 border-[var(--border-strong)] bg-obsidian text-emerald-500 focus:ring-emerald-500/50"
                                              />
                                              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 group-hover:text-emerald-500 transition-all">{r.name}</span>
                                           </label>
                                         );
                                      })}
                                   </div>
                                 )}
                              </div>
                           </div>
                           
                           <div className="space-y-4">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Visa i Produktion</label>
                              <button 
                                onClick={() => setSelectedDeal({ ...selectedDeal, showOnSite: !selectedDeal.showOnSite })}
                                className={`w-full py-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${selectedDeal.showOnSite ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-[var(--border-subtle)] border-[var(--border-strong)] text-[var(--text-primary)]/20"}`}
                              >
                                 {selectedDeal.showOnSite ? "Aktiv på Sidan" : "Dold på Sidan"}
                              </button>
                           </div>
                        </div>

                        <div className="space-y-4">
                            <button 
                              onClick={async () => {
                                try {
                                  const { restaurant, ...cleanDeal } = selectedDeal;
                                  const applicableRestaurantIds = Array.isArray(cleanDeal.applicableRestaurantIds) ? cleanDeal.applicableRestaurantIds : [];
                                  await axios.patch(`${API_URL}/api/admin/deals/${selectedDeal.id}`, {
                                    ...cleanDeal,
                                    restaurantId: cleanDeal.isGlobal ? null : (applicableRestaurantIds.length === 1 ? applicableRestaurantIds[0] : cleanDeal.restaurantId || null),
                                    applicableRestaurantIds,
                                  }, {
                                    headers: { Authorization: `Bearer ${getToken()}` }
                                  });
                                  fetchData();
                                 alert("Spara lyckades!");
                               } catch { alert("Kunde inte spara"); }
                             }}
                             className="w-full py-5 bg-emerald-500 text-dark-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20"
                           >
                              Spara Ändringar
                           </button>
                           <button 
                             onClick={() => toggleDealStatus(selectedDeal.id, selectedDeal.isActive)}
                             className={`w-full py-5 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${selectedDeal.isActive ? "border-rose-500/20 text-rose-500 bg-rose-500/5 hover:bg-rose-500/10" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10"}`}
                           >
                              {selectedDeal.isActive ? "Pausa tillfälligt" : "Aktivera nu"}
                           </button>
                           <button 
                             onClick={() => handleDeleteDeal(selectedDeal.id)}
                             className="w-full py-5 rounded-2xl bg-white/2 border border-[var(--border-subtle)] text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]/10 hover:text-rose-500 hover:border-rose-500/30 transition-all flex items-center justify-center gap-3"
                           >
                              <Trash2 size={16} /> Radera Permanent
                           </button>
                        </div>
                     </div>
                  </motion.div>
                ) : (
                  <div className="sticky top-10 h-[500px] border border-dashed border-[var(--border-strong)] rounded-[2.5rem] glass flex flex-col items-center justify-center text-center p-10">
                     <div className="w-20 h-20 bg-[var(--border-subtle)] rounded-full flex items-center justify-center mb-6"><Gift className="text-[var(--text-primary)]/10" size={40} /></div>
                     <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-2">Välj ett erbjudande</h3>
                     <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]/10 leading-relaxed max-w-[200px]">Justera villkor och synlighet för dina restaurangerbjudanden.</p>
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
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl glass border border-[var(--border-strong)] rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="p-10 border-b border-[var(--border-subtle)] flex items-center justify-between">
                   <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Skapa <span className="text-emerald-500">Nytt Deal</span></h2>
                   <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-[var(--border-subtle)] rounded-xl"><X size={24} className="text-[var(--text-primary)]/20" /></button>
                </div>
                
                <form onSubmit={handleCreateDeal} className="p-10 space-y-6">
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Titel (Synlig för kund)</label>
                        <input name="title" required placeholder="t.ex. 20% på hela menyn" className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none placeholder:text-[var(--text-primary)]/10" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Restaurang / Global synlighet</label>
                        <select name="restaurantId" className="w-full bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none appearance-none">
                           <option value="">Global (Alla restauranger)</option>
                           {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Rabatt-typ</label>
                        <select name="discountType" className="w-full bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none appearance-none">
                           <option value="PERCENTAGE">Procent (%)</option>
                           <option value="FIXED">Fast Belopp (kr)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Rabattvärde</label>
                        <input name="discountValue" type="number" required placeholder="t.ex 15" className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Minsta Ordersumma (kr)</label>
                        <input name="minOrder" type="number" defaultValue="0" className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Sorteringsordning</label>
                        <input name="sortOrder" type="number" defaultValue="0" className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none" />
                      </div>
                   </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-2">Kort beskrivning</label>
                       <textarea name="description" placeholder="Berätta kort om villkoren..." className="w-full bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500/40 outline-none h-24" />
                    </div>

                    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--border-subtle)] px-5 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 leading-relaxed">
                      Skapar du här blir det en publik deal som visas för kunder via `api/deals`. För riktade kunddeals använder du sidan Kund Unika Deals.
                    </div>
                   
                   <div className="pt-6 flex gap-4">
                      <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-4 rounded-2xl bg-[var(--border-subtle)] hover:bg-white/10 text-[11px] font-black uppercase tracking-[0.2em] transition-all">Avbryt</button>
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
