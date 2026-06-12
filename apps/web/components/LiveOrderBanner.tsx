"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { io as socketIO, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Check,
  Flame,
  Bike,
  Package,
  ShoppingBag,
  X,
  type LucideIcon,
} from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Visuell konfiguration per status. Label/subtext resolveras via t()
// (order.status.*.label / .desc) inne i komponenten — här bor bara ikon,
// färgton och vilket av de fyra progress-segmenten som är aktivt.
// stage: 0=Bekräftad, 1=Tillagas, 2=På väg, 3=Levererad pågår; 4 = allt klart.
type Tone = "neutral" | "gold" | "success" | "danger";
type StatusVisual = { Icon: LucideIcon; tone: Tone; stage: number; key: string };

function getStatusVisual(status: string): StatusVisual {
  switch (status) {
    case "PENDING":
      return { Icon: Clock, tone: "gold", stage: 0, key: "PENDING" };
    case "ACCEPTED":
      return { Icon: Check, tone: "gold", stage: 1, key: "ACCEPTED" };
    case "PREPARING":
      return { Icon: Flame, tone: "gold", stage: 1, key: "PREPARING" };
    case "READY":
      return { Icon: ShoppingBag, tone: "gold", stage: 2, key: "READY" };
    case "OUT_FOR_DELIVERY":
    case "DELIVERING":
      return { Icon: Bike, tone: "gold", stage: 2, key: "DELIVERING" };
    case "DELIVERED":
    case "COMPLETED":
      return { Icon: Check, tone: "success", stage: 4, key: "DELIVERED" };
    case "CANCELLED":
      return { Icon: X, tone: "danger", stage: -1, key: "CANCELLED" };
    case "REJECTED":
      return { Icon: X, tone: "danger", stage: -1, key: "REJECTED" };
    default:
      return { Icon: Package, tone: "gold", stage: 0, key: "PENDING" };
  }
}

const TONE_PLATE: Record<Tone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" },
  gold: { backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" },
  success: { backgroundColor: "var(--success-soft)", color: "var(--success-ink)" },
  danger: { backgroundColor: "rgba(225,29,72,.08)", color: "#be123c" },
};

