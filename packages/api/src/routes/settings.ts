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
import { moneyDto, parseOre, sekToOre } from '../utils/money';
import { parseFinancePercentage, parseFinancePriceOre } from '../lib/financeSettingsInput';

const router = Router();

// GET /api/settings - Publika inställningar för kundsidan
router.get('/', async (_req, res) => {
  try {
    // Cache the DB read 15s — /api/settings is hit on every home load (page +
    // PlatformBanner) and polled every 60s by the banner, so without this it
    // scales linearly with visitors. The time-sensitive isPaused is computed
    // per-request below from the cached pausedUntil, so it stays accurate.
    const settings = await cached('settings:public', 'global', 15_000, () =>
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
    );
    const pausedUntilDate = settings?.platformPausedUntil ?? null;
    const timedPauseActive = pausedUntilDate !== null && pausedUntilDate.getTime() > Date.now();
    const isPaused = settings?.platformOrdersPaused === true || timedPauseActive;

    if (!settings) {
      res.json({
        ...defaultRestaurantSettings,
        isOpen: true,
        manualIsOpen: true,
        pausedUntil: pausedUntilDate?.toISOString() ?? null,
        isPaused,
      });
      return;
    }

    // /settings is platform-scoped. It must never inherit the first
    // restaurant's schedule/city pause; per-restaurant status comes from
    // /restaurants. Keep isOpen only as the legacy platform projection.
    const effectiveIsOpen = !isPaused;

    res.json({
      isOpen: effectiveIsOpen,
      manualIsOpen: settings.platformOrdersPaused !== true,
      availabilityReason: isPaused ? 'PLATFORM_PAUSED' : effectiveIsOpen ? 'PLATFORM_OPEN' : 'PLATFORM_DISABLED',
      pausedUntil: pausedUntilDate?.toISOString() ?? null,
      isPaused,
      deliveryFee: settings.deliveryFee / 100,
      deliveryFeeOre: settings.deliveryFee,
      deliveryFeeMoney: moneyDto(settings.deliveryFee),
      minOrderAmount: settings.minOrderAmount / 100,
      minOrderAmountOre: settings.minOrderAmount,
      minOrderAmountMoney: moneyDto(settings.minOrderAmount),
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
        const until = s.platformPausedUntil ? new Date(s.platformPausedUntil) : null;
        const timedPauseActive = until !== null && until.getTime() > Date.now();
        if (s.platformOrdersPaused !== true && !timedPauseActive) return null;
        return {
          until: timedPauseActive ? until!.toISOString() : null,
          indefinite: s.platformOrdersPaused === true,
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
      isOpen, deliveryFee, deliveryFeeOre, minOrderAmount, minOrderAmountOre,
      deliveryRadius, estimatedPickupTime, estimatedDeliveryTime,
      notificationSound, openingHours, contactPhone, contactPhoneHours, contactEmail, contactAddress, aboutBody,
      showDiscountedRail, bannerMessage, bannerSeverity, bannerExpiresAt,
      companyName, organizationNumber, companyAddress,
      supportEmail, privacyEmail, noReplyEmail,
      heroTitle, heroSubtitle, heroImageUrl, heroCtaLabel, heroCtaUrl,
      commissionSelfPct, commissionPlatformPct, vatCustomerPct, vatPlatformFeePct,
      tierGoldFee, tierSilverFee, tierStandardFee,
    } = req.body;

    // Lättviktig email-validering — bara om värdet är icke-tomt. Inte
    // RFC-perfekt men fångar typos som "support@viaeats" eller " " i mitten.
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
    if (isOpen !== undefined) {
      // Legacy global toggle is translated to the explicit platform overlay.
      // Keep the old storage flag true so stale watchdog-era values cannot
      // disable the whole marketplace after this migration.
      data.isOpen = true;
      data.platformOrdersPaused = !Boolean(isOpen);
    }
    if (deliveryFeeOre !== undefined) data.deliveryFee = parseOre(deliveryFeeOre, 'deliveryFeeOre');
    else if (deliveryFee !== undefined) data.deliveryFee = sekToOre(Number(deliveryFee), 'deliveryFee');
    if (minOrderAmountOre !== undefined) data.minOrderAmount = parseOre(minOrderAmountOre, 'minOrderAmountOre');
    else if (minOrderAmount !== undefined) data.minOrderAmount = sekToOre(Number(minOrderAmount), 'minOrderAmount');
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

    // --- Plattformsekonomi. Avvisa trasiga formulärvärden i stället för att
    // tyst göra om dem till 0 och skriva över fungerande satser/priser. ---
    if (commissionSelfPct !== undefined) data.commissionSelfPct = parseFinancePercentage(commissionSelfPct, 'Provision för egen leverans');
    if (commissionPlatformPct !== undefined) data.commissionPlatformPct = parseFinancePercentage(commissionPlatformPct, 'Provision för ViaEats-leverans');
    if (vatCustomerPct !== undefined) data.vatCustomerPct = parseFinancePercentage(vatCustomerPct, 'Matmoms');
    if (vatPlatformFeePct !== undefined) data.vatPlatformFeePct = parseFinancePercentage(vatPlatformFeePct, 'Moms på ViaEats-avgifter');
    if (tierGoldFee !== undefined) data.tierGoldFee = parseFinancePriceOre(tierGoldFee, 'Guldpris');
    if (tierSilverFee !== undefined) data.tierSilverFee = parseFinancePriceOre(tierSilverFee, 'Silverpris');
    if (tierStandardFee !== undefined) data.tierStandardFee = parseFinancePriceOre(tierStandardFee, 'Standardpris');

    const settings = await prisma.restaurantSettings.upsert({
      where: { id: 'settings' },
      update: data,
      create: {
        id: 'settings',
        isOpen: true,
        platformOrdersPaused: isOpen !== undefined ? !Boolean(isOpen) : false,
        deliveryFee: deliveryFeeOre !== undefined
          ? parseOre(deliveryFeeOre, 'deliveryFeeOre')
          : deliveryFee !== undefined
            ? sekToOre(Number(deliveryFee), 'deliveryFee')
            : sekToOre(DEFAULT_DELIVERY_FEE, 'defaultDeliveryFee'),
        minOrderAmount: minOrderAmountOre !== undefined
          ? parseOre(minOrderAmountOre, 'minOrderAmountOre')
          : minOrderAmount !== undefined
            ? sekToOre(Number(minOrderAmount), 'minOrderAmount')
            : sekToOre(DEFAULT_MIN_ORDER_AMOUNT, 'defaultMinOrderAmount'),
        deliveryRadius: deliveryRadius ?? DEFAULT_DELIVERY_RADIUS,
        estimatedPickupTime: estimatedPickupTime ?? DEFAULT_ESTIMATED_PICKUP_TIME,
        estimatedDeliveryTime: estimatedDeliveryTime ?? DEFAULT_ESTIMATED_DELIVERY_TIME,
        notificationSound: notificationSound ?? defaultRestaurantSettings.notificationSound,
        phone: req.body.phone,
        openingHours: JSON.stringify(openingHours ?? defaultRestaurantSettings.openingHours),
      },
    });
    bustCache('settings:public', 'global'); // settings change shows immediately

    const returnedTimedPause = settings.platformPausedUntil !== null
      && settings.platformPausedUntil.getTime() > Date.now();
    const publicSettings = {
      isOpen: settings.platformOrdersPaused !== true && !returnedTimedPause,
      deliveryFee: settings.deliveryFee / 100,
      deliveryFeeOre: settings.deliveryFee,
      deliveryFeeMoney: moneyDto(settings.deliveryFee),
      minOrderAmount: settings.minOrderAmount / 100,
      minOrderAmountOre: settings.minOrderAmount,
      minOrderAmountMoney: moneyDto(settings.minOrderAmount),
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
      err instanceof TypeError ||
      err instanceof RangeError ||
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
