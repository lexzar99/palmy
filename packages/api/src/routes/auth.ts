import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import twilio from 'twilio';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import { getRestaurantAdminLogin, normalizeAdminLoginAlias } from '../lib/adminLogin';
import supabaseAdmin from '../lib/supabase';
import { resolveAdminSessionFromToken } from '../middleware/auth';

const router = Router();
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_MESSAGING_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

// Always store/compare phone in E.164 format (+46...). Handles legacy records without +.
function normalizePhone(phone: string): string {
  const t = phone.trim();
  if (t.startsWith('+')) return t;
  return `+${t.replace(/\D/g, '')}`;
}

// Returns all variants of a phone to search across legacy and normalized formats.
function phoneVariants(phone: string): string[] {
  const n = normalizePhone(phone);
  return [n, n.slice(1)]; // e.g. ["+46728357970", "46728357970"]
}

async function resolveAdminByIdentifier(loginId: string) {
  const directAdmin = await prisma.adminUser.findFirst({
    where: { email: loginId, isActive: true },
  });

  if (directAdmin) {
    return directAdmin;
  }

  const normalizedLoginId = normalizeAdminLoginAlias(loginId);
  if (!normalizedLoginId) {
    return null;
  }

  const restaurants = await prisma.restaurant.findMany({
    select: { slug: true, name: true, adminEmail: true },
  });

  const matchedRestaurant = restaurants.find((restaurant) => {
    const normalizedSlug = normalizeAdminLoginAlias(restaurant.slug || '');
    const normalizedName = normalizeAdminLoginAlias(restaurant.name || '');
    const normalizedAdminEmail = normalizeAdminLoginAlias(
      restaurant.adminEmail || ''
    );

    if (
      normalizedLoginId === normalizedSlug ||
      normalizedLoginId === normalizedName ||
      normalizedLoginId === normalizedAdminEmail
    ) {
      return true;
    }

    if (normalizedName.length > 0) {
      return normalizedLoginId === `${normalizedName} admin`;
    }

    return false;
  });

  if (!matchedRestaurant) {
    return null;
  }

  const primaryLogin = getRestaurantAdminLogin(matchedRestaurant);
  const primaryAdmin = await prisma.adminUser.findFirst({
    where: { email: primaryLogin, isActive: true },
  });

  if (primaryAdmin) {
    return primaryAdmin;
  }

  if (matchedRestaurant.slug.toLowerCase() === primaryLogin) {
    return null;
  }

  return prisma.adminUser.findFirst({
    where: { email: matchedRestaurant.slug.toLowerCase(), isActive: true },
  });
}

/**
 * Unified auth middleware — verifies Supabase JWTs (primary) with a
 * fallback to the legacy custom JWT for a smooth transition period.
 */
// Routes that an OAuth-only user (Google/Apple but no phone yet) must still
// be allowed to hit so they can complete the phone-linking flow. Anything
// outside this list is blocked by `requireVerifiedPhone` until they link.
const PHONE_LINKING_ALLOWED_PATHS = new Set<string>([
  '/api/profile',
  '/api/auth/me',
  '/api/auth/lookup-phone',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/link-phone',
]);

