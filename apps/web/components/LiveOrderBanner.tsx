"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { io as socketIO, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  Flame,
  Bike,
  Package,
  ShoppingBag,
  ChevronRight,
  X,
  Zap,
} from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";

function getStatusDisplay(status: string) {
  switch (status) {
    case "PENDING":
      return {
        label: "Granskas",
        subtext: "Väntar på att köket bekräftar",
        Icon: Clock,
        color: "text-amber-300",
        glow: "rgba(251,191,36,0.25)",
        border: "rgba(251,191,36,0.3)",
        bg: "from-amber-500/20 to-amber-900/10",
        progress: 10,
        pulse: true,
      };
    case "ACCEPTED":
      return {
        label: "Bekräftad",
        subtext: "Restaurangen har sagt ja!",
        Icon: CheckCircle2,
        color: "text-gold-300",
        glow: "rgba(234,181,69,0.25)",
        border: "rgba(234,181,69,0.3)",
        bg: "from-gold-500/20 to-gold-900/10",
        progress: 28,
        pulse: false,
      };
    case "PREPARING":
      return {
        label: "Tillagas",
        subtext: "Kocken är igång med din order",
        Icon: Flame,
        color: "text-orange-300",
        glow: "rgba(249,115,22,0.25)",
        border: "rgba(249,115,22,0.3)",
        bg: "from-orange-500/20 to-orange-900/10",
        progress: 55,
        pulse: false,
      };
    case "READY":
      return {
        label: "Redo!",
        subtext: "Hämtning pågår snart",
        Icon: ShoppingBag,
        color: "text-sky-300",
        glow: "rgba(56,189,248,0.25)",
        border: "rgba(56,189,248,0.3)",
        bg: "from-sky-500/20 to-sky-900/10",
        progress: 85,
        pulse: false,
      };
    case "OUT_FOR_DELIVERY":
    case "DELIVERING":
      return {
        label: "På väg!",
        subtext: "Bud är ute med din mat",
        Icon: Bike,
        color: "text-emerald-300",
        glow: "rgba(52,211,153,0.25)",
        border: "rgba(52,211,153,0.3)",
        bg: "from-emerald-500/20 to-emerald-900/10",
        progress: 82,
        pulse: false,
      };
    case "DELIVERED":
    case "COMPLETED":
      return {
        label: "Levererad!",
        subtext: "Hoppas det smakar",
        Icon: CheckCircle2,
        color: "text-emerald-300",
        glow: "rgba(52,211,153,0.25)",
        border: "rgba(52,211,153,0.3)",
        bg: "from-emerald-500/20 to-emerald-900/10",
        progress: 100,
        pulse: false,
      };
    default:
      return {
        label: "Aktiv",
        subtext: "Din order behandlas",
        Icon: Package,
        color: "text-gold-300",
        glow: "rgba(234,181,69,0.25)",
        border: "rgba(234,181,69,0.3)",
        bg: "from-gold-500/20 to-gold-900/10",
        progress: 5,
        pulse: true,
      };
  }
}

function getDynamicETA(order: any): string {
  const t = order.orderType || order.type;
  if (order.status === "DELIVERED" || order.status === "COMPLETED") return "🎉";
  if (t === "PICKUP") {
    if (order.status === "READY") return "Nu";
    if (order.scheduledFor)
      return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    return "~10m";
  }
  if (order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERING") {
    const endsAt = order.etaEndsAt;
    if (endsAt) {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) return "snart";
      return `${Math.max(1, Math.round(ms / 60000))}m`;
    }
    return "snart";
  }
  if (order.scheduledFor)
    return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return order.estimatedTime ? `${order.estimatedTime}m` : "snart";
}

const TERMINAL_STATUSES = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REJECTED"]);
const STORAGE_KEY = "matgo_active_order_id";

