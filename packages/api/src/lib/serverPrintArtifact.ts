import prisma from './prisma';
import sharp from 'sharp';
import path from 'path';

export type ThermalPaperWidth = '58mm' | '72mm' | '80mm';

type PrintArtifact = {
  bytes: Buffer;
  fingerprint: string;
  orderId: string;
  orderNumber: string;
  restaurantId: string;
  paperWidth: ThermalPaperWidth;
};

const artifactCache = new Map<string, PrintArtifact>();
const latestArtifactByOrder = new Map<string, PrintArtifact>();
const artifactInFlight = new Map<string, Promise<PrintArtifact | null>>();
const MAX_ARTIFACTS = 240;
const RECEIPT_FONT_PATH = path.join(__dirname, '../../assets/Outfit.ttf');
// Must change whenever the bitmap layout changes. Otherwise a real order can
// keep an older in-memory artifact while test printing already shows the new
// Admin layout, which makes the two physical receipts look unrelated.
const RECEIPT_RENDERER_VERSION = 'admin-wysiwyg-v10';

function parseExtras(raw: unknown): any[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * Betalmetods-token → kundvänlig etikett. Mollie-metoden sparas versaliserad
 * på ordern vid finalisering (SWISH/CREDITCARD/KLARNA…); äldre ordrar har
 * bara ONLINE kvar.
 */
function paymentMethodLabel(value: unknown): string {
  const token = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  switch (token) {
    case 'SWISH': return 'Swish';
    case 'KLARNA':
    case 'KLARNAPAYNOW':
    case 'KLARNAPAYLATER':
    case 'KLARNASLICEIT': return 'Klarna';
    case 'CREDITCARD':
    case 'CARD':
    case 'KORT': return 'Kortbetalning';
    case 'APPLEPAY': return 'Apple Pay';
    case 'GOOGLEPAY': return 'Google Pay';
    case 'IDEAL': return 'iDEAL';
    case 'PAYPAL': return 'PayPal';
    case 'BANKTRANSFER': return 'Banköverföring';
    case 'CASH': return 'Kontant';
    case 'ONLINE': return 'Betald online';
    default: return plain(value);
  }
}

function translateInstruction(value: unknown): string {
  switch (String(value || '').toUpperCase()) {
    case 'RING_DOORBELL': return 'Ring på dörren';
    case 'LEAVE_AT_DOOR': return 'Lämna vid dörren';
    case 'MEET_OUTSIDE': return 'Möt mig utanför';
    case 'MEET_AT_DOOR': return 'Möt vid dörren';
    case 'NO_CONTACT': return 'Kontaktfri leverans';
    case 'CALL_ON_ARRIVAL': return 'Ring vid ankomst';
    default: return plain(value);
  }
}

function visibleTemplateKeys(elementsRaw: unknown): Set<string> | null {
  try {
    const elements = typeof elementsRaw === 'string' ? JSON.parse(elementsRaw) : elementsRaw;
    if (!Array.isArray(elements) || elements.length === 0) return null;
    return new Set(elements.filter((element) => element?.visible !== false).map((element) => String(element.key)));
  } catch {
    return null;
  }
}

function wrapText(value: unknown, width: number): string[] {
  const text = plain(value);
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > width) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width));
      current = '';
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function plain(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Kronbelopp med svenskt decimalkomma (112.5 → "112,5"). */
function kr(value: unknown): string {
  return plain(value).replace('.', ',');
}

// Same key order as the editable receipt template in apps/admin. Saved values
// are merged below so a partially populated legacy row still renders exactly
// like the admin preview while keeping the admin's size/weight/visibility.
const FALLBACK_TEMPLATE_ELEMENTS = [
  { key: 'restaurantName', visible: true, size: 15, weight: 'black', align: 'center', uppercase: true },
  { key: 'platformName', visible: true, size: 8, weight: 'normal', align: 'center', uppercase: true },
  { key: 'address', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'phone', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'divider1', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'headerMsg', visible: false, size: 9, weight: 'bold', align: 'center', content: '' },
  { key: 'divider2', visible: false, size: 8, weight: 'normal', align: 'center' },
  { key: 'orderNumber', visible: true, size: 9, weight: 'normal', align: 'center' },
  { key: 'timestamp', visible: true, size: 9, weight: 'normal', align: 'center' },
  { key: 'orderType', visible: true, size: 12, weight: 'black', align: 'center', uppercase: true },
  { key: 'scheduledFor', visible: true, size: 12, weight: 'black', align: 'center' },
  { key: 'paymentMethod', visible: true, size: 12, weight: 'black', align: 'center' },
  { key: 'estimatedTime', visible: true, size: 14, weight: 'black', align: 'center' },
  { key: 'divider3', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'customerName', visible: true, size: 12, weight: 'black', align: 'left' },
  { key: 'customerPhone', visible: true, size: 9, weight: 'normal', align: 'left' },
  { key: 'customerAddress', visible: true, size: 9, weight: 'normal', align: 'left' },
  { key: 'deliveryInstructions', visible: true, size: 9, weight: 'bold', align: 'left' },
  { key: 'note', visible: true, size: 9, weight: 'bold', align: 'left' },
  { key: 'allergens', visible: true, size: 9, weight: 'bold', align: 'left' },
  { key: 'divider4', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'items', visible: true, size: 10, weight: 'bold', align: 'left' },
  { key: 'itemPrice', visible: true, size: 8, weight: 'bold', align: 'right' },
  { key: 'extras', visible: true, size: 8, weight: 'normal', align: 'left' },
  { key: 'divider5', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'deliveryFee', visible: true, size: 9, weight: 'normal', align: 'left' },
  { key: 'discount', visible: true, size: 9, weight: 'normal', align: 'left' },
  { key: 'total', visible: true, size: 14, weight: 'black', align: 'left' },
  { key: 'divider6', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'thankYou', visible: true, size: 9, weight: 'bold', align: 'center', content: 'Tack för din beställning!' },
  { key: 'footerMsg', visible: true, size: 8, weight: 'normal', align: 'center', content: 'Välkommen åter!' },
];

function templateElementList(template: any): any[] {
  try {
    const elements = typeof template?.elements === 'string'
      ? JSON.parse(template.elements)
      : template?.elements;
    if (Array.isArray(elements) && elements.length > 0) {
      const savedByKey = new Map(elements.map((element: any) => [String(element?.key), element]));
      return FALLBACK_TEMPLATE_ELEMENTS.map((element) => ({
        ...element,
        ...(savedByKey.get(element.key) || {}),
      }));
    }
  } catch {
    // Use the same safe defaults as the printing config endpoint when a
    // legacy row contains malformed JSON.
  }
  return FALLBACK_TEMPLATE_ELEMENTS;
}

function templateElements(template: any): Map<string, any> {
  return new Map(templateElementList(template).map((element: any) => [String(element.key), element]));
}

/**
 * Shared payload for the Admin preview and every server-side print artifact.
 * Keeping this in one place prevents the preview, test print and real orders
 * from formatting the same order differently.
 */
export function buildAdminReceiptData(order: any) {
  const etaAnchor = order.preparingAt ? new Date(order.preparingAt) : new Date(order.createdAt);
  const readyAt = (!order.scheduledFor && order.estimatedTime)
    ? new Date(etaAnchor.getTime() + Number(order.estimatedTime) * 60_000)
    : null;

  return {
    header: {
      restaurantName: order.restaurant?.name || 'ViaEats',
      address: order.restaurant?.address || '',
      city: order.restaurant?.city || '',
      zip: order.restaurant?.zip || '',
      phone: order.restaurant?.phone || '',
    },
    orderInfo: {
      number: order.orderNumber,
      type: order.type,
      status: order.status,
      time: formatTime(new Date(order.createdAt)),
      date: formatDate(new Date(order.createdAt)),
      estimatedTime: order.estimatedTime,
      readyTime: readyAt ? formatTime(readyAt) : null,
      isPreorder: Boolean(order.scheduledFor),
      scheduledFor: order.scheduledFor,
      scheduledDate: order.scheduledFor ? formatDate(new Date(order.scheduledFor)) : null,
      scheduledTime: order.scheduledFor ? formatTime(new Date(order.scheduledFor)) : null,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    },
    customer: {
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail,
      street: order.deliveryStreet,
      city: order.deliveryCity,
      zip: order.deliveryZip,
      instructions: order.deliveryInstructions,
      note: order.note,
      allergens: order.allergens,
    },
    items: (Array.isArray(order.items) ? order.items : []).map((item: any) => ({
      name: item.productName,
      qty: item.quantity,
      unitPrice: Number(item.basePrice || 0) / 100,
      subtotal: Number(item.subtotal || 0) / 100,
      extras: parseExtras(item.selectedExtras).map((extra: any) => ({
        name: extra?.extraName || extra?.name || '',
        price: Number(extra?.priceAddon ?? extra?.price ?? 0),
        quantity: Number(extra?.quantity ?? 1),
        required: Boolean(extra?.groupRequired),
      })),
      note: item.note,
    })),
    totals: {
      subtotal: (Number(order.total || 0) + Number(order.discountAmount || 0) - Number(order.deliveryFee || 0)) / 100,
      deliveryFee: Number(order.deliveryFee || 0) / 100,
      discount: Number(order.discountAmount || 0) / 100,
      discountCode: order.discountCode,
      dealTitle: order.appliedDealTitle,
      total: Number(order.total || 0) / 100,
    },
  };
}

type Align = 'left' | 'center' | 'right';

type RenderedText = { data: Buffer; width: number; height: number };

// Admin-förhandsgranskningen ritas i ett 272 px brett kort med 16 px padding,
// alltså 240 px innehållsbredd. Bitmapen är exakt samma layout uppskalad, så
// alla admin-mått (px) multipliceras med scale nedan.
const ADMIN_CONTENT_WIDTH = 240;
// Termopapper läses på armlängds avstånd i ett kök — texten trycks större än
// admin-previewens proportioner utan att ändra layout/bredder. 58 mm-rullen
// är smal, där boostas texten hårdare så bokstäverna blir ungefär lika stora
// fysiskt som på 78 mm; kvittot blir längre i stället (fler radbrytningar).
const TEXT_BOOST_WIDE = 1.2;
const TEXT_BOOST_58 = 1.55;

async function renderTextLine(
  value: string,
  sizePx: number,
  weight: number,
  color: string,
): Promise<RenderedText | null> {
  const line = plain(value);
  if (!line) return null;
  const size = Math.max(8, Math.round(sizePx));
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}" weight="${weight}" size="${size * 1024}">${xml(line)}</span>`,
      font: 'Outfit',
      fontfile: RECEIPT_FONT_PATH,
      rgba: true,
      dpi: 72,
    },
  }).png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Hela bitmappen skickas som pixelrader, inklusive vita mellanrum. Tidigare
 * ersattes vita ytor med ESC J-matningar för att spara Bluetooth-bandbredd,
 * men matningsenheten är inte en pixelrad på alla skrivare (Epson-klass kör
 * 1/360 tum) — då krympte alla radavstånd och kvittot blev hoppressat.
 * Banden på max 255 rader skrivs kant i kant och ger exakt PNG-höjden.
 */
