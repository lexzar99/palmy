import { Router } from 'express';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';
import { cacheResponse, getCachedResponse, getIdempotencyKey } from '../lib/idempotency';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { incrementDiscountUsageIfNotCounted } from '../lib/discountUsage';
import { applyPaymentSuccess, applyPaymentFailed } from '../lib/stripeReconcile';

// Rate-limit på create-intent. Tidigare var routen öppen + utan limit,
// vilket lät en angripare minta obegränsat antal Stripe-PaymentIntents
// (per-anrop Stripe-fees + customers.list/create skräp i Dashboard).
// Per-IP räcker som första försvar; auth-baserad scope kunde varit
// striktare men gäster MÅSTE kunna betala utan konto.
const createIntentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30, // 30 försök/min/IP — gott om utrymme för flera retries men inte spam
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många betalningsförsök. Vänta en stund och försök igen.' },
});

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});

// Debug: Verify key is loaded (Safely)
if (process.env.STRIPE_SECRET_KEY) {
  console.log(`🔐 Stripe initialized with key starting with: ${process.env.STRIPE_SECRET_KEY.substring(0, 7)}...`);
} else {
  console.error('❌ NO STRIPE_SECRET_KEY FOUND in environment!');
}


const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Startup-validering: webhook-secret MÅSTE vara satt i prod, annars
// kan order-status (PAID/FAILED) inte uppdateras automatiskt — admin
// måste markera manuellt vilket är felbenäget.
if (process.env.NODE_ENV === 'production') {
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.includes('your_webhook_secret_here') || !WEBHOOK_SECRET.startsWith('whsec_')) {
    console.error(
      '❌ STRIPE_WEBHOOK_SECRET saknas eller är ogiltig i produktion. Webhook-signaturer kommer att rejectas. Hämta riktig secret från Stripe Dashboard → Webhooks.',
    );
  }
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.warn('⚠️  STRIPE_SECRET_KEY är en test-nyckel (sk_test_) i NODE_ENV=production.');
  }
}

