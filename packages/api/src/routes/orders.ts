import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_ESTIMATED_DELIVERY_TIME,
  DEFAULT_ESTIMATED_PICKUP_TIME,
  DEFAULT_MIN_ORDER_AMOUNT,
} from '../lib/restaurantSettings';
import { evaluateDeal, isDealAvailableNow } from '../lib/deals';
import { triggerLoyaltyRewards } from '../lib/loyalty';
import { JWT_SECRET } from '../lib/config';
import { normalizeDeliveryZones, normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' })
  : null;

type ConfirmedPaymentIntent = {
  id: string;
  amount: number;
};

const getConfirmedPaymentIntent = async (paymentIntentId: string): Promise<ConfirmedPaymentIntent> => {
  if (!stripe) {
    throw new OrderValidationError('Stripe är inte konfigurerat korrekt på servern');
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      throw new OrderValidationError('Betalningen är inte slutförd ännu');
    }

    const paidAmount = paymentIntent.amount_received || paymentIntent.amount || 0;
    if (paidAmount <= 0) {
      throw new OrderValidationError('Betalningen saknar giltigt belopp');
    }

    return {
      id: paymentIntent.id,
      amount: paidAmount,
    };
  } catch (error) {
    if (error instanceof OrderValidationError) {
      throw error;
    }
    console.error('Stripe verification error:', error);
    throw new OrderValidationError('Kunde inte verifiera betalningen');
  }
};

const OrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().min(1).max(20),
  note: z.string().nullable().optional(),
  selectedExtras: z.array(z.object({
    groupId: z.string(),
    groupName: z.string(),
    extraId: z.string(),
    extraName: z.string(),
    priceAddon: z.number(),
  })),
});

const CreateOrderSchema = z.object({
  restaurantId: z.string().min(1).optional(),
  restaurantSlug: z.string().min(1).optional(),
  type: z.enum(['PICKUP', 'DELIVERY']),
  paymentMethod: z.string().nullable().optional(),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(6).max(20),
  customerEmail: z.string().email().nullable().or(z.literal('')).optional(),
  
  // Leverans
  deliveryStreet: z.string().nullable().optional(),
  deliveryCity: z.string().nullable().optional(),
  deliveryZip: z.string().nullable().optional(),
  deliveryNote: z.string().nullable().optional(),
  deliveryInstructions: z.string().nullable().optional(),

  note: z.string().nullable().optional(),
  discountCode: z.string().nullable().optional(),
  items: z.array(OrderItemSchema).min(1),
  
  // Stripe PaymentIntent ID
  stripePaymentIntentId: z.string().nullable().optional(),
  
  // GPS coords for zone validation
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
}).refine((val) => Boolean(val.restaurantId || val.restaurantSlug), {
  message: 'restaurantId eller restaurantSlug krävs',
  path: ['restaurantId'],
});

