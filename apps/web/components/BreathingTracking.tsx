"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, MessageSquareWarning, Phone, Receipt, X } from "lucide-react";
import {
  DONE_STATUSES,
  forecastLabel,
  isPickupOrder,
  ON_WAY_STATUSES,
  phaseSubtitle,
  phaseTitle,
  resolvePhase,
  stepIndex,
  stepLabels,
  type BreathingPhase,
} from "@/lib/trackingPhase";

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
function forecast(order: any, phase: BreathingPhase, pickup = false) {
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

  const label = forecastLabel({ phase, pickup, earlier, later, revised: Boolean(revised) });

  return {
    label,
    clock: phase === "waiting" || phase === "done" ? null : clock,
    minutesLeft,
    revised: Boolean(revised) || later,
    earlier,
  };
}

// ── Andningen ───────────────────────────────────────────────────────────────

// Lagren bakom huvudformen har varsin egen, statisk organisk radie i stället
// för en animerad. Att animera border-radius tvingar fram en ommålning varje
// bildruta — med fyra samtidiga lager blev de första sekunderna hackiga precis
// när sidan också hydrerar. Nu rör sig de tre bakre lagren enbart med
// transform (scale/rotate), som webbläsaren kan lämna till GPU:n. Huvudformen
// behåller sin morf: ett enda element klarar den utan att det märks.
const HERO_LAYERS = [
  { size: "89.3%", radius: "42% 58% 47% 53%", spin: 14 },
  { size: "81.9%", radius: "56% 44% 59% 41%", spin: -18 },
  { size: "74.6%", radius: "47% 53% 41% 59%", spin: 12 },
];

function BreathingHero({ phase, children }: { phase: BreathingPhase; children: React.ReactNode }) {
  const tint = TINTS[phase];
  const calm = phase !== "waiting";
  const cycle = calm ? 4.4 : 1.6;

  return (
    // Kvadratisk och elastisk: på en 320 px-telefon krympte en fast 300 px-hero
    // ut över sidkanten och gjorde spårningen sidledes dragbar.
    <div
      className="relative mx-auto grid w-full place-items-center overflow-hidden"
      style={{ maxWidth: 300, aspectRatio: "1 / 1" }}
    >
      {HERO_LAYERS.map((layer, index) => (
        <motion.div
          key={layer.radius}
          aria-hidden
          className="absolute"
          style={{
            width: layer.size,
            height: layer.size,
            backgroundColor: tint,
            opacity: calm ? 0.13 : 0.18,
            borderRadius: layer.radius,
            willChange: "transform",
          }}
          animate={{
            scale: [0.94, 1.05, 0.94],
            rotate: [-layer.spin, layer.spin, -layer.spin],
          }}
          transition={{
            duration: cycle,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * (calm ? 0.4 : 0.14),
          }}
        />
      ))}

      <motion.div
        aria-hidden
        className="absolute"
        style={{
          width: "72.7%",
          height: "72.7%",
          background: `linear-gradient(135deg, ${tint} 0%, ${tint}d0 100%)`,
          boxShadow: `0 22px 48px ${tint}59`,
          willChange: "transform, border-radius",
        }}
        animate={{ scale: [0.97, 1.03, 0.97], borderRadius: ["37%", "47%", "37%"] }}
        transition={{ duration: cycle, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Texten ligger inuti formen som andas. Smal padding så tiden får vara
          stor utan att nudda kanten. */}
      <div className="relative z-10 grid place-items-center px-2 text-center" style={{ width: "72.7%" }}>
        {children}
      </div>
    </div>
  );
}

/** Kort, energisk sekvens direkt efter betalningen. Lägger sig av sig själv. */
function PlacedBurst({ tint }: { tint: string }) {
  return (
    // overflow-hidden: ringarna växer långt utanför heron och gjorde annars
    // sidan dragbar i sidled under de första sekunderna.
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          className="absolute rounded-full"
          style={{ width: 150, height: 150, border: `2.5px solid ${tint}`, willChange: "transform, opacity" }}
          initial={{ scale: 0.25, opacity: 0.85 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 1.5, delay: ring * 0.18, ease: "easeOut" }}
        />
      ))}
      {Array.from({ length: 8 }).map((_, spark) => (
        <motion.span
          key={spark}
          className="absolute rounded-full"
          style={{ width: 7, height: 7, backgroundColor: tint, rotate: `${spark * 45}deg`, willChange: "transform, opacity" }}
          initial={{ y: -20, opacity: 1 }}
          animate={{ y: -140, opacity: 0 }}
          transition={{ duration: 1.2, delay: spark * 0.03, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ── Steg ────────────────────────────────────────────────────────────────────

function StepRail({ phase, pickup }: { phase: BreathingPhase; pickup: boolean }) {
  const tint = TINTS[phase];
  // Sista steget skiljer sig: en hämtorder blir klar i restaurangen, den åker
  // aldrig iväg någonstans.
  const steps = stepLabels(pickup);
  const activeIndex = stepIndex(phase);

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
  const pickup = isPickupOrder(order);
  const { label, clock, minutesLeft, revised, earlier } = forecast(order, phase, pickup);
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
          {/* Etiketten är ren text på formen — ingen platta och ingen ram runt
              om. Den ska läsas som en del av det som andas, inte som en bricka
              ovanpå. Skuggan bär kontrasten i stället för en bakgrund. */}
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-black uppercase leading-tight tracking-[0.08em] text-white"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.28)" }}
          >
            {revised && phase === "onTheWay" ? <span aria-hidden>↻</span> : null}
            {label}
          </span>

          {clock ? (
            <>
              <p
                className="mt-2.5 whitespace-nowrap text-[66px] font-black leading-none tracking-[-0.035em] text-white tabular-nums"
                style={{ textShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
              >
                {clock}
              </p>
              {minutesLeft != null ? (
                <p
                  className="mt-2 whitespace-nowrap text-[15.5px] font-black text-white"
                  style={{ textShadow: "0 1px 8px rgba(0,0,0,0.24)" }}
                >
                  {minutesLeft <= 0 ? "när som helst nu" : `ca ${minutesLeft} min kvar`}
                </p>
              ) : null}
            </>
          ) : phase === "done" || phase === "readyForPickup" ? (
            <p className="mt-2.5 text-[58px] font-black leading-none text-white">✓</p>
          ) : (
            <p className="mt-2.5 text-[42px] font-black leading-none text-white/70">· · ·</p>
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
          {phaseTitle(phase, pickup)}
        </motion.h1>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[14px] font-bold" style={{ color: "var(--text-secondary)" }}>
          {phase === "onTheWay" && earlier
            ? "Vi beräknar att din mat kommer tidigare än väntat."
            : phase === "onTheWay" && revised
              ? "Uppdaterad prognos — maten är utanför restaurangen och på väg till dig. Oroa dig inte."
              : phaseSubtitle(phase, restName, pickup)}
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

      <StepRail phase={phase} pickup={pickup} />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setShowContact(true)}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] text-[14.5px] font-black text-white transition active:scale-[0.98]"
          style={{ backgroundColor: tint }}
        >
          <Phone size={17} />
          Kontakt
        </button>
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] text-[14.5px] font-black text-white transition active:scale-[0.98]"
          style={{ backgroundColor: tint }}
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
          // Sidan i övrigt tillåter bara lodrät dragning; kartan måste få
          // panorera fritt i sin egen ruta.
          style={{ height: 210, borderColor: "rgba(17,17,19,0.08)", backgroundColor: "#F7F7F5", touchAction: "auto" }}
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
