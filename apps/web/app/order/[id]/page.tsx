"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Truck, Store, Loader2, Calendar, Phone, Mail, AlertCircle, ShieldCheck, ShoppingBag, MapPin, ArrowRight, Star, X, MessageSquare } from "lucide-react";
import { openSupportChatWithOrder } from "@/components/SupportChat";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { cacheOrderDetail, getCachedOrderDetail } from "@/lib/offlineOrders";
import { isPushSupported, getPushPublicKey, subscribeOrderPush, hasOrderPush } from "@/lib/webPushClient";
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
// EN statuspalett, en form ("tyst & direkt"): väntande = neutral yta,
// aktivt arbete (tillagas/på väg) = mjuk guldyta, klart = mjuk grön,
// fel/avbrutet = mjuk rosé. Inga glow-skuggor eller spridda accentfärger.
const STATUS_CONFIG: Record<string, { icon: any; colorClass: string; textClass: string }> = {
  AWAITING_PAYMENT: {
    icon: Clock,
    colorClass: "bg-[var(--bg-deep)] border-[var(--border-muted)]",
    textClass: "text-[var(--text-secondary)]",
  },
  PENDING: {
    icon: Clock,
    colorClass: "bg-[var(--bg-deep)] border-[var(--border-muted)]",
    textClass: "text-[var(--text-secondary)]",
  },
  ACCEPTED: {
    icon: Check,
    colorClass: "bg-[var(--bg-deep)] border-[var(--border-muted)]",
    textClass: "text-[var(--text-primary)]",
  },
  PREPARING: {
    icon: FlameIcon,
    colorClass: "bg-[var(--gold-soft)] border-[var(--border-muted)]",
    textClass: "text-[var(--gold-ink)]",
  },
  READY: {
    icon: BoxCheckIcon,
    colorClass: "bg-[var(--gold-soft)] border-[var(--border-muted)]",
    textClass: "text-[var(--gold-ink)]",
  },
  DELIVERING: {
    icon: Truck,
    colorClass: "bg-[var(--gold-soft)] border-[var(--border-muted)]",
    textClass: "text-[var(--gold-ink)]",
  },
  DELIVERY_FAILED: {
    icon: AlertCircle,
    colorClass: "bg-rose-500/8 border-rose-500/20",
    textClass: "text-rose-600",
  },
  REJECTED: {
    icon: AlertCircle,
    colorClass: "bg-rose-500/8 border-rose-500/20",
    textClass: "text-rose-600",
  },
  DELIVERED: {
    icon: Check,
    colorClass: "bg-[var(--success-soft)] border-[var(--border-muted)]",
    textClass: "text-[var(--success-ink)]",
  },
  COMPLETED: {
    icon: Check,
    colorClass: "bg-[var(--success-soft)] border-[var(--border-muted)]",
    textClass: "text-[var(--success-ink)]",
  },
  CANCELLED: {
    icon: AlertCircle,
    colorClass: "bg-[var(--bg-deep)] border-[var(--border-muted)]",
    textClass: "text-[var(--text-secondary)]",
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
// Avhämtning slutar vid "Klar för avhämtning" (sista steget) — speglar RN-appen.
// Ingen "Hämtad"-status efter, kunden hämtar själv när det står klart.
const PICKUP_STEP_DEFS: StepDef[] = [
  { label: "Mottagen", reached: () => true },
  { label: "Lagar maten", reached: (s) => ["PREPARING", "READY", "DELIVERED", "COMPLETED"].includes(s) },
  { label: "Klar för avhämtning", reached: (s) => ["READY", "DELIVERED", "COMPLETED"].includes(s) },
];

// Avslutade lägen är "sticky": en redan levererad/avbruten order får ALDRIG
// dras tillbaka till ett aktivt läge av en stale poll, en cachad GET (backend
// cachar order-detaljen 4s) eller en omordnad socket-event. Utan detta hoppade
// kund-trackingen bakåt (DELIVERED → DELIVERING) och live-kartan kom tillbaka.
const TERMINAL_STATUSES = ["DELIVERED", "COMPLETED", "CANCELLED", "REJECTED"];
const isTerminal = (s?: string | null) => !!s && TERMINAL_STATUSES.includes(s);

// Leveransfotot finns kvar ~2 dygn (proofExpiresAt) och raderas sen permanent
// på servern. Visa bara medan det fortfarande finns.
const proofIsLive = (order: any): boolean => {
  if (!order?.proofPhotoUrl) return false;
  if (!order.proofExpiresAt) return true;
  const exp = new Date(order.proofExpiresAt).getTime();
  return Number.isFinite(exp) ? exp > Date.now() : true;
};

const paymentMethodLabel = (m?: string | null): string => {
  if (m === "CASH") return "Kontant";
  if (m === "ONLINE") return "Kort / online";
  return m || "—";
};

const escapeHtml = (s: any): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// Bygger ett snyggt, fristående HTML-kvitto från riktig orderdata (restaurangens
// juridiska namn, org.nr, adress, kontakt). Ren HTML → ingen serverbelastning;
// laddas ner som en fil och kan skrivas ut/sparas som PDF i webbläsaren.
function buildReceiptHtml(order: any): string {
  const items: any[] = order.items ?? [];
  const rawSubtotal = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  const tip = Number(order.tipAmount) || 0;
  const deliveryFee = Number(order.deliveryFee) || 0;
  const total = Number(order.total) || 0;
  const discount = Math.max(0, Math.round(rawSubtotal + deliveryFee - (total - tip)));
  const created = order.createdAt ? new Date(order.createdAt) : new Date();
  const dateStr = created.toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" });
  const legalName = order.restaurantLegalName || order.restaurantName || "Restaurang";
  const addressLine = [order.restaurantAddress, [order.restaurantZip, order.restaurantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const row = (label: string, value: string, opts?: { strong?: boolean; muted?: boolean; accent?: boolean }) =>
    `<div style="display:flex;justify-content:space-between;gap:16px;padding:${opts?.strong ? "10px 0 0" : "3px 0"};${opts?.strong ? "border-top:1px solid #e7e3da;margin-top:8px;" : ""}">
      <span style="${opts?.strong ? "font-weight:700;font-size:15px;" : "font-size:13px;"}color:${opts?.accent ? "#8A6512" : opts?.muted ? "#6b6b70" : "#111113"};">${escapeHtml(label)}</span>
      <span style="${opts?.strong ? "font-weight:700;font-size:18px;color:#8A6512;" : "font-size:13px;color:#111113;"}font-variant-numeric:tabular-nums;">${escapeHtml(value)}</span>
    </div>`;

  const itemsHtml = items.map((it) => {
    const extras = Array.isArray(it.selectedExtras) ? it.selectedExtras : [];
    const extrasHtml = extras.length
      ? `<div style="padding-left:22px;color:#6b6b70;font-size:12px;">${extras.map((e: any) => escapeHtml(e.extraName || e.name)).join("<br/>")}</div>`
      : "";
    const noteHtml = it.note ? `<div style="padding-left:22px;color:#6b6b70;font-size:12px;font-style:italic;">${escapeHtml(it.note)}</div>` : "";
    return `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:10px;">
      <div style="flex:1;min-width:0;">
        <div><span style="color:#8A6512;font-weight:700;font-size:12px;">${escapeHtml(it.quantity)}×</span> <span style="font-weight:600;font-size:14px;">${escapeHtml(it.productName)}</span></div>
        ${extrasHtml}${noteHtml}
      </div>
      <div style="font-weight:600;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(Number(it.subtotal).toFixed(0))} kr</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Kvitto ${escapeHtml(order.orderNumber || "")}</title></head>
<body style="margin:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111113;">
  <div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #e7e3da;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 28px 20px;border-bottom:1px solid #e7e3da;">
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;">${escapeHtml(legalName)}</div>
      ${order.restaurantOrgNr ? `<div style="font-size:12px;color:#6b6b70;margin-top:4px;">Org.nr ${escapeHtml(order.restaurantOrgNr)}</div>` : ""}
      ${addressLine ? `<div style="font-size:12px;color:#6b6b70;margin-top:2px;">${escapeHtml(addressLine)}</div>` : ""}
      <div style="font-size:12px;color:#6b6b70;margin-top:2px;">${[order.restaurantPhone, order.restaurantEmail].filter(Boolean).map(escapeHtml).join(" · ")}</div>
    </div>
    <div style="padding:20px 28px;border-bottom:1px solid #e7e3da;">
      <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:#6b6b70;">Kvitto</span><span style="font-weight:700;">#${escapeHtml(order.orderNumber || "")}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px;"><span style="color:#6b6b70;">Datum</span><span>${escapeHtml(dateStr)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px;"><span style="color:#6b6b70;">Typ</span><span>${order.type === "DELIVERY" ? "Leverans" : "Avhämtning"}</span></div>
    </div>
    <div style="padding:22px 28px;">
      ${itemsHtml}
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e7e3da;">
        ${row("Delsumma", rawSubtotal.toFixed(0) + " kr", { muted: true })}
        ${discount > 0 ? row(order.appliedDealTitle || "Rabatt", "−" + discount.toFixed(0) + " kr", { accent: true }) : ""}
        ${deliveryFee > 0 ? row("Leveransavgift", "+" + deliveryFee.toFixed(0) + " kr", { muted: true }) : ""}
        ${tip > 0 ? row("Dricks", "+" + tip.toFixed(0) + " kr", { muted: true }) : ""}
        ${row("Totalt", total.toFixed(0) + " kr", { strong: true })}
      </div>
      <div style="margin-top:14px;font-size:12px;color:#6b6b70;">Betalsätt: ${escapeHtml(paymentMethodLabel(order.paymentMethod))}</div>
    </div>
    <div style="padding:16px 28px 24px;text-align:center;font-size:11px;color:#9a9a9f;border-top:1px solid #e7e3da;">Tack för din beställning!</div>
  </div>
</body></html>`;
}

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
  // Kvitto-modal + nedladdningsräknare (max 2 ggr per order, lokalt).
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptDownloads, setReceiptDownloads] = useState(0);
  // Förstora leveransfotot.
  const [proofZoom, setProofZoom] = useState(false);
  // Web push: visas bara när webbläsaren stödjer push OCH servern har VAPID-
  // nycklar (annars null → raden renderas inte alls).
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    if (!orderId || !isPushSupported()) return;
    let active = true;
    getPushPublicKey().then((key) => {
      if (!active || !key) return;
      setPushAvailable(true);
      setPushEnabled(hasOrderPush(orderId));
    });
    return () => { active = false; };
  }, [orderId]);
  const enablePush = async () => {
    if (!orderId || pushBusy || pushEnabled) return;
    setPushBusy(true);
    const ok = await subscribeOrderPush(orderId);
    setPushEnabled(ok);
    setPushBusy(false);
  };

  // Kvitto-nedladdningar räknas lokalt per order (max 2). Ingen serverbelastning.
  const RECEIPT_MAX_DOWNLOADS = 2;
  useEffect(() => {
    if (!orderId) return;
    try {
      setReceiptDownloads(parseInt(localStorage.getItem(`receipt_dl_${orderId}`) || "0", 10) || 0);
    } catch { /* ignore */ }
  }, [orderId]);

  const downloadReceipt = () => {
    if (!order || !orderId || receiptDownloads >= RECEIPT_MAX_DOWNLOADS) return;
    const html = buildReceiptHtml(order);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kvitto-${order.orderNumber || orderId}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const next = receiptDownloads + 1;
    setReceiptDownloads(next);
    try { localStorage.setItem(`receipt_dl_${orderId}`, String(next)); } catch { /* ignore */ }
  };

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
      // Låt aldrig en (ev. cachad/stale) poll dra tillbaka en redan avslutad
      // order — behåll terminal-status men ta in övriga färska fält.
      setOrder((prev: any) =>
        prev && isTerminal(prev.status) && !isTerminal(res.data?.status)
          ? { ...res.data, status: prev.status }
          : res.data
      );
      // Offline-kvitto: senaste ordern cachas lokalt så sidan kan visas helt
      // utan nät (app-skalet serveras redan av service workern).
      cacheOrderDetail(res.data);
      setFetchError(null);
    } catch (err: any) {
      console.error(err);
      if (!opts?.silent) {
        if (err?.response?.status === 404) {
          setFetchError("not-found");
        } else {
          // Nätverksfel: fall tillbaka till offline-cachad order om den
          // matchar — kvittot är viktigare än felmeddelandet.
          const cached = getCachedOrderDetail(orderId);
          if (cached) {
            setOrder((prev: any) => prev ?? cached.order);
            setFetchError(null);
          } else {
            setFetchError("network");
          }
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
        setOrder((prev: any) => {
          if (!prev) return prev;
          // Sen/omordnad event får inte återuppliva en avslutad order.
          if (isTerminal(prev.status) && !isTerminal(data.status)) return prev;
          return {
            ...prev,
            status: data.status,
            estimatedTime: data.estimatedTime ?? prev.estimatedTime,
            etaEndsAt: data.etaEndsAt ?? prev?.etaEndsAt,
            deliveringAt: data.deliveringAt ?? prev?.deliveringAt,
          };
        });
      }
    });
    // Budets live-position (vi-levererar) → visa live-kartan i tracking.
    socket.on("courier:location", (d: any) => {
      if (typeof d?.lat === "number" && typeof d?.lng === "number") setCourierPos({ lat: d.lat, lng: d.lng });
    });
    // Leveransbevis (foto + hur maten lämnats) → merge in direkt utan poll.
    socket.on("delivery:proof", (d: any) => {
      if (d?.orderId !== orderId) return;
      setOrder((prev: any) => prev ? {
        ...prev,
        proofMethod: d.proofMethod ?? prev.proofMethod,
        proofMessage: d.proofMessage ?? prev.proofMessage,
        proofPhotoUrl: d.proofPhotoUrl ?? prev.proofPhotoUrl,
        proofExpiresAt: d.proofExpiresAt ?? prev.proofExpiresAt,
      } : prev);
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
    // Skeleton som matchar sidans faktiska layout (paritet med övriga sidor —
    // ingen blockerande spinner). Status-kort → kvitto → info-kort.
    return (
      <div className="min-h-screen pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-24 md:pb-16" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="mx-auto max-w-2xl px-4">
          <div className="flex items-center justify-between py-3">
            <div className="skeleton h-9 w-28 rounded-full" />
            <div className="skeleton h-7 w-32 rounded-full" />
          </div>
          <div className="skeleton h-8 w-48 rounded-xl mb-5" />
          <div className="skeleton h-44 w-full rounded-2xl mb-4" />
          <div className="skeleton h-64 w-full rounded-2xl mb-4" />
          <div className="skeleton h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  // Nätverksfel: backend nere/slö/timeout. Order kan mycket väl finnas och
  // vara betald — visa retry istället för "ej hittad". Kunder som JUST
  // betalat ska aldrig se "Order ej hittad" pga en 30s-backend-blip.
  if (!order && fetchError === "network") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <AlertCircle size={44} className="text-amber-500 mb-6" />
        <h1 className="text-2xl font-bold tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>{t("order.error.networkTitle")}</h1>
        <p className="text-sm max-w-md mb-8" style={{ color: "var(--text-secondary)" }}>
          {t("order.error.networkSub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => { setLoading(true); setFetchError(null); fetchOrder(); }}
            className="px-8 py-4 bg-gold-500 text-zinc-950 rounded-full font-bold text-sm"
          >
            {t("order.error.retry")}
          </button>
          <Link
            href="/orders"
            className="px-8 py-4 border rounded-full font-bold text-sm text-center"
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
          <AlertCircle size={44} className="text-rose-500 mb-6" />
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.error.notFoundTitle")}</h1>
          <p className="text-sm max-w-md mt-3" style={{ color: "var(--text-secondary)" }}>
            {t("order.error.notFoundSub")}
          </p>
          <Link href="/" className="mt-8 px-8 py-4 bg-gold-500 text-zinc-950 rounded-full font-bold text-sm">{t("order.error.notFoundCta")}</Link>
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
    <div className="min-h-screen pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-24 md:pb-16" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-2xl px-4">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 py-3">
          <Link href="/orders" className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition-colors" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}>
            <ArrowRight size={13} className="rotate-180" /> {t("order.subtitle")}
          </Link>
          {!isRejected && !isCompleted && (
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1.5 text-[11px] font-bold text-gold-600">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" /></span>
              {t("order.liveTracking")}
            </div>
          )}
        </div>
        <h1 className="mb-4 px-1 text-[1.45rem] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.title")} <span className="text-gold-600">#{order.orderNumber}</span></h1>

        {/* Hero: karta (vi-levererar) + status + ETA + steg */}
        <motion.div key={currentStatus} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>

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
              <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{statusLabel(currentStatus)}</h2>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{statusDesc(currentStatus)}</p>
            </div>
            {order.estimatedTime && !isRejected && !isCompleted && (
              <div className="shrink-0 rounded-2xl px-3.5 py-2 text-center" style={{ backgroundColor: "var(--bg-deep)" }}>
                <div className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{etaLeft !== null && etaLeft <= 0 ? t("order.eta.ready") : t("order.eta.short")}</div>
                <div className={`text-lg font-bold tabular-nums ${etaLeft !== null && etaLeft <= 300 ? "text-emerald-500" : "text-gold-600"}`}>
                  {etaLeft === null ? `${order.estimatedTime} min` : etaLeft <= 0 ? t("order.eta.soon") : `${Math.floor(etaLeft / 60)}:${(etaLeft % 60).toString().padStart(2, "0")}`}
                </div>
              </div>
            )}
          </div>

          {/* Steg — robust tracker: nod + halv-connectors per steg.
              Vid "På väg" glider en liten bud-ikon fram och tillbaka ovanför
              det aktiva steget (CSS-only, respekterar reduced motion). */}
          {/* Segmenterad progress (ticket-design): klara = ink, aktivt = guld
              (mjuk andning), kommande = hårfin linje. Speglar RN-appen. */}
          {!isRejected && (
            <div className="border-t px-5 pb-6 pt-5" style={{ borderColor: "var(--border-muted)" }}>
              <style>{`
                @keyframes segBreathe { 0%,100% { opacity:1 } 50% { opacity:.82 } }
                .seg-active { animation: segBreathe 1.8s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) { .seg-active { animation: none; } }
              `}</style>
              <div className="flex gap-1.5" role="img" aria-label={`Steg ${currentIdx + 1} av ${stepDefs.length}: ${stepDefs[currentIdx]?.label ?? ""}`}>
                {stepDefs.map((_, idx) => {
                  const state = isCompleted ? "done" : idx < currentIdx ? "done" : idx === currentIdx ? "active" : "todo";
                  return (
                    <div
                      key={idx}
                      className={`h-[5px] flex-1 rounded-full ${state === "active" ? "seg-active" : ""}`}
                      style={{ backgroundColor: state === "done" ? "var(--text-primary)" : state === "active" ? "var(--color-gold-500)" : "var(--border-muted)" }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex">
                {stepDefs.map((step, idx) => (
                  <span
                    key={idx}
                    className="truncate text-[10.5px]"
                    style={{
                      flex: idx === stepDefs.length - 1 ? 1.4 : 1,
                      textAlign: idx === stepDefs.length - 1 ? "right" : "left",
                      color: idx === currentIdx ? "var(--gold-ink)" : "var(--text-secondary)",
                      fontWeight: idx === currentIdx ? 700 : 500,
                      opacity: idx <= currentIdx ? 1 : 0.6,
                    }}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Web push — "Få avisering när maten är på väg". Visas bara när
            servern har VAPID-nycklar + webbläsaren stödjer push, och döljs
            för avslutade ordrar. */}
        {pushAvailable && !isTerminal(currentStatus) && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl px-4 py-3.5" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Få avisering när maten är på väg</p>
              <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {pushEnabled ? "Aktiverat — vi säger till även om fliken är stängd" : "Push via webben — även när fliken är stängd"}
              </p>
            </div>
            <button
              type="button"
              onClick={enablePush}
              disabled={pushBusy || pushEnabled}
              aria-pressed={pushEnabled}
              className="relative w-11 h-[26px] rounded-full shrink-0 transition-colors disabled:cursor-default"
              style={{ backgroundColor: pushEnabled ? "var(--text-primary)" : "var(--border-muted)" }}
            >
              <span
                className="absolute top-[3px] w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: pushEnabled ? "calc(100% - 23px)" : "3px", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
              />
            </button>
          </div>
        )}

        {/* ShareInviteCard borttagen — referral-systemet avstängt för launch */}

        {/* Leveransbevis: budets foto + hur maten lämnades. Visas bara medan
            fotot finns kvar (~2 dygn) och raderas sen permanent på servern. */}
        {proofIsLive(order) && (
          <div className="mt-4 rounded-2xl p-5 sm:p-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Leveransbevis</h2>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}>
                {order.proofMethod === "LEFT_AT_DOOR" ? "Lämnad vid dörren" : "Lämnad i handen"}
              </span>
            </div>
            <div className="flex gap-4">
              <button type="button" onClick={() => setProofZoom(true)} className="shrink-0 overflow-hidden rounded-xl" style={{ border: "1px solid var(--border-muted)" }} title="Förstora">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.proofPhotoUrl} alt="Leveransfoto" className="h-24 w-24 object-cover transition hover:opacity-80" />
              </button>
              <div className="min-w-0 flex-1">
                {order.proofMessage && (
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{order.proofMessage}</p>
                )}
                <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>Tryck på bilden för att förstora. Sparas i 2 dagar.</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 items-start">
           {/* Kvitto — rena rader, tunna avdelare, guld bara på totalen */}
            <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
              <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.detailsTitle")}</h2>
                 <ShoppingBag size={19} className="text-gold-500" />
              </div>

              <div className="space-y-4 mb-6">
                 {order.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-start gap-6">
                       <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2.5">
                             <span className="text-xs font-bold text-gold-600 tabular-nums shrink-0">{item.quantity}×</span>
                             <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{item.productName}</h3>
                          </div>
                          {item.selectedExtras && Array.isArray(item.selectedExtras) && item.selectedExtras.length > 0 && (
                             <div className="flex flex-col gap-0.5 mt-1 pl-7">
                                {item.selectedExtras.map((e: any, idx: number) => (
                                   <span key={idx} className="text-xs" style={{ color: "var(--text-secondary)" }}>{e.extraName || e.name}</span>
                                ))}
                             </div>
                          )}
                          {item.note && <p className="text-xs mt-1.5 pl-7 italic" style={{ color: "var(--text-secondary)" }}>{t("order.itemNote")}: {item.note}</p>}
                       </div>
                       <div className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>{item.subtotal} kr</div>
                    </div>
                 ))}
              </div>

              <div className="pt-4 space-y-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
                 {(() => {
                   // Rå delsumma = summan av produktrader (matchar vad raderna visar).
                   // Rabatten (deal/BOGO/kupong) räknas ut ur datan vi redan har:
                   // total = delsumma − rabatt + leverans → rabatt = delsumma + leverans − total.
                   // Visas som egen rad så kvittot stämmer med raderna (gratis-varan
                   // står med fullt pris + en tydlig "Erbjudande −X kr"-rad).
                   const rawSubtotal = (order.items ?? []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
                   const discount = Math.round(rawSubtotal + order.deliveryFee - order.total);
                   return (
                     <>
                       <div className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}><span>{t("order.summary.subtotal")}</span><span className="tabular-nums">{rawSubtotal.toFixed(0)} kr</span></div>
                       {discount > 0 && (
                         <div className="flex justify-between text-[13px] text-emerald-600">
                           <span>{order.appliedDealTitle || t("order.summary.discount")}</span>
                           <span className="tabular-nums">−{discount.toFixed(0)} kr</span>
                         </div>
                       )}
                     </>
                   );
                 })()}
                 {order.deliveryFee > 0 && <div className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}><span>{t("order.summary.deliveryFee")}</span><span className="tabular-nums">+{order.deliveryFee.toFixed(0)} kr</span></div>}
                  <div className="flex justify-between items-baseline pt-3 mt-1" style={{ borderTop: "1px solid var(--border-muted)" }}>
                     <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{t("order.summary.total")}</span>
                     <span className="text-2xl font-bold tracking-tight text-gold-600 tabular-nums">{order.total.toFixed(0)} kr</span>
                  </div>
              </div>

              {/* Visa fullständigt kvitto (med restaurangens juridiska uppgifter)
                  och ladda ner det som en fristående HTML-fil. */}
              <button
                type="button"
                onClick={() => setShowReceipt(true)}
                className="mt-5 w-full inline-flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-bold transition-colors"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border-muted)" }}
              >
                <ShoppingBag size={16} /> Ladda ner kvitto
                <span className="ml-auto text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {receiptDownloads >= RECEIPT_MAX_DOWNLOADS ? "Max nått" : `PDF · ${RECEIPT_MAX_DOWNLOADS - receiptDownloads} kvar`}
                </span>
              </button>
           </div>

           {/* Info sidebar */}
           <div className="space-y-4">
               <div className="rounded-2xl border p-5 sm:p-6" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                  <h2 className="text-lg font-bold tracking-tight mb-5 flex items-center justify-between" style={{ color: "var(--text-primary)" }}>
                    {t("order.handling")}
                    {order.type === "DELIVERY" ? <Truck size={19} className="text-gold-500" /> : <Store size={19} className="text-gold-500" />}
                  </h2>

                 <div className="space-y-5">
                    <div className="flex items-start gap-3.5">
                       <Phone className="text-gold-500 mt-0.5 shrink-0" size={16} />
                        <div>
                           <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.yourNumber")}</div>
                           <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{order.customerPhone}</div>
                        </div>
                    </div>

                    <div className="flex items-start gap-3.5">
                       <Store className="text-gold-500 mt-0.5 shrink-0" size={16} />
                        <div className="min-w-0 flex-1">
                           <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.restaurant")}</div>
                           <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{order.restaurantName}</div>
                           {/* Contact restaurant — phone (tel:) and email
                               (mailto:) shown as pill links when present. */}
                           <div className="mt-2 flex flex-wrap gap-2">
                             {order.restaurantPhone && (
                               <a
                                 href={`tel:${String(order.restaurantPhone).replace(/\s+/g, "")}`}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-500/10 text-gold-600 text-xs font-bold hover:bg-gold-500/20 transition-colors"
                               >
                                 <Phone size={11} /> {order.restaurantPhone}
                               </a>
                             )}
                             {(order as any).restaurantEmail && (
                               <a
                                 href={`mailto:${(order as any).restaurantEmail}`}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 text-sky-600 text-xs font-bold hover:bg-sky-500/20 transition-colors break-all"
                               >
                                 <Mail size={11} /> {(order as any).restaurantEmail}
                               </a>
                             )}
                           </div>
                        </div>
                    </div>

                    {order.type === 'DELIVERY' ? (
                       order.deliveryStreet && (
                          <div className="flex items-start gap-3.5">
                             <MapPin className="text-gold-500 mt-0.5 shrink-0" size={16} />
                              <div className="min-w-0 flex-1">
                                 <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.deliveryAddress")}</div>
                                 {/* Tappable delivery address — opens in maps */}
                                 <a
                                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.deliveryStreet, order.restaurantCity].filter(Boolean).join(", "))}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="group block"
                                 >
                                   <div className="text-sm font-semibold leading-snug group-hover:text-gold-600 transition-colors" style={{ color: "var(--text-primary)" }}>{order.deliveryStreet}</div>
                                   <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{order.restaurantCity || "Lund"}</div>
                                 </a>
                              </div>
                          </div>
                       )
                    ) : (
                       order.restaurantAddress && (
                          <div className="flex items-start gap-3.5">
                             <MapPin className="text-gold-500 mt-0.5 shrink-0" size={16} />
                              <div className="min-w-0 flex-1">
                                 <div className="text-[10px] font-bold mb-0.5 text-gold-600">{t("order.pickupAt")}</div>
                                 {/* Tappable pickup address — opens in maps */}
                                 <a
                                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.restaurantAddress, order.restaurantZip, order.restaurantCity].filter(Boolean).join(", "))}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="group block"
                                 >
                                   <div className="text-sm font-semibold leading-snug group-hover:text-gold-600 transition-colors" style={{ color: "var(--text-primary)" }}>{order.restaurantAddress}</div>
                                   <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{order.restaurantZip} {order.restaurantCity}</div>
                                 </a>
                              </div>
                          </div>
                       )
                    )}

                    <div className="flex items-start gap-3.5">
                       <Calendar className="text-gold-500 mt-0.5 shrink-0" size={16} />
                        <div>
                           <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.placed")}</div>
                           <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t("order.scheduledToday", { time: new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) })}</div>
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
                          <div className="flex items-start gap-3.5">
                             <Clock className="text-gold-500 mt-0.5 shrink-0" size={16} />
                              <div>
                                 <div className="text-[10px] font-bold text-gold-600 mb-0.5">
                                    {order.type === "DELIVERY" ? t("order.scheduledFor.delivery") : t("order.scheduledFor.pickup")}
                                 </div>
                                 <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
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
                  <div className="rounded-2xl border p-5 text-center" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                    <div className="flex items-center justify-center gap-1 mb-3">
                      {[1,2,3,4,5].map(s => <Star key={s} size={22} className={s <= (order.rating || reviewRating) ? 'text-gold-500 fill-gold-500' : ''} style={s <= (order.rating || reviewRating) ? undefined : { color: "var(--border-muted)" }} />)}
                    </div>
                    <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{t("order.review.thanksTitle")}</h3>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("order.review.thanksSub")}</p>
                 </div>
              ) : (
                 <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                   <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3 text-emerald-600">
                      <ShieldCheck size={24} />
                   </div>
                   <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{t("order.thanksTitle")}</h3>
                   <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("order.thanksSub", { number: order.orderNumber })}</p>
                </div>
              )}

              {/* Kontakta support — finns oavsett status, pre-fyllt med order-info */}
              <button
                onClick={() => openSupportChatWithOrder(order.orderNumber, order.id)}
                className="w-full mt-4 py-4 rounded-full flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
              >
                <MessageSquare size={16} className="text-gold-500" />
                <span className="text-sm font-bold">{t("order.support")}</span>
              </button>
           </div>
        </div>

        {/* Recensionsmodal — på tema (platt, vit yta, sparsam guld). */}
        <AnimatePresence>
          {showReview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0 backdrop-blur-sm" style={{ backgroundColor: "rgba(10,10,10,0.6)" }} onClick={dismissReview}>
               <motion.div initial={{ scale: 0.96, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 24 }} transition={{ type: "spring", stiffness: 320, damping: 30 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                {/* Rubrik */}
                <div className="flex items-start justify-between gap-3 px-6 pt-6">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.review.title")}</h2>
                    <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{t("order.review.prompt", { restaurant: order.restaurantName })}</p>
                  </div>
                  <button onClick={dismissReview} className="-mr-1.5 -mt-1.5 rounded-full p-2 transition-colors hover:bg-black/5" style={{ color: "var(--text-secondary)" }} aria-label={t("order.review.dismissAria")}><X size={18} /></button>
                </div>
                {/* Betyg */}
                <div className="flex items-center justify-center gap-2.5 px-6 pt-6">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} type="button" onClick={() => setReviewRating(s)} className="transition-transform active:scale-90 hover:scale-110" aria-label={`${s}/5`}>
                      <Star size={36} strokeWidth={1.5} className={s <= reviewRating ? 'fill-[var(--color-gold-500)] text-[var(--color-gold-500)]' : ''} style={s <= reviewRating ? undefined : { color: "var(--line-strong)" }} />
                    </button>
                  ))}
                </div>
                <div className="space-y-4 px-6 pt-6">
                  <textarea
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value)}
                    placeholder={t("order.review.placeholder")}
                    rows={3}
                    className="w-full rounded-2xl py-3.5 px-4 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--color-gold-500)]/35 resize-none"
                    style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                  />
                  {/* Lika rätter — beställda items som väljbara taggar (♥). Visas på
                      reviews-sidan som "Gillade: {namn}". Aktiv = mjuk guldyta. */}
                  {(order.items || []).length > 0 ? (
                    <div className="grid gap-2">
                      <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{t("order.review.likedTitle")}</p>
                      <div className="flex flex-wrap gap-2">
                        {order.items.map((item: any) => {
                          const id = item.productId || item.id;
                          const active = likedItemIds.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setLikedItemIds((current) => active ? current.filter((x) => x !== id) : [...current, id])}
                              className="px-3 py-2 rounded-full text-[11px] font-bold transition-all"
                              style={{
                                backgroundColor: active ? "var(--gold-soft)" : "var(--bg-deep)",
                                color: active ? "var(--gold-ink)" : "var(--text-secondary)",
                                border: `1px solid ${active ? "var(--color-gold-500)" : "var(--border-muted)"}`,
                              }}
                            >
                              {active ? "♥ " : ""}{item.productName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                {/* Skicka */}
                <div className="px-6 pb-6 pt-6">
                  <button
                    onClick={submitReview}
                    disabled={!reviewRating || reviewSubmitting}
                    className="w-full py-4 rounded-full font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2.5"
                    style={{ backgroundColor: "var(--color-gold-500)", color: "var(--text-primary)" }}
                  >
                    {reviewSubmitting ? <Loader2 className="animate-spin" size={18} /> : <><Star size={16} className="fill-current" /> {t("order.review.submit")}</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Kvitto-modal: snyggt kvitto med restaurangens juridiska uppgifter +
            nedladdning (max 2 ggr per order, klient-genererad HTML — ingen server). */}
        <AnimatePresence>
          {showReceipt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0 backdrop-blur-sm" style={{ backgroundColor: "rgba(10,10,10,0.7)" }} onClick={() => setShowReceipt(false)}>
              <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="w-full max-w-md max-h-[88vh] overflow-auto rounded-2xl border shadow-2xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 pt-5 pb-3 sticky top-0" style={{ backgroundColor: "var(--bg-secondary)", borderBottom: "1px solid var(--border-muted)" }}>
                  <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Kvitto</h2>
                  <button onClick={() => setShowReceipt(false)} className="p-2" style={{ color: "var(--text-secondary)" }} aria-label="Stäng"><X size={20} /></button>
                </div>
                <div className="px-6 py-4 text-sm" style={{ color: "var(--text-primary)" }}>
                  <div className="font-extrabold text-[17px] tracking-tight">{order.restaurantLegalName || order.restaurantName}</div>
                  {order.restaurantOrgNr && <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Org.nr {order.restaurantOrgNr}</div>}
                  {(order.restaurantAddress || order.restaurantCity) && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{[order.restaurantAddress, [order.restaurantZip, order.restaurantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{[order.restaurantPhone, order.restaurantEmail].filter(Boolean).join(" · ")}</div>

                  <div className="mt-4 pt-3 space-y-1" style={{ borderTop: "1px solid var(--border-muted)" }}>
                    <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Kvitto</span><span className="font-bold">#{order.orderNumber}</span></div>
                    <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Datum</span><span>{new Date(order.createdAt).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" })}</span></div>
                    <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Betalsätt</span><span>{paymentMethodLabel(order.paymentMethod)}</span></div>
                  </div>

                  <div className="mt-4 pt-3 space-y-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
                    {(order.items ?? []).map((it: any) => (
                      <div key={it.id} className="flex justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-gold-600 font-bold text-xs">{it.quantity}×</span> <span className="font-semibold">{it.productName}</span>
                          {Array.isArray(it.selectedExtras) && it.selectedExtras.length > 0 && (
                            <div className="pl-6 text-xs" style={{ color: "var(--text-secondary)" }}>{it.selectedExtras.map((e: any) => e.extraName || e.name).join(", ")}</div>
                          )}
                        </div>
                        <span className="font-semibold tabular-nums whitespace-nowrap">{Number(it.subtotal).toFixed(0)} kr</span>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const rawSubtotal = (order.items ?? []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
                    const tip = Number(order.tipAmount) || 0;
                    const deliveryFee = Number(order.deliveryFee) || 0;
                    const discount = Math.max(0, Math.round(rawSubtotal + deliveryFee - (order.total - tip)));
                    return (
                      <div className="mt-4 pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--border-muted)" }}>
                        <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Delsumma</span><span className="tabular-nums">{rawSubtotal.toFixed(0)} kr</span></div>
                        {discount > 0 && <div className="flex justify-between text-[13px] text-emerald-600"><span>{order.appliedDealTitle || "Rabatt"}</span><span className="tabular-nums">−{discount.toFixed(0)} kr</span></div>}
                        {deliveryFee > 0 && <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Leveransavgift</span><span className="tabular-nums">+{deliveryFee.toFixed(0)} kr</span></div>}
                        {tip > 0 && <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Dricks</span><span className="tabular-nums">+{tip.toFixed(0)} kr</span></div>}
                        <div className="flex justify-between items-baseline pt-2 mt-1" style={{ borderTop: "1px solid var(--border-muted)" }}>
                          <span className="font-bold">Totalt</span>
                          <span className="text-xl font-bold text-gold-600 tabular-nums">{order.total.toFixed(0)} kr</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="px-6 pt-2 sticky bottom-0" style={{ backgroundColor: "var(--bg-secondary)", borderTop: "1px solid var(--border-muted)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
                  <button
                    type="button"
                    onClick={downloadReceipt}
                    disabled={receiptDownloads >= RECEIPT_MAX_DOWNLOADS}
                    className="w-full py-3 rounded-full font-bold text-sm bg-gold-500 text-zinc-950 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {receiptDownloads >= RECEIPT_MAX_DOWNLOADS ? "Nedladdningsgräns nådd (2/2)" : `Ladda ner kvitto (${receiptDownloads}/${RECEIPT_MAX_DOWNLOADS})`}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lightbox: förstorat leveransfoto. */}
        <AnimatePresence>
          {proofZoom && order?.proofPhotoUrl && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[320] flex items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: "rgba(10,10,10,0.85)" }} onClick={() => setProofZoom(false)}>
              <button onClick={() => setProofZoom(false)} className="absolute top-5 right-5 text-white/90 p-2" aria-label="Stäng"><X size={26} /></button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} src={order.proofPhotoUrl} alt="Leveransfoto" className="max-h-[86vh] max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OrderStatusPage;