// POST /api/payments/create-intent
// Skapar en Stripe PaymentIntent för checkout.
//
// SÄKERHET:
//  - Rate-limit (createIntentLimiter): 30/min/IP mot Stripe-fee-abuse.
//  - Belopp HÄRLEDS från DB (order.total / 100), aldrig från klient-body.
//    Tidigare användes klientens `amount` direkt → en angripare kunde betala
//    mindre än ordertotalen (webhook flippade PAID utan amount-jämförelse).
//  - orderId krävs (ingen anonym intent-creation).
router.post('/create-intent', createIntentLimiter, async (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  // Scope keyen till user (om authed) eller IP (gäst). Annars kunde User B
  // återanvända User A:s cachade clientSecret från Stripe.
  const scope = (req as any).user?.id || req.ip || 'anon';
  if (idempotencyKey) {
    const cached = getCachedResponse(scope, `create-intent:${idempotencyKey}`);
    if (cached) {
      return res.status(cached.status).json(cached.body);
    }
  }

  try {
    const { currency = 'sek', metadata, orderId } = req.body;

    // orderId är obligatoriskt — varje PaymentIntent ska peka på en konkret
    // pre-payment-order så vi kan härleda beloppet från DB istället för
    // klient-input. Ingen orderId = inget belopp att förlita sig på.
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId krävs' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { restaurant: { select: { name: true } } },
    });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    // order.total är ALLTID i öre i DB. Stripe vill ha belopp i öre direkt,
    // så vi använder det rakt av. Klientens `amount` ignoreras helt.
    const amountOre = order.total;
    const safeAmountOre = Math.max(amountOre, 500); // Stripe min: 5 kr = 500 öre

    if (!Number.isFinite(safeAmountOre) || safeAmountOre < 1) {
      res.status(400).json({ error: 'Ogiltigt belopp på ordern' });
      return;
    }

    console.log(`📦 Creating payment intent for order ${orderId}: ${amountOre / 100} ${currency} (${amountOre} öre)`);

    const normalizedMetadata = Object.entries(metadata || {}).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value === undefined || value === null) return acc;
      acc[key] = String(value);
      return acc;
    }, {});

    normalizedMetadata.orderId = orderId;

    // Berika PaymentIntent med order-data — vi har redan slagit upp order
    // ovan för att härleda beloppet, så återanvänd samma rad här.
    let description: string | undefined;
    let receiptEmail: string | undefined;
    let stripeCustomerId: string | undefined;
    {
      // Wrap för att bevara variabelnamn (order finns från look-up ovan)
      try {
        if (order) {
          // Format: "PA-1002-BX – Palmyra Pizzeria – Anna Andersson"
          // Stripe-tabellen trunkerar långt så håller det kompakt.
          const parts = [
            order.orderNumber,
            order.restaurant?.name,
            order.customerName,
          ].filter((v): v is string => Boolean(v && v.trim()));
          if (parts.length > 0) description = parts.join(' – ');

          if (order.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customerEmail)) {
            receiptEmail = order.customerEmail;

            // Hitta eller skapa Stripe Customer-object. Customer-kolumnen
            // i Dashboard läser från Customer-resursen, inte receipt_email
            // direkt — utan kopplad Customer visas kolumnen tom även med
            // receipt_email satt. Vi search:ar inte (rate-limit-känsligt) —
            // .list() med email-filter är snabbare och deterministisk.
            try {
              const existing = await stripe.customers.list({
                email: order.customerEmail,
                limit: 1,
              });
              if (existing.data.length > 0) {
                stripeCustomerId = existing.data[0].id;
              } else {
                const newCustomer = await stripe.customers.create({
                  email: order.customerEmail,
                  name: order.customerName || undefined,
                  phone: order.customerPhone || undefined,
                  metadata: {
                    viaeatsUserId: order.userId || '',
                  },
                });
                stripeCustomerId = newCustomer.id;
              }
            } catch (customerErr: any) {
              // Customer-skapande är best-effort. Om det failar (rate-limit,
              // nätverksfel) fortsätter vi utan customer — receipt_email
              // är fortfarande satt så kvittot går iväg.
              console.warn('[payments] stripe customer lookup/create failed:', {
                orderId,
                error: customerErr?.message,
              });
            }
          }

          // Metadata för audit + Stripe-search. Stripe har 50-key/500-char-limit.
          normalizedMetadata.orderNumber = order.orderNumber;
          if (order.customerName) normalizedMetadata.customerName = order.customerName.slice(0, 100);
          if (order.customerPhone) normalizedMetadata.customerPhone = order.customerPhone.slice(0, 30);
          if (order.restaurantId) normalizedMetadata.restaurantId = order.restaurantId;
          if (order.restaurant?.name) normalizedMetadata.restaurantName = order.restaurant.name.slice(0, 100);
          if (order.type) normalizedMetadata.orderType = order.type;
        }
      } catch (lookupErr: any) {
        // Customer-enrichment failed, fortsätt utan — beloppet är redan
        // bestämt från order.total ovan, så betalningen kan genomföras.
        console.warn('[payments] customer enrichment failed:', {
          orderId,
          error: lookupErr?.message,
        });
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        // Belopp i öre. Härlett ur DB-ordern, inte klient-input.
        amount: safeAmountOre,
        currency,
        metadata: normalizedMetadata,
        ...(description ? { description } : {}),
        ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
        ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
        // automatic_payment_methods: enabled = Stripe väljer alla godkända
        // metoder automatiskt (kort, Apple Pay, Google Pay, Klarna, Swish).
        // allow_redirects: 'always' = tillåter Klarna/Swish (de behöver redirect).
        // Apple Pay aktiveras OM:
        //   1. Domain verifierad i Stripe Dashboard (web)
        //   2. Apple Pay capability + merchant ID i app entitlements (RN)
        //   3. Apple Pay payment processing cert uppladdad i Stripe Dashboard
        // Om något saknas filtrerar Stripe bort knappen tyst.
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'always',
        },
      },
      idempotencyKey ? { idempotencyKey: `create-intent:${idempotencyKey}` } : undefined
    );

    // Länka ordern till PaymentIntent:en. Strukturerad error-log om DB-
    // update failar så vi kan hitta lost-pending-orders i Sentry.
    await prisma.order.update({
      where: { id: orderId },
      data: { stripePaymentIntentId: paymentIntent.id },
    }).catch((e) => console.error('[payments] could not link order to intent', {
      orderId,
      paymentIntentId: paymentIntent.id,
      error: e?.message || String(e),
    }));

    const responseBody = {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      // Auktoritativ summa + rabatt (öre→kr) så kassan visar EXAKT vad som dras,
      // även när en rabatt applicerats server-side (annars "dold kampanj").
      total: order.total / 100,
      discountAmount: ((order as any).discountAmount ?? 0) / 100,
    };
    if (idempotencyKey) {
      cacheResponse(scope, `create-intent:${idempotencyKey}`, 200, responseBody);
    }
    res.json(responseBody);
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Kunde inte initiera betalning' });
  }
});

