"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, User, Phone, MapPin, Check, X, Loader2, RefreshCw, Hash, Truck, Store, Clock, Printer, Bike, Smile, Globe, ChevronDown } from "lucide-react";
import { io as socketIO } from "socket.io-client";
import confetti from "canvas-confetti";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Väntande",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar för hämtning",
  DELIVERING: "På väg",
  DELIVERED: "Levererad",
  DELIVERY_FAILED: "Ej levererad",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-400 text-dark-500",
  ACCEPTED: "bg-emerald-500 text-dark-500",
  PREPARING: "bg-orange-500 text-white",
  READY: "bg-blue-500 text-white",
  DELIVERING: "bg-indigo-500 text-white",
  DELIVERED: "bg-green-500 text-white",
  DELIVERY_FAILED: "bg-red-500 text-white",
  CANCELLED: "bg-red-500/20 text-red-400",
  REJECTED: "bg-red-600/20 text-red-400",
};

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  deliveryStreet?: string;
  deliveryZip?: string;
  deliveryCity?: string;
  note?: string;
  total: number;
  deliveryFee: number;
  discountAmount: number;
  createdAt: string;
  estimatedTime?: number;
  items: {
    id: string;
    productName: string;
    quantity: number;
    subtotal: number;
    selectedExtras: string | any[];
    note?: string;
  }[];
  restaurantName?: string;
}

const ACTIVE_ORDER_STATUSES = new Set(["PENDING", "ACCEPTED", "PREPARING", "READY"]);
const COMPACT_ORDER_STATUSES = new Set(["READY", "DELIVERING", "DELIVERED", "DELIVERY_FAILED", "REJECTED", "CANCELLED"]);

const AdminOrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; time: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const socketRef = useRef<any>(null);
  const [newOrderNotification, setNewOrderNotification] = useState<Order | null>(null);
  const { selectedRestaurantId } = useRestaurantStore();

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
    if (!selectedRestaurantId && !isSuperAdmin) return;
    setLoading(true);
    try {
      const restaurantParam = isSuperAdmin ? (selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "") : `&restaurantId=${selectedRestaurantId}`;
      const [ordersRes, statsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/admin/orders?limit=100${restaurantParam}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/api/admin/stats?${restaurantParam.replace('&', '')}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);

      if (ordersRes.status === "fulfilled") {
        const sortedOrders = [...(ordersRes.value.data.orders || [])].sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(sortedOrders);
      }

      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.data);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isSuperAdmin]);

  useEffect(() => {
    if (!selectedRestaurantId && !isSuperAdmin) return;
    fetchData();

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;
    
    const joinAdminRoom = () => {
      socket.emit("join:admin", { restaurantId: selectedRestaurantId });
      void fetchData();
    };

    socket.on("connect", joinAdminRoom);
    socket.on("connect_error", (error) => {
      console.warn("Admin orders socket connection error:", error.message);
    });
    socket.emit("join:admin", { restaurantId: selectedRestaurantId });

    socket.on("order:new", (order: any) => {
      const shouldShow = isSuperAdmin ? (!selectedRestaurantId || order.restaurantId === selectedRestaurantId) : (order.restaurantId === selectedRestaurantId);
      if (shouldShow) {
        setOrders((prev) => {
          const merged = [order as Order, ...prev.filter((existing) => existing.id !== order.id)];
          return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });
        setStats((prev: any) => prev ? { ...prev, pendingOrders: (prev.pendingOrders || 0) + 1, ordersToday: (prev.ordersToday || 0) + 1 } : prev);
        
        if (isSuperAdmin) {
          setNewOrderNotification(order as Order);
          setTimeout(() => setNewOrderNotification(null), 5000);
        }

        window.setTimeout(() => {
          void fetchData();
        }, 250);
      }
    });

    socket.on("order:updated", (data: any) => {
      const shouldRefresh = isSuperAdmin ? (!selectedRestaurantId || data.restaurantId === selectedRestaurantId) : (!data.restaurantId || data.restaurantId === selectedRestaurantId);
      if (shouldRefresh) {
        void fetchData();
      }
    });

    const refreshInterval = window.setInterval(() => {
      void fetchData();
    }, 20000);

    return () => {
      window.clearInterval(refreshInterval);
      socket.disconnect();
    };
  }, [fetchData, selectedRestaurantId, isSuperAdmin]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) {
      alert("SUPER_ADMIN kan inte ta emot/uppdatera beställningar.");
      return;
    }
    setActionLoading(orderId);
    try {
      await axios.patch(
        `${API_URL}/api/admin/orders/${orderId}/status`,
        { status, estimatedTime },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setAcceptDialog(null);
      if (status === "PREPARING") {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D4A74A', '#FFFFFF', '#000000']
        });
      }
      await fetchData();
    } catch {
      alert("Kunde inte uppdatera status");
    } finally {
      setActionLoading(null);
    }
  };

  const parseExtras = (extras: any) => {
    if (typeof extras === "string") {
      try { return JSON.parse(extras); } catch { return []; }
    }
    return Array.isArray(extras) ? extras : [];
  };

  const splitExtras = (extras: any[]) => {
    const sizeExtras = extras.filter((extra) => extra.groupName?.toLowerCase() === "storlek");
    const sauceExtras = extras.filter((extra) => ["sås", "dip"].includes(extra.groupName?.toLowerCase()));
    const otherExtras = extras.filter((extra) => !sizeExtras.includes(extra) && !sauceExtras.includes(extra));
    return { sizeExtras, sauceExtras, otherExtras };
  };

  const getDisplayName = (item: any) => {
    const extras = parseExtras(item.selectedExtras);
    const { sizeExtras } = splitExtras(extras);
    return sizeExtras.length > 0
      ? `${item.productName} - ${sizeExtras.map((extra: any) => extra.extraName || extra.name).join(", ")}`
      : item.productName;
  };

  const getCountdown = (order: Order) => {
    if (!order.estimatedTime) return null;
    const promisedAt = new Date(order.createdAt).getTime() + order.estimatedTime * 60_000;
    const diffMs = promisedAt - now;
    const minutes = diffMs >= 0 ? Math.ceil(diffMs / 60_000) : Math.floor(diffMs / 60_000);
    const label = minutes >= 0 ? `${minutes} min kvar` : `${Math.abs(minutes)} min sen`;
    return { minutes, isLate: minutes < 0, label };
  };

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-gold-500 rounded-2xl flex items-center justify-center text-dark-500 shadow-xl shadow-gold-500/20">
            {!selectedRestaurantId ? <Globe size={28} /> : <ShoppingCart size={28} />}
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3 leading-none">
              {!selectedRestaurantId ? "Global Översikt" : "Beställningar"}
            </h1>
            <p className="text-white/30 font-black uppercase text-[9px] tracking-[0.4em] mt-2">
              {!selectedRestaurantId ? "Systemövergripande kontroll" : `Aktiv hantering av ${orders[0]?.restaurantName || "enheten"}`}
            </p>
          </div>
        </div>
        <button onClick={fetchData} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Accept dialog */}
      <AnimatePresence>
        {acceptDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-500/90 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-dark-400 border-2 border-white/10 rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl"
            >
              <h3 className="text-2xl font-black uppercase mb-2 tracking-tighter">Beräkna Tid</h3>
              <p className="text-white/40 mb-8 text-xs font-black uppercase tracking-widest">Hur långt tid tar det?</p>

              <div className="grid grid-cols-3 gap-4 mb-10 pr-2 pb-2">
                {[15, 20, 25, 30, 45, 60].map((t) => (
                  <button
                    key={t}
                    onClick={() => setAcceptDialog({ ...acceptDialog, time: t })}
                    className={`h-16 rounded-xl font-black text-lg transition-all border-2 ${
                      acceptDialog.time === t ? "bg-gold-500 text-dark-500 border-gold-500" : "bg-white/5 border-white/5 text-white/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button onClick={() => setAcceptDialog(null)} className="flex-1 py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white/40">Avbryt</button>
                <button
                  onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)}
                  className="flex-[2] py-5 bg-gold-500 text-dark-500 rounded-2xl font-black uppercase tracking-widest text-sm"
                >
                  OK {acceptDialog.time} MIN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-gold-500" size={40} /></div>
        ) : orders.length === 0 ? (
          <div className="py-24 text-center text-white/10 italic">Inga ordrar hittades</div>
        ) : (
          <AnimatePresence initial={false}>
            {orders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const isPending = order.status === "PENDING";
              const countdown = getCountdown(order);

              return (
                <motion.div
                  key={order.id}
                  layout
                  className={`bg-dark-400/50 backdrop-blur-xl border-2 rounded-[2rem] p-6 sm:p-8 transition-all relative overflow-hidden group ${
                    isPending ? "border-yellow-400/40 shadow-xl shadow-yellow-400/5" : "border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-6 min-w-0 flex-1">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 font-black ${
                        isPending ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20" : "bg-white/5 text-white/30 border-white/5"
                      }`}>
                         #{order.orderNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <div className={`text-[9px] font-black uppercase tracking-[0.3em] ${STATUS_COLORS[order.status] || "text-white/30"} px-2 py-0.5 rounded-full border border-current opacity-70`}>
                            {STATUS_LABELS[order.status] || order.status}
                          </div>
                          {order.restaurantName && (
                            <div className="text-[10px] font-black uppercase tracking-widest text-gold-500/50">🏠 {order.restaurantName}</div>
                          )}
                        </div>
                        <div className="text-2xl font-black uppercase tracking-tight truncate flex items-center gap-4">
                           {order.customerName}
                           <span className="text-sm font-bold text-white/20">{(new Date(order.createdAt)).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto">
                       {countdown && ACTIVE_ORDER_STATUSES.has(order.status) && (
                          <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${countdown.isLate ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                             {countdown.label}
                          </div>
                       )}
                       <button
                         onClick={() => setExpandedOrderId(prev => prev === order.id ? null : order.id)}
                         className="flex-1 sm:flex-none px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white/50 transition-all flex items-center gap-2"
                       >
                         {isExpanded ? "Stäng" : "Öppna"}
                         <ChevronDown size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                       </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-8 pt-8 border-t border-white/5 space-y-8 overflow-hidden"
                      >
                         {/* Control Bar for Admin (Not Super Admin) */}
                         {!isSuperAdmin && (
                           <div className="flex flex-wrap gap-4 p-6 bg-white/[0.03] rounded-3xl border border-white/5">
                             {isPending ? (
                               <>
                                 <button onClick={() => updateStatus(order.id, "REJECTED")} className="px-6 py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-black text-[10px] uppercase tracking-widest">Neka</button>
                                 <button onClick={() => setAcceptDialog({ orderId: order.id, time: 20 })} className="flex-1 py-4 bg-emerald-500 text-dark-500 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-emerald-500/20">Godkänn Order</button>
                               </>
                             ) : order.status === "PREPARING" ? (
                               <button onClick={() => updateStatus(order.id, order.type === "PICKUP" ? "READY" : "DELIVERING")} className="flex-1 py-4 bg-gold-500 text-dark-500 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-gold-500/20">Markera {order.type === "PICKUP" ? "Klar" : "På väg"}</button>
                             ) : null}
                             <button onClick={() => window.open(`/receipt?orderId=${order.id}`, "_blank")} className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white/40"><Printer size={20} /></button>
                           </div>
                         )}

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                               <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Innehåll</div>
                               <div className="space-y-2">
                                  {order.items?.map((item) => (
                                    <div key={item.id} className="bg-white/5 p-4 rounded-2xl flex items-start justify-between">
                                       <div className="flex gap-4">
                                          <span className="font-black text-gold-500">{item.quantity}×</span>
                                          <div>
                                             <div className="font-black uppercase text-sm">{getDisplayName(item)}</div>
                                             {parseExtras(item.selectedExtras).length > 0 && (
                                               <div className="text-[9px] font-bold text-white/30 mt-1 uppercase tracking-widest">
                                                  {parseExtras(item.selectedExtras).map((e: any) => e.extraName || e.name).join(" · ")}
                                               </div>
                                             )}
                                             {item.note && <div className="text-[10px] font-black text-red-400 mt-2 uppercase italic bg-red-400/5 px-2 py-1 rounded">NOT: {item.note}</div>}
                                          </div>
                                       </div>
                                       <div className="text-xs font-black text-white/20">{item.subtotal} KR</div>
                                    </div>
                                  ))}
                               </div>
                               {order.note && (
                                 <div className="bg-white/5 p-4 rounded-2xl border-2 border-dashed border-white/5">
                                    <div className="text-[9px] font-black uppercase text-white/20 mb-2">Ordernotering</div>
                                    <div className="text-sm font-bold text-white/60 italic">"{order.note}"</div>
                                 </div>
                               )}
                            </div>

                            <div className="space-y-6">
                               <div className="bg-white/5 p-6 rounded-3xl space-y-6">
                                  <div className="flex gap-4">
                                     <User size={18} className="text-white/20" />
                                     <div>
                                        <div className="text-[9px] font-black uppercase text-white/20 mb-1">Kund</div>
                                        <div className="font-black text-white text-sm uppercase">{order.customerName}</div>
                                        <div className="text-xs font-bold text-white/30 uppercase mt-1">{order.customerPhone}</div>
                                     </div>
                                  </div>
                                  {order.type === "DELIVERY" && (
                                     <div className="flex gap-4 pt-6 border-t border-white/5">
                                        <MapPin size={18} className="text-white/20" />
                                        <div>
                                           <div className="text-[9px] font-black uppercase text-white/20 mb-1">Adress</div>
                                           <div className="font-black text-white text-sm uppercase">{order.deliveryStreet}</div>
                                           <div className="text-xs font-bold text-white/30 uppercase">{order.deliveryZip} {order.deliveryCity}</div>
                                        </div>
                                     </div>
                                  )}
                                  <div className="flex gap-4 pt-6 border-t border-white/5">
                                     {order.type === "DELIVERY" ? <Truck size={18} className="text-white/20" /> : <Store size={18} className="text-white/20" />}
                                     <div>
                                        <div className="text-[9px] font-black uppercase text-white/20 mb-1">Leveransmetod</div>
                                        <div className="font-black text-white text-sm uppercase">{order.type === "DELIVERY" ? "Hemkörning" : "Pick-up"}</div>
                                     </div>
                                  </div>
                               </div>

                               <div className="bg-gold-500/10 border-2 border-gold-500/20 p-8 rounded-[2rem] flex justify-between items-end">
                                  <div>
                                     <div className="text-[10px] font-black uppercase text-gold-500/50 mb-1">Totalt Belopp</div>
                                     <div className="text-4xl font-black text-gold-500 tracking-tighter">{order.total.toFixed(0)} KR</div>
                                  </div>
                                  <div className="text-right">
                                     <div className="text-[9px] font-black uppercase text-white/20">Artiklar: {order.items?.length || 0} st</div>
                                  </div>
                               </div>
                            </div>
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default AdminOrdersPage;
