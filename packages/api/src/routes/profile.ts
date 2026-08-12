import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';
import supabaseAdmin from '../lib/supabase';
import { deleteSupabaseAuthUser } from '../lib/supabaseUserDelete';
import { hasVerifiedSupabasePhone } from '../lib/customerAuthPolicy';
import { isDealAvailableNow } from '../lib/deals';
import { invalidateCachedCustomerIdentity } from '../lib/customerIdentityCache';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
import { normalizeReferralPhone, referralPhoneVariants } from '../lib/referralRules';
import { calculateOrderVat, normalizeFoodVatPercent } from '../lib/tax';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRetiredFavoriteUserDeal = (deal: any) => {
  const metadata = (deal?.metadata || {}) as any;
  return deal?.type === 'FAVORITE_PRODUCT' || Boolean(metadata.favoriteProductId);
};

// GET /api/profile
// Helper: build a full name from first + last (or fallback to existing).
function joinFullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

function preferProfileValue(primary: unknown, fallback: unknown): string | null {
  const current = typeof primary === 'string' ? primary.trim() : '';
  if (current) return primary as string;
  const inherited = typeof fallback === 'string' ? fallback.trim() : '';
  return inherited ? fallback as string : null;
}

function mergeJsonStringList(primary: unknown, fallback: unknown): string {
  const parse = (value: unknown): string[] => {
    try {
      const parsed = JSON.parse(typeof value === 'string' ? value : '[]');
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  };
  return JSON.stringify(Array.from(new Set([...parse(primary), ...parse(fallback)])));
}

router.get('/', authenticateUser, async (req: any, res: any) => {
  try {
    if (!req.user?.id) {
      console.error('[profile GET] No user.id on request');
      return res.status(401).json({ error: 'Sessionen saknar användar-id' });
    }
    let user;
    try {
      user = await (prisma as any).user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, address: true, city: true, zip: true, isVerified: true, image: true, oauthProvider: true }
      });
    } catch (dbErr: any) {
      console.error('[profile GET] Prisma findUnique failed:', dbErr?.message || dbErr);
      return res.status(500).json({ error: 'DB-fel vid profil-hämtning', detail: dbErr?.message });
    }
    if (!user) {
      console.warn(`[profile GET] User not found in DB for id ${req.user.id} — token refererar till borttagen user`);
      return res.status(404).json({ error: 'Hittades inte', code: 'USER_DELETED' });
    }

    // Auto-migrate legacy users: if firstName/lastName are null but the
    // legacy `name` column has at least two words, split it and persist.
    // This stops the rebuild-then-suddenly-gated regression for accounts
    // created before firstName/lastName columns existed.
    let first = (user.firstName || '').trim();
    let last = (user.lastName || '').trim();
    const trimmedName = (user.name || '').trim();
    const isPlaceholder = trimmedName.toLowerCase() === 'användare';
    if (!first && !last && trimmedName && !isPlaceholder) {
      const parts = trimmedName.split(/\s+/);
      if (parts.length >= 2) {
        const inferredFirst = parts[0];
        const inferredLast = parts.slice(1).join(' ');
        await (prisma as any).user.update({
          where: { id: user.id },
          data: { firstName: inferredFirst, lastName: inferredLast },
        }).catch(() => null);
        user = { ...user, firstName: inferredFirst, lastName: inferredLast };
        first = inferredFirst;
        last = inferredLast;
        console.log(`[profile] auto-migrated legacy name "${trimmedName}" → first="${inferredFirst}" last="${inferredLast}" for user ${user.id}`);
      }
    }

    // OAuth-only users must complete phone linking before they can use the
    // app. Surface the flag so the client can route them to the gate UI.
    const needsPhone = !!user.oauthProvider && (!user.phone || !user.isVerified);
    // profileComplete: true when both first AND last are stored. Lenient
    // back-compat shim: also true if the legacy `name` column has at least
    // two words (covers accounts that never went through the new flow).
    const profileComplete = !!(first && last)
      || (!isPlaceholder && trimmedName.split(/\s+/).filter(Boolean).length >= 2);
    // Legacy compatibility flag — kept so existing call-sites still work.
    // New gates should prefer `profileComplete`.
    const needsName = !profileComplete;
    res.json({
      ...user,
      // Strip the legacy placeholder from the response so no UI ever shows it.
      name: isPlaceholder ? '' : user.name,
      profileComplete,
      needsPhone,
      needsName,
    });
  } catch (error: any) {
    console.error('[profile GET] Unexpected error:', error?.stack || error?.message || error);
    res.status(500).json({ error: 'Serverfel', detail: error?.message });
  }
});