function compactEscPosRaster(bitmap: Buffer, widthBytes: number, height: number): Buffer[] {
  const chunks: Buffer[] = [];
  let rowIndex = 0;
  while (rowIndex < height) {
    const bandHeight = Math.min(255, height - rowIndex);
    chunks.push(Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      bandHeight & 0xff, (bandHeight >> 8) & 0xff,
    ]));
    chunks.push(bitmap.subarray(rowIndex * widthBytes, (rowIndex + bandHeight) * widthBytes));
    rowIndex += bandHeight;
  }
  return chunks;
}

type ComposedReceipt = {
  base: Buffer;
  overlays: { input: Buffer; left: number; top: number }[];
};

/**
 * WYSIWYG-motor: bygger kvittot som en pixel-exakt uppskalning av
 * ReceiptPreviewContent i apps/admin (240 px innehåll, radavstånd 1.6).
 * Varje textrad renderas för sig och mäts, så center/höger-justering och
 * priser i högerkanten hamnar exakt där admin-förhandsgranskningen visar dem.
 */
async function composeReceipt(order: any, template: any, paperWidth: ThermalPaperWidth): Promise<ComposedReceipt> {
  // 58 mm-rulle: 48 mm utskriftsyta = 384 punkter. 72/78/80 mm: full bredd
  // 576 punkter (~78 mm på kvittoskrivarna) — verifierat tydligast på papper.
  // Marginalerna skalas med bredden (≈4,5 mm) så inget hamnar utanför, och
  // ESC a 1 centrerar rastret på skrivare med smalare huvud.
  // Nästan kantlöst: ~1-2 mm marginal per sida. Varje millimeter horisontellt
  // ger färre radbrytningar och därmed kortare kvitto.
  const width = paperWidth === '58mm' ? 384 : 576;
  const scale = (paperWidth === '58mm' ? 368 : 544) / ADMIN_CONTENT_WIDTH;
  const TEXT_BOOST = paperWidth === '58mm' ? TEXT_BOOST_58 : TEXT_BOOST_WIDE;
  const margin = Math.round((width - ADMIN_CONTENT_WIDTH * scale) / 2);
  const contentWidth = width - margin * 2;
  const px = (value: number) => Math.round(value * scale);

  const elements = templateElements(template);
  const preview = buildAdminReceiptData(order);
  const h = preview.header;
  const o = preview.orderInfo;
  const c = preview.customer;
  const items = preview.items;
  const totals = preview.totals;
  const svg: string[] = [];
  const overlays: { input: Buffer; left: number; top: number }[] = [];
  let y = px(20);
  let maxBottom = 0;

  const visible = (key: string) => elements.get(key)?.visible !== false;
  const configuredSize = (key: string, fallback: number) => {
    const value = Number(elements.get(key)?.size);
    return Math.min(40, Math.max(6, Number.isFinite(value) ? value : fallback));
  };
  // Termohuvuden trycker tunna 400-streck otydligt — golvet är 600 så all
  // text blir svart och läsbar, med bibehållen hierarki (600/800/900).
  const configuredWeight = (key: string, fallback = 600) => {
    const weight = String(elements.get(key)?.weight || '');
    const resolved = weight === 'black' ? 900 : weight === 'bold' ? 800 : weight === 'normal' ? 600 : fallback;
    return Math.max(600, resolved);
  };
  const configuredAlign = (key: string, fallback: Align = 'left'): Align => {
    const value = String(elements.get(key)?.align || fallback);
    return value === 'center' || value === 'right' ? value : 'left';
  };
  const maybeUpper = (key: string, value: string) => elements.get(key)?.uppercase === true
    ? value.toLocaleUpperCase('sv-SE')
    : value;

  const place = (layer: RenderedText, left: number, top: number) => {
    const clampedLeft = Math.max(0, Math.min(Math.round(left), Math.max(0, width - layer.width)));
    overlays.push({ input: layer.data, left: clampedLeft, top: Math.max(0, Math.round(top)) });
    maxBottom = Math.max(maxBottom, top + layer.height);
  };

  // Radbrytning: teckenuppskattning först, sedan omfit mot uppmätt bredd så
  // ingen rad någonsin sticker utanför utskriftsytan.
  const layoutLines = async (
    value: string,
    sizePx: number,
    weight: number,
    color: string,
    maxWidth: number,
  ): Promise<RenderedText[]> => {
    if (!value) return [];
    let maxChars = Math.max(4, Math.floor(maxWidth / (sizePx * 0.55)));
    let rendered: RenderedText[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const lines = wrapText(value, maxChars);
      rendered = (await Promise.all(lines.map((line) => renderTextLine(line, sizePx, weight, color))))
        .filter((layer): layer is RenderedText => Boolean(layer));
      const widest = rendered.reduce((acc, layer) => Math.max(acc, layer.width), 0);
      if (widest <= maxWidth || maxChars <= 4) break;
      maxChars = Math.max(4, Math.floor((maxChars * maxWidth) / widest));
    }
    return rendered;
  };

  const paragraph = async (
    value: unknown,
    adminSize: number,
    weight: number,
    align: Align = 'left',
    color = '#000000',
    opts: { indent?: number; lineHeight?: number } = {},
  ) => {
    const textValue = plain(value);
    if (!textValue) return;
    const indent = opts.indent ?? 0;
    // 1.35 i stället för adminens 1.6: kvittopapper är dyrt på höjden, och
    // med de uppboostade textstorlekarna räcker det för luftig läsbarhet.
    const lineHeight = opts.lineHeight ?? 1.35;
    const sizePx = Math.max(8, adminSize * scale * TEXT_BOOST);
    const maxWidth = contentWidth - indent;
    const rendered = await layoutLines(textValue, sizePx, weight, color, maxWidth);
    const lineBox = sizePx * lineHeight;
    for (const layer of rendered) {
      const left = align === 'center'
        ? margin + indent + (maxWidth - layer.width) / 2
        : align === 'right'
          ? margin + indent + maxWidth - layer.width
          : margin + indent;
      place(layer, left, y + Math.max(0, (lineBox - layer.height) / 2));
      y += lineBox;
    }
  };

  const element = async (
    key: string,
    value: unknown,
    fallbackSize: number,
    fallbackWeight = 600,
    fallbackAlign: Align = 'left',
    color = '#000000',
    opts: { indent?: number; lineHeight?: number; minSize?: number; minWeight?: number } = {},
  ) => {
    if (!visible(key)) return;
    const textValue = maybeUpper(key, plain(value));
    if (!textValue) return;
    await paragraph(
      textValue,
      Math.max(opts.minSize ?? 6, configuredSize(key, fallbackSize)),
      Math.max(opts.minWeight ?? 0, configuredWeight(key, fallbackWeight)),
      configuredAlign(key, fallbackAlign),
      color,
      opts,
    );
  };

  const rowPair = async (
    left: unknown,
    right: unknown,
    leftSize: number,
    leftWeight: number,
    rightSize = leftSize,
    rightWeight = leftWeight,
    opts: { indent?: number } = {},
  ) => {
    const indent = opts.indent ?? 0;
    const rightLayer = await renderTextLine(plain(right), rightSize * scale * TEXT_BOOST, rightWeight, '#000000');
    const rightWidth = rightLayer ? rightLayer.width + px(8) : 0;
    const sizePx = Math.max(8, leftSize * scale * TEXT_BOOST);
    const lineBox = sizePx * 1.35;
    // Priset äger alltid högerkanten. Långa namn radbryts i vänsterkolumnen
    // i stället för att pressa in sig i prisets utrymme.
    const leftLines = await layoutLines(plain(left), sizePx, leftWeight, '#000000', Math.max(px(40), contentWidth - indent - rightWidth));
    if (leftLines.length === 0) {
      if (!rightLayer) return;
      place(rightLayer, width - margin - rightLayer.width, y + Math.max(0, (lineBox - rightLayer.height) / 2));
      y += lineBox;
      return;
    }
    leftLines.forEach((layer, index) => {
      place(layer, margin + indent, y + Math.max(0, (lineBox - layer.height) / 2));
      if (index === 0 && rightLayer) {
        place(rightLayer, width - margin - rightLayer.width, y + Math.max(0, (lineBox - rightLayer.height) / 2));
      }
      y += lineBox;
    });
  };

  const rule = (thickness: number) => {
    svg.push(`<rect x="${margin}" y="${Math.round(y)}" width="${contentWidth}" height="${thickness}" fill="#000"/>`);
    y += thickness;
  };
  const divider = () => {
    y += px(6);
    rule(Math.max(2, px(2)));
    y += px(6);
  };

  const badge = async (key: string, value: string) => {
    const layer = await renderTextLine(
      maybeUpper(key, value),
      configuredSize(key, 14) * scale * TEXT_BOOST,
      configuredWeight(key, 900),
      '#000000',
    );
    if (!layer) return;
    const border = Math.max(2, px(3));
    const padX = px(16);
    const padY = px(4);
    const boxWidth = Math.min(contentWidth, layer.width + (padX + border) * 2);
    const boxHeight = layer.height + (padY + border) * 2;
    const left = Math.round((width - boxWidth) / 2);
    svg.push(`<rect x="${left + border / 2}" y="${Math.round(y) + border / 2}" width="${boxWidth - border}" height="${boxHeight - border}" fill="#fff" stroke="#000" stroke-width="${border}"/>`);
    place(layer, left + (boxWidth - layer.width) / 2, y + border + padY);
    y += boxHeight + px(6);
  };

  const restaurantAddress = [
    h.address,
    [h.zip, h.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const customerAddress = [
    c.street,
    [c.zip, c.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const isDelivery = plain(o.type) === 'DELIVERY';
  const paymentText = plain(o.paymentMethod);

  // ── Plattform + ordernummer ──
  if (visible('platformName')) {
    const align = configuredAlign('platformName', 'center');
    const numberSuffix = visible('orderNumber') ? ` #${plain(o.number) || '—'}` : '';
    await element('platformName', `${template?.platformName || 'ViaEats'}${numberSuffix}`, 8, 800, 'center', '#000000', { minWeight: 800 });
    await paragraph('Ej kvitto', 10, 600, align, '#000000');
    y += px(4);
  }
  if (visible('divider1')) divider();

  // ── Restaurang ──
  await element('restaurantName', h.restaurantName || 'ViaEats', 15, 900, 'center');
  await element('timestamp', `${o.date} ${o.time}`, 9, 600, 'center');
  await element('address', restaurantAddress, 8, 600, 'center', '#000000', { minSize: 10 });
  await element('phone', h.phone ? `Tel: ${h.phone}` : '', 8, 600, 'center', '#000000', { minSize: 10 });
  y += px(6);

  if (visible('headerMsg') && plain(elements.get('headerMsg')?.content)) {
    await element('headerMsg', elements.get('headerMsg')?.content, 9, 700, 'center');
    y += px(6);
  }
  if (visible('divider2')) divider();

  // ── Kund ── (tät: namn/nummer/adress/meddelande direkt på varandra)
  await element('customerName', c.name, 12, 900, 'left', '#000000', { lineHeight: 1.2 });
  await element('customerPhone', c.phone, 9, 600, 'left', '#000000', { lineHeight: 1.2 });
  if (visible('customerAddress') && customerAddress) {
    await element('customerAddress', customerAddress, 9, 600, 'left', '#000000', { lineHeight: 1.2 });
  }
  if (visible('deliveryInstructions') && plain(c.instructions)) {
    await element('deliveryInstructions', translateInstruction(c.instructions), 9, 700, 'left', '#000000', { lineHeight: 1.2 });
  }
  if (visible('note') && plain(c.note)) {
    await element('note', c.note, 9, 700, 'left', '#000000', { lineHeight: 1.2 });
  }
  y += px(6);

  // ── Status-badges ──
  if (visible('orderType')) await badge('orderType', isDelivery ? 'Utkörning' : 'Avhämtning');
  if (visible('scheduledFor') && o.isPreorder) {
    await badge('scheduledFor', `Förbeställd ${o.scheduledDate} ${o.scheduledTime}`);
  }
  if (visible('paymentMethod') && paymentText) await badge('paymentMethod', paymentMethodLabel(o.paymentMethod));

  // ── Utlovad tid ──
  if (visible('estimatedTime') && !o.isPreorder && o.readyTime) {
    const align = configuredAlign('estimatedTime', 'center');
    await paragraph('Utlovad tid', 12, 800, align);
    await element('estimatedTime', `Klar ${o.readyTime}`, 14, 900, 'center', '#000000', { lineHeight: 1.25 });
    y += px(6);
  }

  if (visible('divider3')) divider();
  await paragraph(`${items.length} artikel${items.length === 1 ? '' : 'ar'}`, 11, 800, 'center');
  y += px(4);

  // ── Artiklar ──
  if (visible('items')) {
    for (const item of items) {
      // Artikelrader är kvittots viktigaste innehåll — golv på 12 px och
      // fet stil oavsett vad mallen råkar ha sparat, priset alltid i svart
      // fetstil längst till höger.
      await rowPair(
        `${item.qty} x ${item.name}`,
        `${kr(item.subtotal)} kr`,
        Math.max(12, configuredSize('items', 10)),
        Math.max(800, configuredWeight('items', 800)),
        Math.max(11, configuredSize('itemPrice', 8)),
        Math.max(800, configuredWeight('itemPrice', 800)),
      );
      if (visible('extras')) {
        // Tillvalen skrivs i exakt den ordning de sparades på ordern (per
        // produkt: grupp för grupp), så kombo-produkter läses pizza 1 → sås 1
        // → pizza 2 → sås 2. Obligatoriska val (storlek/sås) trycks större
        // och fetare än frivilliga. Pris visas bara när tillvalet kostar
        // något och står alltid högerställt som artikelpriserna; långa namn
        // radbryts i vänsterkolumnen.
        for (const extra of item.extras || []) {
          if (!extra.name) continue;
          const qty = Number(extra.quantity || 1);
          const price = Number(extra.price || 0);
          const lineTotal = Math.round(price * qty * 100) / 100;
          const requiredChoice = Boolean(extra.required);
          // Ingen indragning: tillvalen börjar exakt under artikelradens
          // siffra, med kompakt punktmarkör i stället för "**".
          await rowPair(
            `· ${qty > 1 ? `${qty} x ` : ''}${extra.name}`,
            lineTotal > 0 ? `+${kr(lineTotal)} kr` : '',
            requiredChoice
              ? Math.max(11, configuredSize('extras', 8) + 1)
              : Math.max(10, configuredSize('extras', 8)),
            requiredChoice ? 900 : 700,
            Math.max(10, configuredSize('extras', 8)),
            800,
          );
        }
      }
      if (plain(item.note)) await paragraph(`! ${item.note}`, 11, 900, 'left', '#000000');
      y += px(6);
    }
  }

  // Admin preview uses divider5 before the totals (divider4 is retained as a
  // legacy setting but is not rendered by the admin preview component).
  if (visible('divider5')) divider();

  // ── Totaler ──
  if (visible('deliveryFee') && Number(totals.deliveryFee || 0) > 0) {
    await rowPair('Leveransavgift', `${kr(totals.deliveryFee)} kr`, configuredSize('deliveryFee', 9), configuredWeight('deliveryFee', 600));
  }
  if (visible('discount') && Number(totals.discount || 0) > 0) {
    await rowPair(
      totals.discountCode ? `Rabatt (${totals.discountCode})` : 'Rabatt',
      `-${kr(totals.discount)} kr`,
      configuredSize('discount', 9),
      configuredWeight('discount', 600),
    );
  }
  if (visible('total')) {
    y += px(4);
    rule(Math.max(2, px(2)));
    y += px(4);
    await rowPair('Totalt', `${kr(totals.total)} kr`, configuredSize('total', 14), configuredWeight('total', 900));
  }
  y += px(6);
  if (visible('divider6')) divider();

  // ── Sidfot ──
  await element('thankYou', elements.get('thankYou')?.content || 'Tack för din beställning!', 9, 800, 'center');
  y += px(2);
  await element('footerMsg', elements.get('footerMsg')?.content || 'Välkommen åter!', 8, 600, 'center');
  y += px(20);

  const height = Math.max(px(120), Math.ceil(Math.max(y, maxBottom) + px(4)));
  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${svg.join('')}</svg>`,
  );
  return { base, overlays };
}

/** Felsöknings-/förhandsvy: samma komposition som skrivarbitmapen, som PNG. */
export async function buildReceiptDebugPng(order: any, template: any, paperWidth: ThermalPaperWidth): Promise<Buffer> {
  const { base, overlays } = await composeReceipt(order, template, paperWidth);
  return sharp(base)
    .composite(overlays)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .png()
    .toBuffer();
}

export async function buildEscPosBitmap(order: any, template: any, paperWidth: ThermalPaperWidth): Promise<Buffer> {
  const { base, overlays } = await composeReceipt(order, template, paperWidth);
  const raster = await sharp(base)
    .composite(overlays)
    .flatten({ background: '#ffffff' })
    .greyscale()
    // 200 (inte 176): antialiaskanterna räknas som svärta så strecken blir
    // fylliga och kolsvarta på papperet i stället för tunna och gryniga.
    .threshold(200)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const widthBytes = Math.ceil(raster.info.width / 8);
  const bitmap = Buffer.alloc(widthBytes * raster.info.height);
  const channels = raster.info.channels || 1;
  for (let py = 0; py < raster.info.height; py += 1) {
    for (let px = 0; px < raster.info.width; px += 1) {
      if (raster.data[(py * raster.info.width + px) * channels] < 128) {
        bitmap[py * widthBytes + (px >> 3)] |= 0x80 >> (px & 7);
      }
    }
  }

  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]),
    ...compactEscPosRaster(bitmap, widthBytes, raster.info.height),
    Buffer.from([0x1b, 0x64, 0x05, 0x1d, 0x56, 0x01]),
  ]);
}

function normalizePaperWidth(value: unknown): ThermalPaperWidth {
  return value === '58mm' || value === '72mm' ? value : '80mm';
}

/**
 * Standalone testutskrift från skrivarinställningarna. Den skapar ingen Order
 * och skickar inga order-events, men använder exakt samma sparade Admin-mall
 * och samma bitmaprenderare som riktiga orders och serverns testbeställningar.
 */
export async function getStandaloneTestPrintArtifact(
  restaurantId: string,
  requestedWidth: unknown,
): Promise<Buffer | null> {
  const [restaurant, template] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        zip: true,
        phone: true,
      },
    }),
    prisma.receiptTemplate.findUnique({ where: { id: 'global' } }),
  ]);
  if (!restaurant) return null;

  const now = new Date();
  const sampleOrder = {
    id: `standalone-test:${restaurant.id}`,
    restaurantId: restaurant.id,
    orderNumber: 'TESTUTSKRIFT',
    status: 'PENDING',
    type: 'PICKUP',
    customerName: 'TESTKVITTO',
    customerPhone: '0700000000',
    customerEmail: null,
    deliveryStreet: null,
    deliveryCity: null,
    deliveryZip: null,
    deliveryInstructions: 'ADMINMALL',
    note: 'FRISTÅENDE TESTUTSKRIFT',
    allergens: '[]',
    total: 11500,
    deliveryFee: 0,
    discountAmount: 0,
    discountCode: null,
    appliedDealTitle: null,
    paymentMethod: 'TEST',
    paymentStatus: 'PAID',
    estimatedTime: 20,
    scheduledFor: null,
    preparingAt: now,
    createdAt: now,
    updatedAt: now,
    restaurant,
    items: [{
      productName: 'Margherita',
      quantity: 1,
      basePrice: 11500,
      subtotal: 11500,
      selectedExtras: '[]',
      note: null,
    }],
  };

  return buildEscPosBitmap(sampleOrder, template, normalizePaperWidth(requestedWidth));
}

export async function getServerPrintArtifact(orderId: string, requestedWidth: unknown): Promise<PrintArtifact | null> {
  const paperWidth = normalizePaperWidth(requestedWidth);
  const latestKey = `${orderId}:${paperWidth}`;
  const [order, template] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, restaurant: true },
    }),
    prisma.receiptTemplate.findUnique({ where: { id: 'global' } }),
  ]);
  // Servergenererade terminal-testordrar raderas direkt efter accept. Deras
  // redan uppvärmda bitmap måste ändå kunna hämtas av plattan några hundra ms
  // senare, så den senaste artefakten får leva kvar i det begränsade minnet.
  if (!order) return latestArtifactByOrder.get(latestKey) || null;
  const fingerprint = [
    RECEIPT_RENDERER_VERSION,
    order.id,
    order.updatedAt.toISOString(),
    order.status,
    order.estimatedTime ?? '',
    template?.updatedAt?.toISOString() || '',
    paperWidth,
  ].join(':');
  const cached = artifactCache.get(fingerprint);
  if (cached) return cached;
  const alreadyRendering = artifactInFlight.get(fingerprint);
  if (alreadyRendering) return alreadyRendering;

  const rendering = (async (): Promise<PrintArtifact> => {
    const artifact: PrintArtifact = {
      bytes: await buildEscPosBitmap(order, template, paperWidth),
      fingerprint,
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurantId: order.restaurantId,
      paperWidth,
    };
    artifactCache.set(fingerprint, artifact);
    latestArtifactByOrder.delete(latestKey);
    latestArtifactByOrder.set(latestKey, artifact);
    while (artifactCache.size > MAX_ARTIFACTS) artifactCache.delete(artifactCache.keys().next().value!);
    while (latestArtifactByOrder.size > MAX_ARTIFACTS * 2) latestArtifactByOrder.delete(latestArtifactByOrder.keys().next().value!);
    return artifact;
  })();
  artifactInFlight.set(fingerprint, rendering);
  try {
    return await rendering;
  } finally {
    artifactInFlight.delete(fingerprint);
  }
}

/** Generate final accepted-order artifacts before the status response reaches the tablet. */
export async function warmServerPrintArtifacts(orderId: string, requestedWidth?: unknown): Promise<void> {
  if (requestedWidth === '58mm' || requestedWidth === '72mm' || requestedWidth === '80mm') {
    await getServerPrintArtifact(orderId, requestedWidth);
    return;
  }
  // Äldre terminaler skickar ingen bredd. Värm de två vanligaste utan att
  // blockera CPU med en tredje layout som nästan aldrig används.
  await Promise.all([
    getServerPrintArtifact(orderId, '58mm'),
    getServerPrintArtifact(orderId, '80mm'),
  ]);
}
