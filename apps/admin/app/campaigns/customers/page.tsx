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
  PackageCheck,
  ArrowLeft,
  XCircle,
  UserPlus,
  Target
} from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export default function CustomerCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

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

  const fetchCustomers = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setCustomers(res.data);
    } catch { }
  };

  useEffect(() => { 
    fetchCampaigns(); 
    fetchCustomers();
  }, []);

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
      // Instead of alert, we could use a toast. But alert is simple for now.
      // The user wants to avoid "chrome popup" (native alert).
      // I'll use a local state for success message.
      setShowGenerateModal(null);
      setSelectedUserIds([]);
      fetchCampaigns();
      alert(res.data.message || `Klart! Genererade ${res.data.generated} koder.`);
    } catch { alert("Gick inte att generera koder"); }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredCustomers = customers.filter(c => 
    c.phone && (
      c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || 
      c.phone?.toLowerCase().includes(customerSearch.toLowerCase())
    )
  );

  const handleUpdateCampaign = async (id: string, data: any) => {
    try {
      await axios.patch(`${API_URL}/api/campaigns/${id}`, data, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchCampaigns();
      if (selectedCampaign?.id === id) {
        setSelectedCampaign({ ...selectedCampaign, ...data });
      }
    } catch { alert("Kunde inte uppdatera kampanj"); }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Är du säker på att du vill radera denna kampanj och alla tillhörande koder?")) return;
    try {
      await axios.delete(`${API_URL}/api/campaigns/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSelectedCampaign(null);
      fetchCampaigns();
    } catch { alert("Kunde inte radera kampanj"); }
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
                <div className="flex items-center gap-3 mb-2 text-gold-500">
                  <Target size={20} />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none">Riktad Marknadsföring</span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase italic leading-none">
                  KUND <span className="text-gold-500">DEALS</span>
                </h1>
             </div>
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
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Målgrupper & Kampanjer ({campaigns.length})</span>
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
                                {c.discountValue} {c.discountType === "PERCENTAGE" ? "%" : "KR"}
                             </div>
                             <div className="text-[10px] font-black uppercase tracking-widest text-white/20">Giltig till {c.validUntil ? new Date(c.validUntil).toLocaleDateString("sv-SE") : "∞"}</div>
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
                        </div>
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={(e) => { e.stopPropagation(); setShowGenerateModal(c); }}
                             className="px-5 py-2.5 bg-gold-500 text-dark-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gold-400 transition-all font-black"
                           >
                             Skicka till Kunder
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
                              <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none">{selectedCampaign.title}</h2>
                           </div>
                           <button onClick={() => setSelectedCampaign(null)} className="p-2 hover:bg-white/5 rounded-xl transition-all"><X size={20} className="text-white/20" /></button>
                        </div>

                        <p className="text-sm font-bold text-white/40 mb-10 leading-relaxed max-w-md">{selectedCampaign.description || "Ingen beskrivning angiven."}</p>

                        <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 mb-10">
                            <div className="space-y-4">
                               <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Rabattvärde</label>
                               <div className="flex bg-white/5 rounded-2xl border border-white/5 p-2 overflow-hidden items-center">
                                 <input 
                                   type="number"
                                   value={selectedCampaign.discountValue}
                                   onChange={e => setSelectedCampaign({ ...selectedCampaign, discountValue: Number(e.target.value) })}
                                   className="bg-transparent flex-1 outline-none px-4 text-sm font-black"
                                 />
                                 <div className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase">
                                   {selectedCampaign.discountType === "PERCENTAGE" ? "%" : "kr"}
                                 </div>
                               </div>
                            </div>
                            <div className="space-y-4">
                               <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Minsta Order</label>
                               <div className="flex bg-white/5 rounded-2xl border border-white/5 p-2 overflow-hidden items-center">
                                 <input 
                                   type="number"
                                   value={selectedCampaign.minOrder}
                                   onChange={e => setSelectedCampaign({ ...selectedCampaign, minOrder: Number(e.target.value) })}
                                   className="bg-transparent flex-1 outline-none px-4 text-sm font-black"
                                 />
                                 <div className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                   KR
                                 </div>
                               </div>
                            </div>
                            <div className="space-y-4">
                               <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Gånger per kund</label>
                               <input 
                                 type="number"
                                 value={selectedCampaign.maxUsagesPerCustomer}
                                 onChange={e => setSelectedCampaign({ ...selectedCampaign, maxUsagesPerCustomer: Number(e.target.value) })}
                                 className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-sm font-black outline-none focus:ring-1 focus:ring-gold-500/50"
                               />
                            </div>
                            <div className="space-y-4">
                               <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Status</label>
                               <div className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-2xl p-4">
                                 <div className={`w-3 h-3 rounded-full ${selectedCampaign.isActive ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
                                 <span className="text-[10px] font-black uppercase tracking-widest">{selectedCampaign.isActive ? 'Aktiv' : 'Pausad'}</span>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <button 
                              onClick={async () => {
                                try {
                                  const { _count, ...cleanData } = selectedCampaign;
                                  await handleUpdateCampaign(selectedCampaign.id, cleanData);
                                  alert("Sparat!");
                                } catch { alert("Fel vid sparning"); }
                              }}
                              className="w-full py-5 bg-gold-500 text-dark-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gold-400 transition-all shadow-xl shadow-gold-500/20"
                            >
                               Spara Ändringar
                            </button>
                            <button 
                              onClick={() => handleUpdateCampaign(selectedCampaign.id, { isActive: !selectedCampaign.isActive })}
                              className={`w-full py-5 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${selectedCampaign.isActive ? "border-rose-500/20 text-rose-500 bg-rose-500/5 hover:bg-rose-500/10" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10"}`}
                            >
                               {selectedCampaign.isActive ? "Avaktivera Kampanj" : "Aktivera Kampanj"}
                            </button>
                            <button 
                              onClick={() => handleDeleteCampaign(selectedCampaign.id)}
                              className="w-full py-5 rounded-2xl border border-rose-500/20 text-rose-500 bg-rose-500/5 text-[11px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition-all flex items-center justify-center gap-3"
                            >
                               <Trash2 size={16} /> Radera Kampanj
                            </button>
                         </div>
                      </div>
                   </motion.div>
                ) : (
                  <div className="sticky top-10 h-[500px] border border-dashed border-white/10 rounded-[2.5rem] bg-[#0a0c14] flex flex-col items-center justify-center text-center p-10">
                     <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6"><Sparkles className="text-white/10" size={40} /></div>
                     <h3 className="text-xl font-black uppercase tracking-widest text-white/20 mb-2">Välj en kampanj</h3>
                     <p className="text-[10px] font-bold uppercase tracking-widest text-white/10 leading-relaxed max-w-[200px]">Skapa unika koder till specifika kunder för att driva försäljning.</p>
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
                   <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Skapa <span className="text-gold-500">Kundkampanj</span></h2>
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
                            <input name="validUntil" type="date" className="w-full bg-[#121421] border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none text-white/40" />
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

      {/* Generate / Send Modal */}
      <AnimatePresence>
        {showGenerateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-3xl bg-[#121421] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-[#0a0c14]">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500">
                         <Users size={24} />
                      </div>
                      <div>
                         <h2 className="text-xl font-black uppercase italic tracking-tighter leading-none">Skicka <span className="text-gold-500">Kod</span></h2>
                         <p className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-1">Erbjudande: {showGenerateModal.title}</p>
                      </div>
                   </div>
                   <button onClick={() => { setShowGenerateModal(null); setSelectedUserIds([]); }} className="p-2 hover:bg-white/5 rounded-xl"><X size={24} className="text-white/20" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                   {/* Method Selection */}
                   <div className="grid grid-cols-2 gap-6">
                      <div className={`p-6 rounded-[2rem] border transition-all ${selectedUserIds.length > 0 ? 'bg-white/2 border-white/5 opacity-50' : 'bg-gold-500/5 border-gold-500/30'}`}>
                         <h3 className="text-[10px] font-black uppercase tracking-widest text-gold-500 mb-6 flex items-center gap-2"><Filter size={14} /> Automatisk via Filter</h3>
                         <div className="space-y-4">
                            <div className="space-y-1.5">
                               <div className="text-[8px] font-black uppercase text-white/20 tracking-widest ml-2">Minst antal ordrar</div>
                               <input id="minOrders" type="number" defaultValue="0" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-black focus:outline-none focus:border-gold-500/30" />
                            </div>
                         </div>
                      </div>

                      <div className={`p-6 rounded-[2rem] border transition-all ${selectedUserIds.length > 0 ? 'bg-gold-500/5 border-gold-500/30' : 'bg-white/2 border-white/5 opacity-50'}`}>
                         <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-6 flex items-center gap-2"><UserPlus size={14} /> Specifik Urval</h3>
                         <div className="space-y-1.5">
                            <div className="text-[8px] font-black uppercase text-white/20 tracking-widest ml-2">Kunder Valda</div>
                            <div className="text-xs font-black text-white/60 bg-emerald-500/10 border border-emerald-500/20 py-3 rounded-xl px-4 flex items-center justify-between">
                               <span>{selectedUserIds.length} st markerade</span>
                               {selectedUserIds.length > 0 && <button onClick={() => setSelectedUserIds([])} className="text-emerald-500 hover:text-white uppercase text-[8px] font-black">Rensa</button>}
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Customer Selection Table */}
                   <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20 italic">Sök & Markera Kunder</h4>
                         <div className="relative w-64 group">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-gold-500 transition-all" size={12} />
                             <input 
                               value={customerSearch}
                               onChange={(e) => setCustomerSearch(e.target.value)}
                               placeholder="Sök namn/tel..." 
                               className="w-full bg-[#0a0c14] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-bold focus:outline-none focus:border-gold-500/30 transition-all" 
                             />
                         </div>
                      </div>

                      <div className="bg-[#0a0c14] border border-white/5 rounded-3xl overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                         {filteredCustomers.map(c => (
                           <button 
                             key={c.id} 
                             onClick={() => toggleUserSelection(c.id)}
                             className={`w-full flex items-center justify-between px-6 py-4 border-b border-white/5 last:border-none transition-all ${selectedUserIds.includes(c.id) ? 'bg-gold-500/10' : 'hover:bg-white/2'}`}
                           >
                             <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${selectedUserIds.includes(c.id) ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-white/20'}`}>
                                   {c.name?.charAt(0)}
                                </div>
                                <div className="text-left">
                                   <div className="text-[10px] font-black uppercase tracking-tight text-white/80">{c.name}</div>
                                   <div className="text-[8px] font-black text-white/20">{c.phone}</div>
                                </div>
                             </div>
                             <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedUserIds.includes(c.id) ? 'bg-gold-500 border-gold-500 text-dark-500 shadow-lg shadow-gold-500/20' : 'bg-white/5 border-white/10 text-transparent'}`}>
                                <CheckCircle2 size={12} />
                             </div>
                           </button>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="p-8 bg-[#0a0c14] border-t border-white/10 flex items-center justify-between gap-6">
                   <div className="text-left flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Kodens Regler</div>
                      <div className="text-[11px] font-black text-white/60">{showGenerateModal.discountType === 'PERCENTAGE' ? `${showGenerateModal.discountValue}%` : `${showGenerateModal.discountValue} kr`} rabatt • Min {showGenerateModal.minOrder} kr</div>
                   </div>
                   <div className="flex items-center gap-4">
                      <button 
                        onClick={() => { setShowGenerateModal(null); setSelectedUserIds([]); }}
                        className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                         Avbryt
                      </button>
                      <button 
                        onClick={() => {
                           const min = (document.getElementById("minOrders") as HTMLInputElement)?.value;
                           handleGenerateDeals(showGenerateModal.id, { 
                              minOrders: selectedUserIds.length > 0 ? undefined : Number(min || 0),
                              userIds: selectedUserIds.length > 0 ? selectedUserIds : undefined
                           });
                        }}
                        className="px-8 py-4 bg-gold-500 text-dark-500 hover:bg-gold-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-gold-500/20 flex items-center gap-2"
                      >
                         <PackageCheck size={16} /> Kör & Skicka
                      </button>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
