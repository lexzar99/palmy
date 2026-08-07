import type { PayoutSpec } from "@/modules/finance/api";

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const logoSrc = "/viaeats-finance-logo.png";

const kr = (value: number) =>
  (Number(value) || 0).toLocaleString("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 2,
  });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: STOCKHOLM_TIME_ZONE });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  });

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] as string,
  );

export const payoutPrintPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value))
    ? "Ej angiven"
    : `${Number(value).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} %`;

export type PayoutPrintMode = "summary" | "orders" | "daily";
export type PayoutPrintOptions = {
  mode?: PayoutPrintMode;
  showReferenceOrders?: boolean;
  showPaymentState?: boolean;
  adjustmentNote?: string;
};

type PrintOrder = PayoutSpec["orders"][number];

const referenceOrderStatuses = new Set(["CANCELLED", "REJECTED", "DELIVERY_FAILED"]);
const referencePaymentStatuses = new Set(["REFUNDED", "FAILED"]);
const savedReportStatuses = new Set(["HOLD", "APPROVED", "PAID"]);

export function payoutPrintMode(
  spec: Pick<PayoutSpec, "persisted">,
  requestedMode: PayoutPrintMode = "orders",
): PayoutPrintMode {
  const status = String(spec.persisted?.status || "").toUpperCase();
  return spec.persisted && savedReportStatuses.has(status) ? "summary" : requestedMode;
}

export type PayoutPrintPaymentFees = {
  total: number | null;
  card: number | null;
  refund: number | null;
  ready: boolean;
  preliminary: boolean;
};

/**
 * The stored settlement always subtracts `mollieFeeAmount`. A preliminary
 * HOLD must therefore print that same amount, split into visible components,
 * even before Mollie has confirmed the final fee. Otherwise the PDF total
 * contains an invisible deduction.
 */
export function payoutPrintPaymentFees(
  spec: Pick<PayoutSpec, "breakdown" | "persisted">,
): PayoutPrintPaymentFees {
  const persisted = spec.persisted;
  const status = String(persisted?.status || "").toUpperCase();
  const useSaved = Boolean(persisted && savedReportStatuses.has(status));

  if (useSaved && persisted) {
    const total = Math.max(0, Number(persisted.mollieFeeAmount || 0));
    const refund = Math.min(
      total,
      Math.max(0, Number(persisted.refundProcessingFeeAmount || 0)),
    );
    const ready = status === "PAID" || persisted.mollieFeeStatus === "available";
    return {
      total,
      card: Math.max(0, total - refund),
      refund,
      ready,
      preliminary: !ready,
    };
  }

  const total = spec.breakdown.mollieFees;
  const refund = spec.breakdown.refundProcessingFees;
  const card = spec.breakdown.paymentFees ?? (
    total == null || refund == null ? null : Math.max(0, total - refund)
  );
  const ready =
    spec.breakdown.mollieFeeStatus === "available" &&
    total != null &&
    refund != null &&
    card != null;
  return {
    total,
    card,
    refund,
    ready,
    preliminary: total != null && !ready,
  };
}

export const payoutPrintStockholmDateKey = (iso: string) => {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso).slice(0, 10);

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const payoutPrintSettlementAmount = (order: PrintOrder) =>
  order.includedInPayout ? Number(order.total || 0) : 0;

const payoutPrintOriginalAmount = (order: PrintOrder) =>
  Math.max(0, Number(order.originalTotal || 0));

const payoutPrintRefundAmount = (order: PrintOrder) =>
  Math.min(
    payoutPrintOriginalAmount(order),
    Math.max(0, Number(order.refundAmount || 0)),
  );

const payoutPrintHasRefund = (order: PrintOrder) =>
  payoutPrintRefundAmount(order) > 0 ||
  ["REFUNDED", "PARTIALLY_REFUNDED"].includes(
    String(order.paymentStatus || "").toUpperCase(),
  );

