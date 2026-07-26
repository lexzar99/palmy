"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, MessageSquareWarning, Phone, Receipt, X } from "lucide-react";

const CourierTrackingMap = dynamic(() => import("@/components/CourierTrackingMap"), { ssr: false });

// Andningstemat på webben — samma tanke som i iOS-appen.
//
// Self-delivery får ingen karta alls: restaurangen kör själva och vi har ingen
// position att visa. Vi-levererar behåller kartan, men först när budet faktiskt
// hämtat maten — dessförinnan är det tiden som bär vyn.
//
// Prognosen hittar aldrig på något. Finns en uppdaterad prognos från backend
// visas den och märks som uppdaterad. Annars visas den ursprungliga tiden.
// Ordet "försenad" finns inte i den här filen.

export type BreathingPhase = "waiting" | "preparing" | "onTheWay" | "readyForPickup" | "done";

const TINTS: Record<BreathingPhase, string> = {
  waiting: "#F0531C",
  preparing: "#FAA81A",
  // Resan orange → ljusblå: köket är varmt, vägen hem är sval.
  onTheWay: "#33A3FC",
  readyForPickup: "#12A05A",
  done: "#12A05A",
};

export function phaseTint(phase: BreathingPhase): string {
  return TINTS[phase];
}

export function phaseHeadline(phase: BreathingPhase): string {
  return phaseTitle(phase);
}

const ON_WAY_STATUSES = ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"];
const DONE_STATUSES = ["DELIVERED", "COMPLETED"];

export function resolvePhase(order: any): BreathingPhase {
  const status = String(order?.status || "PENDING").toUpperCase();
  const isPickup = String(order?.orderType || order?.type || "DELIVERY").toUpperCase() === "PICKUP";
  if (DONE_STATUSES.includes(status)) return isPickup ? "readyForPickup" : "done";
  if (isPickup && status === "READY") return "readyForPickup";
  if (ON_WAY_STATUSES.includes(status)) return isPickup ? "readyForPickup" : "onTheWay";
  if (status === "PREPARING" || status === "ACCEPTED" || status === "READY") return "preparing";
  return "waiting";
}

function phaseTitle(phase: BreathingPhase): string {
  switch (phase) {
    case "waiting": return "Vi väntar på restaurangen";
    case "preparing": return "Mottagen och förbereds";
    case "onTheWay": return "På väg";
    case "readyForPickup": return "Redo att hämtas";
    case "done": return "Klart";
  }
}

function phaseSubtitle(phase: BreathingPhase, restaurant: string): string {
  switch (phase) {
    case "waiting": return `${restaurant} svarar oftast inom en minut.`;
    case "preparing": return "Köket förbereder din mat.";
    case "onTheWay": return "Maten har lämnat restaurangen.";
    case "readyForPickup": return "Visa ordernumret i restaurangen.";
    case "done": return "Hoppas det smakade.";
  }
}

