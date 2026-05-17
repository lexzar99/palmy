/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { haversineKm } from '../utils/geo';
import { resolveDeliveryFee } from '../utils/deliveryZones';

const router = Router();

/**
 * GET /api/delivery/check?lat=X&lng=Y&restaurantId=Z
 *
 * Delegerar till `resolveDeliveryFee` som är SAMMA logik som
 * /api/cities/validate-location (kassan) och orders.ts (server-side
 * verifiering). Tidigare hade denna endpoint EGEN strängare logik som
 * gjorde att kassan visade "vi levererar hit" men Slutför Köp-knappen
 * rejectade samma adress (zones tomma men city-polygon täckte).
 *
 * Returns: { available, zone, deliveryFee, minOrder, distanceKm } eller
 * { available: false, message } om utanför täckning.
 */
router.get('/check', async (req: Request, res: Response) => {
  try {
    const { lat, lng, restaurantId } = req.query;
    if (!lat || !lng || !restaurantId) {
      return res.status(400).json({ error: 'lat, lng, and restaurantId are required' });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId as string },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    const distanceKm =
      restaurant.latitude && restaurant.longitude
        ? Math.round(haversineKm(latNum, lngNum, restaurant.latitude, restaurant.longitude) * 10) / 10
        : null;

    const resolved = await resolveDeliveryFee(
      restaurant as any,
      latNum,
      lngNum,
      prisma as any,
    );

    if (!resolved) {
      return res.json({
        available: false,
        zone: null,
        distanceKm,
        message: 'Tyvärr levererar vi inte till din adress.',
      });
    }

    const freeAbove = (restaurant as any).freeDeliveryAbove;

    return res.json({
      available: true,
      zone: null, // zone-namn skickas inte längre — kassan bryr sig om fee+min, inte namnet
      deliveryFee: resolved.fee / 100,
      minOrder: resolved.minOrder / 100,
      freeDeliveryAbove: freeAbove ? freeAbove / 100 : null,
      distanceKm,
    });
  } catch (err) {
    console.error('Delivery check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