export const payoutPrintOrderTypeLabel = (order: PrintOrder) => {
  const type = String(order.type || "").toUpperCase();
  return type === "PICKUP" || type === "TAKEAWAY" ? "Avhämtning" : "Leverans";
};

export const payoutPrintOrderStateLabel = (order: PrintOrder) => {
  const paymentStatus = String(order.paymentStatus || "").toUpperCase();
  if (!order.includedInPayout) return "Avbruten/återbetald";
  if (paymentStatus === "PARTIALLY_REFUNDED") return "Delvis återbetald";
  return "Betald";
};

export const isPayoutPrintReferenceOrder = (order: PrintOrder) =>
  !order.includedInPayout &&
  (referenceOrderStatuses.has(String(order.status || "").toUpperCase()) ||
    referencePaymentStatuses.has(String(order.paymentStatus || "").toUpperCase()));

export function payoutPrintOrders(spec: PayoutSpec, options: PayoutPrintOptions = {}) {
  return spec.orders.filter(
    (order) =>
      order.includedInPayout ||
      payoutPrintHasRefund(order) ||
      (options.showReferenceOrders && isPayoutPrintReferenceOrder(order)),
  );
}

export function payoutPrintSummary(orders: PrintOrder[]) {
  const paidOrders = orders.filter((order) => order.includedInPayout);
  const referenceOrders = orders.filter((order) => !order.includedInPayout);
  return {
    paidOrderCount: paidOrders.length,
    referenceOrderCount: referenceOrders.length,
    paidTotal: paidOrders.reduce(
      (sum, order) => sum + payoutPrintSettlementAmount(order),
      0,
    ),
  };
}

