import { Router } from 'express';
import prisma from '../lib/prisma';
import { normalizeDeliveryZones, normalizeMoneyToOre } from '../utils/deliveryZones';
import { isPointInZone, pointInPolygon, haversineKm, findDeliveryZone, DeliveryZone } from '../utils/geo';
import { getEffectiveZoneEta } from '../lib/restaurantZoneEta';
import { resolveOrCreateCity, getCityFamilyIds } from '../lib/cityResolver';

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

// ── GET /api/cities/family-by-name?name=Arlöv ─────────────────────────────
// Web kallar denna när kund anger adress för att veta vilka cityIds som ska
// visas (parent + alla syskon). Returnerar {effectiveId, name, familyIds[]}.
// Lookup går via samma resolver som restaurant-create → alias + parent.
router.get('/family-by-name', async (req, res) => {
  try {
    const name = (req.query.name as string || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    // Vi vill INTE skapa ny stad här (det är admin-action). Bara lookup.
    const all = await (prisma as any).city.findMany({
      select: { id: true, name: true, slug: true, aliases: true, parentCityId: true },
    });
    const lower = name.toLowerCase();
    let match = all.find((c: any) => c.name.toLowerCase() === lower);
    if (!match) {
      match = all.find((c: any) => {
        try { return (JSON.parse(c.aliases || '[]') as string[]).some((a) => a.toLowerCase() === lower); }
        catch { return false; }
      });
    }
    if (!match) return res.json({ effectiveId: null, name, familyIds: [] });

    // Effective = parent om finns, annars self
    const effectiveId = match.parentCityId || match.id;
    const family = await (prisma as any).city.findMany({
      where: { OR: [{ id: effectiveId }, { parentCityId: effectiveId }] },
      select: { id: true, name: true },
    });
    res.json({
      effectiveId,
      name: family.find((c: any) => c.id === effectiveId)?.name ?? name,
      familyIds: family.map((c: any) => c.id),
      familyNames: family.map((c: any) => c.name),
    });
  } catch (err) {
    console.error('Cities family lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ── GET /api/cities/hierarchy ────────────────────────────────────────────────
// Returnerar städer ordnade som tree (parents först + children grupperade
// under). Används av admin-Städer-sektionen i /zones för att visa hierarkin.
router.get('/hierarchy', async (_req, res) => {
  try {
    const all = await (prisma as any).city.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { restaurants: true } } },
    });
    type Node = {
      id: string; name: string; slug: string; isActive: boolean;
      restaurantCount: number; aliases: string[]; parentCityId: string | null;
      children: Node[];
    };
    const byId = new Map<string, Node>();
    for (const c of all) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        slug: c.slug,
        isActive: c.isActive,
        restaurantCount: c._count?.restaurants ?? 0,
        aliases: (() => { try { return JSON.parse(c.aliases || '[]'); } catch { return []; } })(),
        parentCityId: c.parentCityId ?? null,
        children: [],
      });
    }
    const roots: Node[] = [];
    for (const node of byId.values()) {
      if (node.parentCityId && byId.has(node.parentCityId)) {
        byId.get(node.parentCityId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    res.json(roots);
  } catch (err) {
    console.error('Cities hierarchy fetch error:', err);
    res.status(500).json({ error: 'Kunde inte hämta stad-hierarki' });
  }
});

// ── PATCH /api/cities/:id/merge ──────────────────────────────────────────────
// Slå ihop denna stad som BARN under en annan stad. Restaurangerna behåller
// sin cityId (de bor fortfarande i Arlöv tekniskt) men resolven returnerar
// Malmö när Google säger "Arlöv". Web-filter visar hela familjen.
//
// Sätt parentCityId till null för att lossa.
router.patch('/:id/merge', async (req, res) => {
  try {
    const childId = req.params.id;
    const { parentCityId } = req.body as { parentCityId: string | null };

    if (childId === parentCityId) {
      return res.status(400).json({ error: 'En stad kan inte vara förälder till sig själv' });
    }

    // Vi tillåter bara EN nivå av hierarki — om parent själv har parent,
    // refusera (annars blir Arlöv → Malmö → Skåne en kedja som UI inte
    // hanterar bra). Admin får först lossa parent's parent.
    if (parentCityId) {
      const parent = await (prisma as any).city.findUnique({
        where: { id: parentCityId }, select: { parentCityId: true },
      });
      if (!parent) return res.status(404).json({ error: 'Förälder hittas inte' });
      if (parent.parentCityId) return res.status(400).json({ error: 'Föräldra-staden är redan ett barn. Lossa den först.' });
    }

    // Kontrollera att child inte själv har barn (om så är fallet kan vi
    // inte göra den till barn — den är redan en parent).
    const child = await (prisma as any).city.findUnique({
      where: { id: childId },
      include: { _count: { select: { childCities: true } } },
    });
    if (!child) return res.status(404).json({ error: 'Stad hittas inte' });
    if (parentCityId && (child._count?.childCities ?? 0) > 0) {
      return res.status(400).json({ error: 'Denna stad har egna barn. Lossa dem först innan du kan göra den till barn.' });
    }

    const updated = await (prisma as any).city.update({
      where: { id: childId },
      data: { parentCityId },
    });
    res.json(updated);
  } catch (err) {
    console.error('City merge error:', err);
    res.status(500).json({ error: 'Kunde inte slå ihop städer' });
  }
});

// ── PATCH /api/cities/:id/aliases ────────────────────────────────────────────
// Lägg till eller ta bort alias-namn. Body: { aliases: string[] } — ersätter
// hela listan. Admin styr själv vilka namn ska resolvas till denna stad.
router.patch('/:id/aliases', async (req, res) => {
  try {
    const { aliases } = req.body as { aliases: unknown };
    if (!Array.isArray(aliases) || !aliases.every((a) => typeof a === 'string')) {
      return res.status(400).json({ error: 'aliases måste vara string[]' });
    }
    const cleaned = aliases.map((a) => a.trim()).filter((a) => a.length > 0);
    const updated = await (prisma as any).city.update({
      where: { id: req.params.id },
      data: { aliases: JSON.stringify(cleaned) },
    });
    res.json(updated);
  } catch (err) {
    console.error('City aliases update error:', err);
    res.status(500).json({ error: 'Kunde inte uppdatera alias' });
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

      // För varje restaurang: kolla DESS egen täckning. Strikt — ingen fallback.
      // Saknar restaurangen ritade zoner i admin → den levererar inte (inkluderas
      // inte i resultatet). Detta är medvetet val: admin MÅSTE rita zoner per
      // restaurang för att aktivera leverans. Ingen "default radius"-magi som
      // smyger igenom restauranger utanför täckning.
      const deliverableRestaurants = city.restaurants
        .map((r: any) => {
          const rZonesRaw = safeJsonParse<any[]>(r.deliveryZones, []);
          const rZones = normalizeDeliveryZones(rZonesRaw);
          if (rZones.length === 0) return null;

          const rZone = findDeliveryZone(lat, lng, rZones, cityCenter);
          if (!rZone) return null;

          // Effektiv ETA: auto-räknad (calculatedEtaMinutes om ≥5 samples)
          // > admin-kickstart (rZone.etaMinutes) > restaurang-default.
          // getEffectiveZoneEta applicerar snap till 5-min-intervall.
          const effectiveEta = getEffectiveZoneEta(rZone as any, r.etaMinutes ?? undefined);

          return {
            ...r,
            // Skriv över restaurangens default deliveryFee/minOrderAmount med
            // zon-specifika värden. Klienten ska ALDRIG visa
            // restaurang-default-fee — bara zon-fee. Vi sätter dem här för
            // bakåtkompat med klienter som läser fältet direkt.
            deliveryFee: rZone.fee,
            minOrderAmount: rZone.minOrder,
            etaMinutes: effectiveEta,
            matchedZone: {
              id: rZone.id,
              name: rZone.name,
              deliveryFee: rZone.fee,
              minOrder: rZone.minOrder,
              etaMinutes: effectiveEta,
              // Diagnostik så admin/web kan visa "auto-räknat efter X ordrar"
              // istället för att gissa om värdet är manuellt eller beräknat.
              etaSource: (rZone as any).calculatedEtaMinutes != null && ((rZone as any).etaSampleCount ?? 0) >= 5 ? 'calculated' : 'manual',
              etaSampleCount: (rZone as any).etaSampleCount ?? 0,
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
