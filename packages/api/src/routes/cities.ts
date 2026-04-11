import { Router } from 'express';
import prisma from '../lib/prisma';
import { normalizeDeliveryZones, normalizeMoneyToOre } from '../utils/deliveryZones';
import { isPointInZone, pointInPolygon, haversineKm, findDeliveryZone, DeliveryZone } from '../utils/geo';

const router = Router();

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

// ── GET /api/cities ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const cities = await (prisma as any).city.findMany({
      where: all ? {} : { isActive: true },
      include: {
        restaurants: {
          select: {
            id: true, name: true, slug: true, isOpen: true, city: true,
            deliveryZones: true, freeDeliveryAbove: true,
            latitude: true, longitude: true,
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.json(cities);
  } catch (err) {
    console.error('Cities fetch error:', err);
    res.status(500).json({ error: 'Kunde inte hämta städer' });
  }
});

// ── POST /api/cities — upsert city ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      id, name, slug, deliveryMode, zones, isActive,
      latitude, longitude, centerLat, centerLng, radiusKm, polygon,
      freeDeliveryAbove, restaurantIds, restaurantZones,
    } = req.body;

    const citySlug = slug || (name || '').toLowerCase().replace(/[^a-zåäö0-9]+/gi, '-').replace(/^-|-$/g, '');

    // Normalise zones — pass through new geometry fields
    const zonesRaw = typeof zones === 'string' ? safeJsonParse(zones, []) : (zones || []);
    const normalizedZones = normalizeDeliveryZones(zonesRaw);

    const data: any = {
      name,
      deliveryMode: deliveryMode || 'ALL',
      zones: JSON.stringify(normalizedZones),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      latitude:  latitude  ? Number(latitude)  : null,
      longitude: longitude ? Number(longitude) : null,
      centerLat: centerLat ? Number(centerLat) : undefined,
      centerLng: centerLng ? Number(centerLng) : undefined,
      radiusKm:  radiusKm  ? Number(radiusKm)  : undefined,
      polygon: polygon
        ? (typeof polygon === 'string' ? polygon : JSON.stringify(polygon))
        : null,
      freeDeliveryAbove: normalizeMoneyToOre(Number(freeDeliveryAbove || 0)),
    };

    const city = await (prisma as any).$transaction(async (tx: any) => {
      let cityRecord: any;

      if (id) {
        cityRecord = await tx.city.findUnique({ where: { id } });
      } else {
        cityRecord = await tx.city.findUnique({ where: { slug: citySlug } });
      }

      const include = {
        restaurants: {
          select: {
            id: true, name: true, slug: true, isOpen: true, city: true,
            deliveryZones: true, freeDeliveryAbove: true,
          }
        }
      };

      if (cityRecord) {
        cityRecord = await tx.city.update({
          where: { id: cityRecord.id },
          data: {
            ...data,
            ...(restaurantIds ? { restaurants: { set: restaurantIds.map((rid: string) => ({ id: rid })) } } : {}),
          },
          include,
        });
      } else {
        cityRecord = await tx.city.create({
          data: {
            ...data,
            slug: citySlug,
            ...(restaurantIds ? { restaurants: { connect: restaurantIds.map((rid: string) => ({ id: rid })) } } : {}),
          },
          include,
        });
      }

      // Update per-restaurant delivery zones and pricing
      if (restaurantZones && typeof restaurantZones === 'object') {
        for (const [rid, rdata] of Object.entries(restaurantZones)) {
          const rz = rdata as any;
          const rzRaw = typeof rz.zones === 'string' ? safeJsonParse(rz.zones, []) : (rz.zones || []);
          const rzNorm = normalizeDeliveryZones(rzRaw);
          await tx.restaurant.update({
            where: { id: rid },
            data: {
              deliveryZones: JSON.stringify(rzNorm),
              ...(rz.freeDeliveryAbove !== undefined
                ? { freeDeliveryAbove: normalizeMoneyToOre(Number(rz.freeDeliveryAbove || 0)) }
                : {}),
            },
          });
        }
      }

      return cityRecord;
    });

    res.json(city);
  } catch (err) {
    console.error('City save error:', err);
    res.status(500).json({ error: 'Kunde inte spara stad' });
  }
});

