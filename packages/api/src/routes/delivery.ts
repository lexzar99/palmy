/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { haversineKm, findDeliveryZone, DeliveryZone } from '../utils/geo';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import { DEFAULT_DELIVERY_FEE, DEFAULT_MIN_ORDER_AMOUNT } from '../lib/restaurantSettings';

const router = Router();

/**
 * GET /api/delivery/check?lat=X&lng=Y&restaurantId=Z
 * Returns: zone info, delivery fee, min order, or error if outside coverage
 */
router.get('/check', async (req: Request, res: Response) => {
  try {
    const { lat, lng, restaurantId } = req.query;
    if (!lat || !lng || !restaurantId) {
      return res.status(400).json({ error: 'lat, lng, and restaurantId are required' });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId as string },
      include: { city_relation: true },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    if (!restaurant.latitude || !restaurant.longitude) {
      // Restaurang saknar GPS → kan inte räkna ut zone. Tidigare föll vi
      // tillbaka på restaurant.deliveryFee men det är dead column nu (admin
      // exponerar den inte). Refusa delivery och be admin sätta GPS + zon.
      return res.json({
        available: false,
        zone: null,
        message: 'Restaurangen levererar inte än — admin behöver konfigurera leveranszon.',
      });
    }

    const distanceKm = haversineKm(
      Number(lat), Number(lng),
      restaurant.latitude, restaurant.longitude
    );

    let zonesRaw: any[] = [];
    try {
      zonesRaw = JSON.parse((restaurant as any).deliveryZones || '[]');
    } catch {
      zonesRaw = [];
    }
    let zones: DeliveryZone[] = normalizeDeliveryZones(zonesRaw);

    let zoneCenter = { lat: restaurant.latitude, lng: restaurant.longitude };

    if (zones.length === 0 && restaurant.city_relation && restaurant.city_relation.zones) {
      try {
        const cityZonesRaw = JSON.parse(restaurant.city_relation.zones);
        zones = normalizeDeliveryZones(cityZonesRaw);
        if (restaurant.city_relation.centerLat && restaurant.city_relation.centerLng) {
          zoneCenter = { lat: restaurant.city_relation.centerLat, lng: restaurant.city_relation.centerLng };
        } else if (restaurant.city_relation.latitude && restaurant.city_relation.longitude) {
          zoneCenter = { lat: restaurant.city_relation.latitude, lng: restaurant.city_relation.longitude };
        }
      } catch {}
    }

    if (zones.length === 0) {
      // Inga zoner konfigurerade → restaurang kan inte leverera. Tidigare
      // föll vi tillbaka på restaurant.deliveryFee men admin har inget
      // sätt att sätta den i UI:n och det orsakade dubbelkällor av
      // sanning. Be admin lägga till zoner via /admin/cities-or-zones.
      return res.json({
        available: false,
        zone: null,
        distanceKm: Math.round(distanceKm * 10) / 10,
        message: 'Restaurangen har inga aktiva leveranszoner. Välj avhämtning.',
      });
    }

    // Use restaurant/city location as fallback center for legacy zones (no own centerLat/centerLng)
    const matchedZone = findDeliveryZone(
      Number(lat), Number(lng), zones,
      zoneCenter
    );

    if (!matchedZone) {
      return res.json({
        available: false,
        distanceKm: Math.round(distanceKm * 10) / 10,
        message: 'Tyvärr levererar vi inte till din adress.'
      });
    }

    // Check if free delivery applies
    const freeAbove = (restaurant as any).freeDeliveryAbove;

    return res.json({
      available: true,
      zone: matchedZone.name,
      deliveryFee: matchedZone.fee / 100,
      minOrder: matchedZone.minOrder / 100,
      freeDeliveryAbove: freeAbove ? freeAbove / 100 : null,
      distanceKm: Math.round(distanceKm * 10) / 10
    });
  } catch (err) {
    console.error('Delivery check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
