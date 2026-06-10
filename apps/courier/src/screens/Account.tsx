import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { HistoryOrder } from "../lib/types";
import { Bike, Car, PowerOff } from "lucide-react";
import { dayLabel, km, kr, timeOfDay } from "../lib/format";
import { useSession } from "../lib/sessionctx";
import { AppBar, Card, GhostButton, Spinner } from "../ui";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function range(preset: Preset, from: string, to: string): [Date, Date] {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  if (preset === "today") return [startOfDay(now), endOfDay(now)];
  if (preset === "yesterday") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return [startOfDay(y), endOfDay(y)];
  }
  if (preset === "7d") {
    const s = new Date();
    s.setDate(s.getDate() - 6);
    return [startOfDay(s), endOfDay(now)];
  }
  if (preset === "30d") {
    const s = new Date();
    s.setDate(s.getDate() - 29);
    return [startOfDay(s), endOfDay(now)];
  }
  return [startOfDay(new Date(from)), endOfDay(new Date(to))];
}

export function Account() {
  const { courier, logout } = useAuth();
  const { end } = useSession();
  const [ending, setEnding] = useState(false);
  const [history, setHistory] = useState<HistoryOrder[] | null>(null);
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(() => isoDate(new Date()));

  useEffect(() => {
    api.getHistory().then(setHistory);
  }, []);

  const filtered = useMemo(() => {
    if (!history) return [];
    const [start, end] = range(preset, from, to);
    return history.filter((o) => {
      const d = new Date(o.deliveredAt).getTime();
      return d >= start.getTime() && d <= end.getTime();
    });
  }, [history, preset, from, to]);

  const total = filtered.reduce((s, o) => s + o.payout, 0);

  const CHIPS: { p: Preset; label: string }[] = [
    { p: "today", label: "Idag" },
    { p: "yesterday", label: "Igår" },
    { p: "7d", label: "7 dgr" },
    { p: "30d", label: "30 dgr" },
    { p: "custom", label: "Egen" },
  ];

  return (
    <div className="px-5 pb-28">
      <AppBar title="Konto" />

      <div className="mt-4 mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-xl font-black text-gold">
          {(courier?.name || "K").slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black leading-tight">{courier?.name}</p>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted">
            {courier?.vehicle === "CAR" ? <Car size={15} /> : <Bike size={15} />}
            {courier?.vehicle === "CAR" ? "Bil" : "Cykel"} · {courier?.email}
          </p>
        </div>
      </div>

      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {CHIPS.map(({ p, label }) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${preset === p ? "bg-ink text-white" : "border border-[var(--color-line)] bg-white text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="mb-3 flex items-center gap-2">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm" />
          <span className="text-muted">–</span>
          <input type="date" value={to} min={from} max={isoDate(new Date())} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm" />
        </div>
      )}

      <Card className="mb-4 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Intjänat</p>
            <p className="mt-1 text-4xl font-black tracking-tight">{kr(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Ordrar</p>
            <p className="mt-1 text-2xl font-black">{filtered.length}</p>
          </div>
        </div>
      </Card>

      {history === null ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Inga leveranser i perioden.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={o.id} className="flex items-center justify-between px-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-bold">{o.restaurantName}</p>
                <p className="mt-0.5 text-xs text-muted">
                  #{o.orderNumber} · {dayLabel(o.deliveredAt)} {timeOfDay(o.deliveredAt)} · {km(o.distanceKm)}
                </p>
              </div>
              <p className="ml-3 shrink-0 font-black text-gold-deep">{kr(o.payout)}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <GhostButton onClick={async () => { setEnding(true); try { await end(); } finally { setEnding(false); } }}>
          {ending ? <Spinner /> : <span className="flex items-center justify-center gap-2"><PowerOff size={16} /> Avsluta session</span>}
        </GhostButton>
        <button onClick={logout} className="w-full py-1 text-sm font-bold text-muted">Logga ut</button>
      </div>
    </div>
  );
}