// POST /api/payments/confirm
// SNABB klient-driven bekräftelse. När kortbetalningen lyckats i browsern
// (stripe.confirmPayment → paymentIntent.status === 'succeeded') anropar
// klienten denna direkt istället för att vänta på webhook/reconcile-loopen.
// Vi hämtar intent:en från Stripe (auktoritativ källa) och kör EXAKT samma
// logik som webhook skulle: flippa AWAITING_PAYMENT → PENDING + broadcasta
// 'order:new' till restaurangen. Kollapsar ~60-120s fördröjning → ~1-2s.
//
// SÄKERHET: ingen auth (gäster måste kunna bekräfta), men endpointen agerar
// ENDAST på Stripe-auktoritativ status — en angripare kan inte förfalska
// betalning genom att skicka ett godtyckligt orderId. Belopps-verifikationen
// sitter i applyPaymentSuccess. Rate-limitad mot spam.
router.post('/confirm', createIntentLimiter, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(503).json({ error: 'Stripe är inte konfigurerat' });
      return;
    }
    const orderId = req.body?.orderId;
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId saknas' });
      return;
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, paymentStatus: true, stripePaymentIntentId: true },
    });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    // Redan klar (webhook/reconcile hann före) → idempotent no-op.
    if (order.paymentStatus === 'PAID') {
      res.json({ status: order.status, paymentStatus: 'PAID', alreadyPaid: true });
      return;
    }
    // Pre-payment-flödet (appen) skapar ordern UTAN stripePaymentIntentId —
    // webhooken skulle satt den. Webhooken finns inte i prod, så klienten skickar
    // med paymentIntentId direkt så vi kan finalisera DIREKT (annars hänger ordern
    // i "Väntar på betalning" tills reconcile-pollern kör om ~60s). Säkerhet: en
    // klient-skickad intent MÅSTE peka på just denna order via metadata.orderId.
    const bodyIntentId = typeof req.body?.paymentIntentId === 'string' ? req.body.paymentIntentId : null;
    const intentId = order.stripePaymentIntentId || bodyIntentId;
    if (!intentId) {
      res.status(409).json({ error: 'Ordern saknar en kopplad betalning' });
      return;
    }

    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (!order.stripePaymentIntentId && intent.metadata?.orderId !== order.id) {
      res.status(403).json({ error: 'Betalningen matchar inte ordern' });
      return;
    }

    if (intent.status === 'succeeded') {
      const result = await applyPaymentSuccess(order.id, intent);
      res.json({
        status: result.status ?? 'PENDING',
        paymentStatus: result.paymentStatus ?? 'PAID',
        mismatch: result.mismatch ?? false,
      });
      return;
    }
    if (intent.status === 'canceled' || (intent.status === 'requires_payment_method' && intent.last_payment_error)) {
      await applyPaymentFailed(order.id, intent);
      res.json({ status: order.status, paymentStatus: 'FAILED' });
      return;
    }
    // 'processing' / 'requires_action' → ännu inte slutförd. Klienten navigerar
    // ändå till tracking; reconcile-loopen finaliserar.
    res.json({ status: order.status, paymentStatus: order.paymentStatus, pending: true, intentStatus: intent.status });
  } catch (error: any) {
    console.error('[payments confirm] error:', error?.message || error);
    res.status(500).json({ error: 'Kunde inte bekräfta betalningen' });
  }
});