// POST /api/orders - Skapa ny order
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('📦 New Order Request:', JSON.stringify(req.body, null, 2));
    const data = CreateOrderSchema.parse(req.body);
    const hasPaymentIntent = Boolean(data.stripePaymentIntentId);
    
    const intentId = data.stripePaymentIntentId?.toUpperCase();
    const isTestOrder = (data.discountCode?.toLowerCase() === 'test' || data.discountCode?.toLowerCase() === 'testa') && 
                       (intentId === 'TEST_PAYMENT' || intentId === 'FREE_PROMO');

    // Enforce mandatory payment
    if (!hasPaymentIntent) {
      if (!isTestOrder) {
        res.status(400).json({ error: 'Betalning krävs för att slutföra ordern' });
        return;
      }
    }

    // 0. Check for auth user to link account
    let authenticatedUserId: string | null = null;
    let authUser: any = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, JWT_SECRET) as any;
        authUser = await (prisma as any).user.findUnique({ where: { id: payload.id } });
        if (authUser) {
          authenticatedUserId = authUser.id;
          // Force use official profile phone to prevent discount abuse
          data.customerPhone = authUser.phone;
        }
      } catch (e) {
        // Token invalid, proceed as guest
      }
    }

    // Resolve restaurant (must be explicit to avoid routing orders to the wrong restaurant)
    const restaurant = await prisma.restaurant.findFirst({
      where: data.restaurantId
        ? { id: data.restaurantId }
        : { slug: data.restaurantSlug as string },
    });
    if (!restaurant) {
      res.status(400).json({ error: 'Ogiltig restaurang' });
      return;
    }

    const globalSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    
    // Use restaurant specific settings or global fallbacks
    const restaurantOpen = restaurant?.isOpen ?? globalSettings?.isOpen ?? true;
    // Zone validation if delivery
    let deliveryFee = 0;
    let minOrderAmount = restaurant?.minOrderAmount ?? globalSettings?.minOrderAmount ?? Math.round(DEFAULT_MIN_ORDER_AMOUNT * 100);

    if (data.type === 'DELIVERY') {
      const defaultFee = (restaurant?.deliveryFee ?? globalSettings?.deliveryFee ?? Math.round(DEFAULT_DELIVERY_FEE * 100));
      
      if (data.lat && data.lng && restaurant?.latitude && restaurant?.longitude) {
        const { haversineKm, findDeliveryZone } = await import('../utils/geo');
        const dist = haversineKm(data.lat, data.lng, restaurant.latitude, restaurant.longitude);
        
        let zonesRaw: any[] = [];
        try { zonesRaw = JSON.parse((restaurant as any).deliveryZones || '[]'); } catch { zonesRaw = []; }
        const zones = normalizeDeliveryZones(zonesRaw);
        
        if (zones.length > 0) {
          const matchedZone = findDeliveryZone(dist, zones);
          if (!matchedZone) {
            res.status(400).json({ error: 'Tyvärr levererar vi inte till din adress (utanför täckningsområde).' });
            return;
          }
          deliveryFee = matchedZone.fee;
          minOrderAmount = matchedZone.minOrder;
        } else {
          deliveryFee = defaultFee;
        }
      } else {
        deliveryFee = defaultFee;
      }
    }
    const estimatedTime = data.type === 'PICKUP'
      ? (globalSettings?.estimatedPickupTime ?? DEFAULT_ESTIMATED_PICKUP_TIME)
      : (restaurant?.etaMinutes ?? globalSettings?.estimatedDeliveryTime ?? DEFAULT_ESTIMATED_DELIVERY_TIME);

    // Idempotency: if this PaymentIntent already has an order, return that order directly.
    // Skip for TEST_PAYMENT, FREE_PROMO and BYPASS to allow multiple tests by developers.
    const isSpecialMockId = data.stripePaymentIntentId === 'TEST_PAYMENT' || data.stripePaymentIntentId === 'FREE_PROMO' || data.stripePaymentIntentId === 'BYPASS';
    const existingOrder = (data.stripePaymentIntentId && !isSpecialMockId) ? await prisma.order.findFirst({
      where: { stripePaymentIntentId: data.stripePaymentIntentId },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        appliedDealTitle: true,
        estimatedTime: true,
      },
    }) : null;

    if (existingOrder) {
      console.log(`♻️ Found existing order for PaymentIntent ${data.stripePaymentIntentId}, returning early.`);
      res.json(existingOrder);
      return;
    }

    let confirmedPayment: ConfirmedPaymentIntent | null = null;
    if (intentId && !isTestOrder && intentId !== 'BYPASS') {
      confirmedPayment = await getConfirmedPaymentIntent(data.stripePaymentIntentId!);
    } else if (isTestOrder) {
      confirmedPayment = { id: data.stripePaymentIntentId || 'TEST_PAYMENT', amount: 0 }; 
    } else if (intentId === 'BYPASS') {
      console.log('⏩ Bypassing Stripe verification for request');
      confirmedPayment = { id: 'BYPASS', amount: -1 }; 
    }

    // Only enforce open status for unpaid/manual flows.
    if (!confirmedPayment && !restaurantOpen) {
      res.status(400).json({ error: 'Tyvärr, restaurangen har för närvarande stängt. Välkommen tillbaka när vi öppnar!' });
      return;
    }

    // Validera leveransadress om delivery
    if (data.type === 'DELIVERY') {
      if (!data.deliveryStreet || !data.deliveryZip) {
        res.status(400).json({ error: 'Leveransadress krävs för hemkörning' });
        return;
      }
    }

    // Hämta produkter och beräkna priser
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const requireActiveProducts = !confirmedPayment;
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        ...(requireActiveProducts ? { isActive: true } : {}),
      },
      include: {
        extraGroups: {
          include: {
            extraGroup: {
              include: {
                extras: confirmedPayment ? true : { where: { isActive: true } },
              },
            },
          },
        },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of data.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        res.status(400).json({ error: `Produkt ${item.productId} hittades inte` });
        return;
      }

      const groupMap = new Map(
        product.extraGroups.map((peg) => [
          peg.extraGroup.id,
          {
            ...peg.extraGroup,
            extraMap: new Map(peg.extraGroup.extras.map((extra) => [extra.id, extra])),
          },
        ]),
      );

      const validatedExtras = item.selectedExtras.map((selected) => {
        const group = groupMap.get(selected.groupId);
        if (!group) {
          if (confirmedPayment) {
            return {
              groupId: selected.groupId,
              groupName: selected.groupName,
              extraId: selected.extraId,
              extraName: selected.extraName,
              priceAddon: selected.priceAddon,
            };
          }
          throw new OrderValidationError(`Ogiltigt tillval för ${product.name}`);
        }

        const extra = group.extraMap.get(selected.extraId);
        if (!extra) {
          if (confirmedPayment) {
            return {
              groupId: group.id,
              groupName: group.name,
              extraId: selected.extraId,
              extraName: selected.extraName,
              priceAddon: selected.priceAddon,
            };
          }
          throw new OrderValidationError(`Tillvalet ${selected.extraName} finns inte längre`);
        }

        return {
          groupId: group.id,
          groupName: group.name,
          extraId: extra.id,
          extraName: extra.name,
          priceAddon: extra.priceAddon / 100,
        };
      });

      if (!confirmedPayment) {
        for (const group of groupMap.values()) {
          const selectedInGroup = validatedExtras.filter((selected) => selected.groupId === group.id);
          if (selectedInGroup.length < group.minSelections) {
            throw new OrderValidationError(`${product.name} kräver minst ${group.minSelections} val i ${group.name.toLowerCase()}`);
          }
          if (selectedInGroup.length > group.maxSelections) {
            throw new OrderValidationError(`${product.name} tillåter högst ${group.maxSelections} val i ${group.name.toLowerCase()}`);
          }
          if (group.required && selectedInGroup.length === 0) {
            throw new OrderValidationError(`${group.name} måste väljas för ${product.name}`);
          }
          if (group.type === 'RADIO' && selectedInGroup.length > 1) {
            throw new OrderValidationError(`Du kan bara välja ett alternativ i ${group.name.toLowerCase()}`);
          }
        }
      }

      const extrasTotal = validatedExtras.reduce((sum, e) => sum + Math.round(e.priceAddon * 100), 0);
      const itemSubtotal = (product.price + extrasTotal) * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        basePrice: product.price,
        quantity: item.quantity,
        note: item.note,
        selectedExtras: JSON.stringify(validatedExtras), // Store as string for SQLite
        subtotal: itemSubtotal,
      });
    }

    // Minsta ordersumma-validering
    if (!confirmedPayment && subtotal < minOrderAmount) {
      res.status(400).json({ error: `Minsta beställningsbelopp är ${minOrderAmount / 100} kr. Du saknar ${((minOrderAmount - subtotal) / 100).toFixed(0)} kr.` });
      return;
    }

    // Rabattkod och automatiska deals
    const now = new Date();
    let manualDiscountAmount = 0;
    let validatedCode: string | undefined;

    if (data.discountCode) {
      const codeVal = data.discountCode?.toLowerCase();
      if (codeVal === 'test' || codeVal === 'testa') {
        validatedCode = codeVal;
        manualDiscountAmount = 0; // Total will be forced to 0 via confirmedPayment
      } else {
        const code = await prisma.discountCode.findUnique({
          where: { code: data.discountCode.toUpperCase(), isActive: true },
        });

        if (code) {
          const isExpired = (code.validUntil && code.validUntil < now) ||
            (code.maxUsages !== null && code.usageCount >= code.maxUsages);

          if (!isExpired && subtotal >= code.minOrder) {
            if (code.type === 'PERCENTAGE') {
              manualDiscountAmount = Math.round(subtotal * code.value / 100);
            } else {
              manualDiscountAmount = Math.min(code.value, subtotal);
            }
            validatedCode = code.code;
          }
        } else {
          // 2. Check personalized customer deals
          const personalDeal = await (prisma as any).customerDeal.findFirst({
             where: { 
               code: data.discountCode,
               phone: data.customerPhone,
               campaign: {
                  isActive: true,
                  OR: [
                    { validUntil: null },
                    { validUntil: { gte: now } }
                  ]
               }
             },
             include: { campaign: true }
          });

          if (personalDeal) {
            const isUsable = personalDeal.usageCount < (personalDeal.maxUsages || 1);
            const minOrderOre = normalizeMoneyToOre(personalDeal.campaign.minOrder ?? 0);
            if (isUsable && subtotal >= minOrderOre) {
              if (personalDeal.campaign.discountType === 'PERCENTAGE') {
                manualDiscountAmount = Math.round(subtotal * personalDeal.campaign.discountValue / 100);
              } else {
                const fixedDiscountOre = normalizeMoneyToOre(personalDeal.campaign.discountValue ?? 0);
                manualDiscountAmount = Math.min(fixedDiscountOre, subtotal);
              }
              validatedCode = personalDeal.code;
            }
          }
        }
      }
    }

    const activeDeals = await prisma.deal.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const customerDealOrders = await prisma.order.findMany({
      where: {
        customerPhone: data.customerPhone,
        appliedDealId: { not: null },
      },
      select: { appliedDealId: true },
    });

    const customerDealUsage = new Map<string, number>();
    for (const order of customerDealOrders) {
      if (!order.appliedDealId) continue;
      customerDealUsage.set(order.appliedDealId, (customerDealUsage.get(order.appliedDealId) || 0) + 1);
    }

    let appliedDeal: (typeof activeDeals)[number] | null = null;
    let automaticDiscountAmount = 0;
    const productIdsInCart = data.items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

    for (const deal of activeDeals) {
      if (!isDealAvailableNow(deal, now)) continue;

      if (
        deal.maxUsesPerCustomer !== null &&
        (customerDealUsage.get(deal.id) || 0) >= deal.maxUsesPerCustomer
      ) {
        continue;
      }

      const evaluation = evaluateDeal(deal, {
        subtotalOre: subtotal,
        productIds: productIdsInCart,
      });

      if (!evaluation.eligible) continue;

      if (evaluation.discountAmountOre > automaticDiscountAmount) {
        automaticDiscountAmount = evaluation.discountAmountOre;
        appliedDeal = deal;
      }
    }

    let discountAmount = manualDiscountAmount >= automaticDiscountAmount
      ? manualDiscountAmount
      : automaticDiscountAmount;

    if (discountAmount === manualDiscountAmount) {
      appliedDeal = null;
    } else {
      validatedCode = undefined;
    }

    // Leveransavgift (use pre-calculated value from above)

    let total = subtotal - discountAmount + deliveryFee;

    // If payment is already settled, align order total with the paid amount.
    // Except for BYPASS which uses our calculated total.
    if (confirmedPayment && confirmedPayment.amount !== -1) {
      total = confirmedPayment.amount;
      const reconciledDiscount = subtotal + deliveryFee - total;
      discountAmount = reconciledDiscount > 0 ? reconciledDiscount : 0;
    }

    if (!confirmedPayment) {
      throw new OrderValidationError('Kunde inte verifiera betalningen');
    }

    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true }
    });
    
    let nextNum = 1001;
    if (lastOrder?.orderNumber) {
      const match = lastOrder.orderNumber.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const nextNumber = `PX-${nextNum}`;

    const order: any = await prisma.order.create({
      data: {
        orderNumber: nextNumber,
        status: 'PENDING',
        type: data.type,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        restaurantId: restaurant?.id || null,
        customerEmail: data.customerEmail || null,
        deliveryStreet: data.deliveryStreet || null,
        deliveryCity: data.deliveryCity || null,
        deliveryZip: data.deliveryZip || null,
        deliveryNote: data.deliveryNote || null,
        deliveryInstructions: data.deliveryInstructions || null,
        note: data.note || null,
        discountCode: validatedCode || null,
        appliedDealId: appliedDeal?.id || null,
        appliedDealTitle: appliedDeal?.title || null,
        discountAmount,
        deliveryFee,
        total,
        stripePaymentIntentId: confirmedPayment.id,
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        estimatedTime,
        userId: authenticatedUserId,

        items: {
          create: orderItems.map(item => ({
            ...item,
            note: item.note || null
          })),
        },
      },
      include: {
        restaurant: { select: { name: true } },
        items: true,
      },
    });

    // Trigger loyalty/retention rewards (async)
    triggerLoyaltyRewards(order).catch(console.error);

    // Uppdatera rabattkods-räknare (Skip for 'test' mock)
    if (validatedCode && validatedCode !== 'test' && validatedCode !== 'testa') {
      await prisma.discountCode.updateMany({
        where: { code: validatedCode.toUpperCase() },
        data: { usageCount: { increment: 1 } },
      });
    }

    if (appliedDeal) {
      await prisma.deal.update({
        where: { id: appliedDeal.id },
        data: { usageCount: { increment: 1 } },
      });
    }

    // Emit till admin via Socket.IO
    const orderForSocket = {
      id: order.id,
      restaurantId: order.restaurantId,
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryStreet: order.deliveryStreet,
      deliveryZip: order.deliveryZip,
      deliveryCity: order.deliveryCity,
      note: order.note,
      appliedDealTitle: order.appliedDealTitle,
      total: order.total / 100,
      deliveryFee: order.deliveryFee / 100,
      estimatedTime,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
      discountCode: order.discountCode,
      stripePaymentIntentId: order.stripePaymentIntentId,
      items: order.items.map((i: any) => ({
        ...i,
        basePrice: i.basePrice / 100,
        subtotal: i.subtotal / 100,
        selectedExtras: JSON.parse(i.selectedExtras),
      })),
    };
    // Global room is used by SUPER_ADMIN; per-restaurant room is used by each restaurant panel.
    getIO().to('admin-room').emit('order:new', orderForSocket);
    if (order.restaurantId) {
      getIO().to(`admin-room:${order.restaurantId}`).emit('order:new', orderForSocket);
    }

    // 5. Update personal deal usage (CustomerDeal)
    if (validatedCode) {
      const updatedPersonal = await (prisma as any).customerDeal.findFirst({
        where: { code: validatedCode, phone: data.customerPhone }
      });
      
      if (updatedPersonal) {
        const newCount = updatedPersonal.usageCount + 1;
        const max = updatedPersonal.maxUsages || 1;
        await (prisma as any).customerDeal.update({
          where: { id: updatedPersonal.id },
          data: { 
            usageCount: newCount,
            isUsed: newCount >= max
          }
        });
      }
    }

    res.status(200).json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total / 100,
      appliedDealTitle: order.appliedDealTitle,
      estimatedTime: order.estimatedTime || estimatedTime,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod Validation Error:', JSON.stringify(error.errors, null, 2));
      res.status(400).json({ error: 'Ogiltig data', details: error.errors });
      return;
    }
    if (error instanceof OrderValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Kunde inte skapa order' });
  }
});

