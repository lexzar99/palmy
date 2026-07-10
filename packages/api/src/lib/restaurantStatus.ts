import prisma from './prisma';
import { isRestaurantOpen } from './openingHours';
import { getIO } from './socket';
import { resolveRestaurantAvailability } from './restaurantAvailability';

let statusCheckInFlight = false;

export async function checkAllRestaurantsStatus() {
  if (statusCheckInFlight) {
    return;
  }

  statusCheckInFlight = true;

  // console.log('[Watchdog] Checking all restaurants status...');
  try {
    const [restaurants, platformSettings] = await Promise.all([prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        openingHours: true,
        scheduledOpenNow: true,
        acceptingOrdersMode: true,
        acceptingOrdersOverrideUntil: true,
        acceptingOrdersOverrideReason: true,
        pausedUntil: true,
        draft: true,
        comingSoon: true,
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
        slug: true
      }
    }), prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })]);

    for (const r of restaurants) {
      const shouldBeOpen = isRestaurantOpen(r.openingHours);
      const currentScheduleProjection = r.scheduledOpenNow;

      if (shouldBeOpen !== currentScheduleProjection) {
        console.log(`[Watchdog] Schedule projection for ${r.name}: ${currentScheduleProjection} -> ${shouldBeOpen}`);
        const updated = await prisma.restaurant.update({
          where: { id: r.id },
          // The watchdog owns only this projection. It must never rewrite
          // acceptingOrdersMode, crisis overlays, or the legacy manual flag.
          data: { scheduledOpenNow: shouldBeOpen }
        });
        const availability = resolveRestaurantAvailability(
          { ...r, scheduledOpenNow: shouldBeOpen },
          { city: r.city_relation, platform: platformSettings },
        );

        // Broadcast per-restaurant change
        getIO().emit('settings:updated', {
          restaurantId: updated.id,
          slug: updated.slug,
          isOpen: availability.isOpen,
          manualIsOpen: availability.legacyManualIsOpen,
          scheduledOpenNow: shouldBeOpen,
          acceptingOrdersMode: availability.configuredMode,
          availabilityReason: availability.reason,
        });
        
        // Also notify the admin room specific to this restaurant
        getIO().to(`admin-room:${updated.id}`).emit('status:auto-updated', {
          isOpen: availability.isOpen,
          scheduledOpenNow: shouldBeOpen,
          message: `Schemat är nu ${shouldBeOpen ? 'öppet' : 'stängt'}; effektiv status är ${availability.isOpen ? 'öppen' : 'stängd'}.`
        });
      }
    }
  } catch (error) {
    console.error('[Watchdog] Error checking restaurant status:', error);
  } finally {
    statusCheckInFlight = false;
  }
}
