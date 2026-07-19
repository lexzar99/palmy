"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bike, Check, ChevronRight, Navigation, Package, ShoppingBag, X } from "lucide-react";
import { motion } from "framer-motion";
import { orderTrackingCopy, orderTrackingProgress } from "@/lib/orderTrackingPresentation";

const CourierTrackingMap = dynamic(() => import("@/components/CourierTrackingMap"), { ssr: false });

type LL = { lat: number; lng: number };


function etaLabel(order: any, now = Date.now()) {
  const status = String(order.status || "").toUpperCase();
  const type = String(order.orderType || order.type || "DELIVERY").toUpperCase();
  if (status === "REJECTED") return "Avböjd";
  if (status === "DELIVERY_FAILED") return "Misslyckad";
  if (status === "CANCELLED") return "Avbruten";
  if (["DELIVERED", "COMPLETED"].includes(status)) return "Klar";
  if (type === "PICKUP" && status === "READY") return "Hämta nu";
  if (order.etaEndsAt) {
    const mins = Math.max(0, Math.ceil((new Date(order.etaEndsAt).getTime() - now) / 60000));
    if (mins <= 0) return "snart";
    return `${mins}m`;
  }
  if (order.scheduledFor) {
    return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  if (order.estimatedTime) return `${order.estimatedTime}m`;
  return type === "PICKUP" ? "ca 10m" : "Snart";
}

export function OrderTrackingCard({
  order,
  href,
  courier,
  className = "",
  full = false,
}: {
  order: any;
  href?: string;
  courier?: LL | null;
  className?: string;
  full?: boolean;
}) {
  const [now] = useState(() => Date.now());
  const status = String(order.status || "PENDING").toUpperCase();
  const type = String(order.orderType || order.type || "DELIVERY").toUpperCase();
  const isPickup = type === "PICKUP";
  const isSelfDelivery = type === "DELIVERY" && !!order.selfDelivery;
  const isWeDeliver = type === "DELIVERY" && !order.selfDelivery;
  const isOnWay = ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"].includes(status);
  const isDone = isPickup ? ["READY", "DELIVERED", "COMPLETED"].includes(status) : ["DELIVERED", "COMPLETED"].includes(status);
  const isCancelled = ["CANCELLED", "REJECTED", "DELIVERY_FAILED"].includes(status);
  const copy = orderTrackingCopy(order);
  const tracking = orderTrackingProgress(order);
  const tone = isCancelled ? "red" : isDone || isOnWay ? "green" : ["PREPARING", "READY"].includes(status) ? "yellow" : "orange";
  const accent = tone === "red" ? "#C0392B" : tone === "green" ? "#2E7D4F" : tone === "yellow" ? "#E1A70D" : "#F0531C";
  const accentInk = tone === "red" ? "#9A2A1F" : tone === "green" ? "#1F6B41" : tone === "yellow" ? "#8A5B00" : "#B23C12";
  const soft = tone === "red" ? "#FCEBE9" : tone === "green" ? "#EAF7EF" : tone === "yellow" ? "#FFF7DB" : "#FFF0EA";
  const labels = tracking.labels;
  const step = tracking.activeIndex + 1;
  const progress = `${Math.max(18, Math.min(100, Math.round((step / labels.length) * 100)))}%`;
  const restaurantLabel = order.restaurantName || order.restaurant?.name || "Din restaurang";
  const orderNumber = order.orderNumber || String(order.id || "").slice(-6).toUpperCase();
  const canMap =
    isWeDeliver &&
    isOnWay &&
    !isDone &&
    typeof order.restaurantLat === "number" &&
    typeof order.restaurantLng === "number" &&
    typeof order.deliveryLatitude === "number" &&
    typeof order.deliveryLongitude === "number";
  const pickup = canMap ? { lat: order.restaurantLat, lng: order.restaurantLng } : null;
  const dropoff = canMap ? { lat: order.deliveryLatitude, lng: order.deliveryLongitude } : null;
  const modeLabel = isPickup ? "Avhämtning" : isSelfDelivery ? "Restaurangen levererar" : "ViaEats levererar";
  const Icon = isCancelled ? X : isPickup ? ShoppingBag : canMap ? Navigation : isSelfDelivery ? Bike : Package;
  const cancelledMessage =
    status === "REJECTED"
      ? "Restaurangen kunde inte ta emot ordern"
      : status === "DELIVERY_FAILED"
        ? "Leveransen kunde inte slutföras"
        : "Ordern avbröts utan debitering";

  const body = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative isolate overflow-hidden ${full ? "rounded-[20px] bg-white p-4" : "rounded-[26px] bg-white p-4 sm:p-5"} ${className}`}
      style={{
        border: "1px solid rgba(17,17,19,0.08)",
        background: full ? "#fff" : "linear-gradient(135deg, #ffffff 0%, #fffaf5 100%)",
        boxShadow: full ? "0 18px 40px rgba(17,17,19,0.10)" : "0 12px 30px rgba(17,17,19,0.08)",
      }}
    >
      {!full && <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}55)` }} />}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className={`${full ? "h-9 w-9 rounded-full" : "h-11 w-11 rounded-2xl"} grid shrink-0 place-items-center`} style={{ backgroundColor: soft }}>
            <Icon size={18} style={{ color: accent }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-secondary)" }}>
              {full ? `ORDER ${orderNumber ? `#${orderNumber}` : ""}` : "Pågående order"}
            </p>
            <h3 className="mt-0.5 truncate text-[16px] font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
              {full ? copy.title : restaurantLabel}
            </h3>
            {!full && <p className="mt-0.5 truncate text-[11px] font-bold" style={{ color: accentInk }}>{copy.short} · {modeLabel}</p>}
          </div>
        </div>
        <div className={`${full ? "rounded-full px-3 py-1.5" : "rounded-2xl px-3 py-2"} text-right`} style={{ backgroundColor: soft }}>
          <p className="text-[15px] font-black tabular-nums" style={{ color: accent }}>{isCancelled ? "Stängd" : etaLabel(order, now)}</p>
          {full ? <p className="text-[10.5px] font-bold" style={{ color: "var(--text-secondary)" }}>{modeLabel}</p> : null}
        </div>
      </div>

      <div
        className="mt-3 overflow-hidden rounded-[18px] border"
        style={{
          height: canMap ? (full ? 220 : 132) : isDone ? 104 : 76,
          backgroundColor: "#F7F7F5",
          borderColor: "rgba(17,17,19,0.07)",
        }}
      >
        {canMap && pickup && dropoff ? (
          <CourierTrackingMap pickup={pickup} dropoff={dropoff} courier={courier ?? null} accentColor={accent} />
        ) : isCancelled ? (
          <div className="flex h-full items-center justify-between gap-3 px-4">
            <div className="min-w-0">
              <p className="mt-1 line-clamp-2 text-[15px] font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                {cancelledMessage}
              </p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "#FCEBE9", color: accent }}>
              <X size={22} />
            </span>
          </div>
        ) : isDone ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <Check size={25} style={{ color: accent }} />
            <p className="mt-1.5 text-[14px] font-black" style={{ color: accent }}>
              {Number(order.rating || 0) > 0 || order.reviewedAt ? "Tack för recensionen" : isPickup ? "Redo att hämtas" : "Hoppas det smakade"}
            </p>
          </div>
        ) : (
          <div className="flex h-full items-center px-4">
            <div>
              <p className="text-[13px] font-black" style={{ color: "var(--text-primary)" }}>
                {copy.short}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] font-bold" style={{ color: full ? "var(--text-secondary)" : accentInk }}>{copy.description}</p>
            </div>
          </div>
        )}
      </div>

      {!isDone && !isCancelled ? (
        <div className="mt-2.5 min-h-[38px]">
          <div className="relative h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "#ECECE8" }}>
            <div className="h-full rounded-full" style={{ width: progress, backgroundColor: accent }} />
            <div className="tracking-sweep absolute inset-y-0 w-12 rounded-full bg-white/50" />
          </div>
          <div className="mt-2 flex justify-between gap-1">
            {labels.map((label, i) => {
              const active = tracking.activeIndex === i;
              return (
                <span
                  key={label}
                  className="flex-1 truncate text-[11px] font-bold"
                  style={{ textAlign: i === 0 ? "left" : i === labels.length - 1 ? "right" : "center", color: active ? accentInk : i < step - 1 ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[rgba(17,17,19,0.07)] pt-3">
        <p className="min-w-0 flex-1 truncate text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>{full ? restaurantLabel : `#${orderNumber}`}</p>
        <span className="inline-flex items-center gap-1 text-[12px] font-black" style={{ color: "var(--text-primary)" }}>
          {full ? "Orderdetaljer" : "Öppna tracking"} <ChevronRight size={15} />
        </span>
      </div>
    </motion.div>
  );
  if (!href) return body;
  return <Link href={href} className="block">{body}</Link>;
}

export type TrackingAd = {
  id: string;
  brand?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string;
  imageOnly?: boolean;
};

export function TrackingAdsRail({ ads }: { ads: TrackingAd[] }) {
  const [openAd, setOpenAd] = useState<TrackingAd | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(0);
  const visibleAds = useMemo(() => ads.filter((ad) => ad.imageUrl || ad.title).slice(0, 8), [ads]);

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    railRef.current?.scrollTo({ left: 0 });
  }, [visibleAds.length]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || visibleAds.length <= 1 || openAd) return;
    const timer = window.setInterval(() => {
      const next = (activeIndexRef.current + 1) % visibleAds.length;
      const slide = rail.querySelector<HTMLElement>(`[data-ad-index="${next}"]`);
      if (slide) {
        slide.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        activeIndexRef.current = next;
        setActiveIndex(next);
      }
    }, 3600);
    return () => window.clearInterval(timer);
  }, [openAd, visibleAds.length]);

  if (visibleAds.length === 0) return null;

  return (
    <section className="mt-3 overflow-hidden">
      <div
        ref={railRef}
        onScroll={(event) => {
          const rail = event.currentTarget;
          const slides = Array.from(rail.querySelectorAll<HTMLElement>("[data-ad-index]"));
          if (!slides.length) return;
          const center = rail.scrollLeft + rail.clientWidth / 2;
          let nearest = 0;
          let nearestDistance = Number.POSITIVE_INFINITY;
          slides.forEach((slide, index) => {
            const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
            const distance = Math.abs(slideCenter - center);
            if (distance < nearestDistance) {
              nearest = index;
              nearestDistance = distance;
            }
          });
          setActiveIndex(nearest);
        }}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 no-scrollbar"
      >
        {visibleAds.map((ad, index) => (
          <button
            key={ad.id}
            data-ad-index={index}
            type="button"
            onClick={() => setOpenAd(ad)}
            className="relative h-[138px] w-[calc(100vw-56px)] max-w-[380px] shrink-0 snap-center overflow-hidden rounded-[22px] p-4 text-left shadow-sm"
            style={{
              background: ad.imageUrl
                ? "#F3E7D6"
                : "linear-gradient(135deg, #F5E6D2 0%, #D8C7AD 45%, #6B655C 100%)",
              border: "1px solid rgba(17,17,19,0.06)",
            }}
          >
            {ad.imageUrl ? <img src={ad.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
            {!ad.imageOnly ? <div className="absolute inset-0 bg-gradient-to-b from-black/[0.02] via-black/20 to-black/70" /> : null}
            <div className="relative z-10 flex h-full flex-col justify-between">
              {!ad.imageOnly ? (
                <>
                  <span className="inline-flex w-fit rounded-lg bg-white/95 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] shadow-sm" style={{ color: "#F0531C" }}>
                    Annons
                  </span>
                  <div className="min-w-0 pr-2">
                    <p className="line-clamp-2 text-[21px] font-black leading-[1.08] tracking-tight text-white drop-shadow-sm">{ad.title}</p>
                    {ad.subtitle ? <p className="mt-1 line-clamp-2 text-[12.5px] font-bold leading-snug text-white/90">{ad.subtitle}</p> : null}
                  </div>
                </>
              ) : <span aria-hidden="true" />}
            </div>
          </button>
        ))}
      </div>
      {visibleAds.length > 1 ? (
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          {visibleAds.map((ad, index) => (
            <button
              key={`${ad.id}-dot`}
              type="button"
              aria-label={`Visa annons ${index + 1}`}
              onClick={() => {
                const rail = railRef.current;
                const slide = rail?.querySelector<HTMLElement>(`[data-ad-index="${index}"]`);
                if (rail && slide) rail.scrollTo({ left: slide.offsetLeft - 16, behavior: "smooth" });
                setActiveIndex(index);
              }}
              className="h-2 rounded-full transition-all"
              style={{
                width: activeIndex === index ? 18 : 7,
                backgroundColor: activeIndex === index ? "#F0531C" : "rgba(17,17,19,0.18)",
              }}
            />
          ))}
        </div>
      ) : null}

      {openAd ? (
        <div className="fixed inset-0 z-[220] bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpenAd(null)}>
          <div className="mx-auto flex h-full max-w-md items-center">
            <div className="relative w-full overflow-hidden rounded-[24px] bg-white" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setOpenAd(null)} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-black">
                <X size={18} />
              </button>
              <div className="relative h-[62vh] min-h-[420px] bg-zinc-200">
                {openAd.imageUrl ? <img src={openAd.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                {!openAd.imageOnly ? <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" /> : null}
                {!openAd.imageOnly ? (
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <p className="mb-2 inline-flex rounded-md bg-white/95 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em]" style={{ color: "#F0531C" }}>Annons</p>
                    <h3 className="text-[26px] font-black leading-tight tracking-tight">{openAd.title}</h3>
                    {openAd.subtitle ? <p className="mt-2 text-sm font-bold text-white/90">{openAd.subtitle}</p> : null}
                    {openAd.url ? (
                      <a href={openAd.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-12 items-center rounded-full bg-white px-5 text-sm font-black text-black">
                        Öppna
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
