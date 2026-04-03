"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, User, Phone, MapPin, Check, X, Loader2, RefreshCw, Hash, Truck, Store, Clock, Printer, Bike, Smile } from "lucide-react";
import { io as socketIO } from "socket.io-client";
import confetti from "canvas-confetti";
import { API_URL, SOCKET_URL } from "@/lib/api";

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

import { useRestaurantStore } from "@/store/restaurantStore";

const AdminOrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [expandedCompactOrderId, setExpandedCompactOrderId] = useState<string | null>(null);
  // Track which order IDs have the accept dialog open
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
    if (!selectedRestaurantId) return;
    try {
      const [ordersRes, statsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/admin/orders?limit=100&restaurantId=${selectedRestaurantId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/api/admin/stats?restaurantId=${selectedRestaurantId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
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
  }, [selectedRestaurantId]);

  useEffect(() => {
    if (!selectedRestaurantId) return;
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
      if (order.restaurantId === selectedRestaurantId) {
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
      if (!data.restaurantId || data.restaurantId === selectedRestaurantId) {
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
  }, [fetchData, selectedRestaurantId]);

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
      ? `${item.productName} - ${sizeExtras.map((extra) => extra.extraName || extra.name).join(", ")}`
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

    return {
      minutes,
      isLate: minutes < 0,
      label,
    };
  };

  const showCountdown = (order: Order) =>
    ACTIVE_ORDER_STATUSES.has(order.status) && order.status !== "READY";

  const isCompactOrder = (order: Order) =>
    COMPACT_ORDER_STATUSES.has(order.status);

  const activeOrders = orders.filter((order) => !isCompactOrder(order));
  const compactOrders = orders.filter((order) => isCompactOrder(order));

  return (
    <div className="space-y-10 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Beställningar</h1>
          <p className="text-white/40 font-medium">En renare ordervy med tydliga storlekar, såser och leveranssteg.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className={`p-6 rounded-[1.5rem] bg-white/5 border transition-all ${card.pulse ? "border-yellow-400/40 shadow-[0_0_20px_rgba(250,204,21,0.1)]" : "border-white/5"}`}>
            <div className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
              {card.label}
              {card.pulse && <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />}
            </div>
            <div className="text-3xl font-black text-gold-500">{card.value}</div>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-dark-500/80 backdrop-blur-xl p-6"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-dark-400 border border-white/10 rounded-[2rem] p-10 w-full max-w-md shadow-2xl"
            >
              <h3 className="text-2xl font-black uppercase mb-2">Godkänn order</h3>
              <p className="text-white/40 mb-8 text-sm">Välj beräknad tid och bekräfta.</p>

              <div className="grid grid-cols-4 gap-3 mb-8 max-h-48 overflow-y-auto pr-2 pb-2">
                {[10, 15, 20, 25, 30, 45, 50, 55, 60, 65, 70, 75].map((t) => (
                  <button
                    key={t}
                    onClick={() => setAcceptDialog({ ...acceptDialog, time: t })}
                    className={`py-3 rounded-2xl font-black text-sm lg:text-base transition-all border ${
                      acceptDialog.time === t ? "bg-gold-500 text-dark-500 border-gold-500" : "bg-white/5 border-white/5 hover:bg-white/10"
                    }`}
                  >
                    {t} min
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setAcceptDialog(null)}
                  className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-[10px] text-white/60 hover:bg-white/10 hover:text-white transition-all"
                >
                  Stäng
                </button>
                <button
                  onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)}
                  disabled={!!actionLoading}
                  className="flex-2 px-8 py-4 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Bekräfta {acceptDialog.time} min
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
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg"
          >
            <div className="bg-gold-500 text-dark-500 p-8 rounded-[2.5rem] shadow-[0_30px_100px_rgba(212,167,74,0.4)] border-4 border-white/20 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 opacity-70">
                Ny Inkommande Beställning
              </div>
              <div className="text-4xl font-black uppercase tracking-tighter mb-4 leading-tight">
                🏠 {newOrderNotification.restaurantName || "Okänd Restaurang"}
              </div>
              <div className="text-sm font-black uppercase tracking-widest bg-dark-500/10 py-3 px-6 rounded-2xl inline-block">
                Order #{newOrderNotification.orderNumber} · {newOrderNotification.total.toFixed(0)} KR
              </div>
              <div className="mt-4 text-xs font-bold uppercase opacity-60">Visas i listan nedan</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders list */}
      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-gold-500" size={40} />
        </div>
      ) : activeOrders.length === 0 && compactOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/20">
          <ShoppingCart size={48} className="mb-4" />
          <p className="uppercase font-black tracking-widest text-sm">Inga beställningar ännu</p>
        </div>
      ) : (
        <div className="space-y-10">
          {activeOrders.length === 0 && compactOrders.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-[2rem] border border-white/10 bg-white/5">
              <Smile size={56} className="mb-4 text-gold-500" />
              <p className="text-2xl font-black uppercase tracking-widest">Inga nya beställningar</p>
              <p className="mt-3 max-w-md text-sm text-white/35">
                Alla aktuella ordrar är redan markerade som kompakta här nere.
              </p>
            </div>
          )}

          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {orders.map((order) => {
              const isPending = order.status === "PENDING";
              const isCompact = isCompactOrder(order);
              const isCompactExpanded = expandedCompactOrderId === order.id;

              if (isCompact) {
                const isDelivered = order.status === "DELIVERED";
                const isFailed = order.status === "DELIVERY_FAILED" || order.status === "REJECTED" || order.status === "CANCELLED";
                const accentClass = isDelivered
                  ? "border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.08)]"
                  : isFailed
                    ? "border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.08)]"
                    : "border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.08)]";
                const iconClass = isDelivered
                  ? "bg-green-500/10 text-green-300"
                  : isFailed
                    ? "bg-red-500/10 text-red-300"
                    : "bg-indigo-500/10 text-indigo-300";
                const titleClass = isDelivered
                  ? "text-green-300"
                  : isFailed
                    ? "text-red-300"
                    : "text-indigo-300";

                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white/5 border rounded-[1.75rem] p-5 sm:p-6 transition-all relative overflow-hidden ${accentClass}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => setExpandedCompactOrderId((prev) => (prev === order.id ? null : order.id))}
                        className="flex min-w-0 flex-1 items-start gap-4 text-left"
                      >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
                          {isDelivered ? <Check size={18} /> : isFailed ? <X size={18} /> : <Truck size={18} />}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-[10px] sm:text-[11px] font-black uppercase tracking-[0.3em] mb-2 ${titleClass}`}>
                            {STATUS_LABELS[order.status] || order.status}
                          </div>
                          <div className="truncate text-xl font-black uppercase">{order.customerName}</div>
                          <div className="mt-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-white/35">
                            #{order.orderNumber} · {order.deliveryStreet}, {order.deliveryZip}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/50">
                            <span className="rounded-full bg-white/5 px-4 py-2">{order.customerPhone}</span>
                            <span className="rounded-full bg-white/5 px-4 py-2">{order.total.toFixed(0)} kr</span>
                            {isSuperAdmin && order.restaurantName && (
                              <span className="rounded-full bg-gold-500/10 text-gold-500 border border-gold-500/20 px-4 py-2 font-black uppercase">
                                {order.restaurantName}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedCompactOrderId((prev) => (prev === order.id ? null : order.id))}
                        className="rounded-full border border-white/10 bg-dark-500 px-5 py-4 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.25em] text-white/70 min-w-[120px]"
                      >
                        {isCompactExpanded ? "Dölj detaljer" : "Visa detaljer"}
                      </button>
                    </div>

                    {isCompactExpanded && (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-dark-500 p-4 sm:p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-white/5 px-4 py-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Kund</div>
                            <div className="mt-1 font-bold">{order.customerName}</div>
                          </div>
                          <a href={`tel:${order.customerPhone}`} className="rounded-2xl bg-white/5 px-4 py-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Telefon</div>
                            <div className="mt-1 font-bold">{order.customerPhone}</div>
                          </a>
                          <div className="rounded-2xl bg-white/5 px-4 py-3 sm:col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Adress</div>
                            <div className="mt-1 font-bold">{order.deliveryStreet}, {order.deliveryZip} {order.deliveryCity}</div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {order.items?.map((item) => {
                            const extras = parseExtras(item.selectedExtras);
                            const { sauceExtras, otherExtras } = splitExtras(extras);
                            return (
                              <div key={item.id} className="rounded-2xl bg-white/5 px-4 py-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="text-sm font-black uppercase">{item.quantity}× {getDisplayName(item)}</div>
                                    {otherExtras.length > 0 && (
                                      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/35">
                                        {otherExtras.map((e: any) => e.extraName || e.name).join(" · ")}
                                      </div>
                                    )}
                                    {sauceExtras.length > 0 && (
                                      <div className="mt-1 space-y-1">
                                        {sauceExtras.map((e: any, idx: number) => (
                                          <div key={`${item.id}-sauce-${idx}`} className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                                            {e.groupName}: {e.extraName || e.name}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="font-bold text-white/50 text-sm whitespace-nowrap">{item.subtotal} kr</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {order.note && (
                          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                            <div className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">Not</div>
                            <p className="text-xs text-white/60 italic">{order.note}</p>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            onClick={() => window.open(`/receipt?orderId=${order.id}`, "_blank")}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 hover:bg-white/10 transition-all"
                          >
                            <Printer size={14} />
                            Skriv ut
                          </button>
                        </div>
                      </div>
                    )}
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
                  className={`bg-white/5 border rounded-[2.5rem] p-8 transition-all relative overflow-hidden ${
                    isPending
                      ? "border-yellow-400/50 shadow-[0_0_40px_rgba(250,204,21,0.15)] ring-2 ring-yellow-400/20"
                      : "border-white/10 hover:border-gold-500/20"
                  }`}
                >
                  {isPending && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.05, 0.15, 0.05] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-yellow-400 pointer-events-none"
                    />
                  )}
                  <div className="flex flex-col lg:flex-row gap-10">
                    {/* Left: order details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500">
                            <Hash size={22} />
                          </div>
                          <div>
                            <div className="text-xl font-black uppercase">Order #{order.orderNumber}</div>
                            <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">
                              {new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            {isSuperAdmin && order.restaurantName && (
                              <div className="mb-4 text-3xl font-black text-gold-500 uppercase tracking-tighter bg-gold-500/5 p-4 rounded-3xl border border-gold-500/10">
                                🏠 {order.restaurantName}
                              </div>
                            )}
                            {order.type === "DELIVERY" ? (
                              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-black uppercase tracking-widest">
                                <Truck size={14} /> UTKÖRNING
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg text-xs font-black uppercase tracking-widest">
                                <Store size={14} /> AVHÄMTNING
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${STATUS_COLORS[order.status] || "bg-white/10 text-white/40"}`}>
                          {isPending && <span className="w-2 h-2 bg-current rounded-full animate-pulse" />}
                          {STATUS_LABELS[order.status] || order.status}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-4 mb-6">
                        {order.items?.map((item) => {
                          const extras = parseExtras(item.selectedExtras);
                          const { sauceExtras, otherExtras } = splitExtras(extras);
                          return (
                            <div key={item.id} className="flex items-start justify-between gap-4">
                              <div className="flex gap-3">
                                <span className="font-black text-gold-500 text-lg">{item.quantity}×</span>
                                <div>
                                  <div className="font-bold uppercase text-sm">{getDisplayName(item)}</div>
                                  {otherExtras.length > 0 && (
                                    <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest mt-1">
                                      {otherExtras.map((e: any) => e.extraName || e.name).join(" · ")}
                                    </div>
                                  )}
                                  {sauceExtras.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                      {sauceExtras.map((e: any, idx: number) => (
                                        <div key={`${item.id}-sauce-${idx}`} className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                                          {e.groupName}: {e.extraName || e.name}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {item.note && (
                                    <div className="text-[11px] text-yellow-400 font-bold uppercase tracking-widest mt-1 bg-yellow-400/10 px-2 py-1 rounded inline-block max-w-[200px] break-words">
                                      OBS! {item.note}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="font-bold text-white/50 text-sm whitespace-nowrap">{item.subtotal} kr</div>
                            </div>
                          );
                        })}
                      </div>

                      {order.note && (
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-6">
                          <div className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">Not</div>
                          <p className="text-xs text-white/60 italic">{order.note}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-6 border-t border-white/5 flex-wrap gap-4">
                        <div className="text-3xl font-black text-gold-500">{order.total.toFixed(0)} KR</div>

                        {isPending && !isSuperAdmin && (
                          <div className="flex items-center gap-3">
                            <button
                               onClick={() => { if(confirm("Vill du verkligen NEKA denna order?")) updateStatus(order.id, "REJECTED"); }}
                               disabled={actionLoading === order.id}
                               className="flex items-center gap-2 px-6 py-3 bg-red-500/20 text-red-300 border border-red-500/30 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                             >
                               {actionLoading === order.id ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                               Avböj Order
                            </button>
                            <button
                              onClick={() => setAcceptDialog({ orderId: order.id, time: 20 })}
                              className="flex items-center gap-2 px-10 py-4 bg-gold-500 text-dark-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20"
                            >
                              <Check size={18} />
                              Godkänn
                            </button>
                          </div>
                        )}
                        {isPending && isSuperAdmin && (
                          <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">
                            Endast visning (SUPER_ADMIN)
                          </div>
                        )}

                        <div className="flex items-center gap-3 w-full lg:w-auto mt-4 lg:mt-0 lg:ml-auto">
                          {!isSuperAdmin && order.status === "PREPARING" && order.type === "PICKUP" && (
                            <button
                               onClick={() => updateStatus(order.id, "READY")}
                               disabled={actionLoading === order.id}
                               className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-400 text-dark-500 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 shadow-lg shadow-green-500/20"
                             >
                               {actionLoading === order.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} 
                               Markera Klar
                             </button>
                          )}
                          {!isSuperAdmin && order.status === "PREPARING" && order.type === "DELIVERY" && (
                            <button
                              onClick={() => updateStatus(order.id, "DELIVERING")}
                              disabled={actionLoading === order.id}
                              className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 shadow-lg ${
                                (getCountdown(order)?.isLate ?? false)
                                  ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/20"
                                  : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/20"
                              }`}
                            >
                              {actionLoading === order.id ? <Loader2 size={16} className="animate-spin" /> : <Bike size={16} />}
                              Markera På Väg
                            </button>
                          )}
                          {order.status === "READY" && (
                            <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-black uppercase tracking-[0.2em]">
                              Klar för hämtning
                            </div>
                          )}
                          {order.status === "DELIVERING" && (
                            <div className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-[0.2em]">
                              På väg till kund
                            </div>
                          )}
                          {order.status === "DELIVERY_FAILED" && (
                            <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-[0.2em]">
                              Bud kunde inte leverera
                            </div>
                          )}
                          <button
                            onClick={() => window.open(`/receipt?orderId=${order.id}`, '_blank')}
                            className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10 text-white/60 hover:text-white"
                            title="Skriv ut kvitto"
                          >
                            <Printer size={16} />
                            <span className="text-xs font-bold uppercase tracking-widest">Skriv ut</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="w-px bg-white/5 hidden lg:block flex-shrink-0" />

                    {/* Right: Customer info */}
                    <div className="lg:w-72 space-y-6 flex-shrink-0">
                      <div className="space-y-5">
                        <div className="flex gap-4">
                          <User size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Kund</div>
                            <div className="font-bold">{order.customerName}</div>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <Phone size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Telefon</div>
                            <a href={`tel:${order.customerPhone}`} className="font-bold hover:text-gold-500 transition-colors">{order.customerPhone}</a>
                          </div>
                        </div>
                        {order.type === "DELIVERY" && order.deliveryStreet && (
                          <div className="flex gap-4">
                            <MapPin size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Adress</div>
                              <div className="font-bold text-sm leading-relaxed">{order.deliveryStreet}, {order.deliveryZip}</div>
                            </div>
                          </div>
                        )}
                        {order.estimatedTime && showCountdown(order) && (
                          <div className="flex gap-4">
                            <Clock size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Utlovad tid</div>
                              <div className="font-black text-gold-500">{order.estimatedTime} min</div>
                              {getCountdown(order) && (
                                <div className={`mt-1 text-sm font-black ${
                                  getCountdown(order)?.isLate ? "text-red-400" : "text-emerald-300"
                                }`}>
                                  {getCountdown(order)!.label}
                                </div>
                              )}
                              {order.type === "DELIVERY" && order.status === "PREPARING" && (getCountdown(order)?.minutes ?? 1) <= 0 && (
                                <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-300">
                                  Dags att markera på väg
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {order.estimatedTime && !showCountdown(order) && (
                          <div className="flex gap-4">
                            <Clock size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Utlovad tid</div>
                              <div className="font-black text-white/60">
                                {order.status === "DELIVERING" ? "På väg" : "Avslutad"}
                              </div>
                            </div>
                          </div>
                        )}
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
