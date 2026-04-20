import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const DEFAULT_TEMPLATE_ELEMENTS = [
  { key: 'restaurantName', label: 'Restaurangnamn', visible: true, size: 14, weight: 'black', align: 'center', uppercase: true },
  { key: 'platformName', label: 'Plattformsnamn (MatGo)', visible: true, size: 8, weight: 'normal', align: 'center', uppercase: true },
  { key: 'address', label: 'Adress', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'phone', label: 'Telefon', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'divider1', label: 'Avdelare (efter info)', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'headerMsg', label: 'Sidhuvud', content: '', visible: true, size: 9, weight: 'bold', align: 'center' },
  { key: 'divider2', label: 'Avdelare (efter sidhuvud)', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'orderNumber', label: 'Ordernummer', visible: true, size: 10, weight: 'bold', align: 'left' },
  { key: 'timestamp', label: 'Datum & tid', visible: true, size: 8, weight: 'normal', align: 'left' },
  { key: 'orderType', label: 'Typ (Leverans/Avhämtning)', visible: true, size: 9, weight: 'bold', align: 'left' },
  { key: 'scheduledFor', label: 'Förbeställd tid', visible: true, size: 9, weight: 'bold', align: 'left' },
  { key: 'customerName', label: 'Kundnamn', visible: true, size: 9, weight: 'bold', align: 'left' },
  { key: 'customerPhone', label: 'Kundtelefon', visible: true, size: 8, weight: 'normal', align: 'left' },
  { key: 'customerAddress', label: 'Leveransadress', visible: true, size: 8, weight: 'normal', align: 'left' },
  { key: 'deliveryInstructions', label: 'Leveransinstruktioner', visible: true, size: 8, weight: 'bold', align: 'left' },
  { key: 'note', label: 'Ordernotering', visible: true, size: 8, weight: 'bold', align: 'left' },
  { key: 'allergens', label: 'Allergener', visible: true, size: 8, weight: 'bold', align: 'left' },
  { key: 'divider3', label: 'Avdelare (före produkter)', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'items', label: 'Produktrader', visible: true, size: 10, weight: 'bold', align: 'left' },
  { key: 'extras', label: 'Tillbehör', visible: true, size: 8, weight: 'normal', align: 'left' },
  { key: 'divider4', label: 'Avdelare (före summa)', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'deliveryFee', label: 'Leveransavgift', visible: true, size: 9, weight: 'normal', align: 'left' },
  { key: 'discount', label: 'Rabatt/Kod', visible: true, size: 9, weight: 'normal', align: 'left' },
  { key: 'total', label: 'Totalt', visible: true, size: 12, weight: 'black', align: 'left' },
  { key: 'paymentMethod', label: 'Betalmetod', visible: true, size: 8, weight: 'normal', align: 'left' },
  { key: 'divider5', label: 'Avdelare (efter summa)', visible: true, size: 8, weight: 'normal', align: 'center' },
  { key: 'thankYou', label: 'Tack-meddelande', content: 'Tack för din beställning!', visible: true, size: 9, weight: 'bold', align: 'center' },
  { key: 'footerMsg', label: 'Sidfot', content: 'Välkommen åter!', visible: true, size: 8, weight: 'normal', align: 'center' },
];

const DEFAULT_TEMPLATE = {
  paperWidth: '80mm',
  platformName: 'MatGo',
  elements: DEFAULT_TEMPLATE_ELEMENTS,
};

const templateElementSchema = z.object({
  key: z.string(),
  label: z.string(),
  content: z.string().optional().nullable(),
  visible: z.boolean(),
  size: z.number().int().min(7).max(18),
  weight: z.enum(['normal', 'bold', 'black']),
  align: z.enum(['left', 'center', 'right']),
  uppercase: z.boolean().optional(),
});

const printerSchema = z.object({
  restaurantId: z.string().optional().nullable(),
  name: z.string().min(2),
  connectionType: z.enum(['NETWORK', 'BLUETOOTH']).default('NETWORK'),
  address: z.string().min(2),
  paperWidth: z.enum(['58mm', '80mm', 'A4']).default('80mm'),
  copies: z.number().int().min(1).max(5).default(1),
  autoPrint: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  receiptMode: z.enum(['STANDARD', 'COMPACT', 'DETAILED']).default('STANDARD'),
  notes: z.string().optional().nullable(),
  markSeen: z.boolean().optional(),
});

const isSuperAdmin = (req: AuthRequest) => req.admin?.role === 'SUPER_ADMIN';

const resolveRestaurantScope = async (req: AuthRequest, res: any, explicitRestaurantId?: string | null) => {
  if (isSuperAdmin(req)) {
    return explicitRestaurantId || null;
  }

  const restaurantId = req.admin?.restaurantId;
  if (!restaurantId) {
    res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
    return null;
  }

  return restaurantId;
};

