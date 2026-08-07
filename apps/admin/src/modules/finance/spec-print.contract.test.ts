import assert from "node:assert/strict";
import type { PayoutSpec, PayoutSpecOrder } from "@/modules/finance/api";
import {
  payoutPrintDailyRows,
  payoutPrintOrders,
  payoutPrintMode,
  payoutPrintPaymentFees,
  payoutPrintPercent,
  payoutPrintSalesBridge,
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
assert.equal(payoutPrintPercent(0), "0 %");
assert.equal(payoutPrintPercent(12.5), "12,5 %");
assert.equal(payoutPrintPercent(null), "Ej angiven");

const preliminaryHoldFees = payoutPrintPaymentFees({
  breakdown: {
    mollieFees: 12.5,
    paymentFees: 10,
    refundProcessingFees: 2.5,
    mollieFeeStatus: "partial",
  } as PayoutSpec["breakdown"],
  persisted: {
    status: "HOLD",
    mollieFeeAmount: 12.5,
    mollieFeeStatus: "partial",
    paymentFeeAmount: 10,
    refundProcessingFeeAmount: 2.5,
  } as PayoutSpec["persisted"],
});
assert.deepEqual(preliminaryHoldFees, {
  total: 12.5,
  card: 10,
  refund: 2.5,
  ready: false,
  preliminary: true,
});
assert.equal(
  preliminaryHoldFees.card! + preliminaryHoldFees.refund!,
  preliminaryHoldFees.total,
  "a preliminary HOLD prints every Mollie fee included in its saved settlement",
);

const legacyHoldFees = payoutPrintPaymentFees({
  breakdown: {} as PayoutSpec["breakdown"],
  persisted: {
    status: "HOLD",
    mollieFeeAmount: 8.75,
    mollieFeeStatus: "unavailable",
  } as PayoutSpec["persisted"],
});
assert.deepEqual(legacyHoldFees, {
  total: 8.75,
  card: 8.75,
  refund: 0,
  ready: false,
  preliminary: true,
});

const liveFundingBridge = payoutPrintSalesBridge({
  breakdown: {
    originalGrossTotal: 100,
    refunds: 20,
    restaurantGross: 90,
    platformFundedDiscount: 20,
  } as PayoutSpec["breakdown"],
  persisted: null,
});
assert.deepEqual(liveFundingBridge, {
  orderSales: 100,
  refunds: 20,
  salesAfterRefunds: 80,
  platformFundedDiscount: 20,
  excludedDeliveryAndTip: 10,
  restaurantGross: 90,
});

const savedFundingBridge = payoutPrintSalesBridge({
  breakdown: {
    originalGrossTotal: 999,
    refunds: 0,
    restaurantGross: 999,
    platformFundedDiscount: 0,
  } as PayoutSpec["breakdown"],
  persisted: {
    status: "APPROVED",
    originalGrossTotal: 100,
    refunds: 20,
    grossSales: 90,
    platformFundedDiscountAmount: 20,
  } as PayoutSpec["persisted"],
});
assert.deepEqual(
  savedFundingBridge,
  liveFundingBridge,
  "a locked PDF uses the frozen ViaEats subsidy and settlement base",
);

for (const status of ["HOLD", "APPROVED", "PAID"]) {
  assert.equal(
    payoutPrintMode({ persisted: { status } as PayoutSpec["persisted"] }, "orders"),
    "summary",
    `${status} cannot print a live order appendix beside frozen totals`,
  );
  assert.equal(
    payoutPrintMode({ persisted: { status } as PayoutSpec["persisted"] }, "daily"),
    "summary",
    `${status} cannot print a live daily appendix beside frozen totals`,
  );
}
assert.equal(payoutPrintMode({ persisted: null }, "orders"), "orders");
assert.equal(
  payoutPrintMode({ persisted: { status: "DRAFT" } as PayoutSpec["persisted"] }, "daily"),
  "daily",
);

console.log("finance PDF order, refund, funding, fee visibility, commission and Stockholm-day contracts: ok");
