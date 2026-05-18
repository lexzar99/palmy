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
            freeDeliveryAbove: true, // EXCLUDED deliveryZones
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
// RESTAURANG-FÖRST lookup (Foodora-pattern). City-zones används INTE längre
// som primärt täckningskriterium — varje restaurang har egna deliveryZones
// (polygon/cirkel) som styr om den kan leverera till given adress.
//
// Fallback per restaurang om INGA egna zoner: cirkel med deliveryRadius runt
// restaurangens lat/lng. Saknas lat/lng → restaurangen kan inte verifieras
// och inkluderas inte.
//
// Svaret behåller `cities[]`-strukturen för bakåtkompat (web/RN grupperar
// resultaten per stad), men `cities[].restaurants[]` populeras nu uteslutande
// från restaurang-zoner.
router.post('/validate-location', async (req, res) => {
  try {
    const { lat, lng } = req.body as { lat: number; lng: number };
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng required' });

    const cities = await (prisma as any).city.findMany({
      where: { isActive: true },
      include: {
        restaurants: {
          select: {
            id: true, name: true, slug: true, imageUrl: true, heroImageUrl: true,
            deliveryFee: true, minOrderAmount: true, etaMinutes: true,
            deliveryRadius: true, deliveryZones: true,
            latitude: true, longitude: true, placeId: true,
            featuredClass: true, cuisine: true, rating: true, isOpen: true,
          }
        }
      }
    });

    const matchedCities: any[] = [];

    for (const city of cities) {
      const cityCenter = (city.centerLat && city.centerLng)
        ? { lat: city.centerLat, lng: city.centerLng }
        : (city.latitude && city.longitude)
          ? { lat: city.latitude, lng: city.longitude }
          : undefined;

      // För varje restaurang: kolla DESS egen täckning. Ingen city-arv längre.
      const deliverableRestaurants = city.restaurants
        .map((r: any) => {
          const rZonesRaw = safeJsonParse<any[]>(r.deliveryZones, []);
          const rZones = normalizeDeliveryZones(rZonesRaw);

          let rZone: DeliveryZone | null = null;

          if (rZones.length > 0) {
            // Primary: restaurang-zoner (polygon/cirkel ritade i admin)
            rZone = findDeliveryZone(lat, lng, rZones, cityCenter);
            if (!rZone) return null;
          } else if (r.latitude != null && r.longitude != null) {
            // Fallback: ingen zon definierad → använd deliveryRadius som cirkel
            // runt restaurangen. Detta är default-state innan admin ritat egna zoner.
            const dist = haversineKm(lat, lng, r.latitude, r.longitude);
            const radius = r.deliveryRadius || 5;
            if (dist > radius) return null;
            rZone = {
              id: 'default',
              name: 'Standard',
              type: 'circle',
              centerLat: r.latitude,
              centerLng: r.longitude,
              radiusKm: radius,
              fee: r.deliveryFee || 0,
              minOrder: r.minOrderAmount || 0,
              etaMinutes: r.etaMinutes ?? null,
              isActive: true,
            } as DeliveryZone;
          } else {
            // Ingen zon OCH ingen lat/lng → kan inte verifiera täckning.
            return null;
          }

          return {
            ...r,
            matchedZone: {
              id: rZone.id,
              name: rZone.name,
              deliveryFee: rZone.fee,
              minOrder: rZone.minOrder,
              etaMinutes: rZone.etaMinutes ?? null,
            },
          };
        })
        .filter(Boolean);

      // Bara inkludera städer som faktiskt har leverande restauranger till
      // denna adress — slipper tomma city-noder i response.
      if (deliverableRestaurants.length === 0) continue;

      matchedCities.push({
        id: city.id,
        name: city.name,
        slug: city.slug,
        deliveryMode: city.deliveryMode,
        // matchedZone på city-nivå sätts till null — vi använder inte längre
        // city-täckning för leverans-beslut. Behålls i schema för svaret för
        // bakåtkompat (web/RN-klienter läser fältet defensivt).
        matchedZone: null,
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
