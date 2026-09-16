"use client";
import EmbedViaeatsPromotion from "@/components/EmbedViaeatsPromotion";
import MetaPurchase from "@/components/MetaPurchase";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Store, Loader2, Phone, AlertCircle, ShieldCheck, MapPin, Star, X, MessageSquare, ChevronLeft, ChevronRight, ChevronDown, Navigation, Receipt, Download, Bike, Flame, PackageCheck, CreditCard, Bell } from "lucide-react";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "@/lib/api";
import { cacheOrderDetail, getCachedOrderDetail } from "@/lib/offlineOrders";
import { getOrderAccessProof, isPushSupported, getPushPublicKey, subscribeOrderPush, hasOrderPush } from "@/lib/webPushClient";
import { addSkippedReviewOrderId, isReviewSkipped } from "@/lib/reviewPrompt";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import dynamic from "next/dynamic";
import { forgetRawOrderAccessToken, readOrderHistory, saveOrderToHistory } from "@/lib/orderHistory";
import { rememberActiveOrder } from "@/lib/activeOrder";
import { ensureKioskAccess } from "@/lib/kioskAccessClient";
import {
  EMBED_PARENT_ORIGIN_PARAM,
  partnerOriginForRestaurant,
  readEmbedParentOrigin,
  trustedPartnerOrigin,
} from "@/lib/embedPartner";
import { orderTrackingCopy, orderTrackingProgress } from "@/lib/orderTrackingPresentation";
import PhoneAuth from "@/components/PhoneAuth";
import { getPlatformSessionStatus } from "@/lib/platformSessionClient";
import { useDesignBackground } from "@/components/restaurant/useDesignBackground";
import "@/components/restaurant/restaurant.css";