// POST /api/orders/validate-discount - Validera kod i kassan
router.post('/validate-discount', async (req: Request, res: Response) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) { res.status(400).json({ error: 'Ingen kod angiven' }); return; }

    const discount = await prisma.discountCode.findUnique({
      where: { code: code.toUpperCase(), isActive: true }
    });

    if (!discount) {
      res.status(404).json({ error: 'Ogiltig kampanjkod' });
      return;
    }

    const now = new Date();
    if (discount.validUntil && discount.validUntil < now) {
      res.status(400).json({ error: 'Rabattkoden har löpt ut' });
      return;
    }
    if (discount.maxUsages !== null && discount.usageCount >= discount.maxUsages) {
      res.status(400).json({ error: 'Rabattkoden är förbrukad' });
      return;
    }
    if (subtotal < discount.minOrder / 100) {
      res.status(400).json({ error: `Kräver en beställning på minst ${discount.minOrder / 100} kr` });
      return;
    }

    res.json({
      valid: true,
      type: discount.type,
      value: discount.type === 'FIXED' ? discount.value / 100 : discount.value,
      description: discount.description
    });
  } catch (err) {
    res.status(500).json({ error: 'Serverfel vid validering' });
  }
});

// POST /api/orders/draft - Spara ett orderutkast innan betalning
router.post('/draft', async (req: Request, res: Response) => {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Draft valid for 24h

    const draft = await prisma.orderDraft.create({
      data: {
        data: JSON.stringify(req.body),
        expiresAt,
      },
    });

    res.status(201).json({ draftId: draft.id });
  } catch (error) {
    console.error('Create draft error:', error);
    res.status(500).json({ error: 'Kunde inte spara utkast' });
  }
});


