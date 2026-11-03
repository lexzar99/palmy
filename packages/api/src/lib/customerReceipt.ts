/**
 * Kundkvittot som PDF.
 *
 * viaeats är säljaren (återförsäljarmodellen i partneravtal v5): viaeats säljer
 * maten till kunden i eget namn och köper den av restaurangen. Restaurangen
 * står därför med som partnern som lagat (och ev. levererat) maten, aldrig som
 * säljare. Säljarens uppgifter kommer från plattformens inställningar och
 * restaurangens från restaurangraden. Inget företagsnamn eller nummer finns i
 * koden; saknas en uppgift syns det på kvittot och i `missing`.
 *
 * Alla belopp räknas i ören. Momsen tas från `calculateOrderVat`, samma
 * beräkning som betalningsunderlaget, så kvittot kan aldrig visa en annan moms
 * än den som ligger i ordern.
 */
import path from 'path';
import PDFDocument from 'pdfkit';
import { calculateOrderVat, orderVatRates } from './tax';
import { verifyOrderHttpSession } from './orderAccess';

export const SIMPLIFIED_INVOICE_LIMIT_ORE = 400_000;
export const RECEIPT_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

export type ReceiptAccess = 'ok' | 'not_found' | 'not_paid';

/**
 * Kvittot kräver samma ägarbevis som full spårning: orderns webbsession (eller
 * embeddens ordernyckel i samma header), appens ordersession eller inloggad
 * ägare. Kioskbeviset räcker aldrig, eftersom det bara ger status utan
 * kunduppgifter. Utan bevis svarar vi 404 så att ett ordernummer inte avslöjas.
 */
export function customerReceiptAccess(input: {
  order: { id: string; userId?: string | null; paymentStatus?: string | null };
  orderSessionHeader: unknown;
  nativeSessionOwned: boolean;
  callerUserId: string | null;
}): ReceiptAccess {
  const { order } = input;
  const isOwner =
    verifyOrderHttpSession(input.orderSessionHeader, order.id) ||
    input.nativeSessionOwned ||
    Boolean(input.callerUserId && order.userId && order.userId === input.callerUserId);
  if (!isOwner) return 'not_found';
  if (!(RECEIPT_PAYMENT_STATUSES as readonly string[]).includes(String(order.paymentStatus || ''))) return 'not_paid';
  return 'ok';
}

export type ReceiptSettings = {
  companyName?: string | null;
  organizationNumber?: string | null;
  companyAddress?: string | null;
  supportEmail?: string | null;
  contactEmail?: string | null;
};

export type ReceiptExtra = { name: string; quantity: number; priceOre: number };

export type ReceiptLine = {
  quantity: number;
  name: string;
  extras: ReceiptExtra[];
  note: string | null;
  grossOre: number;
  vatRate: number;
};

export type ReceiptVatRow = { rate: number; netOre: number; vatOre: number; grossOre: number };

