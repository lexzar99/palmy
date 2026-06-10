"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Truck, Store, Loader2, Calendar, Phone, Mail, Hash, AlertCircle, ShieldCheck, ShoppingBag, Sparkles, MapPin, ArrowRight, Star, X, MessageSquare } from "lucide-react";
import { openSupportChatWithOrder } from "@/components/SupportChat";
import ShareInviteCard from "@/components/ShareInviteCard";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import dynamic from "next/dynamic";

// Live-karta laddas bara på klienten (Leaflet behöver window).
const CourierTrackingMap = dynamic(() => import("@/components/CourierTrackingMap"), { ssr: false });

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

// Stil + icon per status. Label + desc resolveras via t() inne i komponenten
// (order.status.*.label / .desc) eftersom STATUS_CONFIG är module-level.
const STATUS_CONFIG: Record<string, { icon: any; colorClass: string; textClass: string }> = {
  AWAITING_PAYMENT: {
    icon: Clock,
    colorClass: "bg-amber-500/10 border-amber-500/20 shadow-amber-500/5",
    textClass: "text-amber-500",
  },
  PENDING: {
    icon: Clock,
    colorClass: "bg-amber-500/10 border-amber-500/20 shadow-amber-500/5",
    textClass: "text-amber-500",
  },
  ACCEPTED: {
    icon: Check,
    colorClass: "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5",
    textClass: "text-emerald-500",
  },
  PREPARING: {
    icon: FlameIcon,
    colorClass: "bg-orange-500/10 border-orange-500/20 shadow-orange-500/5",
    textClass: "text-orange-500",
  },
  READY: {
    icon: BoxCheckIcon,
    colorClass: "bg-gold-500/10 border-gold-500/20 shadow-gold-500/5",
    textClass: "text-gold-500",
  },
  DELIVERING: {
    icon: Truck,
    colorClass: "bg-sky-500/10 border-sky-500/20 shadow-sky-500/5",
    textClass: "text-sky-500",
  },
  DELIVERY_FAILED: {
    icon: AlertCircle,
    colorClass: "bg-rose-500/10 border-rose-500/20 shadow-rose-500/5",
    textClass: "text-rose-500",
  },
  REJECTED: {
    icon: AlertCircle,
    colorClass: "bg-rose-500/10 border-rose-500/20 shadow-rose-500/5",
    textClass: "text-rose-500",
  },
  DELIVERED: {
    icon: Check,
    colorClass: "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5",
    textClass: "text-emerald-500",
  },
  COMPLETED: {
    icon: Check,
    colorClass: "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5",
    textClass: "text-emerald-500",
  },
  CANCELLED: {
    icon: AlertCircle,
    colorClass: "bg-zinc-50 border-zinc-100",
    textClass: "text-zinc-400",
  },
};

// Stegen i kund-trackingen. Vi-levererar OCH levererar-själva visar samma
// fyra steg; skillnaden är att vi-levererar går via budet (på väg = hämtad)
// medan self auto-markeras levererad efter mock-tiden.
type StepDef = { label: string; reached: (s: string) => boolean };
const DELIVERY_STEP_DEFS: StepDef[] = [
  { label: "Granskas", reached: () => true },
  { label: "Lagar maten", reached: (s) => ["PREPARING", "READY", "DELIVERING", "DELIVERED", "COMPLETED"].includes(s) },
  { label: "På väg", reached: (s) => ["DELIVERING", "DELIVERED", "COMPLETED"].includes(s) },
  { label: "Levererad", reached: (s) => ["DELIVERED", "COMPLETED"].includes(s) },
];
const PICKUP_STEP_DEFS: StepDef[] = [
  { label: "Granskas", reached: () => true },
  { label: "Lagar maten", reached: (s) => ["PREPARING", "READY", "DELIVERED", "COMPLETED"].includes(s) },
  { label: "Redo", reached: (s) => ["READY", "DELIVERED", "COMPLETED"].includes(s) },
  { label: "Hämtad", reached: (s) => ["DELIVERED", "COMPLETED"].includes(s) },
];

