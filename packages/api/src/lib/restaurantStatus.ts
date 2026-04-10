import prisma from './prisma';
import { isRestaurantOpen } from './openingHours';
import { getIO } from './socket';

export async function checkAllRestaurantsStatus() {
  // console.log('[Watchdog] Checking all restaurants status...');
  try {
    const restaurants = await prisma.restaurant.findMany();
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
    
    for (const r of restaurants) {
      const shouldBeOpen = isRestaurantOpen(r.openingHours);
      const currentStatus = r.isOpen;
      
      console.log(`[Watchdog] ${r.name}: shouldBeOpen=${shouldBeOpen}, currentStatus=${currentStatus}`);

      if (shouldBeOpen !== currentStatus) {
        console.log(`[Watchdog] !!! STATUS MISMATCH for ${r.name}: Changing ${currentStatus} -> ${shouldBeOpen}`);
        const updated = await prisma.restaurant.update({
          where: { id: r.id },
          data: { isOpen: shouldBeOpen }
        });

        // Sync global RestaurantSettings so Hero.tsx / Navbar.tsx polling stays correct
        try {
          await prisma.restaurantSettings.upsert({
            where: { id: 'settings' },
            update: { isOpen: shouldBeOpen },
            create: { id: 'settings', isOpen: shouldBeOpen, deliveryFee: 0, minOrderAmount: 0 },
          });
        } catch { /* non-critical */ }

        // Broadcast per-restaurant change
        getIO().emit('settings:updated', {
          restaurantId: updated.id,
          slug: updated.slug,
          isOpen: shouldBeOpen,
          manualIsOpen: shouldBeOpen
        });

        // Broadcast global change (picked up by Hero.tsx / Navbar.tsx)
        getIO().emit('settings:updated', { isOpen: shouldBeOpen });
        
        // Also notify the admin room specific to this restaurant
        getIO().to(`admin-room:${updated.id}`).emit('status:auto-updated', {
          isOpen: shouldBeOpen,
          message: `Restaurangen har ${shouldBeOpen ? 'öppnats' : 'stängts'} automatiskt enligt schema.`
        });
      }
    }
  } catch (error) {
    console.error('[Watchdog] Error checking restaurant status:', error);
  }
}
