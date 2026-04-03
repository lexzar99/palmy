"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Loader2, 
  Calendar, 
  Hash, 
  User, 
  Phone, 
  MapPin, 
  Truck, 
  Store, 
  Clock, 
  Printer, 
  ChevronRight,
  Filter
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Väntande",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERED: "Levererad",
  DELIVERY_FAILED: "Ej levererad",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-400 text-dark-500",
  PREPARING: "bg-orange-500 text-white",
  READY: "bg-gold-500 text-white",
  DELIVERED: "bg-green-500 text-white",
  DELIVERY_FAILED: "bg-red-500 text-white",
  CANCELLED: "bg-red-500/20 text-red-400",
  REJECTED: "bg-red-600/20 text-red-400",
};

const HistoryPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const { selectedRestaurantId } = useRestaurantStore();

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  const fetchOrders = useCallback(async () => {
    if (!selectedRestaurantId) return;
    setLoading(true);
    try {
      let url = `${API_URL}/api/admin/orders?limit=100&restaurantId=${selectedRestaurantId}`;
      if (dateFilter) url += `&date=${dateFilter}`;
      
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setOrders(res.data.orders);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, selectedRestaurantId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = orders.filter(o => 
    o.orderNumber.toString().includes(searchTerm) ||
    o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerPhone.includes(searchTerm)
  );

  return (
    <div className="space-y-10 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Föregående <span className="text-gold-500">Beställningar</span></h1>
          <p className="text-white/40 font-medium">Sök och granska alla tidigare ordrar.</p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Sök på order # eller namn..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 outline-none focus:ring-2 focus:ring-gold-500/50 transition-all text-sm w-64"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input 
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-gold-500/20 transition-all text-sm text-white/60"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* List */}
        <div className="xl:col-span-7 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gold-500" size={32} />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white/5 border border-white/5 rounded-3xl p-20 text-center text-white/20">
              <p className="font-bold uppercase tracking-widest text-sm">Inga ordrar matchade sökningen</p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <motion.div
                key={order.id}
                layout
                onClick={() => setSelectedOrder(order)}
                className={`p-6 rounded-3xl border transition-all cursor-pointer group ${
                  selectedOrder?.id === order.id 
                  ? "bg-gold-500/10 border-gold-500/40" 
                  : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${selectedOrder?.id === order.id ? "bg-gold-500 text-dark-500" : "bg-white/5 text-white/40 group-hover:text-gold-500"}`}>
                      #{order.orderNumber}
                    </div>
                    <div>
                      <div className="font-bold uppercase text-sm mb-1">{order.customerName}</div>
                      <div className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-2">
                        {new Date(order.createdAt).toLocaleDateString('sv-SE')} · {new Date(order.createdAt).toLocaleTimeString('sv-SE', {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="font-black text-lg text-gold-500">{order.total.toFixed(0)} KR</div>
                      <div className={`text-[9px] font-black uppercase tracking-widest ${STATUS_COLORS[order.status] || "text-white/40"}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </div>
                    </div>
                    <ChevronRight size={20} className={`text-white/10 group-hover:text-gold-500 transition-all ${selectedOrder?.id === order.id ? "translate-x-1 text-gold-500" : ""}`} />
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className="xl:col-span-5">
          <div className="sticky top-32">
            <AnimatePresence mode="wait">
              {selectedOrder ? (
                <motion.div
                  key={selectedOrder.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 overflow-hidden relative"
                >
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gold-500 rounded-2xl flex items-center justify-center text-dark-500 flex-shrink-0">
                        <Hash size={24} />
                      </div>
                      <div>
                        <div className="text-2xl font-black uppercase tracking-tight">Order #{selectedOrder.orderNumber}</div>
                        <div className={`text-[10px] font-black uppercase tracking-widest mt-1 ${STATUS_COLORS[selectedOrder.status]}`}>
                          {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.open(`/receipt?orderId=${selectedOrder.id}`, '_blank')}
                      className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group"
                    >
                      <Printer size={20} className="text-white/40 group-hover:text-gold-500" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <User size={16} className="text-white/20" />
                        <div>
                          <div className="text-[9px] text-white/20 uppercase font-black tracking-widest">Kund</div>
                          <div className="text-sm font-bold">{selectedOrder.customerName}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone size={16} className="text-white/20" />
                        <div>
                          <div className="text-[9px] text-white/20 uppercase font-black tracking-widest">Telefon</div>
                          <div className="text-sm font-bold">{selectedOrder.customerPhone}</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        {selectedOrder.type === "DELIVERY" ? <Truck size={16} className="text-white/20" /> : <Store size={16} className="text-white/20" />}
                        <div>
                          <div className="text-[9px] text-white/20 uppercase font-black tracking-widest">Typ</div>
                          <div className="text-sm font-bold uppercase">{selectedOrder.type === "DELIVERY" ? "Hemkörning" : "Avhämtning"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Clock size={16} className="text-white/20" />
                        <div>
                          <div className="text-[9px] text-white/20 uppercase font-black tracking-widest">Tid</div>
                          <div className="text-sm font-bold">{new Date(selectedOrder.createdAt).toLocaleTimeString('sv-SE', {hour:'2-digit', minute:'2-digit'})}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedOrder.type === "DELIVERY" && selectedOrder.deliveryStreet && (
                    <div className="flex gap-3 mb-10 bg-white/5 p-5 rounded-2xl border border-white/5">
                      <MapPin size={18} className="text-white/20 mt-1" />
                      <div>
                        <div className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">Adress</div>
                        <div className="font-bold text-sm leading-relaxed">{selectedOrder.deliveryStreet}, {selectedOrder.deliveryZip}</div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-5 mb-10">
                    <div className="text-[10px] text-white/20 uppercase font-black tracking-widest border-b border-white/5 pb-2">Artiklar</div>
                    {selectedOrder.items?.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <span className="font-black text-gold-500">{item.quantity}×</span>
                          <div className="text-sm font-bold uppercase">{item.productName}</div>
                        </div>
                        <div className="text-sm font-bold text-white/40">{item.subtotal} kr</div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-8 border-t border-white/10 flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Total Summa</div>
                      <div className="text-4xl font-black text-gold-500">{selectedOrder.total.toFixed(0)} KR</div>
                    </div>
                    <div className="text-[10px] text-white/20 uppercase font-black tracking-widest text-right">
                      Varav lev: {selectedOrder.deliveryFee} kr
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-white/5 border border-dashed border-white/10 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center text-white/10">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <Filter size={32} />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest">Välj en order för att se detaljer</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
