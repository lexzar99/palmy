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
  RefreshCw
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
  restaurantId?: string;
  items: any[];
}

const HistoryPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  const { selectedRestaurantId, selectedRestaurantName } = useRestaurantStore();

  useEffect(() => {
    setIsMounted(true);
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (typeof window === "undefined") return;
    setLoading(true);
    try {
      const token = localStorage.getItem("palmyra_token");
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=300`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let fetched = res.data.orders || [];
      // Filter for non-active orders
      fetched = fetched.filter((o: Order) => 
        ["DELIVERED", "REJECTED", "CANCELLED", "DELIVERY_FAILED", "READY", "DELIVERING"].includes(o.status)
      );
      if (!isSuperAdmin || selectedRestaurantId) {
        fetched = fetched.filter((o: Order) => o.restaurantId === selectedRestaurantId);
      }
      setOrders(fetched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isSuperAdmin]);

  useEffect(() => {
    if (isMounted) fetchData();
  }, [fetchData, isMounted]);

  const groups = useMemo(() => {
    const res = { today: { orders: [], total: 0 }, yesterday: { orders: [], total: 0 }, older: { orders: [], total: 0 } } as any;
    if (!isMounted) return res;
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      else { res.older.orders.push(o); res.older.total += o.total; }
    });
    return res;
  }, [orders, search, filterStatus, isMounted]);

  if (!isMounted) return null;

  const renderGroup = (label: string, groupData: any, colorClass: string) => {
    if (groupData.orders.length === 0) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
           <div className="flex items-center gap-4">
              <div className={`w-1 h-8 rounded-full ${colorClass}`} />
              <h2 className="text-xl font-black uppercase text-white">{label} ({groupData.orders.length})</h2>
           </div>
           <div className="text-right">
              <div className="text-[10px] font-black uppercase text-white/40">Omsättning: <span className="text-white">{groupData.total} KR</span></div>
           </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {groupData.orders.map((o: Order) => (
            <div key={o.id} onClick={() => setExpandedId(expandedId === o.id ? null : o.id)} className="bg-[#0f111a] border border-white/5 rounded-3xl p-6 cursor-pointer hover:border-white/10 transition-all">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center font-black text-white/20 italic text-xs">#{o.orderNumber}</div>
                  <div>
                    <div className="text-[9px] font-black uppercase text-white/20">
                      {(new Date(o.createdAt)).toLocaleTimeString('sv-SE', {hour:'2-digit', minute:'2-digit'})}
                    </div>
                    <div className="font-black text-white uppercase text-base">{o.customerName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-[9px] font-black uppercase text-white/20">Belopp</div>
                    <div className="text-xl font-black text-gold-500">{o.total} KR</div>
                  </div>
                  <ChevronDown className={`text-white/10 transition-transform ${expandedId === o.id ? "rotate-180" : ""}`} />
                </div>
              </div>
              <AnimatePresence>
                {expandedId === o.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pt-6 mt-6 border-t border-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <div className="text-[9px] font-black uppercase text-white/20 mb-2">Artiklar</div>
                        {o.items?.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] font-bold text-white/70">
                            <span>{it.quantity}x {it.productName}</span>
                            <span>{it.price * it.quantity} KR</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-4 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-8">
                         <div className="flex justify-between text-[10px] font-black uppercase">
                            <span className="text-white/20">Telefon</span>
                            <span className="text-white">{o.customerPhone}</span>
                         </div>
                         <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${o.id}`, '_blank'); }} className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase text-gold-500 transition-all flex items-center justify-center gap-2"> <Printer size={14}/> Skriv Ut </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32 pt-10 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 border border-gold-500/10"><Clock size={28} /></div>
          <div>
            <h1 className="text-3xl font-black uppercase text-white tracking-tight italic">Order<span className="text-gold-500">Historik</span></h1>
            <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">{selectedRestaurantName || "Central Modul"}</p>
          </div>
        </div>
        <div className="flex gap-3">
           <div className="bg-[#0f111a] border border-white/5 p-4 rounded-2xl min-w-[120px] text-center shadow-xl">
              <div className="text-[8px] font-black uppercase text-white/20 mb-1">Idag</div>
              <div className="text-lg font-black text-emerald-400">{groups.today.total} KR</div>
           </div>
           <div className="bg-[#0f111a] border border-white/5 p-4 rounded-2xl min-w-[120px] text-center shadow-xl">
              <div className="text-[8px] font-black uppercase text-white/20 mb-1">Igår</div>
              <div className="text-lg font-black text-white/60">{groups.yesterday.total} KR</div>
           </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
           <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/10" size={18} />
           <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök bland gamla ordrar..." className="w-full bg-[#0f111a] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-sm font-bold text-white focus:outline-none focus:border-gold-500/40" />
        </div>
        <div className="flex gap-2">
           <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[#0f111a] border border-white/5 rounded-2xl px-6 py-4 text-[10px] font-black uppercase text-white/60 focus:outline-none appearance-none cursor-pointer">
              <option value="ALL">Alla Statusar</option>
              <option value="DELIVERED">Klara</option>
              <option value="REJECTED">Nekade</option>
           </select>
           <button onClick={fetchData} className="p-4 bg-gold-500 text-dark-500 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-gold-500/10"><RefreshCw size={22} className={loading?"animate-spin":""}/></button>
        </div>
      </div>

      <div className="space-y-20">
        {loading && orders.length === 0 ? (
          <div className="py-20 text-center"><Loader2 className="animate-spin text-gold-500 mx-auto" size={40}/></div>
        ) : (
          <>
            {renderGroup("Beställningar Idag", groups.today, "bg-emerald-500")}
            {renderGroup("Beställningar Igår", groups.yesterday, "bg-gold-500")}
            {renderGroup("Tidigare Historik", groups.older, "bg-white/10")}
            {orders.length === 0 && !loading && <div className="py-20 text-center text-white/10 italic uppercase font-black tracking-widest">Hittade ingen historik</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
