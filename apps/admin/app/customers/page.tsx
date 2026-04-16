/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Users, Search, Phone, Mail, Calendar, LogOut, Download, Lock, Unlock, MapPin, 
  Settings2, CreditCard, Ticket, ShieldAlert, History, Activity, TrendingUp, Key, MessageSquare
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/Toast";
import jsPDF from "jspdf";

export default function CustomersCRMPage() {
  const { success, error: toastError } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "vip">("all");
  const [selectedCustId, setSelectedCustId] = useState<string | null>(null);
  
  const token = () => localStorage.getItem("matgo_token") || "";

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/customers`, { headers: { Authorization: `Bearer ${token()}` } });
      setCustomers(res.data);
    } catch {
      toastError("Kunde inte ladda kunder");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleToggleStatus = async (id: string, current: boolean) => {
    try {
      await axios.patch(`${API_URL}/api/customers/${id}`, { isActive: !current }, { headers: { Authorization: `Bearer ${token()}` } });
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, isActive: !current } : c));
      success(!current ? "Kund avblockerad" : "Kund blockerad");
    } catch { toastError("Statusändring misslyckades"); }
  };

  const filtered = useMemo(() => {
    return customers.filter(c => {
      // Basic CRM stats parsing
      const orderCount = c.orders?.length || 0;
      const totalSpent = (c.orders || []).filter((o:any) => o.status === "DELIVERED").reduce((sum:number, o:any) => sum + (o.total||0), 0) / 100;

      if (filter === "active" && !c.isActive) return false;
      if (filter === "inactive" && c.isActive) return false;
      if (filter === "vip" && totalSpent < 5000) return false; // VIP = spent > 5000kr

      if (search) {
        const q = search.toLowerCase();
        if (!(c.name||"").toLowerCase().includes(q) && !(c.phone||"").toLowerCase().includes(q) && !(c.email||"").toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [customers, filter, search]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustId), [customers, selectedCustId]);

  const stats = useMemo(() => {
    const totalSpent = customers.reduce((s, c) => s + (c.orders || []).filter((o:any) => o.status === "DELIVERED").reduce((sum:number, o:any) => sum + (o.total||0), 0) / 100, 0);
    const vipCount = customers.filter(c => ((c.orders || []).filter((o:any) => o.status === "DELIVERED").reduce((sum:number, o:any) => sum + (o.total||0), 0) / 100) >= 5000).length;
    return { 
      total: customers.length, 
      active: customers.filter(c => c.isActive).length, 
      vip: vipCount,
      revenue: Math.round(totalSpent) 
    };
  }, [customers]);

  return (
    <div className="space-y-8 pb-24 text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <Users className="text-gold-500" size={28} /> CRM & Kundhantering
          </h1>
          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-[0.2em] mt-2">
            AI-Driven insikt · {stats.total} totalt registrerade
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Totala Kunder", val: stats.total, icon: Users, color: "text-blue-400" },
          { label: "Aktiva Konton", val: stats.active, icon: Activity, color: "text-emerald-400" },
          { label: "VIP (Spenderat >5000)", val: stats.vip, icon: TrendingUp, color: "text-gold-500" },
          { label: "Kundomsättning (LTV)", val: `${stats.revenue} kr`, icon: CreditCard, color: "text-purple-400" },
        ].map(s => (
          <div key={s.label} className="p-5 rounded-[2rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
              <s.icon size={60} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{s.label}</p>
            <p className={`text-3xl font-black mt-2 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        {/* Left List */}
        <div className="h-[calc(100vh-300px)] flex flex-col rounded-[2.5rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden">
          {/* Header/Filters */}
          <div className="p-5 border-b border-[var(--border-subtle)] space-y-4 bg-[var(--bg-primary)]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
              <input 
                placeholder="Sök namn, tel, e-post..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] rounded-xl py-3 pl-10 pr-4 text-xs font-bold outline-none border border-[var(--border-subtle)] focus:border-gold-500/30 transition-all placeholder:opacity-40" 
              />
            </div>
            <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)]">
              {[
                { id: "all", label: "Alla" },
                { id: "active", label: "Aktiva" },
                { id: "vip", label: "VIP" },
                { id: "inactive", label: "Blockade" },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id as any)}
                  className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f.id ? "bg-gold-500 text-zinc-950 shadow-md" : "text-[var(--text-secondary)] hover:text-white"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* List Scrolling */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
               <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gold-500" /></div>
            ) : filtered.length === 0 ? (
               <p className="text-center text-[10px] uppercase font-black tracking-widest text-[var(--text-secondary)] py-10 opacity-50">Inga kunder funna</p>
            ) : (
              filtered.map(c => {
                const isSelected = selectedCustId === c.id;
                const totalSpent = (c.orders || []).filter((o:any) => o.status === "DELIVERED").reduce((sum:number, o:any) => sum + (o.total||0), 0) / 100;
                
                return (
                  <div key={c.id} onClick={() => setSelectedCustId(c.id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer border transition-all ${isSelected ? "bg-gold-500/10 border-gold-500/30" : "bg-[var(--bg-primary)] border-[var(--border-subtle)] hover:border-gold-500/20"}`}>
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center font-black text-sm border border-[var(--border-subtle)] shrink-0">
                      {(c.name||"G").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-tight truncate text-white">
                        {c.name || "Gäst"}
                      </p>
                      <p className="text-[9px] font-bold text-[var(--text-secondary)] truncate">{c.phone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[10px] font-black ${totalSpent > 5000 ? 'text-gold-500' : 'text-emerald-400'}`}>
                        {Math.round(totalSpent)} kr
                      </p>
                      {!c.isActive && <p className="text-[8px] font-black uppercase text-rose-400 mt-0.5">Blockad</p>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right CRM Panel */}
        <div className="h-[calc(100vh-300px)] rounded-[2.5rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden flex flex-col relative">
          {!selectedCustomer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-30">
              <Users size={48} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Välj en kund för att visa CRM-profil</p>
            </div>
          ) : (() => {
            const c = selectedCustomer;
            const completedOrders = (c.orders || []).filter((o:any) => o.status === "DELIVERED");
            const totalSpent = completedOrders.reduce((sum:number, o:any) => sum + (o.total||0), 0) / 100;
            const isVip = totalSpent >= 5000;

            return (
              <AnimatePresence mode="wait">
                <motion.div key={c.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-y-auto">
                  {/* Hero Profile */}
                  <div className="p-8 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] relative overflow-hidden">
                    {/* VIP glow */}
                    {isVip && <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/20 blur-[80px] pointer-events-none" />}
                    
                    <div className="flex items-start justify-between relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-2xl font-black text-white shadow-xl">
                          {(c.name||"G").charAt(0).toUpperCase()}
                        </div>
                        <div>
                           <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                             {c.name || "Gäst ananonym"}
                             {isVip && <span className="px-2 py-0.5 rounded bg-gold-500/20 text-gold-500 border border-gold-500/30 text-[8px] font-black tracking-widest">VIP KUND</span>}
                           </h2>
                           <p className="text-[10px] font-bold text-[var(--text-secondary)] tracking-widest uppercase mt-1">
                             Medlem sedan {new Date(c.createdAt).toLocaleDateString("sv-SE")}
                           </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleToggleStatus(c.id, c.isActive)} className={`p-3 rounded-2xl border transition-all ${c.isActive ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"}`} title={c.isActive ? "Blockera Kund" : "Avblockera Kund"}>
                          {c.isActive ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Quick Info Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8 relative z-10">
                      <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                        <Phone size={12} className="text-[var(--text-secondary)] mb-1" />
                        <p className="text-[10px] font-bold truncate">{c.phone}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                        <Mail size={12} className="text-[var(--text-secondary)] mb-1" />
                        <p className="text-[10px] font-bold truncate">{c.email || "Ingen E-post"}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                        <MapPin size={12} className="text-[var(--text-secondary)] mb-1" />
                        <p className="text-[10px] font-bold truncate">{c.city || "Ingen stad"}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                        <ShieldAlert size={12} className="text-[var(--text-secondary)] mb-1" />
                        <p className={`text-[10px] font-black uppercase ${c.isVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {c.isVerified ? "Verifierad OTP" : "Ej Verifierad"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 360 View Tabs */}
                  <div className="p-8 space-y-8 bg-[var(--bg-secondary)] relative">
                    {/* Insights */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-4">Transaktionsinsikter</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-blue-500/10">
                          <p className="text-[9px] font-black text-blue-500/50 uppercase tracking-widest">Antal Ordrar</p>
                          <p className="text-2xl font-black text-blue-400 mt-1">{completedOrders.length}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-emerald-500/10">
                          <p className="text-[9px] font-black text-emerald-500/50 uppercase tracking-widest">Omsättning</p>
                          <p className="text-2xl font-black text-emerald-400 mt-1">{Math.round(totalSpent)} kr</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-purple-500/10">
                          <p className="text-[9px] font-black text-purple-500/50 uppercase tracking-widest">Snittorder</p>
                          <p className="text-2xl font-black text-purple-400 mt-1">{completedOrders.length ? Math.round(totalSpent / completedOrders.length) : 0} kr</p>
                        </div>
                      </div>
                    </div>

                    {/* Order History */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-4 flex justify-between">
                        Senaste Historik 
                        <span className="text-gold-500 cursor-pointer">Visa alla</span>
                      </h3>
                      <div className="space-y-2">
                        {completedOrders.length === 0 ? (
                           <p className="text-[10px] p-4 text-center rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">Inga slutförda ordrar ännu</p>
                        ) : (
                           completedOrders.slice(0, 3).map((o:any) => (
                             <div key={o.id} className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-between">
                               <div>
                                 <p className="text-xs font-black uppercase text-white">{o.restaurant?.name || "Utloggad restaurang"}</p>
                                 <p className="text-[9px] font-bold text-[var(--text-secondary)] mt-1">{new Date(o.createdAt).toLocaleString("sv-SE")} · Order #{o.orderNumber}</p>
                               </div>
                               <div className="text-right">
                                 <p className="text-xs font-black text-emerald-400">{o.total / 100} kr</p>
                                 <p className="text-[8px] font-black uppercase text-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 inline-block mt-1">Levererad</p>
                               </div>
                             </div>
                           ))
                        )}
                      </div>
                    </div>

                    {/* Support & Notes */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-4">Intern Supportlogg</h3>
                      <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                        <textarea placeholder="Lägg till intern anteckning gällande kundens supportärenden..." 
                          className="w-full h-24 bg-transparent outline-none text-sm font-bold resize-none text-white placeholder:text-[var(--text-secondary)]/30" />
                        <div className="flex justify-end border-t border-[var(--border-subtle)] pt-3 mt-2">
                          <button className="px-4 py-2 rounded-xl bg-gold-500 text-zinc-950 font-black uppercase text-[9px] tracking-widest">Spara Notering</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )
          })()}
        </div>
      </div>
    </div>
  );
}
