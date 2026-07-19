"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Truck, Store, Loader2, Calendar, Phone, Mail, AlertCircle, ShieldCheck, ShoppingBag, MapPin, ArrowRight, Star, X, MessageSquare, ChevronDown, Navigation, Receipt, Download } from "lucide-react";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "@/lib/api";
import { cacheOrderDetail, getCachedOrderDetail } from "@/lib/offlineOrders";
import { getOrderAccessProof, isPushSupported, getPushPublicKey, subscribeOrderPush, hasOrderPush } from "@/lib/webPushClient";
import { addSkippedReviewOrderId, isReviewSkipped } from "@/lib/reviewPrompt";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import dynamic from "next/dynamic";
import { OrderTrackingCard } from "@/components/OrderTrackingCard";
import { forgetRawOrderAccessToken, readOrderHistory } from "@/lib/orderHistory";
import { ensureKioskAccess } from "@/lib/kioskAccessClient";
import {
  EMBED_PARENT_ORIGIN_PARAM,
  partnerOriginForRestaurant,
  readEmbedParentOrigin,
  trustedPartnerOrigin,
} from "@/lib/embedPartner";

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
const TERMINAL_STATUSES = ["DELIVERED", "COMPLETED", "CANCELLED", "REJECTED", "DELIVERY_FAILED"];
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
  return m || "-";
};

const formatSek = (value: unknown): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  const rounded = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded);
};

type ReceiptVatRow = { rate: number; vat: number };

const receiptVatRows = (order: any): ReceiptVatRow[] => {
  if (Array.isArray(order?.vatBreakdown)) {
    const rows = order.vatBreakdown
      .map((row: any) => ({ rate: Number(row?.rate), vat: Number(row?.vat) }))
      .filter((row: ReceiptVatRow) => Number.isFinite(row.rate) && Number.isFinite(row.vat) && row.vat > 0);
    if (rows.length > 0) return rows;
  }

  // Bakåtkompatibilitet för äldre orderdata som saknar serverns momssnapshot.
  const rate = Number(order?.restaurantVatPercent);
  const total = Math.max(0, Number(order?.total) || 0);
  const tip = Math.max(0, Number(order?.tipAmount) || 0);
  if (!Number.isFinite(rate) || rate <= 0 || total <= tip) return [];
  return [{ rate, vat: ((total - tip) * rate) / (100 + rate) }];
};

