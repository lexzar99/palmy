"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, User, Phone, MapPin, Check, X, Loader2, RefreshCw, Hash, Truck, Store, Clock, Printer, Bike, Smile, Globe } from "lucide-react";
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
  const [expandedCompactOrderId, setExpandedCompactOrderId] = useState<string | null>(null);
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
        const sortedOrders = [...(ordersRes.value.data.orders || [])].sort(
          (a: Order, b: Order) => {
            const statusDiff = Number(COMPACT_ORDER_STATUSES.has(a.status)) - Number(COMPACT_ORDER_STATUSES.has(b.status));
            if (statusDiff !== 0) return statusDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          },
        );
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
    }, 15000);

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

  const statCards = [
    { label: "Väntande", value: stats?.pendingOrders ?? 0, pulse: (stats?.pendingOrders ?? 0) > 0 },
    { label: "Idag", value: stats?.ordersToday ?? 0, pulse: false },
    { label: "Intäkter", value: `${stats?.revenueToday ?? 0} kr`, pulse: false },
    { label: "Totalt", value: stats?.totalOrders ?? 0, pulse: false },
  ];

  const getCountdown = (order: Order) => {
    if (!order.estimatedTime) return null;
    const promisedAt = new Date(order.createdAt).getTime() + order.estimatedTime * 60_000;
    const diffMs = promisedAt - now;
    const minutes = diffMs >= 0 ? Math.ceil(diffMs / 60_000) : Math.floor(diffMs / 60_000);
    const absoluteMinutes = Math.abs(minutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const remainingMinutes = absoluteMinutes % 60;

    const label = minutes >= 0
      ? `${minutes} min kvar`
      : hours > 0
        ? `${hours} h${remainingMinutes > 0 ? ` ${remainingMinutes} min` : ""} sen`
        : `${absoluteMinutes} min sen`;

    return { minutes, isLate: minutes < 0, label };
  };

  const showCountdown = (order: Order) => ACTIVE_ORDER_STATUSES.has(order.status) && order.status !== "READY";
  const isCompactOrder = (order: Order) => COMPACT_ORDER_STATUSES.has(order.status);
  const activeOrders = orders.filter((order) => !isCompactOrder(order));
  const compactOrders = orders.filter((order) => isCompactOrder(order));

  return (
    <div className="space-y-10 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gold-500 rounded-[1.5rem] flex items-center justify-center text-dark-500 shadow-xl shadow-gold-500/20">
            {!selectedRestaurantId ? <Globe size={32} /> : <ShoppingCart size={32} />}
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-1 flex items-center gap-3">
              {!selectedRestaurantId ? "Global Översikt" : "Beställningar"}
              {!selectedRestaurantId && <span className="text-xs bg-gold-500/10 text-gold-500 px-3 py-1 rounded-full font-black tracking-widest border border-gold-500/20">LIVE</span>}
            </h1>
            <p className="text-white/40 font-bold uppercase text-[10px] tracking-[0.3em]">
              {!selectedRestaurantId ? "Övervakar alla anslutna restauranger" : `Hanterar beställningar för ${orders[0]?.restaurantName || "enheten"}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-5 bg-white/5 hover:bg-white/10 rounded-[1.5rem] transition-all border border-white/10 hover:border-gold-500/20 group">
            <RefreshCw size={22} className={`${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className={`p-8 rounded-[2rem] bg-dark-400 border transition-all relative overflow-hidden group ${card.pulse ? "border-gold-500/50 shadow-[0_20px_50px_rgba(231,178,75,0.1)] ring-1 ring-gold-500/20" : "border-white/5"}`}>
             {card.pulse && <div className="absolute inset-0 bg-gold-500/[0.03] animate-pulse" />}
            <div className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              {card.label}
              {card.pulse && <span className="w-2 h-2 rounded-full bg-gold-500 animate-ping inline-block" />}
            </div>
            <div className="text-4xl font-black text-white group-hover:text-gold-500 transition-colors uppercase tracking-tighter">{card.value}</div>
          </div>
        ))}
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
              className="bg-dark-400 border-2 border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-[0_50px_200px_rgba(0,0,0,0.8)]"
            >
              <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] flex items-center justify-center text-gold-500 mb-8">
                <Clock size={40} />
              </div>
              <h3 className="text-3xl font-black uppercase mb-3 tracking-tighter">Beräkna Tid</h3>
              <p className="text-white/40 mb-10 text-sm font-bold uppercase tracking-widest leading-relaxed">Välj hur lång tid restaurangen behöver på sig.</p>

              <div className="grid grid-cols-4 gap-4 mb-10 overflow-x-auto pr-2 pb-2">
                {[15, 20, 25, 30, 45, 60].map((t) => (
                  <button
                    key={t}
                    onClick={() => setAcceptDialog({ ...acceptDialog, time: t })}
                    className={`h-20 rounded-[1.5rem] font-black text-lg transition-all border-2 ${
                      acceptDialog.time === t ? "bg-gold-500 text-dark-500 border-gold-500 shadow-xl shadow-gold-500/20" : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setAcceptDialog(null)}
                  className="flex-1 py-6 bg-white/5 border border-white/10 rounded-[2rem] font-black uppercase tracking-widest text-xs text-white/40 hover:bg-white/10 transition-all"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)}
                  disabled={!!actionLoading}
                  className="flex-[2] py-6 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-[2rem] font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl shadow-gold-500/20"
                >
                  {actionLoading ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} />}
                  BEKRÄFTA {acceptDialog.time} MIN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newOrderNotification && isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xl px-6"
          >
            <div className="bg-gold-500 text-dark-500 p-10 rounded-[3rem] shadow-[0_50px_150px_rgba(212,167,74,0.4)] border-8 border-white/20 text-center relative overflow-hidden group">
               <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
              <div className="text-[11px] font-black uppercase tracking-[0.5em] mb-6 opacity-70">
                NY INKOMMANDE BESTÄLLNING
              </div>
              <div className="text-5xl font-black uppercase tracking-tighter mb-6 leading-none">
                🏠 {newOrderNotification.restaurantName || "Okänd Enhet"}
              </div>
              <div className="text-md font-black uppercase tracking-widest bg-dark-500/10 py-4 px-8 rounded-2xl inline-block border border-dark-500/5">
                Order #{newOrderNotification.orderNumber} · {newOrderNotification.total.toFixed(0)} KR
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders list */}
      {loading && orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-48 gap-6 text-white/20">
          <Loader2 className="animate-spin text-gold-500" size={60} />
          <p className="font-black uppercase tracking-[0.3em] text-sm">Hämtar färsk data...</p>
        </div>
      ) : activeOrders.length === 0 && compactOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-white/10 bg-white/[0.02] border-2 border-dashed border-white/[0.05] rounded-[3rem]">
          <Smile size={80} className="mb-8" />
          <p className="uppercase font-black tracking-[0.4em] text-lg">Helt lugnt just nu</p>
        </div>
      ) : (
        <div className="space-y-12">
          {activeOrders.length === 0 && compactOrders.length > 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center rounded-[3rem] border-2 border-dashed border-white/[0.05] bg-white/[0.02]">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center text-emerald-500 mb-6">
                <Check size={40} />
              </div>
              <p className="text-3xl font-black uppercase tracking-tight">Alla beställningar hanterade</p>
            </div>
          )}

          <div className="space-y-8">
            <AnimatePresence initial={false}>
              {orders.map((order) => {
                const isPending = order.status === "PENDING";
                const isCompact = isCompactOrder(order);
                const isCompactExpanded = expandedCompactOrderId === order.id;

                if (isCompact) {
                  const isDelivered = order.status === "DELIVERED";
                  const isFailed = ["DELIVERY_FAILED", "REJECTED", "CANCELLED"].includes(order.status);
                  
                  return (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`bg-dark-400/50 backdrop-blur-xl border-2 rounded-[2rem] p-6 sm:p-8 transition-all relative group ${
                        isDelivered ? "border-emerald-500/20 hover:border-emerald-500/40" : 
                        isFailed ? "border-red-500/20 hover:border-red-400/40" : "border-white/5 hover:border-white/10"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                        <div className="flex items-center gap-6 min-w-0 flex-1">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                            isDelivered ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                            isFailed ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-white/5 text-white/40 border-white/5"
                          }`}>
                            {isDelivered ? <Smile size={24} /> : isFailed ? <X size={24} /> : <Truck size={24} />}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-[10px] font-black uppercase tracking-[0.3em] mb-2 ${isDelivered ? "text-emerald-400" : isFailed ? "text-red-400" : "text-white/30"}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </div>
                            <div className="text-2xl font-black uppercase tracking-tight truncate">{order.customerName}</div>
                            <div className="flex items-center gap-3 mt-3">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">#{order.orderNumber}</span>
                              <span className="w-1 h-1 rounded-full bg-white/10" />
                              <span className="text-[10px] font-bold text-white/30 uppercase">{order.restaurantName}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
                          <button
                            onClick={() => setExpandedCompactOrderId(prev => prev === order.id ? null : order.id)}
                            className="flex-1 sm:flex-none px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white/60 hover:bg-white/10 transition-all hover:text-white"
                          >
                            {isCompactExpanded ? "Dölj Detaljer" : "Se Detaljer"}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isCompactExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-8 pt-8 border-t border-white/5 space-y-6 overflow-hidden"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                               <div className="bg-white/5 p-5 rounded-2xl">
                                  <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Telefon</div>
                                  <a href={`tel:${order.customerPhone}`} className="font-bold text-white hover:text-gold-500 transition-colors uppercase tracking-widest">{order.customerPhone}</a>
                               </div>
                               <div className="bg-white/5 p-5 rounded-2xl md:col-span-2">
                                  <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Leveransadress</div>
                                  <div className="font-bold text-white uppercase tracking-widest text-sm">{order.deliveryStreet}, {order.deliveryZip} {order.deliveryCity}</div>
                               </div>
                            </div>
                            
                            <div className="space-y-3">
                               {order.items?.map((item) => (
                                 <div key={item.id} className="bg-white/[0.03] p-5 rounded-2xl flex items-center justify-between gap-4">
                                    <div className="flex gap-4">
                                       <span className="font-black text-gold-500">{item.quantity}×</span>
                                       <div>
                                          <div className="font-black uppercase text-sm tracking-tight">{getDisplayName(item)}</div>
                                          {item.note && <div className="text-[10px] font-bold text-yellow-400 mt-1 uppercase tracking-widest">OBS! {item.note}</div>}
                                       </div>
                                    </div>
                                    <div className="font-black uppercase tracking-widest text-xs text-white/30">{item.subtotal} KR</div>
                                 </div>
                               ))}
                            </div>

                            <div className="flex justify-between items-center bg-gold-500/5 p-6 rounded-2xl border border-gold-500/10">
                               <div className="text-xl font-black text-gold-500 uppercase tracking-tighter">Totalt: {order.total.toFixed(0)} KR</div>
                               <button
                                 onClick={() => window.open(`/receipt?orderId=${order.id}`, "_blank")}
                                 className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all"
                               >
                                 <Printer size={16} /> SKRIV UT
                               </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-dark-400 border-2 rounded-[3rem] p-10 sm:p-12 transition-all relative overflow-hidden ${
                      isPending ? "border-yellow-400/60 shadow-[0_40px_100px_rgba(250,204,21,0.15)] ring-4 ring-yellow-400/10" : "border-white/5 hover:border-gold-500/20"
                    }`}
                  >
                    {isPending && <div className="absolute inset-x-0 top-0 h-2 bg-yellow-400 animate-pulse" />}
                    <div className="flex flex-col lg:flex-row gap-16">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-10 flex-wrap gap-8">
                          <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-gold-500 rounded-[1.5rem] flex items-center justify-center text-dark-500 shadow-xl shadow-gold-500/20">
                              <span className="text-3xl font-black">#{order.orderNumber}</span>
                            </div>
                            <div>
                               <div className="text-3xl font-black uppercase tracking-tighter mb-1">{order.customerName}</div>
                               <div className="text-[11px] font-black text-white/30 uppercase tracking-[0.4em] flex items-center gap-3">
                                  {order.restaurantName} <span className="w-1 h-1 rounded-full bg-white/10" /> {new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                               </div>
                            </div>
                          </div>
                          <div className={`px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-3 border shadow-sm ${STATUS_COLORS[order.status] || "bg-white/5 border-white/10"}`}>
                             {isPending && <span className="w-2.5 h-2.5 bg-current rounded-full animate-ping" />}
                             {STATUS_LABELS[order.status] || order.status}
                          </div>
                        </div>

                        <div className="space-y-4 mb-10">
                          {order.items?.map((item) => (
                            <div key={item.id} className="flex items-start justify-between gap-6 p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 hover:border-white/10 transition-colors">
                              <div className="flex gap-6">
                                <span className="text-2xl font-black text-gold-500">{item.quantity}×</span>
                                <div>
                                  <div className="text-xl font-black uppercase tracking-tight">{getDisplayName(item)}</div>
                                  <div className="mt-2 text-[11px] font-bold text-white/30 uppercase tracking-[0.2em]">
                                     {parseExtras(item.selectedExtras).map((e: any) => e.extraName || e.name).join(" · ")}
                                  </div>
                                  {item.note && <div className="mt-3 bg-yellow-400/10 text-yellow-500 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-yellow-400/10">NOTERING: {item.note}</div>}
                                </div>
                              </div>
                              <div className="text-lg font-black text-white/40 uppercase tracking-tighter">{item.subtotal} KR</div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-8 pt-10 border-t border-white/5">
                            <div className="text-5xl font-black text-white tracking-tighter">
                               {order.total.toFixed(0)} <span className="text-2xl text-gold-500">KR</span>
                            </div>

                            <div className="flex items-center gap-4 w-full sm:w-auto">
                               {isPending && !isSuperAdmin ? (
                                <div className="flex items-center gap-4 grow sm:grow-0">
                                   <button 
                                     onClick={() => { if(confirm("Neka order?")) updateStatus(order.id, "REJECTED"); }}
                                     className="p-6 bg-red-500/10 text-red-500 border-2 border-red-500/20 rounded-[2rem] hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/5 group"
                                   >
                                      <X size={28} className="group-active:scale-75 transition-transform" />
                                   </button>
                                   <button 
                                     onClick={() => setAcceptDialog({ orderId: order.id, time: 20 })}
                                     className="grow px-12 py-6 bg-emerald-500 hover:bg-emerald-400 text-dark-500 rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-2xl shadow-emerald-500/20 active:scale-95"
                                   >
                                      Godkänn Order
                                   </button>
                                </div>
                               ) : isSuperAdmin ? (
                                  <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/20">
                                     Endast övervakning
                                  </div>
                               ) : (
                                 <div className="flex items-center gap-4 grow">
                                    {order.status === "PREPARING" && (
                                       <button 
                                         onClick={() => updateStatus(order.id, order.type === "PICKUP" ? "READY" : "DELIVERING")}
                                         className="grow px-12 py-6 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-2xl shadow-gold-500/20"
                                       >
                                          Markera {order.type === "PICKUP" ? "Klar" : "På väg"}
                                       </button>
                                    )}
                                    <button 
                                      onClick={() => window.open(`/receipt?orderId=${order.id}`, "_blank")}
                                      className="p-6 bg-white/5 hover:bg-white/10 border-2 border-white/10 rounded-[2rem] transition-all group"
                                    >
                                       <Printer size={28} className="text-white/40 group-hover:text-white transition-colors" />
                                    </button>
                                 </div>
                               )}
                            </div>
                        </div>
                      </div>

                      <div className="lg:w-80 space-y-10 shrink-0">
                         <div className="bg-white/[0.02] border-2 border-white/5 rounded-[2.5rem] p-8 space-y-8">
                            <div className="flex gap-6">
                               <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center shrink-0">
                                  <User size={24} className="text-white/30" />
                               </div>
                               <div>
                                  <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Levereras till</div>
                                  <div className="font-black text-white uppercase text-sm leading-tight">{order.customerName}</div>
                                  <a href={`tel:${order.customerPhone}`} className="text-xs font-bold text-gold-500/60 block mt-2 hover:text-gold-500 transition-colors">{order.customerPhone}</a>
                               </div>
                            </div>

                            {order.type === "DELIVERY" && (
                              <div className="flex gap-6 pt-8 border-t border-white/5">
                                 <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center shrink-0">
                                    <MapPin size={24} className="text-white/30" />
                                 </div>
                                 <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Adress</div>
                                    <div className="font-black text-white uppercase text-sm leading-relaxed truncate">{order.deliveryStreet}</div>
                                    <div className="font-bold text-xs text-white/30 uppercase">{order.deliveryZip} {order.deliveryCity}</div>
                                 </div>
                              </div>
                            )}

                            {order.estimatedTime && (
                              <div className="flex gap-6 pt-8 border-t border-white/5">
                                 <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center shrink-0 text-gold-500">
                                    <Clock size={24} />
                                 </div>
                                 <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Utlovad Tid</div>
                                    <div className="font-black text-gold-500 text-3xl tracking-tighter leading-none">{order.estimatedTime} MIN</div>
                                    <div className={`mt-3 text-[11px] font-black uppercase tracking-widest ${getCountdown(order)?.isLate ? "text-red-400" : "text-emerald-400"}`}>
                                       {getCountdown(order)?.label}
                                    </div>
                                 </div>
                              </div>
                            )}
                         </div>

                         {order.note && (
                            <div className="bg-red-500/5 border-2 border-red-500/20 rounded-[2rem] p-8 ring-4 ring-red-500/5">
                               <div className="text-[10px] font-black uppercase tracking-[0.3em] text-red-400/50 mb-3">Viktig Notering</div>
                               <p className="text-sm font-bold text-red-300 italic leading-relaxed uppercase">"{order.note}"</p>
                            </div>
                         )}

                         <div className="flex items-center gap-4 px-6 py-4 bg-white/5 rounded-2xl border border-white/10 uppercase font-black text-[10px] tracking-widest text-white/40">
                            {order.type === "DELIVERY" ? <Truck size={14} className="text-gold-500" /> : <Store size={14} className="text-gold-500" />}
                            {order.type === "DELIVERY" ? "Hemleverans" : "Avhämtning i butik"}
                         </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
