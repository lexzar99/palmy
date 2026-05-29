import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';

const router = Router();

// Per-individ rate-limit (INTE global). Skyddar mot brute-force av rabatt-
// koder utan att slå ut legitima kunder vid expansion: 200 olika kunder kan
// validera samma kod parallellt utan att blocka varandra. Key:en kombinerar
// IP + Authorization-header (om inloggad) så samma device delar bucket men
// olika kunder/IPs får egna fönster. 20 anrop / 5 min är gott och väl för
// vanligt kassaflöde — angripare som testar tusentals koder blir bromsade.
const validateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = (req.headers.authorization || '').trim();
    // Använd sista 16 tecken av JWT för att skilja användare utan att läcka
    // hela token i memory. Saknas auth → bara IP, vilket räcker som spärr.
    const userPart = auth.startsWith('Bearer ') ? auth.slice(-16) : 'anon';
    return `${req.ip}:${userPart}`;
  },
  message: { error: 'För många rabattkods-försök. Vänta några minuter.' },
});

// POST /api/discount/validate
router.post('/validate', validateLimiter, async (req, res) => {
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
        // minOrder (kr) returneras så klienten kan visa "Aktiveras vid X kr"
        // om kunden senare tar bort varor och hamnar under tröskeln.
        minOrder: discount.minOrder / 100,
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
      // minOrder (kr) — klienten lagrar detta så pending-discount-raden
      // ("Aktiveras vid X kr") kan visas om kunden tar bort varor och
      // hamnar under tröskeln efter att koden applicerats.
      minOrder: discount.minOrder / 100,
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