const normalizeTemplate = (row?: { paperWidth: string; platformName: string; elements: string | null } | null) => {
  let parsedElements: Array<Record<string, unknown>> = [];
  try {
    parsedElements = row?.elements ? JSON.parse(row.elements) : [];
  } catch {
    parsedElements = [];
  }

  const parsedByKey = new Map(parsedElements.map((element) => [String(element.key), element]));
  const mergedElements = DEFAULT_TEMPLATE_ELEMENTS.map((element) => ({
    ...element,
    ...(parsedByKey.get(element.key) || {}),
  }));

  return {
    paperWidth: row?.paperWidth || DEFAULT_TEMPLATE.paperWidth,
    platformName: row?.platformName || DEFAULT_TEMPLATE.platformName,
    elements: mergedElements,
  };
};

const ensureTemplate = async () => {
  const row = await prisma.receiptTemplate.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      paperWidth: DEFAULT_TEMPLATE.paperWidth,
      platformName: DEFAULT_TEMPLATE.platformName,
      elements: JSON.stringify(DEFAULT_TEMPLATE.elements),
    },
  });

  return normalizeTemplate(row);
};

const getPrinterStatus = (lastSeenAt?: Date | null) => {
  if (!lastSeenAt) return 'UNKNOWN';
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMinutes = diffMs / 60000;
  if (diffMinutes <= 10) return 'ONLINE';
  if (diffMinutes <= 60 * 24) return 'STALE';
  return 'OFFLINE';
};

const formatPrinter = (printer: any) => ({
  id: printer.id,
  restaurantId: printer.restaurantId,
  restaurantName: printer.restaurant?.name || null,
  name: printer.name,
  connectionType: printer.connectionType,
  address: printer.address,
  paperWidth: printer.paperWidth,
  copies: printer.copies,
  autoPrint: printer.autoPrint,
  isDefault: printer.isDefault,
  isActive: printer.isActive,
  receiptMode: printer.receiptMode,
  notes: printer.notes,
  lastSeenAt: printer.lastSeenAt,
  status: getPrinterStatus(printer.lastSeenAt),
  createdAt: printer.createdAt,
  updatedAt: printer.updatedAt,
});

const ensurePrinterAccess = async (req: AuthRequest, res: any, printerId: string) => {
  const printer = await prisma.restaurantPrinter.findUnique({
    where: { id: printerId },
    include: { restaurant: { select: { id: true, name: true } } },
  });

  if (!printer) {
    res.status(404).json({ error: 'Skrivaren hittades inte' });
    return null;
  }

  if (!isSuperAdmin(req) && req.admin?.restaurantId !== printer.restaurantId) {
    res.status(403).json({ error: 'Du kan bara hantera skrivare för din restaurang' });
    return null;
  }

  return printer;
};

router.get('/receipt-template', async (_req, res) => {
  try {
    const template = await ensureTemplate();
    res.json(template);
  } catch (error) {
    console.error('Receipt template fetch error:', error);
    res.status(500).json({ error: 'Kunde inte hämta kvittomallen' });
  }
});

router.put('/receipt-template', async (req: AuthRequest, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const body = z.object({
      paperWidth: z.enum(['58mm', '80mm', 'A4']),
      platformName: z.string().min(1),
      elements: z.array(templateElementSchema),
    }).parse(req.body);

    const template = await prisma.receiptTemplate.upsert({
      where: { id: 'global' },
      update: {
        paperWidth: body.paperWidth,
        platformName: body.platformName,
        elements: JSON.stringify(body.elements),
      },
      create: {
        id: 'global',
        paperWidth: body.paperWidth,
        platformName: body.platformName,
        elements: JSON.stringify(body.elements),
      },
    });

    res.json(normalizeTemplate(template));
  } catch (error: any) {
    console.error('Receipt template save error:', error);
    res.status(400).json({ error: error?.message || 'Kunde inte spara kvittomallen' });
  }
});

