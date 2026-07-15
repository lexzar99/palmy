import { dispatchCustomerOrderStatus } from '../customerOrderNotifier';
import { getIO } from '../socket';
import { bustCache } from '../ttlCache';

/** Publish the already-persisted full-refund state without owning money truth. */
export async function announceFullRefund(
  orderId: string,
  restaurantId: string | null,
  orderStatus: 'CANCELLED' | 'REJECTED' = 'CANCELLED',
) {
  bustCache('order:byid', orderId);
  const payload = { id: orderId, orderId, status: orderStatus, paymentStatus: 'REFUNDED' };
  try {
    const io = getIO();
    io.to(`order:${orderId}`).emit('order:status', payload);
    io.to('admin-room').emit('order:updated', payload);
    if (restaurantId) io.to(`admin-room:${restaurantId}`).emit('order:updated', payload);
  } catch {
    // Socket may not be initialised in a worker/test process. DB remains truth.
  }
  await dispatchCustomerOrderStatus(orderId, orderStatus);
}