const authoritativeDiscount = (order: any, rawSubtotal: number): number => {
  const supplied = Number(order?.discountAmount);
  if (Number.isFinite(supplied) && supplied >= 0) return supplied;
  const deliveryFee = Number(order?.deliveryFee) || 0;
  const smallOrderFee = Number(order?.smallOrderFee) || 0;
  const tip = Number(order?.tipAmount) || 0;
  return Math.max(0, rawSubtotal + deliveryFee + smallOrderFee + tip - (Number(order?.total) || 0));
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
  const smallOrderFee = Number(order.smallOrderFee) || 0;
  const total = Number(order.total) || 0;
  const discount = authoritativeDiscount(order, rawSubtotal);
  const vatRows = receiptVatRows(order);
  const created = order.createdAt ? new Date(order.createdAt) : new Date();
  const dateStr = created.toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" });
  const legalName = order.restaurantLegalName || order.restaurantName || "Restaurang";
  const addressLine = [order.restaurantAddress, [order.restaurantZip, order.restaurantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const row = (label: string, value: string, opts?: { strong?: boolean; muted?: boolean; accent?: boolean }) =>
    `<div style="display:flex;justify-content:space-between;gap:16px;padding:${opts?.strong ? "10px 0 0" : "3px 0"};${opts?.strong ? "border-top:1px solid #e7e3da;margin-top:8px;" : ""}">
      <span style="${opts?.strong ? "font-weight:700;font-size:15px;" : "font-size:13px;"}color:${opts?.accent ? "#F0531C" : opts?.muted ? "#6b6b70" : "#111113"};">${escapeHtml(label)}</span>
      <span style="${opts?.strong ? "font-weight:700;font-size:18px;color:#F0531C;" : "font-size:13px;color:#111113;"}font-variant-numeric:tabular-nums;">${escapeHtml(value)}</span>
    </div>`;

  const itemsHtml = items.map((it) => {
    const extras = Array.isArray(it.selectedExtras) ? it.selectedExtras : [];
    const extrasHtml = extras.length
      ? `<div style="padding-left:22px;color:#6b6b70;font-size:12px;">${extras.map((e: any) => escapeHtml(e.extraName || e.name)).join("<br/>")}</div>`
      : "";
    const noteHtml = it.note ? `<div style="padding-left:22px;color:#6b6b70;font-size:12px;font-style:italic;">${escapeHtml(it.note)}</div>` : "";
    return `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:10px;">
      <div style="flex:1;min-width:0;">
        <div><span style="color:#F0531C;font-weight:700;font-size:12px;">${escapeHtml(it.quantity)}×</span> <span style="font-weight:600;font-size:14px;">${escapeHtml(it.productName)}</span></div>
        ${extrasHtml}${noteHtml}
      </div>
      <div style="font-weight:600;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(formatSek(it.subtotal))} kr</div>
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
        ${row("Delsumma", formatSek(rawSubtotal) + " kr", { muted: true })}
        ${discount > 0 ? row(order.appliedDealTitle || "Rabatt", "−" + formatSek(discount) + " kr", { accent: true }) : ""}
        ${deliveryFee > 0 ? row("Leveransavgift", "+" + formatSek(deliveryFee) + " kr", { muted: true }) : ""}
        ${smallOrderFee > 0 ? row("Avgift för liten beställning", "+" + formatSek(smallOrderFee) + " kr", { muted: true }) : ""}
        ${tip > 0 ? row("Dricks", "+" + formatSek(tip) + " kr", { muted: true }) : ""}
        ${vatRows.map((vat) => row(`Varav moms ${formatSek(vat.rate)} %`, formatSek(vat.vat) + " kr", { muted: true })).join("")}
        ${row("Totalt", formatSek(total) + " kr", { strong: true })}
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
  const [embedMode, setEmbedMode] = useState(false);
  const [embedRestaurant, setEmbedRestaurant] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embedded = params.get("embed") === "1";
    const restaurantSlug = params.get("restaurant") || "";
    setEmbedMode(embedded);
    setEmbedRestaurant(restaurantSlug);

    // Mollie eller en gammal cachad klient kan landa på embed-trackingen som
    // en top-level ViaEats-sida. För en registrerad partner återställs då
    // restaurangens skal, som i sin tur laddar ordern i iframe:n.
    if (embedded && window.parent === window && orderId) {
      const partnerOrigin =
        trustedPartnerOrigin(params.get(EMBED_PARENT_ORIGIN_PARAM)) ||
        readEmbedParentOrigin() ||
        partnerOriginForRestaurant(restaurantSlug);
      if (partnerOrigin) {
        const partnerReturn = new URL("/meny.html", partnerOrigin);
        partnerReturn.searchParams.set("order", orderId);
        partnerReturn.searchParams.set("restaurant", restaurantSlug);
        window.location.replace(partnerReturn.toString());
      }
    }
  }, [orderId]);
  const embedMenuHref = embedRestaurant ? `/embed/${encodeURIComponent(embedRestaurant)}` : "/";
  const embedOrdersHref = embedRestaurant
    ? `/orders?embed=1&restaurant=${encodeURIComponent(embedRestaurant)}`
    : "/orders";
  const [accessBootstrapReady, setAccessBootstrapReady] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // fetchError skiljer på "backend säger 404 — order finns verkligen inte"
  // (visa not-found-vy) och "fetch failade — nätverk/timeout/500" (visa
  // retry-vy). Tidigare gav båda samma "Order ej hittad"-skärm vilket är
  // skrämmande precis efter en Klarna-betalning på dåligt nät.
  const [fetchError, setFetchError] = useState<"not-found" | "network" | null>(null);
  const socketRef = useRef<any>(null);
  const [etaLeft, setEtaLeft] = useState<number | null>(null);
  // Sekund-tick för live-nedräkning av leveransen när budet är på väg.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // Budets live-position (endast vi-levererar; broadcastas via socket vid hämtad).
  const [courierPos, setCourierPos] = useState<{ lat: number; lng: number } | null>(null);
  // Retractable sektioner — kompakta tills man klickar (kund ser totalt /
  // hanteringsrubriken direkt, expanderar för fullständig info).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [handlingOpen, setHandlingOpen] = useState(false);
  // Recensionen visas numera inline (mellan status och detaljer), inte som
  // popup. reviewDismissed låter kunden stänga den utan att se den igen.
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [likedItemIds, setLikedItemIds] = useState<string[]>([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  // Bekräftelsetext efter inskickad recension.
  const [reviewRewardText, setReviewRewardText] = useState<string | null>(null);
  // Kvitto-modal + nedladdningsräknare (max 2 ggr per order, lokalt).
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptDownloads, setReceiptDownloads] = useState(0);
  // Förstora leveransfotot.
  const [proofZoom, setProofZoom] = useState(false);
  const [trackingSheetExpanded, setTrackingSheetExpanded] = useState(false);
  const [trackingSheetDragStartY, setTrackingSheetDragStartY] = useState<number | null>(null);
  const [trackingSheetDragOffsetY, setTrackingSheetDragOffsetY] = useState(0);
  const trackingSheetDragActiveRef = useRef(false);
  // Web push: visas bara när webbläsaren stödjer push OCH servern har VAPID-
  // nycklar (annars null → raden renderas inte alls).
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let exchangeToken: string | null = null;

    // Migration recovery for installations created before the HttpOnly flow.
    // URL tokens are never read; same-origin storage is exchanged once,
    // atomically consumed by the API, and then erased.
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("pending_order_id") === orderId) {
          exchangeToken = localStorage.getItem("pending_order_token");
        }
        if (!exchangeToken && localStorage.getItem("viaeats_active_order_id") === orderId) {
          exchangeToken = localStorage.getItem("viaeats_active_order_token");
        }
        if (!exchangeToken) {
          exchangeToken = readOrderHistory().find((item) => item.id === orderId)?.accessToken || null;
        }
      } catch {
        exchangeToken = null;
      }
    }

    const bootstrap = async () => {
      const search = new URLSearchParams(window.location.search);
      const embeddedRestaurant = search.get("embed") === "1" ? search.get("restaurant") || "" : "";
      if (embeddedRestaurant) {
        await ensureKioskAccess(embeddedRestaurant);
      }
      if (exchangeToken) {
        try {
          await axios.post(`/api/platform/orders/${orderId}/session`, {
            accessToken: exchangeToken,
          });
          forgetRawOrderAccessToken(orderId);
        } catch {
          // Continue to the normal GET. It may still succeed through an
          // account session or a cookie already established at checkout.
        }
      }
      if (active) setAccessBootstrapReady(true);
    };
    void bootstrap();
    return () => { active = false; };
  }, [orderId]);
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
    if (!orderId || !accessBootstrapReady) return;
    try {
      // Använd web-proxyn så inloggade kunder får platform_session-cookien
      // eller den orderspecifika HttpOnly-cookien vidarebefordrad. Inget
      // kundbevis hamnar i URL, localStorage eller frontend-state.
      const res = await axios.get(`/api/platform/orders/${orderId}`, { withCredentials: true });
      // Backend är sanningen för tracking. Admin/testflöden kan flytta en order
      // bakåt mellan statusar, så kundvyn får inte låsa fast sig i DELIVERED.
      setOrder(res.data);
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
  }, [orderId, accessBootstrapReady]);

  useEffect(() => {
    if (!orderId || !accessBootstrapReady) return;
    fetchOrder();
    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    // Bakgrunds-polling (socket reconnect + interval) ska INTE flippa error-
    // state om vi redan har order laddad — bara visa stale data tyst tills
    // backend svarar igen. Annars börjar UI:n blinka "nätverksfel" varje 15s
    // på ostabilt nät, trots att vi har en cachad order.
    socket.on("connect", async () => {
      fetchOrder({ silent: true });
      const proof = await getOrderAccessProof(orderId);
      if (socket.connected && proof) socket.emit("join:order", { orderId, proof });
    });
    socket.on("order:status", (data: any) => {
      if (data.orderId === orderId) {
        setOrder((prev: any) => {
          if (!prev) return prev;
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
  }, [orderId, accessBootstrapReady, fetchOrder]);

  // ETA Countdown — in seconds for real-time display
  useEffect(() => {
    if (!order?.status || ['AWAITING_PAYMENT', 'PENDING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(order.status)) { setEtaLeft(null); return; }
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

  // Tickar varje sekund så leverans-nedräkningen (budet på väg) rör sig live.
  useEffect(() => {
    if (!order?.status || ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(order.status)) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [order?.status]);

  // Recensionen visas inline (mellan status och detaljer) så fort ordern är
  // levererad och inte redan betygsatt. Läs in ev. tidigare "stäng"-val så
  // kunden inte ser den igen efter att ha stängt den (per session).
  useEffect(() => {
    if (!order?.id || typeof window === "undefined") return;
    // Delad skip-lista (viaeats.skippedReviewOrderIds) — samma nyckel som
    // Swift-appen och hemskärmens prompt, så en skippad order inte frågar igen.
    if (isReviewSkipped(order.id)) setReviewDismissed(true);
  }, [order?.id]);

  // Skippa recensionen och kom ihåg valet för denna order.
  const dismissReview = useCallback(() => {
    setReviewDismissed(true);
    if (order?.id) addSkippedReviewOrderId(order.id);
  }, [order?.id]);

  const submitReview = async () => {
    if (!reviewRating || !orderId) return;
    setReviewSubmitting(true);
    try {
      // Backend kräver konto- eller ordersession via webbproxyn.
      const body: any = { rating: reviewRating, review: reviewText, likedItemIds };
      await axios.post(`/api/platform/orders/${orderId}/review`, body);
      setReviewRewardText("Tack för din recension.");
      setReviewDone(true);
      setOrder((prev: any) => prev ? { ...prev, rating: reviewRating } : prev);
    } catch (err: any) {
      alert(err.response?.data?.error || t('order.review.errorGeneric'));
    } finally {
      setReviewSubmitting(false);
    }
  };

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
            href={embedMode ? embedOrdersHref : "/orders"}
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
          <Link href={embedMode ? embedMenuHref : "/"} className="mt-8 px-8 py-4 bg-gold-500 text-zinc-950 rounded-full font-bold text-sm">{t("order.error.notFoundCta")}</Link>
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

  // ── ETA / leveranstid ──────────────────────────────────────────────────
  // Perspektiv:
  //  • Vi-levererar (selfDelivery=false): restaurangens tid = tills maten är
  //    klar att HÄMTAS av budet. Efter hämtning (DELIVERING) byter vi till en
  //    egen uppskattning (15-30 min) baserad på avstånd + budets orderantal.
  //  • Levererar-själva (selfDelivery=true): restaurangens tid = tills maten
  //    är klar OCH levererad till kunden.
  const isWeDeliver = order.type === "DELIVERY" && !order.selfDelivery;
  const courierEnRoute = ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"].includes(currentStatus) && isWeDeliver;
  const beforePickup = !isCompleted && !isRejected && !courierEnRoute;

  // Fågelvägsavstånd restaurang -> kund (km).
  const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  const distanceKm =
    typeof order.restaurantLat === "number" && typeof order.restaurantLng === "number" &&
    typeof order.deliveryLatitude === "number" && typeof order.deliveryLongitude === "number"
      ? haversineKm(order.restaurantLat, order.restaurantLng, order.deliveryLatitude, order.deliveryLongitude)
      : null;

  // Uppskattat leveransspann efter hämtning: bas 15 min + ~3 min/km + ~4 min
  // per extra samtidig order budet kör. Klampas till 15-30 min.
  const courierLoad = typeof order.courierActiveOrders === "number" && Number.isFinite(order.courierActiveOrders) ? order.courierActiveOrders : 1;
  const loadExtra = courierLoad > 1 ? (courierLoad - 1) * 4 : 0;
  const distExtra = Number.isFinite(distanceKm) ? Math.round(Number(distanceKm) * 3) : 5;
  const deliveryEtaMin = Math.max(15, Math.min(30, 15 + distExtra + loadExtra));
  // "Hög väntetid": nära taket eller många stopp -> visa mjuk disclaimer.
  const deliveryBusy = deliveryEtaMin >= 25 || courierLoad >= 3;
  // Live-nedräkning under leverans: mål = hämtningstid + uppskattning. När
  // tiden passerar lägger vi på 10-15 min buffert och flaggar hög belastning.
  const DELIVERY_OVERDUE_BUFFER_MIN = 12;
  const deliveringAtMs = order.deliveringAt ? new Date(order.deliveringAt).getTime() : null;
  const etaTargetMs = order.etaEndsAt
    ? new Date(order.etaEndsAt).getTime()
    : deliveringAtMs
      ? deliveringAtMs + deliveryEtaMin * 60000
      : null;
  const liveEtaSecondsLeft = etaTargetMs && Number.isFinite(etaTargetMs)
    ? Math.max(0, Math.ceil((etaTargetMs - nowMs) / 1000))
    : null;
  let deliverySecondsLeft: number | null = null;
  let deliveryOverdue = false;
  if (courierEnRoute && etaTargetMs && Number.isFinite(etaTargetMs)) {
    const baseTarget = etaTargetMs;
    let target = baseTarget;
    if (nowMs >= baseTarget) { target = baseTarget + DELIVERY_OVERDUE_BUFFER_MIN * 60000; deliveryOverdue = true; }
    deliverySecondsLeft = Math.max(0, Math.round((target - nowMs) / 1000));
  }
  // Inline-recension: visas när ordern är levererad, ej betygsatt och ej stängd.
  const showInlineReview = isCompleted && !order.rating && !reviewDone && !reviewDismissed;
  const isPickup = order.type !== "DELIVERY";
  const isSelf = order.type === "DELIVERY" && !!order.selfDelivery;
  const isOnWay = ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"].includes(currentStatus);
  const isGreenStatus = isPickup ? (currentStatus === "READY" || isCompleted) : (isCompleted || isOnWay);
  const statusTone = isRejected ? "red" : isGreenStatus ? "green" : ["PREPARING", "READY"].includes(currentStatus) ? "yellow" : "orange";
  const statusAccent = statusTone === "red" ? "#C0392B" : statusTone === "green" ? "#2E7D4F" : statusTone === "yellow" ? "#E1A70D" : "#F0531C";
  const statusAccentInk = statusTone === "red" ? "#9A2A1F" : statusTone === "green" ? "#1F6B41" : statusTone === "yellow" ? "#8A5B00" : "#B23C12";
  const statusSoft = statusTone === "red" ? "#FCEBE9" : statusTone === "green" ? "#EAF7EF" : statusTone === "yellow" ? "#FFF7DB" : "#FFF0EA";
  const restName = order.restaurantName || "Restaurang";
  const cancelledCopy = (() => {
    switch (currentStatus) {
      case "REJECTED":
        return {
          title: "Restaurangen avböjde",
          sub: "Order avböjd",
          main: "Avböjd",
          description: `${restName} kunde tyvärr inte ta emot beställningen. Du har inte blivit debiterad.`,
        };
      case "DELIVERY_FAILED":
        return {
          title: "Leverans misslyckades",
          sub: "Leverans misslyckades",
          main: "Misslyckad",
          description: "Leveransen kunde inte slutföras. Kontakta support om betalningen behöver följas upp.",
        };
      default:
        return {
          title: "Ordern avbröts",
          sub: "Order avbruten",
          main: "Avbruten",
          description: "Beställningen avbröts. Du har inte blivit debiterad.",
        };
    }
  })();
  const restAddr = [order.restaurantAddress, [order.restaurantZip, order.restaurantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const custAddr = [order.deliveryStreet, [order.deliveryZip, order.deliveryCity || order.restaurantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const orderNo = order.orderNumber ? `#${order.orderNumber}` : `#${String(order.id || "").slice(-6).toUpperCase()}`;
  const hasRestCoords = typeof order.restaurantLat === "number" && typeof order.restaurantLng === "number";
  const hasCustomerCoords = typeof order.deliveryLatitude === "number" && typeof order.deliveryLongitude === "number";
  const showMapFullscreen = order.type === "DELIVERY" && !isSelf && !isRejected && isOnWay && !isCompleted && hasRestCoords && hasCustomerCoords;
  const activeStep = isCompleted ? stepDefs.length - 1 : Math.max(0, currentIdx);
  const progressRatio = isCompleted ? 1 : Math.max(0.22, Math.min(1, (activeStep + 1) / stepDefs.length));
  const etaMinutes = courierEnRoute
    ? liveEtaSecondsLeft != null
      ? Math.ceil(liveEtaSecondsLeft / 60)
      : deliveryEtaMin
    : etaLeft != null
      ? Math.ceil(etaLeft / 60)
      : ['ACCEPTED', 'PREPARING', 'READY'].includes(currentStatus)
        ? Number(order.estimatedTime || 0) || null
        : null;
  const awaitingAccept = !isCompleted && !isRejected && !order.scheduledFor && !etaMinutes;
  const etaSub = isRejected
    ? cancelledCopy.sub
    : isCompleted
      ? "Status"
      : awaitingAccept
        ? "Inväntar restaurang"
        : order.scheduledFor
          ? "Schemalagd tid"
          : isPickup
            ? currentStatus === "READY" ? "Redo att hämtas" : "Klar om ca"
            : courierEnRoute
              ? "Framme om ca"
              : "Klar om ca";
  const etaMain = isRejected
    ? cancelledCopy.main
    : isCompleted
      ? isPickup ? "hämtad" : "klart"
      : awaitingAccept
        ? "tills de accepterar"
        : order.scheduledFor
          ? new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
          : etaMinutes != null && etaMinutes <= 0
            ? "snart"
            : etaMinutes != null
              ? `${etaMinutes} min`
              : "tills de accepterar";
  const mapEtaMin = etaMinutes != null && Number.isFinite(etaMinutes) ? etaMinutes : Number.isFinite(deliveryEtaMin) ? deliveryEtaMin : 15;
  const formatLiveEta = (seconds: number | null) => {
    if (seconds == null) return mapEtaMin <= 0 ? "snart" : `${mapEtaMin} min`;
    if (seconds <= 0) return "snart";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };
  const fullscreenEtaSub = showMapFullscreen ? "Framme om ca" : etaSub;
  const fullscreenEtaMain = showMapFullscreen ? formatLiveEta(liveEtaSecondsLeft) : etaMain;
  const statusTitle = isRejected
    ? cancelledCopy.title
    : isCompleted
      ? isPickup ? "Hämtad" : "Levererad"
      : isPickup && currentStatus === "READY"
        ? "Redo att hämtas"
        : isOnWay
          ? "På väg"
          : currentStatus === "PREPARING"
            ? "Tillagas"
            : currentStatus === "ACCEPTED"
              ? "Mottagen"
              : "Skickad";
  const statusDescription = isRejected
    ? cancelledCopy.description
    : isSelf && isOnWay
      ? `${restName} levererar själva och är på väg med din mat.`
      : isSelf
      ? `${restName} levererar själva. Ingen live-karta eller bud att följa för det här stället.`
      : courierEnRoute
        ? (deliveryOverdue ? t("order.eta.overdueBusy") : "Tillagad · ditt bud är på väg")
        : isPickup && currentStatus === "READY"
          ? "Visa ordernumret i restaurangen när du hämtar."
          : statusDesc(currentStatus);

  const TrackingLineWeb = ({ pickupReady = false }: { pickupReady?: boolean }) => {
    const labels = isPickup
      ? ["Mottagen", "Tillagas", "Redo"]
      : ["Mottagen", "Tillagas", isCompleted ? "Levererad" : "På väg"];
    const selected = pickupReady ? labels.length - 1 : Math.min(labels.length - 1, activeStep);
    const lineProgress = isCompleted || pickupReady ? 1 : Math.max(0.18, Math.min(1, (selected + 1) / labels.length));
    return (
      <div className="mt-6 w-full">
        <div className="relative h-[9px] overflow-hidden rounded-full" style={{ backgroundColor: isGreenStatus || pickupReady ? "#EAF7EF" : statusTone === "yellow" ? "#FFF7DB" : "#F0F0EC" }}>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.round(lineProgress * 100)}%`, backgroundColor: isGreenStatus || pickupReady ? "#2E7D4F" : statusAccent }} />
        </div>
        <div className="mt-2.5 flex justify-between gap-2">
          {labels.map((label, index) => (
            <span
              key={label}
              className="flex-1 truncate text-[11.5px] font-semibold"
              style={{
                textAlign: index === 0 ? "left" : index === labels.length - 1 ? "right" : "center",
                color: index === selected ? (isGreenStatus || pickupReady ? "#1F6B41" : statusAccentInk) : index < selected ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const ContactActionsWeb = ({ primaryLabel = "Kontakta restaurang" }: { primaryLabel?: string }) => (
    <div className="mt-3.5 flex gap-2.5">
      {order.restaurantPhone ? (
        <a
          href={`tel:${String(order.restaurantPhone).replace(/\s+/g, "")}`}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] border bg-white text-[14.5px] font-bold active:opacity-70"
          style={{ borderColor: "rgba(17,17,19,0.12)", color: "var(--text-primary)" }}
        >
          <Phone size={18} />
          {primaryLabel}
        </a>
      ) : null}
      {isPickup ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restAddr || restName)}`}
          target="_blank"
          rel="noreferrer"
          className="grid h-[52px] w-14 place-items-center rounded-[14px] text-white shadow-lg active:opacity-80"
          style={{ backgroundColor: statusAccent, boxShadow: `0 8px 18px color-mix(in srgb, ${statusAccent} 28%, transparent)` }}
        >
          <Navigation size={20} />
        </a>
      ) : null}
    </div>
  );

  const DestRowWeb = ({ mini, main, sub, icon: Icon, call, sep }: { mini: string; main: string; sub?: string; icon: any; call?: boolean; sep?: boolean }) => (
    <div className="flex items-center gap-3 px-3.5 py-3.5" style={{ borderTop: sep ? "1px solid rgba(17,17,19,0.08)" : "0" }}>
      <Icon size={21} style={{ color: "#F0531C" }} />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.04em]" style={{ color: "var(--text-secondary)" }}>{mini}</p>
        <p className="mt-0.5 truncate text-[14.5px] font-bold" style={{ color: "var(--text-primary)" }}>{main}</p>
        {sub ? <p className="mt-0.5 line-clamp-2 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{sub}</p> : null}
      </div>
      {call && order.restaurantPhone ? (
        <a href={`tel:${String(order.restaurantPhone).replace(/\s+/g, "")}`} className="grid h-9 w-9 place-items-center rounded-full" style={{ color: "var(--text-primary)" }}>
          <Phone size={17} />
        </a>
      ) : null}
    </div>
  );

  const rawSubtotal = (order.items ?? []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const smallOrderFee = Number(order.smallOrderFee || 0);
  const tipAmount = Number(order.tipAmount || 0);
  const discount = authoritativeDiscount(order, rawSubtotal);
  const vatRows = receiptVatRows(order);
  const paymentLabel = order.paymentMethod === "ONLINE" ? "Betalt med Apple Pay" : order.paymentMethod ? `Betalt med ${order.paymentMethod}` : "Betalning registrerad";
  const sheetDragOffsetFromDelta = (delta: number, expanded: boolean) => {
    return expanded
      ? Math.max(0, Math.min(360, delta))
      : Math.min(0, Math.max(-360, delta));
  };

  const finishSheetDragDelta = (delta: number) => {
    setTrackingSheetDragStartY(null);
    setTrackingSheetDragOffsetY(0);
    if (delta < -36) setTrackingSheetExpanded(true);
    else if (delta > 36) setTrackingSheetExpanded(false);
    else setTrackingSheetExpanded((v) => !v);
  };

  const startSheetDrag = (clientY: number) => {
    if (trackingSheetDragActiveRef.current) return;
    trackingSheetDragActiveRef.current = true;
    const startY = clientY;
    const expandedAtStart = trackingSheetExpanded;
    setTrackingSheetDragStartY(startY);
    setTrackingSheetDragOffsetY(0);

    const eventY = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if ("touches" in event && event.touches?.[0]) return event.touches[0].clientY;
      if ("changedTouches" in event && event.changedTouches?.[0]) return event.changedTouches[0].clientY;
      return (event as MouseEvent | PointerEvent).clientY;
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
      trackingSheetDragActiveRef.current = false;
    };
    const onMove = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if ("touches" in event) event.preventDefault();
      const delta = eventY(event) - startY;
      setTrackingSheetDragOffsetY(sheetDragOffsetFromDelta(delta, expandedAtStart));
    };
    const onEnd = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const delta = eventY(event) - startY;
      cleanup();
      finishSheetDragDelta(delta);
    };
    const onCancel = () => {
      cleanup();
      setTrackingSheetDragStartY(null);
      setTrackingSheetDragOffsetY(0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onCancel);
  };

  const OrderInfoOverlayWeb = (
    <AnimatePresence>
      {showReceipt ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1900] overflow-y-auto"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div className="mx-auto min-h-[100dvh] max-w-md px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
            <div className="flex items-center gap-3 pb-4">
              <button type="button" onClick={() => setShowReceipt(false)} className="grid h-10 w-10 place-items-center rounded-full" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}>
                <ArrowRight size={18} className="rotate-180" />
              </button>
              <h2 className="text-[22px] font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Orderinfo</h2>
            </div>

            <div className="rounded-[18px] border bg-white p-3.5 shadow-sm" style={{ borderColor: "rgba(17,17,19,0.07)" }}>
              <div className="flex items-center gap-3.5">
                <div className="grid h-[54px] w-[54px] place-items-center rounded-[14px]" style={{ backgroundColor: "var(--bg-deep)", color: "#F0531C" }}>
                  <Store size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{restName}</p>
                  <p className="mt-0.5 truncate text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Order {orderNo}</p>
                </div>
                <ChevronDown size={20} className="-rotate-90" style={{ color: "#C2C2C6" }} />
              </div>
            </div>

            <p className="px-0.5 pb-2 pt-5 text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--text-secondary)" }}>Din beställning</p>
            <div className="rounded-[18px] border bg-white px-4 shadow-sm" style={{ borderColor: "rgba(17,17,19,0.07)" }}>
              {(order.items ?? []).map((item: any, index: number) => (
                <div key={`${item.id || item.productId || item.productName}-${index}`} className="flex items-baseline gap-2.5 py-3.5" style={{ borderTop: index > 0 ? "1px solid rgba(17,17,19,0.07)" : "0" }}>
                  <span className="text-[13.5px] font-black" style={{ color: "#F0531C" }}>{item.quantity || 1}x</span>
                  <span className="min-w-0 flex-1 text-[14.5px] font-bold leading-5" style={{ color: "var(--text-primary)" }}>{item.productName || item.name}</span>
                  <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatSek(item.subtotal)} kr</span>
                </div>
              ))}
            </div>

            <p className="px-0.5 pb-2 pt-5 text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--text-secondary)" }}>Kvitto</p>
            <div className="space-y-1.5 px-0.5">
              <div className="flex justify-between py-1 text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}><span>Delsumma</span><span className="tabular-nums">{formatSek(rawSubtotal)} kr</span></div>
              {order.type === "DELIVERY" ? <div className="flex justify-between py-1 text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}><span>Leverans</span><span className="tabular-nums">{deliveryFee > 0 ? `${formatSek(deliveryFee)} kr` : "Fri"}</span></div> : null}
              {smallOrderFee > 0 ? <div className="flex justify-between py-1 text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}><span>Avgift för liten beställning</span><span className="tabular-nums">+{formatSek(smallOrderFee)} kr</span></div> : null}
              {tipAmount > 0 ? <div className="flex justify-between py-1 text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}><span>Dricks</span><span className="tabular-nums">+{formatSek(tipAmount)} kr</span></div> : null}
              {discount > 0 ? <div className="flex justify-between py-1 text-[13.5px] font-semibold text-emerald-600"><span>Rabatt</span><span className="tabular-nums">-{formatSek(discount)} kr</span></div> : null}
              {vatRows.map((vat) => <div key={vat.rate} className="flex justify-between py-1 text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}><span>Varav moms ({formatSek(vat.rate)} %)</span><span className="tabular-nums">{formatSek(vat.vat)} kr</span></div>)}
              <div className="mt-2 flex items-baseline justify-between border-t pt-3" style={{ borderColor: "rgba(17,17,19,0.12)" }}>
                <span className="text-[16px] font-black" style={{ color: "var(--text-primary)" }}>Totalt</span>
                <span className="text-[21px] font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{formatSek(order.total)} kr</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                <ShoppingBag size={14} /> {paymentLabel}
              </div>
              <button
                type="button"
                onClick={downloadReceipt}
                disabled={receiptDownloads >= RECEIPT_MAX_DOWNLOADS}
                className="mt-3 flex h-12 w-full items-center gap-2.5 rounded-[13px] border bg-white px-4 text-[14px] font-bold disabled:opacity-50"
                style={{ borderColor: "var(--border-muted)", color: "var(--text-primary)" }}
              >
                <Download size={18} />
                {receiptDownloads >= RECEIPT_MAX_DOWNLOADS ? "Kvitto nedladdat" : "Ladda ner kvitto"}
                <span className="ml-auto text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {receiptDownloads >= RECEIPT_MAX_DOWNLOADS ? "Max nått" : `HTML · ${RECEIPT_MAX_DOWNLOADS - receiptDownloads} kvar`}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (showMapFullscreen) {
    return (
      <div className="relative isolate min-h-[100dvh] overflow-hidden bg-white">
        <div className="absolute inset-x-0 top-0 z-0 h-[47dvh] min-h-[330px] isolate overflow-hidden" style={{ backgroundColor: "#E7EAE6" }}>
          <CourierTrackingMap
            pickup={{ lat: order.restaurantLat, lng: order.restaurantLng }}
            dropoff={{ lat: order.deliveryLatitude, lng: order.deliveryLongitude }}
            courier={courierPos}
            accentColor={statusAccent}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/80 via-white/20 to-transparent" />
        </div>
        <Link href={embedMode ? embedMenuHref : "/"} aria-label="Till menyn" className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+16px)] z-[1600] grid h-11 w-11 place-items-center rounded-full border bg-white shadow-lg" style={{ borderColor: "rgba(17,17,19,0.10)", color: "var(--text-primary)" }}>
          <ArrowRight size={18} className="rotate-180" />
        </Link>
        <section
          className={`absolute inset-x-0 bottom-0 z-[1500] overflow-hidden rounded-t-[32px] border-t bg-white shadow-2xl transition-[top] duration-300 ease-out ${trackingSheetExpanded ? "top-[calc(env(safe-area-inset-top,0px)+14px)]" : "top-[calc(47dvh-28px)]"}`}
          style={{
            borderColor: "rgba(17,17,19,0.08)",
            boxShadow: "0 -12px 34px rgba(17,17,19,0.16)",
            transform: trackingSheetDragOffsetY ? `translate3d(0, ${trackingSheetDragOffsetY}px, 0)` : undefined,
            transition: trackingSheetDragStartY == null ? undefined : "none",
          }}
        >
          <button
            type="button"
            className="flex w-full touch-none select-none justify-center pb-3 pt-4"
            aria-label={trackingSheetExpanded ? "Dra ner orderpanelen" : "Dra upp orderpanelen"}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
              startSheetDrag(e.clientY);
            }}
            onMouseDown={(e) => startSheetDrag(e.clientY)}
            onTouchStart={(e) => startSheetDrag(e.touches[0]?.clientY ?? 0)}
          >
            <div className="h-[5px] w-12 rounded-full bg-[#D6D6D2]" />
          </button>
          <div className="px-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.09em]" style={{ color: "var(--text-secondary)" }}>ORDER {order.orderNumber ? `#${order.orderNumber}` : ""}</p>
                <h1 className="mt-0.5 text-[22px] font-black tracking-tight" style={{ color: isGreenStatus ? "#2E7D4F" : "var(--text-primary)" }}>{statusTitle}</h1>
                <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>{statusDescription}</p>
              </div>
              <div className="text-right">
                <button type="button" onClick={() => setShowReceipt(true)} className="mb-1 text-[11.5px] font-bold" style={{ color: statusAccentInk }}>Orderinfo & kvitto ›</button>
                <p className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>{fullscreenEtaSub}</p>
                <p className="text-[24px] font-black tracking-tight" style={{ color: isGreenStatus ? "#2E7D4F" : "var(--text-primary)" }}>{fullscreenEtaMain}</p>
              </div>
            </div>
            <TrackingLineWeb />
            <div className="mt-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusAccent }} />
              <p className="text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {deliveryOverdue ? t("order.eta.overdueBusy") : isGreenStatus ? statusDescription : "Tillagad · ditt bud är på väg"}
              </p>
            </div>
            <ContactActionsWeb />
          </div>
          <div className="h-[calc(100%-250px)] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
            <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "rgba(17,17,19,0.08)" }}>
              <DestRowWeb mini="Levereras till" main={custAddr || restName} icon={MapPin} />
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "rgba(17,17,19,0.08)" }}>
              <DestRowWeb mini="Restaurang" main={restName} sub={restAddr} icon={Store} call />
            </div>
          </div>
        </section>
        {OrderInfoOverlayWeb}
      </div>
    );
  }

  const StatusCard = () => (
    <div className="mt-4 rounded-[24px] border bg-white px-6 py-7 text-center shadow-xl" style={{ borderColor: isGreenStatus ? "rgba(46,125,79,0.22)" : "rgba(17,17,19,0.07)", boxShadow: "0 14px 28px rgba(17,17,19,0.10)" }}>
      <div className="mx-auto inline-flex items-center gap-2 rounded-full px-3.5 py-2" style={{ backgroundColor: statusSoft }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusAccent }} />
        <span className="text-[11px] font-black uppercase tracking-[0.07em]" style={{ color: statusAccentInk }}>{isPickup ? "AVHÄMTNING" : statusTitle.toUpperCase()}</span>
      </div>
      <p className="mt-4 text-[clamp(30px,12vw,50px)] font-black leading-none tracking-tight" style={{ color: isRejected ? "#C0392B" : isGreenStatus ? "#2E7D4F" : "var(--text-primary)" }}>
        {isRejected || awaitingAccept || isCompleted || order.scheduledFor ? etaMain : `ca ${etaMain}`}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] font-medium leading-5" style={{ color: "var(--text-secondary)" }}>{statusDescription}</p>
    </div>
  );

  const PickupReadyCard = () => (
    <div className="mt-4 overflow-hidden rounded-[24px] border bg-white shadow-xl" style={{ borderColor: "rgba(17,17,19,0.06)", boxShadow: "0 14px 30px rgba(17,17,19,0.11)" }}>
      <div className="relative overflow-hidden bg-[#2E7D4F] p-[22px] text-white">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
        <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-white" />
          <span className="text-[11px] font-black uppercase tracking-[0.07em]">REDO ATT HÄMTAS</span>
        </div>
        <h2 className="mt-4 text-[38px] font-black tracking-tight">Din mat väntar</h2>
        <p className="mt-1.5 text-[13.5px] font-medium leading-5 text-white/85">Visa ordernumret i restaurangen när du hämtar.</p>
      </div>
      <div className="p-[18px]">
        <div className="flex items-center gap-3">
          <MapPin size={22} style={{ color: "#2E7D4F" }} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{restName}</p>
            <p className="mt-0.5 line-clamp-2 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>{restAddr}</p>
          </div>
        </div>
        <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(17,17,19,0.07)" }}>
          <TrackingLineWeb pickupReady />
        </div>
      </div>
    </div>
  );

  const CompletedReviewCard = () => (
    <div className="mt-4 rounded-[24px] border bg-white p-5 text-center shadow-xl" style={{ borderColor: order.rating || reviewDone ? "rgba(46,125,79,0.26)" : "rgba(240,83,28,0.24)", boxShadow: "0 14px 28px rgba(17,17,19,0.10)" }}>
      {order.rating || reviewDone ? (
        <>
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[#EAF7EF] text-[#2E7D4F]"><ShieldCheck size={34} /></div>
          <p className="text-[30px] font-black" style={{ color: "#2E7D4F" }}>Klart</p>
          <p className="mt-2 text-[20px] font-black" style={{ color: "var(--text-primary)" }}>Tack för att du väljer ViaEats</p>
          {reviewRewardText && (
            <p className="mt-2 text-[15px] font-black" style={{ color: "#F0531C" }}>{reviewRewardText}</p>
          )}
        </>
      ) : reviewDismissed ? (
        <>
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[#EAF7EF] text-[#2E7D4F]"><ShieldCheck size={34} /></div>
          <p className="text-[30px] font-black" style={{ color: "#2E7D4F" }}>Levererad</p>
          <p className="mt-2 text-[20px] font-black" style={{ color: "var(--text-primary)" }}>Tack för att du väljer ViaEats</p>
        </>
      ) : (
        <>
          <p className="text-left text-[11px] font-black uppercase tracking-[0.09em]" style={{ color: "#2E7D4F" }}>LEVERERAD</p>
          <h2 className="mt-1 text-left text-[24px] font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Betygsätt ordern</h2>
          <div className="my-4 flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setReviewRating(s)}>
                <Star size={31} className={s <= reviewRating ? "fill-[var(--color-gold-500)] text-[var(--color-gold-500)]" : "text-[var(--border-muted)]"} />
              </button>
            ))}
          </div>
          <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Skriv något kort, valfritt" rows={3} className="w-full rounded-[14px] p-3.5 text-sm outline-none" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }} />
          <div className="mt-3 flex gap-2.5">
            <button type="button" onClick={dismissReview} className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] text-[14.5px] font-bold" style={{ backgroundColor: "rgba(17,17,19,0.06)", color: "var(--text-secondary)" }}>
              Skippa
            </button>
            <button type="button" onClick={submitReview} disabled={!reviewRating || reviewSubmitting} className="flex h-[52px] flex-[2] items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: "#F0531C" }}>
              {reviewSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Star size={16} className="fill-current" />}
              {reviewSubmitting ? "Skickar" : "Skicka"}
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-md px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-[calc(env(safe-area-inset-top,0px)+8px)]">
        <div className="flex h-[52px] items-center gap-3 border-b" style={{ borderColor: "var(--border-muted)" }}>
          <Link href={embedMode ? embedMenuHref : "/"} aria-label="Till menyn" className="grid h-9 w-9 place-items-center rounded-full">
            <ArrowRight size={20} className="rotate-180" />
          </Link>
          <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Din order</span>
          <span className="ml-auto text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{orderNo}</span>
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--text-secondary)" }}>ORDER {order.orderNumber ? `#${order.orderNumber}` : ""}</p>
          <h1 className="mt-0.5 text-[28px] font-black tracking-tight" style={{ color: "var(--text-primary)" }}>{isPickup ? "Din avhämtning" : "Din order"}</h1>
        </div>

        {isCompleted
          ? <CompletedReviewCard />
          : isPickup && currentStatus === "READY"
            ? <PickupReadyCard />
            : <StatusCard />}

        {!isPickup ? (
          <div className="mt-3.5 overflow-hidden rounded-[18px] border bg-white shadow-sm" style={{ borderColor: "rgba(17,17,19,0.07)" }}>
            <DestRowWeb mini="Levereras till" main={custAddr || restName} icon={MapPin} />
            <DestRowWeb mini="Restaurang" main={restName} sub={restAddr} icon={Store} call sep />
          </div>
        ) : null}

        <ContactActionsWeb primaryLabel={isPickup ? "Ring restaurang" : "Kontakta restaurang"} />

        <button
          type="button"
          onClick={() => setShowReceipt(true)}
          className="mt-3.5 flex w-full items-center gap-3.5 rounded-[18px] border bg-white p-4 text-left shadow-sm"
          style={{ borderColor: "rgba(17,17,19,0.07)" }}
        >
          <span className="grid h-[46px] w-[46px] place-items-center rounded-[13px]" style={{ backgroundColor: "#FFF0EA", color: "#F0531C" }}>
            <Receipt size={21} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Orderinfo & kvitto</span>
            <span className="mt-0.5 block truncate text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Se rätter, restaurang och pris</span>
          </span>
          <ChevronDown size={20} className="-rotate-90" style={{ color: "#C2C2C6" }} />
        </button>
      </div>
      {OrderInfoOverlayWeb}
    </div>
  );

  return (
    <div className="min-h-screen pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-24 md:pb-16" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-2xl px-4">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 py-3">
          <Link href={embedMode ? embedMenuHref : "/"} aria-label="Till menyn" className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}>
            <ArrowRight size={16} className="rotate-180" />
          </Link>
          {!isRejected && !isCompleted && (
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1.5 text-[11px] font-bold text-gold-600">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" /></span>
              {t("order.liveTracking")}
            </div>
          )}
        </div>
        <OrderTrackingCard order={order} courier={courierPos} full />

        {/* Hero: ersatt av samma React-lika OrderTrackingCard som hemskärmen. */}
        {false && (
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
            <div className={`shrink-0 ${statusInfo.textClass}`}>
              <StatusIcon size={34} className={currentStatus === "PENDING" ? "animate-pulse" : ""} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{statusLabel(currentStatus)}</h2>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{statusDesc(currentStatus)}</p>
            </div>
            {!isRejected && !isCompleted && (order.estimatedTime || courierEnRoute) && (
              <div className="shrink-0 rounded-2xl px-3.5 py-2 text-center" style={{ backgroundColor: "var(--bg-deep)" }}>
                <div className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {courierEnRoute ? t("order.eta.estDelivery") : t("order.eta.restaurantEstimates")}
                </div>
                <div className={`text-lg font-bold tabular-nums ${(courierEnRoute ? (!deliveryOverdue && deliverySecondsLeft !== null && deliverySecondsLeft! <= 300) : (etaLeft !== null && etaLeft! <= 300)) ? "text-emerald-500" : "text-gold-600"}`}>
                  {courierEnRoute
                    ? (deliverySecondsLeft === null
                        ? t("order.eta.minEstimate", { m: deliveryEtaMin })
                        : deliverySecondsLeft! <= 0
                          ? t("order.eta.soon")
                          : `${Math.floor(deliverySecondsLeft! / 60)}:${(deliverySecondsLeft! % 60).toString().padStart(2, "0")}`)
                    : etaLeft === null
                      ? `${order.estimatedTime} min`
                      : etaLeft! <= 0
                        ? t("order.eta.soon")
                        : `${Math.floor(etaLeft! / 60)}:${(etaLeft! % 60).toString().padStart(2, "0")}`}
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

          {/* ETA-budskap + perspektiv (vi-levererar vs levererar-själva) + quote */}
          {!isRejected && !isCompleted && (order.estimatedTime || courierEnRoute) && (
            <div className="border-t px-5 py-4" style={{ borderColor: "var(--border-muted)" }}>
              <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                {courierEnRoute
                  ? (deliveryOverdue ? t("order.eta.overdueBusy") : t("order.eta.courierOnWay"))
                  : isWeDeliver
                    ? t("order.eta.prepWeDeliver", { m: order.estimatedTime })
                    : t("order.eta.prepSelfDeliver", { m: order.estimatedTime })}
              </p>
              {courierEnRoute && !deliveryOverdue && deliveryBusy && (
                <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  {t("order.eta.busyNote")}
                </p>
              )}
            </div>
          )}
        </motion.div>
        )}

        {/* Web push — "Få avisering när maten är på väg". Visas bara när
            servern har VAPID-nycklar + webbläsaren stödjer push, och döljs
            för avslutade ordrar. */}
        {pushAvailable && !isTerminal(currentStatus) && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl px-4 py-3.5" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Få avisering när maten är på väg</p>
              <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {pushEnabled ? "Aktiverat, vi säger till även om fliken är stängd" : "Push via webben, även när fliken är stängd"}
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

        {/* Inline-recension — mellan status och beställningsdetaljer. Monokrom
            yta, guld bara på stjärnorna. Ersätter den tidigare popupen. */}
        {showInlineReview && (
          <div className="mt-4 rounded-2xl p-5 sm:p-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.review.title")}</h2>
                <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{t("order.review.prompt", { restaurant: order.restaurantName })}</p>
              </div>
              <button onClick={dismissReview} className="-mr-1.5 -mt-1.5 rounded-full p-2 transition-colors hover:bg-black/5" style={{ color: "var(--text-secondary)" }} aria-label={t("order.review.dismissAria")}><X size={18} /></button>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-5">
              {[1,2,3,4,5].map(s => (
                <button key={s} type="button" onClick={() => setReviewRating(s)} className="transition-transform active:scale-90 hover:scale-110" aria-label={`${s}/5`}>
                  <Star size={34} strokeWidth={1.5} className={s <= reviewRating ? 'fill-[var(--color-gold-500)] text-[var(--color-gold-500)]' : ''} style={s <= reviewRating ? undefined : { color: "var(--line-strong)" }} />
                </button>
              ))}
            </div>
            <div className="space-y-4 pt-5">
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder={t("order.review.placeholder")}
                rows={3}
                className="w-full rounded-2xl py-3.5 px-4 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--color-gold-500)]/35 resize-none"
                style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
              />
              <button
                onClick={submitReview}
                disabled={!reviewRating || reviewSubmitting}
                className="w-full py-4 rounded-full font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2.5"
                style={{ backgroundColor: "var(--color-gold-500)", color: "var(--text-primary)" }}
              >
                {reviewSubmitting ? <Loader2 className="animate-spin" size={18} /> : <><Star size={16} className="fill-current" /> {t("order.review.submit")}</>}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
           {/* Beställningsdetaljer — retractable: kollapsad visar bara totalen,
               expanderad visar rader, summering, momsrad + ladda ner kvitto. */}
            <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
              <button type="button" onClick={() => setDetailsOpen((v) => !v)} className="w-full flex items-center justify-between gap-3" aria-expanded={detailsOpen}>
                <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.detailsTitle")}</h2>
                <span className="flex items-center gap-3">
                  <span className="text-xl font-bold tracking-tight text-gold-600 tabular-nums">{formatSek(order.total)} kr</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
                    {detailsOpen ? t("order.details.showLess") : t("order.details.showMore")}
                    <ChevronDown size={15} style={{ transform: detailsOpen ? "rotate(180deg)" : "none" }} />
                  </span>
                </span>
              </button>
              {detailsOpen && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <div className="space-y-4 mb-6 pt-5">
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
                   const rawSubtotal = (order.items ?? []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
                   const discount = authoritativeDiscount(order, rawSubtotal);
                   return (
                     <>
                       <div className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}><span>{t("order.summary.subtotal")}</span><span className="tabular-nums">{formatSek(rawSubtotal)} kr</span></div>
                       {discount > 0 && (
                         <div className="flex justify-between text-[13px] text-emerald-600">
                           <span>{order.appliedDealTitle || t("order.summary.discount")}</span>
                           <span className="tabular-nums">−{formatSek(discount)} kr</span>
                         </div>
                       )}
                     </>
                   );
                 })()}
                 {order.deliveryFee > 0 && <div className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}><span>{t("order.summary.deliveryFee")}</span><span className="tabular-nums">+{formatSek(order.deliveryFee)} kr</span></div>}
                 {Number(order.smallOrderFee || 0) > 0 && <div className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}><span>Avgift för liten beställning</span><span className="tabular-nums">+{formatSek(order.smallOrderFee)} kr</span></div>}
                 {Number(order.tipAmount || 0) > 0 && <div className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}><span>Dricks</span><span className="tabular-nums">+{formatSek(order.tipAmount)} kr</span></div>}
                 {receiptVatRows(order).map((vat) => (
                   <div key={vat.rate} className="flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}>
                     <span>Varav moms ({formatSek(vat.rate)} %)</span>
                     <span className="tabular-nums">{formatSek(vat.vat)} kr</span>
                   </div>
                 ))}
                  <div className="flex justify-between items-baseline pt-3 mt-1" style={{ borderTop: "1px solid var(--border-muted)" }}>
                     <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{t("order.summary.total")}</span>
                     <span className="text-2xl font-bold tracking-tight text-gold-600 tabular-nums">{formatSek(order.total)} kr</span>
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
              </motion.div>
              )}
           </div>

           {/* Hantering — retractable, kompakt tills man klickar. Monokrom kontaktinfo. */}
           <div className="rounded-2xl border p-5 sm:p-6" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
              <button type="button" onClick={() => setHandlingOpen((v) => !v)} className="w-full flex items-center justify-between gap-3" aria-expanded={handlingOpen}>
                <span className="flex items-center gap-2.5">
                  {order.type === "DELIVERY" ? <Truck size={18} style={{ color: "var(--text-secondary)" }} /> : <Store size={18} style={{ color: "var(--text-secondary)" }} />}
                  <span className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("order.handling")}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
                  {handlingOpen ? t("order.handlingHide") : t("order.handlingShow")}
                  <ChevronDown size={15} style={{ transform: handlingOpen ? "rotate(180deg)" : "none" }} />
                </span>
              </button>
              {handlingOpen && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                 <div className="space-y-5 pt-5">
                    <div className="flex items-start gap-3.5">
                       <Phone className="mt-0.5 shrink-0" size={16} style={{ color: "var(--text-secondary)" }} />
                        <div>
                           <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.yourNumber")}</div>
                           <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{order.customerPhone}</div>
                        </div>
                    </div>

                    <div className="flex items-start gap-3.5">
                       <Store className="mt-0.5 shrink-0" size={16} style={{ color: "var(--text-secondary)" }} />
                        <div className="min-w-0 flex-1">
                           <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.restaurant")}</div>
                           <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{order.restaurantName}</div>
                           {/* Contact restaurant — phone (tel:) and email
                               (mailto:) shown as pill links when present. */}
                           <div className="mt-2 flex flex-wrap gap-2">
                             {order.restaurantPhone && (
                               <a
                                 href={`tel:${String(order.restaurantPhone).replace(/\s+/g, "")}`}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                                 style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--border-muted)" }}
                               >
                                 <Phone size={11} style={{ color: "var(--text-secondary)" }} /> {order.restaurantPhone}
                               </a>
                             )}
                             {(order as any).restaurantEmail && (
                               <a
                                 href={`mailto:${(order as any).restaurantEmail}`}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors break-all"
                                 style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--border-muted)" }}
                               >
                                 <Mail size={11} style={{ color: "var(--text-secondary)" }} /> {(order as any).restaurantEmail}
                               </a>
                             )}
                           </div>
                        </div>
                    </div>

                    {order.type === 'DELIVERY' ? (
                       order.deliveryStreet && (
                          <div className="flex items-start gap-3.5">
                             <MapPin className="mt-0.5 shrink-0" size={16} style={{ color: "var(--text-secondary)" }} />
                              <div className="min-w-0 flex-1">
                                 <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.deliveryAddress")}</div>
                                 {/* Tappable delivery address — opens in maps */}
                                 <a
                                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.deliveryStreet, order.restaurantCity].filter(Boolean).join(", "))}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="group block"
                                 >
                                   <div className="text-sm font-semibold leading-snug group-hover:opacity-80 transition-colors" style={{ color: "var(--text-primary)" }}>{order.deliveryStreet}</div>
                                   <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{order.restaurantCity || "Lund"}</div>
                                 </a>
                              </div>
                          </div>
                       )
                    ) : (
                       order.restaurantAddress && (
                          <div className="flex items-start gap-3.5">
                             <MapPin className="mt-0.5 shrink-0" size={16} style={{ color: "var(--text-secondary)" }} />
                              <div className="min-w-0 flex-1">
                                 <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("order.pickupAt")}</div>
                                 {/* Tappable pickup address — opens in maps */}
                                 <a
                                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.restaurantAddress, order.restaurantZip, order.restaurantCity].filter(Boolean).join(", "))}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="group block"
                                 >
                                   <div className="text-sm font-semibold leading-snug group-hover:opacity-80 transition-colors" style={{ color: "var(--text-primary)" }}>{order.restaurantAddress}</div>
                                   <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{order.restaurantZip} {order.restaurantCity}</div>
                                 </a>
                              </div>
                          </div>
                       )
                    )}

                    <div className="flex items-start gap-3.5">
                       <Calendar className="mt-0.5 shrink-0" size={16} style={{ color: "var(--text-secondary)" }} />
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
                             <Clock className="mt-0.5 shrink-0" size={16} style={{ color: "var(--text-secondary)" }} />
                              <div>
                                 <div className="text-[10px] font-bold mb-0.5" style={{ color: "var(--text-secondary)" }}>
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
              </motion.div>
              )}
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

              {/* Primär väg: ring restaurangen om din order. Support är medvetet
                  nedtonad till en liten ikon utan text — vi vill inte styra folk
                  till support i första hand. Restaurang-knappen döljs om numret saknas. */}
              <div className="flex items-center gap-2 justify-end">
                {order.restaurantPhone && (
                  <a
                    href={`tel:${String(order.restaurantPhone).replace(/\s+/g, "")}`}
                    className="flex-1 py-4 rounded-full flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                  >
                    <Phone size={16} style={{ color: "var(--text-secondary)" }} />
                    <span className="text-sm font-bold">{t("order.contactRestaurant")}</span>
                  </a>
                )}
                <Link
                  href={`/contact?order=${encodeURIComponent(order.orderNumber)}`}
                  aria-label={t("order.support")}
                  title={t("order.support")}
                  className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-[0.95]"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}
                >
                  <MessageSquare size={16} />
                </Link>
              </div>
        </div>

        {/* Recensionen visas numera inline (mellan status och beställnings-
            detaljer), inte som popup. Se {showInlineReview}-blocket ovan. */}

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
                        <span className="font-semibold tabular-nums whitespace-nowrap">{formatSek(it.subtotal)} kr</span>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const rawSubtotal = (order.items ?? []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
                    const tip = Number(order.tipAmount) || 0;
                    const deliveryFee = Number(order.deliveryFee) || 0;
                    const smallOrderFee = Number(order.smallOrderFee) || 0;
                    const discount = authoritativeDiscount(order, rawSubtotal);
                    return (
                      <div className="mt-4 pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--border-muted)" }}>
                        <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Delsumma</span><span className="tabular-nums">{formatSek(rawSubtotal)} kr</span></div>
                        {discount > 0 && <div className="flex justify-between text-[13px] text-emerald-600"><span>{order.appliedDealTitle || "Rabatt"}</span><span className="tabular-nums">−{formatSek(discount)} kr</span></div>}
                        {deliveryFee > 0 && <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Leveransavgift</span><span className="tabular-nums">+{formatSek(deliveryFee)} kr</span></div>}
                        {smallOrderFee > 0 && <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Avgift för liten beställning</span><span className="tabular-nums">+{formatSek(smallOrderFee)} kr</span></div>}
                        {tip > 0 && <div className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Dricks</span><span className="tabular-nums">+{formatSek(tip)} kr</span></div>}
                        {receiptVatRows(order).map((vat) => <div key={vat.rate} className="flex justify-between text-[13px]"><span style={{ color: "var(--text-secondary)" }}>Varav moms ({formatSek(vat.rate)} %)</span><span className="tabular-nums">{formatSek(vat.vat)} kr</span></div>)}
                        <div className="flex justify-between items-baseline pt-2 mt-1" style={{ borderTop: "1px solid var(--border-muted)" }}>
                          <span className="font-bold">Totalt</span>
                          <span className="text-xl font-bold text-gold-600 tabular-nums">{formatSek(order.total)} kr</span>
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
