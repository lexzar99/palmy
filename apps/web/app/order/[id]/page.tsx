"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import { Check, Clock, Truck, Store, Loader2, Calendar, Phone, Hash, AlertCircle } from "lucide-react";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";

// ── Inline SVG icons (defined before STATUS_CONFIG to avoid hoisting issues) ──
const FlameIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.3-2.35 1-3.5 1.1 2.6 2.2 3.5 3.5 3.5z" />
  </svg>
);
const BoxCheckIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>
  </svg>
);
const HeartFilledIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

// ── Status configuration (uses icons defined above) ──────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  PENDING: {
    label: "Väntar på bekräftelse",
    icon: Clock,
    color: "text-yellow-400",
    desc: "Vi har tagit emot din beställning. Väntar på att restaurangen ska bekräfta.",
  },
  ACCEPTED: {
    label: "Bekräftad!",
    icon: Check,
    color: "text-green-400",
    desc: "Restaurangen har bekräftat din beställning och börjar snart.",
  },
  PREPARING: {
    label: "Tillagas nu",
    icon: FlameIcon,
    color: "text-orange-400",
    desc: "Din mat är under tillredning. Det dröjer snart inte länge!",
  },
  READY: {
    label: "Redo!",
    icon: BoxCheckIcon,
    color: "text-gold-500",
    desc: "Din beställning är klar och väntar på dig.",
  },
  DELIVERING: {
    label: "På väg!",
    icon: Truck,
    color: "text-blue-400",
    desc: "Din beställning är på väg till dig.",
  },
  DELIVERED: {
    label: "Levererad!",
    icon: HeartFilledIcon,
    color: "text-green-500",
    desc: "Smaklig måltid! Tack för att du valde Palmyra.",
  },
  DELIVERY_FAILED: {
    label: "Leveransproblem",
    icon: AlertCircle,
    color: "text-red-500",
    desc: "Budet kunde inte slutföra leveransen. Restaurangen kontaktar dig vid behov.",
  },
  REJECTED: {
    label: "Nekad",
    icon: AlertCircle,
    color: "text-red-500",
    desc: "Din beställning gick inte igenom pga stängning. Vi hoppas få se dig snart igen!",
  },
  CANCELLED: {
    label: "Avbokad",
    icon: AlertCircle,
    color: "text-red-400",
    desc: "Ordern har avbokats.",
  },
};

const PICKUP_PROGRESS_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED"];
const DELIVERY_PROGRESS_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "DELIVERING", "DELIVERED"];