// POST /api/profile/link-phone
// För authenticated user som vill LÄGGA TILL telefon på befintligt
// konto (t.ex. Apple-user som lägger till sitt nummer). Den här
// endpointen SKAPAR ALDRIG en ny user — den uppdaterar bara den
// inloggade användaren. Om phone redan finns på en guest-like user,
// merges den in.
router.post('/link-phone', authenticateUser, async (req: any, res: any) => {
  try {
    const { phone, token: phoneVerificationToken } = req.body as {
      phone?: string;
      token?: string;
    };
    const requestedPhone = normalizeReferralPhone(phone);
    if (!requestedPhone) {
      return res.status(400).json({ error: 'Telefonnummer krävs' });
    }
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Sessionen saknar användar-id' });
    }
    if (!supabaseAdmin || !phoneVerificationToken) {
      return res.status(401).json({
        error: 'Verifiera telefonnumret med SMS först',
        code: 'VERIFIED_PHONE_SESSION_REQUIRED',
      });
    }

    // Account auth and phone ownership are two separate proofs. The platform
    // bearer identifies the OAuth account; this Supabase token proves that the
    // caller just completed SMS OTP for the exact number being linked.
    const { data: { user: verifiedPhoneUser }, error: phoneProofError } =
      await supabaseAdmin.auth.getUser(phoneVerificationToken);
    const verifiedPhone = normalizeReferralPhone(verifiedPhoneUser?.phone);
    if (
      phoneProofError ||
      !verifiedPhoneUser ||
      !hasVerifiedSupabasePhone(verifiedPhoneUser) ||
      !verifiedPhone ||
      verifiedPhone !== requestedPhone
    ) {
      return res.status(401).json({
        error: 'SMS-verifieringen matchar inte telefonnumret',
        code: 'VERIFIED_PHONE_MISMATCH',
      });
    }

    const phoneVariants = (p: string) => referralPhoneVariants(p);

    // Slå ihop ett befintligt konto med samma telefon in i det inloggade kontot
    // (permanent koppling). Telefonen är den gemensamma kundidentiteten, även
    // om källkontot har Google/Apple-identitet.
    // Soft-deletar det gamla (undviker FK-krångel)
    // + flyttar ordrar + frigör Supabase-telefon-användaren.
    const existingWithPhone = await (prisma as any).user.findFirst({
      where: { phone: { in: phoneVariants(requestedPhone) }, deletedAt: null, isActive: true },
    });
    let updated: any;
    if (existingWithPhone && existingWithPhone.id !== req.user.id) {
      updated = await (prisma as any).$transaction(async (tx: any) => {
        const [source, target] = await Promise.all([
          tx.user.findUnique({ where: { id: existingWithPhone.id } }),
          tx.user.findUnique({ where: { id: req.user.id } }),
        ]);
        if (!source || !target || target.deletedAt || target.isActive === false) {
          const conflict: any = new Error('PHONE_ACCOUNT_MERGE_CONFLICT');
          conflict.code = 'PHONE_ACCOUNT_MERGE_CONFLICT';
          throw conflict;
        }

        // Claim and scrub the source row first. updateMany makes concurrent
        // merge attempts serialize on the row and only one transaction wins.
        const claimed = await tx.user.updateMany({
          where: {
            id: source.id,
            deletedAt: null,
            isActive: true,
            phone: { in: phoneVariants(requestedPhone) },
          },
          data: {
            deletedAt: new Date(),
            isActive: false,
            isVerified: false,
            isGuest: false,
            email: null,
            phone: null,
            name: '',
            firstName: null,
            lastName: null,
            address: null,
            city: null,
            zip: null,
            image: null,
            pushToken: null,
            apnsDeviceToken: null,
            oauthProvider: null,
            oauthId: null,
            referralCode: null,
            referredByCode: null,
            claimedDealIds: '[]',
            allergens: '[]',
            deviceFingerprint: null,
            lastSeenIp: null,
            internalInfo: null,
            convertedFromGuestAt: null,
            conversionSource: null,
          },
        });
        if (claimed.count !== 1) {
          const conflict: any = new Error('PHONE_ACCOUNT_MERGE_CONFLICT');
          conflict.code = 'PHONE_ACCOUNT_MERGE_CONFLICT';
          throw conflict;
        }

        const [sourceInviteeReferral, targetInviteeReferral] = await Promise.all([
          tx.referral.findFirst({ where: { inviteeUserId: source.id } }),
          tx.referral.findFirst({ where: { inviteeUserId: req.user.id } }),
        ]);

        const targetHasDefaultAddress = await tx.savedAddress.findFirst({
          where: { userId: target.id, isDefault: true },
          select: { id: true },
        });
        if (targetHasDefaultAddress) {
          await tx.savedAddress.updateMany({
            where: { userId: source.id, isDefault: true },
            data: { isDefault: false },
          });
        }

        await Promise.all([
          tx.order.updateMany({ where: { userId: source.id }, data: { userId: target.id } }),
          tx.userDeal.updateMany({ where: { userId: source.id }, data: { userId: target.id } }),
          tx.savedAddress.updateMany({ where: { userId: source.id }, data: { userId: target.id } }),
          tx.customerDeal.updateMany({ where: { userId: source.id }, data: { userId: target.id } }),
          tx.deviceInstallation.updateMany({ where: { userId: source.id }, data: { userId: target.id } }),
          tx.notificationOutbox.updateMany({
            where: { userId: source.id, status: { in: ['PENDING', 'RETRY', 'PROCESSING'] } },
            data: { userId: target.id },
          }),
          tx.referral.updateMany({ where: { inviterUserId: source.id }, data: { inviterUserId: target.id } }),
        ]);

        if (sourceInviteeReferral && !targetInviteeReferral) {
          await tx.referral.update({
            where: { id: sourceInviteeReferral.id },
            data: { inviteeUserId: target.id },
          });
        } else if (sourceInviteeReferral && targetInviteeReferral) {
          await tx.referral.update({
            where: { id: sourceInviteeReferral.id },
            data: {
              status: 'REVERTED',
              revertedAt: new Date(),
              revertReason: 'Dubblett slogs ihop vid telefonlänkning',
              inviteeUserId: null,
            },
          });
        }

        // Target values win. Empty profile/referral fields inherit safe data
        // from the phone account; contact email never does because it was not
        // itself an authentication proof.
        return tx.user.update({
          where: { id: target.id },
          data: {
            phone: requestedPhone,
            isVerified: true,
            isGuest: false,
            name: preferProfileValue(target.name, source.name) || '',
            firstName: preferProfileValue(target.firstName, source.firstName),
            lastName: preferProfileValue(target.lastName, source.lastName),
            address: preferProfileValue(target.address, source.address),
            city: preferProfileValue(target.city, source.city),
            zip: preferProfileValue(target.zip, source.zip),
            image: preferProfileValue(target.image, source.image),
            pushToken: preferProfileValue(target.pushToken, source.pushToken),
            apnsDeviceToken: preferProfileValue(target.apnsDeviceToken, source.apnsDeviceToken),
            internalInfo: preferProfileValue(target.internalInfo, source.internalInfo),
            referralCode: target.referralCode || source.referralCode || null,
            referredByCode: target.referredByCode || source.referredByCode || null,
            deviceFingerprint: target.deviceFingerprint || source.deviceFingerprint || null,
            lastSeenIp: target.lastSeenIp || source.lastSeenIp || null,
            convertedFromGuestAt: target.convertedFromGuestAt || source.convertedFromGuestAt || null,
            conversionSource: target.conversionSource || source.conversionSource || null,
            claimedDealIds: mergeJsonStringList(target.claimedDealIds, source.claimedDealIds),
            allergens: mergeJsonStringList(target.allergens, source.allergens),
          },
          select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, isVerified: true, image: true, oauthProvider: true },
        });
      });
      invalidateCachedCustomerIdentity(existingWithPhone.id);
      invalidateCachedCustomerIdentity(req.user.id);
      try {
        if (supabaseAdmin && UUID_RE.test(existingWithPhone.id)) {
          await supabaseAdmin.auth.admin.deleteUser(existingWithPhone.id);
        }
      } catch (e: any) { console.error('[link-phone] supabase cleanup:', e?.message); }
      console.log(`[link-phone] merged account ${existingWithPhone.id} into ${req.user.id}`);
    } else {
      updated = await (prisma as any).user.update({
        where: { id: req.user.id },
        data: { phone: requestedPhone, isVerified: true },
        select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, isVerified: true, image: true, oauthProvider: true },
      });
      invalidateCachedCustomerIdentity(req.user.id);
    }

    res.json({ user: updated });
  } catch (error: any) {
    console.error('[link-phone] error:', error?.stack || error?.message || error);
    if (['PHONE_ACCOUNT_MERGE_CONFLICT', 'P2002', 'P2003', 'P2025'].includes(error?.code)) {
      return res.status(409).json({
        error: 'Kontot kunde inte slås ihop säkert. Försök igen eller kontakta support.',
        code: 'PHONE_ACCOUNT_MERGE_CONFLICT',
      });
    }
    res.status(500).json({
      error: 'Kunde inte koppla telefonnumret',
      ...(process.env.NODE_ENV !== 'production' ? { detail: error?.message } : {}),
    });
  }
});

