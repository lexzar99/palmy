import prisma from './prisma';
import { getIO } from './socket';
import { bustCache } from './ttlCache';
import { menuCacheBust } from '../routes/menu';

// Den "bullriga" fan-outen (socket-emit till alla klienter + web SSR-revalidate)
// — separerad så den kan debouncas. Cache-bust ligger UTANFÖR (alltid synkron).
function fanoutMenuChange(restaurantId: string | null, payload: Record<string, unknown>) {
  const event = { restaurantId, ...payload, at: new Date().toISOString() };
  if (restaurantId) getIO().to(`menu:${restaurantId}`).emit('menu:changed', event);
  getIO().to('admin-room').emit('menu:changed', event);
  if (restaurantId) getIO().to(`admin-room:${restaurantId}`).emit('menu:changed', event);
  // Fire-and-forget: rensa kund-webbens SSR-cache för denna slug.
  void revalidateWebMenu(restaurantId);
}

// Per-restaurang debounce-state för fan-outen (leading + trailing).
const menuBroadcastState = new Map<string, { timer: NodeJS.Timeout; pending: boolean; restaurantId: string | null; payload: Record<string, unknown> }>();
const MENU_BROADCAST_WINDOW_MS = 1200;

/**
 * Broadcast a menu change so customer apps refresh in real-time and
 * the server-side TTL cache for /api/menu/categories is busted.
 * Idempotent — safe to call after every product/category/extra mutation.
 *
 * Cache-bust körs SYNKRONT varje anrop (korrekthet). Den bullriga fan-outen
 * (socket-emit + web-revalidate) DEBOUNCAS per restaurang: leading edge emittar
 * direkt (enstaka redigering känns omedelbar), och en burst (t.ex. bulk-pris på
 * 50 produkter via parallella PATCH) coalescas till EN trailing emit ~1.2s
 * efter sista ändringen — i stället för 50 emits/revalidates mot varje klient.
 */
export function broadcastMenuChange(restaurantId: string | null, payload: Record<string, unknown> = {}) {
  try {
    menuCacheBust(restaurantId);
    // The public restaurant list (?withMenu) and the /:slug detail both embed the
    // full menu in a SEPARATE cache, so a menu change must clear them too — else
    // the menu looks updated on the menu route but stale on those.
    bustCache('rest:detail');
    bustCache('rest:list');
    // Deals cachas 30s i /api/deals. En ny/ändrad deal måste busta den så
    // restaurangsidor och kassan inte visar stale kampanjdata.
    bustCache('deals:public');
  } catch (err) {
    console.warn('[menu] cache bust failed', err);
  }

  const key = restaurantId ?? '_global';
  const existing = menuBroadcastState.get(key);
  if (!existing) {
    // Leading edge — emit direkt och öppna ett suppressions-fönster.
    try { fanoutMenuChange(restaurantId, payload); } catch (err) { console.warn('[menu] broadcast failed', err); }
    const timer = setTimeout(() => {
      const st = menuBroadcastState.get(key);
      menuBroadcastState.delete(key);
      // Trailing — bara om fler ändringar kom under fönstret (annars redan emittat).
      if (st?.pending) {
        try { fanoutMenuChange(st.restaurantId, st.payload); } catch (err) { console.warn('[menu] trailing broadcast failed', err); }
      }
    }, MENU_BROADCAST_WINDOW_MS);
    menuBroadcastState.set(key, { timer, pending: false, restaurantId, payload });
  } else {
    // Inom fönstret — markera trailing-emit och behåll senaste payload.
    existing.pending = true;
    existing.restaurantId = restaurantId;
    existing.payload = payload;
  }
}

// POST to the customer web app's on-demand revalidation endpoint so the SSR'd
// menu for this restaurant refreshes instantly on any menu change. Safe no-op
// until REVALIDATE_SECRET + FRONTEND_URL are configured on both services.
async function revalidateWebMenu(restaurantId: string | null) {
  if (!restaurantId) return;
  const secret = process.env.REVALIDATE_SECRET;
  const webUrl = process.env.FRONTEND_URL;
  if (!secret || !webUrl) return;
  try {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });
    if (!r?.slug) return;
    const axios = (await import('axios')).default;
    await axios.post(
      `${webUrl.replace(/\/$/, '')}/api/revalidate`,
      { slug: r.slug },
      { headers: { 'x-revalidate-secret': secret }, timeout: 4000 },
    );
  } catch (err) {
    console.warn('[menu] web revalidate failed', (err as any)?.message ?? err);
  }
}