export const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Logga in först' });
  }
  const token = authHeader.split(' ')[1];

  // ── 1. Try Supabase JWT ───────────────────────────────────────────────────
  if (supabaseAdmin) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user) {
        const normalizedPhone = user.phone ? normalizePhone(user.phone) : null;

        // Check if a local user already exists with this phone under a different ID.
        // This happens when the same person used an older auth path that stored the phone
        // without the + prefix, or registered via a different provider first.
        let existingByPhone: any = null;
        if (normalizedPhone) {
          existingByPhone = await (prisma as any).user.findFirst({
            where: {
              id: { not: user.id },
              phone: { in: phoneVariants(normalizedPhone) },
            },
          }).catch(() => null);
        }

        if (existingByPhone) {
          // Merge: keep the richer existing record, normalise phone and mark verified.
          await (prisma as any).user.update({
            where: { id: existingByPhone.id },
            data: {
              phone: normalizedPhone,
              isVerified: true,
              email: user.email || existingByPhone.email || undefined,
              name: user.user_metadata?.name || user.user_metadata?.full_name || existingByPhone.name || undefined,
              image: user.user_metadata?.avatar_url || user.user_metadata?.picture || existingByPhone.image || undefined,
            },
          }).catch(() => null);
          req.user = { id: existingByPhone.id, email: existingByPhone.email, phone: normalizedPhone, role: 'USER' };
          return next();
        }

        // Normal path — upsert by Supabase UUID. Don't overwrite an existing
        // real name with the "Användare" placeholder if Supabase metadata
        // happens to be empty on a refresh (Apple, in particular, only ships
        // fullName on the first sign-in).
        const sbName = user.user_metadata?.name || user.user_metadata?.full_name || null;
        const sbImage = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
        await (prisma as any).user.upsert({
          where: { id: user.id },
          update: {
            email: user.email || undefined,
            name: sbName || undefined,
            image: sbImage || undefined,
            phone: normalizedPhone || undefined,
            isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at || undefined,
            oauthProvider: user.app_metadata?.provider || undefined,
          },
          create: {
            id: user.id,
            email: user.email ?? null,
            name: sbName ?? 'Användare',
            image: sbImage,
            phone: normalizedPhone ?? null,
            oauthProvider: user.app_metadata?.provider ?? null,
            oauthId: user.id,
            isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at,
          },
        }).catch(() => null);

        req.user = { id: user.id, email: user.email, phone: normalizedPhone, role: 'USER' };
        return next();
      }
    } catch {
      // Fall through to legacy JWT
    }
  }

  // ── 2. Fall back to legacy custom JWT ────────────────────────────────────
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Session utgången' });
  }
};

/**
 * Hard gate: OAuth users (Google/Apple) MUST have a verified phone before
 * they can access protected endpoints. Without this, anyone could create an
 * unlimited number of accounts via Google/Apple and abuse the system.
 *
 * Allowed-listed paths let the user still hit the phone-linking flow itself.
 */
export const requireVerifiedPhone = async (req: any, res: any, next: any) => {
  if (!req.user?.id) return next();
  const reqPath = req.baseUrl + req.path;
  if (PHONE_LINKING_ALLOWED_PATHS.has(reqPath) || PHONE_LINKING_ALLOWED_PATHS.has(req.originalUrl.split('?')[0])) {
    return next();
  }
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { phone: true, oauthProvider: true, isVerified: true },
    });
    const needsPhone = !!user?.oauthProvider && (!user?.phone || !user.isVerified);
    if (needsPhone) {
      return res.status(403).json({
        error: 'Telefonverifiering krävs',
        needsPhone: true,
      });
    }
  } catch {
    // If the lookup fails, fail open (the route's own auth will still apply).
  }
  next();
};

// Test numbers — always accept code 111111, skip Twilio SMS entirely
const TEST_PHONES: Record<string, string> = {
  '+46728357970':  '111111',
  '46728357970':   '111111',
  '+46712345678':  '111111',
  '46712345678':   '111111',
  '+46722345678':  '111111',
  '46722345678':   '111111',
};

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefonnummer krävs' });

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save to DB
    await (prisma as any).verificationCode.create({
      data: { phone, code, expiresAt }
    });

    // Test numbers skip SMS entirely — verify-otp accepts them with hardcoded code
    if (TEST_PHONES[phone] !== undefined) {
      console.log(`🧪 Test-nummer ${phone} — skippar SMS`);
      return res.json({ success: true, message: 'Kod skickad' });
    }

    // Send SMS via Twilio — prefer Messaging Service SID over plain from-number
    if (twilioClient && (TWILIO_MESSAGING_SID || TWILIO_PHONE)) {
      const msgParams: Record<string, string> = {
        body: `Din verifieringskod för MatGo är: ${code}`,
        to: phone,
      };
      if (TWILIO_MESSAGING_SID) {
        msgParams.messagingServiceSid = TWILIO_MESSAGING_SID;
      } else {
        msgParams.from = TWILIO_PHONE!;
      }
      await twilioClient.messages.create(msgParams as any);
      console.log(`✅ SMS skickat till ${phone}`);
      res.json({ success: true, message: 'Kod skickad' });
    } else {
      console.warn(`⚠️ Twilio ej konfigurerat — ange TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN och TWILIO_MESSAGING_SERVICE_SID i .env`);
      console.log(`🔑 DEV-kod för ${phone}: ${code}`);
      const isDev = process.env.NODE_ENV !== 'production';
      res.json({
        success: true,
        message: isDev ? `SMS ej skickat (Twilio ej konfigurerat). DEV-kod: ${code}` : 'Kod skickad',
        ...(isDev && { devCode: code }),
      });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Kunde inte skicka SMS' });
  }
});

