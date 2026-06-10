export const kr = (n: number) =>
  `${Math.round(Number(n) || 0).toLocaleString("sv-SE")} kr`;

export const km = (n: number) => `${(Number(n) || 0).toFixed(1).replace(".", ",")} km`;

/** Sekunder kvar tills en tidsstämpel (golvat vid 0). */
export const secondsLeft = (epochMs: number) => Math.max(0, Math.round((epochMs - Date.now()) / 1000));

export const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Idag";
  if (same(d, yest)) return "Igår";
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "short" });
};

export const timeOfDay = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