function clockText(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

/** När ordern fick sitt ursprungslöfte (accepten) beräknas vara framme. */
function promisedAtMs(order: any): number | null {
  const start = order?.preparingAt ?? order?.createdAt ?? null;
  const minutes = Number(order?.estimatedTime);
  if (!start || !Number.isFinite(minutes) || minutes <= 0) return null;
  const startMs = new Date(start as string).getTime();
  return Number.isFinite(startMs) ? startMs + minutes * 60000 : null;
}

/**
 * Hög belastning: restaurangen lovade >60 min, ordern är inte på väg och den
 * först visade 50-minutersprognosen har passerats (backend har då trappat upp
 * måltiden med +15). Kunden ska få en lugn förklaring — inte ordet försenad.
 */
function highLoad(order: any, phase: BreathingPhase): boolean {
  if (phase !== "preparing" && phase !== "waiting") return false;
  const minutes = Number(order?.estimatedTime);
  if (!Number.isFinite(minutes) || minutes <= 60) return false;
  const start = order?.preparingAt ?? order?.createdAt ?? null;
  if (!start) return false;
  const startMs = new Date(start as string).getTime();
  return Number.isFinite(startMs) && Date.now() - startMs >= 50 * 60000;
}

/** Uppdaterad prognos vinner när den finns — annars den ursprungliga tiden. */
function forecast(order: any, phase: BreathingPhase) {
  const revised = order?.etaRevisedAt ?? null;
  const target = revised ?? order?.etaEndsAt ?? null;
  const clock = clockText(target);
  const minutesLeft = target
    ? Math.max(0, Math.ceil((new Date(target as string).getTime() - Date.now()) / 60000))
    : null;

  // Jämför på väg-prognosen (avfärd + restaurangens valda tid) mot
  // ursprungslöftet: tidigare → glädjebesked, senare → "uppdaterad prognos"
  // med klockslag. Ordet "försenad" används aldrig.
  const targetMs = target ? new Date(target as string).getTime() : null;
  const promised = promisedAtMs(order);
  let earlier = false;
  let later = false;
  if (phase === "onTheWay" && targetMs != null && promised != null) {
    earlier = targetMs <= promised - 3 * 60000;
    later = targetMs >= promised + 3 * 60000;
  }

  let label: string;
  if (phase === "waiting") label = "Tid kommer när köket svarat";
  else if (phase === "done") label = "Klar";
  else if (phase === "readyForPickup") label = "Redo nu";
  else if (phase === "onTheWay") {
    label = earlier ? "Kommer tidigare än beräknat" : later || revised ? "Uppdaterad prognos" : "Beräknad vara här";
  } else label = "Beräknad framme";

  return {
    label,
    clock: phase === "waiting" || phase === "done" ? null : clock,
    minutesLeft,
    revised: Boolean(revised) || later,
    earlier,
  };
}

// ── Andningen ───────────────────────────────────────────────────────────────

function BreathingHero({ phase, children }: { phase: BreathingPhase; children: React.ReactNode }) {
  const tint = TINTS[phase];
  const calm = phase !== "waiting";
  const cycle = calm ? 4.4 : 1.6;

  return (
    <div className="relative mx-auto grid place-items-center" style={{ height: 300, width: 300 }}>
      {[0, 1, 2].map((layer) => (
        <motion.div
          key={layer}
          aria-hidden
          className="absolute"
          style={{
            width: 268 - layer * 22,
            height: 268 - layer * 22,
            backgroundColor: tint,
            opacity: calm ? 0.13 : 0.18,
          }}
          animate={{
            scale: [0.94, 1.05, 0.94],
            borderRadius: ["38%", "48%", "38%"],
            rotate: [layer * -14, layer * 22, layer * -14],
          }}
          transition={{
            duration: cycle,
            repeat: Infinity,
            ease: "easeInOut",
            delay: layer * (calm ? 0.4 : 0.14),
          }}
        />
      ))}

      <motion.div
        aria-hidden
        className="absolute"
        style={{
          width: 218,
          height: 218,
          background: `linear-gradient(135deg, ${tint} 0%, ${tint}d0 100%)`,
          boxShadow: `0 22px 48px ${tint}59`,
        }}
        animate={{ scale: [0.97, 1.03, 0.97], borderRadius: ["37%", "47%", "37%"] }}
        transition={{ duration: cycle, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 grid place-items-center px-6 text-center" style={{ width: 218 }}>
        {children}
      </div>
    </div>
  );
}

/** Kort, energisk sekvens direkt efter betalningen. Lägger sig av sig själv. */
function PlacedBurst({ tint }: { tint: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      {[0, 1, 2, 3].map((ring) => (
        <motion.span
          key={ring}
          className="absolute rounded-full"
          style={{ width: 150, height: 150, border: `2.5px solid ${tint}` }}
          initial={{ scale: 0.25, opacity: 0.85 }}
          animate={{ scale: 2.7, opacity: 0 }}
          transition={{ duration: 1.5, delay: ring * 0.18, ease: "easeOut" }}
        />
      ))}
      {Array.from({ length: 12 }).map((_, spark) => (
        <motion.span
          key={spark}
          className="absolute rounded-full"
          style={{ width: 7, height: 7, backgroundColor: tint, rotate: `${spark * 30}deg` }}
          initial={{ y: -20, opacity: 1 }}
          animate={{ y: -150, opacity: 0 }}
          transition={{ duration: 1.2, delay: spark * 0.02, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ── Steg ────────────────────────────────────────────────────────────────────

function StepRail({ phase }: { phase: BreathingPhase }) {
  const tint = TINTS[phase];
  const steps = ["Skickad", "Förbereds", "På väg"];
  const activeIndex = phase === "waiting" ? 0 : phase === "preparing" ? 1 : 2;

  return (
    <div className="mx-auto mt-6 flex max-w-[320px] gap-2">
      {steps.map((label, index) => (
        <div key={label} className="flex-1">
          <motion.div
            className="h-[5px] rounded-full"
            initial={false}
            animate={{ backgroundColor: index <= activeIndex ? tint : "rgba(17,17,19,0.10)" }}
            transition={{ duration: 0.5 }}
          />
          <p
            className="mt-1.5 text-center text-[10px] font-black"
            style={{ color: index <= activeIndex ? "var(--text-primary)" : "var(--text-secondary)" }}
          >
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Kontaktpanel ────────────────────────────────────────────────────────────

function ContactModal({ order, onClose }: { order: any; onClose: () => void }) {
  const phone = String(order?.restaurantPhone || "").replace(/[^\d+]/g, "");
  const orderNo = order?.orderNumber ? `#${order.orderNumber}` : `#${String(order?.id || "").slice(-6).toUpperCase()}`;
  const restName = order?.restaurantName || "Restaurangen";
  const restAddr = [order?.restaurantAddress, order?.restaurantCity].filter(Boolean).join(", ");
  const smsBody = encodeURIComponent(`Hej! Order ${orderNo} har inte kommit fram än. Kan ni kolla?`);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1900] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="w-full max-w-md rounded-t-[28px] p-5 sm:rounded-[28px]"
        style={{ backgroundColor: "var(--bg-primary)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[19px] font-black tracking-tight" style={{ color: "var(--text-primary)" }}>{restName}</p>
            <p className="mt-0.5 text-[12.5px] font-bold" style={{ color: "var(--text-secondary)" }}>
              {order?.selfDelivery ? "Restaurangen kör ut den här ordern" : "ViaEats kör ut den här ordern"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          {phone ? (
            <a
              href={`tel:${phone}`}
              target="_top"
              className="flex items-center gap-3.5 rounded-[18px] border bg-white p-4 active:opacity-70"
              style={{ borderColor: "rgba(17,17,19,0.08)" }}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "#E7F6EE", color: "#12A05A" }}>
                <Phone size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black" style={{ color: "var(--text-primary)" }}>Ring restaurangen</span>
                <span className="mt-0.5 block truncate text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>{order.restaurantPhone}</span>
              </span>
            </a>
          ) : (
            <div className="rounded-[18px] border bg-white p-4" style={{ borderColor: "rgba(17,17,19,0.08)" }}>
              <p className="text-[15px] font-black" style={{ color: "var(--text-primary)" }}>Inget telefonnummer</p>
              <p className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>Restaurangen har inte lämnat något.</p>
            </div>
          )}

          {restAddr ? (
            <div className="flex items-center gap-3.5 rounded-[18px] border bg-white p-4" style={{ borderColor: "rgba(17,17,19,0.08)" }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                <MapPin size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black" style={{ color: "var(--text-primary)" }}>Adress</span>
                <span className="mt-0.5 block text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>{restAddr}</span>
              </span>
            </div>
          ) : null}

          {phone ? (
            <a
              href={`sms:${phone}${/iPhone|iPad|Macintosh/.test(typeof navigator === "undefined" ? "" : navigator.userAgent) ? "&" : "?"}body=${smsBody}`}
              target="_top"
              className="flex items-center gap-3.5 rounded-[18px] p-4 active:opacity-70"
              style={{ backgroundColor: "#FFF0EA", color: "#F0531C" }}
            >
              <MessageSquareWarning size={20} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black">Jag har inte fått min mat</span>
                <span className="mt-0.5 block text-[11.5px] font-bold opacity-80">Skickar ett meddelande till restaurangen</span>
              </span>
            </a>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Panelen ─────────────────────────────────────────────────────────────────

export function BreathingTrackingPanel({
  order,
  courier,
  onOpenInfo,
}: {
  order: any;
  courier?: { lat: number; lng: number } | null;
  onOpenInfo: () => void;
}) {
  const [showContact, setShowContact] = useState(false);
  const [burstDone, setBurstDone] = useState(false);
  const [, setTick] = useState(0);

  const phase = resolvePhase(order);
  const tint = TINTS[phase];
  const restName = order?.restaurantName || "Restaurangen";
  const { label, clock, minutesLeft, revised, earlier } = forecast(order, phase);
  const busyKitchen = highLoad(order, phase);
  const isSelfDelivery = String(order?.orderType || order?.type || "DELIVERY").toUpperCase() === "DELIVERY" && !!order?.selfDelivery;

  // Kartan hör bara hemma när vi levererar OCH budet faktiskt har maten.
  const showMap =
    !isSelfDelivery &&
    phase === "onTheWay" &&
    typeof order?.restaurantLat === "number" &&
    typeof order?.restaurantLng === "number" &&
    typeof order?.deliveryLatitude === "number" &&
    typeof order?.deliveryLongitude === "number";

  useEffect(() => {
    const timer = window.setTimeout(() => setBurstDone(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  // Håll minuträkningen levande utan att räkna om hela sidan.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const departed = clockText(order?.deliveringAt);

  return (
    <div className="relative">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px]"
        initial={false}
        animate={{ background: `radial-gradient(120% 70% at 50% 0%, ${tint}22 0%, transparent 70%)` }}
        transition={{ duration: 0.9 }}
      />

      <div className="relative">
        {!burstDone && phase === "waiting" ? <PlacedBurst tint={tint} /> : null}
        <BreathingHero phase={phase}>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] font-black uppercase leading-tight tracking-[0.07em] text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.22)" }}
          >
            {revised && phase === "onTheWay" ? <span aria-hidden>↻</span> : null}
            {label}
          </span>

          {clock ? (
            <>
              <p
                className="mt-2 whitespace-nowrap text-[54px] font-black leading-none tracking-[-0.03em] text-white tabular-nums"
                style={{ textShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
              >
                {clock}
              </p>
              {minutesLeft != null ? (
                <p className="mt-1.5 whitespace-nowrap text-[12.5px] font-black text-white/90">
                  {minutesLeft <= 0 ? "när som helst nu" : `ca ${minutesLeft} min kvar`}
                </p>
              ) : null}
            </>
          ) : phase === "done" || phase === "readyForPickup" ? (
            <p className="mt-2 text-[46px] font-black leading-none text-white">✓</p>
          ) : (
            <p className="mt-2 text-[34px] font-black leading-none text-white/60">· · ·</p>
          )}
        </BreathingHero>
      </div>

      <div className="mt-1 text-center">
        <motion.h1
          key={phase}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[28px] font-black leading-tight tracking-[-0.02em]"
          style={{ color: "var(--text-primary)" }}
        >
          {phaseTitle(phase)}
        </motion.h1>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[14px] font-bold" style={{ color: "var(--text-secondary)" }}>
          {phase === "onTheWay" && earlier
            ? "Vi beräknar att din mat kommer tidigare än väntat."
            : phase === "onTheWay" && revised
              ? "Uppdaterad prognos — maten är utanför restaurangen och på väg till dig. Oroa dig inte."
              : phaseSubtitle(phase, restName)}
        </p>
        {busyKitchen ? (
          <span className="mt-2.5 inline-flex rounded-full px-3 py-1.5 text-[11.5px] font-black" style={{ backgroundColor: "#FFF7DB", color: "#8A5B00" }}>
            Hög belastning på restaurangen · prognosen är uppdaterad
          </span>
        ) : null}
        {phase === "onTheWay" && departed ? (
          <span className="mt-2.5 inline-flex rounded-full px-3 py-1.5 text-[11.5px] font-black" style={{ backgroundColor: `${tint}1f`, color: tint }}>
            Lämnade restaurangen kl {departed}
          </span>
        ) : null}
      </div>

      <StepRail phase={phase} />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setShowContact(true)}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] border text-[14.5px] font-black transition active:scale-[0.98]"
          style={{ backgroundColor: `${tint}17`, borderColor: `${tint}38`, color: tint }}
        >
          <Phone size={17} />
          Kontakt
        </button>
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] border text-[14.5px] font-black transition active:scale-[0.98]"
          style={{ backgroundColor: `${tint}17`, borderColor: `${tint}38`, color: tint }}
        >
          <Receipt size={17} />
          Orderinfo
        </button>
      </div>

      {showMap ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-6 overflow-hidden rounded-[24px] border"
          style={{ height: 210, borderColor: "rgba(17,17,19,0.08)", backgroundColor: "#F7F7F5" }}
        >
          <CourierTrackingMap
            pickup={{ lat: order.restaurantLat, lng: order.restaurantLng }}
            dropoff={{ lat: order.deliveryLatitude, lng: order.deliveryLongitude }}
            courier={courier ?? null}
            accentColor={tint}
          />
        </motion.div>
      ) : null}

      <div className="h-20" aria-hidden />

      <AnimatePresence>
        {showContact ? <ContactModal order={order} onClose={() => setShowContact(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}
