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
const RECEIPT_RENDERER_VERSION = 'admin-wysiwyg-v3';

function ascii(value: unknown): string {
  return String(value ?? '')
    .replace(/[åä]/g, 'a')
    .replace(/[ÅÄ]/g, 'A')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/[éèêë]/g, 'e')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[^ -~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(ore: unknown): string {
  const value = Number(ore || 0) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function parseExtras(raw: unknown): any[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
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

function row(left: unknown, right: unknown, width: number): string[] {
  const rightText = ascii(right);
  const leftWidth = Math.max(8, width - rightText.length - 1);
  const leftLines = wrapText(left, leftWidth);
  if (leftLines.length === 0) return [rightText.padStart(width)];
  return leftLines.map((line, index) => index === 0
    ? `${line.padEnd(leftWidth)} ${rightText}`.slice(0, width)
    : line);
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

function allergens(value: unknown): string {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed.map(plain).filter(Boolean).join(', ');
  } catch {
    // Legacy rows may contain a plain-text allergen note.
  }
  const text = plain(value);
  return text === '[]' ? '' : text;
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
        price: extra?.priceAddon || extra?.price || 0,
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

type ReceiptTextLayer = {
  text: string;
  left: number;
  top: number;
  width: number;
  size: number;
  weight: number;
  align: 'left' | 'center' | 'right';
  color: string;
};

function escPosFeedDots(dots: number): Buffer[] {
  const chunks: Buffer[] = [];
  let remaining = Math.max(0, Math.round(dots));
  while (remaining > 0) {
    const step = Math.min(255, remaining);
    chunks.push(Buffer.from([0x1b, 0x4a, step])); // ESC J n
    remaining -= step;
  }
  return chunks;
}

/**
 * Packar bara rader som faktiskt innehåller svärta. Vita mellanrum blir korta
 * ESC/POS-feedkommandon i stället för tusentals nollbytes över Bluetooth.
 * Layoutens fysiska höjd behålls men överföringen blir normalt 40–70 % mindre.
 */
function compactEscPosRaster(bitmap: Buffer, widthBytes: number, height: number): Buffer[] {
  const hasInk = (rowIndex: number) => {
    const start = rowIndex * widthBytes;
    for (let index = start; index < start + widthBytes; index += 1) {
      if (bitmap[index] !== 0) return true;
    }
    return false;
  };

  const chunks: Buffer[] = [];
  let rowIndex = 0;
  while (rowIndex < height) {
    const blankStart = rowIndex;
    while (rowIndex < height && !hasInk(rowIndex)) rowIndex += 1;
    if (rowIndex > blankStart) chunks.push(...escPosFeedDots(rowIndex - blankStart));
    if (rowIndex >= height) break;

    const bandStart = rowIndex;
    let lastInk = rowIndex;
    rowIndex += 1;
    while (rowIndex < height) {
      if (hasInk(rowIndex)) lastInk = rowIndex;
      // Små hål hör till samma textrad. Större vita ytor skickas som feed.
      if (rowIndex - lastInk > 3) break;
      rowIndex += 1;
    }
    const bandEnd = lastInk + 1;
    const bandHeight = bandEnd - bandStart;
    chunks.push(Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      bandHeight & 0xff, (bandHeight >> 8) & 0xff,
    ]));
    chunks.push(bitmap.subarray(bandStart * widthBytes, bandEnd * widthBytes));
    rowIndex = bandEnd;
  }
  return chunks;
}

export async function buildEscPosBitmap(order: any, template: any, paperWidth: ThermalPaperWidth): Promise<Buffer> {
  const width = paperWidth === '58mm' ? 384 : paperWidth === '72mm' ? 512 : 576;
  const margin = paperWidth === '58mm' ? 14 : 18;
  const elements = templateElements(template);
  const preview = buildAdminReceiptData(order);
  const h = preview.header;
  const o = preview.orderInfo;
  const c = preview.customer;
  const items = preview.items;
  const totals = preview.totals;
  const svg: string[] = [];
  const textLayers: ReceiptTextLayer[] = [];
  let y = 18;

  const configuredSize = (key: string, fallback: number) => {
    const value = Number(elements.get(key)?.size);
    return Math.max(18, (Number.isFinite(value) ? value : fallback) * 3);
  };
  const configuredWeight = (key: string, fallback = 500) => {
    const weight = String(elements.get(key)?.weight || '');
    return weight === 'black' ? 900 : weight === 'bold' ? 700 : fallback;
  };
  const configuredAlign = (key: string, fallback: 'left' | 'center' | 'right' = 'left') => {
    const value = String(elements.get(key)?.align || fallback);
    return value === 'center' || value === 'right' ? value : 'left';
  };
  const maybeUpper = (key: string, value: string) => elements.get(key)?.uppercase === true
    ? value.toLocaleUpperCase('sv-SE')
    : value;
  const wrapPixels = (value: unknown, size: number, maxWidth: number) => {
    const text = plain(value);
    if (!text) return [];
    const maxChars = Math.max(6, Math.floor(maxWidth / Math.max(7, size * 0.54)));
    return wrapText(text, maxChars);
  };
  const text = (
    value: unknown,
    size: number,
    weight = 500,
    align: 'left' | 'center' | 'right' = 'left',
    color = '#000000',
    maxWidth = width - margin * 2,
    indent = 0,
  ) => {
    const lines = wrapPixels(value, size, maxWidth);
    if (lines.length === 0) return;
    const layerLeft = align === 'left'
      ? margin + indent
      : align === 'right'
        ? width - margin - maxWidth
        : Math.round((width - maxWidth) / 2);
    for (const line of lines) {
      textLayers.push({
        text: line,
        left: Math.max(0, Math.round(layerLeft)),
        top: Math.max(0, Math.round(y)),
        width: Math.max(8, Math.round(maxWidth)),
        size: Math.round(size),
        weight,
        align,
        color,
      });
      y += Math.max(size + 4, size * 1.13);
    }
  };
  const space = (height: number) => { y += height; };
  const divider = (thickness = 2) => {
    y += 14;
    svg.push(`<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="#000" stroke-width="${thickness}"/>`);
    y += 12;
  };
  const badge = (key: string, value: string) => {
    const size = configuredSize(key, 9);
    const badgeWidth = Math.min(width - margin * 2, Math.max(170, value.length * size * 0.62 + 36));
    const badgeHeight = size + 24;
    y += 8;
    const badgeLeft = Math.round((width - badgeWidth) / 2);
    svg.push(`<rect x="${badgeLeft}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="0" fill="#fff" stroke="#000" stroke-width="3"/>`);
    textLayers.push({
      text: maybeUpper(key, value),
      left: badgeLeft + 12,
      top: Math.round(y + (badgeHeight - size * 1.15) / 2),
      width: Math.round(badgeWidth - 24),
      size: Math.round(size),
      weight: configuredWeight(key, 800),
      align: 'center',
      color: '#000000',
    });
    y += badgeHeight + 8;
  };
  const rowText = (left: unknown, right: unknown, size: number, weight = 700, rightSize = size, rightWeight = weight) => {
    const rightText = plain(right);
    const rightWidth = Math.max(90, rightText.length * rightSize * 0.58);
    const leftLines = wrapPixels(left, size, width - margin * 2 - rightWidth - 10);
    const lines = leftLines.length ? leftLines : [''];
    lines.forEach((line, index) => {
      const top = Math.round(y);
      textLayers.push({
        text: line,
        left: margin,
        top,
        width: Math.max(8, Math.round(width - margin * 2 - rightWidth - 10)),
        size: Math.round(size),
        weight,
        align: 'left',
        color: '#000000',
      });
      if (index === 0) {
        textLayers.push({
          text: rightText,
          left: Math.round(width - margin - rightWidth),
          top,
          width: Math.round(rightWidth),
          size: Math.round(rightSize),
          weight: rightWeight,
          align: 'right',
          color: '#000000',
        });
      }
      y += Math.max(size + 4, size * 1.13);
    });
  };

  const hasVisible = (key: string) => elements.get(key)?.visible !== false;
  const drawTextElement = (key: string, value: unknown, fallbackSize: number, fallbackWeight = 500, fallbackAlign: 'left' | 'center' | 'right' = 'left', color = '#000000') => {
    const valueText = maybeUpper(key, plain(value));
    if (!valueText) return;
    text(valueText, configuredSize(key, fallbackSize), configuredWeight(key, fallbackWeight), configuredAlign(key, fallbackAlign), color);
  };
  const drawItemCount = () => {
    text(`${items.length} ${items.length === 1 ? 'artikel' : 'artiklar'}`, 33, 700, 'center');
  };
  const drawItems = () => {
    for (const item of items) {
      rowText(
        `${item.qty} x ${item.name}`,
        `${plain(item.subtotal)} kr`,
        configuredSize('items', 9),
        configuredWeight('items', 800),
        configuredSize('itemPrice', 8),
        configuredWeight('itemPrice', 700),
      );
      if (hasVisible('extras')) {
        for (const extra of item.extras || []) {
          const name = extra.name;
          if (!name) continue;
          text(`** ${name}`, configuredSize('extras', 8), configuredWeight('extras'), configuredAlign('extras'), '#555555', width - margin * 2 - 36, 36);
        }
      }
      if (item.note) text(`! ${item.note}`, 30, 900, 'left', '#000000', width - margin * 2 - 36, 36);
      space(8);
    }
  };

  // Match ReceiptPreviewContent in apps/admin exactly. The admin editor
  // controls every field's visibility/size/weight/alignment; this ordering is
  // the layout the operator sees in the admin preview and expects on paper.
  const visible = (key: string) => elements.get(key)?.visible !== false;

  if (visible('platformName')) {
    const numberSuffix = visible('orderNumber') ? ` #${plain(o.number) || '—'}` : '';
    drawTextElement('platformName', `${template?.platformName || 'ViaEats'}${numberSuffix}`, 8, 500, 'center');
    text('Ej kvitto', 30, 500, 'center', '#555555');
  }
  if (visible('divider1')) divider();

  const restaurantAddress = [
    h.address,
    [h.zip, h.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const customerAddress = [
    c.street,
    [c.zip, c.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const isDelivery = plain(o.type) === 'DELIVERY';
  const allergenText = Array.isArray(c.allergens)
    ? c.allergens.map(plain).filter(Boolean).join(', ')
    : plain(c.allergens);
  const paymentText = plain(o.paymentMethod);

  if (visible('restaurantName')) drawTextElement('restaurantName', h.restaurantName || 'ViaEats', 15, 900, 'center');
  if (visible('timestamp')) drawTextElement('timestamp', `${o.date} ${o.time}`, 9, 500, 'center');
  if (visible('address')) drawTextElement('address', restaurantAddress, 8, 500, 'center');
  if (visible('phone')) drawTextElement('phone', h.phone ? `Tel: ${h.phone}` : '', 8, 500, 'center');

  if (visible('headerMsg')) drawTextElement('headerMsg', elements.get('headerMsg')?.content, 9, 700, 'center');
  if (visible('divider2')) divider();

  if (visible('customerName') && plain(c.name)) {
    text('Kund:', 30, 700, 'left', '#555555');
    drawTextElement('customerName', c.name, 12, 900);
  }
  if (visible('customerPhone')) drawTextElement('customerPhone', c.phone, 9, 500);
  if (visible('customerAddress') && customerAddress) {
    space(7);
    text('Adress:', 30, 700, 'left', '#555555');
    drawTextElement('customerAddress', customerAddress, 9, 500);
  }
  if (visible('deliveryInstructions')) drawTextElement('deliveryInstructions', translateInstruction(c.instructions), 9, 700);
  if (visible('note')) drawTextElement('note', c.note, 9, 700);
  if (visible('allergens')) drawTextElement('allergens', allergenText ? `! ${allergenText}` : '', 9, 700, 'left', '#b00020');

  if (visible('orderType')) badge('orderType', isDelivery ? 'Utkörning' : 'Avhämtning');
  if (visible('scheduledFor') && o.isPreorder) {
    badge('scheduledFor', `Förbeställd ${o.scheduledDate} ${o.scheduledTime}`);
  }
  if (visible('paymentMethod') && paymentText) badge('paymentMethod', paymentText);

  if (visible('estimatedTime') && !o.isPreorder && o.readyTime) {
    space(6);
    text('Utlovad tid', 36, 700, 'center');
    drawTextElement('estimatedTime', `Klar ${o.readyTime}`, 14, 900, 'center');
  }

  if (visible('divider3')) divider();
  drawItemCount();
  if (visible('items')) drawItems();
  // Admin preview uses divider5 before the totals (divider4 is retained as a
  // legacy setting but is not rendered by the admin preview component).
  if (visible('divider5')) divider();
  if (visible('deliveryFee') && Number(totals.deliveryFee || 0) > 0) rowText('Leveransavgift', `${plain(totals.deliveryFee)} kr`, configuredSize('deliveryFee', 8), configuredWeight('deliveryFee'));
  if (visible('discount') && Number(totals.discount || 0) > 0) rowText(totals.discountCode ? `Rabatt (${totals.discountCode})` : 'Rabatt', `-${plain(totals.discount)} kr`, configuredSize('discount', 8), configuredWeight('discount'));
  if (visible('total')) {
    svg.push(`<line x1="${margin}" y1="${y + 8}" x2="${width - margin}" y2="${y + 8}" stroke="#000" stroke-width="3"/>`);
    y += 12;
    rowText('Totalt', `${plain(totals.total)} kr`, configuredSize('total', 14), configuredWeight('total', 900));
  }
  if (visible('divider6')) divider();
  if (visible('thankYou')) drawTextElement('thankYou', elements.get('thankYou')?.content || 'Tack för din beställning!', 9, 700, 'center');
  if (visible('footerMsg')) drawTextElement('footerMsg', elements.get('footerMsg')?.content || 'Välkommen åter!', 8, 500, 'center', '#555555');
  space(30);

  const height = Math.max(160, Math.ceil(y + 56));
  const image = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${svg.join('')}</svg>`;
  const overlays = textLayers.map((layer) => ({
    input: {
      text: {
        text: `<span foreground="${layer.color}" weight="${layer.weight}" size="${layer.size * 1024}">${xml(layer.text)}</span>`,
        font: 'Outfit',
        fontfile: RECEIPT_FONT_PATH,
        width: layer.width,
        align: layer.align,
        rgba: true,
        dpi: 72,
      },
    },
    left: layer.left,
    top: layer.top,
  }));
  const raster = await sharp(Buffer.from(image))
    .composite(overlays)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(176)
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