// POST /api/profile/change-phone
// Säker nummerändring: kräver en färsk SMS-session för både nuvarande och nytt
// nummer. Det gör telefonnumret till enda kundnyckel utan Google/Apple-kopplingar.
router.post('/change-phone', authenticateUser, async (req: any, res: any) => {
  try {
    const {
      oldPhone,
      oldVerificationToken,
      newPhone,
      newVerificationToken,
    } = req.body as {
      oldPhone?: string;
      oldVerificationToken?: string;
      newPhone?: string;
      newVerificationToken?: string;
    };
    const requestedOldPhone = normalizeReferralPhone(oldPhone);
    const requestedNewPhone = normalizeReferralPhone(newPhone);
    if (!requestedOldPhone || !requestedNewPhone) {
      return res.status(400).json({ error: 'Telefonnummer krävs' });
    }
    if (requestedOldPhone === requestedNewPhone) {
      return res.status(400).json({ error: 'Det nya numret är samma som det gamla' });
    }
    if (!supabaseAdmin || !oldVerificationToken || !newVerificationToken) {
      return res.status(401).json({
        error: 'Verifiera båda numren med SMS först',
        code: 'VERIFIED_PHONE_SESSIONS_REQUIRED',
      });
    }

    const account = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { id: true, phone: true, firstName: true, lastName: true, name: true, email: true, image: true, isVerified: true },
    });
    const currentPhone = normalizeReferralPhone(account?.phone);
    if (!account || !currentPhone || currentPhone !== requestedOldPhone) {
      return res.status(409).json({ error: 'Det gamla numret matchar inte din profil' });
    }

    const verifyPhoneProof = async (token: string, expectedPhone: string) => {
      const { data: { user: verifiedUser }, error } = await supabaseAdmin!.auth.getUser(token);
      const verifiedPhone = normalizeReferralPhone(verifiedUser?.phone);
      return !error &&
        verifiedUser &&
        hasVerifiedSupabasePhone(verifiedUser) &&
        verifiedPhone === expectedPhone;
    };

    if (!await verifyPhoneProof(oldVerificationToken, requestedOldPhone)) {
      return res.status(401).json({
        error: 'SMS-koden för gamla numret kunde inte verifieras',
        code: 'OLD_PHONE_VERIFICATION_FAILED',
      });
    }
    if (!await verifyPhoneProof(newVerificationToken, requestedNewPhone)) {
      return res.status(401).json({
        error: 'SMS-koden för nya numret kunde inte verifieras',
        code: 'NEW_PHONE_VERIFICATION_FAILED',
      });
    }

    const existingWithNewPhone = await (prisma as any).user.findFirst({
      where: {
        id: { not: req.user.id },
        phone: { in: referralPhoneVariants(requestedNewPhone) },
        deletedAt: null,
      },
      select: { id: true, isGuest: true, isActive: true },
    });
    if (existingWithNewPhone && (!existingWithNewPhone.isGuest || existingWithNewPhone.isActive === false)) {
      return res.status(409).json({
        error: 'Det nya numret används redan. Kontakta support om det är ditt nummer.',
        code: 'PHONE_ALREADY_IN_USE',
      });
    }

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      if (existingWithNewPhone?.isGuest) {
        await Promise.all([
          tx.order.updateMany({ where: { userId: existingWithNewPhone.id }, data: { userId: req.user.id } }),
          tx.userDeal.updateMany({ where: { userId: existingWithNewPhone.id }, data: { userId: req.user.id } }),
          tx.customerDeal.updateMany({ where: { userId: existingWithNewPhone.id }, data: { userId: req.user.id } }),
          tx.savedAddress.updateMany({ where: { userId: existingWithNewPhone.id }, data: { userId: req.user.id } }),
        ]);
        await tx.user.update({
          where: { id: existingWithNewPhone.id },
          data: {
            phone: null,
            isActive: false,
            isGuest: false,
            isVerified: false,
            deletedAt: new Date(),
            name: '',
            firstName: null,
            lastName: null,
          },
        });
      }

      return tx.user.update({
        where: { id: req.user.id },
        data: {
          phone: requestedNewPhone,
          isVerified: true,
          isGuest: false,
        },
        select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, isVerified: true, image: true },
      });
    });

    invalidateCachedCustomerIdentity(req.user.id);
    if (existingWithNewPhone?.id) invalidateCachedCustomerIdentity(existingWithNewPhone.id);

    const first = (updated.firstName || '').trim();
    const last = (updated.lastName || '').trim();
    const profileComplete = Boolean(first && last);
    return res.json({
      user: {
        ...updated,
        needsPhone: false,
        needsName: !profileComplete,
        profileComplete,
      },
    });
  } catch (error: any) {
    console.error('[change-phone] error:', error?.stack || error?.message || error);
    if (['P2002', 'P2003', 'P2025'].includes(error?.code)) {
      return res.status(409).json({
        error: 'Numret kunde inte bytas säkert. Försök igen eller kontakta support.',
        code: 'PHONE_CHANGE_CONFLICT',
      });
    }
    return res.status(500).json({
      error: 'Kunde inte byta nummer',
      ...(process.env.NODE_ENV !== 'production' ? { detail: error?.message } : {}),
    });
  }
});