export function payoutPrintDailyRows(orders: PrintOrder[]) {
  const dailyMap = orders.reduce((map, order) => {
    const key = payoutPrintStockholmDateKey(order.createdAt);
    const current = map.get(key) ?? {
      key,
      paidCount: 0,
      referenceCount: 0,
      paidTotal: 0,
      originalTotal: 0,
      refundTotal: 0,
    };
    current.originalTotal += payoutPrintOriginalAmount(order);
    current.refundTotal += payoutPrintRefundAmount(order);
    if (order.includedInPayout) {
      current.paidCount += 1;
      current.paidTotal += payoutPrintSettlementAmount(order);
    } else {
      current.referenceCount += 1;
    }
    map.set(key, current);
    return map;
  }, new Map<string, {
    key: string;
    paidCount: number;
    referenceCount: number;
    paidTotal: number;
    originalTotal: number;
    refundTotal: number;
  }>());
  return Array.from(dailyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export type PayoutPrintSalesBridge = {
  orderSales: number;
  refunds: number;
  salesAfterRefunds: number;
  platformFundedDiscount: number;
  excludedDeliveryAndTip: number;
  restaurantGross: number;
};

/**
 * Bridges customer payments to the restaurant settlement base. ViaEats-funded
 * discounts are restored before delivery and tip outside the restaurant are
 * removed. Locked reports use their frozen funding snapshot.
 */
export function payoutPrintSalesBridge(
  spec: Pick<PayoutSpec, "breakdown" | "persisted">,
): PayoutPrintSalesBridge {
  const persisted = spec.persisted;
  const status = String(persisted?.status || "").toUpperCase();
  const useSaved = Boolean(persisted && savedReportStatuses.has(status));
  const orderSales = Math.max(
    0,
    Number(
      useSaved && persisted
        ? (persisted.originalGrossTotal ?? persisted.grossSales)
        : spec.breakdown.originalGrossTotal,
    ),
  );
  const refunds = Math.max(
    0,
    Number(useSaved && persisted ? (persisted.refunds ?? 0) : spec.breakdown.refunds),
  );
  const salesAfterRefunds = Math.max(0, orderSales - refunds);
  const platformFundedDiscount = Math.max(
    0,
    Number(
      useSaved && persisted
        ? persisted.platformFundedDiscountAmount
        : spec.breakdown.platformFundedDiscount,
    ) || 0,
  );
  const restaurantGross = Math.max(
    0,
    Number(useSaved && persisted ? persisted.grossSales : spec.breakdown.restaurantGross),
  );
  const excludedDeliveryAndTip = Math.max(
    0,
    salesAfterRefunds + platformFundedDiscount - restaurantGross,
  );

  return {
    orderSales,
    refunds,
    salesAfterRefunds,
    platformFundedDiscount,
    excludedDeliveryAndTip,
    restaurantGross,
  };
}

/**
 * Öppnar ett självständigt, utskriftsvänligt avräkningsbesked i ett nytt fönster
 * och triggar print() så användaren kan spara det som PDF.
 */
export function printPayoutSpec(
  spec: PayoutSpec,
  manualAdjustment = 0,
  lateRefundRecovery = 0,
  options: PayoutPrintOptions = {},
) {
  const breakdown = spec.breakdown;
  const persisted = spec.persisted;
  const persistedStatus = String(persisted?.status || "").toUpperCase();
  const savedReport = Boolean(persisted && savedReportStatuses.has(persistedStatus));
  const paymentFees = payoutPrintPaymentFees(spec);
  const mode = payoutPrintMode(spec, options.mode ?? "orders");
  const printOrders = mode === "summary" ? [] : payoutPrintOrders(spec, options);
  const dailyRows = payoutPrintDailyRows(printOrders);
  const showPaymentState = options.showPaymentState !== false;
  const generatedAt = new Date().toISOString();

  const reportStatusLabel =
    persistedStatus === "HOLD"
      ? "Sparad"
      : persistedStatus === "APPROVED"
        ? "Låst"
        : persistedStatus === "PAID"
          ? "Betald"
          : "Aktuell beräkning";

  const reportOrderCount =
    savedReport && persisted
      ? (persisted.periodOrderCount ?? persisted.orderCount)
      : (breakdown.periodOrderCount ?? breakdown.orderCount);
  const {
    orderSales,
    refunds,
    salesAfterRefunds,
    platformFundedDiscount,
    excludedDeliveryAndTip,
    restaurantGross,
  } = payoutPrintSalesBridge(spec);
  const reportGrossTotal = orderSales;

  const commissionPct =
    savedReport && persisted ? persisted.commissionPctSnapshot : breakdown.commissionPct;
  const commission =
    savedReport && persisted ? persisted.commissionAmount : breakdown.commission;
  const subscription =
    savedReport && persisted ? persisted.subscriptionAmount : breakdown.subscription;
  const platformFeeVat =
    savedReport && persisted
      ? ((persisted.commissionAmount + persisted.subscriptionAmount) *
          Number(persisted.feeVatPctSnapshot || 0)) /
        100
      : breakdown.feeVat;
  const platformFeeVatPct =
    savedReport && persisted ? persisted.feeVatPctSnapshot : breakdown.feeVatPct;
  const platformFeeTotal = commission + subscription + platformFeeVat;

  const refundTransactionFee = paymentFees.refund;
  const mollieFeeTotal = paymentFees.total;
  const cardTransactionFee = paymentFees.card;
  const paymentFeesReady = paymentFees.ready;
  const paymentFeesPreliminary = paymentFees.preliminary;
  const finalReportReady = paymentFeesReady && persistedStatus !== "HOLD";
  const showPaymentFees =
    cardTransactionFee == null ||
    refundTransactionFee == null ||
    cardTransactionFee > 0 ||
    refundTransactionFee > 0;

  const effectiveManualAdjustment =
    savedReport && persisted
      ? persisted.manualAdjustmentAmount
      : Number(manualAdjustment) || 0;
  const effectiveLateRefundRecovery =
    savedReport && persisted
      ? persisted.lateRefundAdjustmentAmount
      : Number(lateRefundRecovery) || 0;
  const owed = (breakdown as { owed?: number }).owed || 0;
  const settlementPosition =
    savedReport && persisted
      ? persisted.payoutAmount - persisted.owedAmount
      : breakdown.payout -
        owed -
        effectiveManualAdjustment -
        effectiveLateRefundRecovery;
  const isOwed = settlementPosition < 0;
  const finalAmount = Math.abs(settlementPosition);
  const totalLabel = isOwed
    ? finalReportReady ? "Att fakturera restaurangen" : "Preliminärt att fakturera"
    : finalReportReady
      ? "Att överföra till restaurangen"
      : "Preliminärt att överföra";

  const savedReportNote =
    persistedStatus === "HOLD"
      ? "Beloppen kommer från den sparade rapporten. Rapporten är ännu inte låst."
      : persistedStatus === "APPROVED"
        ? "Beloppen kommer från den låsta rapporten och påverkas inte av senare avtalsändringar."
        : persistedStatus === "PAID"
          ? "Beloppen kommer från den betalda rapporten och påverkas inte av senare avtalsändringar."
          : "";

  const win = window.open("", "_blank", "width=900,height=1120");
  if (!win) {
    alert("Tillåt popup-fönster för att skriva ut avräkningsbeskedet.");
    return;
  }

  const section = (label: string) =>
    `<tr class="calc-section"><td colspan="2">${esc(label)}</td></tr>`;
  const line = (
    label: string,
    value: string,
    config: {
      sign?: "−" | "+";
      subtotal?: boolean;
      muted?: boolean;
      detail?: string;
    } = {},
  ) => `<tr class="${config.subtotal ? "subtotal" : ""} ${config.muted ? "muted-row" : ""}">
      <td>
        <span>${esc(label)}</span>
        ${config.detail ? `<small>${esc(config.detail)}</small>` : ""}
      </td>
      <td class="num">${config.sign ? `${config.sign}&nbsp;` : ""}${esc(value)}</td>
    </tr>`;
  const feeValue = (value: number | null) =>
    value == null ? "Inväntar Mollie" : kr(value);
  const feeLabel = (label: string) =>
    paymentFeesPreliminary ? `${label} · preliminära` : label;

  const orderHeader = showPaymentState
    ? '<tr><th>Order</th><th>Datum</th><th>Typ</th><th>Status</th><th class="num">Köp</th><th class="num">Återbetalt</th><th class="num">Netto</th></tr>'
    : '<tr><th>Order</th><th>Datum</th><th>Typ</th><th class="num">Köp</th><th class="num">Återbetalt</th><th class="num">Netto</th></tr>';
  const orderRows = printOrders
    .map((order) => {
      const originalAmount = payoutPrintOriginalAmount(order);
      const refundAmount = payoutPrintRefundAmount(order);
      const netAmount = payoutPrintSettlementAmount(order);
      const statusCell = showPaymentState
        ? `<td><span class="transaction-status">${esc(payoutPrintOrderStateLabel(order))}</span></td>`
        : "";
      return `<tr>
        <td><strong>#${esc(order.orderNumber)}</strong></td>
        <td>${esc(day(order.createdAt))}</td>
        <td>${esc(payoutPrintOrderTypeLabel(order))}</td>
        ${statusCell}
        <td class="num">${kr(originalAmount)}</td>
        <td class="num">${refundAmount > 0 ? `− ${kr(refundAmount)}` : kr(0)}</td>
        <td class="num"><strong>${kr(netAmount)}</strong></td>
      </tr>`;
    })
    .join("");

  const dailyHeader = options.showReferenceOrders
    ? '<tr><th>Datum</th><th class="num">Order</th><th class="num">Köp</th><th class="num">Återbetalt</th><th class="num">Netto</th><th class="num">Referens</th></tr>'
    : '<tr><th>Datum</th><th class="num">Order</th><th class="num">Köp</th><th class="num">Återbetalt</th><th class="num">Netto</th></tr>';
  const dailyRowsHtml = dailyRows
    .map(
      (row) => `<tr>
        <td>${esc(day(row.key))}</td>
        <td class="num">${row.paidCount + row.referenceCount}</td>
        <td class="num">${kr(row.originalTotal)}</td>
        <td class="num">${row.refundTotal > 0 ? `− ${kr(row.refundTotal)}` : kr(0)}</td>
        <td class="num"><strong>${kr(row.paidTotal)}</strong></td>
        ${options.showReferenceOrders ? `<td class="num">${row.referenceCount}</td>` : ""}
      </tr>`,
    )
    .join("");

  const currentReferenceNotice = savedReport
    ? `<div class="notice"><strong>Aktuellt transaktionsunderlag.</strong> Bilagan hämtas från dagens orderdata och kan avvika från den sparade rapportens ${reportOrderCount} order och ${esc(kr(reportGrossTotal))}.</div>`
    : "";

  const appendix =
    mode === "summary"
      ? ""
      : mode === "daily"
        ? `<section class="appendix">
            <div class="section-heading">
              <div><span>Bilaga A</span><h2>Dagsummering</h2></div>
              <div class="section-code">${dailyRows.length} dagar</div>
            </div>
            ${currentReferenceNotice}
            <table class="data-table">
              <thead>${dailyHeader}</thead>
              <tbody>${dailyRowsHtml || `<tr><td colspan="${options.showReferenceOrders ? 6 : 5}" class="empty">Inga transaktioner i urvalet.</td></tr>`}</tbody>
            </table>
          </section>`
        : `<section class="appendix">
            <div class="section-heading">
              <div><span>Bilaga A</span><h2>Transaktionsunderlag</h2></div>
              <div class="section-code">${printOrders.length} rader</div>
            </div>
            ${currentReferenceNotice}
            <table class="data-table">
              <thead>${orderHeader}</thead>
              <tbody>${orderRows || `<tr><td colspan="${showPaymentState ? 7 : 6}" class="empty">Inga transaktioner i urvalet.</td></tr>`}</tbody>
            </table>
          </section>`;

  const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Avräkningsbesked · ${esc(spec.restaurant.name)}</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      color-scheme: light;
      --navy-950: #07192b;
      --navy-900: #0b2138;
      --navy-700: #244158;
      --ink: #12202d;
      --muted: #617182;
      --line: #dce3e8;
      --line-strong: #c5d0d8;
      --surface: #f4f7f9;
      --orange: #f4511e;
      --orange-soft: #fff1eb;
      --green: #11663d;
      --green-soft: #e9f7ef;
    }
    html, body { margin: 0; min-height: 100%; }
    body {
      padding: 28px;
      background: #e9eef2;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .document {
      width: min(100%, 210mm);
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 18px 50px rgba(7, 25, 43, 0.14);
    }
    .masthead {
      position: relative;
      padding: 15mm 16mm 12mm;
      background: var(--navy-950);
      color: #fff;
      overflow: hidden;
    }
    .masthead::after {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      background: var(--orange);
    }
    .brand-row, .statement-head, .section-heading, .total-row {
      display: flex;
      justify-content: space-between;
      gap: 18px;
    }
    .brand-row { align-items: center; margin-bottom: 8mm; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { display: block; width: 58px; height: auto; filter: brightness(0) invert(1); }
    .brand-divider { width: 1px; height: 22px; background: rgba(255,255,255,.24); }
    .brand-name { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.74); }
    .status-badge {
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(255,255,255,.26);
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #fff;
    }
    .statement-head { align-items: flex-end; }
    .eyebrow {
      display: block;
      margin-bottom: 5px;
      color: #f89a7c;
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    h1 { margin: 0; font-size: 27px; line-height: 1.1; letter-spacing: -.025em; }
    .restaurant-meta { margin-top: 7px; color: rgba(255,255,255,.68); }
    .period-block { flex: 0 0 auto; text-align: right; }
    .period-block span { display: block; color: rgba(255,255,255,.58); font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .period-block strong { display: block; margin-top: 4px; font-size: 13px; }
    .content { padding: 9mm 16mm 12mm; }
    .settlement-result {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 22px;
      align-items: end;
      padding-bottom: 7mm;
      border-bottom: 1px solid var(--line-strong);
    }
    .result-copy h2 { margin: 0 0 5px; font-size: 15px; letter-spacing: -.01em; }
    .result-copy p { max-width: 410px; margin: 0; color: var(--muted); }
    .result-amount { text-align: right; }
    .result-amount span { display: block; color: var(--muted); font-size: 9px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .result-amount strong { display: block; margin-top: 3px; color: var(--navy-950); font-size: 29px; line-height: 1; letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
    .calculation { margin-top: 7mm; }
    .section-heading { align-items: flex-end; margin-bottom: 5mm; }
    .section-heading span { display: block; margin-bottom: 2px; color: var(--orange); font-size: 8.5px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
    .section-heading h2 { margin: 0; color: var(--navy-950); font-size: 17px; letter-spacing: -.02em; }
    .section-code { color: var(--muted); font-size: 10px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    .calc-table { border-top: 2px solid var(--navy-950); }
    .calc-table td { padding: 7px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .calc-table td:first-child { padding-left: 0; }
    .calc-table td:last-child { padding-right: 0; }
    .calc-table td small { display: block; margin-top: 2px; color: var(--muted); font-size: 9.5px; }
    .calc-table td.num { width: 33%; text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .calc-table .calc-section td { padding: 12px 0 5px; border-bottom-color: var(--line-strong); color: var(--navy-700); font-size: 8.5px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .calc-table tr.subtotal td { font-weight: 850; color: var(--navy-950); background: var(--surface); border-bottom-color: var(--line-strong); }
    .calc-table tr.subtotal td:first-child { padding-left: 9px; }
    .calc-table tr.subtotal td:last-child { padding-right: 9px; }
    .total-row {
      align-items: center;
      margin-top: 5mm;
      padding: 7mm 8mm;
      background: var(--navy-950);
      color: #fff;
      border-left: 4px solid var(--orange);
    }
    .total-row span { font-size: 12px; font-weight: 800; }
    .total-row strong { font-size: 23px; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
    .tax-note { margin: 5mm 0 0; color: var(--muted); font-size: 9.5px; }
    .notice { margin-bottom: 5mm; padding: 3.5mm 4mm; border-left: 3px solid var(--orange); background: var(--orange-soft); color: #6e3421; font-size: 10px; }
    .notice.neutral { margin: 4mm 0 0; border-color: var(--line-strong); background: var(--surface); color: var(--muted); }
    .footnote { margin: 3mm 0 0; color: var(--muted); font-size: 9px; }
    .appendix { padding-top: 12mm; break-before: page; page-break-before: always; }
    .data-table { border-top: 2px solid var(--navy-950); }
    .data-table thead { display: table-header-group; }
    .data-table th { padding: 8px 7px; background: var(--surface); border-bottom: 1px solid var(--line-strong); color: var(--navy-700); font-size: 8.5px; font-weight: 900; letter-spacing: .05em; text-align: left; text-transform: uppercase; }
    .data-table td { padding: 8px 7px; border-bottom: 1px solid var(--line); font-size: 10px; vertical-align: top; }
    .data-table tr { break-inside: avoid; page-break-inside: avoid; }
    .data-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .transaction-status { color: var(--navy-700); font-size: 9px; font-weight: 700; }
    .empty { padding: 10mm !important; color: var(--muted); text-align: center; }
    .document-footer { padding: 5mm 16mm 7mm; border-top: 1px solid var(--line); color: var(--muted); font-size: 8.5px; }
    @media print {
      @page { size: A4 portrait; margin: 12mm; }
      html, body { width: 100%; min-height: 0; }
      body { padding: 0; background: #fff; }
      .document { width: 100%; margin: 0; box-shadow: none; }
      .masthead { padding: 11mm 12mm 9mm; }
      .brand-row { margin-bottom: 6mm; }
      .content { padding: 7mm 12mm 9mm; }
      .settlement-result { padding-bottom: 5mm; }
      .calculation { margin-top: 5mm; }
      .calc-table td { padding-top: 5px; padding-bottom: 5px; }
      .calc-table .calc-section td { padding-top: 8px; }
      .appendix { padding-top: 0; }
      .document-footer { padding: 4mm 12mm 0; }
    }
  </style>
</head>
<body>
  <main class="document">
    <header class="masthead">
      <div class="brand-row">
        <div class="brand">
          <img class="logo" src="${logoSrc}" alt="ViaEats" />
          <span class="brand-divider"></span>
          <span class="brand-name">Finance</span>
        </div>
        <span class="status-badge">${esc(reportStatusLabel)}</span>
      </div>
      <div class="statement-head">
        <div>
          <span class="eyebrow">Avräkningsbesked</span>
          <h1>${esc(spec.restaurant.legalName || spec.restaurant.name)}</h1>
          <div class="restaurant-meta">
            ${spec.restaurant.legalName ? `${esc(spec.restaurant.name)} · ` : ""}${spec.restaurant.organizationNumber ? `Org.nr ${esc(spec.restaurant.organizationNumber)} · ` : ""}${esc(spec.restaurant.city || spec.restaurant.address || "")}
          </div>
        </div>
        <div class="period-block">
          <span>Period</span>
          <strong>${esc(day(spec.period.from))}–${esc(day(spec.period.to))}</strong>
        </div>
      </div>
    </header>

    <div class="content">
      <section class="settlement-result">
        <div class="result-copy">
          <span class="eyebrow">Periodens slutsaldo</span>
          <h2>${esc(totalLabel)}</h2>
          <p>${paymentFeesPreliminary ? "Preliminärt belopp – visade Mollieavgifter ingår i slutsaldot men är ännu inte bekräftade." : !paymentFeesReady ? "Preliminärt belopp – betalavgifter saknas fortfarande." : persistedStatus === "HOLD" ? "Preliminärt sparat besked – rapporten är inte låst." : savedReport ? esc(savedReportNote) : "Periodens försäljning, återbetalningar och avgifter."}</p>
        </div>
        <div class="result-amount">
          <span>SEK</span>
          <strong>${kr(finalAmount)}</strong>
        </div>
      </section>

      <section class="calculation">
        <div class="section-heading">
          <div><span>Avräkning</span><h2>Så räknas beloppet</h2></div>
          <div class="section-code">Alla belopp i SEK</div>
        </div>
        <table class="calc-table">
          <tbody>
            ${section("Försäljning")}
            ${line(`Bruttoförsäljning inkl. moms (${reportOrderCount} order)`, kr(orderSales))}
            ${refunds > 0 ? line("Återbetalningar till kunder", kr(refunds), { sign: "−" }) : ""}
            ${line("Netto efter återbetalningar", kr(salesAfterRefunds), { subtotal: true })}
            ${platformFundedDiscount > 0 ? line("ViaEats-finansierad rabatt", kr(platformFundedDiscount), { sign: "+" }) : ""}
            ${excludedDeliveryAndTip > 0 ? line("Leveransavgifter och dricks som tillfaller ViaEats/bud", kr(excludedDeliveryAndTip), { sign: "−" }) : ""}
            ${excludedDeliveryAndTip > 0 || platformFundedDiscount > 0 ? line("Avräkningsgrund", kr(restaurantGross), { subtotal: true }) : ""}

            ${section("ViaEats")}
            ${line(`Provision exkl. moms (${payoutPrintPercent(commissionPct)})`, kr(commission), { sign: "−" })}
            ${subscription > 0 ? line(savedReport ? "Abonnemang exkl. moms" : `Abonnemang exkl. moms (${breakdown.tierLabel})`, kr(subscription), { sign: "−" }) : ""}
            ${platformFeeVat > 0 ? line(`Moms på ViaEats avgifter (${payoutPrintPercent(platformFeeVatPct)})`, kr(platformFeeVat), { sign: "−" }) : ""}
            ${platformFeeTotal > 0 ? line("ViaEats avgifter inkl. moms", kr(platformFeeTotal), { subtotal: true }) : ""}

            ${showPaymentFees ? section("Betalningar") : ""}
            ${showPaymentFees && (cardTransactionFee == null || cardTransactionFee > 0) ? line(feeLabel("Kortavgifter"), feeValue(cardTransactionFee), { sign: cardTransactionFee == null ? undefined : "−", detail: paymentFeesPreliminary ? "Sparad uppskattning · inväntar Mollies slutliga bokföring" : undefined }) : ""}
            ${showPaymentFees && (refundTransactionFee == null || refundTransactionFee > 0) ? line(feeLabel("Avgifter vid återbetalningar"), feeValue(refundTransactionFee), { sign: refundTransactionFee == null ? undefined : "−", detail: paymentFeesPreliminary ? "Sparad uppskattning · inväntar Mollies slutliga bokföring" : undefined }) : ""}

            ${Math.abs(effectiveManualAdjustment) > 0 || effectiveLateRefundRecovery > 0 ? section("Justeringar") : ""}
            ${Math.abs(effectiveManualAdjustment) > 0
              ? line(
                  effectiveManualAdjustment > 0 ? "Manuellt avdrag" : "Manuell kreditering",
                  kr(Math.abs(effectiveManualAdjustment)),
                  { sign: effectiveManualAdjustment > 0 ? "−" : "+", detail: options.adjustmentNote || persisted?.notes || undefined },
                )
              : ""}
            ${effectiveLateRefundRecovery > 0
              ? line("Sena återbetalningar och tillhörande avgifter", kr(effectiveLateRefundRecovery), { sign: "−" })
              : ""}
          </tbody>
        </table>
        ${paymentFeesPreliminary ? `<div class="notice neutral"><strong>Preliminära Mollieavgifter ingår i slutsaldot.</strong> Kort- och återbetalningsavgifterna ovan summerar till ${esc(kr(mollieFeeTotal || 0))} och ersätts när Mollie har bokfört de slutliga avgifterna.</div>` : ""}
        <div class="total-row"><span>${esc(totalLabel)}</span><strong>${kr(finalAmount)}</strong></div>
      </section>

      ${Number(refundTransactionFee || 0) > 0 ? `<p class="footnote">Vid en återbetalning kvarstår kortavgiften. Avgiften för själva återbetalningen visas separat.</p>` : ""}
      <p class="footnote">
        Avsändare: ${esc(spec.company.name || "ViaEats")}${spec.company.organizationNumber ? ` · Org.nr ${esc(spec.company.organizationNumber)}` : ""}${persisted?.payoutReference ? ` · Utbetalningsreferens ${esc(persisted.payoutReference)}` : ""}
      </p>

      ${appendix}
    </div>

    <footer class="document-footer">
      ViaEats Finance · Avräkningsperiod ${esc(day(spec.period.from))}–${esc(day(spec.period.to))} · Genererad ${esc(dateTime(generatedAt))}
    </footer>
  </main>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.focus();

  let printTriggered = false;
  const triggerPrint = () => {
    if (printTriggered) return;
    printTriggered = true;
    setTimeout(() => win.print(), 150);
  };
  const logo = win.document.querySelector<HTMLImageElement>(".logo");
  if (logo && !logo.complete) {
    logo.addEventListener("load", triggerPrint, { once: true });
    logo.addEventListener("error", triggerPrint, { once: true });
    setTimeout(triggerPrint, 900);
  } else {
    triggerPrint();
  }
}