// GET /api/orders/draft/:id - Hämta ett utkast efter omdirigering
router.get('/draft/:id', async (req: Request, res: Response) => {
  try {
    const draft = await prisma.orderDraft.findUnique({
      where: { id: req.params.id },
    });

    if (!draft || draft.expiresAt < new Date()) {
      res.status(404).json({ error: 'Utkastet hittades inte eller har gått ut' });
      return;
    }

    res.json(JSON.parse(draft.data));
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid hämtning av utkast' });
  }
});

// GET /api/orders/:id - Hämta en order (för kund att följa sin order)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order: any = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, restaurant: true },
    });

    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      total: order.total / 100,
      deliveryFee: order.deliveryFee / 100,
      discountAmount: order.discountAmount / 100,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      appliedDealTitle: order.appliedDealTitle,
      estimatedTime: order.estimatedTime,
      createdAt: order.createdAt,
      customerPhone: order.customerPhone,
      deliveryStreet: order.deliveryStreet,
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
      restaurantAddress: order.restaurant?.address || '',
      restaurantZip: order.restaurant?.zip || '',
      restaurantCity: order.restaurant?.city || '',
      restaurantPhone: order.restaurant?.phone || '',
      items: order.items.map((item: any) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        basePrice: item.basePrice / 100,
        subtotal: item.subtotal / 100,
        selectedExtras: JSON.parse(item.selectedExtras),
        note: item.note,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
