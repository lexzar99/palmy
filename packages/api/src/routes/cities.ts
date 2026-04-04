import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/cities
router.get('/', async (req, res) => {
  try {
    const cities = await (prisma as any).city.findMany({ 
      where: { isActive: true } 
    });
    res.json(cities);
  } catch (error) {
    console.error("Cities fetch error:", error);
    res.status(500).json({ error: 'Kunde inte hämta städer' });
  }
});

// POST /api/cities (Admin only in real app, but open for simplicity here as we define the sync)
router.post('/', async (req, res) => {
  try {
    const { name, slug, deliveryMode, zones, isActive } = req.body;
    const city = await (prisma as any).city.upsert({
      where: { slug },
      update: {
        name,
        deliveryMode,
        zones: typeof zones === 'string' ? zones : JSON.stringify(zones),
        isActive: isActive !== undefined ? isActive : true
      },
      create: {
        name,
        slug,
        deliveryMode: deliveryMode || 'ALL',
        zones: typeof zones === 'string' ? zones : JSON.stringify(zones || []),
        isActive: isActive !== undefined ? isActive : true
      }
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
