/**
 * Identifierar test-/auto-ordrar utifrån de markörer som sätts vid skapande.
 * Speglar test-gaten i routes/orders.ts (discount "test"/"testa" +
 * TEST_PAYMENT/FREE_PROMO) plus den explicita BYPASS-betalningen och
 * AUTOTEST-kunden. Används för att låta test-ordrar i vi-levererar-flödet
 * auto-slutföras vid READY istället för att hänga och vänta på ett bud som
 * aldrig kommer (det finns inget riktigt bud för en testbeställning).
 *
 * Medvetet konservativ: web-bypass (`BYPASS_WEB_…`) räknas INTE som test här,
 * så riktiga webborder aldrig auto-slutförs av misstag.
 */
export function isTestOrder(order: {
  discountCode?: string | null;
  stripePaymentIntentId?: string | null;
  customerName?: string | null;
}): boolean {
  const code = (order.discountCode || '').toLowerCase();
  const intent = (order.stripePaymentIntentId || '').toUpperCase();
  const name = (order.customerName || '').toUpperCase();
  if ((code === 'test' || code === 'testa') && (intent === 'TEST_PAYMENT' || intent === 'FREE_PROMO')) return true;
  if (intent === 'BYPASS') return true;
  if (name === 'AUTOTEST') return true;
  return false;
}
