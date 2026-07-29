import {
  FINANCE_REAL_PAYMENT_STATUSES,
  isFinanceRealPaymentOrder,
  PAYOUT_ORDER_STATUSES,
} from './payoutPolicy';
import type { MollieFeeStatus } from './mollieFinance';

export type FinanceReconciliationOrder = {
  id: string;
  orderNumber: string;
  restaurantId: string | null;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  molliePaymentId: string | null;
  total: number;
  refundAmount: number | null;
};

export type FinanceDeviationSeverity = 'critical' | 'warning' | 'info';

export type FinanceDeviation = {
  id: string;
  code:
    | 'DELIVERED_WITHOUT_SETTLED_PAYMENT'
    | 'SETTLED_PAYMENT_OUTSIDE_ACCOUNTING'
    | 'MOLLIE_PAYMENT_ID_MISSING'
    | 'DUPLICATE_MOLLIE_PAYMENT_ID'
    | 'REFUND_AMOUNT_INVALID'
    | 'MOLLIE_FEE_MISSING'
    | 'MOLLIE_REPORTING_UNAVAILABLE'
    | 'NEGATIVE_PROCESSING_MARGIN';
  severity: FinanceDeviationSeverity;
  restaurantId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  paymentId: string | null;
  title: string;
  detail: string;
  amountOre: number | null;
  affectedOrderCount: number;
  confirmedLoss: boolean;
};

const normalized = (value: unknown) => String(value || '').trim().toUpperCase();
const isMollie = (order: FinanceReconciliationOrder) =>
  String(order.paymentProvider || '').trim().toLowerCase() === 'mollie';

