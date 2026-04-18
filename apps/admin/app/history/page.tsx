"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Clock, 
  Search, 
  ChevronDown, 
  Loader2, 
  Printer, 
  Truck, 
  Store,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Activity,
  AlertCircle,
  PackageX
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  deliveryStreet?: string;
  deliveryCity?: string;
  total: number;
  createdAt: string;
  restaurantName?: string;
  items: any[];
  stripePaymentIntentId?: string;
  discountCode?: string;
}

const HistoryPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  const { selectedRestaurantId, selectedRestaurantName } = useRestaurantStore();

  useEffect(() => {
    setIsMounted(true);
    try {
      const raw = localStorage.getItem("matgo_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch { setIsSuperAdmin(false); }
  }, []);

  const fetchData = useCallback(async () => {
    if (!isMounted) return;
    if (!selectedRestaurantId && !isSuperAdmin) { setLoading(false); return; }
    setError(null);
    setLoading(true);
    try {
      const token = localStorage.getItem("matgo_token");
      const restaurantParam = isSuperAdmin ? (selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "") : `&restaurantId=${selectedRestaurantId}`;
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=300${restaurantParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let fetched = res.data.orders || [];
      fetched = fetched.filter((o: Order) => {
        const isTest = o.stripePaymentIntentId === "TEST_PAYMENT" || o.discountCode === "test" || o.discountCode === "testa";
        const isPast = ["DELIVERING", "DELIVERED", "REJECTED", "CANCELLED", "DELIVERY_FAILED"].includes(o.status);
        return isPast && !isTest;
      });
      setOrders(fetched);
    } catch (err: any) {
      if (err.response?.status === 404) setError("Data saknas. Forsok logga in igen.");
      else setError("Kunde inte hamta historik.");
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isSuperAdmin, isMounted]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groups = useMemo(() => {
    const res: { 
      today: { orders: Order[], total: number }, 
      yesterday: { orders: Order[], total: number }, 
      older: { orders: Order[], total: number } 
    } = { 
      today: { orders: [], total: 0 }, 
      yesterday: { orders: [], total: 0 }, 
      older: { orders: [], total: 0 } 
    };
    if (!isMounted) return res;
    
    const nowLocal = new Date();
    const startOfToday = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const filtered = orders.filter(o => {
      const matchesSearch = o.customerName?.toLowerCase().includes(search.toLowerCase()) || o.orderNumber.toString().includes(search);
      const matchesStatus = filterStatus === "ALL" || o.status === filterStatus;
      return matchesSearch && matchesStatus;
    });

    filtered.forEach(o => {
      const d = new Date(o.createdAt);
      if (d >= startOfToday) { res.today.orders.push(o); res.today.total += o.total; }
      else if (d >= startOfYesterday) { res.yesterday.orders.push(o); res.yesterday.total += o.total; }
      else if (isSuperAdmin) { res.older.orders.push(o); res.older.total += o.total; }
    });
    return res;
  }, [orders, search, filterStatus, isMounted]);

  const hasAnyResults = groups.today.orders.length > 0 || groups.yesterday.orders.length > 0 || groups.older.orders.length > 0;
  const hasActiveFilter = search.length > 0 || filterStatus !== "ALL";

  if (!isMounted) return null;

  const statusLabel = (status: string) => {
    switch (status) {
      case "DELIVERED": return "LEVERERAD";
      case "REJECTED": return "NEKAD";
      case "CANCELLED": return "AVBOKAD";
      case "DELIVERING": return "LEVERERAS";
      case "DELIVERY_FAILED": return "MISSLYCKAD";
      default: return status;
    }
  };

  const renderEmptyGroup = (label: string, badge: string) => (
    <div className="flex items-center gap-4 px-3 py-6 opacity-40">
      <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-[var(--bg-primary)] shadow-lg ${badge}`}>{label}</div>
      <p className="text-[10px] font-bold text-[var(--text-primary)]/20 uppercase tracking-widest leading-none">Inga ordrar</p>
    </div>
  );

  const renderGroup = (label: string, data: { orders: Order[], total: number }, color: string, badge: string) => {
    if (label === "Aldre" && !isSuperAdmin) return null;

    if (data.orders.length === 0) {
      return <section>{renderEmptyGroup(label, badge)}</section>;
    }

    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between px-3">
           <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-[var(--bg-primary)] shadow-xl shadow-gold-500/10 ${badge}`}>{label}</div>
              <p className="text-[10px] font-bold text-[var(--text-primary)]/20 uppercase tracking-widest leading-none">{data.orders.length} {data.orders.length === 1 ? "Order" : "Ordrar"}</p>
           </div>
           <div className="text-right">
              <div className="text-[10px] font-black uppercase text-gold-500/40 mb-1 leading-none">Summa</div>
              <div className="text-xl font-black text-[var(--text-primary)] tabular-nums">{Math.round(data.total)} <span className="text-[10px] text-[var(--text-primary)]/20">KR</span></div>
           </div>
        </div>
        <div className="space-y-4">
          {data.orders.map((o: Order) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={o.id}
              onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
              className="glass border border-[var(--border-subtle)] rounded-[2rem] p-6 cursor-pointer hover:border-gold-500/10 hover:bg-[var(--bg-secondary)] transition-all group shadow-2xl relative overflow-hidden"
            >
               {o.status === "DELIVERED" && <Activity size={50} className="absolute top-0 right-0 p-4 opacity-5 scale-150 rotate-12 text-emerald-500"/>}
               {o.status === "REJECTED" && <AlertCircle size={50} className="absolute top-0 right-0 p-4 opacity-5 scale-150 rotate-12 text-rose-500"/>}
               <div className="flex items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 bg-[var(--border-subtle)] group-hover:bg-gold-500/10 rounded-xl flex items-center justify-center font-black text-[var(--text-primary)]/20 group-hover:text-gold-500 transition-colors italic text-xs shadow-inner">
                    {String(o.orderNumber).replace("PX-", "")}
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-0.5">
                      {(new Date(o.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · {statusLabel(o.status)}
                    </div>
                     <div className="font-black text-[var(--text-primary)] uppercase text-base tracking-tight">
                        {o.customerName} 
                        {isSuperAdmin && o.restaurantName && <span className="ml-3 text-[10px] font-black bg-gold-500/10 text-gold-500 px-3 py-1 rounded-lg border border-gold-500/20 italic">{o.restaurantName}</span>}
                     </div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 mb-1 leading-none">Typ</div>
                    <div className="font-black text-xs text-[var(--text-primary)]/40 flex items-center gap-2"> {o.type === 'DELIVERY' ? <Truck size={12}/> : <Store size={12}/>} {o.type === 'DELIVERY' ? 'UTKORNING' : 'HAMTNING'} </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 mb-1 leading-none">Summa</div>
                    <div className="text-xl font-black text-gold-500 transition-colors tabular-nums">{Math.round(o.total)} KR</div>
                  </div>
                  <ChevronDown className={`text-[var(--text-primary)]/10 transition-transform ${expandedId === o.id ? "rotate-180 text-gold-500" : "group-hover:text-[var(--text-primary)]/20"}`} />
                </div>
              </div>
              <AnimatePresence>
                {expandedId === o.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pt-8 mt-8 border-t border-[var(--border-subtle)] relative z-10">
                    <div className="grid md:grid-cols-2 gap-10">
                      <div>
                        <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 mb-4 tracking-[0.2em] px-2 flex justify-between"><span>Artiklar</span> <span>Pris</span></div>
                        <div className="space-y-2">
                           {o.items && o.items.length > 0 ? o.items.map((it, idx) => (
                             <div key={idx} className="flex justify-between items-center bg-[var(--border-subtle)] p-4 rounded-xl border border-[var(--border-subtle)]">
                                <span className="font-black text-xs text-[var(--text-primary)]/80 uppercase">
                                  <span className="text-gold-500 mr-2">{it.quantity}x</span> {it.productName}
                                </span>
                                <span className="text-[11px] font-bold text-[var(--text-primary)]/20">{Math.round(it.price * it.quantity)} KR</span>
                             </div>
                           )) : (
                             <div className="text-[10px] font-bold text-[var(--text-primary)]/10 uppercase text-center py-6">Inga artiklar</div>
                           )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-6 md:border-l border-[var(--border-subtle)] md:pl-10">
                         <div className="space-y-4">
                           <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 tracking-[0.2em]">Kunduppgifter</div>
                           <div className="bg-[var(--bg-primary)] p-5 rounded-2xl border border-[var(--border-subtle)] space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-[var(--text-primary)]/20 uppercase">Mobil</span>
                                <span className="font-black text-sm text-[var(--text-primary)]/80 transition-colors uppercase">{o.customerPhone || "—"}</span>
                              </div>
                              {o.type === 'DELIVERY' && (
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-[var(--text-primary)]/20 uppercase">Adress</span>
                                  <span className="font-black text-[11px] text-[var(--text-primary)]/80 text-right uppercase italic leading-tight">{o.deliveryStreet}{o.deliveryCity ? `, ${o.deliveryCity}` : ""}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center pt-2 border-t border-[var(--border-subtle)]">
                                <span className="text-[10px] font-black text-[var(--text-primary)]/20 uppercase">Totalt</span>
                                <span className="font-black text-base text-gold-500">{Math.round(o.total)} KR</span>
                              </div>
                           </div>
                         </div>
                         <button
                           onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${o.id}`, '_blank'); }}
                           className="w-full py-5 bg-gold-500 rounded-2xl text-[11px] font-black uppercase text-[var(--bg-primary)] hover:bg-gold-400 active:scale-[0.98] transition-all shadow-xl shadow-gold-500/20 flex items-center justify-center gap-3 tracking-widest border-2 border-gold-400/30"
                         >
                           <Printer size={20} strokeWidth={2.5} /> Visa Kvitto
                         </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32 pt-4 lg:pt-10 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 glass border-2 border-gold-500/20 rounded-[2.2rem] flex items-center justify-center text-gold-500 shadow-2xl relative overflow-hidden group">
             <div className="absolute inset-0 bg-gold-500 animate-pulse opacity-5" />
             <Clock size={32} className="relative z-10 group-hover:rotate-12 transition-transform" />
          </div>
          <div>
            <h1 className="text-3xl lg:text-4xl font-black uppercase text-[var(--text-primary)] tracking-tighter leading-none italic">Foregaende <span className="text-gold-500">Ordrar</span></h1>
            <p className="text-[var(--text-primary)]/20 text-[10px] font-black uppercase tracking-[0.4em] mt-1">{selectedRestaurantName || "Central Logg"}</p>
          </div>
        </div>
        <div className="flex gap-4">
           <div className="glass border border-emerald-500/20 p-5 rounded-[2rem] text-center min-w-[130px] shadow-2xl relative overflow-hidden group">
              <TrendingUp size={30} className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 text-emerald-500"/>
              <div className="text-[10px] font-black uppercase text-emerald-500/50 mb-1 leading-none tracking-widest">Idag Summa</div>
              <div className="text-xl font-black text-emerald-400 tabular-nums">{Math.round(groups.today.total)} KR</div>
           </div>
           <div className="glass border border-[var(--border-subtle)] p-5 rounded-[2rem] text-center min-w-[130px] shadow-2xl relative overflow-hidden group">
              <TrendingDown size={30} className="absolute top-0 right-0 p-2 opacity-5 scale-150 -rotate-12 text-[var(--text-primary)]/50"/>
              <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 mb-1 leading-none tracking-widest">Igar Summa</div>
              <div className="text-xl font-black text-[var(--text-primary)]/80 tabular-nums">{Math.round(groups.yesterday.total)} KR</div>
           </div>
        </div>
      </div>

      <div className="glass border border-[var(--border-strong)] p-4 lg:p-6 rounded-[2.5rem] flex flex-col lg:flex-row gap-4 shadow-2xl relative z-20">
        <div className="relative flex-1 group">
           <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/10 group-focus-within:text-gold-500 transition-colors" size={20} />
           <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sok bland foregaende ordrar..." className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl py-5 pl-16 pr-6 text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/10 focus:outline-none focus:border-gold-500/40 transition-all" />
        </div>
        <div className="flex gap-2">
           <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl px-6 py-4 text-[11px] font-black uppercase text-[var(--text-primary)]/30 focus:outline-none focus:border-gold-500/30 cursor-pointer appearance-none min-w-[160px]">
              <option value="ALL">Alla Statusar</option>
              <option value="DELIVERED">Klara Ordrar</option>
              <option value="REJECTED">Nekade</option>
              <option value="CANCELLED">Avbokade</option>
           </select>
           <button onClick={fetchData} className="p-4 px-6 bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-gold-500/40 hover:text-gold-500 hover:bg-[var(--bg-secondary)] rounded-2xl active:scale-95 transition-all outline-none">
              <RefreshCw size={24} className={loading ? "animate-spin" : ""}/>
           </button>
        </div>
      </div>

      <div className="space-y-16">
        {loading && orders.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-6">
            <Loader2 className="animate-spin text-gold-500/20" size={50}/>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-[var(--text-primary)]/5">Hamtar Data...</p>
          </div>
        ) : error ? (
           <div className="py-24 flex flex-col items-center gap-6 text-center border-2 border-dashed border-rose-500/10 rounded-[3rem] bg-rose-500/[0.02]">
              <AlertCircle className="text-rose-500/20" size={50}/>
              <p className="text-[var(--text-primary)]/20 font-black uppercase text-[10px] tracking-widest">{error}</p>
              <button onClick={fetchData} className="px-10 py-4 bg-[var(--border-subtle)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-secondary)] transition-all">Forsok Igen</button>
           </div>
        ) : (
          <>
            {renderGroup("Idag", groups.today, "text-emerald-500", "bg-emerald-500")}
            {renderGroup("Igar", groups.yesterday, "text-gold-500", "bg-gold-500")}
            {renderGroup("Aldre", groups.older, "text-[var(--text-primary)]/40", "bg-[var(--text-primary)]/10")}
            
            {orders.length > 0 && !hasAnyResults && hasActiveFilter && (
              <div className="py-24 flex flex-col items-center gap-6 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[3rem]">
                <Search className="text-[var(--text-primary)]/10" size={44}/>
                <div>
                  <p className="text-[var(--text-primary)]/20 font-black uppercase text-[11px] tracking-widest mb-2">Inga matchande ordrar</p>
                  <p className="text-[var(--text-primary)]/10 font-bold text-[10px] tracking-wide">Prova att andra din sokning eller filtret</p>
                </div>
                <button onClick={() => { setSearch(""); setFilterStatus("ALL"); }} className="px-8 py-3 bg-[var(--border-subtle)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-secondary)] transition-all">Rensa Filter</button>
              </div>
            )}

            {orders.length === 0 && !loading && (
              <div className="py-32 flex flex-col items-center gap-6 text-center">
                <PackageX className="text-[var(--text-primary)]/5" size={60}/>
                <div>
                  <p className="text-[var(--text-primary)]/10 font-black uppercase text-xs tracking-[0.3em] mb-2">Inga ordrar hittades</p>
                  <p className="text-[var(--text-primary)]/5 font-bold text-[10px] tracking-wide">Slutforda ordrar visas har automatiskt</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
