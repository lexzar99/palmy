import type { FinanceRow, PayoutSpec, PayoutSpecOrder } from "@/modules/finance/api";
import { count, kr, signed } from "@/modules/finance/format";

/**
 * Utbetalningsspecifikationen som PDF.
 *
 * Dokumentet byggs som ett fristående HTML-dokument med tryckstilar och öppnas
 * i utskriftsdialogen, där "Spara som PDF" ger filen. Ingen extern beroende —
 * och layouten är vår egen, inte webbläsarens tolkning av adminpanelen.
 *
 * Sidordningen är bestämd:
 *   1. Specifikationen — allt som förklarar beloppet
 *   2+. Ordrarna — nummer, datum, belopp
 *   sista. Återbetalningarna
 *
 * Går att ta ut både före och efter att posten markerats som betald. Före är
 * det ett underlag, efter är det ett kvitto — dokumentet säger vilket.
 */

/* ── Hjälpare ───────────────────────────────────────────────────────────── */

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STOCKHOLM = "Europe/Stockholm";

const day = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: STOCKHOLM, dateStyle: "short" }).format(date);
};

const dayTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const longDay = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

/** Kortavgiften kan vara ohämtad — då är den okänd, inte noll. */
const feeText = (value: number | null | undefined) => (value == null ? "hämtas" : kr(value));

export type PayoutPdfInput = {
  row: FinanceRow;
  spec: PayoutSpec | undefined;
  /** Perioden som visas i huvudet, till exempel "Juli 2026". */
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  reference: string;
  status: "Utkast" | "Godkänd" | "Betald";
  /** URL till symbolen. Måste vara samma origin för att hinna laddas. */
  logoUrl?: string;
  companyName?: string | null;
};

/* ── Dokumentet ─────────────────────────────────────────────────────────── */

const STYLES = `
  @page { size: A4; margin: 16mm 14mm 18mm; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #0f0f12;
    font-size: 10.5pt;
    line-height: 1.45;
  }

  /* Varje sida är ett eget block. Sidbrytningen är bestämd, inte slumpad. */
  .sheet { page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }

  /* ── Sidhuvud ── */
  .head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 18px; padding-bottom: 12px; border-bottom: 2.5px solid #0a2340;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 34px; height: 34px; object-fit: contain; }
  .brandName { font-size: 15pt; font-weight: 900; letter-spacing: -0.02em; color: #0a2340; }
  .brandKind { margin: 2px 0 0; font-size: 7.5pt; font-weight: 900;
    letter-spacing: 0.14em; text-transform: uppercase; color: #5a6472; }
  .headRight { text-align: right; }
  .ref { margin: 0; font-size: 9pt; font-weight: 900; color: #0f0f12; letter-spacing: 0.04em; }
  .headMeta { margin: 3px 0 0; font-size: 8.5pt; font-weight: 700; color: #5a6472; }

  .status {
    display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px;
    font-size: 8pt; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .statusDraft { background: #ffe9df; color: #b5360d; }
  .statusApproved { background: #e6f1e8; color: #15803d; }
  .statusPaid { background: #eceef1; color: #3f3f46; }

  h1 { margin: 18px 0 2px; font-size: 21pt; font-weight: 900; letter-spacing: -0.03em; }
  .sub { margin: 0; font-size: 10pt; font-weight: 700; color: #5a6472; }

  /* ── Beloppet ── */
  .amount {
    display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
    margin-top: 16px; padding: 16px 18px; border-radius: 12px; background: #0a2340; color: #fff;
  }
  .amountLabel { font-size: 9pt; font-weight: 800; color: rgba(254,247,240,0.72); }
  .amountValue { font-size: 25pt; font-weight: 900; letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums; }

  /* ── Rader ── */
  .section { margin-top: 18px; }
  .sectionTitle { margin: 0 0 6px; font-size: 8pt; font-weight: 900;
    letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; }
  .line { display: flex; justify-content: space-between; gap: 14px;
    padding: 7px 0; border-top: 1px solid rgba(17,17,19,0.09); }
  .line:first-of-type { border-top: 0; }
  .lineName { font-weight: 700; color: #26272b; }
  .lineValue { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .refund { color: #b91c1c; }
  .plus { color: #15803d; }
  .minus { color: #b5360d; }
  .muted { color: #9ca3af; }
  .strong { font-weight: 900; }
  .total { border-top: 2px solid #0f0f12; padding-top: 9px; margin-top: 3px; font-size: 12pt; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }

  /* ── Tabeller ── */
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead { display: table-header-group; }
  th {
    text-align: left; padding: 6px 0; font-size: 7.5pt; font-weight: 900;
    letter-spacing: 0.07em; text-transform: uppercase; color: #9ca3af;
    border-bottom: 1.5px solid rgba(17,17,19,0.18);
  }
  td { padding: 6px 0; font-size: 9.5pt; border-bottom: 1px solid rgba(17,17,19,0.07); }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  /* Utan bredder kollapsar sista kolumnen in i beloppet bredvid. */
  .cols3 col:nth-child(1) { width: 34%; }
  .cols3 col:nth-child(2) { width: 38%; }
  .cols3 col:nth-child(3) { width: 28%; }
  .cols5 col:nth-child(1) { width: 22%; }
  .cols5 col:nth-child(2) { width: 26%; }
  .cols5 col:nth-child(3) { width: 18%; }
  .cols5 col:nth-child(4) { width: 19%; }
  .cols5 col:nth-child(5) { width: 15%; }
  .tabular { font-variant-numeric: tabular-nums; }
  tfoot td { border-top: 2px solid #0f0f12; border-bottom: 0;
    padding-top: 8px; font-weight: 900; font-size: 10pt; }

  .note {
    margin-top: 12px; padding: 10px 12px; border-radius: 9px;
    background: #fbfbfc; border: 1px solid rgba(17,17,19,0.08);
    font-size: 8.5pt; font-weight: 600; color: #5a6472; line-height: 1.5;
  }
  .empty { margin-top: 14px; padding: 18px; text-align: center;
    border: 1px dashed rgba(17,17,19,0.16); border-radius: 10px;
    font-size: 9.5pt; font-weight: 700; color: #9ca3af; }

  .foot { margin-top: 22px; padding-top: 9px; border-top: 1px solid rgba(17,17,19,0.12);
    display: flex; justify-content: space-between; gap: 14px;
    font-size: 7.5pt; font-weight: 700; color: #9ca3af; }

  @media print { .noprint { display: none !important; } }
`;

