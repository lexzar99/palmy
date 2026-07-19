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
  const configuredElements = templateElementList(template);
  const elements = templateElements(template);
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
  ) => {
    const lines = wrapPixels(value, size, maxWidth);
    if (lines.length === 0) return;
    const layerLeft = align === 'left'
      ? margin
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
    svg.push(`<rect x="${badgeLeft}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="#000"/>`);
    textLayers.push({
      text: maybeUpper(key, value),
      left: badgeLeft + 12,
      top: Math.round(y + (badgeHeight - size * 1.15) / 2),
      width: Math.round(badgeWidth - 24),
      size: Math.round(size),
      weight: configuredWeight(key, 800),
      align: 'center',
      color: '#ffffff',
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

  const restaurantAddress = [
    order.restaurant?.address,
    [order.restaurant?.zip, order.restaurant?.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const customerAddress = [
    order.deliveryStreet,
    [order.deliveryZip, order.deliveryCity].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const isDelivery = order.type === 'DELIVERY';
  const allergenText = allergens(order.allergens);
  const paymentText = order.paymentStatus === 'PAID'
    ? 'Betald online'
    : plain(order.paymentMethod || order.paymentStatus);
  const hasVisible = (key: string) => elements.get(key)?.visible !== false;
  const drawTextElement = (key: string, value: unknown, fallbackSize: number, fallbackWeight = 500, fallbackAlign: 'left' | 'center' | 'right' = 'left', color = '#000000') => {
    const valueText = maybeUpper(key, plain(value));
    if (!valueText) return;
    text(valueText, configuredSize(key, fallbackSize), configuredWeight(key, fallbackWeight), configuredAlign(key, fallbackAlign), color);
  };
  const drawItems = () => {
    const items = Array.isArray(order.items) ? order.items : [];
    text(`${items.length} ${items.length === 1 ? 'artikel' : 'artiklar'}`, 21, 500, 'center', '#555555');
    for (const item of items) {
      rowText(
        `${item.quantity} x ${item.productName}`,
        `${money(item.subtotal)} kr`,
        configuredSize('items', 9),
        configuredWeight('items', 800),
        configuredSize('itemPrice', 8),
        configuredWeight('itemPrice', 700),
      );
      if (hasVisible('extras')) {
        for (const extra of parseExtras(item.selectedExtras)) {
          const name = extra.extraName || extra.name;
          if (!name) continue;
          const addonKr = Number(extra.priceAddon || extra.price || 0);
          if (addonKr > 0) {
            rowText(`++ ${name}`, `+${Number.isInteger(addonKr) ? addonKr : addonKr.toFixed(2)} kr`, configuredSize('extras', 7), configuredWeight('extras'));
          } else {
            drawTextElement('extras', `-- ${name}`, 7, configuredWeight('extras'));
          }
        }
      }
      if (item.note) drawTextElement('items', `! ${item.note}`, 7, 800);
      space(8);
    }
  };

  // The saved admin template is the source of truth. Do not impose a second
  // server-only order: every visible element is rendered in its saved order.
  let platformIncludesOrderNumber = false;
  for (const element of configuredElements) {
    const key = String(element?.key || '');
    if (!key || element?.visible === false) continue;

    if (key === 'orderNumber' && platformIncludesOrderNumber) continue;
    if (key.startsWith('divider')) {
      divider();
      continue;
    }

    switch (key) {
      case 'restaurantName':
        drawTextElement(key, order.restaurant?.name || 'ViaEats', 15, 900, 'center');
        break;
      case 'platformName': {
        const orderNumberElement = elements.get('orderNumber');
        platformIncludesOrderNumber = orderNumberElement?.visible !== false;
        const numberSuffix = platformIncludesOrderNumber ? ` #${plain(order.orderNumber) || '—'}` : '';
        drawTextElement(key, `${template?.platformName || 'ViaEats'}${numberSuffix}`, 8, 500, 'center');
        text('Ej kvitto', configuredSize(key, 8), 500, 'center', '#555555');
        break;
      }
      case 'address':
        drawTextElement(key, restaurantAddress, 8, 500, 'center');
        break;
      case 'phone':
        drawTextElement(key, order.restaurant?.phone ? `Tel: ${order.restaurant.phone}` : '', 8, 500, 'center');
        break;
      case 'headerMsg':
        drawTextElement(key, element.content, 9, 700, 'center');
        break;
      case 'orderNumber':
        drawTextElement(key, `Ordernummer: ${order.orderNumber}`, 10, 700);
        break;
      case 'timestamp':
        drawTextElement(key, `${formatDate(new Date(order.createdAt))} ${formatTime(new Date(order.createdAt))}`, 8, 500);
        break;
      case 'orderType':
        badge(key, isDelivery ? 'Utkörning' : 'Avhämtning');
        break;
      case 'scheduledFor':
        if (order.scheduledFor) {
          const scheduled = new Date(order.scheduledFor);
          badge(key, `Förbeställd ${formatDate(scheduled)} ${formatTime(scheduled)}`);
        }
        break;
      case 'estimatedTime':
        if (!order.scheduledFor && order.estimatedTime) {
          const anchor = order.preparingAt ? new Date(order.preparingAt) : new Date(order.createdAt);
          space(6);
          drawTextElement(key, 'Utlovad tid', 8, 700, 'center');
          drawTextElement(key, `Klar ${formatTime(new Date(anchor.getTime() + Number(order.estimatedTime) * 60_000))}`, 14, 900, 'center');
        }
        break;
      case 'customerName':
        if (plain(order.customerName)) {
          text('Kund:', 10, 700, 'left', '#555555');
          drawTextElement(key, order.customerName, 9, 700);
        }
        break;
      case 'customerPhone':
        drawTextElement(key, order.customerPhone, 8, 500);
        break;
      case 'customerAddress':
        if (isDelivery && customerAddress) {
          space(7);
          text('Adress:', 10, 700, 'left', '#555555');
          drawTextElement(key, customerAddress, 8, 500);
        }
        break;
      case 'deliveryInstructions':
        drawTextElement(key, translateInstruction(order.deliveryInstructions), 8, 700);
        break;
      case 'note':
        drawTextElement(key, order.note, 8, 700);
        break;
      case 'allergens':
        drawTextElement(key, allergenText ? `! ${allergenText}` : '', 8, 700, 'left', '#cc0000');
        break;
      case 'items':
        drawItems();
        break;
      case 'deliveryFee':
        if (Number(order.deliveryFee || 0) > 0) rowText('Leveransavgift', `${money(order.deliveryFee)} kr`, configuredSize(key, 8), configuredWeight(key));
        break;
      case 'discount':
        if (Number(order.discountAmount || 0) > 0) rowText(order.discountCode ? `Rabatt (${order.discountCode})` : 'Rabatt', `-${money(order.discountAmount)} kr`, configuredSize(key, 8), configuredWeight(key));
        break;
      case 'total':
        svg.push(`<line x1="${margin}" y1="${y + 8}" x2="${width - margin}" y2="${y + 8}" stroke="#000" stroke-width="3"/>`);
        y += 12;
        rowText('Totalt', `${money(order.total)} kr`, configuredSize(key, 15), configuredWeight(key, 900));
        break;
      case 'paymentMethod':
        if (paymentText) badge(key, paymentText);
        break;
      case 'thankYou':
        drawTextElement(key, element.content || 'Tack för din beställning!', 9, 700, 'center');
        break;
      case 'footerMsg':
        drawTextElement(key, element.content || 'Välkommen åter!', 8, 500, 'center', '#555555');
        break;
      default:
        break;
    }
  }
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