// GET /api/profile/orders
// Konverterar öre → kr på alla penning-fält INNAN respons så att frontend
// (profile + orders-sidor) kan rendera direkt utan `/100`. Tidigare returnerades
// raw Prisma-rader → 350 kr-order visades som "35000 kr" i UI:t.
router.get('/orders', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { phone: true },
    });
    const phone = (user?.phone || '').trim();
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneVariants = phone
      ? Array.from(new Set([
          phone,
          phone.startsWith('+') ? phone.slice(1) : `+${phoneDigits}`,
          phoneDigits,
        ].filter(Boolean)))
      : [];
    const orders = await prisma.order.findMany({
      // OBS: filtrera INTE bort CANCELLED/REJECTED här. Home-skärmen läser samma
      // endpoint för att kunna visa "Avbruten"-kortet för en nyligen avvisad
      // order. Orderhistoriken döljer avbrutna client-side (OrdersListScreen).
      // AWAITING_PAYMENT filtreras däremot bort här: en obetald order är inget
      // köp, och den ska inte kunna nå någon klients historik eller kvitto.
      where: {
        status: { not: 'AWAITING_PAYMENT' },
        OR: [
          { userId: req.user.id },
          ...(phoneVariants.length ? [{ customerPhone: { in: phoneVariants } }] : []),
        ],
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            address: true,
            zip: true,
            city: true,
            phone: true,
            legalName: true,
            organizationNumber: true,
            vatPercent: true,
            selfDelivery: true,
          },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    const serialized = orders.map((o: any) => {
      const vatSummary = calculateOrderVat(o);
      return {
        ...o,
        total: (o.total ?? 0) / 100,
        deliveryFee: (o.deliveryFee ?? 0) / 100,
        discountAmount: (o.discountAmount ?? 0) / 100,
        foodDiscountAmount: (o.foodDiscountAmount ?? 0) / 100,
        deliveryDiscountAmount: (o.deliveryDiscountAmount ?? 0) / 100,
        smallOrderFee: (o.smallOrderFee ?? 0) / 100,
        tipAmount: (o.tipAmount ?? 0) / 100,
        vatAmount: vatSummary.totalVatOre / 100,
        vatBreakdown: vatSummary.breakdown.map((row) => ({
          rate: row.rate,
          gross: row.grossOre / 100,
          vat: row.vatOre / 100,
        })),
        restaurant: o.restaurant ? {
          ...o.restaurant,
          vatPercent: normalizeFoodVatPercent(o.foodVatPercent ?? o.restaurant.vatPercent, 6),
        } : null,
        items: (o.items || []).map((it: any) => ({
          ...it,
          basePrice: (it.basePrice ?? 0) / 100,
          subtotal: (it.subtotal ?? 0) / 100,
          selectedExtras: typeof it.selectedExtras === 'string' ? JSON.parse(it.selectedExtras || '[]') : (it.selectedExtras || []),
        })),
        // accessToken läcker inte i klient-svar (servern verifierar mot DB)
        accessToken: undefined,
      };
    });
    res.json(serialized);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  zip: z.string().max(10).optional(),
});

