import assert from "node:assert/strict";
import type { PayoutSpec, PayoutSpecOrder } from "@/modules/finance/api";
import {
  payoutPrintDailyRows,
  payoutPrintOrders,
  payoutPrintSettlementAmount,
  payoutPrintStockholmDateKey,
  payoutPrintSummary,
} from "./spec-print";

const order = (values: Partial<PayoutSpecOrder> & Pick<PayoutSpecOrder, "orderNumber">): PayoutSpecOrder => ({
  orderNumber: values.orderNumber,
  createdAt: values.createdAt || "2026-08-07T10:00:00.000Z",
  type: values.type || "DELIVERY",
  status: values.status || "DELIVERED",
  paymentStatus: values.paymentStatus || "PAID",
  includedInPayout: values.includedInPayout ?? true,
  originalTotal: values.originalTotal ?? 100,
  refundAmount: values.refundAmount ?? 0,
  total: values.total ?? 100,
  deliveryFee: values.deliveryFee ?? 0,
  tip: values.tip ?? 0,
});

const paid = order({ orderNumber: "paid", originalTotal: 100, total: 100 });
const partial = order({
  orderNumber: "partial",
  paymentStatus: "PARTIALLY_REFUNDED",
  originalTotal: 200,
  refundAmount: 50,
  total: 150,
});
const refunded = order({
  orderNumber: "refunded",
  paymentStatus: "REFUNDED",
  includedInPayout: false,
  originalTotal: 300,
  refundAmount: 300,
  total: 300,
});
const cancelled = order({
  orderNumber: "cancelled",
  status: "CANCELLED",
  paymentStatus: "FAILED",
  includedInPayout: false,
  originalTotal: 400,
  total: 400,
});
const spec = { orders: [paid, partial, refunded, cancelled] } as PayoutSpec;

const defaultRows = payoutPrintOrders(spec);
assert.deepEqual(defaultRows.map((item) => item.orderNumber), ["paid", "partial", "refunded"]);
assert.deepEqual(
  payoutPrintOrders(spec, { showReferenceOrders: true }).map((item) => item.orderNumber),
  ["paid", "partial", "refunded", "cancelled"],
);
assert.equal(payoutPrintSettlementAmount(refunded), 0);
assert.deepEqual(payoutPrintSummary(defaultRows), {
  paidOrderCount: 2,
  referenceOrderCount: 1,
  paidTotal: 250,
});

assert.deepEqual(payoutPrintDailyRows(defaultRows), [{
  key: "2026-08-07",
  paidCount: 2,
  referenceCount: 1,
  paidTotal: 250,
  originalTotal: 600,
  refundTotal: 350,
}]);
assert.equal(payoutPrintStockholmDateKey("2026-03-28T23:30:00.000Z"), "2026-03-29");

console.log("finance PDF order, refund and Stockholm-day contracts: ok");
