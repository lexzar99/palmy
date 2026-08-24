/**
 * Enda stället i adminpanelen som laddar Google Maps JS API.
 *
 * Två separata laddare var en fälla: den som laddade först vann, och sidan som
 * kom sedan fick ett API utan sitt bibliotek. Går man t.ex. från /orders
 * (livekartan) till /zones finns `window.google` redan, och zon-editorn hade
 * då stått utan `geometry`. Därför laddar alla samma URL med samma bibliotek.
 *
 * Ingen versionspinning: `v=3.62` är pensionerad och serveras ändå som senaste
 * version, och DrawingManager finns inte kvar sedan v3.65 (zon-editorn ritar
 * med egna mus-events i stället).
 */

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
const LIBRARIES = "geometry";

declare global {
  interface Window {
    google: any;
    _viaeatsGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

type LoaderState = "idle" | "loading" | "ready" | "auth_error" | "load_error";
type Waiter = { ok: () => void; err: (error: unknown) => void };

let state: LoaderState = "idle";
const waiters: Waiter[] = [];
const authErrorHandlers = new Set<() => void>();

const resolveWaiters = () => waiters.splice(0).forEach((waiter) => waiter.ok());
const rejectWaiters = (error: Error) => waiters.splice(0).forEach((waiter) => waiter.err(error));

/**
 * Registrera en lyssnare för nyckel-/faktureringsfel. Google anropar
 * `gm_authFailure` först efter att skriptet laddats klart, alltså efter att
 * `loadGoogleMaps()` redan resolvat — därför behövs den här vid sidan om.
 * Returnerar en avregistrerare att köra i effektens cleanup.
 */
export function onGoogleMapsAuthError(handler: () => void): () => void {
  authErrorHandlers.add(handler);
  if (state === "auth_error") handler();
  return () => {
    authErrorHandlers.delete(handler);
  };
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  window.gm_authFailure = () => {
    state = "auth_error";
    authErrorHandlers.forEach((handler) => handler());
    rejectWaiters(new Error("auth_error"));
  };

  if (state === "ready" || window.google?.maps) {
    state = "ready";
    return Promise.resolve();
  }

  if (state === "auth_error" || state === "load_error") return Promise.reject(new Error(state));
  if (!MAPS_KEY) return Promise.reject(new Error("Google Maps-nyckel saknas"));
  if (state === "loading") return new Promise<void>((ok, err) => waiters.push({ ok, err }));

  state = "loading";
  return new Promise<void>((ok, err) => {
    waiters.push({ ok, err });

    window._viaeatsGoogleMapsReady = () => {
      state = "ready";
      resolveWaiters();
    };

    const script = document.createElement("script");
    script.dataset.viaeatsGoogleMaps = "1";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&loading=async&libraries=${LIBRARIES}&callback=_viaeatsGoogleMapsReady`;
    script.onerror = () => {
      state = "load_error";
      rejectWaiters(new Error("load_error"));
    };
    document.head.appendChild(script);
  });
}