// PATCH /api/profile
router.patch('/', authenticateUser, async (req: any, res: any) => {
  try {
    const data = profileUpdateSchema.parse(req.body);

    // Check email uniqueness if changing
    if (data.email) {
      const existing = await (prisma as any).user.findFirst({
        where: { email: data.email, id: { not: req.user.id } }
      });
      if (existing) {
        return res.status(400).json({ error: 'E-postadressen används redan' });
      }
    }

    // STRICT RULE (Apple Sign-In persistence): never overwrite firstName /
    // lastName / name with empty values. Trim incoming values and drop the
    // field entirely if blank — keeps whatever the DB already has.
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if ((k === 'firstName' || k === 'lastName' || k === 'name') && typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) continue;
        update[k] = trimmed;
      } else {
        update[k] = v;
      }
    }

    // If firstName/lastName were sent and `name` wasn't, synthesise `name`
    // from the resulting first+last (post-merge with whatever's in the DB)
    // so the legacy column stays in sync.
    if ((update.firstName !== undefined || update.lastName !== undefined) && update.name === undefined) {
      const existing = await (prisma as any).user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true },
      });
      const nextFirst = update.firstName ?? existing?.firstName ?? '';
      const nextLast = update.lastName ?? existing?.lastName ?? '';
      const joined = joinFullName(nextFirst, nextLast);
      if (joined) update.name = joined;
    }

    if (Object.keys(update).length > 0) {
      await (prisma as any).user.update({
        where: { id: req.user.id },
        data: update,
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Ogiltiga uppgifter', details: error.errors });
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/profile/deals - Fetch current user's deals
router.get('/deals', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { phone: true }
    });

    if (!user?.phone) return res.json([]);

    const [allDeals, appUserDeals] = await Promise.all([
      (prisma as any).customerDeal.findMany({
        where: {
          OR: [
            { userId: req.user.id },
            { phone: user.phone }
          ],
          isUsed: false,
          campaign: {
            isActive: true,
            OR: [
              { validUntil: null },
              { validUntil: { gte: new Date() } }
            ]
          }
        },
        include: { campaign: true }
      }),
      (prisma as any).userDeal.findMany({
        where: {
          userId: req.user.id,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Application-level filter: only return deals where usageCount < maxUsages
    const activDeals = allDeals.filter((d: any) => d.usageCount < (d.maxUsages || 1));

    // NOTE: Client expects kr. Some older rows may have been stored in kr instead of öre.
    const formatted = activDeals.map((deal: any) => {
      const campaign = deal.campaign;
      const discountType = campaign?.discountType;
      const discountValueRaw = campaign?.discountValue ?? 0;
      const minOrderOre = normalizeMoneyToOre(campaign?.minOrder ?? 0);
      const fixedDiscountOre = normalizeMoneyToOre(discountValueRaw);

      return {
        ...deal,
        campaign: campaign
          ? {
              ...campaign,
              // FIXED discountValue is stored in öre; PERCENTAGE is stored as percent.
              discountValue: discountType === 'FIXED' ? fixedDiscountOre / 100 : discountValueRaw,
              minOrder: minOrderOre / 100,
            }
          : campaign,
      };
    });

    const referralIds = appUserDeals
      .map((deal: any) => (deal.metadata as any)?.referralId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
    const referralRows = referralIds.length
      ? await (prisma as any).referral.findMany({
          where: { id: { in: [...new Set(referralIds)] } },
          select: { id: true, shareCode: true },
        })
      : [];
    const referralShareCodeById = new Map<string, string>(
      referralRows.map((row: any) => [row.id, row.shareCode]),
    );

    const retiredFavoriteIds: string[] = [];
    const formattedAppDeals = appUserDeals.filter((deal: any) => {
      if (isRetiredFavoriteUserDeal(deal)) {
        retiredFavoriteIds.push(deal.id);
        return false;
      }
      return true;
    }).map((deal: any) => {
      const metadata = (deal.metadata || {}) as any;
      const minOrderKr = Math.max(0, Number(metadata.minOrderKr || 0));
      const title = metadata.title || (
        deal.type === 'WELCOME'
          ? 'Välkomsterbjudande'
          : deal.type === 'REFERRAL_INVITEE'
            ? 'Värvningsrabatt'
            : deal.type === 'REFERRAL_INVITER'
              ? 'Värvningsbelöning'
              : 'Personlig deal'
      );
      // Percentage/fixed value and free delivery are orthogonal. A 20% deal
      // with freeDelivery must never be serialized as FREE_DELIVERY + 0 kr.
      const discountType = deal.discountPercent
        ? 'PERCENTAGE'
        : deal.amountKr
          ? 'FIXED'
          : 'FREE_DELIVERY';
      const discountValue = deal.discountPercent
        ? Number(deal.discountPercent || 0)
        : Number(deal.amountKr || 0);
      const referralShareCode = deal.type === 'REFERRAL_INVITEE'
        ? referralShareCodeById.get(metadata.referralId) || null
        : null;
      return {
        id: deal.id,
        userDealId: deal.id,
        // The invited customer entered the friend's referral code. Show that
        // same recognizable code instead of the internal generated UserDeal
        // redemption code. Other personal rewards keep their own code.
        code: referralShareCode || deal.code || null,
        type: deal.type,
        source: 'APP_DEAL',
        status: deal.status,
        expiresAt: deal.expiresAt,
        amountKr: Number(deal.amountKr || 0),
        discountPercent: deal.discountPercent,
        freeDelivery: !!deal.freeDelivery,
        minOrderKr,
        campaign: {
          id: deal.dealId || deal.id,
          title,
          name: title,
          description: metadata.description || null,
          discountType,
          discountValue,
          minOrder: minOrderKr,
          freeDelivery: !!deal.freeDelivery,
        },
      };
    });

    if (retiredFavoriteIds.length) {
      (prisma as any).userDeal.updateMany({
        where: { id: { in: retiredFavoriteIds }, status: { in: ['ACTIVE', 'RESERVED'] } },
        data: { status: 'EXPIRED' },
      }).catch(() => null);
    }

    res.json([...formattedAppDeals, ...formatted]);
  } catch (error) {
    console.error('Fetch deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta erbjudanden' });
  }
});

// ─── Saved Addresses ────────────────────────────────────────────────────────

// GET /api/profile/addresses
router.get('/addresses', authenticateUser, async (req: any, res: any) => {
  try {
    const addresses = await (prisma as any).savedAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta adresser' });
  }
});

// POST /api/profile/addresses
router.post('/addresses', authenticateUser, async (req: any, res: any) => {
  try {
    const { label, street, city, zip, note, isDefault } = req.body;
    if (!street || !city || !zip) {
      return res.status(400).json({ error: 'Adress, stad och postnummer krävs' });
    }
    if (isDefault) {
      await (prisma as any).savedAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }
    const address = await (prisma as any).savedAddress.create({
      data: { userId: req.user.id, label: label || 'Hem', street, city, zip, note, isDefault: isDefault || false }
    });
    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte spara adress' });
  }
});

// PATCH /api/profile/addresses/:id
router.patch('/addresses/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const { label, street, city, zip, note, isDefault } = req.body;
    const existing = await (prisma as any).savedAddress.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Adress hittades inte' });
    if (isDefault) {
      await (prisma as any).savedAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }
    const updated = await (prisma as any).savedAddress.update({
      where: { id: req.params.id },
      data: { label, street, city, zip, note, isDefault }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera adress' });
  }
});

// DELETE /api/profile/addresses/:id
router.delete('/addresses/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const existing = await (prisma as any).savedAddress.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Adress hittades inte' });
    await (prisma as any).savedAddress.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte radera adress' });
  }
});