export type CustomerReceipt = {
  receiptNumber: string;
  orderId: string;
  purchasedAt: Date;
  orderType: 'DELIVERY' | 'PICKUP';
  paymentMethod: string;
  paymentStatus: string;
  customerName: string | null;
  seller: {
    name: string | null;
    organizationNumber: string | null;
    vatNumber: string | null;
    address: string[];
    email: string | null;
  };
  partner: {
    name: string | null;
    tradeName: string | null;
    organizationNumber: string | null;
    address: string[];
    selfDelivery: boolean;
  };
  lines: ReceiptLine[];
  foodSubtotalOre: number;
  discountOre: number;
  discountLabel: string;
  deliveryFeeOre: number;
  deliveryDiscountOre: number;
  deliveryVatRate: number;
  smallOrderFeeOre: number;
  smallOrderFeeVatRate: number;
  tipOre: number;
  totalOre: number;
  vat: ReceiptVatRow[];
  totalVatOre: number;
  refund: { amountOre: number; at: Date | null } | null;
  /** Uppgifter som krävs på kvittot men saknas i inställningarna. */
  missing: string[];
  /** Differens mellan debiterat belopp och kvittots delar (ska vara 0). */
  amountMismatchOre: number;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const ore = (value: unknown): number => {
  const parsed = Math.trunc(Number(value) || 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};

/**
 * Momsregistreringsnumret för ett svenskt aktiebolag är SE + organisations-
 * numrets tio siffror + 01. Ett ogiltigt nummer ger null, aldrig en gissning.
 */
export function swedishVatNumber(organizationNumber: unknown): string | null {
  let digits = String(organizationNumber ?? '').replace(/\D/g, '');
  if (digits.length === 12 && /^(16|19|20)/.test(digits)) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return `SE${digits}01`;
}

function addressLines(...parts: unknown[]): string[] {
  return parts
    .flatMap((part) => String(part ?? '').split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseExtras(raw: unknown): ReceiptExtra[] {
  let value: unknown = raw;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((extra: any) => ({
      name: clean(extra?.extraName ?? extra?.name) || '',
      quantity: Math.max(1, Math.trunc(Number(extra?.quantity) || 1)),
      // Tillvalspriset sparas i kronor i ordersnapshoten.
      priceOre: Math.round((Number(extra?.priceAddon ?? extra?.price) || 0) * 100),
    }))
    .filter((extra) => extra.name);
}

export function paymentMethodLabel(order: { paymentMethod?: unknown; paymentProvider?: unknown }): string {
  const token = String(order.paymentMethod ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  switch (token) {
    case 'SWISH': return 'Swish';
    case 'KLARNA':
    case 'KLARNAPAYNOW':
    case 'KLARNAPAYLATER':
    case 'KLARNASLICEIT': return 'Klarna';
    case 'CREDITCARD':
    case 'CARD':
    case 'KORT': return 'Kort';
    case 'APPLEPAY': return 'Apple Pay';
    case 'GOOGLEPAY': return 'Google Pay';
    case 'PAYPAL': return 'PayPal';
    default: break;
  }
  const provider = String(order.paymentProvider ?? '').toLowerCase();
  if (provider === 'swish') return 'Swish';
  if (provider === 'stripe') return 'Kort eller annan betalning via Stripe';
  return 'Betald online';
}

export function buildCustomerReceipt(order: any, settings: ReceiptSettings | null): CustomerReceipt {
  const restaurant = order.restaurant || {};
  const rates = orderVatRates(order);
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const lines: ReceiptLine[] = items.map((item) => ({
    quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)),
    name: clean(item.productName) || 'Artikel',
    extras: parseExtras(item.selectedExtras),
    note: clean(item.note),
    grossOre: Math.max(0, ore(item.subtotal)),
    vatRate: rates.itemRate(item.vatPercent),
  }));

  const vatSummary = calculateOrderVat(order);
  const vat = vatSummary.breakdown.map((row) => ({
    rate: row.rate,
    grossOre: row.grossOre,
    vatOre: row.vatOre,
    netOre: row.grossOre - row.vatOre,
  }));

  const foodSubtotalOre = lines.reduce((sum, line) => sum + line.grossOre, 0);
  const deliveryFeeOre = Math.max(0, ore(order.deliveryFee));
  const smallOrderFeeOre = Math.max(0, ore(order.smallOrderFee));
  const tipOre = Math.max(0, ore(order.tipAmount));
  const discountOre = Math.max(0, ore(order.discountAmount));
  const deliveryDiscountOre = Math.min(deliveryFeeOre, Math.max(0, ore(order.deliveryDiscountAmount)));
  const totalOre = ore(order.total);
  // Dricksen ligger utanför momsunderlaget; allt annat ska gå jämnt upp.
  const amountMismatchOre = totalOre - (vatSummary.taxableGrossOre + tipOre);

  const sellerOrg = clean(settings?.organizationNumber);
  const seller = {
    name: clean(settings?.companyName),
    organizationNumber: sellerOrg,
    vatNumber: swedishVatNumber(sellerOrg),
    address: addressLines(settings?.companyAddress),
    email: clean(settings?.supportEmail) || clean(settings?.contactEmail),
  };
  const partnerLegal = clean(restaurant.legalName);
  const partnerTrade = clean(restaurant.name);
  const partner = {
    name: partnerLegal || partnerTrade,
    tradeName: partnerLegal && partnerTrade && partnerTrade !== partnerLegal ? partnerTrade : null,
    organizationNumber: clean(restaurant.organizationNumber),
    address: addressLines(
      restaurant.address,
      [clean(restaurant.zip), clean(restaurant.city)].filter(Boolean).join(' '),
    ),
    selfDelivery: Boolean(restaurant.selfDelivery),
  };

  const missing: string[] = [];
  if (!seller.name) missing.push('säljarens företagsnamn');
  if (!seller.organizationNumber) missing.push('säljarens organisationsnummer');
  else if (!seller.vatNumber) missing.push('säljarens momsregistreringsnummer (ogiltigt organisationsnummer)');
  if (seller.address.length === 0) missing.push('säljarens adress');
  if (!partnerLegal) missing.push('restaurangens juridiska namn');
  if (!partner.organizationNumber) missing.push('restaurangens organisationsnummer');

  const refundOre = Math.max(0, ore(order.refundAmount));
  const refunded = refundOre > 0 && ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(String(order.paymentStatus));

  return {
    receiptNumber: String(order.orderNumber || order.id),
    orderId: String(order.id),
    purchasedAt: new Date(order.createdAt),
    orderType: order.type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
    paymentMethod: paymentMethodLabel(order),
    paymentStatus: String(order.paymentStatus || ''),
    customerName: clean(order.customerName)?.replace(/\s+[–-]\s+(privat|viaeats)$/i, '') ?? null,
    seller,
    partner,
    lines,
    foodSubtotalOre,
    discountOre,
    discountLabel: clean(order.appliedDealTitle) || (clean(order.discountCode) ? `Rabattkod ${clean(order.discountCode)}` : 'Rabatt'),
    deliveryFeeOre,
    deliveryDiscountOre,
    deliveryVatRate: rates.deliveryRate,
    smallOrderFeeOre,
    smallOrderFeeVatRate: rates.smallOrderFeeRate,
    tipOre,
    totalOre,
    vat,
    totalVatOre: vatSummary.totalVatOre,
    refund: refunded ? { amountOre: Math.min(refundOre, totalOre), at: order.refundedAt ? new Date(order.refundedAt) : null } : null,
    missing,
    amountMismatchOre,
  };
}

// ── Formatering ─────────────────────────────────────────────────────────────

/** 12 345,50 kr. Hela kronor visas med ",00" så att kolumnerna linjerar. */
export function formatKr(valueOre: number): string {
  const sign = valueOre < 0 ? '−' : '';
  const abs = Math.abs(Math.trunc(valueOre));
  const kronor = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const oren = String(abs % 100).padStart(2, '0');
  return `${sign}${kronor},${oren} kr`;
}

const formatRate = (rate: number) => `${rate} %`;

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const ASSETS = path.join(__dirname, '../../assets');
const FONT = {
  regular: path.join(ASSETS, 'fonts/Outfit-Regular.ttf'),
  medium: path.join(ASSETS, 'fonts/Outfit-Medium.ttf'),
  semibold: path.join(ASSETS, 'fonts/Outfit-SemiBold.ttf'),
};
const LOGO = path.join(ASSETS, 'receipt-logo.png');

// Tokens från docs/DESIGN_SYSTEM.md ("tyst premium").
const C = {
  ink: '#1D1D1F',
  ink2: '#6E6E73',
  ink3: '#8E8E93',
  line: '#E4E4E7',
  bg: '#F5F5F7',
  accent: '#F04F1A',
  danger: '#D70015',
  dangerSoft: '#FDECEE',
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
// Outfits tt-ligatur gör att "Kvitto" kopieras och söks som "Kvito". Kvittot
// ska gå att läsa maskinellt, så ligaturer stängs av överallt.
const NO_LIGATURES = { liga: false, clig: false, dlig: false } as unknown as PDFKit.Mixins.OpenTypeFeatures[];
const CONTENT_W = PAGE.width - PAGE.margin * 2;
const FOOTER_H = 40;

export function renderCustomerReceiptPdf(receipt: CustomerReceipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `Kvitto ${receipt.receiptNumber}`,
        Author: receipt.seller.name || 'viaeats',
        Subject: `Kvitto för order ${receipt.receiptNumber}`,
        Creator: 'viaeats',
        Producer: 'viaeats',
        // Fast datum gör att samma order alltid ger samma fil.
        CreationDate: receipt.purchasedAt,
        ModDate: receipt.purchasedAt,
      },
      lang: 'sv-SE',
    } as PDFKit.PDFDocumentOptions);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', FONT.regular);
    doc.registerFont('medium', FONT.medium);
    doc.registerFont('semibold', FONT.semibold);

    const left = PAGE.margin;
    const right = PAGE.width - PAGE.margin;
    const bottomLimit = PAGE.height - PAGE.margin - FOOTER_H;
    let y = PAGE.margin;

    const text = (
      value: string,
      x: number,
      top: number,
      opts: { font?: string; size?: number; color?: string; width?: number; align?: 'left' | 'right' | 'center'; lineGap?: number } = {},
    ) => {
      doc
        .font(opts.font || 'regular')
        .fontSize(opts.size || 10)
        .fillColor(opts.color || C.ink)
        .text(value, x, top, { width: opts.width, align: opts.align || 'left', lineGap: opts.lineGap ?? 1.5, lineBreak: opts.width != null, features: NO_LIGATURES });
      return doc.y;
    };
    const heightOf = (value: string, width: number, font: string, size: number) =>
      doc.font(font).fontSize(size).heightOfString(value, { width, lineGap: 1.5, features: NO_LIGATURES });
    const hairline = (top: number, x1 = left, x2 = right) => {
      doc.save().moveTo(x1, top).lineTo(x2, top).lineWidth(0.6).strokeColor(C.line).stroke().restore();
    };
    const ensureSpace = (needed: number) => {
      if (y + needed <= bottomLimit) return;
      doc.addPage();
      y = PAGE.margin;
    };
    const missingText = 'Uppgift saknas';

    // ── Sidhuvud ──
    doc.image(LOGO, left, y, { height: 46 });
    text('Kvitto', left, y + 2, { font: 'semibold', size: 26, width: CONTENT_W, align: 'right' });
    text(`Nr ${receipt.receiptNumber}`, left, y + 33, { size: 10.5, color: C.ink2, width: CONTENT_W, align: 'right' });
    y += 62;

    if (receipt.missing.length > 0) {
      const message = `Kvittot är ofullständigt. Saknas: ${receipt.missing.join(', ')}. Kontakta viaeats om du behöver ett komplett kvitto.`;
      const h = heightOf(message, CONTENT_W - 28, 'medium', 9.5) + 20;
      doc.save().roundedRect(left, y, CONTENT_W, h, 10).fill(C.dangerSoft).restore();
      text(message, left + 14, y + 10, { font: 'medium', size: 9.5, color: C.danger, width: CONTENT_W - 28 });
      y += h + 12;
    }

    // ── Parter och detaljer ──
    const colGap = 16;
    const colW = (CONTENT_W - 28 - colGap * 2) / 3;
    const cols = [left + 14, left + 14 + colW + colGap, left + 14 + (colW + colGap) * 2];
    const blocks: Array<{ label: string; rows: Array<{ value: string; strong?: boolean; muted?: boolean; missing?: boolean }> }> = [
      {
        label: 'Säljare',
        rows: [
          { value: receipt.seller.name || missingText, strong: true, missing: !receipt.seller.name },
          ...(receipt.seller.address.length ? receipt.seller.address.map((value) => ({ value })) : [{ value: `Adress: ${missingText}`, missing: true }]),
          { value: `Org.nr ${receipt.seller.organizationNumber || missingText}`, missing: !receipt.seller.organizationNumber },
          { value: `Momsreg.nr ${receipt.seller.vatNumber || missingText}`, missing: !receipt.seller.vatNumber },
          ...(receipt.seller.email ? [{ value: receipt.seller.email, muted: true }] : []),
        ],
      },
      {
        label: receipt.orderType === 'DELIVERY' && receipt.partner.selfDelivery ? 'Tillagad och levererad av' : 'Tillagad av',
        rows: [
          { value: receipt.partner.name || missingText, strong: true, missing: !receipt.partner.name },
          ...(receipt.partner.tradeName ? [{ value: receipt.partner.tradeName, muted: true }] : []),
          ...receipt.partner.address.map((value) => ({ value })),
          { value: `Org.nr ${receipt.partner.organizationNumber || missingText}`, missing: !receipt.partner.organizationNumber },
        ],
      },
      {
        label: 'Detaljer',
        rows: [
          { value: formatDateTime(receipt.purchasedAt), strong: true },
          { value: `Order ${receipt.receiptNumber}` },
          { value: receipt.orderType === 'DELIVERY' ? 'Leverans' : 'Avhämtning' },
          { value: `Betalt med ${receipt.paymentMethod}` },
          ...(receipt.customerName ? [{ value: `Kund: ${receipt.customerName}`, muted: true }] : []),
        ],
      },
    ];
    const blockHeight = (block: (typeof blocks)[number]) =>
      14 + block.rows.reduce((sum, row) => sum + heightOf(row.value, colW, row.strong ? 'semibold' : 'regular', 9.5) + 2, 0);
    const partiesH = Math.max(...blocks.map(blockHeight)) + 28;
    doc.save().roundedRect(left, y, CONTENT_W, partiesH, 14).fill(C.bg).restore();
    blocks.forEach((block, index) => {
      let by = y + 14;
      text(block.label.toUpperCase(), cols[index], by, { font: 'medium', size: 7.5, color: C.ink3, width: colW });
      by += 14;
      for (const row of block.rows) {
        const color = row.missing ? C.danger : row.muted ? C.ink2 : C.ink;
        by = text(row.value, cols[index], by, { font: row.strong ? 'semibold' : 'regular', size: 9.5, color, width: colW }) + 2;
      }
    });
    y += partiesH + 20;

    // ── Artiklar ──
    const amountW = 92;
    const rateW = 52;
    const nameW = CONTENT_W - amountW - rateW - 12;
    const rateX = left + nameW + 12;
    const tableHeader = () => {
      text('ARTIKEL', left, y, { font: 'medium', size: 7.5, color: C.ink3 });
      text('MOMS', rateX, y, { font: 'medium', size: 7.5, color: C.ink3, width: rateW, align: 'right' });
      text('BELOPP', right - amountW, y, { font: 'medium', size: 7.5, color: C.ink3, width: amountW, align: 'right' });
      y += 14;
      hairline(y);
      y += 10;
    };
    tableHeader();
    for (const line of receipt.lines) {
      const title = `${line.quantity} × ${line.name}`;
      const detail = [
        ...line.extras.map((extra) => {
          const qty = extra.quantity > 1 ? `${extra.quantity} × ` : '';
          const price = extra.priceOre !== 0 ? `  ${extra.priceOre > 0 ? '+' : ''}${formatKr(extra.priceOre)}` : '';
          return `${qty}${extra.name}${price}`;
        }),
        ...(line.note ? [`Notering: ${line.note}`] : []),
      ];
      const titleH = heightOf(title, nameW, 'medium', 10.5);
      const detailH = detail.reduce((sum, row) => sum + heightOf(row, nameW - 12, 'regular', 9) + 1, 0);
      const rowH = titleH + (detail.length ? detailH + 3 : 0) + 10;
      if (y + rowH > bottomLimit) {
        doc.addPage();
        y = PAGE.margin;
        tableHeader();
      }
      text(title, left, y, { font: 'medium', size: 10.5, width: nameW });
      text(formatRate(line.vatRate), rateX, y + 1, { size: 9.5, color: C.ink2, width: rateW, align: 'right' });
      text(formatKr(line.grossOre), right - amountW, y, { font: 'medium', size: 10.5, width: amountW, align: 'right' });
      let dy = y + titleH + 3;
      for (const row of detail) {
        dy = text(row, left + 12, dy, { size: 9, color: C.ink2, width: nameW - 12 }) + 1;
      }
      y += rowH;
      hairline(y - 5);
    }
    y += 8;

    // ── Summering ──
    const sumX = left + CONTENT_W * 0.42;
    const sumW = right - sumX;
    const sumRow = (label: string, value: string, opts: { color?: string; note?: string } = {}) => {
      ensureSpace(20);
      text(label, sumX, y, { size: 10, color: opts.color || C.ink2, width: sumW - amountW - 8 });
      text(value, right - amountW, y, { size: 10, color: opts.color || C.ink, width: amountW, align: 'right' });
      y += 17;
      if (opts.note) {
        text(opts.note, sumX, y - 3, { size: 8, color: C.ink3, width: sumW - amountW - 8 });
        y += 11;
      }
    };
    sumRow('Delsumma mat', formatKr(receipt.foodSubtotalOre));
    const foodDiscountOre = Math.max(0, receipt.discountOre - receipt.deliveryDiscountOre);
    if (foodDiscountOre > 0) sumRow(receipt.discountLabel, formatKr(-foodDiscountOre), { color: C.accent });
    if (receipt.deliveryFeeOre > 0) {
      sumRow(`Leveransavgift (moms ${formatRate(receipt.deliveryVatRate)})`, formatKr(receipt.deliveryFeeOre));
      if (receipt.deliveryDiscountOre > 0) sumRow('Rabatt på leverans', formatKr(-receipt.deliveryDiscountOre), { color: C.accent });
    }
    if (receipt.smallOrderFeeOre > 0) {
      sumRow(`Tillägg för liten beställning (moms ${formatRate(receipt.smallOrderFeeVatRate)})`, formatKr(receipt.smallOrderFeeOre));
    }
    if (receipt.tipOre > 0) sumRow('Dricks', formatKr(receipt.tipOre), { note: 'Frivillig, ingen moms' });
    ensureSpace(40);
    hairline(y + 2, sumX, right);
    y += 12;
    text('Totalt betalt', sumX, y + 2, { font: 'semibold', size: 13 });
    text(formatKr(receipt.totalOre), right - 160, y, { font: 'semibold', size: 16, width: 160, align: 'right' });
    y += 24;
    text(`varav moms ${formatKr(receipt.totalVatOre)}`, sumX, y, { size: 9, color: C.ink2, width: sumW, align: 'right' });
    y += 22;

    // ── Moms per skattesats ──
    const vatTableH = 26 + 20 * (receipt.vat.length + 1) + 18;
    ensureSpace(vatTableH);
    const vatTop = y;
    doc.save().roundedRect(left, vatTop, CONTENT_W, vatTableH, 14).fill(C.bg).restore();
    const vx = left + 16;
    const vw = CONTENT_W - 32;
    const vcol = [vx, vx + vw * 0.28, vx + vw * 0.52, vx + vw * 0.76];
    const vcw = vw * 0.24;
    y += 14;
    text('MOMS PER SKATTESATS', vcol[0], y, { font: 'medium', size: 7.5, color: C.ink3, width: vcw * 1.2 });
    text('EXKL. MOMS', vcol[1], y, { font: 'medium', size: 7.5, color: C.ink3, width: vcw, align: 'right' });
    text('MOMS', vcol[2], y, { font: 'medium', size: 7.5, color: C.ink3, width: vcw, align: 'right' });
    text('INKL. MOMS', vcol[3], y, { font: 'medium', size: 7.5, color: C.ink3, width: vcw, align: 'right' });
    y += 18;
    const vatRow = (label: string, row: { netOre: number; vatOre: number; grossOre: number }, strong = false) => {
      const font = strong ? 'semibold' : 'regular';
      text(label, vcol[0], y, { font, size: 10, width: vcw });
      text(formatKr(row.netOre), vcol[1], y, { font, size: 10, width: vcw, align: 'right' });
      text(formatKr(row.vatOre), vcol[2], y, { font, size: 10, width: vcw, align: 'right' });
      text(formatKr(row.grossOre), vcol[3], y, { font, size: 10, width: vcw, align: 'right' });
      y += 20;
    };
    for (const row of receipt.vat) vatRow(`Moms ${formatRate(row.rate)}`, row);
    hairline(y - 5, vx, vx + vw);
    vatRow('Summa', {
      netOre: receipt.vat.reduce((sum, row) => sum + row.netOre, 0),
      vatOre: receipt.totalVatOre,
      grossOre: receipt.vat.reduce((sum, row) => sum + row.grossOre, 0),
    }, true);
    y = vatTop + vatTableH + 14;

    // ── Återbetalning ──
    if (receipt.refund) {
      const when = receipt.refund.at ? ` den ${formatDate(receipt.refund.at)}` : '';
      const message = `${formatKr(receipt.refund.amountOre)} har återbetalats${when}. Nettobetalt: ${formatKr(receipt.totalOre - receipt.refund.amountOre)}.`;
      const h = heightOf(message, CONTENT_W - 28, 'regular', 9.5) + 34;
      ensureSpace(h + 10);
      doc.save().roundedRect(left, y, CONTENT_W, h, 12).lineWidth(0.8).strokeColor(C.line).stroke().restore();
      text('ÅTERBETALNING', left + 14, y + 10, { font: 'medium', size: 7.5, color: C.ink3, width: CONTENT_W - 28 });
      text(message, left + 14, y + 22, { size: 9.5, width: CONTENT_W - 28 });
      y += h + 12;
    }

    // ── Villkorstext ──
    const sellerName = receipt.seller.name || 'viaeats';
    const legal = [
      `${sellerName} säljer maten i eget namn och är säljare enligt det här kvittot. ` +
        `Maten är tillagad av ${receipt.partner.name || 'partnerrestaurangen'}` +
        (receipt.orderType === 'DELIVERY'
          ? (receipt.partner.selfDelivery ? ', som också har levererat den.' : ' och levererad genom viaeats.')
          : ' och hämtas hos restaurangen.'),
      receipt.tipOre > 0 ? 'Dricksen är frivillig och ingår inte i momsunderlaget.' : null,
      // Förenklad faktura får bara användas upp till 4 000 kr inkl. moms.
      receipt.totalOre <= SIMPLIFIED_INVOICE_LIMIT_ORE ? 'Kvittot gäller som förenklad faktura.' : null,
    ].filter(Boolean).join(' ');
    const legalH = heightOf(legal, CONTENT_W, 'regular', 8.5);
    ensureSpace(legalH + 4);
    text(legal, left, y, { size: 8.5, color: C.ink2, width: CONTENT_W, lineGap: 2 });

    // ── Sidfot på varje sida ──
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const fy = PAGE.height - PAGE.margin - 22;
      hairline(fy - 10);
      const contact = [sellerName, receipt.seller.organizationNumber ? `Org.nr ${receipt.seller.organizationNumber}` : null, receipt.seller.email]
        .filter(Boolean)
        .join('  ·  ');
      // Sidfoten ligger under marginalen; utan lineBreak skapar pdfkit ingen ny sida.
      doc.font('regular').fontSize(8).fillColor(C.ink3).text(contact, left, fy, { lineBreak: false, features: NO_LIGATURES });
      doc.text(`Kvitto ${receipt.receiptNumber}  ·  Sida ${i - range.start + 1} av ${range.count}`, left, fy, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
        features: NO_LIGATURES,
      });
    }

    doc.end();
  });
}