export default function LiveOrderBanner() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [etaLeftSecs, setEtaLeftSecs] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const id = localStorage.getItem(STORAGE_KEY);
        setOrderId(id || null);
        setDismissed(false);
      } catch { }
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) read(); };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(read, 30_000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!orderId) { setOrder(null); return; }
    let cancelled = false;

    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/orders/${orderId}`);
        if (cancelled) return;
        setOrder(res.data);
        if (TERMINAL_STATUSES.has(res.data.status)) {
          setTimeout(() => {
            try { localStorage.removeItem(STORAGE_KEY); } catch { }
            setOrderId(null);
          }, 8000);
        }
      } catch (err) {
        const status = (err as any)?.response?.status;
        if (status === 404 || status === 410) {
          try { localStorage.removeItem(STORAGE_KEY); } catch { }
          setOrderId(null);
        }
      }
    };
    load();
    // Socket pushes realtime order:status updates below — this poll is only a
    // fallback for when the socket drops. 15s (was 5s) cuts request volume ~3x
    // during an active order without hurting perceived freshness.
    const pollInterval = setInterval(load, 15_000);

    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { socket.emit("join:order", orderId); });
    socket.on("order:status", (payload: any) => {
      if (!payload || payload.orderId !== orderId) return;
      setOrder((prev: any) => prev ? {
        ...prev,
        status: payload.status ?? prev.status,
        estimatedTime: payload.estimatedTime ?? prev.estimatedTime,
        etaEndsAt: payload.etaEndsAt ?? prev.etaEndsAt,
      } : prev);
      if (TERMINAL_STATUSES.has(payload.status)) {
        setTimeout(() => {
          try { localStorage.removeItem(STORAGE_KEY); } catch { }
          setOrderId(null);
        }, 8000);
      }
    });

    return () => { cancelled = true; clearInterval(pollInterval); socket.disconnect(); socketRef.current = null; };
  }, [orderId]);

  // Live countdown — updates every second
  useEffect(() => {
    if (TERMINAL_STATUSES.has(order?.status)) { setEtaLeftSecs(0); return; }
    if (!order?.etaEndsAt && !order?.estimatedTime) { setEtaLeftSecs(null); return; }
    const calc = () => {
      if (order?.etaEndsAt) {
        const ms = new Date(order.etaEndsAt).getTime() - Date.now();
        setEtaLeftSecs(Math.max(0, Math.ceil(ms / 1000)));
      } else if (order?.estimatedTime) {
        setEtaLeftSecs(order.estimatedTime * 60);
      }
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [order?.etaEndsAt, order?.estimatedTime, order?.status]);

  const display = useMemo(() => (order ? getStatusDisplay(order.status) : null), [order]);

  if (!order || dismissed || !display) return null;

  const orderNumber = (order.orderNumber || "").toString().replace(/^PX-/, "") || order.id;
  const isTerminal = order.status === "DELIVERED" || order.status === "COMPLETED";

  return (
    <AnimatePresence>
      <motion.div
        key="live-order-banner"
        initial={{ y: 120, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 120, opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="fixed left-3 right-3 z-[90]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 9rem)" }}
      >
        <Link href={`/order/${order.id}`} className="block group">
          <div
            className="relative overflow-hidden rounded-[2rem]"
            style={{
              backgroundColor: "rgba(10,10,10,0.92)",
              border: `1px solid ${display.border}`,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 8px 40px -8px ${display.glow}, 0 32px 60px -16px rgba(0,0,0,0.7)`,
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Ambient gradient background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${display.bg} pointer-events-none`} />

            {/* Animated progress bar at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
                initial={{ width: "0%" }}
                animate={{ width: `${display.progress}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                style={{
                  background: `linear-gradient(to right, transparent, ${display.glow.replace("0.25", "0.9")}, ${display.glow.replace("0.25", "0.6")})`,
                }}
              />
            </div>

            <div className="relative flex items-center gap-4 px-4 py-4">
              {/* Status icon */}
              <div className="relative shrink-0">
                <div
                  className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center ${display.color} relative`}
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  <display.Icon size={26} strokeWidth={2} className={display.pulse ? "animate-pulse" : ""} />
                </div>
                <span
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ring-2 ring-zinc-900 animate-pulse"
                  style={{ backgroundColor: isTerminal ? "#34d399" : "#4ade80" }}
                />
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Zap size={9} className={`${display.color} shrink-0`} />
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${display.color}`}>
                    {display.label}
                  </span>
                  <span className="text-[9px] font-bold text-zinc-600 tracking-widest">
                    #{orderNumber}
                  </span>
                </div>
                <div className="text-white font-black text-[15px] leading-tight truncate">
                  {order.restaurantName || "Din beställning"}
                </div>
                <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest truncate mt-0.5">
                  {isTerminal ? "Tack för din beställning!" : display.subtext}
                </div>
              </div>

              {/* ETA + actions */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-0.5">ETA</div>
                  <div className={`text-xl font-black tabular-nums leading-none ${display.color}`}>
                    {isTerminal
                      ? "🎉"
                      : etaLeftSecs === null
                        ? getDynamicETA(order)
                        : etaLeftSecs <= 0
                          ? "Snart!"
                          : `${Math.floor(etaLeftSecs / 60)}:${(etaLeftSecs % 60).toString().padStart(2, "0")}`}
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-zinc-700 group-hover:text-white group-hover:translate-x-0.5 transition-all"
                />
                <button
                  onClick={(e) => { e.preventDefault(); setDismissed(true); }}
                  className="p-2 rounded-xl text-zinc-700 hover:text-white hover:bg-white/8 transition-colors"
                  aria-label="Dölj"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}

export function rememberActiveOrder(orderId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, orderId);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: orderId }));
  } catch { }
}
