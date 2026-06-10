import { useRef, useState, type ReactNode } from "react";
import type { LatLng } from "./lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-[var(--color-line)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "green" | "muted" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "muted"
        ? "bg-zinc-100 text-zinc-500"
        : "bg-gold-soft text-gold-deep";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{children}</span>;
}

export function GoldButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-gold py-3.5 text-[15px] font-extrabold text-ink transition active:scale-[0.99] disabled:opacity-40"
    >
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
  return (
    <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-gold ${className}`} />
  );
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
    <a
      href={gmapsLink(to, label)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[14px] font-bold text-white transition active:scale-[0.99]"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-6-5.686-6-10a6 6 0 1112 0c0 4.314-6 10-6 10z" />
        <circle cx="12" cy="11" r="2" />
      </svg>
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
    <button onClick={copy} className="shrink-0 rounded-lg px-1.5 py-1 text-muted active:scale-95" aria-label="Kopiera adress">
      {done ? (
        <span className="text-xs font-bold text-emerald-600">Kopierad ✓</span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

/** Adressrad med kopiera-knapp. */
export function AddressRow({ address }: { address: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-[13px] leading-snug text-muted">📍 {address}</p>
      <CopyButton text={address} />
    </div>
  );
}

/** Dra knappen till slutet för att bekräfta (matchar mockupens swipe-flöde). */
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
    <div
      ref={trackRef}
      className={`relative h-[60px] w-full select-none overflow-hidden rounded-2xl ${disabled ? "bg-zinc-100" : "bg-gold-soft"}`}
    >
      <div className="absolute inset-0 flex items-center justify-center text-[14px] font-bold text-gold-deep">
        {done ? "✓ Klart" : label}
      </div>
      <div
        onPointerDown={(e) => begin(e.clientX, e.currentTarget, e.pointerId)}
        onPointerMove={(e) => move(e.clientX)}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute top-1 left-1 flex h-[52px] w-[52px] touch-none items-center justify-center rounded-xl bg-gold text-ink shadow"
        style={{ transform: `translateX(${x}px)`, transition: dragging.current ? "none" : "transform 0.2s" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}

export function gmapsLink(to: LatLng, label?: string) {
  const q = label ? encodeURIComponent(label) : `${to.lat},${to.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&destination_place_id=&travelmode=driving&query=${q}`;
}