const OrderStatusPage = () => {
  const { t } = useTranslation();
  const statusLabel = (s: string) => t(`order.status.${s}.label`);
  const statusDesc = (s: string) => t(`order.status.${s}.desc`);
  const { id } = useParams();
  const orderId = Array.isArray(id) ? id[0] : id;
  const searchParams = useSearchParams();
  // Phone som ownership-bevis när användaren kommer från /orders-listan
  // (där vi sparar phone i localStorage). Backend kollar mot order.customerPhone.
  const phoneFromUrl = searchParams.get("phone");
  // Access-token (returnerad av POST /api/orders) — primärt ownership-bevis
  // för gäster efter Stripe-redirect. Giltig 30 min, byter inte beteendet
  // för inloggade (JWT vinner alltid).
  const tokenFromUrl = searchParams.get("token");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // fetchError skiljer på "backend säger 404 — order finns verkligen inte"
  // (visa not-found-vy) och "fetch failade — nätverk/timeout/500" (visa
  // retry-vy). Tidigare gav båda samma "Order ej hittad"-skärm vilket är
  // skrämmande precis efter en Klarna-betalning på dåligt nät.
  const [fetchError, setFetchError] = useState<"not-found" | "network" | null>(null);
  const socketRef = useRef<any>(null);
  const [etaLeft, setEtaLeft] = useState<number | null>(null);
  // Budets live-position (endast vi-levererar; broadcastas via socket vid hämtad).
  const [courierPos, setCourierPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [likedItemIds, setLikedItemIds] = useState<string[]>([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const fetchOrder = useCallback(async (opts?: { silent?: boolean }) => {
    if (!orderId) return;
    try {
      // Skicka antingen access-token eller phone som ownership-bevis. Token
      // är primär (set vid order-create, giltig 30 min), phone backup för
      // returkund som klickat från /orders-listan.
      const qs = new URLSearchParams();
      if (tokenFromUrl) qs.set("token", tokenFromUrl);
      if (phoneFromUrl) qs.set("phone", phoneFromUrl);
      const url = qs.toString()
        ? `${API_URL}/api/orders/${orderId}?${qs.toString()}`
        : `${API_URL}/api/orders/${orderId}`;
      const res = await axios.get(url, { withCredentials: true });
      setOrder(res.data);
      setFetchError(null);
    } catch (err: any) {
      console.error(err);
      if (!opts?.silent) {
        if (err?.response?.status === 404) {
          setFetchError("not-found");
        } else {
          setFetchError("network");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, phoneFromUrl, tokenFromUrl]);

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();
    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    // Bakgrunds-polling (socket reconnect + interval) ska INTE flippa error-
    // state om vi redan har order laddad — bara visa stale data tyst tills
    // backend svarar igen. Annars börjar UI:n blinka "nätverksfel" varje 15s
    // på ostabilt nät, trots att vi har en cachad order.
    socket.on("connect", () => { socket.emit("join:order", orderId); fetchOrder({ silent: true }); });
    socket.on("order:status", (data: any) => {
      if (data.orderId === orderId) {
        setOrder((prev: any) => prev ? {
          ...prev,
          status: data.status,
          estimatedTime: data.estimatedTime ?? prev.estimatedTime,
          etaEndsAt: data.etaEndsAt ?? prev?.etaEndsAt,
          deliveringAt: data.deliveringAt ?? prev?.deliveringAt,
        } : prev);
      }
    });
    // Budets live-position (vi-levererar) → visa live-kartan i tracking.
    socket.on("courier:location", (d: any) => {
      if (typeof d?.lat === "number" && typeof d?.lng === "number") setCourierPos({ lat: d.lat, lng: d.lng });
    });

    const interval = setInterval(() => fetchOrder({ silent: true }), 15000);
    return () => { clearInterval(interval); socket.disconnect(); };
  }, [orderId, fetchOrder]);

  // Snabb-bekräftelse (catch-all): landar vi på en AWAITING_PAYMENT-order —
  // t.ex. efter en Klarna/Swish/3DS-redirect, eller om cart-confirm missade —
  // ber vi backend hämta Stripe-intent:en och finalisera DIREKT (flippa till
  // PENDING + notifiera restaurangen) istället för att vänta upp till en minut
  // på reconcile-loopen. Körs en gång per order; idempotent server-side.
  const confirmTriedRef = useRef(false);
  useEffect(() => {
    if (!orderId || order?.status !== "AWAITING_PAYMENT" || confirmTriedRef.current) return;
    confirmTriedRef.current = true;
    axios
      .post(`${API_URL}/api/payments/confirm`, { orderId }, { timeout: 6000 })
      .then(() => fetchOrder({ silent: true }))
      .catch((e) => console.warn("[order] snabb betalnings-bekräftelse misslyckades", e));
  }, [orderId, order?.status, fetchOrder]);

  // Auto-levererad efter 15 min är en MOCK — ENDAST för self-leverans (ingen
  // kurir finns att markera klart). Vi-levererar får DELIVERED på riktigt av
  // budet via socket/poll → ingen tidsmock där.
  useEffect(() => {
    if (!order?.selfDelivery || !order?.deliveringAt || order.status !== "DELIVERING") return;
    const markDelivered = () => {
      setOrder((prev: any) => prev ? { ...prev, status: "DELIVERED" } : prev);
      // Gör den durabel (best-effort; kräver inloggad ägare, gäster får bara display-flip).
      axios.patch(`${API_URL}/api/orders/${orderId}/status`, { status: "DELIVERED" }).catch(() => {});
    };
    const deliveringTime = new Date(order.deliveringAt).getTime();
    const msRemaining = (deliveringTime + 15 * 60 * 1000) - Date.now();
    if (msRemaining <= 0) { markDelivered(); return; }
    const timer = setTimeout(markDelivered, msRemaining);
    return () => clearTimeout(timer);
  }, [order?.selfDelivery, order?.deliveringAt, order?.status, orderId]);

  // ETA Countdown — in seconds for real-time display
  useEffect(() => {
    if (!order?.status || ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status)) { setEtaLeft(null); return; }
    if (!order?.etaEndsAt && !order?.estimatedTime) { setEtaLeft(null); return; }
    const calc = () => {
      if (order?.etaEndsAt) {
        const ms = new Date(order.etaEndsAt).getTime() - Date.now();
        setEtaLeft(Math.max(0, Math.ceil(ms / 1000)));
      } else if (order?.estimatedTime) {
        setEtaLeft(order.estimatedTime * 60);
      }
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [order?.etaEndsAt, order?.estimatedTime]);

  // Auto-show review prompt — ENDAST för faktiskt levererade orders, inte
  // för READY (pickup-order är bara klar att hämtas, inte upplevd än).
  // Vi sparar också "dismiss"-tillstånd i sessionStorage så att kunden inte
  // får upp samma popup vid varje page-reload — bara en gång per session.
  useEffect(() => {
    if (!order || !['DELIVERED', 'COMPLETED'].includes(order.status)) return;
    if (order.rating || reviewDone) return;
    if (typeof window !== "undefined") {
      const dismissedKey = `review_dismissed_${order.id}`;
      if (sessionStorage.getItem(dismissedKey)) return;
    }
    // Längre delay (6s istället för 2s) — kund hinner se "Levererad!"-state
    // och processa innan en modal popp:ar upp och bryter UX:n.
    const timer = setTimeout(() => setShowReview(true), 6000);
    return () => clearTimeout(timer);
  }, [order?.status, order?.rating, order?.id, reviewDone]);

  // Persistera dismiss för denna order så kunden inte spammas vid reload.
  const dismissReview = useCallback(() => {
    setShowReview(false);
    if (order?.id && typeof window !== "undefined") {
      sessionStorage.setItem(`review_dismissed_${order.id}`, "1");
    }
  }, [order?.id]);

  const submitReview = async () => {
    if (!reviewRating || !orderId) return;
    setReviewSubmitting(true);
    try {
      // Backend kräver ägar-bevis (JWT från cookie, eller phone/accessToken
      // från URL för gäster). Platform-proxyn lägger till Authorization
      // automatiskt om kunden är inloggad; gäster måste skicka samma token/
      // phone som vi använde för att hämta ordern (rad 117-126).
      const body: any = { rating: reviewRating, review: reviewText, likedItemIds };
      if (tokenFromUrl) body.accessToken = tokenFromUrl;
      if (phoneFromUrl) body.phone = phoneFromUrl;
      await axios.post(`/api/platform/orders/${orderId}/review`, body);
      setReviewDone(true);
      setShowReview(false);
      setOrder((prev: any) => prev ? { ...prev, rating: reviewRating } : prev);
    } catch (err: any) {
      alert(err.response?.data?.error || t('order.review.errorGeneric'));
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Lock background scroll when review modal is open
  useEffect(() => {
    if (showReview) {
      document.documentElement.style.overflowY = "hidden";
    } else {
      document.documentElement.style.overflowY = "";
    }
    return () => { document.documentElement.style.overflowY = ""; };
  }, [showReview]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  // Nätverksfel: backend nere/slö/timeout. Order kan mycket väl finnas och
  // vara betald — visa retry istället för "ej hittad". Kunder som JUST
  // betalat ska aldrig se "Order ej hittad" pga en 30s-backend-blip.
  if (!order && fetchError === "network") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <AlertCircle size={48} className="text-amber-500 mb-6" />
        <h1 className="text-3xl font-black uppercase italic mb-3" style={{ color: "var(--text-primary)" }}>{t("order.error.networkTitle")}</h1>
        <p className="text-sm max-w-md mb-8" style={{ color: "var(--text-secondary)" }}>
          {t("order.error.networkSub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => { setLoading(true); setFetchError(null); fetchOrder(); }}
            className="px-10 py-5 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
          >
            {t("order.error.retry")}
          </button>
          <Link
            href="/orders"
            className="px-10 py-5 border rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
            style={{ borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}
          >
            {t("order.error.myOrders")}
          </Link>
        </div>
      </div>
    );
  }

  // 404 från backend — order finns verkligen inte (eller du saknar
  // ownership-bevis). Härifrån är "till startsidan" rätt åtgärd.
  if (!order) {
    return (
       <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
          <AlertCircle size={48} className="text-rose-500 mb-6" />
          <h1 className="text-4xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>{t("order.error.notFoundTitle")}</h1>
          <p className="text-sm max-w-md mt-4" style={{ color: "var(--text-secondary)" }}>
            {t("order.error.notFoundSub")}
          </p>
          <Link href="/" className="mt-10 px-10 py-5 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[10px]">{t("order.error.notFoundCta")}</Link>
       </div>
    );
  }

  const isCompleted = order.status === "DELIVERED" || order.status === "COMPLETED";
  const currentStatus = order.status;
  const statusInfo = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = statusInfo.icon;
  const isRejected = currentStatus === "REJECTED" || currentStatus === "CANCELLED" || currentStatus === "DELIVERY_FAILED";
  const stepDefs = order.type === "DELIVERY" ? DELIVERY_STEP_DEFS : PICKUP_STEP_DEFS;
  // Aktuellt steg = sista steget vars villkor uppnåtts av nuvarande status.
  const currentIdx = isCompleted
    ? stepDefs.length - 1
    : stepDefs.reduce((acc, d, i) => (d.reached(currentStatus) ? i : acc), 0);

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "var(--bg-primary)", paddingTop: "max(4.5rem, calc(env(safe-area-inset-top, 0px) + 1rem))" }}>
      <div className="mx-auto max-w-2xl px-4">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 py-3">
          <Link href="/orders" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold transition-colors hover:border-gold-500/40" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}>
            <ArrowRight size={13} className="rotate-180" /> {t("order.subtitle")}
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-gold-600">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" /></span>
            {t("order.liveTracking")}
          </div>
        </div>
        <h1 className="mb-5 px-1 text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.title")} <span className="text-gold-gradient">#{order.orderNumber}</span></h1>

        {/* Hero: karta (vi-levererar) + status + ETA + steg */}
        <motion.div key={currentStatus} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[2rem] border shadow-xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>

          {/* Live-karta — endast vi-levererar (ej self) + under leverans. Visas direkt vid hämtad;
              budets prick fylls i när dess position kommit in. Försvinner vid DELIVERED. */}
          {currentStatus === "DELIVERING" && order.type === "DELIVERY" && !order.selfDelivery && (
            <CourierTrackingMap
              pickup={typeof order.restaurantLat === "number" && typeof order.restaurantLng === "number" ? { lat: order.restaurantLat, lng: order.restaurantLng } : null}
              dropoff={typeof order.deliveryLatitude === "number" && typeof order.deliveryLongitude === "number" ? { lat: order.deliveryLatitude, lng: order.deliveryLongitude } : null}
              courier={courierPos}
            />
          )}

          {/* Status + ETA */}
          <div className="flex items-center gap-4 p-5">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${statusInfo.colorClass} ${statusInfo.textClass}`}>
              <StatusIcon size={28} className={currentStatus === "PENDING" ? "animate-pulse" : ""} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>{statusLabel(currentStatus)}</h2>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{statusDesc(currentStatus)}</p>
            </div>
            {order.estimatedTime && !isRejected && !isCompleted && (
              <div className="shrink-0 rounded-2xl px-3.5 py-2 text-center" style={{ backgroundColor: "var(--bg-deep)" }}>
                <div className="text-[8px] font-black uppercase tracking-widest text-zinc-400">{etaLeft !== null && etaLeft <= 0 ? t("order.eta.ready") : t("order.eta.short")}</div>
                <div className={`text-lg font-black tabular-nums ${etaLeft !== null && etaLeft <= 300 ? "text-emerald-500" : "text-gold-600"}`}>
                  {etaLeft === null ? `${order.estimatedTime} min` : etaLeft <= 0 ? t("order.eta.soon") : `${Math.floor(etaLeft / 60)}:${(etaLeft % 60).toString().padStart(2, "0")}`}
                </div>
              </div>
            )}
          </div>

          {/* Steg — robust tracker: nod + halv-connectors per steg */}
          {!isRejected && (
            <div className="border-t px-4 pb-6 pt-6" style={{ borderColor: "var(--border-muted)" }}>
              <div className="flex items-start">
                {stepDefs.map((step, idx) => {
                  const isDone = currentIdx >= idx;
                  const isActive = currentIdx === idx && !isCompleted;
                  const last = idx === stepDefs.length - 1;
                  return (
                    <div key={step.label} className="flex flex-1 flex-col items-center">
                      <div className="flex w-full items-center">
                        <div className={`h-0.5 flex-1 rounded-full ${idx === 0 ? "opacity-0" : isDone ? "bg-gold-500" : "bg-zinc-100"}`} />
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${isActive ? "scale-110 border-gold-500 bg-gold-500 shadow-lg shadow-gold-500/30" : isDone ? "border-gold-500 bg-gold-500" : "border-zinc-200 bg-white text-zinc-300"}`}>
                          {isDone && !isActive ? <Check size={14} className="text-zinc-950" strokeWidth={4} /> : isActive ? <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-950" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                        </div>
                        <div className={`h-0.5 flex-1 rounded-full ${last ? "opacity-0" : currentIdx > idx ? "bg-gold-500" : "bg-zinc-100"}`} />
                      </div>
                      <span className={`mt-2.5 text-center text-[10px] font-black uppercase tracking-wide ${isActive ? "text-gold-600" : isDone ? "text-zinc-500" : "text-zinc-300"}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* ShareInviteCard borttagen — referral-systemet avstängt för launch */}

        <div className="mt-4 grid grid-cols-1 gap-4 items-start">
           {/* Detailed Receipt */}
            <div className="relative overflow-hidden rounded-[2rem] p-6 shadow-xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
               <div className="absolute top-[-100px] left-[-100px] w-[300px] h-[300px] rounded-full blur-[100px]" style={{ backgroundColor: "rgba(231,178,75,0.03)" }} />
              <div className="flex items-center justify-between mb-12 relative z-10">
                  <h2 className="text-2xl font-black uppercase italic tracking-tight leading-[1.15]" style={{ color: "var(--text-primary)" }}>{t("order.detailsTitle")}</h2>
                 <ShoppingBag size={24} className="text-gold-500/30" />
              </div>
              
              <div className="space-y-6 mb-12 relative z-10">
                 {order.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-start gap-10 group">
                       <div className="flex-1">
                          <div className="flex items-center gap-4 mb-1">
                             <span className="text-xs font-black text-gold-500 bg-gold-500/5 px-2 py-0.5 rounded-md border border-gold-500/10">{item.quantity}x</span>
                             <h3 className="font-black uppercase italic text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>{item.productName}</h3>
                          </div>
                          {item.selectedExtras && Array.isArray(item.selectedExtras) && item.selectedExtras.length > 0 && (
                             <div className="flex flex-col gap-1 mt-2 pl-12 group-hover:pl-14 transition-all">
                                {item.selectedExtras.map((e: any, idx: number) => (
                                   <span key={idx} className="text-[11px] font-bold uppercase text-zinc-500">{e.extraName || e.name}</span>
                                ))}
                             </div>
                          )}
                          {item.note && <p className="text-[10px] text-amber-500/60 font-black uppercase tracking-widest mt-2 italic px-3 border-l-[1px] border-amber-500/30">{t("order.itemNote")}: {item.note}</p>}
                       </div>
                       <div className="text-sm font-black italic text-zinc-600 group-hover:text-gold-500 transition-colors">{item.subtotal} KR</div>
                    </div>
                 ))}
              </div>

              <div className="border-t border-zinc-100 pt-10 space-y-4 relative z-10">
                 <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-700"><span>{t("order.summary.subtotal")}</span><span>{(order.total - order.deliveryFee).toFixed(0)} KR</span></div>
                 {order.deliveryFee > 0 && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-700"><span>{t("order.summary.deliveryFee")}</span><span className="text-gold-500">+{order.deliveryFee.toFixed(0)} KR</span></div>}
                  <div className="flex justify-between items-end mt-10 pt-4 border-t border-zinc-100">
                     <span className="text-2xl font-black italic uppercase tracking-tighter leading-[1.15]" style={{ color: "var(--text-primary)" }}>{t("order.summary.total")}</span>
                     <span className="text-4xl font-black italic tracking-tighter text-gold-500">{order.total.toFixed(0)} <span className="text-[10px] opacity-40 not-italic uppercase tracking-widest">{t("common.sek")}</span></span>
                  </div>
              </div>
           </div>

           {/* Info sidebar */}
           <div className="space-y-4">
               <div className="group relative overflow-hidden rounded-[2rem] border p-6 shadow-xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-gold-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <h2 className="text-xl font-black uppercase italic tracking-tight mb-10 flex items-center justify-between" style={{ color: "var(--text-primary)" }}>
                    {t("order.handling")}
                    {order.type === "DELIVERY" ? <Truck size={22} className="text-gold-500" /> : <Store size={22} className="text-gold-500" />}
                  </h2>
                 
                 <div className="space-y-8">
                    <div className="flex items-start gap-5">
                       <Phone className="text-gold-500/30 mt-1" size={20} />
                        <div>
                           <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">{t("order.yourNumber")}</div>
                           <div className="text-base font-black tracking-widest italic" style={{ color: "var(--text-primary)" }}>{order.customerPhone}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-start gap-5">
                       <Store className="text-gold-500/30 mt-1" size={20} />
                        <div className="min-w-0 flex-1">
                           <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">{t("order.restaurant")}</div>
                           <div className="text-base font-black italic uppercase" style={{ color: "var(--text-primary)" }}>{order.restaurantName}</div>
                           {/* Contact restaurant — phone (tel:) and email
                               (mailto:) shown as pill links when present. */}
                           <div className="mt-2 flex flex-wrap gap-2">
                             {order.restaurantPhone && (
                               <a
                                 href={`tel:${String(order.restaurantPhone).replace(/\s+/g, "")}`}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-500/10 text-gold-600 text-[10px] font-black uppercase tracking-wider hover:bg-gold-500/20 transition-colors"
                               >
                                 <Phone size={11} /> {order.restaurantPhone}
                               </a>
                             )}
                             {(order as any).restaurantEmail && (
                               <a
                                 href={`mailto:${(order as any).restaurantEmail}`}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 text-sky-600 text-[10px] font-black uppercase tracking-wider hover:bg-sky-500/20 transition-colors break-all"
                               >
                                 <Mail size={11} /> {(order as any).restaurantEmail}
                               </a>
                             )}
                           </div>
                        </div>
                    </div>

                    {order.type === 'DELIVERY' ? (
                       order.deliveryStreet && (
                          <div className="flex items-start gap-5">
                             <MapPin className="text-sky-500/30 mt-1" size={20} />
                              <div className="min-w-0 flex-1">
                                 <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">{t("order.deliveryAddress")}</div>
                                 {/* Tappable delivery address — opens in maps */}
                                 <a
                                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.deliveryStreet, order.restaurantCity].filter(Boolean).join(", "))}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="group block"
                                 >
                                   <div className="text-sm font-black uppercase italic leading-tight group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>{order.deliveryStreet}</div>
                                   <div className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-1">{order.restaurantCity || "LUND"}</div>
                                 </a>
                              </div>
                          </div>
                       )
                    ) : (
                       order.restaurantAddress && (
                          <div className="flex items-start gap-5">
                             <MapPin className="text-emerald-500/30 mt-1" size={20} />
                              <div className="min-w-0 flex-1">
                                 <div className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-600 mb-1">{t("order.pickupAt")}</div>
                                 {/* Tappable pickup address — opens in maps */}
                                 <a
                                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.restaurantAddress, order.restaurantZip, order.restaurantCity].filter(Boolean).join(", "))}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="group block"
                                 >
                                   <div className="text-sm font-black uppercase italic leading-tight group-hover:text-emerald-600 transition-colors" style={{ color: "var(--text-primary)" }}>{order.restaurantAddress}</div>
                                   <div className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-1">{order.restaurantZip} {order.restaurantCity}</div>
                                 </a>
                              </div>
                          </div>
                       )
                    )}

                    <div className="flex items-start gap-5">
                       <Calendar className="text-zinc-800 mt-1" size={20} />
                        <div>
                           <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">{t("order.placed")}</div>
                           <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>{t("order.scheduledToday", { time: new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) })}</div>
                        </div>
                    </div>

                    {/* scheduledFor — visa önskad leveranstid prominent när
                        kunden valt schemaläggning. Tidigare doldes detta helt
                        i UI:t så kunden förlorade synlighet på sin egen tid.
                        Skiljer formatering om datumet är idag vs ett annat
                        datum (just nu låter vi backend acceptera valfri tid,
                        men frontend-pickern är "samma dag"-only). */}
                    {order.scheduledFor && (() => {
                       const scheduled = new Date(order.scheduledFor);
                       const today = new Date();
                       const isToday =
                          scheduled.getFullYear() === today.getFullYear() &&
                          scheduled.getMonth() === today.getMonth() &&
                          scheduled.getDate() === today.getDate();
                       const timeStr = scheduled.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
                       const dateStr = scheduled.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
                       return (
                          <div className="flex items-start gap-5">
                             <Clock className="text-gold-500 mt-1" size={20} />
                              <div>
                                 <div className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">
                                    {order.type === "DELIVERY" ? t("order.scheduledFor.delivery") : t("order.scheduledFor.pickup")}
                                 </div>
                                 <div className="text-base font-black italic" style={{ color: "var(--text-primary)" }}>
                                    {isToday ? t("order.scheduledToday", { time: timeStr }) : t("order.review.scheduledDate", { date: dateStr, time: timeStr })}
                                 </div>
                              </div>
                          </div>
                       );
                    })()}
                 </div>
              </div>

              {/* Review Card or Thank You */}
              {order.rating || reviewDone ? (
                  <div className="rounded-[2rem] border p-6 text-center shadow-xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                    <div className="flex items-center justify-center gap-1 mb-4">
                      {[1,2,3,4,5].map(s => <Star key={s} size={24} className={s <= (order.rating || reviewRating) ? 'text-gold-500 fill-gold-500' : 'text-zinc-100'} />)}
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] italic mb-2" style={{ color: "var(--text-primary)" }}>{t("order.review.thanksTitle")}</h3>
                    <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">{t("order.review.thanksSub")}</p>
                 </div>
              ) : (
                 <div className="group cursor-default rounded-[2rem] p-6 text-center shadow-xl transition-all active:scale-95" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                   <div className="w-16 h-16 bg-emerald-500/10 rounded-[2rem] border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 text-emerald-600 shadow-xl shadow-emerald-500/5 group-hover:scale-110 transition-transform">
                      <ShieldCheck size={32} />
                   </div>
                   <h3 className="text-sm font-black uppercase tracking-[0.2em] italic mb-2" style={{ color: "var(--text-primary)" }}>{t("order.thanksTitle")}</h3>
                   <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">{t("order.thanksSub", { number: order.orderNumber })}</p>
                </div>
              )}

              {/* Kontakta support — finns oavsett status, pre-fyllt med order-info */}
              <button
                onClick={() => openSupportChatWithOrder(order.orderNumber, order.id)}
                className="w-full mt-4 p-6 rounded-[2rem] flex items-center justify-center gap-3 transition-all hover:border-gold-500/40 active:scale-95"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
              >
                <MessageSquare size={18} className="text-gold-500" />
                <span className="text-[11px] font-black uppercase tracking-widest">{t("order.support")}</span>
              </button>
           </div>
        </div>

        {/* Review Modal */}
        <AnimatePresence>
          {showReview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center px-6 pb-8 sm:pb-0 backdrop-blur-sm" style={{ backgroundColor: "rgba(10,10,10,0.7)" }}>
               <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm space-y-6 rounded-[2rem] border p-8 shadow-2xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>{t("order.review.title")}</h2>
                  <button onClick={dismissReview} className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors" aria-label={t("order.review.dismissAria")}><X size={20} /></button>
                </div>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{t("order.review.prompt", { restaurant: order.restaurantName })}</p>
                <div className="flex items-center justify-center gap-3">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setReviewRating(s)} className="transition-all active:scale-90 hover:scale-110">
                      <Star size={36} className={s <= reviewRating ? 'text-gold-500 fill-gold-500 drop-shadow-[0_0_8px_rgba(231,178,75,0.5)]' : 'text-zinc-800 hover:text-zinc-600'} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder={t("order.review.placeholder")}
                  rows={3}
                   className="w-full rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-gold-500/40 resize-none placeholder:text-zinc-600"
                   style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                />
                {/* Lika rätter — visa beställda items som väljbara taggar.
                    Toggleas in/ut likedItemIds. Visas på reviews-sidan som
                    "Gillade: {namn}, {namn}". */}
                {(order.items || []).length > 0 ? (
                  <div className="grid gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{t("order.review.likedTitle")}</p>
                    <div className="flex flex-wrap gap-2">
                      {order.items.map((item: any) => {
                        const id = item.productId || item.id;
                        const active = likedItemIds.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setLikedItemIds((current) => active ? current.filter((x) => x !== id) : [...current, id])}
                            className="px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all"
                            style={{
                              backgroundColor: active ? "var(--accent-strong, #f3bf57)" : "var(--bg-deep)",
                              color: active ? "#11151b" : "var(--text-primary)",
                              border: "1px solid var(--border-muted)",
                            }}
                          >
                            {active ? "♥ " : ""}{item.productName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <button
                  onClick={submitReview}
                  disabled={!reviewRating || reviewSubmitting}
                  className="w-full py-5 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                >
                  {reviewSubmitting ? <Loader2 className="animate-spin" size={18} /> : <><Star size={16} /> {t("order.review.submit")}</>}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OrderStatusPage;
