import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

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
      freeDeliveryAbove, restaurantIds, restaurantZones 
    } = req.body;
    
    const citySlug = slug || name.toLowerCase().replace(/[^a-zåäö0-9]+/gi, '-').replace(/^-|-$/g, '');
    
    const data: any = {
      name,
      deliveryMode: deliveryMode || 'ALL',
      zones: typeof zones === 'string' ? zones : JSON.stringify(zones || []),
      isActive: isActive !== undefined ? isActive : true,
      latitude: latitude || null,
      longitude: longitude || null,
      freeDeliveryAbove: freeDeliveryAbove || 0,
    };

    // If restaurantIds provided, update restaurant links
    if (restaurantIds && Array.isArray(restaurantIds)) {
      data.restaurants = {
        set: restaurantIds.map((rid: string) => ({ id: rid }))
      };
    }

    // Use a transaction to ensure all updates succeed or fail together
    const city = await (prisma as any).$transaction(async (tx: any) => {
      // 1. Update/Create city
      const cityResult = await tx.city.upsert({
        where: id ? { id } : { slug: citySlug },
        update: data,
        create: { ...data, slug: citySlug, id: id || undefined },
        include: {
          restaurants: {
            select: { id: true, name: true, slug: true, isOpen: true, city: true, deliveryZones: true, freeDeliveryAbove: true }
          }
        }
      });

      // 2. Update individual restaurant zones if provided
      if (restaurantZones && typeof restaurantZones === 'object') {
        for (const [rid, rdata] of Object.entries(restaurantZones)) {
          const zonePayload: any = rdata as any;
          await tx.restaurant.update({
            where: { id: rid },
            data: { 
              deliveryZones: typeof zonePayload.zones === 'string' ? zonePayload.zones : JSON.stringify(zonePayload.zones || []),
              freeDeliveryAbove: zonePayload.freeDeliveryAbove !== undefined ? zonePayload.freeDeliveryAbove : undefined
            }
          });
        }
      }

      return cityResult;
    });

    res.json(city);
  } catch (error) {
    console.error("City save error:", error);
    res.status(500).json({ error: 'Kunde inte spara stad' });
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