export function reconcileFinanceOrders(input: {
  orders: readonly FinanceReconciliationOrder[];
  feeStatus: MollieFeeStatus;
  feeByPaymentId: ReadonlyMap<string, number>;
}): FinanceDeviation[] {
  const deviations: FinanceDeviation[] = [];
  const realOrders = input.orders.filter(isFinanceRealPaymentOrder);

  for (const order of input.orders) {
    const terminal = (PAYOUT_ORDER_STATUSES as readonly string[]).includes(normalized(order.status));
    const settled = (FINANCE_REAL_PAYMENT_STATUSES as readonly string[]).includes(
      normalized(order.paymentStatus),
    );
    const total = Math.max(0, Math.round(Number(order.total || 0)));
    const refund = Math.round(Number(order.refundAmount || 0));

    if (terminal && !settled) {
      deviations.push({
        id: `unsettled:${order.id}`,
        code: 'DELIVERED_WITHOUT_SETTLED_PAYMENT',
        severity: 'critical',
        restaurantId: order.restaurantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: order.molliePaymentId,
        title: `Levererad order utan slutbetald betalning`,
        detail: `Order ${order.orderNumber} är ${normalized(order.status)} men betalningen är ${normalized(order.paymentStatus) || 'OKÄND'}. Den räknas inte som intäkt.`,
        amountOre: total,
        affectedOrderCount: 1,
        confirmedLoss: false,
      });
    }

    if (!terminal && settled && total - Math.max(0, refund) > 0) {
      deviations.push({
        id: `outside-accounting:${order.id}`,
        code: 'SETTLED_PAYMENT_OUTSIDE_ACCOUNTING',
        severity: 'warning',
        restaurantId: order.restaurantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: order.molliePaymentId,
        title: `Betald order utanför restaurangutbetalning`,
        detail: `Order ${order.orderNumber} har en verklig betalning men orderstatus ${normalized(order.status) || 'OKÄND'}. Pengarna syns i ekonomin men betalas inte ut till restaurangen innan leverans eller slutlig återbetalning är klar.`,
        amountOre: Math.max(0, total - Math.max(0, refund)),
        affectedOrderCount: 1,
        confirmedLoss: false,
      });
    }

    if (settled && isMollie(order) && !String(order.molliePaymentId || '').trim()) {
      deviations.push({
        id: `missing-payment-id:${order.id}`,
        code: 'MOLLIE_PAYMENT_ID_MISSING',
        severity: 'critical',
        restaurantId: order.restaurantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: null,
        title: `Mollie-referens saknas`,
        detail: `Order ${order.orderNumber} är bokförd som betald men saknar Mollie payment ID. Betalningen och avgiften kan därför inte stämmas av.`,
        amountOre: total,
        affectedOrderCount: 1,
        confirmedLoss: false,
      });
    }

    const partial = normalized(order.paymentStatus) === 'PARTIALLY_REFUNDED';
    const full = normalized(order.paymentStatus) === 'REFUNDED';
    if (
      refund < 0 ||
      refund > total ||
      (partial && (refund <= 0 || refund >= total)) ||
      (full && refund > 0 && refund < total)
    ) {
      deviations.push({
        id: `refund-invalid:${order.id}`,
        code: 'REFUND_AMOUNT_INVALID',
        severity: 'critical',
        restaurantId: order.restaurantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: order.molliePaymentId,
        title: `Återbetalningen stämmer inte`,
        detail: `Order ${order.orderNumber} har status ${normalized(order.paymentStatus)} men ${refund} öre återbetalt av ${total} öre.`,
        amountOre: Math.max(0, refund - total),
        affectedOrderCount: 1,
        confirmedLoss: refund > total,
      });
    }
  }

  const ordersByPaymentId = new Map<string, FinanceReconciliationOrder[]>();
  for (const order of realOrders.filter(isMollie)) {
    const paymentId = String(order.molliePaymentId || '').trim();
    if (!paymentId) continue;
    const rows = ordersByPaymentId.get(paymentId) || [];
    rows.push(order);
    ordersByPaymentId.set(paymentId, rows);
  }

  for (const [paymentId, paymentOrders] of ordersByPaymentId) {
    if (paymentOrders.length > 1) {
      deviations.push({
        id: `duplicate:${paymentId}`,
        code: 'DUPLICATE_MOLLIE_PAYMENT_ID',
        severity: 'critical',
        restaurantId: paymentOrders[0]?.restaurantId || null,
        orderId: null,
        orderNumber: paymentOrders.map((order) => order.orderNumber).join(', '),
        paymentId,
        title: `Samma Mollie-betalning används flera gånger`,
        detail: `${paymentId} är kopplad till ${paymentOrders.length} ordrar. Kontrollera att försäljningen inte dubbelräknas.`,
        amountOre: paymentOrders
          .map((order) => Math.max(0, Number(order.total || 0)))
          .sort((a, b) => b - a)
          .slice(1)
          .reduce((sum, amount) => sum + amount, 0),
        affectedOrderCount: paymentOrders.length,
        confirmedLoss: false,
      });
    }
  }

  if (input.feeStatus === 'unavailable' && ordersByPaymentId.size > 0) {
    deviations.push({
      id: 'mollie-reporting-unavailable',
      code: 'MOLLIE_REPORTING_UNAVAILABLE',
      severity: 'warning',
      restaurantId: null,
      orderId: null,
      orderNumber: null,
      paymentId: null,
      title: `Mollies bokföringsdata är inte tillgänglig`,
      detail: `Avgifter och saldo kan inte verifieras förrän rapportkopplingen med balances.read fungerar.`,
      amountOre: null,
      affectedOrderCount: ordersByPaymentId.size,
      confirmedLoss: false,
    });
  } else if (input.feeStatus === 'partial') {
    const missingByRestaurant = new Map<string | null, FinanceReconciliationOrder[]>();
    for (const [paymentId, paymentOrders] of ordersByPaymentId) {
      if (input.feeByPaymentId.has(paymentId)) continue;
      const restaurantId = paymentOrders[0]?.restaurantId || null;
      const rows = missingByRestaurant.get(restaurantId) || [];
      rows.push(...paymentOrders);
      missingByRestaurant.set(restaurantId, rows);
    }
    for (const [restaurantId, paymentOrders] of missingByRestaurant) {
      const uniquePaymentIds = [...new Set(paymentOrders.map((order) => order.molliePaymentId).filter(Boolean))];
      deviations.push({
        id: `missing-fee:${restaurantId || 'unknown'}`,
        code: 'MOLLIE_FEE_MISSING',
        severity: 'warning',
        restaurantId,
        orderId: null,
        orderNumber: null,
        paymentId: null,
        title: `${uniquePaymentIds.length} Mollie-avgifter är inte slutbokförda`,
        detail: `Betalningarna räknas med och avgifterna visas preliminärt. Mollies exakta bokförda avgifter ersätter dem automatiskt innan rapporten kan låsas.`,
        amountOre: null,
        affectedOrderCount: paymentOrders.length,
        confirmedLoss: false,
      });
    }
  }

  const severityRank: Record<FinanceDeviationSeverity, number> = {
    critical: 3,
    warning: 2,
    info: 1,
  };
  return deviations.sort((a, b) =>
    severityRank[b.severity] - severityRank[a.severity] ||
    Number(b.amountOre || 0) - Number(a.amountOre || 0) ||
    a.id.localeCompare(b.id)
  );
}