// POST /api/payments/refund
// Refundar en PaymentIntent. Kräver SUPER_ADMIN — utan auth kunde vem som
// helst med PaymentIntent-ID refundera order (t.ex. gissa från order-mail).
// Frontend (cart-flödet) använder INTE denna direkt — admin-panelens
// /admin/orders/:id/refund är primär refund-flow för admins.
router.post('/refund', authenticate, requireSuperAdmin, async (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  // Routen är alltid authed med SUPER_ADMIN — scope = userId.
  const scope = (req as any).user?.id || req.ip || 'anon';
  if (idempotencyKey) {
    const cached = getCachedResponse(scope, `refund:${idempotencyKey}`);
    if (cached) {
      return res.status(cached.status).json(cached.body);
    }
  }

  const { paymentIntentId } = req.body;

  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    res.status(400).json({ error: 'paymentIntentId saknas' });
    return;
  }

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      idempotencyKey ? { idempotencyKey: `refund:${idempotencyKey}` } : undefined
    );

    // Mark the order as refunded if one exists with this intent
    await prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: 'REFUNDED' },
    });

    console.log(`💸 Refund created: ${refund.id} for intent ${paymentIntentId}`);
    const responseBody = { success: true, refundId: refund.id };
    if (idempotencyKey) {
      cacheResponse(scope, `refund:${idempotencyKey}`, 200, responseBody);
    }
    res.json(responseBody);
  } catch (error: any) {
    console.error('Stripe refund error:', error);
    res.status(500).json({ error: error?.message || 'Återbetalning misslyckades' });
  }
});

