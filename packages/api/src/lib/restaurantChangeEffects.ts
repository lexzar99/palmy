import prisma from './prisma';
import { getIO } from './socket';
import { bustCache, bustRestaurantCaches } from './ttlCache';
import { revalidateWebRestaurant } from './revalidate';
import { resolveRestaurantAvailability } from './restaurantAvailability';
import { oreToSek } from '../utils/money';
import { menuCacheBust } from '../routes/menu';

/**
 * Det som ska hända efter att restaurangens inställningar (öppettider, zoner)
 * ändrats, så att kassan, embedden, restaurangsajterna och Hermes ser samma sak
 * direkt. Samma steg som i slutet av PATCH /api/restaurants/:id:
 *  1. API:ts egna cacher töms först,
 *  2. sedan webbens cache (restaurant:/menu:/deals:<slug>, alltså även
 *     status-adressen som sajterna läser),
 *  3. och öppna klienter får settings:updated.
 * Allt är best effort: ett fel här får aldrig fälla en sparning som redan gått igenom.
 */
export async function afterRestaurantSettingsChanged(restaurantId: string): Promise<void> {
  try {
    const [restaurant, platform] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: { city_relation: { select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true } } },
      }),
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
    ]);
    if (!restaurant) return;

    bustRestaurantCaches(restaurant.slug);
    bustCache('rest:detail', restaurant.id);
    try { menuCacheBust(restaurant.id); } catch { /* noop */ }
    void revalidateWebRestaurant(restaurant.slug);

    const availability = resolveRestaurantAvailability(restaurant as any, { city: restaurant.city_relation, platform });
    const pausedUntil = restaurant.pausedUntil ? new Date(restaurant.pausedUntil) : null;
    getIO().emit('settings:updated', {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      isOpen: availability.isOpen,
      manualIsOpen: availability.legacyManualIsOpen,
      scheduledOpenNow: availability.scheduledOpenNow,
      acceptingOrdersMode: availability.configuredMode,
      availabilityReason: availability.reason,
      pausedUntil: pausedUntil?.toISOString() ?? null,
      isPaused: availability.restaurantPaused,
      deliveryFee: oreToSek(restaurant.deliveryFee),
      minOrderAmount: oreToSek(restaurant.minOrderAmount),
      etaMinutes: restaurant.etaMinutes,
      selfDelivery: restaurant.selfDelivery ?? false,
      pickupOnly: (restaurant as any).pickupOnly ?? false,
    });
  } catch (error) {
    console.warn('[restaurantChangeEffects] följdeffekter misslyckades:', (error as Error)?.message ?? error);
  }
}