// POST /api/auth/lookup-phone
router.post('/lookup-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefonnummer krävs' });

    const user = await (prisma as any).user.findFirst({
      where: { phone: { in: phoneVariants(phone) } },
      select: { id: true, phone: true, email: true, isVerified: true, oauthProvider: true, password: true },
    });

    res.json({
      exists: Boolean(user),
      phone,
      hasFullAccount: Boolean(user && (user.email || user.oauthProvider || user.password)),
      isVerified: Boolean(user?.isVerified),
    });
  } catch (error) {
    console.error('Lookup phone error:', error);
    res.status(500).json({ error: 'Kunde inte kontrollera telefonnummer' });
  }
});

// Test numbers that always pass regardless of sent code (dev + staging use)
// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name, email } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Telefon och kod krävs' });

    // Check code
    const validCode = await (prisma as any).verificationCode.findFirst({
      where: { phone, code, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });

    const isTestPhone = TEST_PHONES[phone] === code;

    if (!validCode && !isTestPhone && code !== '123456') { // Allow 123456 for testing if needed
      return res.status(400).json({ error: 'Ogiltig eller utgången kod' });
    }

    // Delete used codes
    await (prisma as any).verificationCode.deleteMany({ where: { phone } });

    // Handle User creation/login/update
    let user = null;

    // Check if we are currently authenticated (e.g. via Google OAuth)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      let currentUserId: string | null = null;
      const token = authHeader.split(' ')[1];
      try {
        if (supabaseAdmin) {
          const { data: { user: sbUser } } = await supabaseAdmin.auth.getUser(token);
          if (sbUser) {
            currentUserId = sbUser.id;
          }
        }

        if (!currentUserId) {
          const payload = jwt.verify(token, JWT_SECRET) as any;
          currentUserId = payload.id;
        }
      } catch (e) {
        console.error('Token extraction failed in verify-otp:', e);
      }

      if (currentUserId) {
        try {
          // Before updating, check if this phone is already taken by another account
          const existingWithPhone = await (prisma as any).user.findFirst({
            where: { phone: { in: phoneVariants(phone) } },
          });

          if (existingWithPhone && existingWithPhone.id !== currentUserId) {
            const isGuestLike = !existingWithPhone.oauthId
              && !existingWithPhone.email
              && !existingWithPhone.password;

            if (!isGuestLike) {
              return res.status(400).json({
                error: 'Detta telefonnummer är redan kopplat till ett annat fullständigt konto',
              });
            }

            // Merge the guest-like phone-only record into the OAuth user
            // before deleting it, otherwise the FK on Order.userId would
            // either block the delete or leave orphan rows. Done as a single
            // transaction so a partial failure can't strand half-merged data.
            await (prisma as any).$transaction([
              (prisma as any).order.updateMany({
                where: { userId: existingWithPhone.id },
                data: { userId: currentUserId },
              }),
              (prisma as any).user.delete({ where: { id: existingWithPhone.id } }),
            ]);
          }

          // Final guard against the unique-phone constraint racing.
          user = await (prisma as any).user.update({
            where: { id: currentUserId },
            data: { phone, isVerified: true },
          });
        } catch (e: any) {
          console.error('Link phone error:', e);
          return res.status(500).json({
            error: 'Kunde inte koppla telefonnumret. Försök igen.',
          });
        }
      }
    }

    if (!user) {
      // Phone-only login/registration
      user = await (prisma as any).user.findUnique({ where: { phone } });
      if (!user) {
        const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

        if (normalizedEmail) {
          const existingWithEmail = await (prisma as any).user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true },
          });

          if (existingWithEmail) {
            return res.status(400).json({ error: 'E-postadressen används redan av ett annat konto' });
          }
        }

        user = await (prisma as any).user.create({
          data: {
            phone,
            name: name || `Gäst ${phone.slice(-4)}`,
            email: normalizedEmail,
            isVerified: true,
          }
        });
      } else {
        user = await (prisma as any).user.update({
          where: { id: user.id },
          data: { isVerified: true }
        });
      }
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, image: user.image, isVerified: true } });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Kunde inte verifiera' });
  }
});

