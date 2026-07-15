// ---------------------------------------------------------------------------
//  Publika web push-endpoints för KUNDER (orderstatus-notiser).
//  Kurirernas push bor under /api/courier/push/* (kräver kurir-auth).
//
//  GET  /api/push/public-key   → { key } eller { key: null } när VAPID saknas (UI:t
//                                gömmer då push-toggeln helt).
//  POST /api/push/order-access → kortlivat, orderspecifikt Socket/push-bevis
//  POST /api/push/subscribe    → kopplar enhetens subscription till en aktiv
//                                order efter samma ägarskapskontroll.
//  POST /api/push/unsubscribe  → återkallar exakt innehavd browser-subscription.
// ---------------------------------------------------------------------------
import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getVapidPublicKey } from '../lib/courierPush';
import { addOrderSubscription } from '../lib/customerPush';
import { revokeOrderWebPushSubscription } from '../lib/deviceInstallations';
import {
  issueOrderAccessProof,
  issueOrderHttpSession,
  ORDER_HTTP_SESSION_HEADER,
  ORDER_HTTP_SESSION_ID_HEADER,
  resolveOrderAccess,
  validOrderId,
  verifyOrderAccessProof,
} from '../lib/orderAccess';

const router = Router();
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många pushregistreringar. Försök igen senare.' },
});
const unsubscribeLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många förfrågningar. Försök igen senare.' },
});

router.get('/public-key', (_req, res) => {
  const key = getVapidPublicKey();
  // 200 med key:null (inte 404) när VAPID saknas — klienten tolkar null som
  // "push avstängt" och visar ingen toggle, utan att skräpa ned konsolen med 404.
  res.json({ key: key || null });
});

const denyOrderAccess = (res: Response) =>
  res.status(404).json({ error: 'Order hittades inte' });

const attachWebOrderSession = (req: any, res: Response, orderId: string) => {
  if (req.headers?.['x-client-type'] !== 'web') return;
  res.setHeader(ORDER_HTTP_SESSION_HEADER, issueOrderHttpSession(orderId));
  res.setHeader(ORDER_HTTP_SESSION_ID_HEADER, orderId);
};

router.post('/order-access', async (req, res) => {
  const orderId = req.body?.orderId;
  const allowed = await resolveOrderAccess({
    orderId,
    orderSession: req.headers[ORDER_HTTP_SESSION_HEADER],
    authorization: req.headers.authorization,
  }).catch(() => false);

  if (!allowed || !validOrderId(orderId)) return denyOrderAccess(res);
  attachWebOrderSession(req, res, orderId);
  res.json({ proof: issueOrderAccessProof(orderId) });
});

router.post('/subscribe', subscribeLimiter, async (req, res) => {
  const orderId = req.body?.orderId;
  const proofAllowed = verifyOrderAccessProof(req.body?.proof, orderId);
  const directlyAllowed = proofAllowed
    ? true
    : await resolveOrderAccess({
        orderId,
        orderSession: req.headers[ORDER_HTTP_SESSION_HEADER],
        authorization: req.headers.authorization,
      }).catch(() => false);

  // Missing order and bad/missing credentials are deliberately identical.
  if (!directlyAllowed || !validOrderId(orderId)) return denyOrderAccess(res);

  try {
    const { subscription } = req.body ?? {};
    const device = await addOrderSubscription(orderId, subscription);
    attachWebOrderSession(req, res, orderId);
    res.json({ ok: true, installationId: device.installationId });
  } catch (e) {
    res.status(400).json({ error: (e as Error)?.message || 'Ogiltig subscription' });
  }
});

// No account/order query is needed: possession of endpoint + both Web Push
// secrets identifies exactly one installation. The response deliberately stays
// identical when it was already gone, so logout/unsubscribe is idempotent.
router.post('/unsubscribe', unsubscribeLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await revokeOrderWebPushSubscription(req.body?.subscription);
  } catch {
    // Malformed/unknown subscriptions must not disclose whether a device row
    // exists. Nothing has been revoked unless the complete token hash matched.
  }
  return res.json({ ok: true });
});

export default router;
