import prisma from './prisma';

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

function buildEscPos(order: any, template: any, paperWidth: ThermalPaperWidth): Buffer {
  const columns = paperWidth === '58mm' ? 32 : paperWidth === '72mm' ? 42 : 48;
  const visible = visibleTemplateKeys(template?.elements);
  const shows = (key: string) => !visible || visible.has(key);
  const chunks: Buffer[] = [];
  const command = (...bytes: number[]) => chunks.push(Buffer.from(bytes));
  const line = (value = '') => chunks.push(Buffer.from(`${ascii(value)}\n`, 'ascii'));
  const wrapped = (value: unknown) => wrapText(value, columns).forEach((part) => line(part));
  const align = (mode: 0 | 1 | 2) => command(0x1b, 0x61, mode);
  const bold = (enabled: boolean) => command(0x1b, 0x45, enabled ? 1 : 0);
  const size = (mode: number) => command(0x1d, 0x21, mode);
  const divider = () => line('-'.repeat(columns));

  command(0x1b, 0x40); // ESC @ — init
  align(1);
  bold(true);
  size(0x11);
  line(order.restaurant?.name || 'ViaEats');
  size(0);
  line(`${template?.platformName || 'ViaEats'} #${order.orderNumber}`);
  bold(false);
  line('Ej kvitto');
  if (shows('address')) wrapped([order.restaurant?.address, order.restaurant?.zip, order.restaurant?.city].filter(Boolean).join(' '));
  if (shows('phone') && order.restaurant?.phone) line(`Tel: ${order.restaurant.phone}`);
  divider();

  align(0);
  if (shows('customerName')) { bold(true); wrapped(order.customerName); bold(false); }
  if (shows('customerPhone')) wrapped(order.customerPhone);
  if (order.type === 'DELIVERY' && shows('customerAddress')) {
    wrapped([order.deliveryStreet, order.deliveryZip, order.deliveryCity].filter(Boolean).join(' '));
  }
  if (shows('deliveryInstructions') && order.deliveryInstructions) wrapped(translateInstruction(order.deliveryInstructions));
  if (shows('note') && order.note) { bold(true); wrapped(`OBS: ${order.note}`); bold(false); }
  if (shows('allergens') && order.allergens) { bold(true); wrapped(`ALLERGENER: ${order.allergens}`); bold(false); }
  divider();

  align(1);
  bold(true);
  size(0x11);
  line(order.type === 'DELIVERY' ? 'UTKORNING' : 'AVHAMTNING');
  size(0);
  if (order.scheduledFor) {
    const scheduled = new Date(order.scheduledFor);
    line(`FORBESTALLD ${formatDate(scheduled)} ${formatTime(scheduled)}`);
  } else if (shows('estimatedTime') && order.estimatedTime) {
    const anchor = order.preparingAt ? new Date(order.preparingAt) : new Date(order.createdAt);
    line(`KLAR ${formatTime(new Date(anchor.getTime() + Number(order.estimatedTime) * 60_000))}`);
  }
  bold(false);
  divider();

  align(0);
  if (shows('items')) {
    for (const item of order.items || []) {
      bold(true);
      row(`${item.quantity} x ${item.productName}`, `${money(item.subtotal)} kr`, columns).forEach(line);
      bold(false);
      if (shows('extras')) {
        for (const extra of parseExtras(item.selectedExtras)) {
          const name = extra.extraName || extra.name;
          if (!name) continue;
          const addonOre = Math.round(Number(extra.priceAddon || extra.price || 0) * 100);
          wrapped(addonOre > 0 ? `  + ${name} (+${money(addonOre)} kr)` : `  - ${name}`);
        }
      }
      if (item.note) { bold(true); wrapped(`  OBS: ${item.note}`); bold(false); }
      line();
    }
  }
  divider();
  if (shows('deliveryFee') && order.deliveryFee > 0) row('Leveransavgift', `${money(order.deliveryFee)} kr`, columns).forEach(line);
  if (shows('discount') && order.discountAmount > 0) row(order.discountCode ? `Rabatt (${order.discountCode})` : 'Rabatt', `-${money(order.discountAmount)} kr`, columns).forEach(line);
  bold(true);
  size(0x11);
  row('TOTALT', `${money(order.total)} kr`, columns).forEach(line);
  size(0);
  bold(false);
  if (shows('paymentMethod')) line(order.paymentMethod || order.paymentStatus || 'Betalning registrerad');
  divider();
  align(1);
  line(`${formatDate(new Date(order.createdAt))} ${formatTime(new Date(order.createdAt))}`);
  line('Tack for din bestallning!');
  command(0x1b, 0x64, 5); // feed five lines
  command(0x1d, 0x56, 1); // partial cut; ignored safely by cutter-less units
  return Buffer.concat(chunks);
}

function normalizePaperWidth(value: unknown): ThermalPaperWidth {
  return value === '58mm' || value === '72mm' ? value : '80mm';
}

export async function getServerPrintArtifact(orderId: string, requestedWidth: unknown): Promise<PrintArtifact | null> {
  const paperWidth = normalizePaperWidth(requestedWidth);
  const [order, template] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, restaurant: true },
    }),
    prisma.receiptTemplate.findUnique({ where: { id: 'global' } }),
  ]);
  if (!order) return null;
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
    bytes: buildEscPos(order, template, paperWidth),
    fingerprint,
    orderId: order.id,
    orderNumber: order.orderNumber,
    restaurantId: order.restaurantId,
    paperWidth,
  };
  artifactCache.set(fingerprint, artifact);
  while (artifactCache.size > MAX_ARTIFACTS) artifactCache.delete(artifactCache.keys().next().value!);
  return artifact;
}

/** Generate final accepted-order artifacts before the status response reaches the tablet. */
export async function warmServerPrintArtifacts(orderId: string): Promise<void> {
  await Promise.all([
    getServerPrintArtifact(orderId, '58mm'),
    getServerPrintArtifact(orderId, '80mm'),
  ]);
}
