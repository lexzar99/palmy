"use client";

import { useEffect, useState, useCallback } from "react";
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
  ChevronRight
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
  
  const { selectedRestaurantId } = useRestaurantStore();

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    const raw = localStorage.getItem("palmyra_admin");
    const admin = raw ? JSON.parse(raw) : null;
    setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch specifically historical (not active) orders. 
      // For now, we fetch all and filter client-side for history (Status in [DELIVERED, REJECTED, CANCELLED])
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=200`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      
      let fetched = res.data.orders || [];
      
      // Filter for history
      fetched = fetched.filter((o: Order) => 
        ["DELIVERED", "REJECTED", "CANCELLED", "DELIVERY_FAILED"].includes(o.status)
      );

      // Filter by restaurant if not super admin or if one is selected
      if (!isSuperAdmin || selectedRestaurantId) {
        const id = selectedRestaurantId;
        fetched = fetched.filter((o: Order) => o.restaurantId === id);
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

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.customerName?.toLowerCase().includes(search.toLowerCase()) || 
                         o.orderNumber.toString().includes(search);
    const matchesStatus = filterStatus === "ALL" || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-10 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/5 rounded-[1.8rem] border border-white/10 flex items-center justify-center text-white/40">
             <Clock size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-1">Orderhistorik</h1>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em]">
              {isSuperAdmin && !selectedRestaurantId ? "Alla avslutade ordrar från systemet" : "Historik för vald enhet"}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 lg:p-10 flex flex-col lg:flex-row gap-6 items-center">
         <div className="relative flex-1 group w-full">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={20} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök på ordernummer eller kundnamn..."
              className="w-full bg-dark-500 border border-white/5 rounded-2xl py-4 pl-16 pr-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-bold text-sm"
            />
         </div>
         <div className="flex gap-4 w-full lg:w-auto">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-8 py-4 bg-dark-500 border border-white/5 rounded-2xl font-black uppercase tracking-widest text-xs outline-none focus:ring-2 focus:ring-gold-500/30 appearance-none min-w-[200px]"
            >
               <option value="ALL">Alla Statusar</option>
               <option value="DELIVERED">Levererade</option>
               <option value="REJECTED">Nekade</option>
               <option value="CANCELLED">Avbokade</option>
            </select>
            <button onClick={fetchData} className="p-4 bg-gold-500 text-dark-500 rounded-2xl hover:bg-gold-400 transition-all shadow-xl shadow-gold-500/20">
               <Filter size={24} />
            </button>
         </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
         {loading ? (
           <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gold-500" size={48} /></div>
         ) : filteredOrders.length === 0 ? (
           <div className="py-32 text-center text-white/10 italic flex flex-col items-center gap-4">
              <CalendarIcon size={64} />
              <p className="font-black uppercase tracking-[0.4em] text-sm italic">Ingen historik hittades</p>
           </div>
         ) : (
           <div className="grid grid-cols-1 gap-4">
              <AnimatePresence mode="popLayout">
                 {filteredOrders.map(order => (
                    <motion.div 
                      key={order.id}
                      layout
                      className={`bg-white/5 border-2 rounded-[2.2rem] transition-all overflow-hidden ${expandedId === order.id ? "border-white/10" : "border-transparent hover:border-white/5"}`}
                    >
                       <div 
                         onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                         className="p-8 flex flex-col lg:flex-row items-center justify-between gap-8 cursor-pointer"
                       >
                          <div className="flex items-center gap-8 w-full lg:w-auto">
                             <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center font-black text-white/20 border border-white/5">
                                #{order.orderNumber}
                             </div>
                             <div className="min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                   <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                     order.status === "DELIVERED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                                   }`}>
                                      {order.status === "DELIVERED" ? "Slutförd" : "Ej genomförd"}
                                   </span>
                                   <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                                      {new Date(order.createdAt).toLocaleDateString()} · {new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                   </span>
                                </div>
                                <div className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3 truncate">
                                   {order.customerName}
                                   {isSuperAdmin && (
                                     <span className="text-[10px] text-gold-500/40 px-2 py-0.5 bg-gold-500/5 rounded-lg border border-gold-500/10">{order.restaurantName}</span>
                                   )}
                                </div>
                             </div>
                          </div>

                          <div className="flex items-center justify-between lg:justify-end gap-10 w-full lg:w-auto border-t lg:border-none border-white/5 pt-6 lg:pt-0">
                             <div className="flex items-center gap-8">
                                <div className="text-center">
                                   <div className="text-[9px] font-black uppercase text-white/20 mb-1">Typ</div>
                                   <div className="font-black text-xs uppercase flex items-center gap-2">
                                      {order.type === "DELIVERY" ? <Truck size={14} /> : <Store size={14} />}
                                      {order.type === "DELIVERY" ? "Utkörning" : "Hämtning"}
                                   </div>
                                </div>
                                <div className="text-right">
                                   <div className="text-[9px] font-black uppercase text-white/20 mb-1">Belopp</div>
                                   <div className="text-xl font-black text-gold-500">{order.total} KR</div>
                                </div>
                             </div>
                             <ChevronRight className={`text-white/10 transition-transform ${expandedId === order.id ? "rotate-90 text-gold-500" : ""}`} />
                          </div>
                       </div>

                       <AnimatePresence>
                          {expandedId === order.id && (
                             <motion.div 
                               initial={{ height: 0, opacity: 0 }}
                               animate={{ height: "auto", opacity: 1 }}
                               exit={{ height: 0, opacity: 0 }}
                               className="px-10 pb-10 pt-4 border-t border-white/5"
                             >
                                <div className="grid lg:grid-cols-2 gap-10">
                                   <div className="space-y-6">
                                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/5 pb-2">Artiklar</div>
                                      <div className="space-y-3">
                                         {order.items?.map((item: any) => (
                                           <div key={item.id} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                                              <div className="flex items-center gap-4">
                                                 <span className="font-black text-gold-500">{item.quantity}×</span>
                                                 <span className="font-bold text-sm uppercase">{item.productName}</span>
                                              </div>
                                              <span className="text-xs font-black text-white/20">{item.subtotal} KR</span>
                                           </div>
                                         ))}
                                      </div>
                                   </div>
                                   <div className="space-y-6">
                                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/5 pb-2">Detaljer</div>
                                      <div className="bg-white/5 p-6 rounded-3xl space-y-4">
                                         <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-white/20">Mobil</span>
                                            <span className="font-bold text-sm">{order.customerPhone}</span>
                                         </div>
                                         {order.type === "DELIVERY" && (
                                            <div className="flex items-center justify-between">
                                               <span className="text-[10px] font-black uppercase text-white/20">Adress</span>
                                               <span className="font-bold text-sm uppercase text-right">{order.deliveryStreet}, {order.deliveryCity}</span>
                                            </div>
                                         )}
                                         <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                            <span className="text-[10px] font-black uppercase text-gold-500">Kvitto</span>
                                            <button 
                                              onClick={() => window.open(`/receipt?orderId=${order.id}`, "_blank")}
                                              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gold-500 hover:text-gold-400"
                                            >
                                               <Printer size={16} /> Visa Kvitto
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
              </AnimatePresence>
           </div>
         )}
      </div>
    </div>
  );
};

export default HistoryPage;
