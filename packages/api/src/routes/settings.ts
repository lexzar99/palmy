import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { io } from '../index';
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
    const settings = await prisma.restaurantSettings.findUnique({
      where: { id: 'settings' },
    });

    if (!settings) {
      res.json(defaultRestaurantSettings);
      return;
    }

    res.json({
      isOpen: settings.isOpen,
      deliveryFee: settings.deliveryFee / 100,
      minOrderAmount: settings.minOrderAmount / 100,
      deliveryRadius: settings.deliveryRadius,
      estimatedPickupTime: settings.estimatedPickupTime,
      estimatedDeliveryTime: settings.estimatedDeliveryTime,
      notificationSound: settings.notificationSound,
      phone: settings.phone,
      openingHours: parseOpeningHours(settings.openingHours as string),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/settings - Admin uppdaterar inställningar
router.patch('/', authenticate, async (req, res) => {
  try {
    const { isOpen, deliveryFee, minOrderAmount, deliveryRadius, estimatedPickupTime, estimatedDeliveryTime, notificationSound, openingHours } = req.body;

    const data: Record<string, unknown> = {};
    if (isOpen !== undefined) data.isOpen = isOpen;
    if (deliveryFee !== undefined) data.deliveryFee = Math.round(deliveryFee * 100);
    if (minOrderAmount !== undefined) data.minOrderAmount = Math.round(minOrderAmount * 100);
    if (deliveryRadius !== undefined) data.deliveryRadius = deliveryRadius;
    if (estimatedPickupTime !== undefined) data.estimatedPickupTime = estimatedPickupTime;
    if (estimatedDeliveryTime !== undefined) data.estimatedDeliveryTime = estimatedDeliveryTime;
    if (notificationSound !== undefined) data.notificationSound = notificationSound;
    if (openingHours !== undefined) data.openingHours = JSON.stringify(openingHours);

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

    io.emit('settings:updated', publicSettings);

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
