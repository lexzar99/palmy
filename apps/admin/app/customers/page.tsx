/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Users, 
  Search, 
  ChevronRight, 
  Phone, 
  Mail, 
  Calendar, 
  ShoppingBag, 
  CheckCircle2, 
  XCircle,
  MoreVertical,
  Filter,
  ArrowUpDown,
  Lock,
  Unlock,
  Package,
  ArrowLeft,
  MapPin,
  Trash2,
  Settings2,
  X,
  CreditCard,
  History,
  Ticket
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const getToken = () => localStorage.getItem("palmyra_token");

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setCustomers(res.data);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleUpdateUser = async (id: string, data: any) => {
    try {
      await axios.patch(`${API_URL}/api/customers/${id}`, data, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchCustomers();
      if (selectedCustomer?.id === id) fetchCustomerDetails(id);
      setEditingCustomer(null);
    } catch { alert("Kunde inte uppdatera kund"); }
  };

  const handleDeleteUser = async (id: string) => {
    if (deleteConfirmText !== "DELETE") return;
    try {
      await axios.delete(`${API_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setShowDeleteModal(null);
      setSelectedCustomer(null);
      setDeleteConfirmText("");
      fetchCustomers();
    } catch { alert("Kunde inte radera kunden"); }
  };

  const fetchCustomerDetails = async (id: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSelectedCustomer(res.data);
    } catch { alert("Kunde inte hämta kunddetaljer"); }
  };

  const filtered = customers.filter(c => 
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#02040a] p-4 lg:p-10 text-white font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2 text-gold-500">
              <Users size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none">Kundregister</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase italic">
              KUND <span className="text-gold-500">PORTAL</span>
            </h1>
          </div>
          
          <div className="relative group min-w-[300px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={18} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök namn, telefon..."
              className="w-full bg-[#0a0c14] border border-white/5 rounded-2xl pl-12 pr-6 py-4 text-sm font-bold placeholder:text-white/10 focus:outline-none focus:border-gold-500/30 transition-all shadow-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* List Section (Simpler) */}
          <div className="xl:col-span-1 space-y-3">
             <div className="px-6 py-4 bg-[#0a0c14] border border-white/5 rounded-2xl mb-4 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Registrerade Kunder ({filtered.length})</span>
                <Settings2 size={14} className="text-white/10" />
             </div>

             {loading ? (
                [1,2,3,4,5].map(i => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)
             ) : (
                <div className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                   {filtered.map(c => (
                      <button 
                        key={c.id} 
                        onClick={() => fetchCustomerDetails(c.id)}
                        className={`w-full group flex items-center gap-4 p-4 rounded-2xl border transition-all ${selectedCustomer?.id === c.id ? "bg-gold-500 border-gold-500 text-dark-500" : "bg-[#0a0c14] border-white/5 hover:border-white/10"}`}
                      >
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${selectedCustomer?.id === c.id ? "bg-dark-500 text-gold-500" : "bg-white/5 text-gold-500"}`}>
                            {c.name?.charAt(0)}
                         </div>
                         <div className="text-left flex-1 min-w-0">
                            <div className="text-[11px] font-black uppercase truncate">{c.name || "Gäst"}</div>
                            <div className={`text-[9px] font-bold ${selectedCustomer?.id === c.id ? "text-dark-500/60" : "text-white/20"}`}>{c.phone}</div>
                         </div>
                         <ChevronRight size={14} className={selectedCustomer?.id === c.id ? "text-dark-500" : "text-white/5"} />
                      </button>
                   ))}
                </div>
             )}
          </div>

          {/* Details Section (Clean & Detailed) */}
          <div className="xl:col-span-2">
             <AnimatePresence mode="wait">
                {selectedCustomer ? (
                   <motion.div 
                     key={selectedCustomer.id}
                     initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                     className="space-y-6"
                   >
                      <div className="bg-[#0a0c14] border border-white/10 rounded-[3rem] p-10 relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 blur-[100px] pointer-events-none" />
                         
                         <div className="flex flex-col lg:flex-row gap-10 items-start">
                            <div className="flex flex-col items-center gap-6">
                               <div className="w-24 h-24 rounded-[2rem] bg-gold-500 text-dark-500 flex items-center justify-center text-4xl font-black shadow-2xl shadow-gold-500/20">
                                  {selectedCustomer.name?.charAt(0)}
                               </div>
                               {!selectedCustomer.isVerified && <div className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black uppercase">Ej verifierad</div>}
                               {selectedCustomer.isVerified && <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase">Verifierad</div>}
                            </div>

                            <div className="flex-1 w-full">
                               <div className="flex items-center justify-between mb-8">
                                  <div>
                                     <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-1">{selectedCustomer.name}</h2>
                                     <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Medlem sedan {new Date(selectedCustomer.createdAt).toLocaleDateString("sv-SE")}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                     <button 
                                       onClick={() => setEditingCustomer(selectedCustomer)}
                                       className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-white/40 hover:text-white"
                                     >
                                        <Settings2 size={18} />
                                     </button>
                                     <button 
                                       onClick={() => handleUpdateUser(selectedCustomer.id, { isActive: !selectedCustomer.isActive })}
                                       className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${selectedCustomer.isActive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"}`}
                                     >
                                        {selectedCustomer.isActive ? <Unlock size={18} /> : <Lock size={18} />}
                                     </button>
                                     <button 
                                       onClick={() => setShowDeleteModal(selectedCustomer)}
                                       className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 transition-all"
                                     >
                                        <Trash2 size={18} />
                                     </button>
                                  </div>
                               </div>

                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8">
                                  <div className="space-y-4">
                                     <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-5">
                                        <Phone size={18} className="text-gold-500" />
                                        <div>
                                           <div className="text-[9px] font-black uppercase text-white/20 mb-1">Telefon</div>
                                           <div className="text-sm font-black tracking-widest">{selectedCustomer.phone}</div>
                                        </div>
                                     </div>
                                     <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-5">
                                        <Mail size={18} className="text-gold-500" />
                                        <div>
                                           <div className="text-[9px] font-black uppercase text-white/20 mb-1">E-post</div>
                                           <div className="text-sm font-black truncate max-w-[180px]">{selectedCustomer.email || "Ej angivet"}</div>
                                        </div>
                                     </div>
                                  </div>
                                  <div className="space-y-4">
                                     <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-5">
                                        <MapPin size={18} className="text-gold-500" />
                                        <div>
                                           <div className="text-[9px] font-black uppercase text-white/20 mb-1">Leveransadress</div>
                                           <div className="text-sm font-black italic">{selectedCustomer.address || "Ingen sparad"}</div>
                                           <div className="text-[10px] font-bold text-white/40 uppercase">{selectedCustomer.zip} {selectedCustomer.city}</div>
                                        </div>
                                     </div>
                                  </div>
                               </div>
                            </div>
                         </div>
                      </div>

                      {/* Orders & Deals Combined */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                         <div className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] p-8">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-8 flex items-center gap-3">
                               <History size={16} /> Orderhistorik
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                               {selectedCustomer.orders?.length === 0 ? (
                                  <div className="py-20 text-center text-[10px] font-black uppercase text-white/5 italic">Inga ordrar än</div>
                               ) : (
                                  selectedCustomer.orders?.map((o: any) => (
                                     <div key={o.id} className="p-5 rounded-2xl bg-white/2 border border-white/5 space-y-4">
                                        <div className="flex items-center justify-between">
                                           <span className="text-[10px] font-black uppercase tracking-widest text-white/60">#{o.orderNumber || o.id.slice(-6)}</span>
                                           <span className="text-[9px] font-black text-white/20">{new Date(o.createdAt).toLocaleDateString("sv-SE")}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                           <div className="text-lg font-black italic underline decoration-gold-500/30">{o.total / 100} kr</div>
                                           <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg">
                                              <CreditCard size={10} className="text-gold-500" />
                                              <span className="text-[9px] font-black uppercase">{o.paymentMethod || "Betald"}</span>
                                           </div>
                                        </div>
                                        {o.appliedDealTitle && (
                                           <div className="flex items-center gap-2 text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                                              <Ticket size={12} /> {o.appliedDealTitle}
                                           </div>
                                        )}
                                     </div>
                                  ))
                               )}
                            </div>
                         </div>

                         <div className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] p-8">
                             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-8 flex items-center gap-3">
                               <Ticket size={16} /> Kundens Erbjudanden
                            </h3>
                            <div className="space-y-3">
                               {selectedCustomer.deals?.length === 0 ? (
                                  <div className="py-20 text-center text-[10px] font-black uppercase text-white/5 italic">Inga aktiva koder</div>
                               ) : (
                                  selectedCustomer.deals?.map((d: any) => (
                                     <div key={d.id} className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-between">
                                        <div>
                                           <div className="text-[11px] font-black uppercase text-emerald-500 truncate max-w-[140px]">{d.campaign?.title || "Deal"}</div>
                                           <div className="text-[9px] font-mono font-black text-white/60 mt-1">{d.code}</div>
                                        </div>
                                        <div className="text-right">
                                           <div className="text-[8px] font-black uppercase text-white/20 mb-1">Användningar</div>
                                           <div className="text-[10px] font-black text-white/80">{d.usageCount} / {d.maxUsages}</div>
                                        </div>
                                     </div>
                                  ))
                               )}
                            </div>
                         </div>
                      </div>
                   </motion.div>
                ) : (
                   <div className="h-[600px] bg-[#0a0c14] border border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center text-center p-10">
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-8">
                         <Users className="text-white/5" size={48} />
                      </div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-4 text-white/40">Välj en kund för att hantera</h3>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10 leading-relaxed max-w-sm">Ändra profiluppgifter, se detaljerad orderhistorik och personliga erbjudanden.</p>
                   </div>
                )}
             </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingCustomer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl bg-[#121421] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-[#0a0c14]">
                   <h2 className="text-xl font-black uppercase italic tracking-tighter">Profil <span className="text-gold-500">Editering</span></h2>
                   <button onClick={() => setEditingCustomer(null)} className="p-2 hover:bg-white/5 rounded-xl"><X size={24} className="text-white/20" /></button>
                </div>
                
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData.entries());
                    handleUpdateUser(editingCustomer.id, data);
                  }}
                  className="p-10 space-y-6"
                >
                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Namn</label>
                         <input name="name" defaultValue={editingCustomer.name} placeholder="Fullständigt namn" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Telefon</label>
                         <input name="phone" defaultValue={editingCustomer.phone} placeholder="Mobilnummer" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none tracking-widest" />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">E-post</label>
                         <input name="email" defaultValue={editingCustomer.email} placeholder="E-postadress" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Gata / Address</label>
                         <input name="address" defaultValue={editingCustomer.address} placeholder="Gatuadress" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Postnr</label>
                         <input name="zip" defaultValue={editingCustomer.zip} placeholder="XXXXX" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Stad</label>
                         <input name="city" defaultValue={editingCustomer.city} placeholder="T.ex Lund" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none uppercase" />
                      </div>
                   </div>

                   <div className="pt-6 flex gap-4">
                      <button type="button" onClick={() => setEditingCustomer(null)} className="flex-1 py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest">Avbryt</button>
                      <button type="submit" className="flex-1 py-4 bg-gold-500 text-dark-500 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-gold-500/20">Spara Profil</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md bg-[#121421] border-2 border-rose-500/20 rounded-[3rem] p-10 text-center">
                <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl mx-auto flex items-center justify-center mb-8">
                   <Trash2 size={40} />
                </div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-4">Bekräfta <span className="text-rose-500">Radering</span></h2>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-8 leading-relaxed">
                   Du är på väg att radera <span className="text-white">{showDeleteModal.name}</span> permanent. För att bekräfta, skriv <span className="text-rose-500">DELETE</span> i fältet nedan.
                </p>
                <input 
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                  placeholder="Skriv DELETE här..."
                  className="w-full bg-white/5 border border-rose-500/30 rounded-2xl px-6 py-4 text-center font-black text-sm tracking-[0.3em] outline-none focus:border-rose-500 transition-all mb-8"
                />
                <div className="flex gap-4">
                   <button onClick={() => { setShowDeleteModal(null); setDeleteConfirmText(""); }} className="flex-1 py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest">Avbryt</button>
                   <button 
                     onClick={() => handleDeleteUser(showDeleteModal.id)}
                     disabled={deleteConfirmText !== "DELETE"}
                     className="flex-1 py-4 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 transition-all shadow-2xl shadow-rose-500/20"
                   >
                     Radera Kund
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