// ─── Reviews & Ratings ──────────────────────────────────────────────────────

// GET /api/profile/claimed-deals
// Returnerar tre buckets för Profile-sidan:
//   - claimed: deals användaren redan klämt via popup
//   - available: aktiva popup-deals som ÄNNU INTE claimats (visas som
//     banners i Profile med "Claim"-knapp så man kan spara senare om man
//     missade popupen vid app-öppning)
//   - global: aktiva isGlobal-deals som alltid är tillgängliga
router.get('/claimed-deals', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { claimedDealIds: true, phone: true },
    });
    if (!user) return res.json({ claimed: [], available: [], global: [] });

    let claimedIds: string[] = [];
    try {
      const parsed = JSON.parse(user.claimedDealIds || '[]');
      if (Array.isArray(parsed)) claimedIds = parsed.filter((id: unknown): id is string => typeof id === 'string');
    } catch { /* tolerate bad JSON */ }

    const now = new Date();
    const [claimed, popupCandidates, global] = await Promise.all([
      claimedIds.length > 0
        ? prisma.deal.findMany({
            where: {
              id: { in: claimedIds },
              isActive: true,
              isPersonalTemplate: false,
              isTemplate: false,
              OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            },
          })
        : Promise.resolve([]),
      // Aktiva popup-deals (har popup-content + popupEnabled). Vi
      // filtrerar bort claimade i koden nedan.
      prisma.deal.findMany({
        where: {
          isActive: true,
          isPersonalTemplate: false,
          isTemplate: false,
          popupEnabled: true,
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
          NOT: { popupHeadline: null },
        },
      }),
      prisma.deal.findMany({
        where: {
          isGlobal: true,
          isActive: true,
          isPersonalTemplate: false,
          isTemplate: false,
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
      }),
    ]);

    const claimedSet = new Set(claimedIds);
    const visibleClaimed = claimed.filter((deal) => isDealAvailableNow(deal, now));
    const visibleGlobal = global.filter((deal) => isDealAvailableNow(deal, now));
    const globalSet = new Set(visibleGlobal.map((deal) => deal.id));
    // Available = popup-deals som inte redan finns i claimed eller global
    // (annars dyker de upp dubbelt i Profile-listan).
    const available = popupCandidates.filter(
      (deal) =>
        isDealAvailableNow(deal, now) &&
        !claimedSet.has(deal.id) &&
        !globalSet.has(deal.id),
    );

    const formatDeal = (deal: any) => ({
      id: deal.id,
      title: deal.title,
      description: deal.description,
      badgeText: deal.badgeText,
      imageUrl: deal.imageUrl,
      popupHeadline: deal.popupHeadline,
      popupBody: deal.popupBody,
      popupCtaLabel: deal.popupCtaLabel,
      popupCode: deal.popupCode,
      discountType: deal.discountType,
      discountValue: deal.discountType === 'FIXED' || deal.discountType === 'FIXED_PRICE'
        ? deal.discountValue / 100
        : deal.discountValue,
      minOrder: deal.minOrder / 100,
      validUntil: deal.validUntil,
      restaurantId: deal.restaurantId,
      isGlobal: deal.isGlobal,
    });

    res.json({
      claimed: visibleClaimed.map(formatDeal),
      available: available.map(formatDeal),
      global: visibleGlobal.map(formatDeal),
    });
  } catch (error) {
    console.error('Get claimed-deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta erbjudanden' });
  }
});

