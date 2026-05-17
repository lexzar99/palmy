import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/discount/validate
router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Rabattkod krävs' });
      return;
    }

    const discount = await prisma.discountCode.findUnique({
      where: { code: code.toUpperCase(), isActive: true },
    });

    if (!discount) {
      res.status(404).json({ error: 'Ogiltig rabattkod' });
      return;
    }

    const now = new Date();
    if (discount.validUntil && discount.validUntil < now) {
      res.status(400).json({ error: 'Rabattkoden har gått ut' });
      return;
    }
    if (discount.validFrom && discount.validFrom > now) {
      res.status(400).json({ error: 'Rabattkoden är inte aktiv ännu' });
      return;
    }
    if (discount.maxUsages !== null && discount.usageCount >= discount.maxUsages) {
      res.status(400).json({ error: 'Rabattkoden har använts upp' });
      return;
    }

    const subtotalOre = Math.round((Number(subtotal) || 0) * 100);
    if (subtotalOre < discount.minOrder) {
      res.status(400).json({
        error: `Minsta ordersumma för denna kod är ${discount.minOrder / 100} kr`,
      });
      return;
    }

    if (discount.type === 'FREE_DELIVERY') {
      res.json({
        valid: true,
        code: discount.code,
        description: discount.description,
        type: discount.type,
        value: 0,
        discountAmount: 0,
        freeDelivery: true,
      });
      return;
    }

    let discountAmountOre = 0;
    if (discount.type === 'PERCENTAGE') {
      discountAmountOre = Math.round(subtotalOre * discount.value / 100);
    } else {
      discountAmountOre = Math.min(discount.value, subtotalOre);
    }

    res.json({
      valid: true,
      code: discount.code,
      description: discount.description,
      type: discount.type,
      value: discount.value,
      // Client expects kr
      discountAmount: discountAmountOre / 100,
      // Stackbar fri leverans-flagga. Klienten använder den för att räkna
      // ut total = subtotal - discountAmount - (freeDelivery ? deliveryFee : 0).
      // Utan denna såg kunden bara halva rabatten i kassan (Eriks bugg).
      freeDelivery: Boolean((discount as any).freeDelivery),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
