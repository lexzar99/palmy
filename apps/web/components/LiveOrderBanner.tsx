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
} from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";

// ─── Status helper ─────────────────────────────────────────────────────────
function getStatusDisplay(status: string) {
  switch (status) {
    case "PENDING":
      return {
        label: "Granskas",
        Icon: Clock,
        color: "text-amber-300",
        ring: "ring-amber-400/30",
        bg: "from-amber-500/15 to-amber-500/5",
        progress: 10,
      };
    case "ACCEPTED":
      return {
        label: "Bekräftad",
        Icon: CheckCircle2,
        color: "text-gold-300",
        ring: "ring-gold-400/30",
        bg: "from-gold-500/15 to-gold-500/5",
        progress: 28,
      };
    case "PREPARING":
      return {
        label: "Tillagas",
        Icon: Flame,
        color: "text-orange-300",
        ring: "ring-orange-400/30",
        bg: "from-orange-500/15 to-orange-500/5",
        progress: 50,
      };
    case "READY":
      return {
        label: "Redo att hämtas",
        Icon: ShoppingBag,
        color: "text-sky-300",
        ring: "ring-sky-400/30",
        bg: "from-sky-500/15 to-sky-500/5",
        progress: 85,
      };
    case "OUT_FOR_DELIVERY":
    case "DELIVERING":
      return {
        label: "På väg",
        Icon: Bike,
        color: "text-emerald-300",
        ring: "ring-emerald-400/30",
        bg: "from-emerald-500/15 to-emerald-500/5",
        progress: 78,
      };
    case "DELIVERED":
    case "COMPLETED":
      return {
        label: "Levererad",
        Icon: CheckCircle2,
        color: "text-emerald-300",
        ring: "ring-emerald-400/30",
        bg: "from-emerald-500/15 to-emerald-500/5",
        progress: 100,
      };
    default:
      return {
        label: "Aktiv",
        Icon: Package,
        color: "text-gold-300",
        ring: "ring-gold-400/30",
        bg: "from-gold-500/15 to-gold-500/5",
        progress: 5,
      };
  }
}

function getDynamicETA(order: any): string {
  const t = order.orderType || order.type;
  if (order.status === "DELIVERED" || order.status === "COMPLETED")
    return "Klar 🎉";
  if (t === "PICKUP") {
    if (order.status === "READY") return "Hämta nu";
    if (order.scheduledFor)
      return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      });
    return "ca 10m";
  }
  if (
    order.status === "OUT_FOR_DELIVERY" ||
    order.status === "DELIVERING"
  ) {
    const endsAt = order.etaEndsAt;
    if (endsAt) {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) return "snart";
      return `${Math.max(1, Math.round(ms / 60000))}m`;
    }
    return "snart";
  }
  if (order.scheduledFor) {
    return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return order.estimatedTime ? `${order.estimatedTime}m` : "snart";
}

const TERMINAL_STATUSES = new Set([
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
]);

const STORAGE_KEY = "matgo_active_order_id";

/**
 * Floating banner längst ner som visar pågående order-status med live-uppdateringar
 * via Socket.IO. Inspirerad av RN-appens LiveOrderBanner.
 *
 * - Auto-hämtar aktiv order-ID från localStorage (sparas av cart vid order-place)
 * - Lyssnar på `order:status` socket-events för realtid
 * - Auto-dismiss 8s efter DELIVERED/COMPLETED
 * - Tappbar → tar användaren till /order/[id] för full vy
 */
export default function LiveOrderBanner() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Plocka upp aktiv order-ID från localStorage + lyssna på cross-tab events
  useEffect(() => {
    const read = () => {
      try {
        const id = localStorage.getItem(STORAGE_KEY);
        setOrderId(id || null);
        setDismissed(false);
      } catch {
        // ignore
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    // Egen pulse var 30s ifall localStorage uppdateras i samma tab
    const interval = setInterval(read, 30_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, []);

  // Fetch initial order + lyssna på socket
  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/orders/${orderId}`);
        if (cancelled) return;
        setOrder(res.data);
        if (TERMINAL_STATUSES.has(res.data.status)) {
          // Auto-dismiss efter 8s om redan klar
          setTimeout(() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              // ignore
            }
            setOrderId(null);
          }, 8000);
        }
      } catch (err) {
        // 404 → order finns inte längre, rensa
        const status = (err as any)?.response?.status;
        if (status === 404 || status === 410) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          setOrderId(null);
        }
      }
    };
    load();

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:order", orderId);
    });
    socket.on("order:status", (payload: any) => {
      if (!payload || payload.orderId !== orderId) return;
      setOrder((prev: any) =>
        prev
          ? {
              ...prev,
              status: payload.status ?? prev.status,
              estimatedTime: payload.estimatedTime ?? prev.estimatedTime,
              etaEndsAt: payload.etaEndsAt ?? prev.etaEndsAt,
            }
          : prev
      );
      if (TERMINAL_STATUSES.has(payload.status)) {
        setTimeout(() => {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          setOrderId(null);
        }, 8000);
      }
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId]);

  const display = useMemo(
    () => (order ? getStatusDisplay(order.status) : null),
    [order]
  );
  const eta = useMemo(() => (order ? getDynamicETA(order) : ""), [order]);

  if (!order || dismissed || !display) return null;

  const orderNumber =
    (order.orderNumber || "").toString().replace(/^PX-/, "") || order.id;

  return (
    <AnimatePresence>
      <motion.div
        key="live-order-banner"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 24 }}
        className="fixed left-3 right-3 z-[80] sm:left-4 sm:right-auto sm:max-w-md"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
      >
        <Link href={`/order/${order.id}`} className="block group">
          <div
            className={`relative overflow-hidden rounded-2xl backdrop-blur-xl ring-1 ${display.ring} bg-gradient-to-br ${display.bg} shadow-2xl`}
            style={{
              backgroundColor: "rgba(15,15,15,0.85)",
              boxShadow:
                "0 24px 48px -12px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(234,181,69,0.18)",
            }}
          >
            {/* Progress bar längst ner */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-gold-500 to-gold-300"
                initial={{ width: "0%" }}
                animate={{ width: `${display.progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>

            <div className="flex items-center gap-3 px-4 py-3 pr-2">
              {/* Live pulse + ikon */}
              <div className="relative shrink-0">
                <div
                  className={`w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center ${display.color}`}
                >
                  <display.Icon size={20} />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-900 animate-pulse" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-[9px] font-black uppercase tracking-[0.18em] ${display.color}`}
                  >
                    {display.label}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                    · #{orderNumber}
                  </span>
                </div>
                <div className="text-white text-sm font-black truncate mt-0.5">
                  {order.status === "DELIVERED" ||
                  order.status === "COMPLETED"
                    ? "Tack för din beställning!"
                    : `Din mat är ${display.label.toLowerCase()}`}
                </div>
              </div>

              {/* ETA + chevron */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="text-right">
                  <div className="text-[8px] font-black uppercase tracking-widest text-zinc-500">
                    ETA
                  </div>
                  <div className="text-white text-sm font-black tabular-nums">
                    {eta}
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-zinc-500 group-hover:text-gold-400 transition-colors"
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setDismissed(true);
                  }}
                  className="ml-1 p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/5 transition-colors"
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

/**
 * Anropas av cart vid lyckad order-placement för att aktivera bannern.
 */
export function rememberActiveOrder(orderId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, orderId);
    // Trigga storage-event i samma tab
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: orderId })
    );
  } catch {
    // ignore
  }
}