const OrderStatusPage = () => {
  const { id } = useParams();
  const orderId = Array.isArray(id) ? id[0] : id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<any>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await axios.get(`${API_URL}/api/orders/${orderId}`);
      setOrder(res.data);
    } catch (err) {
      console.error("Error fetching order:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();
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
    const joinOrderRoom = () => {
      socket.emit("join:order", orderId);
      void fetchOrder();
    };

    socket.on("connect", joinOrderRoom);
    socket.on("connect_error", (error) => {
      console.warn("Order status socket connection error:", error.message);
    });
    socket.emit("join:order", orderId);
    socket.on("order:status", (data: any) => {
      if (data.orderId === orderId) {
        setOrder((prev: any) =>
          prev
            ? { ...prev, status: data.status, estimatedTime: data.estimatedTime ?? prev.estimatedTime }
            : prev
        );
        setLoading(false);
      }
    });

    const interval = window.setInterval(fetchOrder, 12000);

    return () => {
      window.clearInterval(interval);
      socket.disconnect();
    };
  }, [orderId, fetchOrder]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen pt-32 px-6 text-center">
        <h1 className="text-4xl font-black mb-4">Order hittades inte</h1>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = statusInfo.icon;
  const isRejected = order.status === "REJECTED" || order.status === "CANCELLED" || order.status === "DELIVERY_FAILED";
  const isPending = order.status === "PENDING";
  const progressSteps = order.type === "DELIVERY" ? DELIVERY_PROGRESS_STEPS : PICKUP_PROGRESS_STEPS;
  const currentIdx = progressSteps.indexOf(order.status);
  const parseExtras = (extras: any) => {
    if (typeof extras === "string") {
      try {
        return JSON.parse(extras);
      } catch {
        return [];
      }
    }
    return Array.isArray(extras) ? extras : [];
  };
  const splitExtras = (extras: any[]) => {
    const sizeExtras = extras.filter((extra) => extra.groupName?.toLowerCase() === "storlek");
    const sauceExtras = extras.filter((extra) => ["sås", "dip"].includes(extra.groupName?.toLowerCase()));
    const otherExtras = extras.filter((extra) => !sizeExtras.includes(extra) && !sauceExtras.includes(extra));
    return { sizeExtras, sauceExtras, otherExtras };
  };

  return (
    <div className="pt-32 pb-24 px-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
        <div>
          <div className="flex items-center gap-2 text-gold-500 font-bold uppercase tracking-[0.2em] text-xs mb-4">
            <Hash size={14} />
            Order #{order.orderNumber}
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">
            Din <span className="text-gold-500">Beställning</span>
          </h1>
        </div>
        {order.estimatedTime && !isRejected && (
          <div className="bg-white/5 border border-white/5 p-6 rounded-3xl flex items-center gap-4">
            <div className="w-12 h-12 bg-gold-500 rounded-2xl flex items-center justify-center text-dark-500">
              <Clock size={24} />
            </div>
            <div>
              <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Beräknad tid</div>
              <div className="text-2xl font-black text-gold-500">{order.estimatedTime} MIN</div>
            </div>
          </div>
        )}
      </div>

      {/* Status Banner */}
      <motion.div
        key={order.status}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mb-12 p-8 rounded-3xl border flex items-start gap-6 ${
          isRejected ? "bg-red-500/10 border-red-500/20" :
          isPending   ? "bg-yellow-400/10 border-yellow-400/20" :
                        "bg-green-500/10 border-green-500/20"
        }`}
      >
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
          isRejected ? "bg-red-500/20" : isPending ? "bg-yellow-400/20 animate-pulse" : "bg-green-500/20"
        }`}>
          <StatusIcon size={28} className={statusInfo.color} />
        </div>
        <div>
          <div className={`text-xl font-black uppercase mb-2 ${statusInfo.color}`}>{statusInfo.label}</div>
          <p className="text-white/60 text-sm leading-relaxed">{statusInfo.desc}</p>
          {isPending && (
            <p className="text-white/30 text-xs mt-3 font-medium">Sidan uppdateras automatiskt vid statusändring.</p>
          )}
        </div>
      </motion.div>

      {/* Progress Steps */}
      {!isRejected && (
        <div className="flex items-center mb-16 overflow-x-auto pb-4 gap-2">
          {progressSteps.map((step, index) => {
            const info = STATUS_CONFIG[step];
            const Icon = info?.icon ?? Check;
            const isDone = currentIdx >= index;
            const isActive = currentIdx === index;
            const isLast = index === progressSteps.length - 1;
            return (
              <div key={step} className="flex items-center flex-1 min-w-[60px]">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${isDone ? "bg-gold-500 text-dark-500" : "bg-white/5 text-white/20"} ${isActive ? "ring-2 ring-gold-500 ring-offset-2 ring-offset-dark-500" : ""}`}>
                    {isActive && !isLast ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                  </div>
                  <div className={`text-[8px] font-black uppercase tracking-widest mt-2 text-center max-w-[60px] leading-tight ${isDone ? "text-gold-500" : "text-white/20"}`}>
                    {info?.label?.split(" ")[0] ?? step}
                  </div>
                </div>
                {!isLast && <div className={`flex-1 h-px mx-2 transition-all duration-500 ${currentIdx > index ? "bg-gold-500" : "bg-white/10"}`} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Order Receipt */}
        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
          <h2 className="text-2xl font-black uppercase tracking-tight mb-8">Kvitto</h2>
          <div className="space-y-5 mb-8">
            {order.items.map((item: any) => (
              (() => {
                const extras = parseExtras(item.selectedExtras);
                const { sizeExtras, sauceExtras, otherExtras } = splitExtras(extras);
                const displayName = sizeExtras.length > 0
                  ? `${item.productName} - ${sizeExtras.map((extra: any) => extra.extraName || extra.name).join(", ")}`
                  : item.productName;
                return (
                  <div key={item.id} className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="font-bold uppercase text-sm flex gap-3">
                        <span className="text-gold-500">{item.quantity}×</span>
                        {displayName}
                      </div>
                      {otherExtras.length > 0 && (
                        <div className="text-[10px] text-white/30 mt-1 leading-relaxed">
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
                      {item.note && <div className="text-[10px] text-yellow-400/60 mt-1 italic">Not: {item.note}</div>}
                    </div>
                    <div className="font-bold text-white/60 text-sm whitespace-nowrap ml-4">{item.subtotal} kr</div>
                  </div>
                );
              })()
            ))}
          </div>
          <div className="border-t border-white/10 pt-6 space-y-3">
            <div className="flex justify-between text-sm font-bold uppercase tracking-widest text-white/40">
              <span>Delsumma</span>
              <span>{(order.total - order.deliveryFee).toFixed(0)} kr</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm font-bold uppercase tracking-widest text-white/40">
                <span>Leverans</span>
                <span>{order.deliveryFee.toFixed(0)} kr</span>
              </div>
            )}
            <div className="flex justify-between pt-3">
              <span className="text-xl font-black uppercase">Totalt</span>
              <span className="text-3xl font-black text-gold-500">{order.total.toFixed(0)} kr</span>
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
            <h2 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-3">
              {order.type === "DELIVERY" ? <Truck className="text-gold-500" size={20} /> : <Store className="text-gold-500" size={20} />}
              {order.type === "DELIVERY" ? "Hemkörning" : "Avhämtning"}
            </h2>
            <div className="space-y-5">
              <div className="flex gap-4">
                <Phone size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Telefon</div>
                  <div className="font-bold">{order.customerPhone}</div>
                </div>
              </div>
              {order.type === "DELIVERY" && order.deliveryStreet && (
                <div className="flex gap-4">
                  <span className="text-white/20 mt-0.5 flex-shrink-0">📍</span>
                  <div>
                    <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Adress</div>
                    <div className="font-bold text-sm">{order.deliveryStreet}, {order.deliveryZip} Lund</div>
                  </div>
                </div>
              )}
              <div className="flex gap-4">
                <Calendar size={18} className="text-white/20 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Beställd</div>
                  <div className="font-bold">{new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            </div>
          </div>

          {isPending && (
            <motion.div
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="bg-yellow-400/5 border border-yellow-400/20 rounded-[2rem] p-8 text-center"
            >
              <div className="text-4xl mb-3">⏳</div>
              <p className="text-sm font-bold uppercase tracking-widest text-yellow-400 mb-1">Inväntar bekräftelse</p>
              <p className="text-white/30 text-xs">Restaurangen granskar din order just nu.</p>
            </motion.div>
          )}
          {!isPending && !isRejected && (
            <div className="bg-gold-500/5 border border-gold-500/10 rounded-[2rem] p-8 text-center">
              <div className="text-4xl mb-3">🍕</div>
              <p className="text-sm font-bold uppercase tracking-widest text-gold-500 mb-1">Tack för din beställning!</p>
              <p className="text-white/40 text-xs">Order #{order.orderNumber} — spara för referens.</p>
            </div>
          )}
          {isRejected && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-[2rem] p-8 text-center">
              <div className="text-4xl mb-3">😔</div>
              <p className="text-sm font-bold uppercase tracking-widest text-red-400 mb-2">Order nekad</p>
              <p className="text-white/40 text-xs mb-4">Vi har tyvärr stängt för idag.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderStatusPage;