// POST /api/payments/refund-orphan
// Customer-initierad refund för "orphan" PaymentIntents — d.v.s. intents
// där betalning gick igenom men ingen Order kopplades (typiskt: Klarna/
// BankID-flödet returnerade men /api/orders POST kraschade efteråt, eller
// klienten tappade JWT under tab-switch).
//
// SÄKERHET: Vi vill INTE kräva admin-auth här (det blockade hela flödet
// och pekade auth-failures istället för missade ordrar). Men vi måste
// förhindra att vem som helst refundar vilken intent som helst:
//
//   1. PaymentIntent måste finnas i Stripe och vara `succeeded`.
//   2. PaymentIntent måste ha skapats nyligen (< 24h).
//   3. INGEN Order i vår DB får referera till intent-id:t. Om en order
//      finns måste den gå genom vanliga admin-refund-flödet.
//   4. Idempotens via Stripe-keyen så dubbla anrop blir no-op.
//
// Med dessa villkor kan en angripare bara refundera betalningar som
// redan är "förlorade" — vilket är exakt det användarscenario vi vill
// stödja. Inga konsekvenser för fungerande ordrar.
router.post('/refund-orphan', async (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  const scope = req.ip || 'anon';
  if (idempotencyKey) {
    const cached = getCachedResponse(scope, `refund-orphan:${idempotencyKey}`);
    if (cached) {
      return res.status(cached.status).json(cached.body);
    }
  }

  const { paymentIntentId } = req.body || {};

  if (!paymentIntentId || typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
    res.status(400).json({ error: 'Ogiltigt paymentIntentId' });
    return;
  }

  try {
    // 1. Hämta intent från Stripe — verifiera att den faktiskt finns
    //    och faktiskt är succeeded (vi vill inte försöka refundera en
    //    intent som inte ens debiterats).
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      // Inte succeeded → ingen pengar att refundera. Returnera 200 så
      // klienten inte gör onödig retry-loop.
      const responseBody = { success: true, refunded: false, reason: 'not-succeeded', status: intent.status };
      if (idempotencyKey) {
        cacheResponse(scope, `refund-orphan:${idempotencyKey}`, 200, responseBody);
      }
      res.json(responseBody);
      return;
    }

    // 2. Verifiera tid — Stripe-intents är åldersmärkta som unix-sek.
    //    > 24h gammal: betraktas som "för gammal" och måste hanteras av admin.
    const createdMs = (intent.created || 0) * 1000;
    if (Date.now() - createdMs > 24 * 60 * 60 * 1000) {
      res.status(403).json({
        error: 'PaymentIntent är för gammal för auto-refund. Kontakta support.',
      });
      return;
    }

    // 3. Verifiera att ingen Order länkats till denna intent. Om en
    //    order finns ska refunden gå via admin-routing — vi vill inte
    //    att en customer ska kunna refundera sin egen lagda order.
    const existingOrder = await prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true, paymentStatus: true },
    });
    if (existingOrder) {
      res.status(409).json({
        error: 'Order finns redan för denna betalning — kontakta support för refund.',
        orderId: existingOrder.id,
      });
      return;
    }

    // 4. Allt OK → refunda. Stripe-idempotency-key skyddar mot
    //    dubbla refunder om klienten retry:ar.
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      idempotencyKey ? { idempotencyKey: `refund-orphan:${idempotencyKey}` } : undefined
    );

    console.log(`💸 Orphan refund created: ${refund.id} for intent ${paymentIntentId} (no order linked)`);
    const responseBody = { success: true, refunded: true, refundId: refund.id };
    if (idempotencyKey) {
      cacheResponse(scope, `refund-orphan:${idempotencyKey}`, 200, responseBody);
    }
    res.json(responseBody);
  } catch (error: any) {
    console.error('Orphan refund error:', { paymentIntentId, error: error?.message });
    res.status(500).json({ error: error?.message || 'Återbetalning misslyckades' });
  }
});

