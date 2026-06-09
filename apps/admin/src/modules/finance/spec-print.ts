import type { PayoutSpec } from "@/modules/finance/api";

const kr = (n: number) =>
  (Number(n) || 0).toLocaleString("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * Öppnar en självständig, utskriftsvänlig utbetalningsspec i ett nytt fönster
 * och triggar print() → användaren sparar som PDF. Ingen server-PDF behövs.
 */
export function printPayoutSpec(spec: PayoutSpec, adjustment = 0) {
  const b = spec.breakdown;
  const net = b.payout - (Number(adjustment) || 0);
  const win = window.open("", "_blank", "width=820,height=1040");
  if (!win) {
    alert("Tillåt popup-fönster för att skriva ut specen.");
    return;
  }

  const line = (label: string, value: string, opts: { strong?: boolean; sub?: boolean; minus?: boolean } = {}) =>
    `<tr class="${opts.strong ? "strong" : ""} ${opts.sub ? "sub" : ""}">
      <td>${opts.minus ? "− " : ""}${esc(label)}</td>
      <td class="num">${esc(value)}</td>
    </tr>`;

  const orderRows = spec.orders
    .map(
      (o) =>
        `<tr><td>#${esc(o.orderNumber)}</td><td>${day(o.createdAt)}</td><td>${
          o.type === "PICKUP" ? "Avhämtning" : "Leverans"
        }</td><td class="num">${kr(o.total)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" />
<title>Utbetalningsspec ${esc(spec.restaurant.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 32px 36px; font-size: 13px; line-height: 1.45; }
  h1 { font-size: 18px; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
  .muted { color: #555; }
  .right { text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 22px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; }
  table { width: 100%; border-collapse: collapse; }
  .calc td { padding: 7px 0; border-bottom: 1px solid #eee; }
  .calc td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .calc tr.sub td { color: #666; padding-left: 14px; border-bottom: 1px dotted #eee; }
  .calc tr.strong td { font-weight: 800; border-bottom: 2px solid #111; }
  .total { margin-top: 6px; display: flex; justify-content: space-between; align-items: baseline; padding: 12px 14px; background: #111; color: #fff; border-radius: 8px; }
  .total .v { font-size: 22px; font-weight: 800; }
  .orders { margin-top: 26px; }
  .orders h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; }
  .orders td, .orders th { padding: 5px 0; border-bottom: 1px solid #f0f0f0; text-align: left; font-size: 12px; }
  .orders th { color: #777; font-weight: 600; }
  .orders td.num, .orders th.num { text-align: right; }
  .note { margin-top: 20px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { padding: 0; } @page { margin: 18mm; } }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>Utbetalningsspecifikation</h1>
      <div class="muted">${esc(day(spec.period.from))} – ${esc(day(spec.period.to))}</div>
    </div>
    <div class="right">
      <div style="font-weight:800">${esc(spec.company.name || "—")}</div>
      <div class="muted">${esc(spec.company.organizationNumber || "")}</div>
      <div class="muted">${esc(spec.company.address || "")}</div>
    </div>
  </div>

  <div class="grid">
    <div><div class="label">Restaurang</div><div style="font-weight:700">${esc(spec.restaurant.legalName || spec.restaurant.name)}</div>${
      spec.restaurant.legalName ? `<div class="muted">${esc(spec.restaurant.name)}</div>` : ""
    }<div class="muted">${esc(spec.restaurant.address || spec.restaurant.city || "")}</div>${
    spec.restaurant.organizationNumber ? `<div class="muted">Org.nr ${esc(spec.restaurant.organizationNumber)}</div>` : ""
  }</div>
    <div class="right">
      <div class="label">Modell</div>
      <div>${spec.restaurant.selfDelivery ? "Levererar själv" : "Vi levererar"} · ${esc(b.tierLabel)}</div>
      <div class="label" style="margin-top:8px">Provision</div>
      <div>${b.commissionPct}%</div>
    </div>
  </div>

  <table class="calc">
    ${line(`Bruttoförsäljning (${b.orderCount} ordrar)`, kr(b.grossTotal))}
    ${line("varav matvärde (provisionsbas)", kr(b.foodBase), { sub: true })}
    ${line("varav leveransavgift", kr(b.deliveryFee), { sub: true })}
    ${line("varav dricks", kr(b.tip), { sub: true })}
    ${line("Restaurangens intäkt", kr(b.restaurantGross), { strong: true })}
    ${line(`Provision (${b.commissionPct}%)`, kr(b.commission), { minus: true })}
    ${line(`Abonnemang (${b.tierLabel})`, kr(b.subscription), { minus: true })}
    ${line(`Moms på avgifter (${b.feeVatPct}%)`, kr(b.feeVat), { minus: true })}
    ${Math.abs(Number(adjustment) || 0) > 0 ? line("Justering", kr(-(Number(adjustment) || 0)), { minus: false }) : ""}
  </table>

  <div class="total"><span>Netto att betala ut</span><span class="v">${kr(net)}</span></div>

  <div class="orders">
    <h2>Ordrar i perioden</h2>
    <table>
      <thead><tr><th>Order</th><th>Datum</th><th>Typ</th><th class="num">Summa</th></tr></thead>
      <tbody>${orderRows || `<tr><td colspan="4" class="muted">Inga ordrar.</td></tr>`}</tbody>
    </table>
  </div>

  <div class="note">
    Matmoms (${b.foodVatPct}%) i restaurangens försäljning: ${kr(b.foodVat)} (informativ — restaurangens egen redovisning).
    Plattformens avgifter faktureras som tjänst med ${b.feeVatPct}% moms. Belopp i SEK.
  </div>
</body></html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  // Liten fördröjning så fonten/layouten hinner sätta sig innan print-dialogen.
  setTimeout(() => win.print(), 250);
}
