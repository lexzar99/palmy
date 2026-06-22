import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { cached, bustCache } from '../lib/ttlCache';
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
    // Cache the DB read 15s — /api/settings is hit on every home load (page +
    // PlatformBanner) and polled every 60s by the banner, so without this it
    // scales linearly with visitors. The time-sensitive isPaused is computed
    // per-request below from the cached pausedUntil, so it stays accurate.
    const [settings, primaryRestaurant] = await cached('settings:public', 'global', 15_000, () =>
      Promise.all([
        prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
        // Hämta första aktiva restaurang för pause-status (single-tenant setup)
        prisma.restaurant.findFirst({
          select: { pausedUntil: true, isOpen: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])
    );

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
      // Företagsidentitet (Terms/Privacy/Support i web + RN)
      companyName: (settings as any).companyName || null,
      organizationNumber: (settings as any).organizationNumber || null,
      companyAddress: (settings as any).companyAddress || null,
      supportEmail: (settings as any).supportEmail || null,
      privacyEmail: (settings as any).privacyEmail || null,
      noReplyEmail: (settings as any).noReplyEmail || null,
      // UI-toggles
      showDiscountedRail: (settings as any).showDiscountedRail ?? true,
      // Dpoints — publika fält: badge nära produkter + gating i klienterna.
      dpoints: {
        enabled: (settings as any).dpointsEnabled ?? false,
        perKr: (settings as any).dpointsPerKr ?? 1,
        valuePerKr: (settings as any).dpointsValuePerKr ?? 10,
        cardOnHome: (settings as any).dpointsCardOnHome ?? true,
        // Budkostnad (öre) på poäng-ENBART order vid leverans. Web visar den som
        // egen kassa-rad och inkluderar i totalen (vid hämtning = 0).
        courierCost: (settings as any).dpointsCourierCost ?? 0,
        // Km-baserad budkostnad-tariff (poäng-ENBART leverans): [{ maxKm, feeKr }].
        // Klienten räknar fram avgiften från leveransavståndet. Tom = platt courierCost.
        courierTiers: (() => {
          try {
            const arr = JSON.parse((settings as any).dpointsCourierTiers ?? '[]');
            return Array.isArray(arr) ? arr : [];
          } catch {
            return [];
          }
        })(),
      },
      // Plattform-banner (visas i web när satt och inte expirerad)
      banner: (() => {
        const s = settings as any;
        if (!s.bannerMessage) return null;
        if (s.bannerExpiresAt && new Date(s.bannerExpiresAt) < new Date()) return null;
        return {
          message: s.bannerMessage,
          severity: s.bannerSeverity || 'info',
          expiresAt: s.bannerExpiresAt,
        };
      })(),
      // Platform pause: när aktiv stoppar API:t nya orderskapanden.
      // Exponeras så kundappar kan visa en lugn "vi är tillbaka kl X"-skärm
      // istället för cryptiska "Kunde inte skapa order"-felmeddelanden.
      platformPause: (() => {
        const s = settings as any;
        if (!s.platformPausedUntil) return null;
        const until = new Date(s.platformPausedUntil);
        if (until.getTime() <= Date.now()) return null;
        return {
          until: until.toISOString(),
          reason: s.platformPauseReason || null,
        };
      })(),
      // Hero / brand-CMS — ifyllt = override default copy
      hero: (() => {
        const s = settings as any;
        if (!s.heroTitle && !s.heroSubtitle && !s.heroImageUrl) return null;
        return {
          title: s.heroTitle || null,
          subtitle: s.heroSubtitle || null,
          imageUrl: s.heroImageUrl || null,
          ctaLabel: s.heroCtaLabel || null,
          ctaUrl: s.heroCtaUrl || null,
        };
      })(),
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

    const {
      isOpen, deliveryFee, minOrderAmount, deliveryRadius, estimatedPickupTime, estimatedDeliveryTime,
      notificationSound, openingHours, contactPhone, contactPhoneHours, contactEmail, contactAddress, aboutBody,
      showDiscountedRail, bannerMessage, bannerSeverity, bannerExpiresAt,
      companyName, organizationNumber, companyAddress,
      supportEmail, privacyEmail, noReplyEmail,
      heroTitle, heroSubtitle, heroImageUrl, heroCtaLabel, heroCtaUrl,
      commissionSelfPct, commissionPlatformPct, vatCustomerPct, vatPlatformFeePct,
      tierGoldFee, tierSilverFee, tierStandardFee,
    } = req.body;

    // Lättviktig email-validering — bara om värdet är icke-tomt. Inte
    // RFC-perfekt men fångar typos som "support@matgo" eller " " i mitten.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validateEmail = (value: unknown, label: string): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.length > 254) {
        throw new Error(`${label} är för lång`);
      }
      if (!EMAIL_RE.test(trimmed)) {
        throw new Error(`${label} är inte en giltig e-postadress`);
      }
      return trimmed;
    };
    const validateString = (value: unknown, max: number, label: string): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.length > max) {
        throw new Error(`${label} är för lång (max ${max} tecken)`);
      }
      return trimmed;
    };

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
    if (contactEmail !== undefined) {
      data.contactEmail = contactEmail ? validateEmail(contactEmail, 'E-post') : null;
    }
    if (contactAddress !== undefined) data.contactAddress = contactAddress || null;
    if (aboutBody !== undefined) data.aboutBody = aboutBody || null;
    if (showDiscountedRail !== undefined) data.showDiscountedRail = Boolean(showDiscountedRail);
    if (bannerMessage !== undefined) data.bannerMessage = bannerMessage || null;
    if (bannerSeverity !== undefined) data.bannerSeverity = bannerSeverity || null;
    if (bannerExpiresAt !== undefined) {
      data.bannerExpiresAt = bannerExpiresAt ? new Date(bannerExpiresAt) : null;
    }
    // Företagsidentitet
    if (companyName !== undefined) {
      data.companyName = validateString(companyName, 200, 'Företagsnamn');
    }
    if (organizationNumber !== undefined) {
      data.organizationNumber = validateString(organizationNumber, 50, 'Organisationsnummer');
    }
    if (companyAddress !== undefined) {
      data.companyAddress = validateString(companyAddress, 500, 'Företagsadress');
    }
    if (supportEmail !== undefined) {
      data.supportEmail = validateEmail(supportEmail, 'Support-email');
    }
    if (privacyEmail !== undefined) {
      data.privacyEmail = validateEmail(privacyEmail, 'Privacy-email');
    }
    if (noReplyEmail !== undefined) {
      data.noReplyEmail = validateEmail(noReplyEmail, 'No-reply-email');
    }
    // Hero / CMS — all nullable, empty string clears the field
    if (heroTitle !== undefined) data.heroTitle = validateString(heroTitle, 200, 'Hero-titel');
    if (heroSubtitle !== undefined) data.heroSubtitle = validateString(heroSubtitle, 300, 'Hero-subtitel');
    if (heroImageUrl !== undefined) data.heroImageUrl = validateString(heroImageUrl, 1000, 'Hero-bild-URL');
    if (heroCtaLabel !== undefined) data.heroCtaLabel = validateString(heroCtaLabel, 80, 'Hero-CTA-etikett');
    if (heroCtaUrl !== undefined) data.heroCtaUrl = validateString(heroCtaUrl, 1000, 'Hero-CTA-URL');

    // --- Plattform-ekonomi. Procent clampas 0–100, abonnemang kr → öre. ---
    const pct = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    const krToOre = (v: unknown) => Math.max(0, Math.round((Number(v) || 0) * 100));
    if (commissionSelfPct !== undefined) data.commissionSelfPct = pct(commissionSelfPct);
    if (commissionPlatformPct !== undefined) data.commissionPlatformPct = pct(commissionPlatformPct);
    if (vatCustomerPct !== undefined) data.vatCustomerPct = pct(vatCustomerPct);
    if (vatPlatformFeePct !== undefined) data.vatPlatformFeePct = pct(vatPlatformFeePct);
    if (tierGoldFee !== undefined) data.tierGoldFee = krToOre(tierGoldFee);
    if (tierSilverFee !== undefined) data.tierSilverFee = krToOre(tierSilverFee);
    if (tierStandardFee !== undefined) data.tierStandardFee = krToOre(tierStandardFee);

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
    bustCache('settings:public', 'global'); // settings change shows immediately

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
    // Valideringsfel ger 400 — generiska fel ger 500.
    const message = err instanceof Error ? err.message : String(err);
    const looksLikeValidation =
      message.includes('är för lång') ||
      message.includes('giltig e-postadress');
    if (looksLikeValidation) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
