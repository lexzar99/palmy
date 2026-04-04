import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// In a real app, these would be in the database. 
// For now, mirroring the admin UI logic but as an API for the frontend.
// Since the schema doesn't have a City model yet, we'll use a hardcoded list 
// that mimics what would be in the DB.
const MOCK_CITIES = [
  {
    id: "1",
    name: "Lund",
    slug: "lund",
    isActive: true,
    allowDelivery: true,
    allowPickup: true,
    deliveryMode: "ALL",
    zones: [
      { id: "z1", name: "Centrum", radiusKm: 3, deliveryFee: 0, minOrder: 150 },
      { id: "z2", name: "Utkant", radiusKm: 6, deliveryFee: 49, minOrder: 250 },
    ]
  },
  {
    id: "2",
    name: "Malmö",
    slug: "malmo",
    isActive: true,
    allowDelivery: false, // DELIVERY DISABLED FOR MALMÖ
    allowPickup: true,
    deliveryMode: "ONLY_PICKUP",
    zones: []
  }
];

// GET /api/cities
router.get('/', async (req, res) => {
  try {
    // In future: const cities = await prisma.city.findMany({ where: { isActive: true } });
    res.json(MOCK_CITIES);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta städer' });
  }
});

export default router;
