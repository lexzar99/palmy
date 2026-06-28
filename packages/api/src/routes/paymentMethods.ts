import { Router } from 'express';
import { authenticateUser } from './auth';
import { listAdyenStoredPaymentMethods } from '../lib/payments/adyen';

const router = Router();

router.get('/payment-methods', authenticateUser, async (req: any, res) => {
  try {
    const userId = String(req.user?.id || '');
    if (!userId) {
      res.status(401).json({ error: 'Logga in först' });
      return;
    }
    const methods = await listAdyenStoredPaymentMethods(userId);
    res.json({ methods, paymentMethods: methods });
  } catch (e: any) {
    console.error('[account/payment-methods] error:', e?.message || e);
    res.status(500).json({ error: 'Kunde inte hämta sparade betalningssätt' });
  }
});

export default router;