// POST /api/profile/deals/:dealId/claim
// Användaren klickar "Spara erbjudandet" i popup → vi lägger Deal.id i
// User.claimedDealIds (JSON-array). Idempotent — duplikat ignoreras.
// GET /api/profile/deals returnerar både globala och claimade.
router.post('/deals/:dealId/claim', authenticateUser, async (req: any, res: any) => {
  try {
    const dealId = req.params.dealId;
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        isActive: true,
        popupEnabled: true,
        isPersonalTemplate: true,
        isTemplate: true,
        validFrom: true,
        validUntil: true,
        maxUsages: true,
        usageCount: true,
      },
    });
    if (!deal || !deal.popupEnabled || deal.isPersonalTemplate || deal.isTemplate) {
      return res.status(404).json({ error: 'Erbjudandet hittades inte' });
    }
    if (!isDealAvailableNow(deal)) {
      return res.status(400).json({ error: 'Erbjudandet är inte aktivt' });
    }

    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { claimedDealIds: true },
    });
    if (!user) return res.status(404).json({ error: 'Användare hittades inte' });

    let claimed: string[] = [];
    try {
      const parsed = JSON.parse(user.claimedDealIds || '[]');
      if (Array.isArray(parsed)) claimed = parsed.filter((id: unknown): id is string => typeof id === 'string');
    } catch { claimed = []; }

    if (!claimed.includes(dealId)) {
      claimed.push(dealId);
      await (prisma as any).user.update({
        where: { id: req.user.id },
        data: { claimedDealIds: JSON.stringify(claimed) },
      });
    }

    res.json({ success: true, claimedDealIds: claimed });
  } catch (error) {
    console.error('Claim deal error:', error);
    res.status(500).json({ error: 'Kunde inte spara erbjudandet' });
  }
});

// POST /api/profile/orders/:id/review
router.post('/orders/:id/review', authenticateUser, async (req: any, res: any) => {
  try {
    const { rating, review, likedItemIds } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Betyg måste vara mellan 1-5' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: { select: { productId: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });
    if (!['DELIVERED', 'READY', 'COMPLETED'].includes(order.status)) {
      return res.status(400).json({ error: 'Du kan bara betygsätta levererade ordrar' });
    }
    if (order.rating) {
      return res.status(400).json({ error: 'Du har redan betygsatt denna order' });
    }

    // Validera likedItemIds — bara productIds som faktiskt fanns i ordern.
    const validProductIds = new Set(order.items.map((i: any) => i.productId));
    const cleanLikedIds = Array.isArray(likedItemIds)
      ? likedItemIds.filter((id: unknown): id is string => typeof id === 'string' && validProductIds.has(id))
      : [];

    const reviewClaim = await prisma.order.updateMany({
      where: { id: req.params.id, rating: null },
      data: {
        rating,
        review: review || null,
        reviewedAt: new Date(),
        likedItemIds: JSON.stringify(cleanLikedIds),
      } as any,
    });
    if (reviewClaim.count === 0) {
      return res.status(409).json({ error: 'Du har redan betygsatt denna order', alreadyReviewed: true });
    }

    // Update restaurant average rating from real data
    if (order.restaurantId) {
      const stats = await prisma.order.aggregate({
        where: { restaurantId: order.restaurantId, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true }
      });
      if (stats._avg.rating != null) {
        await prisma.restaurant.update({
          where: { id: order.restaurantId },
          data: { rating: Math.round(stats._avg.rating * 10) / 10, ratingCount: stats._count.rating }
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Kunde inte spara recension' });
  }
});

// ─── Reorder ────────────────────────────────────────────────────────────────

// GET /api/profile/orders/:id/reorder
router.get('/orders/:id/reorder', authenticateUser, async (req: any, res: any) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        items: true,
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
            isOpen: true,
            openingHours: true,
            scheduledOpenNow: true,
            acceptingOrdersMode: true,
            acceptingOrdersOverrideUntil: true,
            acceptingOrdersOverrideReason: true,
            pausedUntil: true,
            draft: true,
            comingSoon: true,
            city_relation: true,
          },
        },
      }
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });

    const productIds = order.items.map((i: any) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: {
        extraGroups: { include: { extraGroup: { include: { extras: { where: { isActive: true } } } } } }
      }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const cartItems = order.items.map((item: any) => {
      const product = productMap.get(item.productId);
      if (!product) return null;
      const savedExtras = typeof item.selectedExtras === 'string' ? JSON.parse(item.selectedExtras) : (item.selectedExtras || []);
      const validExtras = savedExtras.filter((ex: any) =>
        product.extraGroups.some((peg: any) => peg.extraGroup.extras.some((e: any) => e.id === ex.extraId))
      );
      return {
        productId: product.id,
        name: product.name,
        price: product.price / 100,
        quantity: item.quantity,
        restaurantId: order.restaurantId,
        extras: validExtras.map((ex: any) => ({
          groupId: ex.groupId, groupName: ex.groupName, extraId: ex.extraId, name: ex.extraName, price: ex.priceAddon || 0,
        })),
        note: item.note
      };
    }).filter(Boolean);

    const unavailable = order.items.filter((i: any) => !productMap.has(i.productId)).map((i: any) => i.productName);
    const platformSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    const availability = order.restaurant
      ? resolveRestaurantAvailability(order.restaurant, {
          city: order.restaurant.city_relation,
          platform: platformSettings,
        })
      : null;

    res.json({
      restaurantId: order.restaurantId,
      restaurantSlug: (order as any).restaurant?.slug,
      restaurantName: (order as any).restaurant?.name,
      isOpen: availability?.isOpen ?? false,
      scheduledOpenNow: availability?.scheduledOpenNow ?? false,
      acceptingOrdersMode: availability?.configuredMode ?? 'SCHEDULED',
      availabilityReason: availability?.reason ?? 'OUTSIDE_OPENING_HOURS',
      items: cartItems,
      unavailableItems: unavailable,
      originalOrderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ error: 'Kunde inte förbereda ombeställning' });
  }
});

