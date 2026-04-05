import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import twilio from 'twilio';
import prisma from '../lib/prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Twilio Setup
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

// Middleware for user authentication
export const authenticateUser = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Logga in först' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session utgången' });
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
        body: `Din verifieringskod för Palmyra Pizzeria är: ${code}`,
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

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name } = req.body;
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
    let user = await (prisma as any).user.findUnique({ where: { phone } });

    // If we are currently authenticated via OAuth, link this phone to the OAuth user
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
        const oUser = await (prisma as any).user.findUnique({ where: { id: payload.id } });
        
        if (oUser && !oUser.phone) {
          // Check if this phone is already taken by another account
          if (user && user.id !== oUser.id) {
            return res.status(400).json({ error: 'Detta telefonnummer är redan kopplat till ett annat konto' });
          }
          user = await (prisma as any).user.update({
            where: { id: oUser.id },
            data: { phone, isVerified: true }
          });
        }
      } catch (e) {
        // Token invalid, proceed as guest login/register
      }
    }

    if (!user) {
      // Create new user (Phone-only registration)
      user = await (prisma as any).user.create({
        data: {
          phone,
          name: name || `Gäst ${phone.slice(-4)}`,
          isVerified: true
        }
      });
    } else {
      // Ensure verified flag is set
      user = await (prisma as any).user.update({
        where: { id: user.id },
        data: { isVerified: true }
      });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, isVerified: true } });
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
      select: { id: true, name: true, phone: true, email: true, address: true, city: true, zip: true, isVerified: true }
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
    if (!loginId || !password) {
      res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
      return;
    }

    const admin = await prisma.adminUser.findFirst({
      where: { email: loginId, isActive: true },
    });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
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
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, needsPhone: !user.phone, isVerified: user.isVerified } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
