/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Sparkles, 
  Plus, 
  Search, 
  ChevronRight, 
  Calendar, 
  Percent, 
  Gift, 
  Users, 
  Filter, 
  CheckCircle2, 
  X, 
  Settings2,
  Trash2,
  Clock,
  ArrowRight,
  UserCheck,
  PackageCheck
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  const getToken = () => localStorage.getItem("palmyra_token");

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/campaigns`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setCampaigns(res.data);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const handleCreateCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await axios.post(`${API_URL}/api/campaigns`, {
        ...data,
        discountValue: Number(data.discountValue),
        minOrder: Number(data.minOrder),
        maxUsagesPerCustomer: Number(data.maxUsagesPerCustomer)
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setShowCreateModal(false);
      fetchCampaigns();
    } catch { alert("Kunde inte skapa kampanj"); }
  };

  const handleGenerateDeals = async (campaignId: string, filters: any) => {
    try {
      const res = await axios.post(`${API_URL}/api/campaigns/${campaignId}/generate`, filters, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      alert(`Klart! Genererade ${res.data.generated} unika koder.`);
      setShowGenerateModal(null);
      fetchCampaigns();
    } catch { alert("Gick inte att generera koder"); }
  };

  return (
    <div className="min-h-screen bg-[#02040a] p-4 lg:p-10 text-white font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2 text-gold-500">
              <Sparkles size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none">Marketing Builder</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase italic leading-none">
              KUND <span className="text-gold-500">ERBJUDANDEN</span>
            </h1>
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-4 px-8 py-5 bg-gold-500 text-dark-500 font-black uppercase tracking-widest text-[11px] rounded-[2rem] hover:bg-gold-400 transition-all shadow-2xl shadow-gold-500/10 active:scale-95"
          >
            <Plus size={18} /> Skapa Ny Kampanj
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          
          {/* Campaigns List */}
          <div className="space-y-4">
             <div className="flex items-center justify-between px-8 py-4 bg-[#0a0c14] border border-white/5 rounded-3xl mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Aktiva Kampanjer ({campaigns.length})</span>
                <Settings2 size={16} className="text-white/10" />
             </div>

             {loading ? (
                [1,2,3].map(i => <div key={i} className="h-32 rounded-3xl bg-white/5 animate-pulse border border-white/5" />)
             ) : campaigns.length === 0 ? (
                <div className="py-20 text-center bg-[#0a0c14] rounded-3xl border border-dashed border-white/5 flex flex-col items-center">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4"><Gift className="text-white/10" size={32} /></div>
                   <p className="font-black uppercase tracking-widest text-white/20">Inga kampanjer än</p>
                </div>
             ) : (
                campaigns.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => setSelectedCampaign(c)}
                    className={`w-full text-left group p-8 rounded-[2.5rem] border transition-all hover:pl-10 ${selectedCampaign?.id === c.id ? "bg-gold-500/5 border-gold-500 shadow-2xl" : "bg-[#0a0c14] border-white/5 hover:border-white/10"}`}
                  >
                    <div className="flex items-start justify-between mb-6">
                       <div>
                          <h3 className="text-2xl font-black italic tracking-tighter uppercase mb-2 group-hover:text-gold-500 transition-colors">{c.title}</h3>
                          <div className="flex items-center gap-4">
                             <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                <Percent size={10} /> {c.discountValue} {c.discountType === "PERCENTAGE" ? "%" : "KR"}
                             </div>
                             <div className="text-[10px] font-black uppercase tracking-widest text-white/20">Min: {c.minOrder} kr</div>
                          </div>
                       </div>
                       <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gold-500"><Gift size={22} /></div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <div className="flex items-center gap-6">
                           <div className="flex flex-col gap-1">
                              <span className="text-[8px] font-black uppercase text-white/10 tracking-widest">Koder Skapade</span>
                              <span className="text-xs font-black text-white/60">{c._count.deals} st</span>
                           </div>
                           <div className="flex flex-col gap-1">
                              <span className="text-[8px] font-black uppercase text-white/10 tracking-widest">Giltig till</span>
                              <span className="text-xs font-black text-white/60">{c.validUntil ? new Date(c.validUntil).toLocaleDateString("sv-SE") : "Oändlig"}</span>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={(e) => { e.stopPropagation(); setShowGenerateModal(c); }}
                             className="px-5 py-2.5 bg-gold-500 text-dark-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gold-400 transition-all"
                           >
                             Generera Koder
                           </button>
                        </div>
                    </div>
                  </button>
                ))
             )}
          </div>

          {/* Details / Management Section */}
          <div className="relative">
             <AnimatePresence mode="wait">
                {selectedCampaign ? (
                  <motion.div 
                    key={selectedCampaign.id}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    className="sticky top-10 space-y-6"
                  >
                     <div className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] p-10 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 blur-3xl pointer-events-none" />
                        
                        <div className="flex items-start justify-between mb-8">
                           <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500 mb-2">Kampanjdetaljer</div>
                              <h2 className="text-3xl font-black tracking-tighter uppercase italic">{selectedCampaign.title}</h2>
                           </div>
                           <button onClick={fetchCampaigns} className="p-2 hover:bg-white/5 rounded-xl transition-all"><Clock size={20} className="text-white/20" /></button>
                        </div>

                        <p className="text-sm font-bold text-white/40 mb-10 leading-relaxed max-w-md">{selectedCampaign.description || "Ingen beskrivning angiven."}</p>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                           {[
                              { label: "Typ", val: selectedCampaign.discountType },
                              { label: "Värde", val: `${selectedCampaign.discountValue}${selectedCampaign.discountType === "PERCENTAGE" ? "%" : " kr"}` },
                              { label: "Minsta Order", val: `${selectedCampaign.minOrder} kr` },
                              { label: "Max/Kund", val: `${selectedCampaign.maxUsagesPerCustomer} gånger` },
                              { label: "Totalt Genererade", val: `${selectedCampaign._count.deals} st` },
                              { label: "Status", val: selectedCampaign.isActive ? "Aktiv" : "Pausad" }
                           ].map(stat => (
                             <div key={stat.label} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{stat.label}</div>
                                <div className="text-xs font-black uppercase tracking-tight text-white/80">{stat.val}</div>
                             </div>
                           ))}
                        </div>

                        <div className="pt-8 border-t border-white/5">
                           <h3 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-6 flex items-center gap-2"><UserCheck size={14} /> Senast Skapade Koder</h3>
                           <div className="space-y-2">
                             <div className="text-[10px] font-bold text-white/10 p-10 text-center bg-white/2 rounded-2xl border border-dashed border-white/5">
                                Redigera kampanjen för att ändra villkor eller generera fler koder till specifika förfinade målgrupper.
                             </div>
                           </div>
                        </div>

                        <button className="w-full mt-10 py-5 rounded-2xl border border-rose-500/20 text-rose-500 bg-rose-500/5 text-[11px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition-all flex items-center justify-center gap-3">
                           <Trash2 size={16} /> Radera Kampanj
                        </button>
                     </div>
                  </motion.div>
                ) : (
                  <div className="sticky top-10 h-[500px] border border-dashed border-white/10 rounded-[2.5rem] bg-[#0a0c14] flex flex-col items-center justify-center text-center p-10">
                     <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6"><Sparkles className="text-white/10" size={40} /></div>
                     <h3 className="text-xl font-black uppercase tracking-widest text-white/20 mb-2">Välj en kampanj</h3>
                     <p className="text-[10px] font-bold uppercase tracking-widest text-white/10 leading-relaxed max-w-[200px]">Hantera koder och se statistik för dina utskick.</p>
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
                   <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Skapa <span className="text-gold-500">Ny Kampanj</span></h2>
                   <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white/5 rounded-xl"><X size={24} className="text-white/20" /></button>
                </div>
                
                <form onSubmit={handleCreateCampaign} className="p-10 space-y-6">
                   <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Kampanjens Namn</label>
                            <input name="title" required placeholder="t.ex. Välkomstdeal" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Rabatt-typ</label>
                            <select name="discountType" className="w-full bg-[#121421] border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none appearance-none">
                               <option value="PERCENTAGE">Procent (%)</option>
                               <option value="FIXED">Fast Pris (kr)</option>
                            </select>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Rabattvärde</label>
                            <input name="discountValue" type="number" required placeholder="t.ex 20" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Minsta Order</label>
                            <input name="minOrder" type="number" defaultValue="0" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Max per kund</label>
                            <input name="maxUsagesPerCustomer" type="number" defaultValue="1" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Slutdatum</label>
                            <input name="validUntil" type="date" className="w-full bg-[#121421] border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Beskrivning Intern</label>
                         <textarea name="description" placeholder="Kort om kampanjens syfte..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none h-24" />
                      </div>
                   </div>
                   <div className="pt-6 flex gap-4">
                      <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[11px] font-black uppercase tracking-[0.2em] transition-all">Avbryt</button>
                      <button type="submit" className="flex-1 py-4 rounded-2xl bg-gold-500 hover:bg-gold-400 text-dark-500 text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-gold-500/10">Skapa Kampanj</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Generate Modal */}
      <AnimatePresence>
        {showGenerateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg bg-[#0a0c14] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 flex flex-col items-center">
                   <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center mb-4 text-gold-500"><Users size={24} /></div>
                   <h2 className="text-xl font-black uppercase italic tracking-tighter">Generera <span className="text-gold-500">Personliga Koder</span></h2>
                   <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-2">{showGenerateModal.title}</p>
                </div>
                
                <div className="p-10 space-y-6">
                   <div className="bg-white/2 border border-white/5 rounded-2xl p-6 text-center text-[11px] font-bold text-white/40 leading-relaxed">
                      Skapa unika koder kopplade till varje kunds nummer. Dessa kan endast användas av det kopplade kontot.
                   </div>
                   
                   <div className="space-y-6">
                      <div>
                         <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-4 block">Filter: Antal Beställningar</label>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                               <div className="text-[8px] font-black uppercase text-white/20 tracking-widest">Minst</div>
                               <input id="minO" type="number" defaultValue="0" className="w-full bg-transparent text-sm font-black focus:outline-none" />
                            </div>
                            <div className="space-y-1.5 px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                               <div className="text-[8px] font-black uppercase text-white/20 tracking-widest">Max (tom för alla)</div>
                               <input id="maxO" type="number" className="w-full bg-transparent text-sm font-black focus:outline-none" />
                            </div>
                         </div>
                      </div>

                      <div className="space-y-3">
                         <button 
                           onClick={() => {
                              const min = (document.getElementById("minO") as HTMLInputElement).value;
                              const max = (document.getElementById("maxO") as HTMLInputElement).value;
                              handleGenerateDeals(showGenerateModal.id, { 
                                 minOrders: min ? Number(min) : undefined, 
                                 maxOrders: max ? Number(max) : undefined 
                              });
                           }}
                           className="w-full py-4 rounded-2xl bg-gold-500 hover:bg-gold-400 text-dark-500 text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
                         >
                            <PackageCheck size={18} /> Kör för alla matchande
                         </button>
                         <button onClick={() => setShowGenerateModal(null)} className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white/20">Avbryt</button>
                      </div>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
