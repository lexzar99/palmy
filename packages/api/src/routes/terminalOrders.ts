import { Router, type Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { getIO } from '../lib/socket';
import { bustCache } from '../lib/ttlCache';
import { alertDeliveryOutcome } from '../lib/restaurantWatch';
import { sendDeliveryOutcomeEmail } from '../lib/deliveryOutcomeEmail';
import { reviewPushId } from '../lib/notificationIds';
import {
  customerOutcomeView,
  DeliveryOutcomeError,
  OUTCOME_MAX_EMAILS,
  outcomeBlocksReview,
  OUTCOME_TERMINAL_LABEL,
  outcomeIneligibleReason,
  readOutcome,
  terminalOutcomeView,
  validateOutcome,
  writeOutcome,
} from '../lib/deliveryOutcome';
import { appVersionOf, idempotent, requireTerminalDevice, type TerminalRequest } from './terminalSettings';

// ── Ordrar från plattan (partner v2): "Kunden gick inte att nå" ─────────────
//
// Monteras inne i routes/terminal.ts, alltså under /api/terminal, som redan är
// vitlistad för terminaltokens. Restaurangen tas ur token. En annan
// restaurangs order ger 404, så att den inte avslöjar att ordern finns.
// Markeringen ändrar aldrig orderns status (se lib/deliveryOutcome.ts).

const router = Router();
const guard = [authenticate, requireTerminalDevice];

const fail = (res: Response, error: unknown) => {
  if (error instanceof DeliveryOutcomeError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('[terminal/delivery-outcome] error:', (error as Error)?.message ?? error);
  return res.status(500).json({ error: 'Kunde inte spara just nu. Försök igen.', code: 'SERVER_ERROR' });
};

// POST /api/terminal/orders/:id/delivery-outcome  { outcome, note? }
router.post('/orders/:id/delivery-outcome', ...guard, async (req, res) => {
  const treq = req as TerminalRequest;
  try {
    await idempotent(treq, res, 'delivery-outcome', async () => {
      const { code, note } = validateOutcome(req.body || {});
      const restaurantId = treq.admin.restaurantId;
      const order = await prisma.order.findFirst({
        where: { id: String(req.params.id), restaurantId },
        select: {
          id: true,
          orderNumber: true,
          type: true,
          status: true,
          createdAt: true,
          customerEmail: true,
          restaurant: { select: { name: true, phone: true, selfDelivery: true } },
        },
      });
      if (!order) throw new DeliveryOutcomeError(404, 'ORDER_NOT_FOUND', 'Ordern finns inte');

      const before = await readOutcome(order.id);
      const reason = outcomeIneligibleReason(
        { type: order.type, status: order.status, createdAt: order.createdAt, selfDelivery: Boolean(order.restaurant?.selfDelivery) },
        before,
        code,
      );
      if (reason) throw new DeliveryOutcomeError(409, 'ORDER_NOT_ELIGIBLE', reason);

      const email = String(order.customerEmail || '').trim();
      const { previous, next, sendEmail } = await writeOutcome({
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantId,
        code,
        note,
        deviceId: treq.admin.deviceId,
        appVersion: appVersionOf(treq),
        wantsEmail: email.includes('@'),
      });

      let emailResult: 'sent' | 'no_email' | 'limit' | 'failed' | 'skipped' = 'skipped';
      if (sendEmail) {
        emailResult = (await sendDeliveryOutcomeEmail({
          to: email,
          code,
          note,
          orderNumber: order.orderNumber,
          restaurantName: order.restaurant?.name || '',
          restaurantPhone: order.restaurant?.phone || '',
        }))
          ? 'sent'
          : 'failed';
      } else if (code !== 'RESOLVED') {
        if (!email.includes('@')) emailResult = 'no_email';
        else if ((previous?.emails ?? 0) >= OUTCOME_MAX_EMAILS) emailResult = 'limit';
      }

      // En betygspush som redan schemalagts (ordern var avslutad) stoppas.
      if (outcomeBlocksReview(next)) {
        await (prisma as any).scheduledPush
          .updateMany({ where: { id: reviewPushId(order.id), sentAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } })
          .catch(() => null);
      }

      bustCache('order:byid', order.id);
      try {
        const io = getIO();
        io.to(`order:${order.id}`).emit('order:delivery-outcome', {
          orderId: order.id,
          deliveryOutcome: customerOutcomeView(next, { includeNote: true }),
        });
        const terminalPayload = { id: order.id, orderId: order.id, status: order.status, deliveryOutcome: terminalOutcomeView(next) };
        io.to(`admin-room:${restaurantId}`).emit('order:updated', terminalPayload);
        io.to('admin-room').emit('order:updated', terminalPayload);
      } catch {
        // Socketen kan saknas vid start. Databasen är sanningen, och sidan hämtar var 15:e s.
      }

      // Fritexten kan innehålla en adress, så den loggas inte.
      void audit(treq, 'TERMINAL_ORDER_DELIVERY_OUTCOME', {
        resourceType: 'Order',
        resourceId: order.id,
        changes: {
          orderNumber: order.orderNumber,
          outcome: code,
          previous: previous?.code ?? null,
          revision: next.revision,
          email: emailResult,
          deviceId: treq.admin.deviceId,
          appVersion: appVersionOf(treq),
        },
      });
      if (next.revision !== previous?.revision) {
        void alertDeliveryOutcome({
          restaurantId,
          restaurantName: order.restaurant?.name || 'Restaurang',
          orderNumber: order.orderNumber,
          label: OUTCOME_TERMINAL_LABEL[code],
          resolved: code === 'RESOLVED',
          revision: next.revision,
        });
      }

      return {
        status: 200,
        body: {
          orderId: order.id,
          deliveryOutcome: terminalOutcomeView(next),
          notified: { live: true, email: emailResult },
        },
      };
    });
  } catch (error) {
    if (!res.headersSent) fail(res, error);
  }
});

export default router;
