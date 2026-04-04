"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Clock, 
  Search, 
  Calendar as CalendarIcon, 
  Filter, 
  ChevronDown, 
  Loader2, 
  ShoppingCart, 
  User, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  Printer, 
  Globe,
  Truck,
  Store,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  BarChart2
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
  
  const { selectedRestaurantId, selectedRestaurantName } = useRestaurantStore();

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=300`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      
      let fetched = res.data.orders || [];
      
      // Filter for history (Non-active states)
      fetched = fetched.filter((o: Order) => 
        ["DELIVERED", "REJECTED", "CANCELLED", "DELIVERY_FAILED", "READY", "DELIVERING"].includes(o.status)
      );

      if (!isSuperAdmin || selectedRestaurantId) {
        fetched = fetched.filter((o: Order) => o.restaurantId === selectedRestaurantId);
      }

      setOrders(fetched);
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isSuperAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Grouping Logic
  const groupedOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const filtered = orders.filter(o => {
      const matchesSearch = o.customerName?.toLowerCase().includes(search.toLowerCase()) || 
                           o.orderNumber.toString().includes(search);
      const matchesStatus = filterStatus === "ALL" || o.status === filterStatus;
      return matchesSearch && matchesStatus;
    });

    const groups: Record<string, { orders: Order[], total: number }> = {
      today: { orders: [], total: 0 },
      yesterday: { orders: [], total: 0 },
      older: { orders: [], total: 0 }
    };

    filtered.forEach(o => {
      const d = new Date(o.createdAt);
      if (d >= startOfToday) {
        groups.today.orders.push(o);
        groups.today.total += o.total;
      } else if (d >= startOfYesterday) {
        groups.yesterday.orders.push(o);
        groups.yesterday.total += o.total;
      } else {
        groups.older.orders.push(o);
        groups.older.total += o.total;
      }
    });

    return groups;
  }, [orders, search, filterStatus]);

  const renderGroup = (label: string, emoji: string, data: { orders: Order[], total: number }, color: string) => {
    if (data.orders.length === 0) return null;
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between px-4">
           <div className="flex items-center gap-4">
              <div className={`w-1.5 h-10 rounded-full ${color}`} />
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">{label}</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">{data.orders.length} Beställningar</p>
              </div>
           </div>
           <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Omsättning</div>
              <div className={`text-2xl font-black tabular-nums ${color.replace('bg-','text-')}`}>{data.total} KR</div>
           </div>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {data.orders.map(order => (
            <motion.div 
              key={order.id}
              layout
              className={`bg-[#0f111a] border border-white/5 rounded-[2rem] transition-all overflow-hidden hover:border-white/10`}
            >
               <div 
                 onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                 className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 cursor-pointer"
               >
                  <div className="flex items-center gap-6">
                     <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center font-black text-white/40 border border-white/5 shadow-inner">
                        #{order.orderNumber}
                     </div>
                     <div>
                        <div className="flex items-center gap-3 mb-1">
                           <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                             order.status === "DELIVERED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                           }`}>
                              {order.status === "DELIVERED" ? "Klar" : "Nekad/Avbruten"}
                           </span>
                           <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                              {new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </span>
                        </div>
                        <div className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-3">
                           {order.customerName}
                           {isSuperAdmin && (
                             <span className="text-[9px] text-gold-500/40 px-2 py-0.5 bg-gold-500/5 rounded-lg border border-gold-500/10">{order.restaurantName}</span>
                           )}
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-10">
                     <div className="flex items-center gap-8">
                        <div className="text-center hidden sm:block">
                           <div className="text-[9px] font-black uppercase text-white/20 mb-1">Metod</div>
                           <div className="font-black text-[10px] uppercase flex items-center gap-2 text-white/60">
                              {order.type === "DELIVERY" ? <Truck size={14} /> : <Store size={14} />}
                              {order.type === "DELIVERY" ? "Utkörning" : "Hämtning"}
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[9px] font-black uppercase text-white/20 mb-1 leading-none">Summa</div>
                           <div className="text-xl font-black text-gold-500">{order.total} KR</div>
                        </div>
                     </div>
                     <ChevronDown className={`text-white/10 transition-transform ${expandedId === order.id ? "rotate-180 text-gold-500" : ""}`} />
                  </div>
               </div>

               <AnimatePresence>
                  {expandedId === order.id && (
                     <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-8 pb-8 pt-4 border-t border-white/5 bg-[#07080d]/50">
                        <div className="grid lg:grid-cols-2 gap-8">
                           <div className="space-y-4">
                              <div className="text-[9px] font-black uppercase tracking-widest text-white/20 border-b border-white/5 pb-2">Artiklar</div>
                              <div className="space-y-2">
                                 {order.items?.map((item: any) => (
                                   <div key={item.id} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                                      <div className="flex items-center gap-3">
                                         <span className="w-6 h-6 bg-gold-500/10 flex items-center justify-center rounded-lg font-black text-[10px] text-gold-500">{item.quantity}x</span>
                                         <span className="font-black text-[11px] uppercase text-white/70">{item.productName}</span>
                                      </div>
                                      <span className="text-[10px] font-black text-white/20">{item.subtotal || item.price * item.quantity} KR</span>
                                   </div>
                                 ))}
                              </div>
                           </div>
                           <div className="space-y-4">
                              <div className="text-[9px] font-black uppercase tracking-widest text-white/20 border-b border-white/5 pb-2">Information</div>
                              <div className="bg-white/5 p-6 rounded-[1.5rem] space-y-4 border border-white/5">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black uppercase text-white/20">Mobil</span>
                                    <span className="font-black text-xs text-white">{order.customerPhone}</span>
                                 </div>
                                 {order.type === "DELIVERY" && (
                                    <div className="flex items-center justify-between">
                                       <span className="text-[9px] font-black uppercase text-white/20">Adress</span>
                                       <span className="font-black text-xs uppercase text-right text-white">{order.deliveryStreet}, {order.deliveryCity}</span>
                                    </div>
                                 )}
                                 <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                    <button onClick={() => window.open(`/receipt?orderId=${order.id}`, "_blank")} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gold-500 hover:text-gold-400 transition-colors">
                                       <Printer size={16} /> Kvitto
                                    </button>
                                 </div>
                              </div>
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
    <div className="max-w-4xl mx-auto space-y-12 pb-32 pt-10 px-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 shadow-2xl">
             <Clock size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight text-white italic">Order<span className="text-gold-500">Historik</span></h1>
            <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mt-1">
              {selectedRestaurantName || "Central Kontroll"}
            </p>
          </div>
        </div>
        
        {/* Quick Summary Cards */}
        <div className="flex gap-4">
           <div className="bg-[#0f111a] border border-white/5 p-4 rounded-2xl min-w-[140px] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 text-emerald-500"><TrendingUp size={40} /></div>
              <div className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Idag Totalt</div>
              <div className="text-lg font-black text-emerald-400 tabular-nums">{groupedOrders.today.total} <span className="text-[9px] text-white/30">KR</span></div>
           </div>
           <div className="bg-[#0f111a] border border-white/5 p-4 rounded-2xl min-w-[140px] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 text-gold-500"><BarChart2 size={40} /></div>
              <div className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Igår Totalt</div>
              <div className="text-lg font-black text-white/60 tabular-nums">{groupedOrders.yesterday.total} <span className="text-[9px] text-white/30">KR</span></div>
           </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#0f111a] border border-white/5 rounded-[2.5rem] p-6 lg:p-8 flex flex-col lg:flex-row gap-6 items-center shadow-2xl">
         <div className="relative flex-1 group w-full">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-gold-500 transition-colors" size={20} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök på ordernummer eller kund..."
              className="w-full bg-[#07080d] border border-white/5 rounded-2xl py-4 pl-16 pr-6 outline-none focus:border-gold-500/40 text-sm font-bold text-white placeholder:text-white/10"
            />
         </div>
         <div className="flex gap-4 w-full lg:w-auto">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-6 py-4 bg-[#07080d] border border-white/5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white/60 outline-none focus:border-gold-500/40 appearance-none min-w-[180px] cursor-pointer"
            >
               <option value="ALL">Alla Statusar</option>
               <option value="DELIVERED">Klara Ordrar</option>
               <option value="REJECTED">Nekade</option>
               <option value="CANCELLED">Avbokade</option>
            </select>
            <button onClick={fetchData} className="p-4 bg-gold-500 text-dark-500 rounded-2xl hover:bg-gold-400 transition-all shadow-xl shadow-gold-500/20 active:scale-95">
               <RefreshCw size={24} className={loading?"animate-spin":""} />
            </button>
         </div>
      </div>

      {/* Grouped Lists */}
      <div className="space-y-20">
         {loading ? (
           <div className="py-20 flex flex-col items-center gap-6">
              <Loader2 className="animate-spin text-gold-500" size={48} />
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/10">Synkar Historik...</p>
           </div>
         ) : (
           <>
             {renderGroup("Idag", "✨", groupedOrders.today, "bg-emerald-500")}
             {renderGroup("Igår", "📅", groupedOrders.yesterday, "bg-gold-500")}
             {renderGroup("Tidigare Historik", "📜", groupedOrders.older, "bg-white/10")}
             
             {orders.length === 0 && (
               <div className="py-32 text-center text-white/10 italic flex flex-col items-center gap-6">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center opacity-20">
                    <CalendarIcon size={48} />
                  </div>
                  <p className="font-black uppercase tracking-[0.4em] text-sm">Hittade inga sparade ordrar</p>
               </div>
             )}
           </>
         )}
      </div>
    </div>
  );
};

export default HistoryPage;
