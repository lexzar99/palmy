/**
 * Customer-visible self-delivery transit window. Platform deliveries are
 * completed only by their courier, never by this timer.
 */

export function computeDeliveryWindowMs(deliveringAt: Date, orderId: string): number {
  void deliveringAt;
  void orderId;
  return 15 * 60 * 1000;
}
