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
  ArrowLeft
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  const getToken = () => localStorage.getItem("palmyra_token");

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setCustomers(res.data);
    } catch { 
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleUpdateUser = async (id: string, data: any) => {
    try {
      await axios.patch(`${API_URL}/api/customers/${id}`, data, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchCustomers();
      if (selectedCustomer?.id === id) {
        const full = await axios.get(`${API_URL}/api/customers/${id}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setSelectedCustomer(full.data);
      }
      setEditingCustomer(null);
    } catch {
      alert("Kunde inte uppdatera kund");
    }
  };

  const filtered = customers.filter(c => 
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const fetchCustomerDetails = async (id: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSelectedCustomer(res.data);
    } catch {
      alert("Kunde inte hämta kunddetaljer");
    }
  };

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
              HANTERA <span className="text-gold-500">KUNDER</span>
            </h1>
          </div>
          
          <div className="relative group min-w-[300px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={18} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök på namn, telefon eller e-post..."
              className="w-full bg-[#0a0c14] border border-white/5 rounded-2xl pl-12 pr-6 py-4 text-sm font-bold placeholder:text-white/10 focus:outline-none focus:border-gold-500/30 transition-all shadow-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* List Section */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-6 py-4 bg-[#0a0c14] border border-white/5 rounded-2xl mb-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/20 flex items-center gap-4">
                <span>Totalt {filtered.length} Kunder</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 text-white/20 hover:text-white/60 transition-all"><Filter size={16}/></button>
                <button className="p-2 text-white/20 hover:text-white/60 transition-all"><ArrowUpDown size={16}/></button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center bg-[#0a0c14] rounded-3xl border border-dashed border-white/5">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="text-white/10" size={32} />
                </div>
                <p className="font-black uppercase tracking-widest text-white/20">Inga kunder matchar din sökning</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((customer) => (
                  <button 
                    key={customer.id}
                    onClick={() => fetchCustomerDetails(customer.id)}
                    className={`w-full text-left group relative flex items-center gap-6 p-6 rounded-3xl border transition-all hover:pl-8 ${selectedCustomer?.id === customer.id ? "bg-gold-500/10 border-gold-500 shadow-2xl shadow-gold-500/5 group-pl-8" : "bg-[#0a0c14] border-white/5 hover:border-white/10"}`}
                  >
                    <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-xl font-black ${selectedCustomer?.id === customer.id ? "bg-gold-500 text-dark-500" : "bg-white/5 text-gold-500"}`}>
                      {customer.name?.charAt(0).toUpperCase()}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-black uppercase tracking-tight text-lg truncate group-hover:text-gold-500 transition-colors">
                          {customer.name}
                        </h3>
                        {customer.isVerified && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                         <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
                           <Phone size={12} className="text-white/10" />
                           {customer.phone || "Inget nummer"}
                         </div>
                         <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
                           <ShoppingBag size={12} className="text-white/10" />
                           {customer._count?.orders ?? 0} Ordrar
                         </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                       {!customer.isActive && (
                         <div className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black uppercase tracking-widest">Inaktiv</div>
                       )}
                       <ChevronRight className={`transition-all ${selectedCustomer?.id === customer.id ? "text-gold-500 translate-x-2" : "text-white/10"}`} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Section */}
          <div className="relative">
            <AnimatePresence mode="wait">
              {selectedCustomer ? (
                <motion.div 
                  key={selectedCustomer.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="sticky top-10 space-y-6"
                >
                  {/* Detailed Info Card */}
                  <div className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                    {/* Top bar with buttons */}
                    <div className="flex items-center justify-between p-6 border-b border-white/5">
                      <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-all">
                        <ArrowLeft size={20} />
                      </button>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setEditingCustomer(selectedCustomer)}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Redigera
                        </button>
                        <button 
                          onClick={() => handleUpdateUser(selectedCustomer.id, { isActive: !selectedCustomer.isActive })}
                          className={`p-2 rounded-xl border transition-all ${selectedCustomer.isActive ? "bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20"}`}
                        >
                          {selectedCustomer.isActive ? <Lock size={18} /> : <Unlock size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="p-10">
                      <div className="flex flex-col items-center text-center mb-10">
                        <div className="w-24 h-24 rounded-3xl bg-gold-500 flex items-center justify-center text-dark-500 text-4xl font-black mb-6 shadow-2xl shadow-gold-500/20">
                          {selectedCustomer.name?.charAt(0).toUpperCase()}
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none mb-2">
                          {selectedCustomer.name}
                        </h2>
                        <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                          {selectedCustomer.isVerified ? (
                            <> <CheckCircle2 size={12} /> Verifierad Kunden </>
                          ) : (
                            <span className="text-amber-500/50 italic font-black">Ej verifierad</span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-10">
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Medlem sedan</span>
                          <span className="text-xs font-bold text-white/80">{new Date(selectedCustomer.createdAt).toLocaleDateString("sv-SE")}</span>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Stad</span>
                          <span className="text-xs font-bold text-white/80 uppercase">{selectedCustomer.city || "Ej angivet"}</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                           <Phone size={18} className="text-gold-500" />
                           <div className="flex-1 min-w-0">
                             <div className="text-[8px] font-black uppercase tracking-widest text-white/20">Telefon</div>
                             <div className="text-sm font-black tracking-widest text-white/80">{selectedCustomer.phone || "Inget"}</div>
                           </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                           <Mail size={18} className="text-gold-500" />
                           <div className="flex-1 min-w-0">
                             <div className="text-[8px] font-black uppercase tracking-widest text-white/20">E-post</div>
                             <div className="text-sm font-black text-white/80 truncate">{selectedCustomer.email || "Ingen e-post"}</div>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Orders History */}
                  <div className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] p-8">
                     <h3 className="text-sm font-black uppercase tracking-[0.3em] text-gold-500 mb-6 flex items-center gap-3">
                        <Package size={16} /> Orderhistorik
                     </h3>
                     
                     <div className="space-y-3">
                        {selectedCustomer.orders.length === 0 ? (
                          <div className="py-10 text-center text-[10px] font-black uppercase text-white/10">Inga ordrar än</div>
                        ) : (
                          selectedCustomer.orders.map((order: any) => (
                            <div key={order.id} className="p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all">
                               <div className="flex items-start justify-between mb-2">
                                  <div className="text-[10px] font-black uppercase tracking-widest text-white/80">#{order.orderNumber}</div>
                                  <div className="text-[9px] font-black uppercase text-gold-500/50">{new Date(order.createdAt).toLocaleDateString("sv-SE")}</div>
                               </div>
                               <div className="text-[10px] font-black uppercase tracking-tighter text-white/40 mb-3">{order.restaurant?.name || "Plattform"}</div>
                               <div className="flex items-center justify-between">
                                  <div className="text-xs font-black text-emerald-400">{order.total} kr</div>
                                  <div className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${order.status === "COMPLETED" ? "text-emerald-500 bg-emerald-500/10" : "text-amber-500 bg-amber-500/10"}`}>{order.status}</div>
                               </div>
                            </div>
                          ))
                        )}
                     </div>
                  </div>
                </motion.div>
              ) : (
                <div className="sticky top-10 h-[600px] bg-[#0a0c14] border border-dashed border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-10">
                   <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                      <Users className="text-white/10" size={40} />
                   </div>
                   <h3 className="text-xl font-black uppercase tracking-widest text-white/20 mb-2">Välj en kund</h3>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-white/10 leading-relaxed max-w-[200px]">Klicka på en kund i listan för att se kontaktuppgifter, historik och erbjudanden.</p>
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
             <motion.div 
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="w-full max-w-xl bg-[#0a0c14] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl"
             >
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                   <h2 className="text-xl font-black uppercase italic tracking-tighter">Redigera <span className="text-gold-500">Kundprofil</span></h2>
                   <button onClick={() => setEditingCustomer(null)} className="p-2 hover:bg-white/5 rounded-xl"><XCircle size={24} className="text-white/20" /></button>
                </div>
                
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData.entries());
                    handleUpdateUser(editingCustomer.id, {
                        ...data,
                        isVerified: editingCustomer.isVerified
                    });
                  }}
                  className="p-10 space-y-6"
                >
                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Fullständigt Namn</label>
                        <input name="name" defaultValue={editingCustomer.name} required className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Telefonnummer</label>
                        <input name="phone" defaultValue={editingCustomer.phone} required className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">E-post</label>
                        <input name="email" defaultValue={editingCustomer.email} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-2">Stad</label>
                        <input name="city" defaultValue={editingCustomer.city} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500/40 outline-none" />
                      </div>
                   </div>

                   <div className="pt-6 flex gap-4">
                      <button type="button" onClick={() => setEditingCustomer(null)} className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[11px] font-black uppercase tracking-[0.2em] transition-all">Avbryt</button>
                      <button type="submit" className="flex-1 py-4 rounded-2xl bg-gold-500 hover:bg-gold-400 text-dark-500 text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-gold-500/10">Spara Ändringar</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
