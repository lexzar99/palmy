import { Router } from 'express';
import prisma from '../lib/prisma';
import { normalizeDeliveryZones, normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

const safeJsonParse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// GET /api/cities — include restaurants linked to each city with their unique delivery zones
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === 'true'; // ?all=true shows inactive too (for admin)
    const cities = await (prisma as any).city.findMany({ 
      where: all ? {} : { isActive: true },
      include: {
        restaurants: {
          select: { id: true, name: true, slug: true, isOpen: true, city: true, deliveryZones: true, freeDeliveryAbove: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.json(cities);
  } catch (error) {
    console.error("Cities fetch error:", error);
    res.status(500).json({ error: 'Kunde inte hämta städer' });
  }
});

// POST /api/cities — upsert city and update restaurant-specific zones
router.post('/', async (req, res) => {
  try {
    const { 
      id, name, slug, deliveryMode, zones, isActive, latitude, longitude, 
      freeDeliveryAbove, restaurantIds, restaurantZones,
      polygon, centerLat, centerLng, radiusKm
    } = req.body;
    
    const citySlug = slug || name.toLowerCase().replace(/[^a-zåäö0-9]+/gi, '-').replace(/^-|-$/g, '');
    
    const data: any = {
      name,
      deliveryMode: deliveryMode || 'ALL',
      zones: (() => {
        const parsed = typeof zones === 'string' ? safeJsonParse(zones, []) : (zones || []);
        return JSON.stringify(normalizeDeliveryZones(parsed));
      })(),
      isActive: isActive !== undefined ? isActive : true,
      latitude: latitude || null,
      longitude: longitude || null,
      polygon: polygon ? (typeof polygon === 'string' ? polygon : JSON.stringify(polygon)) : undefined,
      centerLat: centerLat ? Number(centerLat) : undefined,
      centerLng: centerLng ? Number(centerLng) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      // Input from admin UI is in kr. Store in öre.
      freeDeliveryAbove: normalizeMoneyToOre(Number(freeDeliveryAbove || 0)),
    };

    // If restaurantIds provided, update restaurant links
    if (restaurantIds && Array.isArray(restaurantIds)) {
      data.restaurants = {
        set: restaurantIds.map((rid: string) => ({ id: rid }))
      };
    }

    // Use a transaction to ensure all updates succeed or fail together
    const city = await (prisma as any).$transaction(async (tx: any) => {
      // 1. Resolve the city record first
      let cityRecord;
      if (id) {
        cityRecord = await tx.city.findUnique({ where: { id } });
      } else {
        cityRecord = await tx.city.findUnique({ where: { slug: citySlug } });
      }

      if (cityRecord) {
        // Update existing
        cityRecord = await tx.city.update({
          where: { id: cityRecord.id },
          data: {
            ...data,
            restaurants: restaurantIds ? {
              set: restaurantIds.map((rid: string) => ({ id: rid }))
            } : undefined
          },
          include: {
            restaurants: {
              select: { id: true, name: true, slug: true, isOpen: true, city: true, deliveryZones: true, freeDeliveryAbove: true }
            }
          }
        });
      } else {
        // Create new
        cityRecord = await tx.city.create({
          data: {
            ...data,
            slug: citySlug,
            id: id || undefined,
            restaurants: restaurantIds ? {
              connect: restaurantIds.map((rid: string) => ({ id: rid }))
            } : undefined
          },
          include: {
            restaurants: {
              select: { id: true, name: true, slug: true, isOpen: true, city: true, deliveryZones: true, freeDeliveryAbove: true }
            }
          }
        });
      }

      // 2. Update individual restaurant zones if provided
      if (restaurantZones && typeof restaurantZones === 'object') {
        for (const [rid, rdata] of Object.entries(restaurantZones)) {
          const zonePayload: any = rdata as any;
          const normalizedZones = (() => {
            const parsed = typeof zonePayload.zones === 'string' ? safeJsonParse(zonePayload.zones, []) : (zonePayload.zones || []);
            return JSON.stringify(normalizeDeliveryZones(parsed));
          })();
          await tx.restaurant.update({
            where: { id: rid },
            data: { 
              deliveryZones: normalizedZones,
              // Input from admin UI is in kr. Store in öre.
              freeDeliveryAbove: zonePayload.freeDeliveryAbove !== undefined ? normalizeMoneyToOre(Number(zonePayload.freeDeliveryAbove || 0)) : undefined
            }
          });
        }
      }

      return cityRecord;
    });

    res.json(city);
  } catch (error) {
    console.error("City save error:", error);
    res.status(500).json({ error: 'Kunde inte spara stad' });
  }
});

// POST /api/cities/validate-location — check if lat/lng is within any city's delivery zone
// Returns matching cities and which restaurants deliver there
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
            deliveryRadius: true, deliveryZones: true, latitude: true, longitude: true,
            featuredClass: true, cuisine: true, rating: true, isOpen: true
          }
        }
      }
    });

    // Helper: point-in-polygon using ray casting algorithm
    const pointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
      const [px, py] = point;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    // Helper: Haversine distance in km
    const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const matchedCities: any[] = [];

    for (const city of cities) {
      let cityCovers = false;

      // 1. Try polygon (most precise)
      if (city.polygon) {
        try {
          const polygon: [number, number][] = JSON.parse(city.polygon);
          // polygon is stored as [[lng, lat], ...] (GeoJSON order)
          cityCovers = pointInPolygon([lng, lat], polygon);
        } catch {}
      }

      // 2. Fallback to radius from centerLat/centerLng
      if (!cityCovers && city.centerLat && city.centerLng) {
        const dist = distanceKm(lat, lng, city.centerLat, city.centerLng);
        cityCovers = dist <= (city.radiusKm || 10);
      }

      // 3. Legacy: fallback to lat/lng field
      if (!cityCovers && city.latitude && city.longitude) {
        const dist = distanceKm(lat, lng, city.latitude, city.longitude);
        cityCovers = dist <= 10;
      }

      if (cityCovers) {
        // Now filter restaurants by their own delivery radius
        const deliverableRestaurants = city.restaurants.filter((r: any) => {
          if (!r.latitude || !r.longitude) return true; // no coords set = assume covers whole city
          const dist = distanceKm(lat, lng, r.latitude, r.longitude);
          return dist <= (r.deliveryRadius || 5);
        });

        matchedCities.push({ 
          ...city, 
          restaurants: deliverableRestaurants,
          polygon: undefined // Don't send full polygon to frontend
        });
      }
    }

    res.json({
      covered: matchedCities.length > 0,
      cities: matchedCities,
      lat,
      lng
    });
  } catch (error) {
    console.error('Zone validation error:', error);
    res.status(500).json({ error: 'Zonvalidering misslyckades' });
  }
});

// DELETE /api/cities/:id
router.delete('/:id', async (req, res) => {
  try {
    await (prisma as any).city.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte radera stad' });
  }
});

export default router;