// POST /api/payments/webhook - Stripe webhook
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metaOrderId = paymentIntent.metadata?.orderId;

      // Look up by orderId in metadata first (pending-payment flow), then by intentId
      const order = await prisma.order.findFirst({
        where: metaOrderId
          ? { OR: [{ id: metaOrderId }, { stripePaymentIntentId: paymentIntent.id }] }
          : { stripePaymentIntentId: paymentIntent.id },
        include: { restaurant: { select: { name: true } }, items: true },
      });

      if (order) {
        const isAwaitingPayment = order.status === 'AWAITING_PAYMENT';

        // BELOPPS-VERIFIKATION: jämför vad Stripe faktiskt drog mot vad
        // ordern säger sig kosta. Tidigare flippades order PAID utan denna
        // check → en angripare som manipulerat PaymentIntent (eller en
        // klient som skickat lägre belopp innan vi härlede det från DB)
        // kunde betala mindre än orderns total. Tolerans 1 öre för float-
        // rounding. På mismatch: flagga ordern men markera INTE PAID.
        const expectedAmount = order.total; // öre
        const receivedAmount = paymentIntent.amount_received ?? paymentIntent.amount;
        const amountDiff = Math.abs(receivedAmount - expectedAmount);
        if (amountDiff > 1) {
          console.error('[webhook] amount mismatch — order NOT marked PAID', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentIntentId: paymentIntent.id,
            expectedAmount,
            receivedAmount,
            diff: amountDiff,
          });
          // Markera som NEEDS_REVIEW så admin ser den och kan refunda manuellt.
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'NEEDS_REVIEW' },
          }).catch((e: any) => console.error('[webhook] could not flag order for review:', e?.message));
          // Notifiera admin-room men flippa INTE order till PAID.
          getIO().to('admin-room').emit('order:amount_mismatch', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            expectedAmount,
            receivedAmount,
          });
          break;
        }

        const updatedOrder = await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            stripePaymentIntentId: order.stripePaymentIntentId || paymentIntent.id,
            ...(isAwaitingPayment ? { status: 'PENDING', paymentMethod: 'ONLINE' } : {}),
          },
          include: { restaurant: { select: { name: true } }, items: true },
        });

        // Referral-reward — invitee:s första betalda order = trigger.
        try {
          const { maybeTriggerReferralReward } = await import('./referrals');
          await maybeTriggerReferralReward(order.id);
        } catch (e: any) {
          console.error('[payments webhook] referral-reward-trigger error:', e?.message);
        }

        // UserDeal: orderns reserverade welcome/referral-kupong markeras
        // USED. Race-guard på status='RESERVED' så vi inte trampar på en
        // revert som hann före. Idempotent — om dealen redan är USED är
        // count=0 och inget händer.
        if ((order as any).userDealId) {
          await prisma.userDeal.updateMany({
            where: { id: (order as any).userDealId, status: 'RESERVED', usedOnOrderId: order.id },
            data: { status: 'USED', usedAt: new Date() },
          }).catch((e: any) => console.error('[payments webhook] userDeal mark-USED failed:', e?.message));
        }

        // For pending-payment orders: now that payment is confirmed, broadcast to restaurant
        if (isAwaitingPayment) {
          const orderForSocket = {
            ...updatedOrder,
            total: (updatedOrder as any).total / 100,
            deliveryFee: (updatedOrder as any).deliveryFee / 100,
            discountAmount: (updatedOrder as any).discountAmount / 100,
            items: updatedOrder.items.map((i: any) => ({
              ...i,
              basePrice: i.basePrice / 100,
              subtotal: i.subtotal / 100,
            })),
            restaurantName: updatedOrder.restaurant?.name || 'Okänd restaurang',
          };
          getIO().to('admin-room').emit('order:new', orderForSocket);
          if (updatedOrder.restaurantId) {
            getIO().to(`admin-room:${updatedOrder.restaurantId}`).emit('order:new', orderForSocket);
          }

          // Discount/deal usage-increment — idempotent på order-nivå via
          // discountUsageCounted-flag. Både denna webhook och stripeReconcile-
          // pollern kan landa här — race-guard säkrar att bara en path vinner.
          await incrementDiscountUsageIfNotCounted(order.id);
        }

        // Notifiera admin
        getIO().to('admin-room').emit('order:paid', {
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metaOrderId = paymentIntent.metadata?.orderId;

      // Hitta order(s) först — vi behöver userDealId för att kunna revert:a.
      const failedOrders = await prisma.order.findMany({
        where: metaOrderId
          ? { OR: [{ id: metaOrderId }, { stripePaymentIntentId: paymentIntent.id }] }
          : { stripePaymentIntentId: paymentIntent.id },
        select: { id: true, userDealId: true },
      });

      const failedIds: string[] = failedOrders.map((o) => o.id);
      if (failedIds.length > 0) {
        await prisma.order.updateMany({
          where: { id: { in: failedIds } },
          data: { paymentStatus: 'FAILED' },
        });
      }

      // Revert UserDeal-reservationen till ACTIVE så användaren kan
      // använda kupongen igen på en ny order. Race-guard på 'RESERVED'.
      for (const o of failedOrders) {
        if (o.userDealId) {
          await prisma.userDeal.updateMany({
            where: { id: o.userDealId, status: 'RESERVED', usedOnOrderId: o.id },
            data: { status: 'ACTIVE', usedOnOrderId: null },
          }).catch((e: any) => console.error('[payments webhook] userDeal revert failed:', e?.message));
        }
      }
      break;
    }
  }

  res.json({ received: true });
});

export default router;
