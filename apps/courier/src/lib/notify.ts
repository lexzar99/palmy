// Notiser när en ny order kommer till budet.
// - I appen (synlig): ljud-chime + vibration.
// - I bakgrunden (appen öppen men flik ej i fokus): system-notis (spelar OS-ljud).
// - Helt stängd app: kräver Web Push/native (Capacitor) — separat steg.

let ctx: AudioContext | null = null;

export function playChime() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx!.destination);
      const t = now + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t);
      o.stop(t + 0.18);
    });
  } catch {
    /* ljud ej tillgängligt */
  }
}

export function vibrate() {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* ignore */
  }
}

/** Be om notis-tillstånd (anropas efter user-gesture, t.ex. sessionsstart). */
export function ensureNotifyPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

/** Signal vid ny order: ljud + vibration + ev. system-notis om appen är i bakgrunden. */
export function alertNewOrder(count: number, restaurant?: string) {
  playChime();
  vibrate();
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification("Ny order 🛵", {
        body: restaurant ? `${restaurant} — ny leverans tillgänglig` : `${count} ${count === 1 ? "ny order" : "nya ordrar"} tillgänglig`,
        tag: "viaeats-new-order",
        requireInteraction: true,
      });
    }
  } catch {
    /* ignore */
  }
}
