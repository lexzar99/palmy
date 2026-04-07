/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { haversineKm, findDeliveryZone, DeliveryZone } from '../utils/geo';
import { normalizeDeliveryZones } from '../utils/deliveryZones';

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
      where: { id: restaurantId as string }
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    if (!restaurant.latitude || !restaurant.longitude) {
      // No GPS set — fall back to restaurant's default delivery fee
      return res.json({
        available: true,
        zone: null,
        deliveryFee: (restaurant.deliveryFee || 0) / 100,
        minOrder: (restaurant.minOrderAmount || 0) / 100,
        distanceKm: null,
        message: 'GPS ej konfigurerat för restaurangen. Standardavgift används.'
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
    const zones: DeliveryZone[] = normalizeDeliveryZones(zonesRaw);

    if (zones.length === 0) {
      // No zones configured — use default
      return res.json({
        available: true,
        zone: null,
        deliveryFee: (restaurant.deliveryFee || 0) / 100,
        minOrder: (restaurant.minOrderAmount || 0) / 100,
        distanceKm: Math.round(distanceKm * 10) / 10
      });
    }

    const matchedZone = findDeliveryZone(distanceKm, zones);

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