// GET /api/profile/previously-ordered/:restaurantId
// Returnerar den senaste ordern (med items) från just den restaurangen så att en användare
// kan återbeställa direkt från restaurangsidan.
router.get('/previously-ordered/:restaurantId', authenticateUser, async (req: any, res: any) => {
  try {
    const { restaurantId } = req.params;
    const lastOrder = await prisma.order.findFirst({
      where: {
        userId: req.user.id,
        restaurantId,
        status: { in: ['DELIVERED', 'READY', 'COMPLETED', 'PICKED_UP', 'DELIVERING'] },
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastOrder) return res.json({ hasHistory: false });
    res.json({
      hasHistory: true,
      orderId: lastOrder.id,
      orderNumber: lastOrder.orderNumber,
      createdAt: lastOrder.createdAt,
      itemCount: lastOrder.items.reduce((sum: number, it: any) => sum + it.quantity, 0),
      total: lastOrder.total / 100,
      items: lastOrder.items.map((it: any) => ({
        productId: it.productId,
        name: it.productName,
        quantity: it.quantity,
      })),
    });
  } catch (error) {
    console.error('Previously ordered error:', error);
    res.status(500).json({ error: 'Kunde inte hämta tidigare beställning' });
  }
});

// DELETE /api/profile - GDPR: Delete account
// DELETE /api/profile — kundens egen kontoradering (App Store-krav). Vi HÅRD-
// raderar inte User-raden: dels kraschar det på FK-relationer (Referral/UserDeal),
// dels är kundens Supabase-JWT kvar giltig så authenticateUser
// skulle tyst återskapa raden vid nästa anrop (samma anti-mönster som beskrivs i
// customers.ts admin-radering). Istället: koppla loss orders (affärspost som ska
// sparas) och soft-delete + scrubba all PII. Auth-middleware avvisar deletedAt-
// konton med 401, klienten rensar sin token. Supabase tas bort först efter att
// den lokala transaktionen har lyckats.
router.delete('/', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    // Hämta identifierare innan scrub så Supabase-cascade kan frigöra
    // nummer/e-post/OAuth (annars blockerar de framtida signup).
    const before = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, oauthId: true },
    });
    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // Koppla loss orders (affärspost) från kunden istället för att radera dem.
      await tx.order.updateMany({
        where: { userId },
        data: { userId: null },
      });

      // Sparade adresser är ren kund-PII och ska inte ligga kvar efter
      // anonymisering.
      await tx.savedAddress.deleteMany({ where: { userId } });

      // Revokera varje installation INNAN användaren anonymiseras. En redan
      // köad worker får då varken dekryptera eller retrya en gammal device-token
      // efter kontoradering.
      await tx.deviceInstallation.updateMany({
        where: { userId },
        data: {
          active: false,
          revokedAt: deletedAt,
          tokenHash: null,
          tokenCiphertext: null,
          revokedReason: 'account_deleted',
        },
      });

      // Soft-delete + scrubba identifierande fält. Nulla unika slots
      // (email/phone/oauth/referralCode) så framtida signup inte blockeras.
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt,
          email: null,
          phone: null,
          name: '',
          firstName: null,
          lastName: null,
          address: null,
          city: null,
          zip: null,
          image: null,
          pushToken: null,
          apnsDeviceToken: null,
          oauthProvider: null,
          oauthId: null,
          referralCode: null,
          referredByCode: null,
          isVerified: false,
          claimedDealIds: '[]',
          deviceFingerprint: null,
          lastSeenIp: null,
          internalInfo: null,
          allergens: '[]',
          convertedFromGuestAt: null,
          conversionSource: null,
        },
      });
    });

    // authenticateUser caches a resolved identity for 30 seconds. Revoke it
    // synchronously so the token used for this DELETE cannot make one more
    // successful request after the tombstone commits.
    invalidateCachedCustomerIdentity(userId);

    // Auth-kontot tas bort efter den atomiska lokala anonymiseringen. Om den
    // externa tjänsten tillfälligt misslyckas är det lokala kontot ändå spärrat.
    if (before) await deleteSupabaseAuthUser(before);

    res.json({
      success: true,
      message: 'Ditt konto har raderats. Orderunderlag som måste bevaras har kopplats loss från kontot.',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Kunde inte radera kontot. Kontakta support om problemet kvarstår.' });
  }
});

export default router;