// ── POST /api/cities/validate-location ───────────────────────────────────────
// Returns which cities + zones cover the given lat/lng,
// plus which restaurants in each city can deliver there.
router.post('/validate-location', async (req, res) => {
  try {
    const { lat, lng } = req.body as { lat: number; lng: number };
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng required' });

    const cities = await (prisma as any).city.findMany({
      where: { isActive: true },
      include: {
        restaurants: {
          where: { isOpen: true },
          select: {
            id: true, name: true, slug: true, imageUrl: true, heroImageUrl: true,
            deliveryFee: true, minOrderAmount: true, etaMinutes: true,
            deliveryRadius: true, deliveryZones: true,
            latitude: true, longitude: true,
            featuredClass: true, cuisine: true, rating: true, isOpen: true,
          }
        }
      }
    });

    const matchedCities: any[] = [];

    for (const city of cities) {
      // Parse this city's delivery zones
      const cityZonesRaw = safeJsonParse<any[]>(city.zones, []);
      const cityZones = normalizeDeliveryZones(cityZonesRaw);

      const cityCenter = (city.centerLat && city.centerLng)
        ? { lat: city.centerLat, lng: city.centerLng }
        : (city.latitude && city.longitude)
          ? { lat: city.latitude, lng: city.longitude }
          : undefined;

      // Find if the point falls in any city zone
      const matchedZone = cityZones.length > 0
        ? findDeliveryZone(lat, lng, cityZones, cityCenter)
        : null;

      let cityCovers = matchedZone !== null;

      // Fallback: if no zones defined, check polygon or radius
      if (!cityCovers && cityZones.length === 0) {
        if (city.polygon) {
          try {
            const poly: [number, number][] = JSON.parse(city.polygon);
            cityCovers = pointInPolygon([lng, lat], poly);
          } catch { /* ignore */ }
        }
        if (!cityCovers && cityCenter) {
          cityCovers = haversineKm(lat, lng, cityCenter.lat, cityCenter.lng) <= (city.radiusKm || 10);
        }
      }

      if (!cityCovers) continue;

      // For each restaurant, check if IT covers the address
      const deliverableRestaurants = city.restaurants
        .map((r: any) => {
          // Restaurant may have its own zones
          const rZonesRaw = safeJsonParse<any[]>(r.deliveryZones, []);
          const rZones = normalizeDeliveryZones(rZonesRaw);

          let rZone: DeliveryZone | null = null;

          if (rZones.length > 0) {
            // Restaurant uses its own zones
            rZone = findDeliveryZone(lat, lng, rZones, cityCenter);
            if (!rZone) return null; // restaurant doesn't cover this address
          } else {
            // Restaurant inherits city zones
            rZone = matchedZone;
            // Extra check: restaurant delivery radius (legacy)
            if (r.latitude && r.longitude) {
              const dist = haversineKm(lat, lng, r.latitude, r.longitude);
              if (dist > (r.deliveryRadius || 50)) return null;
            }
          }

          return {
            ...r,
            matchedZone: rZone
              ? {
                  id: rZone.id,
                  name: rZone.name,
                  deliveryFee: rZone.fee,
                  minOrder: rZone.minOrder,
                }
              : null,
          };
        })
        .filter(Boolean);

      matchedCities.push({
        id: city.id,
        name: city.name,
        slug: city.slug,
        deliveryMode: city.deliveryMode,
        matchedZone: matchedZone
          ? { id: matchedZone.id, name: matchedZone.name, deliveryFee: matchedZone.fee, minOrder: matchedZone.minOrder }
          : null,
        restaurants: deliverableRestaurants,
      });
    }

    res.json({
      covered: matchedCities.length > 0,
      cities: matchedCities,
      lat,
      lng,
    });
  } catch (err) {
    console.error('Zone validation error:', err);
    res.status(500).json({ error: 'Zonvalidering misslyckades' });
  }
});

// ── DELETE /api/cities/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await (prisma as any).city.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Kunde inte radera stad' });
  }
});

export default router;
