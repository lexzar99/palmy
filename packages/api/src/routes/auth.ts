import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import twilio from 'twilio';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import supabaseAdmin from '../lib/supabase';

const router = Router();
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

/**
 * Unified auth middleware — verifies Supabase JWTs (primary) with a
 * fallback to the legacy custom JWT for a smooth transition period.
 */
export const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Logga in först' });
  }
  const token = authHeader.split(' ')[1];

  // ── 1. Try Supabase JWT ───────────────────────────────────────────────────
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      // Ensure a corresponding row exists in the local User table
      const dbUser = await (prisma as any).user.upsert({
        where: { id: user.id },
        update: {
          email: user.email ?? undefined,
          name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? undefined,
          image: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? undefined,
          phone: user.phone ?? undefined,
          isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at,
        },
        create: {
          id: user.id,
          email: user.email ?? null,
          name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? 'Användare',
          image: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
          phone: user.phone ?? null,
          oauthProvider: user.app_metadata?.provider ?? null,
          oauthId: user.id,
          isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at,
        },
      }).catch(() => null);

      req.user = { id: user.id, email: user.email, phone: user.phone, role: 'USER' };
      return next();
    }
  } catch {
    // Fall through to legacy JWT
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

    // Send SMS via Twilio
    if (twilioClient && TWILIO_PHONE) {
      await twilioClient.messages.create({
        body: `Din verifieringskod för MatGo är: ${code}`,
        from: TWILIO_PHONE,
        to: phone
      });
      console.log(`✅ SMS skickat till ${phone}`);
    } else {
      console.log(`⚠️ Twilio ej konfigurerat. Kod för ${phone}: ${code}`);
    }

    res.json({ success: true, message: 'Kod skickad' });
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

    const user = await (prisma as any).user.findUnique({
      where: { phone },
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

    if (!validCode && code !== '123456') { // Allow 123456 for testing if needed
      return res.status(400).json({ error: 'Ogiltig eller utgången kod' });
    }

    // Delete used codes
    await (prisma as any).verificationCode.deleteMany({ where: { phone } });

    // Handle User creation/login/update
    let user = null;

    // Check if we are currently authenticated (e.g. via Google OAuth)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
        
        // Before updating, check if this phone is already taken by another account
        const existingWithPhone = await (prisma as any).user.findUnique({ where: { phone } });
        
        if (existingWithPhone && existingWithPhone.id !== payload.id) {
          // If the existing account is just a guest (no Google/Email), we can "consume" its phone number
          if (!existingWithPhone.oauthId && !existingWithPhone.email && !existingWithPhone.password) {
             await (prisma as any).user.delete({ where: { id: existingWithPhone.id } });
          } else {
             return res.status(400).json({ error: 'Detta telefonnummer är redan kopplat till ett annat fullständigt konto' });
          }
        }

        user = await (prisma as any).user.update({
          where: { id: payload.id },
          data: { phone, isVerified: true }
        });
      } catch (e) {
        console.error('Link phone error:', e);
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
    const { identifier, email, password } = req.body as {
      identifier?: string;
      email?: string;
      password?: string;
    };

    const loginId = (identifier || email || '').trim().toLowerCase();
    console.log(`[auth] Login attempt for: '${loginId}'`);

    if (!loginId || !password) {
      res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
      return;
    }

    // Try to find if loginId matches a Restaurant.adminEmail
    const maybeRestaurant = await prisma.restaurant.findFirst({
       where: { adminEmail: loginId }
    });
    const effectiveLoginId = maybeRestaurant ? maybeRestaurant.slug.toLowerCase() : loginId;

    const admin = await prisma.adminUser.findFirst({
      where: { email: effectiveLoginId, isActive: true },
    });

    if (!admin) {
      // Also check if there's an inactive account (for debugging)
      const inactiveAdmin = await prisma.adminUser.findFirst({
        where: { email: loginId },
        select: { id: true, isActive: true, role: true },
      });
      if (inactiveAdmin) {
        console.warn(`[auth] Login failed: User '${loginId}' exists but is INACTIVE (id: ${inactiveAdmin.id}).`);
      } else {
        // List all known admin usernames for debugging
        const allAdmins = await prisma.adminUser.findMany({
          select: { email: true, role: true, isActive: true },
        });
        console.warn(`[auth] Login failed: User '${loginId}' NOT FOUND. Known accounts: ${allAdmins.map(a => `${a.email}(${a.role},active=${a.isActive})`).join(', ')}`);
      }
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      console.warn(`[auth] Login failed: Password mismatch for user '${loginId}' (id: ${admin.id}, role: ${admin.role}).`);
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    let restaurantName: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug: admin.email.toLowerCase() },
        select: { id: true, slug: true, name: true },
      });
      if (!restaurant) {
        console.warn(`[auth] Login failed: Admin '${loginId}' has no linked restaurant (slug lookup failed).`);
        res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
        return;
      }
      restaurantId = restaurant.id;
      restaurantSlug = restaurant.slug;
      restaurantName = restaurant.name;
    }

    console.log(`[auth] ✅ Login success: '${loginId}' (role=${admin.role}, restaurant=${restaurantName || 'SUPER_ADMIN'})`);

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
    
    const admin = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    });
    
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: email },
      select: { id: true, slug: true, name: true },
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
    const { token } = req.body;
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    
    const admin = await prisma.adminUser.findFirst({
      where: { id: payload.id, isActive: true },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!admin) {
      res.status(401).json({ valid: false });
      return;
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    let restaurantName: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug: admin.email.toLowerCase() },
        select: { id: true, slug: true, name: true },
      });
      restaurantId = restaurant?.id ?? null;
      restaurantSlug = restaurant?.slug ?? null;
      restaurantName = restaurant?.name ?? null;
    }

    res.json({ valid: true, admin: { ...admin, restaurantId, restaurantSlug, restaurantName } });
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
