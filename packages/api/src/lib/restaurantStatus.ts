import prisma from './prisma';
import { getIO } from './socket';
import { resolveRestaurantAvailability } from './restaurantAvailability';
import { bustCache, bustRestaurantCaches } from './ttlCache';
import { buildRestaurantStatusMaintenance } from './restaurantStatusMaintenance';

let statusCheckInFlight = false;

export async function checkAllRestaurantsStatus() {
  if (statusCheckInFlight) {
    return;
  }

  statusCheckInFlight = true;

  // console.log('[Watchdog] Checking all restaurants status...');
  try {
    const [restaurants, platformSettings] = await Promise.all([prisma.restaurant.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        openingHours: true,
        scheduledOpenNow: true,
        acceptingOrdersMode: true,
        acceptingOrdersOverrideUntil: true,
        acceptingOrdersOverrideReason: true,
        pausedUntil: true,
        selfDelivery: true,
        draft: true,
        comingSoon: true,
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
        slug: true
      }
    }), prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })]);

    for (const r of restaurants) {
      const now = new Date();
      const maintenance = buildRestaurantStatusMaintenance(r, now);

      if (maintenance.changed) {
        const changes = [
          maintenance.scheduleChanged
            ? `schedule ${r.scheduledOpenNow} -> ${maintenance.scheduledOpenNow}`
            : null,
          maintenance.pauseExpired ? 'pause expired' : null,
          maintenance.overrideExpired ? 'manual override expired' : null,
        ].filter(Boolean).join(', ');
        console.log(`[Watchdog] Restaurant status maintenance for ${r.name}: ${changes}`);
        const updated = await prisma.restaurant.update({
          where: { id: r.id },
          // The watchdog owns the schedule projection and expiry cleanup for
          // time-bound restaurant pauses/overrides. It must not touch indefinite
          // FORCE_CLOSED, FORCE_OPEN, or crisis overlays.
          data: maintenance.update,
          select: { id: true, slug: true },
        });
        const availability = resolveRestaurantAvailability(
          maintenance.restaurantForAvailability,
          { city: r.city_relation, platform: platformSettings },
          now,
        );
        const nextPausedUntil = maintenance.restaurantForAvailability.pausedUntil
          ? new Date(maintenance.restaurantForAvailability.pausedUntil)
          : null;
        const activePausedUntil = nextPausedUntil && nextPausedUntil.getTime() > now.getTime()
          ? nextPausedUntil.toISOString()
          : null;
        const payload = {
          restaurantId: updated.id,
          slug: updated.slug,
          isOpen: availability.isOpen,
          manualIsOpen: availability.legacyManualIsOpen,
          scheduledOpenNow: maintenance.scheduledOpenNow,
          acceptingOrdersMode: availability.configuredMode,
          effectiveAcceptingOrdersMode: availability.effectiveMode,
          acceptingOrdersOverrideUntil: availability.overrideUntil,
          acceptingOrdersOverrideActive: availability.manualOverrideActive,
          availabilityReason: availability.reason,
          pausedUntil: activePausedUntil,
          isPaused: availability.restaurantPaused,
          selfDelivery: r.selfDelivery ?? false,
        };

        // Broadcast per-restaurant change
        getIO().emit('settings:updated', payload);
        
        // Also notify the admin room specific to this restaurant
        getIO().to(`admin-room:${updated.id}`).emit('status:auto-updated', {
          ...payload,
          message: `Schemat är nu ${maintenance.scheduledOpenNow ? 'öppet' : 'stängt'}; effektiv status är ${availability.isOpen ? 'öppen' : 'stängd'}.`
        });
        bustRestaurantCaches(updated.slug);
        bustCache('rest:detail', updated.id);
      }
    }
  } catch (error) {
    console.error('[Watchdog] Error checking restaurant status:', error);
  } finally {
    statusCheckInFlight = false;
  }
}
