import type { PayoutSpec } from "@/modules/finance/api";
import { orderStatusLabel, paymentStatusLabel } from "@/shared/utils/format";

const kr = (n: number) =>
  (Number(n) || 0).toLocaleString("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const vatLabel = (value: number | null | undefined) =>
  value == null ? "blandad moms" : `${Number(value).toLocaleString("sv-SE")}%`;
const logoSrc = "/viaeats-finance-logo.png";

export type PayoutPrintMode = "summary" | "orders" | "daily";
export type PayoutPrintOptions = {
  mode?: PayoutPrintMode;
  includedOnly?: boolean;
  statuses?: string[];
};

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
  const frozen = persisted?.status === "APPROVED" || persisted?.status === "PAID";
  const mode = options.mode ?? "orders";
  const statusSet = options.statuses ? new Set(options.statuses) : null;
  const filteredOrders = spec.orders.filter((order) =>
    (!statusSet || statusSet.has(order.status)) &&
    (!options.includedOnly || order.includedInPayout),
  );
  const filteredTotal = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  const countedOrders = filteredOrders.filter((order) => order.includedInPayout);
  const countedTotal = countedOrders.reduce((sum, order) => sum + order.total, 0);
  const owed = (b as { owed?: number }).owed || 0;
  const isOwed = !frozen && owed > 0;
  const net = frozen && persisted
    ? persisted.payoutAmount
    : isOwed
      ? owed
      : Math.max(0, b.payout - (Number(manualAdjustment) || 0) - (Number(lateRefundRecovery) || 0));
  const totalLabel = isOwed ? "Att fakturera restaurangen" : "Netto att betala ut";
  const modelLabel = (frozen ? persisted?.selfDeliverySnapshot : spec.restaurant.selfDelivery) ? "Levererar själv" : "ViaEats levererar";
  const commissionPct = frozen ? persisted?.commissionPctSnapshot : b.commissionPct;
  const modeLabel: Record<PayoutPrintMode, string> = {
    summary: "Kompakt total",
    orders: "Orderrad per order",
    daily: "Summering per dag",
  };
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    alert("Tillåt popup-fönster för att skriva ut specen.");
    return;
  }

  const line = (label: string, value: string, opts: { strong?: boolean; sub?: boolean; minus?: boolean } = {}) =>
    `<tr class="${opts.strong ? "strong" : ""} ${opts.sub ? "sub" : ""}">
      <td>${opts.minus ? "- " : ""}${esc(label)}</td>
      <td class="num">${esc(value)}</td>
    </tr>`;

  const dailyMap = filteredOrders.reduce((map, order) => {
      const key = new Date(order.createdAt).toISOString().slice(0, 10);
      const current = map.get(key) ?? { key, count: 0, total: 0, included: 0 };
      current.count += 1;
      current.total += order.total;
      current.included += order.includedInPayout ? 1 : 0;
      map.set(key, current);
      return map;
    }, new Map<string, { key: string; count: number; total: number; included: number }>());
  const dailyRows = Array.from(dailyMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  const orderRows = filteredOrders
    .map(
      (o) =>
        `<tr><td><strong>#${esc(o.orderNumber)}</strong></td><td>${day(o.createdAt)}</td><td>${
          o.type === "PICKUP" ? "Avhämtning" : "Leverans"
        }</td><td>${esc(orderStatusLabel(o.status))}</td><td>${esc(paymentStatusLabel(o.paymentStatus))}</td><td><span class="${o.includedInPayout ? "pill good" : "pill muted-pill"}">${o.includedInPayout ? "Räknas" : "Ej med"}</span></td><td class="num">${kr(o.total)}</td></tr>`,
    )
    .join("");
  const dailyHtml = dailyRows
    .map((row) => `<tr><td>${day(row.key)}</td><td class="num">${row.count}</td><td class="num">${row.included}</td><td class="num">${kr(row.total)}</td></tr>`)
    .join("");
  const ordersSection = mode === "summary"
    ? `<section class="orders">
        <div class="section-title">PDF-underlag</div>
        <div class="mini-grid">
          <div class="mini-card"><span>Visade ordrar</span><strong>${filteredOrders.length}</strong></div>
          <div class="mini-card"><span>Visad totalsumma</span><strong>${kr(filteredTotal)}</strong></div>
          <div class="mini-card"><span>Order som räknas</span><strong>${countedOrders.length}</strong></div>
          <div class="mini-card accent"><span>Summa som räknas</span><strong>${kr(countedTotal)}</strong></div>
        </div>
      </section>`
    : mode === "daily"
      ? `<section class="orders">
          <div class="section-title">Ordrar per dag</div>
          <table>
            <thead><tr><th>Datum</th><th class="num">Ordrar</th><th class="num">Räknas</th><th class="num">Summa</th></tr></thead>
            <tbody>${dailyHtml || `<tr><td colspan="4" class="muted">Inga ordrar matchar PDF-filtret.</td></tr>`}</tbody>
          </table>
        </section>`
      : `<section class="orders">
          <div class="section-title">Ordrar i perioden</div>
          <table>
            <thead><tr><th>Order</th><th>Datum</th><th>Typ</th><th>Status</th><th>Betalning</th><th>Underlag</th><th class="num">Summa</th></tr></thead>
            <tbody>${orderRows || `<tr><td colspan="7" class="muted">Inga ordrar matchar PDF-filtret.</td></tr>`}</tbody>
          </table>
        </section>`;
  const selectedStatuses = statusSet
    ? [...statusSet].map((status) => orderStatusLabel(status)).join(", ") || "Inga statusar"
    : "Alla";

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
    max-width: 278px;
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
  .orders table { border: 1px solid #f0ded2; border-radius: 14px; overflow: hidden; }
  .orders td, .orders th { padding: 8px 11px; border-bottom: 1px solid #f4e6dd; text-align: left; font-size: 11.5px; }
  .orders th { color: #9a6b59; font-weight: 900; background: #fff4ed; }
  .orders td.num, .orders th.num { text-align: right; }
  .pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 3px 7px;
    font-size: 10px;
    font-weight: 900;
  }
  .good { color: #067647; background: #ecfdf3; border: 1px solid #abefc6; }
  .muted-pill { color: #667085; background: #f2f4f7; border: 1px solid #d0d5dd; }
  .mini-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .mini-card { border: 1px solid #f0ded2; border-radius: 14px; padding: 13px; background: #fffaf7; }
  .mini-card span { display: block; color: #8a6a5b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900; }
  .mini-card strong { display: block; margin-top: 6px; font-size: 18px; color: #101827; }
  .mini-card.accent { border-color: #ffb493; background: #fff1e9; }
  .mini-card.accent strong { color: #9a3412; }
  .note { margin-top: 20px; font-size: 11px; color: #667085; border-top: 1px solid #f0ded2; padding-top: 12px; }
  @media print {
    body { padding: 0; background: #fff; }
    .page { min-height: 0; border: 0; border-radius: 0; box-shadow: none; }
    .hero { border-radius: 0; }
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
            <div style="font-weight:950">Partnerutbetalning</div>
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
          <span class="chip">${esc(b.tierLabel)}</span>
          <span class="chip">${esc(commissionPct ?? "-")}% provision</span>
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
          <div class="label">PDF-filter</div>
          <div><strong>${esc(modeLabel[mode])}</strong></div>
          <div class="muted">${options.includedOnly ? "Endast order som räknas" : "Alla order efter statusfilter"}</div>
          <div class="muted">Status: ${esc(selectedStatuses)}</div>
        </div>
        <div class="info-block right">
          <div class="label">Underlag</div>
          <div><strong>${filteredOrders.length}</strong> visade ordrar</div>
          <div class="muted">${countedOrders.length} räknas - ${kr(countedTotal)}</div>
        </div>
      </div>

      <table class="calc">
        ${frozen && persisted
          ? [
              line(`Fryst restaurangintäkt (${persisted.orderCount} ordrar)`, kr(persisted.grossSales), { strong: true }),
              persisted.foodVatAmount != null ? line(`Fryst restaurangmoms (${vatLabel(persisted.foodVatPctSnapshot)})`, kr(persisted.foodVatAmount), { sub: true }) : "",
              (persisted.platformTipAmount || 0) > 0 ? line("Fryst dricks till bud/plattform", kr(persisted.platformTipAmount || 0), { sub: true }) : "",
              line(`Provision (${persisted.commissionPctSnapshot ?? "-"}%)`, kr(persisted.commissionAmount), { minus: true }),
              line("Abonnemang", kr(persisted.subscriptionAmount), { minus: true }),
              line(`Moms på avgifter (${persisted.feeVatPctSnapshot ?? "-"}%)`, kr(((persisted.commissionAmount + persisted.subscriptionAmount) * Number(persisted.feeVatPctSnapshot || 0)) / 100), { minus: true }),
              Math.abs(persisted.manualAdjustmentAmount) > 0 ? line("Manuell justering", kr(persisted.manualAdjustmentAmount), { minus: true }) : "",
              persisted.lateRefundAdjustmentAmount > 0 ? line("Automatisk recovery för sena refunds", kr(persisted.lateRefundAdjustmentAmount), { minus: true }) : "",
            ].join("")
          : [
              line(`Bruttoförsäljning (${b.orderCount} ordrar)`, kr(b.grossTotal)),
              line("varav matvärde (provisionsbas)", kr(b.foodBase), { sub: true }),
              line(spec.restaurant.selfDelivery ? "varav leveransavgift till restaurangen" : "varav leveransavgift till plattformen", kr(b.deliveryFee), { sub: true }),
              line(spec.restaurant.selfDelivery ? "varav dricks till restaurangen" : "varav dricks till bud/plattform", kr(b.tip), { sub: true }),
              line(`Restaurangmoms (${vatLabel(b.foodVatPct)})`, kr(b.foodVat), { sub: true }),
              line("Restaurangens intäkt", kr(b.restaurantGross), { strong: true }),
              line(`Provision (${b.commissionPct}%)`, kr(b.commission), { minus: true }),
              line(`Abonnemang (${b.tierLabel})`, kr(b.subscription), { minus: true }),
              line(`Moms på avgifter (${b.feeVatPct}%)`, kr(b.feeVat), { minus: true }),
              Math.abs(Number(manualAdjustment) || 0) > 0 ? line("Manuell justering", kr(Number(manualAdjustment) || 0), { minus: true }) : "",
              (Number(lateRefundRecovery) || 0) > 0 ? line("Automatisk recovery för sena refunds", kr(Number(lateRefundRecovery) || 0), { minus: true }) : "",
            ].join("")}
      </table>

      <div class="total"><span>${esc(totalLabel)}</span><span class="v">${kr(net)}</span></div>

      ${ordersSection}

      <div class="note">
        ${frozen
          ? "Beloppet ovan är den frysta snapshot som godkändes och får inte räknas om med dagens inställningar."
          : `Restaurangmoms (${vatLabel(b.foodVatPct)}) i restaurangens försäljning: ${kr(b.foodVat)}. Plattformens avgifter faktureras som tjänst med ${b.feeVatPct}% moms.`}
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