// Stor ETA-text till höger ("12 min" / "18:25" / "Snart"). t skickas in —
// modul-nivå-funktion kan inte använda hooken.
function getEtaDisplay(
  order: any,
  etaLeftSecs: number | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (order.status === "DELIVERED" || order.status === "COMPLETED") return null;
  if (etaLeftSecs !== null) {
    if (etaLeftSecs <= 0) return t("order.eta.soon");
    return t("order.eta.minutesShort", { m: Math.max(1, Math.ceil(etaLeftSecs / 60)) });
  }
  const type = order.orderType || order.type;
  if (type === "PICKUP" && order.status === "READY") return t("order.eta.now");
  if (order.scheduledFor) {
    return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  if (order.estimatedTime) return t("order.eta.minutesShort", { m: order.estimatedTime });
  return t("order.eta.soon");
}

const TERMINAL_STATUSES = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REJECTED"]);
const STORAGE_KEY = "matgo_active_order_id";
const DISMISS_KEY = "matgo_dismissed_order_id";
// Ägar-bevis för GET /api/orders/:id. Utan dessa svarar backend 404 (PII-skydd)
// och bannern rensar sig själv → "försvann". phone är durabelt (matchar
// order.customerPhone), token är 30-min-fallbacken direkt efter köp.
const TOKEN_KEY = "matgo_active_order_token";
const PHONE_KEY = "matgo_active_order_phone";

export default function LiveOrderBanner() {
  const { t } = useTranslation();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [etaLeftSecs, setEtaLeftSecs] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const id = localStorage.getItem(STORAGE_KEY);
        const dismissedId = localStorage.getItem(DISMISS_KEY);
        setOrderId(id || null);
        // Dismiss must PERSIST per order — only un-dismiss when a NEW order id
        // appears. Previously this reset to false every 30s, so the banner could
        // never actually be dismissed.
        setDismissed(Boolean(id) && id === dismissedId);
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
        // Skicka ägar-bevis (token/phone) så backend inte 404:ar bort ordern.
        const qs = new URLSearchParams();
        try {
          const tk = localStorage.getItem(TOKEN_KEY);
          const ph = localStorage.getItem(PHONE_KEY);
          if (tk) qs.set("token", tk);
          if (ph) qs.set("phone", ph);
        } catch { }
        const url = qs.toString()
          ? `${API_URL}/api/orders/${orderId}?${qs.toString()}`
          : `${API_URL}/api/orders/${orderId}`;
        const res = await axios.get(url);
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

  const visual = useMemo(() => (order ? getStatusVisual(order.status) : null), [order]);

  // Never show the live banner for an unpaid (AWAITING_PAYMENT) order — it's not
  // a live order yet, and an abandoned one would otherwise sit here forever.
  // (Backend deletes abandoned ones after 30 min; the poll then 404s and clears.)
  if (!order || dismissed || !visual || order.status === "AWAITING_PAYMENT") return null;

  const orderNumber = (order.orderNumber || "").toString().replace(/^PX-/, "") || order.id;
  const isTerminal = order.status === "DELIVERED" || order.status === "COMPLETED";
  const isCancelled = visual.tone === "danger";

  // Länka MED ägar-bevis (token/phone) så order-sidan inte 404:ar — samma proof
  // som bannern själv pollar med. Utan detta gav klick "order ej hittad".
  const trackHref = (() => {
    const qs = new URLSearchParams();
    try {
      const tk = localStorage.getItem(TOKEN_KEY);
      const ph = localStorage.getItem(PHONE_KEY);
      if (tk) qs.set("token", tk);
      if (ph) qs.set("phone", ph);
    } catch { }
    return qs.toString() ? `/order/${order.id}?${qs.toString()}` : `/order/${order.id}`;
  })();

  const etaDisplay = isTerminal || isCancelled ? null : getEtaDisplay(order, etaLeftSecs, t);
  const showEtaUnit = etaDisplay !== null && etaLeftSecs !== null && etaLeftSecs > 0;

  // Underrad: "Klar ca 18:25" när vi har en nedräkning, annars statusens subtext.
  const subline = (() => {
    if (isTerminal) return t("order.banner.thanks");
    if (etaLeftSecs !== null && etaLeftSecs > 0) {
      const readyAt = new Date(Date.now() + etaLeftSecs * 1000)
        .toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
      return t("order.eta.readyAt", { time: readyAt });
    }
    return t(`order.status.${visual.key}.desc`);
  })();

  const plate = TONE_PLATE[visual.tone];

  return (
    <AnimatePresence>
      <motion.div
        key="live-order-banner"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="fixed left-3 right-3 z-[90]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 9rem)" }}
      >
        <style>{`
          @keyframes lob-sweep {
            0% { background-position: 150% 0; }
            100% { background-position: -50% 0; }
          }
          .lob-seg-active {
            background-image: linear-gradient(90deg,
              var(--gold-soft) 0%,
              var(--color-gold-500, #E7B24B) 50%,
              var(--gold-soft) 100%);
            background-size: 200% 100%;
            animation: lob-sweep 2s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .lob-seg-active { animation: none; background-image: none; background-color: var(--color-gold-500, #E7B24B); opacity: .45; }
          }
        `}</style>
        <Link
          href={trackHref}
          className="block"
          aria-label={`${t(`order.status.${visual.key}.label`)} — ${order.restaurantName || t("order.banner.fallbackTitle")} #${orderNumber}`}
        >
          <div
            className="rounded-xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-muted)",
              boxShadow: "0 1px 2px rgba(20,20,22,.04)",
            }}
          >
            <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
              {/* Status-ikon i platt 36px-platta */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={plate}
              >
                <visual.Icon size={19} strokeWidth={2} />
              </div>

              {/* Status + underrad */}
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {t(`order.status.${visual.key}.label`)}
                </div>
                <div className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                  {subline}
                </div>
              </div>

              {/* ETA stor till höger */}
              {etaDisplay !== null && (
                <div className="shrink-0 text-right">
                  <div
                    className="text-[18px] font-bold leading-none"
                    style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {etaDisplay}
                  </div>
                  {showEtaUnit && (
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      {t("order.eta.left")}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={(e) => { e.preventDefault(); setDismissed(true); try { localStorage.setItem(DISMISS_KEY, order.id); } catch { } }}
                className="shrink-0 rounded-lg p-2 transition-opacity hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
                aria-label={t("order.banner.dismiss")}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Segmenterad progress: Bekräftad / Tillagas / På väg / Levererad */}
            {!isCancelled && (
              <div className="flex gap-1 px-4 pb-3.5">
                {[0, 1, 2, 3].map((i) => {
                  const done = visual.stage > i;
                  const active = visual.stage === i;
                  return (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${active ? "lob-seg-active" : ""}`}
                      style={
                        active
                          ? undefined
                          : {
                              backgroundColor: done
                                ? "var(--color-gold-500, #E7B24B)"
                                : "var(--border-muted)",
                            }
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}

export function rememberActiveOrder(
  orderId: string,
  proof?: { token?: string | null; phone?: string | null },
) {
  try {
    localStorage.setItem(STORAGE_KEY, orderId);
    // Spara/uppdatera ägar-beviset så bannern kan hämta ordern utan 404. Sätt
    // alltid (eller rensa) båda så ingen stale proof från en tidigare order
    // hänger kvar.
    if (proof?.token) localStorage.setItem(TOKEN_KEY, proof.token);
    else localStorage.removeItem(TOKEN_KEY);
    if (proof?.phone) localStorage.setItem(PHONE_KEY, proof.phone);
    else localStorage.removeItem(PHONE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: orderId }));
  } catch { }
}