// GET /api/auth/me - Hämta profil
router.get('/me', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, phone: true, email: true, address: true, city: true, zip: true, isVerified: true, image: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const { identifier, email, password } = req.body as {
      identifier?: string;
      email?: string;
      password?: string;
    };

    const loginId = (identifier || email || '').trim().toLowerCase();

    if (!loginId || !password) {
      res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
      return;
    }

    if (password.length > 256) {
      res.status(400).json({ error: 'Ogiltigt lösenordsformat' });
      return;
    }

    const effectiveLoginId = loginId;

    const admin = await resolveAdminByIdentifier(effectiveLoginId);

    if (!admin) {
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    let restaurantName: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { slug: admin.email.toLowerCase() },
            { adminEmail: admin.email.toLowerCase() },
          ],
        },
        select: { id: true, slug: true, name: true, adminEmail: true },
      });
      if (!restaurant) {
        res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
        return;
      }
      restaurantId = restaurant.id;
      restaurantSlug = restaurant.slug;
      restaurantName = restaurant.name;
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, restaurantId, restaurantSlug },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, restaurantId, restaurantSlug, restaurantName },
    });
  } catch (error) {
    console.error('[auth] Login handler error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/auth/check-admin/:slug - Check if admin account exists for a restaurant
router.get('/check-admin/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const email = slug.toLowerCase();

    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: email },
      select: { id: true, slug: true, name: true, adminEmail: true },
    });

    const adminLogin = restaurant ? getRestaurantAdminLogin(restaurant) : email;
    const admin = await prisma.adminUser.findFirst({
      where: {
        email: {
          in: restaurant && adminLogin !== email ? [adminLogin, email] : [adminLogin],
        },
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    });

    res.json({
      exists: !!admin,
      admin: admin ? { id: admin.id, email: admin.email, name: admin.name, role: admin.role, isActive: admin.isActive, createdAt: admin.createdAt, updatedAt: admin.updatedAt } : null,
      restaurant: restaurant || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/verify - Kontrollera token
router.post('/verify', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
    const token = req.body?.token || headerToken;

    if (!token) {
      res.status(401).json({ valid: false });
      return;
    }

    const admin = await resolveAdminSessionFromToken(token);

    if (!admin) {
      res.status(401).json({ valid: false });
      return;
    }

    res.json({ valid: true, admin });
  } catch {
    res.json({ valid: false });
  }
});

// POST /api/auth/register-user
router.post('/register-user', async (req, res) => {
  try {
    const { name, phone, password, email } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Namn, telefon och lösenord krävs' });
    }
    const existing = await (prisma as any).user.findFirst({
      where: { OR: [{ phone }, { email: email || undefined }] }
    });
    if (existing) {
      return res.status(400).json({ error: 'Telefonnumret eller e-posten används redan' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await (prisma as any).user.create({
      data: { name, phone, email, password: hashedPassword }
    });
    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/login-user
router.post('/login-user', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await (prisma as any).user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }], isActive: true }
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Felaktigt lösenord eller användare' });
    }
    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, isVerified: user.isVerified } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/oauth-token
router.post('/oauth-token', async (req, res) => {
  try {
    const { email, name, provider, providerId, image } = req.body;
    if (!email) return res.status(400).json({ error: 'E-post krävs' });

    let user = await (prisma as any).user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { oauthProvider: provider, oauthId: String(providerId) }] }
    });

    if (!user) {
      user = await (prisma as any).user.create({
        data: {
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          oauthProvider: provider,
          oauthId: String(providerId),
          image: image || null,
          phone: null,
          password: null,
        }
      });
    } else if (!user.oauthProvider) {
      user = await (prisma as any).user.update({
        where: { id: user.id },
        data: { oauthProvider: provider, oauthId: String(providerId), image: image || user.image }
      });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, image: user.image, needsPhone: !user.phone, isVerified: user.isVerified } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