const statusClass = (status: PayoutPdfInput["status"]) =>
  status === "Betald" ? "statusPaid" : status === "Godkänd" ? "statusApproved" : "statusDraft";

function headBlock(input: PayoutPdfInput, pageLabel: string) {
  const logo = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="">`
    : "";
  return `
    <div class="head">
      <div class="brand">
        ${logo}
        <div>
          <div class="brandName">viaeats</div>
          <p class="brandKind">${esc(pageLabel)}</p>
        </div>
      </div>
      <div class="headRight">
        <p class="ref">${esc(input.reference)}</p>
        <p class="headMeta">${esc(input.periodLabel)}</p>
        <p class="headMeta">${esc(day(input.periodFrom))} – ${esc(day(input.periodTo))}</p>
        <span class="status ${statusClass(input.status)}">${esc(input.status)}</span>
      </div>
    </div>`;
}

function footBlock(input: PayoutPdfInput, page: number, total: number) {
  const generated = new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  return `
    <div class="foot">
      <span>${esc(input.row.name)} · ${esc(input.reference)}</span>
      <span>Utskriven ${esc(generated)} · Sida ${page} av ${total}</span>
    </div>`;
}

/** Sida 1 — allt som förklarar beloppet. */
function specificationSheet(input: PayoutPdfInput, pages: number) {
  const s = input.row.settlement;
  const restaurant = input.spec?.restaurant;
  const adjustmentClass = s.adjustment === 0 ? "muted" : s.adjustment > 0 ? "plus" : "minus";
  const note = input.row.adjustmentNote;

  const recipient = [
    restaurant?.legalName || input.row.name,
    restaurant?.organizationNumber ? `Org.nr ${restaurant.organizationNumber}` : null,
    restaurant?.address || null,
    input.row.city || null,
  ].filter(Boolean);

  return `
  <section class="sheet">
    ${headBlock(input, "Utbetalningsspecifikation")}

    <h1>${esc(input.row.name)}</h1>
    <p class="sub">${esc(input.periodLabel)} · ${count(input.row.orderCount)} ordrar · ${esc(String(s.commissionPct))} % provision</p>

    <div class="amount">
      <span class="amountLabel">${input.status === "Betald" ? "Utbetalt belopp" : "Att betala ut"}</span>
      <span class="amountValue">${esc(kr(s.payout))}</span>
    </div>

    <div class="cols section">
      <div>
        <p class="sectionTitle">Restaurangens pengar</p>
        <div class="line"><span class="lineName">Kundbetalningar brutto</span><span class="lineValue">${esc(kr(input.row.grossTotal))}</span></div>
        <div class="line"><span class="lineName refund">Återbetalningar</span><span class="lineValue refund">${esc(kr(-input.row.refunds))}</span></div>
        <div class="line"><span class="lineName strong">Nettoförsäljning</span><span class="lineValue strong">${esc(kr(s.netSales))}</span></div>
        <div class="line"><span class="lineName">Provision ${esc(String(s.commissionPct))} % ex moms</span><span class="lineValue">${esc(kr(-s.commission))}</span></div>
        <div class="line"><span class="lineName">Moms på provision ${esc(String(s.vatPct))} %</span><span class="lineValue">${esc(kr(-s.commissionVat))}</span></div>
        <div class="line"><span class="lineName">Kortavgifter</span><span class="lineValue">${s.cardFees == null ? "hämtas" : esc(kr(-s.cardFees))}</span></div>
        <div class="line"><span class="lineName">Manuell justering</span><span class="lineValue ${adjustmentClass}">${esc(signed(s.adjustment))}</span></div>
        <div class="line total"><span class="lineName strong">Att betala ut</span><span class="lineValue strong">${esc(kr(s.payout))}</span></div>
      </div>

      <div>
        <p class="sectionTitle">Våra pengar</p>
        <div class="line"><span class="lineName">Provision ex moms</span><span class="lineValue">${esc(kr(s.commission))}</span></div>
        <div class="line"><span class="lineName">Manuell justering</span><span class="lineValue">${esc(signed(-s.adjustment))}</span></div>
        <div class="line total"><span class="lineName strong">Vår intäkt ex moms</span><span class="lineValue strong">${esc(kr(s.ourRevenue))}</span></div>
        <div class="line"><span class="lineName muted">Moms att redovisa</span><span class="lineValue muted">${esc(kr(s.commissionVat))}</span></div>

        <p class="sectionTitle" style="margin-top:18px">Mottagare</p>
        ${recipient.map((rowText) => `<div class="line"><span class="lineName">${esc(rowText)}</span></div>`).join("")}
        ${
          input.row.payoutReference
            ? `<div class="line"><span class="lineName muted">Betalreferens</span><span class="lineValue muted">${esc(input.row.payoutReference)}</span></div>`
            : ""
        }
      </div>
    </div>

    ${
      note
        ? `<div class="note"><strong>Anteckning till justeringen:</strong> ${esc(note)}</div>`
        : ""
    }

    <div class="note">
      Beloppet räknas som nettoförsäljning minus provision, moms och kortavgifter, plus eventuell
      manuell justering. Restaurangen bär återbetalningar och hela kortavgiften.
      ${s.cardFees == null ? "Kortavgiften är ännu inte hämtad från betalleverantören — beloppet är preliminärt." : ""}
    </div>

    ${footBlock(input, 1, pages)}
  </section>`;
}

/** Sidorna däremellan — ordrarna. Nummer, datum, belopp. */
function ordersSheets(input: PayoutPdfInput, orders: PayoutSpecOrder[], firstPage: number, pages: number) {
  if (orders.length === 0) {
    return `
  <section class="sheet">
    ${headBlock(input, "Ordrar i perioden")}
    <h1>Ordrar</h1>
    <p class="sub">${esc(input.periodLabel)}</p>
    <div class="empty">Inga ordrar i perioden.</div>
    ${footBlock(input, firstPage, pages)}
  </section>`;
  }

  const total = orders.reduce((sum, order) => sum + order.total, 0);
  const rows = orders
    .map(
      (order) => `
      <tr>
        <td class="tabular">#${esc(order.orderNumber)}</td>
        <td>${esc(dayTime(order.createdAt))}</td>
        <td class="right">${esc(kr(order.total))}</td>
      </tr>`,
    )
    .join("");

  return `
  <section class="sheet">
    ${headBlock(input, "Ordrar i perioden")}
    <h1>Ordrar</h1>
    <p class="sub">${count(orders.length)} ordrar som ingår i utbetalningen · ${esc(input.periodLabel)}</p>
    <table class="cols3">
      <colgroup><col><col><col></colgroup>
      <thead>
        <tr><th>Ordernummer</th><th>Datum</th><th class="right">Belopp</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Totalt</td><td></td><td class="right">${esc(kr(total))}</td></tr>
      </tfoot>
    </table>
    ${footBlock(input, firstPage, pages)}
  </section>`;
}

/** Sista sidan — återbetalningarna. */
function refundsSheet(input: PayoutPdfInput, refunds: PayoutSpecOrder[], page: number, pages: number) {
  if (refunds.length === 0) {
    return `
  <section class="sheet">
    ${headBlock(input, "Återbetalningar")}
    <h1>Återbetalningar</h1>
    <p class="sub">${esc(input.periodLabel)}</p>
    <div class="empty">Inga återbetalningar i perioden.</div>
    ${footBlock(input, page, pages)}
  </section>`;
  }

  const total = refunds.reduce((sum, order) => sum + order.refundAmount, 0);
  const rows = refunds
    .map(
      (order) => `
      <tr>
        <td class="tabular">#${esc(order.orderNumber)}</td>
        <td>${esc(dayTime(order.createdAt))}</td>
        <td class="right">${esc(kr(order.originalTotal))}</td>
        <td class="right refund">${esc(kr(-order.refundAmount))}</td>
        <td class="right">${order.refundAmount >= order.originalTotal ? "Hel" : "Delvis"}</td>
      </tr>`,
    )
    .join("");

  return `
  <section class="sheet">
    ${headBlock(input, "Återbetalningar")}
    <h1>Återbetalningar</h1>
    <p class="sub">${count(refunds.length)} återbetalda ordrar · ${esc(input.periodLabel)}</p>
    <table class="cols5">
      <colgroup><col><col><col><col><col></colgroup>
      <thead>
        <tr>
          <th>Ordernummer</th><th>Datum</th>
          <th class="right">Original</th><th class="right">Återbetalt</th><th class="right">Typ</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Totalt</td><td></td><td></td><td class="right refund">${esc(kr(-total))}</td><td></td></tr>
      </tfoot>
    </table>
    <div class="note">
      Återbetalningarna är redan avdragna från nettoförsäljningen på sida 1. Kortavgiften på en
      återbetald order togs när kunden betalade och kommer inte tillbaka — den ingår i periodens
      kortavgift.
    </div>
    ${footBlock(input, page, pages)}
  </section>`;
}

export function buildPayoutPdfDocument(input: PayoutPdfInput): string {
  const all = input.spec?.orders ?? [];
  const included = all.filter((order) => order.includedInPayout);
  const refunds = all.filter((order) => order.refundAmount > 0);
  const pages = 3;

  const title = `${input.reference} · ${input.row.name} · ${input.periodLabel}`;

  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  ${specificationSheet(input, pages)}
  ${ordersSheets(input, included, 2, pages)}
  ${refundsSheet(input, refunds, 3, pages)}
</body>
</html>`;
}

/**
 * Öppnar dokumentet i utskriftsdialogen. Väntar in bilderna först — annars
 * hinner symbolen inte laddas och sidhuvudet blir tomt i PDF:en.
 */
export function openPayoutPdf(input: PayoutPdfInput): boolean {
  const win = window.open("", "_blank", "width=980,height=1200");
  if (!win) return false;

  win.document.open();
  win.document.write(buildPayoutPdfDocument(input));
  win.document.close();

  const start = () => {
    win.focus();
    win.print();
  };
  const images = Array.from(win.document.images);
  if (images.length === 0 || images.every((image) => image.complete)) {
    win.setTimeout(start, 120);
    return true;
  }
  let pending = images.filter((image) => !image.complete).length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) win.setTimeout(start, 80);
  };
  for (const image of images) {
    if (image.complete) continue;
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  }
  // Fallback om en bild aldrig svarar — dokumentet ska ändå gå att skriva ut.
  win.setTimeout(() => { if (pending > 0) { pending = 0; start(); } }, 2500);
  return true;
}
