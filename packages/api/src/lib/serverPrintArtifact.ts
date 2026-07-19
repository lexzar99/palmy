import prisma from './prisma';
import sharp from 'sharp';

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
const MAX_ARTIFACTS = 240;

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
    case 'RING_DOORBELL': return 'Ring pa dorren';
    case 'LEAVE_AT_DOOR': return 'Lamna vid dorren';
    case 'MEET_OUTSIDE': return 'Mot mig utanfor';
    case 'MEET_AT_DOOR': return 'Mot vid dorren';
    case 'NO_CONTACT': return 'Kontaktfri leverans';
    case 'CALL_ON_ARRIVAL': return 'Ring vid ankomst';
    default: return ascii(value);
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
  const text = ascii(value);
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

function templateElements(template: any): Map<string, any> {
  try {
    const elements = typeof template?.elements === 'string'
      ? JSON.parse(template.elements)
      : template?.elements;
    return new Map(
      (Array.isArray(elements) ? elements : []).map((element: any) => [String(element.key), element]),
    );
  } catch {
    return new Map();
  }
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

async function buildEscPosBitmap(order: any, template: any, paperWidth: ThermalPaperWidth): Promise<Buffer> {
  const width = paperWidth === '58mm' ? 384 : paperWidth === '72mm' ? 512 : 576;
  const margin = paperWidth === '58mm' ? 14 : 18;
  const visible = visibleTemplateKeys(template?.elements);
  const shows = (key: string) => !visible || visible.has(key);
  const elements = templateElements(template);
  const svg: string[] = [];
  let y = 22;

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
    const x = align === 'center' ? width / 2 : align === 'right' ? width - margin : margin;
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    for (const line of lines) {
      y += size * 0.92;
      svg.push(`<text x="${x}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(line)}</text>`);
      y += Math.max(3, size * 0.12);
    }
  };
  const space = (height: number) => { y += height; };
  const divider = (thickness = 2) => {
    y += 14;
    svg.push(`<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="#000" stroke-width="${thickness}"/>`);
    y += 12;
  };
  const badge = (value: string) => {
    const size = configuredSize('orderType', 9);
    const badgeWidth = Math.min(width - margin * 2, Math.max(170, value.length * size * 0.62 + 36));
    const badgeHeight = size + 24;
    y += 8;
    svg.push(`<rect x="${(width - badgeWidth) / 2}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="#000"/>`);
    svg.push(`<text x="${width / 2}" y="${y + badgeHeight * 0.70}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" font-weight="800" fill="#fff">${xml(value.toLocaleUpperCase('sv-SE'))}</text>`);
    y += badgeHeight + 8;
  };
  const rowText = (left: unknown, right: unknown, size: number, weight = 700) => {
    const rightText = plain(right);
    const rightWidth = Math.max(90, rightText.length * size * 0.58);
    const leftLines = wrapPixels(left, size, width - margin * 2 - rightWidth - 10);
    const lines = leftLines.length ? leftLines : [''];
    lines.forEach((line, index) => {
      y += size * 0.95;
      svg.push(`<text x="${margin}" y="${y}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="#000">${xml(line)}</text>`);
      if (index === 0) svg.push(`<text x="${width - margin}" y="${y}" text-anchor="end" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="#000">${xml(rightText)}</text>`);
      y += Math.max(3, size * 0.12);
    });
  };

  text(`${template?.platformName || 'ViaEats'} #${order.orderNumber}`, 22, 800, 'center');
  text('Ej kvitto', 19, 500, 'center', '#555555');
  divider();

  if (shows('restaurantName')) {
    const key = 'restaurantName';
    text(maybeUpper(key, plain(order.restaurant?.name || 'ViaEats')), configuredSize(key, 15), configuredWeight(key, 900), configuredAlign(key, 'center'));
  }
  if (shows('timestamp')) {
    const key = 'timestamp';
    text(`${formatDate(new Date(order.createdAt))} ${formatTime(new Date(order.createdAt))}`, configuredSize(key, 8), configuredWeight(key, 700), configuredAlign(key, 'center'));
  }
  if (shows('address')) {
    const address = [order.restaurant?.address, [order.restaurant?.zip, order.restaurant?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    text(address, configuredSize('address', 7), configuredWeight('address'), configuredAlign('address', 'center'));
  }
  if (shows('phone') && order.restaurant?.phone) {
    text(`Tel: ${order.restaurant.phone}`, configuredSize('phone', 7), configuredWeight('phone'), configuredAlign('phone', 'center'));
  }
  divider();

  if (shows('customerName')) text(order.customerName, configuredSize('customerName', 11), configuredWeight('customerName', 900), configuredAlign('customerName'));
  if (shows('customerPhone')) text(order.customerPhone, configuredSize('customerPhone', 8), configuredWeight('customerPhone', 700), configuredAlign('customerPhone'));
  if (order.type === 'DELIVERY' && shows('customerAddress')) {
    space(7);
    text([order.deliveryStreet, [order.deliveryZip, order.deliveryCity].filter(Boolean).join(' ')].filter(Boolean).join(', '), configuredSize('customerAddress', 8), configuredWeight('customerAddress', 900), configuredAlign('customerAddress'));
  }
  if (shows('deliveryInstructions') && order.deliveryInstructions) text(translateInstruction(order.deliveryInstructions), configuredSize('deliveryInstructions', 7), configuredWeight('deliveryInstructions', 700), configuredAlign('deliveryInstructions'));
  if (shows('note') && order.note) text(`OBS: ${order.note}`, configuredSize('note', 7), configuredWeight('note', 800), configuredAlign('note'));
  const allergenText = allergens(order.allergens);
  if (shows('allergens') && allergenText) text(`! ALLERGENER: ${allergenText}`, configuredSize('allergens', 7), configuredWeight('allergens', 900), configuredAlign('allergens'));
  space(10);

  if (shows('orderType')) badge(order.type === 'DELIVERY' ? 'Utkörning' : 'Avhämtning');
  if (order.scheduledFor) {
    const scheduled = new Date(order.scheduledFor);
    if (shows('scheduledFor')) badge(`Förbeställd ${formatDate(scheduled)} ${formatTime(scheduled)}`);
  } else if (shows('estimatedTime') && order.estimatedTime) {
    const anchor = order.preparingAt ? new Date(order.preparingAt) : new Date(order.createdAt);
    space(6);
    text('Utlovad tid', configuredSize('estimatedTime', 8), configuredWeight('estimatedTime'), configuredAlign('estimatedTime', 'center'));
    text(`Klar ${formatTime(new Date(anchor.getTime() + Number(order.estimatedTime) * 60_000))}`, configuredSize('estimatedTime', 21), 900, configuredAlign('estimatedTime', 'center'));
  }
  if (shows('paymentMethod')) badge(order.paymentStatus === 'PAID' ? 'Betald online' : plain(order.paymentMethod || order.paymentStatus));
  text(`${(order.items || []).length} ${(order.items || []).length === 1 ? 'artikel' : 'artiklar'}`, 21, 500, 'center', '#555555');
  divider();

  if (shows('items')) {
    for (const item of order.items || []) {
      rowText(`${item.quantity} x ${item.productName}`, `${money(item.subtotal)} kr`, configuredSize('items', 9), configuredWeight('items', 800));
      if (shows('extras')) {
        for (const extra of parseExtras(item.selectedExtras)) {
          const name = extra.extraName || extra.name;
          if (!name) continue;
          const addonKr = Number(extra.priceAddon || extra.price || 0);
          if (addonKr > 0) rowText(`++ ${name}`, `+${Number.isInteger(addonKr) ? addonKr : addonKr.toFixed(2)} kr`, configuredSize('extras', 7), configuredWeight('extras'));
          else text(`-- ${name}`, configuredSize('extras', 7), configuredWeight('extras'));
        }
      }
      if (item.note) text(`! ${item.note}`, configuredSize('items', 7), 800);
      space(8);
    }
  }
  divider();
  if (shows('deliveryFee') && order.deliveryFee > 0) rowText('Leveransavgift', `${money(order.deliveryFee)} kr`, configuredSize('deliveryFee', 8), configuredWeight('deliveryFee'));
  if (shows('discount') && order.discountAmount > 0) rowText(order.discountCode ? `Rabatt (${order.discountCode})` : 'Rabatt', `-${money(order.discountAmount)} kr`, configuredSize('discount', 8), configuredWeight('discount'));
  divider(4);
  if (shows('total')) rowText('Totalt', `${money(order.total)} kr`, configuredSize('total', 15), configuredWeight('total', 900));
  divider();
  const thanks = plain(elements.get('thankYou')?.content) || 'Tack för din beställning!';
  const footer = plain(elements.get('footerMsg')?.content) || 'Välkommen åter!';
  if (shows('thankYou')) text(thanks, configuredSize('thankYou', 7), configuredWeight('thankYou', 700), configuredAlign('thankYou', 'center'));
  if (shows('footerMsg')) text(footer, configuredSize('footerMsg', 7), configuredWeight('footerMsg'), configuredAlign('footerMsg', 'center'), '#555555');
  space(30);

  const height = Math.max(160, Math.ceil(y + 20));
  const image = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${svg.join('')}</svg>`;
  const raster = await sharp(Buffer.from(image))
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

  const rasterHeader = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    raster.info.height & 0xff, (raster.info.height >> 8) & 0xff,
  ]);
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]),
    rasterHeader,
    bitmap,
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
}

/** Generate final accepted-order artifacts before the status response reaches the tablet. */
export async function warmServerPrintArtifacts(orderId: string): Promise<void> {
  await Promise.all([
    getServerPrintArtifact(orderId, '58mm'),
    getServerPrintArtifact(orderId, '72mm'),
    getServerPrintArtifact(orderId, '80mm'),
  ]);
}
