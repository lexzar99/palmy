// ---------------------------------------------------------------------------
//  Publika web push-endpoints för KUNDER (orderstatus-notiser).
//  Kurirernas push bor under /api/courier/push/* (kräver kurir-auth).
//
//  GET  /api/push/public-key   → { key } eller 404 när VAPID saknas (UI:t
//                                gömmer då push-toggeln helt).
//  POST /api/push/subscribe    → { orderId, subscription } — kopplar enhetens
//                                subscription till en aktiv order (in-memory,
//                                TTL 6h). Ingen auth: orderId är ett oguessbart
//                                cuid och payloaden kan bara ge ägaren notiser.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { getVapidPublicKey } from '../lib/courierPush';
import { addOrderSubscription } from '../lib/customerPush';

const router = Router();

router.get('/public-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(404).json({ error: 'Push är inte konfigurerat' });
  res.json({ key });
});

router.post('/subscribe', (req, res) => {
  try {
    const { orderId, subscription } = req.body ?? {};
    if (!orderId || typeof orderId !== 'string' || orderId.length > 64) {
      return res.status(400).json({ error: 'orderId krävs' });
    }
    addOrderSubscription(orderId, subscription);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error)?.message || 'Ogiltig subscription' });
  }
});

export default router;