// Live-karta laddas bara på klienten (Leaflet behöver window).
const CourierTrackingMap = dynamic(() => import("@/components/CourierTrackingMap"), { ssr: false });

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
  useDesignBackground();
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
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiptDownloads, setReceiptDownloads] = useState(0);
  // Förstora leveransfotot.
  const [proofZoom, setProofZoom] = useState(false);
  // Web push: visas bara när webbläsaren stödjer push OCH servern har VAPID-
  // nycklar (annars null → raden renderas inte alls).
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showPhoneVerifyPrompt, setShowPhoneVerifyPrompt] = useState(false);
  const [phoneVerifyPrefillName, setPhoneVerifyPrefillName] = useState("");

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
            etaEndsAt: Object.prototype.hasOwnProperty.call(data, "etaEndsAt") ? data.etaEndsAt : prev?.etaEndsAt,
            etaReadyAt: Object.prototype.hasOwnProperty.call(data, "etaReadyAt") ? data.etaReadyAt : prev?.etaReadyAt,
            etaPickupAt: Object.prototype.hasOwnProperty.call(data, "etaPickupAt") ? data.etaPickupAt : prev?.etaPickupAt,
            etaCustomerAt: Object.prototype.hasOwnProperty.call(data, "etaCustomerAt") ? data.etaCustomerAt : prev?.etaCustomerAt,
            etaCustomerMin: Object.prototype.hasOwnProperty.call(data, "etaCustomerMin") ? data.etaCustomerMin : prev?.etaCustomerMin,
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
    if (!order?.status || ['AWAITING_PAYMENT', 'PENDING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(order.status)) { setEtaLeft(null); return; }
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

  useEffect(() => {
    if (!order?.id || !order.customerPhone || isTerminal(order.status) || embedMode) {
      setShowPhoneVerifyPrompt(false);
      return;
    }
    let active = true;
    const key = `viaeats.phoneVerifyPrompt.dismissed.${order.id}`;
    try {
      setPhoneVerifyPrefillName(localStorage.getItem("guest_name") || "");
      if (localStorage.getItem(key) === "1") {
        setShowPhoneVerifyPrompt(false);
        return;
      }
    } catch {
      /* storage unavailable: still allow prompt */
    }
    void getPlatformSessionStatus()
      .then((verified) => {
        if (active) setShowPhoneVerifyPrompt(!verified);
      })
      .catch(() => {
        if (active) setShowPhoneVerifyPrompt(true);
      });
    return () => { active = false; };
  }, [order?.id, order?.customerPhone, order?.status, embedMode]);

  const dismissPhoneVerifyPrompt = () => {
    if (order?.id) {
      try { localStorage.setItem(`viaeats.phoneVerifyPrompt.dismissed.${order.id}`, "1"); } catch { /* noop */ }
    }
    setShowPhoneVerifyPrompt(false);
  };

  // Recensionen visas inline (mellan status och detaljer) så fort ordern är
  // levererad och inte redan betygsatt. Läs in ev. tidigare "stäng"-val så
  // kunden inte ser den igen efter att ha stängt den (per session).
  useEffect(() => {
    if (!order?.id || typeof window === "undefined") return;
    // Delad skip-lista (viaeats.skippedReviewOrderIds) — samma nyckel som
    // Swift-appen och hemskärmens prompt, så en skippad order inte frågar igen.
    if (isReviewSkipped(order.id)) setReviewDismissed(true);
  }, [order?.id]);

  // Självläk embed-historiken varje gång en åtkomlig Palmyra-order öppnas.
  // Safari kan partitionera iframe-lagringen; därför sparas referensen både i
  // ViaEats localStorage och, via ett strikt origin-kontrollerat meddelande,
  // hos Palmyras föräldrasida.
  useEffect(() => {
    if (!embedMode || !embedRestaurant || !order?.id || typeof window === "undefined") return;
    saveOrderToHistory({
      id: String(order.id),
      phone: typeof order.customerPhone === "string" ? order.customerPhone : "",
      createdAt: order.createdAt || new Date().toISOString(),
      restaurantName: order.restaurantName || "Palmyra Pizzeria",
      restaurantSlug: embedRestaurant,
      total: typeof order.total === "number" ? order.total : undefined,
    });
    rememberActiveOrder(String(order.id), {
      phone: typeof order.customerPhone === "string" ? order.customerPhone : null,
    });
    const parentOrigin = readEmbedParentOrigin() || partnerOriginForRestaurant(embedRestaurant);
    if (parentOrigin && window.parent !== window) {
      window.parent.postMessage(
        { type: "viaeats:remember-order", orderId: String(order.id), restaurantSlug: embedRestaurant },
        parentOrigin,
      );
    }
  }, [embedMode, embedRestaurant, order?.id, order?.createdAt, order?.customerPhone, order?.restaurantName, order?.total]);

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
      <div className="ve-root min-h-screen pb-24 pt-[calc(env(safe-area-inset-top,0px)+12px)] md:pt-24">
        <div className="mx-auto max-w-[680px] px-4">
          <div className="flex items-center gap-3 py-2">
            <div className="ve-skeleton h-10 w-10 rounded-full" />
            <div className="ve-skeleton h-6 w-32 rounded-md" />
            <div className="ve-skeleton ml-auto h-7 w-16 rounded-full" />
          </div>
          <div className="ve-skeleton mt-3 h-[236px] w-full rounded-[20px]" />
          <div className="ve-skeleton mt-4 h-[140px] w-full rounded-[20px]" />
          <div className="ve-skeleton mt-4 h-[220px] w-full rounded-[20px]" />
        </div>
      </div>
    );
  }

  // Nätverksfel: backend nere/slö/timeout. Order kan mycket väl finnas och
  // vara betald — visa retry istället för "ej hittad". Kunder som JUST
  // betalat ska aldrig se "Order ej hittad" pga en 30s-backend-blip.
  if (!order && fetchError === "network") {
    return (
      <div className="ve-root min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <span className="mb-5 grid h-16 w-16 place-items-center rounded-full" style={{ backgroundColor: "#FFF4DF", color: "#C77800" }}><AlertCircle size={28} strokeWidth={2.2} /></span>
        <h1 className="m-0 text-[22px] font-semibold" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>{t("order.error.networkTitle")}</h1>
        <p className="m-0 mt-2 max-w-sm text-[15px]" style={{ color: "var(--ve-ink-2)" }}>{t("order.error.networkSub")}</p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <button onClick={() => { setLoading(true); setFetchError(null); fetchOrder(); }} className="ve-press h-12 rounded-full px-7 text-[16px] font-semibold" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>
            {t("order.error.retry")}
          </button>
          <Link href={embedMode ? embedMenuHref : "/orders"} className="ve-press flex h-12 items-center justify-center rounded-full px-7 text-[16px] font-medium" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
            {embedMode ? t("order.error.menuCta") : t("order.error.myOrders")}
          </Link>
        </div>
      </div>
    );
  }

  // 404 från backend — order finns verkligen inte (eller du saknar
  // ownership-bevis). Härifrån är "till startsidan" rätt åtgärd.
  if (!order) {
    return (
       <div className="ve-root min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <span className="mb-5 grid h-16 w-16 place-items-center rounded-full" style={{ backgroundColor: "#FDECEE", color: "#D70015" }}><AlertCircle size={28} strokeWidth={2.2} /></span>
          <h1 className="m-0 text-[22px] font-semibold" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>{t("order.error.notFoundTitle")}</h1>
          <p className="m-0 mt-2 max-w-sm text-[15px]" style={{ color: "var(--ve-ink-2)" }}>{t("order.error.notFoundSub")}</p>
          <Link href={embedMode ? embedMenuHref : "/"} className="ve-press mt-7 flex h-12 items-center rounded-full px-7 text-[16px] font-semibold" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>{t("order.error.notFoundCta")}</Link>
       </div>
    );
  }

  const isCompleted = order.status === "DELIVERED" || order.status === "COMPLETED";
  const currentStatus = order.status;
  const isRejected = currentStatus === "REJECTED" || currentStatus === "CANCELLED" || currentStatus === "DELIVERY_FAILED";
  const trackingProgress = orderTrackingProgress(order);
  const stepDefs = trackingProgress.labels.map((label) => ({ label }));
  const currentIdx = trackingProgress.activeIndex;

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
  const statusCopy = orderTrackingCopy(order);
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
  // Webben tar aldrig över hela skärmen som appen gör — spårningen är en
  // vanlig, dedikerad sida. Kartan bor i andningspanelen i stället.
  const showMapFullscreen = false;
  const hasLiveMap = order.type === "DELIVERY" && !isSelf && !isRejected && isOnWay && !isCompleted && hasRestCoords && hasCustomerCoords;
  void hasLiveMap;
  const activeStep = isCompleted ? stepDefs.length - 1 : Math.max(0, currentIdx);
  const progressRatio = isCompleted ? 1 : Math.max(0.22, Math.min(1, (activeStep + 1) / stepDefs.length));
  const etaMinutes = courierEnRoute
    ? liveEtaSecondsLeft != null
      ? Math.ceil(liveEtaSecondsLeft / 60)
      : deliveryEtaMin
    : etaLeft != null
      ? Math.ceil(etaLeft / 60)
      : ['ACCEPTED', 'PREPARING'].includes(currentStatus)
        ? Number(order.estimatedTime || 0) || null
        : null;
  const awaitingPayment = currentStatus === 'AWAITING_PAYMENT';
  const awaitingAccept = currentStatus === 'PENDING';
  const deliveryEnRoute = isOnWay && order.type === "DELIVERY";
  const etaSub = isRejected
    ? cancelledCopy.sub
    : isCompleted
      ? "Status"
      : awaitingPayment
        ? "Betalning"
      : awaitingAccept
        ? "Skickad till restaurangen"
        : order.scheduledFor
          ? "Schemalagd tid"
          : isPickup
            ? currentStatus === "READY" ? "Redo att hämtas" : "Restaurangens tid"
            : currentStatus === "READY"
              ? t("order.eta.readyPlatformTitle")
            : deliveryEnRoute
              ? "Framme om ca"
              : "Restaurangens tid";
  const etaMain = isRejected
    ? cancelledCopy.main
    : isCompleted
      ? isPickup ? "hämtad" : "klart"
      : awaitingPayment
        ? "slutför betalningen"
      : awaitingAccept
        ? "väntar på svar"
        : order.scheduledFor
          ? new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
          : currentStatus === "READY"
            ? isPickup ? "nu" : isWeDeliver ? "bud hämtar snart" : "utkörning förbereds"
          : etaMinutes != null && etaMinutes <= 0
            ? "snart"
            : etaMinutes != null
              ? `${etaMinutes} min`
              : "status uppdateras";
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
  const statusTitle = statusCopy.title;
  const statusDescription = deliveryOverdue ? t("order.eta.overdueBusy") : statusCopy.description;
  const showEtaAsEstimate = etaMinutes != null && ["ACCEPTED", "PREPARING", "DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"].includes(currentStatus);

  const rawSubtotal = (order.items ?? []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const smallOrderFee = Number(order.smallOrderFee || 0);
  const tipAmount = Number(order.tipAmount || 0);
  const discount = authoritativeDiscount(order, rawSubtotal);
  const vatRows = receiptVatRows(order);
  const paymentLabel = order.paymentMethod === "ONLINE" ? "Betalt online" : order.paymentMethod ? `Betalt med ${order.paymentMethod}` : "Betalning registrerad";

  // ── Fas och färg ─────────────────────────────────────────────────────────
  // Varje fas har EN egen färg så inget blandas ihop mellan flödena:
  //   skickad/bekräftad = indigo, tillagas = orange, klar (väntar på
  //   utkörning) = amber, på väg = blå, klar att hämta/levererad = grön,
  //   avbruten/fel = röd, väntar på betalning = grå.
  type Phase = "payment" | "sent" | "confirmed" | "cooking" | "readyWait" | "onWay" | "readyPickup" | "done" | "failed";
  const phase: Phase = isRejected
    ? "failed"
    : isCompleted
      ? "done"
      : awaitingPayment
        ? "payment"
        : awaitingAccept
          ? "sent"
          : currentStatus === "ACCEPTED"
            ? "confirmed"
            : currentStatus === "PREPARING"
              ? "cooking"
              : currentStatus === "READY"
                ? (isPickup ? "readyPickup" : "readyWait")
                : isOnWay
                  ? "onWay"
                  : "confirmed";
  const PHASE: Record<Phase, { color: string; soft: string; label: string; icon: any }> = {
    payment: { color: "#8E8E93", soft: "#F2F2F4", label: "Väntar på betalning", icon: CreditCard },
    sent: { color: "#5E5CE6", soft: "#EEEEFC", label: "Skickad", icon: Clock },
    confirmed: { color: "#5E5CE6", soft: "#EEEEFC", label: "Bekräftad", icon: Check },
    cooking: { color: "#F04F1A", soft: "#FFF1EB", label: "Tillagas", icon: Flame },
    readyWait: { color: "#C77800", soft: "#FFF4DF", label: isSelf ? "Klar · restaurangen kör snart" : "Klar · budet hämtar snart", icon: PackageCheck },
    onWay: { color: "#0A84FF", soft: "#E8F2FF", label: isSelf ? "Restaurangen kör ut" : "Budet är på väg", icon: isSelf ? Store : Bike },
    readyPickup: { color: "#1F8A3B", soft: "#E9F6EC", label: "Klar att hämta", icon: PackageCheck },
    done: { color: "#1F8A3B", soft: "#E9F6EC", label: isPickup ? "Hämtad" : "Levererad", icon: Check },
    failed: { color: "#D70015", soft: "#FDECEE", label: cancelledCopy.main, icon: AlertCircle },
  };
  const ph = PHASE[phase];
  const PhaseIcon = ph.icon;

  // Steg per flöde. Avhämtning har ett eget sista steg ("Hämtad") så
  // "Klar att hämta" och "Hämtad" aldrig visas som samma sak. Leverans har
  // "Klar" som eget steg mellan köket och vägen.
  const firstStep = phase === "sent" || phase === "payment" ? "Skickad" : "Bekräftad";
  const steps: { label: string; color: string }[] = isPickup
    ? [
        { label: firstStep, color: PHASE.confirmed.color },
        { label: "Tillagas", color: PHASE.cooking.color },
        { label: "Klar", color: PHASE.readyPickup.color },
        { label: "Hämtad", color: PHASE.done.color },
      ]
    : [
        { label: firstStep, color: PHASE.confirmed.color },
        { label: "Tillagas", color: PHASE.cooking.color },
        { label: "Klar", color: PHASE.readyWait.color },
        { label: isSelf ? "Kör ut" : "På väg", color: PHASE.onWay.color },
        { label: "Levererad", color: PHASE.done.color },
      ];
  const stepIndex = phase === "done"
    ? steps.length - 1
    : phase === "readyPickup" || phase === "readyWait"
      ? 2
      : phase === "onWay"
        ? 3
        : phase === "cooking"
          ? 1
          : 0;

  // ETA-texten: "ca 25 min" under aktivt arbete, klockslag vid schemalagd
  // tid, annars ett kort läge. Aldrig en nedräkning som hoppar bakåt.
  const etaBig = isRejected
    ? null
    : phase === "done"
      ? null
      : phase === "readyPickup"
        ? "Nu"
        : showEtaAsEstimate && etaMinutes != null
          ? etaMinutes <= 0 ? "Snart" : `${etaMinutes} min`
          : order.scheduledFor
            ? new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
            : null;
  const etaCaption = isRejected || phase === "done"
    ? null
    : phase === "readyPickup"
      ? "Redo att hämtas"
      : phase === "onWay"
        ? "Framme om cirka"
        : phase === "readyWait"
          ? (isSelf ? "Utkörning förbereds" : "Väntar på bud")
          : phase === "payment"
            ? "Slutför betalningen"
            : phase === "sent"
              ? "Väntar på restaurangens svar"
              : order.scheduledFor
                ? "Schemalagd tid"
                : isPickup ? "Klar om cirka" : "Levereras om cirka";
  const showLiveMap = hasLiveMap;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restAddr || restName)}`;
  const telHref = order.restaurantPhone ? `tel:${String(order.restaurantPhone).replace(/\s+/g, "")}` : null;
  const placedAt = order.createdAt ? new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : null;

  const hairline = "inset 0 0.5px 0 var(--ve-line)";
  const sectionTitle = (text: string, right?: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 px-1 mb-2.5">
      <h2 className="m-0 text-[17px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{text}</h2>
      {right}
    </div>
  );
  const summaryRow = (label: React.ReactNode, value: React.ReactNode, tone: "default" | "success" = "default") => (
    <div className="flex items-baseline justify-between gap-4 text-[15px]" style={{ color: tone === "success" ? "var(--ve-success)" : "var(--ve-ink-2)" }}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="ve-tabular shrink-0 font-medium" style={{ color: tone === "default" ? "var(--ve-ink)" : undefined }}>{value}</span>
    </div>
  );

  // ── Scenen: färgfält per fas, progressring med ETA, tidslinje som piller ──
  const GRADIENT: Record<Phase, string> = {
    payment: "linear-gradient(165deg, #8E8E93 0%, #5C5C61 100%)",
    sent: "linear-gradient(165deg, #6E6CF0 0%, #3B39B0 100%)",
    confirmed: "linear-gradient(165deg, #6E6CF0 0%, #3B39B0 100%)",
    cooking: "linear-gradient(165deg, #FF7A45 0%, #E03E0C 100%)",
    readyWait: "linear-gradient(165deg, #F7B23B 0%, #C27000 100%)",
    onWay: "linear-gradient(165deg, #42B5FF 0%, #0A5FE0 100%)",
    readyPickup: "linear-gradient(165deg, #3DD267 0%, #178A3A 100%)",
    done: "linear-gradient(165deg, #3DD267 0%, #178A3A 100%)",
    failed: "linear-gradient(165deg, #FF5B4F 0%, #B3261E 100%)",
  };
  const journey = phase === "done" ? 1 : phase === "failed" || phase === "payment" ? 0.06 : Math.min(0.96, (stepIndex + 0.6) / steps.length);
  const RING_R = 76;
  const RING_C = 2 * Math.PI * RING_R;
  const etaParts = etaBig ? etaBig.match(/^(\d+)\s*(.*)$/) : null;
  const ringActive = !isRejected && phase !== "done" && phase !== "readyPickup" && phase !== "payment";

  const Stage = (
    <section className="relative overflow-hidden text-white" style={{ background: GRADIENT[phase] }}>
      <style>{`
        @keyframes ve-sonar { 0% { transform: scale(0.55); opacity: 0.55; } 100% { transform: scale(1.65); opacity: 0; } }
        @keyframes ve-spin { to { transform: rotate(360deg); } }
        .ve-sonar { animation: ve-sonar 2.8s cubic-bezier(0.2, 0.6, 0.3, 1) infinite; }
        .ve-sonar-2 { animation-delay: 1.4s; }
        .ve-spin { animation: ve-spin 16s linear infinite; transform-origin: 50% 50%; }
        @media (prefers-reduced-motion: reduce) { .ve-sonar, .ve-spin { animation: none; } }
      `}</style>
      <span aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)" }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 70%)" }} />
      <div className="relative mx-auto max-w-[680px] px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-14 md:pt-6">
        <div className="flex items-center gap-2">
          <Link href={embedMode ? embedMenuHref : "/"} aria-label="Till menyn" className="ve-press grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(12px)" }}>
            <ChevronLeft size={20} strokeWidth={2.4} className="-ml-0.5" />
          </Link>
          <p className="m-0 min-w-0 flex-1 truncate text-center text-[13.5px] font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
            {restName} · {isPickup ? "Avhämtning" : isSelf ? "Restaurangen levererar" : "Leverans"}
          </p>
          <span className="ve-tabular shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(12px)" }}>{orderNo}</span>
        </div>

        <div className="relative mx-auto mt-7 grid h-[200px] w-[200px] place-items-center">
          {ringActive && (
            <>
              <span aria-hidden className="ve-sonar absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.55)" }} />
              <span aria-hidden className="ve-sonar ve-sonar-2 absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.55)" }} />
            </>
          )}
          <svg width="200" height="200" viewBox="0 0 200 200" className="absolute inset-0" aria-hidden>
            <circle cx="100" cy="100" r={RING_R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="11" />
            <circle
              cx="100" cy="100" r={RING_R} fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round"
              strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - journey)}
              transform="rotate(-90 100 100)"
              style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
            />
            {ringActive && (
              <circle className="ve-spin" cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="3 9" strokeLinecap="round" />
            )}
          </svg>
          <div className="relative flex flex-col items-center justify-center text-center">
            {phase === "done" ? (
              <Check size={54} strokeWidth={2.6} />
            ) : isRejected ? (
              <X size={50} strokeWidth={2.6} />
            ) : etaParts ? (
              <>
                <span className="ve-tabular text-[52px] font-semibold leading-none" style={{ letterSpacing: "-0.04em" }}>{etaParts[1]}</span>
                <span className="mt-1 text-[14px] font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>{etaParts[2] || "min"}</span>
              </>
            ) : etaBig ? (
              <span className="text-[34px] font-semibold leading-none" style={{ letterSpacing: "-0.03em" }}>{etaBig}</span>
            ) : (
              <PhaseIcon size={44} strokeWidth={2.2} />
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
            {etaCaption || ph.label}
          </span>
          <h1 className="m-0 mt-3 text-[26px] font-semibold leading-[1.12]" style={{ letterSpacing: "-0.025em" }}>
            {isRejected ? cancelledCopy.title : statusCopy.title}
          </h1>
          <p className="m-0 mx-auto mt-2 max-w-[320px] text-[14.5px] leading-[1.45]" style={{ color: "rgba(255,255,255,0.78)" }}>
            {isRejected ? cancelledCopy.description : statusDescription}
          </p>
          {deliveryOverdue && <p className="m-0 mt-2 text-[12.5px] font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>Hög belastning just nu</p>}
        </div>

        {!isRejected && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
            {steps.map((step, index) => {
              const done = index < stepIndex || phase === "done";
              const active = index === stepIndex && phase !== "done";
              return (
                <span
                  key={step.label}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"
                  style={{
                    backgroundColor: done ? "#fff" : active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
                    color: done ? "#1D1D1F" : active ? "#fff" : "rgba(255,255,255,0.6)",
                    boxShadow: active ? "inset 0 0 0 1.5px rgba(255,255,255,0.9)" : undefined,
                  }}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : active ? <span className="h-[7px] w-[7px] rounded-full bg-white animate-pulse" /> : null}
                  {step.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );

  // ── Var-kortet: hämta hos / levereras till + restaurangen ────────────────
  const WhereCard = (
    <section className="ve-card overflow-hidden">
      {isPickup ? (
        <a href={mapsHref} target="_blank" rel="noreferrer" className="ve-row-press flex items-center gap-3.5 px-4 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: PHASE.readyPickup.soft, color: PHASE.readyPickup.color }}>
            <MapPin size={18} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>Hämta hos</span>
            <span className="block truncate text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{restName}</span>
            {restAddr && <span className="block truncate text-[13.5px]" style={{ color: "var(--ve-ink-2)" }}>{restAddr}</span>}
          </span>
          <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
            <Navigation size={13} strokeWidth={2.4} /> Karta
          </span>
        </a>
      ) : (
        <>
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
              <MapPin size={18} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>Levereras till</span>
              <span className="block truncate text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{custAddr || "Din adress"}</span>
            </span>
          </div>
          <div className="flex items-center gap-3.5 px-4 py-3.5" style={{ boxShadow: hairline }}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
              <Store size={18} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>{isSelf ? "Restaurangen levererar själv" : "Restaurang"}</span>
              <span className="block truncate text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{restName}</span>
            </span>
            {telHref && (
              <a href={telHref} target="_top" aria-label="Ring restaurangen" className="ve-press grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
                <Phone size={17} strokeWidth={2.2} />
              </a>
            )}
          </div>
        </>
      )}
      {isPickup && telHref && (
        <a href={telHref} target="_top" className="ve-row-press flex items-center gap-3.5 px-4 py-3.5" style={{ boxShadow: hairline }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
            <Phone size={17} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-medium" style={{ color: "var(--ve-ink)" }}>Ring restaurangen</span>
          <ChevronRight size={17} strokeWidth={2.2} style={{ color: "var(--ve-ink-3)" }} />
        </a>
      )}
    </section>
  );

  // ── Beställningen ─────────────────────────────────────────────────────────
  const OrderCard = (
    <section className="ve-card overflow-hidden">
      {(order.items ?? []).map((item: any, index: number) => (
        <div key={`${item.id || item.productId || item.productName}-${index}`} className="mx-4 flex items-start gap-3 py-3" style={{ boxShadow: index === 0 ? undefined : hairline }}>
          <span className="ve-tabular mt-0.5 grid h-6 min-w-[24px] shrink-0 place-items-center rounded-full px-1.5 text-[12px] font-semibold" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>{item.quantity || 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-snug" style={{ color: "var(--ve-ink)" }}>{item.productName || item.name}</span>
            {Array.isArray(item.selectedExtras) && item.selectedExtras.length > 0 && (
              <span className="block mt-0.5 text-[13px]" style={{ color: "var(--ve-ink-2)" }}>{item.selectedExtras.map((e: any) => e.extraName || e.name).join(" · ")}</span>
            )}
            {item.note && <span className="block mt-0.5 text-[12.5px] italic" style={{ color: "var(--ve-ink-3)" }}>{item.note}</span>}
          </span>
          <span className="ve-tabular shrink-0 text-[15px] font-medium" style={{ color: "var(--ve-ink)" }}>{formatSek(item.subtotal)} kr</span>
        </div>
      ))}
      <div className="px-4 py-3.5 space-y-2" style={{ boxShadow: hairline }}>
        {summaryRow("Delsumma", `${formatSek(rawSubtotal)} kr`)}
        {discount > 0 && summaryRow(order.appliedDealTitle || "Rabatt", `−${formatSek(discount)} kr`, "success")}
        {order.type === "DELIVERY" && summaryRow("Leverans", deliveryFee > 0 ? `${formatSek(deliveryFee)} kr` : "Gratis")}
        {smallOrderFee > 0 && summaryRow("Avgift för liten beställning", `${formatSek(smallOrderFee)} kr`)}
        {tipAmount > 0 && summaryRow("Dricks", `${formatSek(tipAmount)} kr`)}
        <div className="flex items-baseline justify-between gap-4 pt-2.5 mt-1" style={{ boxShadow: hairline }}>
          <span className="text-[16px] font-semibold" style={{ color: "var(--ve-ink)" }}>Totalt</span>
          <span className="ve-tabular text-[20px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.02em" }}>{formatSek(order.total)} kr</span>
        </div>
        <p className="m-0 flex items-center gap-1.5 pt-1 text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}><ShieldCheck size={13} strokeWidth={2.2} /> {paymentLabel}{placedAt ? ` · lagd ${placedAt}` : ""}</p>
      </div>
      {!awaitingPayment && (
        <button type="button" onClick={() => setShowReceipt(true)} className="ve-row-press flex w-full items-center gap-3.5 px-4 py-3.5 text-left" style={{ boxShadow: hairline }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}><Receipt size={16} strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1 text-[15px] font-medium" style={{ color: "var(--ve-ink)" }}>Kvitto</span>
          <ChevronRight size={17} strokeWidth={2.2} style={{ color: "var(--ve-ink-3)" }} />
        </button>
      )}
    </section>
  );

  // ── Recension efter leverans ──────────────────────────────────────────────
  const ReviewCard = isCompleted ? (
    <section className="ve-card px-5 py-5">
      {order.rating || reviewDone ? (
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ backgroundColor: PHASE.done.soft, color: PHASE.done.color }}><Check size={22} strokeWidth={2.6} /></span>
          <div className="min-w-0">
            <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Tack för din recension</p>
            <p className="m-0 mt-0.5 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>{reviewRewardText || "Den hjälper restaurangen och andra som beställer."}</p>
          </div>
        </div>
      ) : reviewDismissed ? (
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ backgroundColor: PHASE.done.soft, color: PHASE.done.color }}><Check size={22} strokeWidth={2.6} /></span>
          <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Tack för att du beställer lokalt</p>
        </div>
      ) : (
        <>
          <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Hur var maten?</p>
          <p className="m-0 mt-0.5 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Ett betyg räcker, en kommentar är extra.</p>
          <div className="my-4 flex justify-center gap-2.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setReviewRating(s)} aria-label={`${s} av 5`} className="ve-press">
                <Star size={32} strokeWidth={1.6} style={s <= reviewRating ? { color: "#F5A524", fill: "#F5A524" } : { color: "var(--ve-line-2)" }} />
              </button>
            ))}
          </div>
          <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Skriv något kort, valfritt" rows={2} className="ve-input w-full rounded-[14px] px-4 py-3 font-medium outline-none resize-none" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }} />
          <div className="mt-3 flex gap-2.5">
            <button type="button" onClick={dismissReview} className="ve-press h-12 flex-1 rounded-full text-[15px] font-medium" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>Skippa</button>
            <button type="button" onClick={submitReview} disabled={!reviewRating || reviewSubmitting} className="ve-press flex h-12 flex-[2] items-center justify-center gap-2 rounded-full text-[15px] font-semibold disabled:opacity-40" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>
              {reviewSubmitting ? <Loader2 size={17} className="animate-spin" /> : null}
              {reviewSubmitting ? "Skickar" : "Skicka betyg"}
            </button>
          </div>
        </>
      )}
    </section>
  ) : null;

  // ── Kvitto-överlägg ──────────────────────────────────────────────────────
  const OrderInfoOverlayWeb = (
    <AnimatePresence>
      {showReceipt && !awaitingPayment ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="ve-root fixed inset-0 z-[1900] overflow-y-auto"
        >
          <div className="mx-auto min-h-[100dvh] max-w-[680px] px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]" style={{ paddingBottom: embedMode ? "calc(env(safe-area-inset-bottom, 0px) + 10rem)" : "2rem" }}>
            <div className="flex items-center gap-3 pb-4">
              <button type="button" onClick={() => setShowReceipt(false)} className="ve-press grid h-10 w-10 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }} aria-label="Tillbaka">
                <ChevronLeft size={20} strokeWidth={2.4} className="-ml-0.5" />
              </button>
              <h2 className="m-0 text-[22px] font-semibold" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>Kvitto</h2>
              <span className="ve-tabular ml-auto text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{orderNo}</span>
            </div>

            <div className="ve-card px-4 py-4">
              <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{order.restaurantLegalName || restName}</p>
              {order.restaurantOrgNr && <p className="m-0 mt-0.5 text-[13px]" style={{ color: "var(--ve-ink-3)" }}>Org.nr {order.restaurantOrgNr}</p>}
              {restAddr && <p className="m-0 mt-0.5 text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{restAddr}</p>}
              {(order.restaurantPhone || order.restaurantEmail) && <p className="m-0 mt-0.5 text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{[order.restaurantPhone, order.restaurantEmail].filter(Boolean).join(" · ")}</p>}
              <div className="mt-3 space-y-1.5 pt-3" style={{ boxShadow: hairline }}>
                {summaryRow("Datum", new Date(order.createdAt).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" }))}
                {summaryRow("Typ", order.type === "DELIVERY" ? (isSelf ? "Leverans av restaurangen" : "Leverans") : "Avhämtning")}
                {summaryRow("Betalsätt", paymentMethodLabel(order.paymentMethod))}
              </div>
            </div>

            <div className="mt-4">{OrderCard}</div>

            {vatRows.length > 0 && (
              <div className="ve-card mt-4 px-4 py-3.5 space-y-1.5">
                {vatRows.map((vat) => <div key={vat.rate}>{summaryRow(`Varav moms ${formatSek(vat.rate)} %`, `${formatSek(vat.vat)} kr`)}</div>)}
              </div>
            )}

            <button
              type="button"
              onClick={downloadReceipt}
              disabled={receiptDownloads >= RECEIPT_MAX_DOWNLOADS}
              className="ve-press mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
            >
              <Download size={17} strokeWidth={2.2} />
              {receiptDownloads >= RECEIPT_MAX_DOWNLOADS ? "Kvittot är nedladdat" : "Ladda ner kvitto"}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const OrderCollapse = (
    <section className="ve-card overflow-hidden">
      <button type="button" onClick={() => setOrderOpen((v) => !v)} aria-expanded={orderOpen} className="ve-row-press flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}><Receipt size={17} strokeWidth={2.2} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>Din beställning</span>
          <span className="block text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{(order.items ?? []).length} {(order.items ?? []).length === 1 ? "vara" : "varor"} · {paymentLabel}</span>
        </span>
        <span className="ve-tabular text-[16px] font-semibold" style={{ color: "var(--ve-ink)" }}>{formatSek(order.total)} kr</span>
        <ChevronDown size={17} strokeWidth={2.2} className="transition-transform duration-200" style={{ color: "var(--ve-ink-3)", transform: orderOpen ? "rotate(180deg)" : "none" }} />
      </button>
      {orderOpen && <div style={{ boxShadow: hairline }}>{OrderCard}</div>}
    </section>
  );

  return (
    // Spårningen beter sig som en app-skärm: bara vertikal rörelse, ingen
    // studs mot kanterna, inget som kan skapa sidledes scroll.
    <div
      className="ve-root min-h-[100dvh] w-full max-w-full md:pt-20"
      style={{ overflowX: "clip", overscrollBehavior: "none", touchAction: "pan-y pinch-zoom" }}
    >
      <MetaPurchase receipt={order.marketingPurchase} />
      {Stage}
      <div
        className="relative -mt-7 rounded-t-[28px] px-3 pt-4"
        style={{ backgroundColor: "var(--ve-bg)", paddingBottom: embedMode ? "calc(env(safe-area-inset-bottom, 0px) + 10rem)" : "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        <div className="mx-auto max-w-[680px] space-y-3">
          {showLiveMap && (
            <section className="ve-card overflow-hidden">
              <div className="relative h-[220px] w-full" style={{ backgroundColor: "#E7EAE6" }}>
                <CourierTrackingMap
                  pickup={{ lat: order.restaurantLat, lng: order.restaurantLng }}
                  dropoff={{ lat: order.deliveryLatitude, lng: order.deliveryLongitude }}
                  courier={courierPos}
                  accentColor={ph.color}
                />
              </div>
            </section>
          )}
          {ReviewCard}
          {embedMode && embedRestaurant === "palmyra-pizzeria-lund" && !isRejected && order.paymentStatus === "PAID" && <EmbedViaeatsPromotion completed={isCompleted} />}
          {WhereCard}
          {OrderCollapse}

          {pushAvailable && !isTerminal(currentStatus) && (
            <section className="ve-card flex items-center gap-3.5 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}><Bell size={17} strokeWidth={2.2} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium" style={{ color: "var(--ve-ink)" }}>Avisering när maten är på väg</span>
                <span className="block text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{pushEnabled ? "Aktiverat, även när fliken är stängd" : "Även när fliken är stängd"}</span>
              </span>
              <button type="button" onClick={enablePush} disabled={pushBusy || pushEnabled} aria-pressed={pushEnabled} className="relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors disabled:cursor-default" style={{ backgroundColor: pushEnabled ? "var(--ve-success)" : "var(--ve-fill-2)" }}>
                <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all" style={{ left: pushEnabled ? "calc(100% - 25px)" : "3px", boxShadow: "0 2px 4px rgba(0,0,0,0.18)" }} />
              </button>
            </section>
          )}

          {proofIsLive(order) && (
            <section className="ve-card px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Leveransbevis</p>
                <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: PHASE.done.soft, color: PHASE.done.color }}>{order.proofMethod === "LEFT_AT_DOOR" ? "Lämnad vid dörren" : "Lämnad i handen"}</span>
              </div>
              <div className="mt-3 flex gap-3.5">
                <button type="button" onClick={() => setProofZoom(true)} className="ve-press shrink-0 overflow-hidden rounded-[14px]" title="Förstora">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={order.proofPhotoUrl} alt="Leveransfoto" className="h-24 w-24 object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  {order.proofMessage && <p className="m-0 text-[14.5px] whitespace-pre-wrap" style={{ color: "var(--ve-ink)" }}>{order.proofMessage}</p>}
                  <p className="m-0 mt-2 text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>Tryck på bilden för att förstora. Sparas i två dagar.</p>
                </div>
              </div>
            </section>
          )}

          {showPhoneVerifyPrompt && (
            <section className="ve-card px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Spara den här ordern</p>
                  <p className="m-0 mt-0.5 text-[14px] leading-snug" style={{ color: "var(--ve-ink-2)" }}>Verifiera ditt nummer för orderhistorik och snabbare support.</p>
                </div>
                <button type="button" onClick={dismissPhoneVerifyPrompt} className="grid h-8 w-8 shrink-0 place-items-center rounded-full" aria-label="Dölj" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink-2)" }}><X size={15} strokeWidth={2.6} /></button>
              </div>
              <div className="mt-3">
                <PhoneAuth
                  buttonLabel="Verifiera nummer"
                  prefilledPhone={order.customerPhone}
                  lockedPhone
                  prefilledName={phoneVerifyPrefillName}
                  redirectTo={null}
                  onCompleted={() => {
                    setShowPhoneVerifyPrompt(false);
                    void fetchOrder({ silent: true });
                  }}
                />
              </div>
            </section>
          )}

          {!embedMode && (
            <Link href={`/contact?order=${encodeURIComponent(order.orderNumber || "")}`} className="ve-row-press ve-card flex items-center gap-3.5 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}><MessageSquare size={16} strokeWidth={2.2} /></span>
              <span className="min-w-0 flex-1 text-[15px] font-medium" style={{ color: "var(--ve-ink)" }}>Behöver du hjälp med ordern?</span>
              <ChevronRight size={17} strokeWidth={2.2} style={{ color: "var(--ve-ink-3)" }} />
            </Link>
          )}
        </div>
      </div>

      {OrderInfoOverlayWeb}

      <AnimatePresence>
        {proofZoom && order?.proofPhotoUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.85)" }} onClick={() => setProofZoom(false)}>
            <button onClick={() => setProofZoom(false)} className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full text-white" style={{ backgroundColor: "rgba(255,255,255,0.16)" }} aria-label="Stäng"><X size={20} /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} src={order.proofPhotoUrl} alt="Leveransfoto" className="max-h-[86vh] max-w-full rounded-[20px] object-contain" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrderStatusPage;
