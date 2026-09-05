import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { discountPlatformAllowed } from '../lib/clientPlatform';
import { KIOSK_ACCESS_HEADER, validKioskAccessProof } from '../lib/kioskAccess';
import { isPartnerEmbedDiscountEnabled } from '../lib/partnerEmbedDiscounts';

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
    const { code, subtotal, discountableSubtotal } = req.body;

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

    const privateEmbed = Boolean(validKioskAccessProof(req.headers[KIOSK_ACCESS_HEADER]));
    if (privateEmbed && !(await isPartnerEmbedDiscountEnabled('discount-code', discount.id))) {
      res.status(400).json({ error: 'Rabattkoden gäller bara på viaeats.se eller i appen' });
      return;
    }

    // Plattforms-spärr: en APP-only-kod får bara lösas in i mobilappen (och
    // vice versa för WEB). Klienten skickar X-Client-Type. Meddelandet är
    // avsiktligt tydligt så webbanvändaren förstår att koden gäller i appen.
    if (!discountPlatformAllowed((discount as any).platform, req)) {
      const p = String((discount as any).platform || 'ALL').toUpperCase();
      res.status(400).json({
        error: p === 'APP'
          ? 'Den här koden gäller bara i appen'
          : 'Den här koden gäller bara på webben',
      });
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
    // Underlaget som koden får bita på. Kassan skickar `discountableSubtotal`
    // (kr) = summan av de varor som inte redan är nedsatta. Saknas fältet
    // (äldre klient) faller vi tillbaka på hela subtotalen — servern räknar
    // ändå om vid orderläggning, som alltid är sanningen.
    const excludeDiscountedItems = Boolean((discount as any).excludeDiscountedItems);
    const discountableOre = excludeDiscountedItems && discountableSubtotal !== undefined
      ? Math.max(0, Math.min(subtotalOre, Math.round((Number(discountableSubtotal) || 0) * 100)))
      : subtotalOre;

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
        excludeDiscountedItems,
      });
      return;
    }

    let discountAmountOre = 0;
    if (discount.type === 'PERCENTAGE') {
      discountAmountOre = Math.round(discountableOre * discount.value / 100);
    } else {
      discountAmountOre = Math.min(discount.value, discountableOre);
    }

    // Koden gäller bara ej rabatterade varor och kunden har enbart sådana i
    // korgen → neka här istället för att applicera en kod som ger 0 kr.
    // Samma regel som i POST /api/orders (server-sanning).
    if (excludeDiscountedItems && discountAmountOre <= 0 && !(discount as any).freeDelivery) {
      res.status(400).json({
        error: 'Koden gäller bara varor som inte redan är rabatterade',
      });
      return;
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
      // Klienten använder flaggan för att räkna rabatten på rätt underlag när
      // kunden ändrar i korgen efter att koden applicerats.
      excludeDiscountedItems,
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
