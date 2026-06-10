import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, MapPin, Navigation } from "lucide-react";
import type { LatLng } from "./lib/types";

/** Ren topp-bar: håller sig kvar i toppen, respekterar notch (safe-area). */
export function AppBar({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <header
      className="sticky top-0 z-10 -mx-5 flex items-center gap-3 border-b border-[var(--color-line)] bg-canvas/85 px-5 pb-3 backdrop-blur-md"
      style={{ paddingTop: "max(0.85rem, env(safe-area-inset-top))" }}
    >
      {onBack && (
        <button onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-white active:scale-95">
          <ArrowLeft size={18} />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[19px] font-black tracking-tight">{title}</h1>
      {right}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-[var(--color-line)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${className}`}>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "green" | "muted" | "blue" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "muted"
          ? "bg-zinc-100 text-zinc-500"
          : "bg-gold-soft text-gold-deep";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{children}</span>;
}

export function GoldButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 text-[15px] font-extrabold text-ink transition active:scale-[0.99] disabled:opacity-40">
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-2xl border border-[var(--color-line)] bg-white py-3 text-[14px] font-bold text-ink active:scale-[0.99]">
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-gold ${className}`} />;
}

export function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

/** Premium men flat: solid ink-knapp för Google Maps-navigering. */
export function MapsButton({ to, label }: { to: LatLng; label?: string }) {
  return (
    <a href={gmapsLink(to, label)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[14px] font-bold text-white transition active:scale-[0.99]">
      <Navigation size={16} strokeWidth={2.4} />
      Öppna i Google Maps
    </a>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard kan vara blockad — ignorera tyst */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-muted active:scale-95" aria-label="Kopiera adress">
      {done ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
    </button>
  );
}

/** Adressrad med pin-ikon + kopiera-knapp. */
export function AddressRow({ address }: { address: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="flex items-start gap-1.5 text-[13px] leading-snug text-muted">
        <MapPin size={15} className="mt-0.5 shrink-0" />
        {address}
      </p>
      <CopyButton text={address} />
    </div>
  );
}

/** Dra knappen till slutet för att bekräfta. */
export function SwipeButton({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  const dragging = useRef(false);
  const start = useRef(0);
  const max = useRef(0);
  const KNOB = 52;

  const begin = (clientX: number, target: Element, pointerId: number) => {
    if (disabled || done) return;
    dragging.current = true;
    start.current = clientX - x;
    max.current = (trackRef.current?.clientWidth ?? 0) - KNOB - 8;
    (target as HTMLElement).setPointerCapture?.(pointerId);
  };
  const move = (clientX: number) => {
    if (!dragging.current) return;
    setX(Math.max(0, Math.min(max.current, clientX - start.current)));
  };
  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setX((cur) => {
      if (cur >= max.current * 0.82) {
        setDone(true);
        setTimeout(onConfirm, 120);
        return max.current;
      }
      return 0;
    });
  };

  return (
    <div ref={trackRef} className={`relative h-[60px] w-full select-none overflow-hidden rounded-2xl ${disabled ? "bg-zinc-100" : "bg-gold-soft"}`}>
      <div className={`absolute inset-0 flex items-center justify-center text-[14px] font-bold ${disabled ? "text-zinc-400" : "text-gold-deep"}`}>
        {done ? "Klart" : label}
      </div>
      <div
        onPointerDown={(e) => begin(e.clientX, e.currentTarget, e.pointerId)}
        onPointerMove={(e) => move(e.clientX)}
        onPointerUp={end}
        onPointerCancel={end}
        className={`absolute top-1 left-1 flex h-[52px] w-[52px] touch-none items-center justify-center rounded-xl shadow ${disabled ? "bg-zinc-300 text-zinc-500" : "bg-gold text-ink"}`}
        style={{ transform: `translateX(${x}px)`, transition: dragging.current ? "none" : "transform 0.2s" }}
      >
        {done ? <Check size={22} strokeWidth={2.5} /> : <ArrowRight size={22} strokeWidth={2.5} />}
      </div>
    </div>
  );
}

export function gmapsLink(to: LatLng, label?: string) {
  const q = label ? encodeURIComponent(label) : `${to.lat},${to.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving&query=${q}`;
}
