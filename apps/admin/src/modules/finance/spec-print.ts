import type { PayoutSpec } from "@/modules/finance/api";

const kr = (n: number) =>
  (Number(n) || 0).toLocaleString("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 });
const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: STOCKHOLM_TIME_ZONE });
const dateTime = (iso: string) => new Date(iso).toLocaleString("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const vatLabel = (value: number | null | undefined) =>
  value == null ? "blandad moms" : `${Number(value).toLocaleString("sv-SE")}%`;
const logoSrc = "/viaeats-finance-logo.png";

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

export const payoutPrintStockholmDateKey = (iso: string) => {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso).slice(0, 10);

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const payoutPrintSettlementAmount = (order: PrintOrder) =>
  order.includedInPayout ? Number(order.total || 0) : 0;

const payoutPrintOriginalAmount = (order: PrintOrder) => Math.max(0, Number(order.originalTotal || 0));
const payoutPrintRefundAmount = (order: PrintOrder) => Math.min(
  payoutPrintOriginalAmount(order),
  Math.max(0, Number(order.refundAmount || 0)),
);
const payoutPrintHasRefund = (order: PrintOrder) =>
  payoutPrintRefundAmount(order) > 0 || ["REFUNDED", "PARTIALLY_REFUNDED"].includes(String(order.paymentStatus || "").toUpperCase());

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
  (
    referenceOrderStatuses.has(String(order.status || "").toUpperCase()) ||
    referencePaymentStatuses.has(String(order.paymentStatus || "").toUpperCase())
  );

export function payoutPrintOrders(spec: PayoutSpec, options: PayoutPrintOptions = {}) {
  return spec.orders.filter((order) =>
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
    paidTotal: paidOrders.reduce((sum, order) => sum + payoutPrintSettlementAmount(order), 0),
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

/**
 * Öppnar en självständig, utskriftsvänlig utbetalningsspec i ett nytt fönster
 * och triggar print() så användaren sparar som PDF. Ingen server-PDF behövs.
 */
export function printPayoutSpec(
  spec: PayoutSpec,
  manualAdjustment = 0,
  lateRefundRecovery = 0,
  options: PayoutPrintOptions = {},
) {
  const b = spec.breakdown;
  const persisted = spec.persisted;
  const persistedStatus = String(persisted?.status || "").toUpperCase();
  const savedReport = Boolean(persisted && savedReportStatuses.has(persistedStatus));
  const reportStatusLabel = persistedStatus === "HOLD"
    ? "Sparad · ej låst"
    : persistedStatus === "APPROVED"
      ? "Låst"
      : persistedStatus === "PAID"
        ? "Betald"
        : null;
  const mode = options.mode ?? "orders";
  const printOrders = payoutPrintOrders(spec, options);
  const referenceSummary = payoutPrintSummary(printOrders);
  const dailyRows = payoutPrintDailyRows(printOrders);
  const reportOrderCount = savedReport && persisted
    ? (persisted.periodOrderCount ?? persisted.orderCount)
    : (b.periodOrderCount ?? b.orderCount);
  const reportGrossTotal = savedReport && persisted
    ? (persisted.originalGrossTotal ?? persisted.grossSales)
    : b.originalGrossTotal;
  const showPaymentState = options.showPaymentState !== false;
  const owed = (b as { owed?: number }).owed || 0;
  const settlementPosition = savedReport && persisted
    ? persisted.payoutAmount - persisted.owedAmount
    : b.payout - owed - (Number(manualAdjustment) || 0) - (Number(lateRefundRecovery) || 0);
  const isOwed = settlementPosition < 0;
  const net = Math.abs(settlementPosition);
  const totalLabel = isOwed ? "Att fakturera restaurangen" : "Att överföra till restaurangen";
  const modelLabel = (savedReport ? persisted?.selfDeliverySnapshot : spec.restaurant.selfDelivery) ? "Levererar själv" : "ViaEats levererar";
  const commissionPct = savedReport ? persisted?.commissionPctSnapshot : b.commissionPct;
  const platformFeeVat = savedReport && persisted
    ? ((persisted.commissionAmount + persisted.subscriptionAmount) * Number(persisted.feeVatPctSnapshot || 0)) / 100
    : b.feeVat;
  const platformFeeBase = savedReport && persisted
    ? persisted.commissionAmount + persisted.subscriptionAmount
    : b.commission + b.subscription;
  const platformFeeTotal = platformFeeBase + platformFeeVat;
  const mollieFeeTotal = savedReport && persisted
    ? persisted.mollieFeeAmount
    : b.mollieFees;
  const refundTransactionFee = savedReport && persisted
    ? (persisted.refundProcessingFeeAmount ?? 0)
    : b.refundProcessingFees;
  const cardTransactionFee = savedReport && persisted
    ? (persisted.paymentFeeAmount ?? Math.max(0, persisted.mollieFeeAmount - (refundTransactionFee || 0)))
    : (b.paymentFees ?? (
        mollieFeeTotal == null || refundTransactionFee == null
          ? null
          : Math.max(0, mollieFeeTotal - refundTransactionFee)
      ));
  const mollieFeeLabel = savedReport && persisted
    ? (persisted.mollieFeeStatus === "available" ? "exakt" : "preliminär")
    : (b.mollieFeeStatus === "available" ? "exakt" : "beräknad från korttyp");
  const orderSales = savedReport && persisted
    ? (persisted.originalGrossTotal ?? persisted.grossSales)
    : b.originalGrossTotal;
  const refunds = savedReport && persisted ? (persisted.refunds ?? 0) : b.refunds;
  const salesAfterRefunds = Math.max(0, orderSales - refunds);
  const restaurantGross = savedReport && persisted ? persisted.grossSales : b.restaurantGross;
  const foodVat = savedReport && persisted ? (persisted.foodVatAmount ?? 0) : b.foodVat;
  const foodVatPct = savedReport && persisted ? persisted.foodVatPctSnapshot : b.foodVatPct;
  const salesExVat = Math.max(0, restaurantGross - foodVat);
  const commission = savedReport && persisted ? persisted.commissionAmount : b.commission;
  const subscription = savedReport && persisted ? persisted.subscriptionAmount : b.subscription;
  const orderCount = savedReport && persisted
    ? (persisted.periodOrderCount ?? persisted.orderCount)
    : (b.periodOrderCount ?? b.orderCount);
  const orderExclusions = Math.max(0, salesAfterRefunds - restaurantGross);
  const modeLabel: Record<PayoutPrintMode, string> = {
    summary: "Totalt antal order och belopp",
    orders: "Varje order med ordernummer och belopp",
    daily: "Per dag med antal order och belopp",
  };
  const savedReportNote = persistedStatus === "HOLD"
    ? "Beloppen ovan kommer från den sparade rapporten. Rapporten är ännu inte låst."
    : persistedStatus === "APPROVED"
      ? "Beloppen ovan kommer från den låsta rapporten och räknas inte om med dagens inställningar."
      : persistedStatus === "PAID"
        ? "Beloppen ovan kommer från den betalda rapporten och räknas inte om med dagens inställningar."
        : "";
  const reportMetadata = savedReport && persisted
    ? [
        persisted.payoutReference ? `<div class="muted"><strong>Betalningsreferens:</strong> ${esc(persisted.payoutReference)}</div>` : "",
        persisted.approvedAt ? `<div class="muted"><strong>Låst:</strong> ${esc(dateTime(persisted.approvedAt))}${persisted.approvedBy ? ` av ${esc(persisted.approvedBy)}` : ""}</div>` : "",
        persisted.paidAt ? `<div class="muted"><strong>Betald:</strong> ${esc(dateTime(persisted.paidAt))}${persisted.paidBy ? ` av ${esc(persisted.paidBy)}` : ""}</div>` : "",
      ].filter(Boolean).join("")
    : "";
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    alert("Tillåt popup-fönster för att skriva ut specen.");
    return;
  }

  const section = (label: string) => `<tr class="section"><td colspan="2">${esc(label)}</td></tr>`;
  const line = (label: string, value: string, opts: { strong?: boolean; sub?: boolean; sign?: "−" | "+" } = {}) =>
    `<tr class="${opts.strong ? "strong" : ""} ${opts.sub ? "sub" : ""}">
      <td>${esc(label)}</td>
      <td class="num">${opts.sign ? `${opts.sign} ` : ""}${esc(value)}</td>
    </tr>`;
  const mollieValue = (value: number | null) => value == null ? "Inväntar Mollie" : kr(value);

  const orderHeader = showPaymentState
    ? "<tr><th>Order</th><th>Datum</th><th>Typ</th><th>Status</th><th class=\"num\">Original</th><th class=\"num\">Återbetalt</th><th class=\"num\">Netto</th></tr>"
    : "<tr><th>Order</th><th>Datum</th><th>Typ</th><th class=\"num\">Original</th><th class=\"num\">Återbetalt</th><th class=\"num\">Netto</th></tr>";
  const orderRows = printOrders
    .map((order) => {
      const state = payoutPrintOrderStateLabel(order);
      const originalAmount = payoutPrintOriginalAmount(order);
      const refundAmount = payoutPrintRefundAmount(order);
      const netAmount = payoutPrintSettlementAmount(order);
      const statusCell = showPaymentState ? `<td>${esc(state)}</td>` : "";
      return `<tr><td><strong>#${esc(order.orderNumber)}</strong></td><td>${day(order.createdAt)}</td><td>${esc(payoutPrintOrderTypeLabel(order))}</td>${statusCell}<td class="num">${kr(originalAmount)}</td><td class="num">${refundAmount > 0 ? `− ${kr(refundAmount)}` : kr(0)}</td><td class="num"><strong>${kr(netAmount)}</strong></td></tr>`;
    })
    .join("");
  const dailyHtml = dailyRows
    .map((row) => `<tr><td>${day(row.key)}</td><td class="num">${row.paidCount + row.referenceCount}</td><td class="num">${kr(row.originalTotal)}</td><td class="num">${row.refundTotal > 0 ? `− ${kr(row.refundTotal)}` : kr(0)}</td><td class="num"><strong>${kr(row.paidTotal)}</strong></td>${options.showReferenceOrders ? `<td class="num">${row.referenceCount}</td>` : ""}</tr>`)
    .join("");
  const dailyHeader = options.showReferenceOrders
    ? "<tr><th>Datum</th><th class=\"num\">Order</th><th class=\"num\">Original</th><th class=\"num\">Återbetalt</th><th class=\"num\">Netto</th><th class=\"num\">Referensorder</th></tr>"
    : "<tr><th>Datum</th><th class=\"num\">Order</th><th class=\"num\">Original</th><th class=\"num\">Återbetalt</th><th class=\"num\">Netto</th></tr>";
  const currentReferenceNotice = savedReport
    ? `<div class="reference-note"><strong>Aktuellt referensunderlag.</strong> Listan hämtas från dagens orderdata och kan därför avvika från den sparade rapportens ${reportOrderCount} order och ${kr(reportGrossTotal)}.</div>`
    : "";
  const ordersSection = mode === "summary"
    ? `<section class="orders">
        <div class="section-title">${savedReport ? "Sparad rapportsammanfattning" : "Orderunderlag"}</div>
        <div class="mini-grid">
          <div class="mini-card"><span>Order</span><strong>${reportOrderCount}</strong></div>
          <div class="mini-card accent"><span>Försäljning</span><strong>${kr(reportGrossTotal)}</strong></div>
          <div class="mini-card"><span>${savedReport ? "Rapportstatus" : "Referensorder"}</span><strong>${esc(reportStatusLabel || referenceSummary.referenceOrderCount)}</strong></div>
        </div>
      </section>`
    : mode === "daily"
      ? `<section class="orders">
          <div class="section-title">${savedReport ? "Aktuellt underlag per dag" : "Order per dag"}</div>
          ${currentReferenceNotice}
          <table>
            <thead>${dailyHeader}</thead>
            <tbody>${dailyHtml || `<tr><td colspan="${options.showReferenceOrders ? 6 : 5}" class="muted">Inga order matchar PDF-valet.</td></tr>`}</tbody>
          </table>
        </section>`
      : `<section class="orders">
          <div class="section-title">${savedReport ? "Aktuella order i perioden" : "Order i perioden"}</div>
          ${currentReferenceNotice}
          <table>
            <thead>${orderHeader}</thead>
            <tbody>${orderRows || `<tr><td colspan="${showPaymentState ? 7 : 6}" class="muted">Inga order matchar PDF-valet.</td></tr>`}</tbody>
          </table>
        </section>`;

  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" />
<title>Utbetalningsspec ${esc(spec.restaurant.name)}</title>
<style>
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #101827;
    margin: 0;
    padding: 26px;
    font-size: 12.5px;
    line-height: 1.45;
    background: #fff7f1;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    min-height: calc(100vh - 52px);
    border: 1px solid #f0d8cc;
    border-radius: 18px;
    overflow: hidden;
    background: #fffdfb;
    box-shadow: 0 20px 55px rgba(16, 24, 39, 0.10);
  }
  .hero {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 24px;
    align-items: center;
    padding: 28px 32px;
    color: #fff;
    background: linear-gradient(135deg, #ff4b1f 0%, #ff713d 52%, #101827 100%);
  }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
  .logo {
    width: 122px;
    height: auto;
    border-radius: 12px;
    background: rgba(255,255,255,0.94);
    padding: 10px 12px;
    box-shadow: 0 10px 24px rgba(16, 24, 39, 0.16);
  }
  .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 900; opacity: 0.78; }
  h1 { font-size: 28px; line-height: 1.05; letter-spacing: 0; margin: 0; }
  .period { margin-top: 9px; color: rgba(255,255,255,0.83); font-weight: 700; }
  .hero-card {
    justify-self: end;
    width: 100%;
    max-width: 288px;
    border: 1px solid rgba(255,255,255,0.28);
    border-radius: 16px;
    padding: 18px;
    background: rgba(255,255,255,0.14);
    backdrop-filter: blur(8px);
  }
  .hero-card .label { color: rgba(255,255,255,0.78); }
  .hero-card .amount { margin-top: 6px; font-size: 30px; font-weight: 950; letter-spacing: 0; }
  .content { padding: 26px 32px 30px; }
  .muted { color: #667085; }
  .right { text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; margin-bottom: 22px; }
  .info-block {
    border: 1px solid #f1dfd5;
    border-radius: 14px;
    padding: 15px 16px;
    background: #fffaf7;
  }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #9a6b59; font-weight: 900; }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
  .chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid #ffd4c2;
    border-radius: 999px;
    padding: 5px 9px;
    color: #9a3412;
    background: #fff1e9;
    font-size: 11px;
    font-weight: 800;
  }
  table { width: 100%; border-collapse: collapse; }
  .calc { margin-top: 6px; overflow: hidden; border: 1px solid #f0ded2; border-radius: 14px; }
  .calc td { padding: 9px 13px; border-bottom: 1px solid #f3e7df; background: #fff; }
  .calc td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .calc tr.section td {
    padding-top: 13px;
    padding-bottom: 6px;
    color: #9a3412;
    background: #fff4ed;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 950;
  }
  .calc tr.sub td { color: #667085; padding-left: 28px; background: #fffaf7; border-bottom: 1px dotted #ead8cd; }
  .calc tr.strong td { font-weight: 900; background: #fff4ed; border-top: 1px solid #ffd1bf; border-bottom: 1px solid #ffd1bf; }
  .total {
    margin-top: 12px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 16px 18px;
    background: #101827;
    color: #fff;
    border-radius: 14px;
    box-shadow: inset 5px 0 0 #ff4b1f;
  }
  .total .v { font-size: 25px; font-weight: 950; }
  .orders { margin-top: 26px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #9a6b59; font-weight: 950; margin-bottom: 10px; }
  .reference-note { margin: -2px 0 10px; border-left: 3px solid #ff713d; padding: 8px 10px; color: #667085; background: #fff8f4; font-size: 11px; }
  .orders table { border: 1px solid #f0ded2; border-radius: 14px; overflow: hidden; }
  .orders td, .orders th { padding: 8px 11px; border-bottom: 1px solid #f4e6dd; text-align: left; font-size: 11.5px; }
  .orders th { color: #9a6b59; font-weight: 900; background: #fff4ed; }
  .orders td.num, .orders th.num { text-align: right; }
  .mini-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .mini-card { border: 1px solid #f0ded2; border-radius: 14px; padding: 13px; background: #fffaf7; }
  .mini-card span { display: block; color: #8a6a5b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900; }
  .mini-card strong { display: block; margin-top: 6px; font-size: 18px; color: #101827; }
  .mini-card.accent { border-color: #ffb493; background: #fff1e9; }
  .mini-card.accent strong { color: #9a3412; }
  .note { margin-top: 20px; font-size: 11px; color: #667085; border-top: 1px solid #f0ded2; padding-top: 12px; }
  @media print {
    body { padding: 0; background: #fff; }
    .page { min-height: 0; border: 0; border-radius: 0; box-shadow: none; }
    .hero { border-radius: 0; padding: 17px 24px; }
    .brand { margin-bottom: 10px; }
    .logo { width: 88px; padding: 6px 8px; }
    h1 { font-size: 23px; }
    .hero-card { padding: 12px; }
    .hero-card .amount { font-size: 24px; }
    .content { padding: 14px 24px 18px; }
    .grid { gap: 7px 14px; margin-bottom: 10px; }
    .info-block { padding: 8px 10px; }
    .calc td { padding: 5px 10px; }
    .calc tr.section td { padding-top: 7px; padding-bottom: 4px; }
    .total { margin-top: 8px; padding: 10px 14px; }
    .total .v { font-size: 21px; }
    .note { margin-top: 8px; padding-top: 7px; }
    .orders { break-before: page; page-break-before: always; }
    @page { margin: 14mm; }
  }
</style></head>
<body>
  <main class="page">
    <header class="hero">
      <div>
        <div class="brand">
          <img class="logo" src="${logoSrc}" alt="ViaEats" />
          <div>
            <div class="kicker">Finance</div>
            <div style="font-weight:950">Partnerunderlag</div>
          </div>
        </div>
        <h1>${esc(spec.restaurant.legalName || spec.restaurant.name)}</h1>
        <div class="period">${esc(day(spec.period.from))} - ${esc(day(spec.period.to))}</div>
      </div>
      <div class="hero-card">
        <div class="label">${esc(totalLabel)}</div>
        <div class="amount">${kr(net)}</div>
        <div class="chips">
          <span class="chip">${esc(modelLabel)}</span>
          ${savedReport ? "" : `<span class="chip">${esc(b.tierLabel)}</span>`}
          <span class="chip">${esc(commissionPct ?? "-")}% ViaEats provision</span>
          ${reportStatusLabel ? `<span class="chip">${esc(reportStatusLabel)}</span>` : ""}
        </div>
      </div>
    </header>

    <div class="content">
      <div class="grid">
        <div class="info-block">
          <div class="label">Restaurang</div>
          <div style="font-weight:900; font-size:15px">${esc(spec.restaurant.legalName || spec.restaurant.name)}</div>${
            spec.restaurant.legalName ? `<div class="muted">${esc(spec.restaurant.name)}</div>` : ""
          }<div class="muted">${esc(spec.restaurant.address || spec.restaurant.city || "")}</div>${
          spec.restaurant.organizationNumber ? `<div class="muted">Org.nr ${esc(spec.restaurant.organizationNumber)}</div>` : ""
        }
        </div>
        <div class="info-block right">
          <div class="label">ViaEats</div>
          <div style="font-weight:900; font-size:15px">${esc(spec.company.name || "-")}</div>
          <div class="muted">${esc(spec.company.organizationNumber || "")}</div>
          <div class="muted">${esc(spec.company.address || "")}</div>
        </div>
        <div class="info-block">
          <div class="label">PDF-innehåll</div>
          <div><strong>${esc(modeLabel[mode])}</strong></div>
          <div class="muted">Betalda och återbetalda order visas alltid${options.showReferenceOrders ? ", även med övriga avbrutna order som referens" : ""}.</div>
        </div>
        <div class="info-block right">
          <div class="label">${savedReport ? "Sparad rapport" : "Orderunderlag"}</div>
          <div><strong>${reportOrderCount}</strong> order</div>
          <div class="muted">${kr(reportGrossTotal)}${!savedReport && referenceSummary.referenceOrderCount ? ` - ${referenceSummary.referenceOrderCount} referensorder` : ""}</div>
          ${reportMetadata}
        </div>
      </div>

      <table class="calc">
        ${[
          section("Försäljning och order"),
          line(`Försäljning inkl. moms (${orderCount} order)`, kr(orderSales)),
          line("Återbetalningar", kr(refunds), { sign: "−" }),
          line("Försäljning efter återbetalningar", kr(salesAfterRefunds), { strong: true }),
          orderExclusions > 0 ? line("Leveransavgift och dricks till ViaEats/bud", kr(orderExclusions), { sign: "−" }) : "",
          section("Betalavgifter som restaurangen bär"),
          line("Korttransaktionsavgifter", mollieValue(cardTransactionFee), { sign: cardTransactionFee == null ? undefined : "−" }),
          line("Avgifter för återbetalningar", mollieValue(refundTransactionFee), { sign: refundTransactionFee == null ? undefined : "−" }),
          line(`Betalavgifter totalt (${mollieFeeLabel})`, mollieValue(mollieFeeTotal), { strong: true, sign: mollieFeeTotal == null ? undefined : "−" }),
          section("Moms och försäljning exklusive moms"),
          line(`Moms i restaurangens försäljning (${vatLabel(foodVatPct)})`, kr(foodVat)),
          line("Restaurangens försäljning exklusive moms", kr(salesExVat), { strong: true }),
          section("ViaEats-avdrag"),
          line(`Provision exkl. moms (${commissionPct ?? "-"}%)`, kr(commission), { sign: "−" }),
          line(savedReport ? "Abonnemang exkl. moms" : `Abonnemang exkl. moms (${b.tierLabel})`, kr(subscription), { sign: "−" }),
          line(`Moms på ViaEats (${savedReport ? persisted?.feeVatPctSnapshot ?? "-" : b.feeVatPct}%)`, kr(platformFeeVat), { sign: "−" }),
          line("ViaEats-avdrag totalt inkl. moms", kr(platformFeeTotal), { strong: true }),
          section("Manuell justering"),
          Math.abs(savedReport && persisted ? persisted.manualAdjustmentAmount : Number(manualAdjustment) || 0) > 0
            ? line(
                (savedReport && persisted ? persisted.manualAdjustmentAmount : Number(manualAdjustment)) > 0
                  ? "Avdrag från utbetalning"
                  : "Tillägg till utbetalning",
                kr(Math.abs(savedReport && persisted ? persisted.manualAdjustmentAmount : Number(manualAdjustment) || 0)),
                { sign: (savedReport && persisted ? persisted.manualAdjustmentAmount : Number(manualAdjustment)) > 0 ? "−" : "+" },
              )
            : line("Ingen manuell justering", kr(0)),
          (savedReport && persisted ? persisted.lateRefundAdjustmentAmount : Number(lateRefundRecovery) || 0) > 0
            ? line("Sena återbetalningar och avgifter", kr(savedReport && persisted ? persisted.lateRefundAdjustmentAmount : Number(lateRefundRecovery) || 0), { sign: "−" })
            : "",
        ].join("")}
      </table>

      <div class="total"><span>${esc(totalLabel)}</span><span class="v">${kr(net)}</span></div>

      ${Math.abs(savedReport && persisted ? persisted.manualAdjustmentAmount : Number(manualAdjustment) || 0) > 0
        ? `<div class="note"><strong>Orsak till justering:</strong> ${esc(options.adjustmentNote || persisted?.notes || "Saknas")}</div>`
        : ""}

      ${ordersSection}

      <div class="note">
        ${savedReport
          ? esc(savedReportNote)
          : `Restaurangmoms (${vatLabel(b.foodVatPct)}) i restaurangens försäljning: ${kr(b.foodVat)}. ViaEats avgiftsavdrag består av tjänsteersättning och moms på tjänsten.`}
        Belopp i SEK med två decimaler.
      </div>
    </div>
  </main>
</body></html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  // Liten fördröjning så logo och layout hinner sätta sig innan print-dialogen.
  const triggerPrint = () => setTimeout(() => win.print(), 150);
  const logo = win.document.querySelector<HTMLImageElement>(".logo");
  if (logo && !logo.complete) {
    logo.addEventListener("load", triggerPrint, { once: true });
    logo.addEventListener("error", triggerPrint, { once: true });
    setTimeout(triggerPrint, 900);
  } else {
    triggerPrint();
  }
}
