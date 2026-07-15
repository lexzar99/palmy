import crypto from 'crypto';

/** Stable IDs shared by schedulers and financial cleanup without importing transports. */
export function customerOrderNotificationAuditId(orderId: string, status: string) {
  const hash = crypto.createHash('sha256').update(`${orderId}\0${status.toUpperCase()}`).digest('hex');
  return `orderpush_${hash.slice(0, 44)}`;
}

export function reviewPushId(orderId: string) {
  const hash = crypto.createHash('sha256').update(`review\0${orderId}`).digest('hex');
  return `review_${hash.slice(0, 48)}`;
}