router.get('/printers', async (req: AuthRequest, res) => {
  try {
    const requestedRestaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : null;
    const restaurantId = await resolveRestaurantScope(req, res, requestedRestaurantId);
    if (!isSuperAdmin(req) && !restaurantId) return;

    const printers = await prisma.restaurantPrinter.findMany({
      where: restaurantId ? { restaurantId } : {},
      include: { restaurant: { select: { id: true, name: true } } },
      orderBy: [{ restaurantId: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    res.json(printers.map(formatPrinter));
  } catch (error) {
    console.error('Printer list error:', error);
    res.status(500).json({ error: 'Kunde inte hämta skrivare' });
  }
});

router.get('/config', async (req: AuthRequest, res) => {
  try {
    const requestedRestaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : null;
    const restaurantId = await resolveRestaurantScope(req, res, requestedRestaurantId);
    if (!isSuperAdmin(req) && !restaurantId) return;

    const [template, printers] = await Promise.all([
      ensureTemplate(),
      prisma.restaurantPrinter.findMany({
        where: restaurantId ? { restaurantId } : {},
        include: { restaurant: { select: { id: true, name: true } } },
        orderBy: [{ restaurantId: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);

    res.json({
      scope: { restaurantId, isSuperAdmin: isSuperAdmin(req) },
      template,
      printers: printers.map(formatPrinter),
      defaultPrinter: printers.find((printer) => printer.isDefault) ? formatPrinter(printers.find((printer) => printer.isDefault)) : null,
    });
  } catch (error) {
    console.error('Printing config error:', error);
    res.status(500).json({ error: 'Kunde inte hämta printing-konfigurationen' });
  }
});

router.post('/printers', async (req: AuthRequest, res) => {
  try {
    const body = printerSchema.parse(req.body);
    const restaurantId = await resolveRestaurantScope(req, res, body.restaurantId || null);
    if (!isSuperAdmin(req) && !restaurantId) return;
    if (!restaurantId) {
      return res.status(400).json({ error: 'restaurantId krävs' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const existingDefault = await tx.restaurantPrinter.findFirst({ where: { restaurantId, isDefault: true } });
      const shouldBeDefault = body.isDefault || !existingDefault;

      if (shouldBeDefault) {
        await tx.restaurantPrinter.updateMany({
          where: { restaurantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.restaurantPrinter.create({
        data: {
          restaurantId,
          name: body.name,
          connectionType: body.connectionType,
          address: body.address,
          paperWidth: body.paperWidth,
          copies: body.copies,
          autoPrint: body.autoPrint,
          isDefault: shouldBeDefault,
          isActive: body.isActive,
          receiptMode: body.receiptMode,
          notes: body.notes || null,
          lastSeenAt: body.markSeen ? new Date() : null,
        },
        include: { restaurant: { select: { id: true, name: true } } },
      });
    });

    res.status(201).json(formatPrinter(created));
  } catch (error: any) {
    console.error('Create printer error:', error);
    res.status(400).json({ error: error?.message || 'Kunde inte skapa skrivaren' });
  }
});

router.patch('/printers/:id', async (req: AuthRequest, res) => {
  try {
    const body = printerSchema.partial().parse(req.body);
    const printer = await ensurePrinterAccess(req, res, req.params.id);
    if (!printer) return;

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.restaurantPrinter.updateMany({
          where: { restaurantId: printer.restaurantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.restaurantPrinter.update({
        where: { id: printer.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.connectionType !== undefined ? { connectionType: body.connectionType } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.paperWidth !== undefined ? { paperWidth: body.paperWidth } : {}),
          ...(body.copies !== undefined ? { copies: body.copies } : {}),
          ...(body.autoPrint !== undefined ? { autoPrint: body.autoPrint } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.receiptMode !== undefined ? { receiptMode: body.receiptMode } : {}),
          ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
          ...(body.markSeen ? { lastSeenAt: new Date() } : {}),
        },
        include: { restaurant: { select: { id: true, name: true } } },
      });
    });

    res.json(formatPrinter(updated));
  } catch (error: any) {
    console.error('Update printer error:', error);
    res.status(400).json({ error: error?.message || 'Kunde inte uppdatera skrivaren' });
  }
});

router.delete('/printers/:id', async (req: AuthRequest, res) => {
  try {
    const printer = await ensurePrinterAccess(req, res, req.params.id);
    if (!printer) return;

    await prisma.restaurantPrinter.delete({ where: { id: printer.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete printer error:', error);
    res.status(500).json({ error: 'Kunde inte radera skrivaren' });
  }
});

router.post('/heartbeat', async (req: AuthRequest, res) => {
  try {
    const body = z.object({
      printerId: z.string().optional(),
      address: z.string().optional(),
      restaurantId: z.string().optional(),
    }).parse(req.body);

    const restaurantId = await resolveRestaurantScope(req, res, body.restaurantId || null);
    if (!isSuperAdmin(req) && !restaurantId) return;

    let printer = null;
    if (body.printerId) {
      printer = await ensurePrinterAccess(req, res, body.printerId);
      if (!printer) return;
    } else if (restaurantId && body.address) {
      printer = await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, address: body.address },
        include: { restaurant: { select: { id: true, name: true } } },
      });
    }

    if (!printer) {
      return res.status(404).json({ error: 'Ingen skrivare matchade heartbeat-förfrågan' });
    }

    const updated = await prisma.restaurantPrinter.update({
      where: { id: printer.id },
      data: { lastSeenAt: new Date() },
      include: { restaurant: { select: { id: true, name: true } } },
    });

    res.json(formatPrinter(updated));
  } catch (error: any) {
    console.error('Printer heartbeat error:', error);
    res.status(400).json({ error: error?.message || 'Kunde inte uppdatera printer-status' });
  }
});

export default router;
