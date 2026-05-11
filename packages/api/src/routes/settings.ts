import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';
import {
  defaultRestaurantSettings,
  parseOpeningHours,
  DEFAULT_DELIVERY_FEE,
  DEFAULT_MIN_ORDER_AMOUNT,
  DEFAULT_ESTIMATED_PICKUP_TIME,
  DEFAULT_ESTIMATED_DELIVERY_TIME,
  DEFAULT_DELIVERY_RADIUS,
} from '../lib/restaurantSettings';

const router = Router();

// GET /api/settings - Publika inställningar för kundsidan
router.get('/', async (_req, res) => {
  try {
    const [settings, primaryRestaurant] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      // Hämta första aktiva restaurang för pause-status (single-tenant setup)
      prisma.restaurant.findFirst({
        select: { pausedUntil: true, isOpen: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const pausedUntilDate = primaryRestaurant?.pausedUntil ?? null;
    const isPaused =
      pausedUntilDate !== null && pausedUntilDate.getTime() > Date.now();

    if (!settings) {
      res.json({
        ...defaultRestaurantSettings,
        pausedUntil: pausedUntilDate?.toISOString() ?? null,
        isPaused,
      });
      return;
    }

    // Aktiv pause åsidosätter manuellt isOpen-flag.
    const effectiveIsOpen = isPaused ? false : settings.isOpen;

    res.json({
      isOpen: effectiveIsOpen,
      manualIsOpen: settings.isOpen,
      pausedUntil: pausedUntilDate?.toISOString() ?? null,
      isPaused,
      deliveryFee: settings.deliveryFee / 100,
      minOrderAmount: settings.minOrderAmount / 100,
      deliveryRadius: settings.deliveryRadius,
      estimatedPickupTime: settings.estimatedPickupTime,
      estimatedDeliveryTime: settings.estimatedDeliveryTime,
      notificationSound: settings.notificationSound,
      phone: settings.phone,
      openingHours: parseOpeningHours(settings.openingHours as string),
      // Platform/företags-info för About + Contact-sidor på web
      contactPhone: (settings as any).contactPhone || null,
      contactPhoneHours: (settings as any).contactPhoneHours || null,
      contactEmail: (settings as any).contactEmail || null,
      contactAddress: (settings as any).contactAddress || null,
      aboutBody: (settings as any).aboutBody || null,
      // UI-toggles
      showDiscountedRail: (settings as any).showDiscountedRail ?? true,
    });
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/settings - Admin uppdaterar inställningar
router.patch('/', authenticate, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const { isOpen, deliveryFee, minOrderAmount, deliveryRadius, estimatedPickupTime, estimatedDeliveryTime, notificationSound, openingHours, contactPhone, contactPhoneHours, contactEmail, contactAddress, aboutBody, showDiscountedRail } = req.body;

    const data: Record<string, unknown> = {};
    if (isOpen !== undefined) data.isOpen = isOpen;
    if (deliveryFee !== undefined) data.deliveryFee = Math.round(deliveryFee * 100);
    if (minOrderAmount !== undefined) data.minOrderAmount = Math.round(minOrderAmount * 100);
    if (deliveryRadius !== undefined) data.deliveryRadius = deliveryRadius;
    if (estimatedPickupTime !== undefined) data.estimatedPickupTime = estimatedPickupTime;
    if (estimatedDeliveryTime !== undefined) data.estimatedDeliveryTime = estimatedDeliveryTime;
    if (notificationSound !== undefined) data.notificationSound = notificationSound;
    if (openingHours !== undefined) data.openingHours = JSON.stringify(openingHours);
    // Platform-fält (nullable strings — tomt = ta bort värdet)
    if (contactPhone !== undefined) data.contactPhone = contactPhone || null;
    if (contactPhoneHours !== undefined) data.contactPhoneHours = contactPhoneHours || null;
    if (contactEmail !== undefined) data.contactEmail = contactEmail || null;
    if (contactAddress !== undefined) data.contactAddress = contactAddress || null;
    if (aboutBody !== undefined) data.aboutBody = aboutBody || null;
    if (showDiscountedRail !== undefined) data.showDiscountedRail = Boolean(showDiscountedRail);

    const settings = await prisma.restaurantSettings.upsert({
      where: { id: 'settings' },
      update: data,
      create: {
        id: 'settings',
        isOpen: isOpen ?? true,
        deliveryFee: deliveryFee !== undefined ? Math.round(deliveryFee * 100) : Math.round(DEFAULT_DELIVERY_FEE * 100),
        minOrderAmount: minOrderAmount !== undefined ? Math.round(minOrderAmount * 100) : Math.round(DEFAULT_MIN_ORDER_AMOUNT * 100),
        deliveryRadius: deliveryRadius ?? DEFAULT_DELIVERY_RADIUS,
        estimatedPickupTime: estimatedPickupTime ?? DEFAULT_ESTIMATED_PICKUP_TIME,
        estimatedDeliveryTime: estimatedDeliveryTime ?? DEFAULT_ESTIMATED_DELIVERY_TIME,
        notificationSound: notificationSound ?? defaultRestaurantSettings.notificationSound,
        phone: req.body.phone,
        openingHours: JSON.stringify(openingHours ?? defaultRestaurantSettings.openingHours),
      },
    });

    const publicSettings = {
      isOpen: settings.isOpen,
      deliveryFee: settings.deliveryFee / 100,
      minOrderAmount: settings.minOrderAmount / 100,
      deliveryRadius: settings.deliveryRadius,
      estimatedPickupTime: settings.estimatedPickupTime,
      estimatedDeliveryTime: settings.estimatedDeliveryTime,
      notificationSound: settings.notificationSound,
      phone: settings.phone,
      openingHours: parseOpeningHours(settings.openingHours),
    };

    getIO().emit('settings:updated', publicSettings);

    res.json({ 
      success: true,
      settings: publicSettings
    });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
