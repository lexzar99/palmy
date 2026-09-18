/** Rapportering läser betalstatus; den ändrar aldrig betalning eller order. */
export function isJourneyPaidOrder(order: {
  paymentStatus: string;
  accountingExcluded: boolean;
  status: string;
}): boolean {
  return !order.accountingExcluded
    && order.status !== 'CANCELLED'
    && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus);
}

/** Ett order-id får bara räknas en gång, även vid omladdning eller flera sessioner. */
export function claimPaidOrders(ids: string[], paidIds: Set<string>, claimed: Set<string>): string[] {
  const result: string[] = [];
  for (const id of ids) {
    if (!paidIds.has(id) || claimed.has(id)) continue;
    claimed.add(id);
    result.push(id);
  }
  return result;
}
