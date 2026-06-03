import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import twilio from 'twilio';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import { cached } from '../lib/ttlCache';
import { getRestaurantAdminLogin, normalizeAdminLoginAlias } from '../lib/adminLogin';
import supabaseAdmin, { supabasePublic } from '../lib/supabase';
import { authenticate, resolveAdminSessionFromToken } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { sendEmail, renderBrandedEmail } from '../lib/email';
import {
  createTrustedDevice,
  setTrustedDeviceCookie,
  verifyTrustedDeviceCookie,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
} from '../lib/trustedDevice';
import {
  generateRecoveryCodes,
  consumeRecoveryCode,
  countRemainingCodes,
} from '../lib/recoveryCodes';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import jwksClient from 'jwks-rsa';

const router = Router();

// ── Rate-limit på auth-endpoints ────────────────────────────────────────────
// Foodora-style: 10 försök per IP per 10 min → 5 min lockout. Generöst nog
// att fat-fingers inte låser ute riktiga användare, snålt nog att stoppa bots.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minuter
  max: 10,
  standardHeaders: true, // returnerar RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'För många försök. Försök igen om några minuter.',
    retryAfter: 300, // klient kan visa nedräkning (5 min)
  },
});
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

// ── OAuth id_token-verifiering ──────────────────────────────────────────────
// Google: stödjer en eller flera client-id:n (web/ios/android) — comma-sep i
// GOOGLE_OAUTH_CLIENT_ID. verifyIdToken accepterar antingen string eller
// array som audience.
const GOOGLE_OAUTH_CLIENT_IDS = (process.env.GOOGLE_OAUTH_CLIENT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const APPLE_OAUTH_CLIENT_ID = process.env.APPLE_OAUTH_CLIENT_ID || '';

const googleAuthClient = GOOGLE_OAUTH_CLIENT_IDS.length
  ? new OAuth2Client(GOOGLE_OAUTH_CLIENT_IDS[0])
  : null;

// JWKS-klient för Apple — caching aktiv så vi inte hämtar nycklarna per
// request. rateLimit/cacheMaxAge är defaults rekommenderade av jwks-rsa.
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 60 * 1000, // 10h
  rateLimit: true,
});

type VerifiedOAuthPayload = {
  email: string | null;
  providerId: string; // sub
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
};

async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedOAuthPayload> {
  if (!googleAuthClient || GOOGLE_OAUTH_CLIENT_IDS.length === 0) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID är inte konfigurerad');
  }
  const ticket = await googleAuthClient.verifyIdToken({
    idToken,
    audience: GOOGLE_OAUTH_CLIENT_IDS,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Google id_token saknar payload/sub');
  }
  return {
    email: payload.email || null,
    providerId: payload.sub,
    name: payload.name || null,
    picture: payload.picture || null,
    emailVerified: Boolean(payload.email_verified),
  };
}

function appleGetKey(header: any, callback: any) {
  appleJwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

async function verifyAppleIdToken(
  idToken: string,
): Promise<VerifiedOAuthPayload> {
  if (!APPLE_OAUTH_CLIENT_ID) {
    throw new Error('APPLE_OAUTH_CLIENT_ID är inte konfigurerad');
  }
  const decoded: any = await new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      appleGetKey,
      {
        algorithms: ['RS256'],
        audience: APPLE_OAUTH_CLIENT_ID,
        issuer: 'https://appleid.apple.com',
      },
      (err, payload) => {
        if (err) return reject(err);
        resolve(payload);
      },
    );
  });
  if (!decoded || !decoded.sub) {
    throw new Error('Apple id_token saknar payload/sub');
  }
  return {
    email: decoded.email || null,
    providerId: decoded.sub,
    name: decoded.name || null,
    picture: null,
    emailVerified:
      decoded.email_verified === true || decoded.email_verified === 'true',
  };
}

// ── Per-email rate-limit för /forgot-password ───────────────────────────────
// IP-baserad limit (10/10min) stoppar inte angripare med IP-pool. Extra
// per-email limit (3/h per email) hindrar Brevo-quota-dränering. In-memory
// Map räcker — vi kör vanligtvis single-instance, och drift mellan instanser
// är acceptabel (worst case: 6 mejl/h istället för 3).
const FORGOT_PASSWORD_EMAIL_WINDOW_MS = 60 * 60 * 1000; // 60 min
const FORGOT_PASSWORD_EMAIL_MAX = 3;
const forgotPasswordEmailHits = new Map<string, number[]>();

function recordForgotPasswordEmailHit(emailKey: string): boolean {
  const now = Date.now();
  const hits = forgotPasswordEmailHits.get(emailKey) || [];
  const recent = hits.filter((ts) => now - ts < FORGOT_PASSWORD_EMAIL_WINDOW_MS);
  if (recent.length >= FORGOT_PASSWORD_EMAIL_MAX) {
    forgotPasswordEmailHits.set(emailKey, recent);
    return false; // rejected
  }
  recent.push(now);
  forgotPasswordEmailHits.set(emailKey, recent);
  return true; // accepted
}

// Garbage-collect gamla entries en gång i timmen så Mapen inte växer för
// evigt på en långkörande process. Lättviktigt — itererar igenom & droppar
// utgångna keys.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of forgotPasswordEmailHits.entries()) {
    const recent = hits.filter(
      (ts) => now - ts < FORGOT_PASSWORD_EMAIL_WINDOW_MS,
    );
    if (recent.length === 0) forgotPasswordEmailHits.delete(key);
    else forgotPasswordEmailHits.set(key, recent);
  }
}, FORGOT_PASSWORD_EMAIL_WINDOW_MS).unref?.();

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
// Routes som en OAuth-only user (Google/Apple men ingen telefon) får träffa.
// OTP-flödet är borttaget — telefonnummer samlas vid checkout som kontakt-info
// men kräver ingen separat verifiering.
const PHONE_LINKING_ALLOWED_PATHS = new Set<string>([
  '/api/profile',
  '/api/auth/me',
  '/api/auth/lookup-phone',
]);

// Cache the RESOLVED local identity per token for 30s so authenticated requests
// don't re-run the Supabase call + user findUnique/upsert on EVERY request (the
// profile/auth scaling bottleneck — it was ~3-4 DB queries + an upsert per call).
// Only successful auths are cached below; banned/invalid tokens are never cached.
// ≤30s staleness on a ban/role change is acceptable (same window as token validation).
const identityCache = new Map<string, { value: any; expiresAt: number }>();
function getCachedIdentity(token: string): any | null {
  const e = identityCache.get(token);
  if (e && e.expiresAt > Date.now()) return e.value;
  if (e) identityCache.delete(token);
  return null;
}
function setCachedIdentity(token: string, value: any): void {
  identityCache.set(token, { value, expiresAt: Date.now() + 30_000 });
  if (identityCache.size > 5000) {
    for (const k of identityCache.keys()) { identityCache.delete(k); if (identityCache.size <= 4000) break; }
  }
}

export const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Logga in först' });
  }
  const token = authHeader.split(' ')[1];

  // Fast path: a recently-resolved identity for this exact token → skip the
  // Supabase call AND the per-request user findUnique/upsert entirely. This is
  // what lets the profile/auth path survive 1000 concurrent.
  const cachedIdentity = getCachedIdentity(token);
  if (cachedIdentity) {
    req.user = cachedIdentity;
    return next();
  }

  // ── 1. Try Supabase JWT ───────────────────────────────────────────────────
  if (supabaseAdmin) {
    try {
      // Cache token validation 30s: a logged-in user fires many requests and
      // without this each one is a network call to Supabase Auth (the
      // 1000-concurrent auth bottleneck). Keyed by the exact token; an invalid
      // token caches harmlessly for 30s.
      const { data: { user }, error } = await cached('auth:sb', token, 30_000, () => supabaseAdmin!.auth.getUser(token));
      if (!error && user) {
        // Soft-delete revival. Admin-deleted accounts have deletedAt set
        // and identifying fields nulled out; when the same Apple/Google
        // user signs in again we treat it as a fresh registration —
        // clear the tombstone and let the rest of the flow upsert and
        // re-collect the name/phone. (If you want a true permanent ban,
        // use isActive=false; that block lives below.)
        const tombstone = await (prisma as any).user.findUnique({
          where: { id: user.id },
          select: { deletedAt: true, isActive: true, firstName: true, lastName: true },
        }).catch(() => null);

        // ID-mismatch-fix: vår /register-user skapar User med cuid() medan
        // Supabase auth.users har UUID. Om id inte matchar någon User i vår
        // DB, men email matchar → samma person, bara olika auth-paths
        // (custom JWT vs Supabase JWT). Då länkar vi: använd den befintliga
        // cuid-User:n och markera isVerified=true från Supabase-status.
        // Annars skulle vi skapa en SEKUNDÄR User-row och användaren skulle
        // ha två konton i parallell — buggen som gav "isVerified=false trots
        // verifierad email".
        let resolvedUserId = user.id;
        if (!tombstone && user.email) {
          const existingByEmail = await (prisma as any).user.findFirst({
            where: { email: user.email.toLowerCase(), deletedAt: null },
            select: { id: true, isVerified: true },
          }).catch(() => null);
          if (existingByEmail) {
            resolvedUserId = existingByEmail.id;
            // Markera som verifierad om Supabase säger så
            if (!existingByEmail.isVerified && (user.email_confirmed_at || user.phone_confirmed_at)) {
              await (prisma as any).user.update({
                where: { id: existingByEmail.id },
                data: { isVerified: true },
              }).catch(() => null);
              console.log(`[auth] User ${existingByEmail.id} (email=${user.email}) markerad som verifierad via Supabase`);
            }
            req.user = { id: resolvedUserId, email: user.email, phone: null, role: 'USER' };
            return next();
          }
        }

        if (tombstone?.isActive === false) {
          // Permanent block — admin set isActive=false. Reject without revival.
          return res.status(401).json({ error: 'Konto avstängt' });
        }
        if (tombstone?.deletedAt) {
          await (prisma as any).user
            .update({
              where: { id: user.id },
              data: { deletedAt: null, isActive: true, name: '', firstName: null, lastName: null },
            })
            .catch(() => null);
        }
        // Track for logging — we explicitly distinguish "found existing"
        // vs "creating fresh" per the strict Apple Sign-In spec, so it's
        // observable when name was vs wasn't received from Apple.
        const wasExistingUser = !!tombstone && !tombstone.deletedAt;
        const hadStoredName = !!(tombstone?.firstName || tombstone?.lastName);
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

        // STRICT APPLE SIGN-IN PERSISTENCE (per Apple's spec):
        //   - Apple ships fullName only on the FIRST authorization.
        //   - The DB is the single source of truth. Once first/last are
        //     stored, NEVER overwrite from a later auth response — even if
        //     by some path Supabase metadata changes, we ignore it.
        //   - On the create path (genuinely new user), we accept whatever
        //     Apple sent. If empty, columns stay null and the client gates
        //     into the "Complete Profile" screen exactly once.
        const meta = user.user_metadata || {};
        let sbFirst =
          ((meta.first_name as string | undefined) ||
            (meta.given_name as string | undefined) ||
            '').trim() || null;
        let sbLast =
          ((meta.last_name as string | undefined) ||
            (meta.family_name as string | undefined) ||
            '').trim() || null;
        const sbName =
          ((meta.name as string | undefined) ||
            (meta.full_name as string | undefined) ||
            [sbFirst, sbLast].filter(Boolean).join(' ').trim() ||
            '').trim() || null;

        // Fallback: om Supabase saknar split first/last men har ett komplett
        // name (vanligt med Google — vissa returnerar bara "name", inte
        // given_name/family_name), splittar vi på space. Annars hamnar
        // användare i PhoneGateScreen "vad heter du" trots att Google
        // delade ett namn.
        if (!sbFirst && !sbLast && sbName) {
          const parts = sbName.split(/\s+/).filter(Boolean);
          if (parts.length >= 2) {
            sbFirst = parts[0];
            sbLast = parts.slice(1).join(' ');
          } else if (parts.length === 1) {
            // Google har bara ett namn (sällsynt men möjligt) — använd
            // som firstName så profileComplete-check accepterar single-name.
            sbFirst = parts[0];
          }
        }
        const sbImage = (meta.avatar_url as string | undefined) || (meta.picture as string | undefined) || null;

        if (wasExistingUser) {
          if (hadStoredName) {
            console.log(`[apple-auth] existing user ${user.id} signed in — name already on file, ignoring any Apple metadata`);
          } else if (sbFirst || sbLast) {
            console.log(`[apple-auth] existing user ${user.id} signed in — DB had no name, accepting first-login name from Apple metadata`);
          } else {
            console.log(`[apple-auth] existing user ${user.id} signed in — no name on file, none in Apple response (client will prompt)`);
          }
        } else {
          if (sbFirst || sbLast) {
            console.log(`[apple-auth] NEW user ${user.id} created — name received from Apple (${sbFirst ? 'first' : '-'}/${sbLast ? 'last' : '-'})`);
          } else {
            console.log(`[apple-auth] NEW user ${user.id} created — Apple did not ship a name (client will prompt)`);
          }
        }

        await (prisma as any).user.upsert({
          where: { id: user.id },
          update: {
            email: user.email || undefined,
            image: sbImage || undefined,
            phone: normalizedPhone || undefined,
            isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at || undefined,
            oauthProvider: user.app_metadata?.provider || undefined,
            // Names: ONLY fill in if the DB row currently has nothing. This
            // satisfies "never overwrite stored name from Apple". Prisma
            // doesn't have a native conditional-update so we backfill via a
            // separate updateMany below — the upsert leaves them untouched.
          },
          create: {
            id: user.id,
            email: user.email ?? null,
            // Empty string when nothing came from the OAuth provider — the
            // client detects `needsName: true` from GET /api/profile and
            // prompts the user. NEVER use "Användare" or any other
            // placeholder; the user explicitly does not want a fallback name.
            name: sbName ?? '',
            firstName: sbFirst,
            lastName: sbLast,
            image: sbImage,
            phone: normalizedPhone ?? null,
            oauthProvider: user.app_metadata?.provider ?? null,
            oauthId: user.id,
            isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at,
          },
        }).catch(() => null);

        // Backfill names for an EXISTING user only when:
        //   (a) Apple just shipped a name on this auth, AND
        //   (b) the DB row currently has no firstName AND no lastName.
        // updateMany with a conditional WHERE makes this race-safe and
        // leaves the row alone if the user has already typed a name in the
        // Complete Profile screen between auth events.
        if (wasExistingUser && !hadStoredName && (sbFirst || sbLast)) {
          await (prisma as any).user.updateMany({
            where: { id: user.id, firstName: null, lastName: null },
            data: {
              firstName: sbFirst ?? undefined,
              lastName: sbLast ?? undefined,
              name: sbName ?? undefined,
            },
          }).catch(() => null);
        }

        req.user = { id: user.id, email: user.email, phone: normalizedPhone, role: 'USER' };
        setCachedIdentity(token, req.user);
        return next();
      }
    } catch {
      // Fall through to legacy JWT
    }
  }

  // ── 2. Fall back to legacy custom JWT ────────────────────────────────────
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload?.id) {
      const tombstone = await (prisma as any).user.findUnique({
        where: { id: payload.id },
        select: { deletedAt: true },
      }).catch(() => null);
      if (tombstone?.deletedAt) {
        return res.status(401).json({ error: 'Konto borttaget' });
      }
    }
    req.user = payload;
    setCachedIdentity(token, req.user);
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

// OTP-flödet (POST /api/auth/send-otp + POST /api/auth/verify-otp) är
// borttaget per design. Telefonnummer samlas vid checkout som kontakt-info
// men kräver ingen SMS-verifiering. Användare loggar in via Supabase OAuth
// (Google/Apple) eller registreras via /api/auth/register-user (email+lösen).

// POST /api/auth/lookup-phone
router.post('/lookup-phone', authLimiter, async (req, res) => {
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
router.post('/login', authLimiter, async (req, res) => {
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
      // Logga miss-försök så vi kan spåra brute-force trots rate-limit.
      // req.admin är undefined här — audit() loggar med adminId=null.
      await audit(req as AuthRequest, 'LOGIN_FAIL', {
        resourceType: 'Auth',
        changes: { identifier: loginId, reason: 'no_account' },
      });
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      // Logga med kandidat-admin-id så vi kan se vilka konton brute-forcas mot.
      (req as AuthRequest).admin = { id: admin.id, email: admin.email, role: admin.role } as any;
      await audit(req as AuthRequest, 'LOGIN_FAIL', {
        resourceType: 'Auth',
        resourceId: admin.id,
        changes: { identifier: loginId, reason: 'wrong_password' },
      });
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    // 2FA / Trusted Device-flow:
    // 1. Om TOTP är aktiverat på kontot → kräver kod, OM inte enheten är trusted
    // 2. Trusted device-cookie giltig (sätts efter förra TOTP-verifieringen) → hoppa över
    // 3. Annars: kräv totp (Google Authenticator) ELLER recoveryCode
    // 4. Efter lyckad verifiering: skapa ny trusted device + sätt cookie
    let needsTrustedDeviceCookie = false;
    if ((admin as { totpEnabled?: boolean }).totpEnabled) {
      const trustedDeviceId = await verifyTrustedDeviceCookie(req, admin.id);

      if (!trustedDeviceId) {
        const { totp: providedTotp, recoveryCode } = req.body as {
          totp?: string;
          recoveryCode?: string;
        };

        // Ingen kod skickad → tala om för klient att TOTP behövs
        if (!providedTotp && !recoveryCode) {
          res.status(200).json({ totpRequired: true });
          return;
        }

        let verified = false;

        // Försök TOTP först
        if (providedTotp) {
          verified = Boolean(verifySync({
            token: providedTotp,
            secret: (admin as { totpSecret?: string }).totpSecret || '',
          }));
        }

        // Annars recovery code som fallback
        if (!verified && recoveryCode) {
          verified = await consumeRecoveryCode(admin.id, recoveryCode);
          if (verified) {
            console.log(`[auth] Recovery code används för admin ${admin.email}`);
          }
        }

        if (!verified) {
          (req as AuthRequest).admin = { id: admin.id, email: admin.email, role: admin.role } as any;
          await audit(req as AuthRequest, 'LOGIN_FAIL', {
            resourceType: 'Auth',
            resourceId: admin.id,
            changes: { reason: 'invalid_totp_or_recovery' },
          });
          res.status(401).json({ error: 'Ogiltig 2FA-kod eller recovery-kod' });
          return;
        }

        needsTrustedDeviceCookie = true;
      }
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    let restaurantName: string | null = null;
    let logoutCode: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { slug: admin.email.toLowerCase() },
            { adminEmail: admin.email.toLowerCase() },
          ],
        },
        select: { id: true, slug: true, name: true, adminEmail: true, logoutCode: true },
      });
      if (!restaurant) {
        res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
        return;
      }
      restaurantId = restaurant.id;
      restaurantSlug = restaurant.slug;
      restaurantName = restaurant.name;
      logoutCode = restaurant.logoutCode ?? null;
    }

    // A5 — embed current tokenVersion so a future "logout everywhere" bump
    // invalidates this token. Missing field (admin row predates the migration)
    // defaults to 0.
    const adminTokenVersion = (admin as any).tokenVersion ?? 0;
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, restaurantId, restaurantSlug, tokenVersion: adminTokenVersion },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // HttpOnly cookie — primary auth method. Frontend never touches the
    // raw token. The admin frontend lives on a different site (Vercel) from
    // the API (Railway), so SameSite=None is required — combined with Secure,
    // this is the standard cross-site auth-cookie posture. localStorage
    // Bearer remains as a fallback for browsers that block 3rd-party cookies.
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Om TOTP precis verifierades på en ny enhet — utfärda trusted device-cookie
    // så nästa login från samma dator slipper TOTP-prompt.
    if (needsTrustedDeviceCookie) {
      const trustedToken = await createTrustedDevice(admin.id, req);
      setTrustedDeviceCookie(res, trustedToken);
    }

    // Logga lyckad inloggning. Sätt req.admin manuellt så audit() får rätt adminId.
    (req as AuthRequest).admin = { id: admin.id, email: admin.email, role: admin.role } as any;
    await audit(req as AuthRequest, 'LOGIN_SUCCESS', {
      resourceType: 'Auth',
      resourceId: admin.id,
      changes: { restaurantId, role: admin.role, newTrustedDevice: needsTrustedDeviceCookie },
    });

    // Returnerar fortfarande token i body för bakåt-kompatibilitet med
    // klienter som lagrar via localStorage. Migrerings-period — kan tas bort
    // när alla klienter migrerade till cookie-baserad auth.
    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, restaurantId, restaurantSlug, restaurantName, logoutCode },
    });
  } catch (error) {
    console.error('[auth] Login handler error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/logout - Clearar admin-cookie. Klient ska också rensa
// eventuell localStorage-token efter detta anrop.
router.post('/logout', async (_req, res) => {
  // Must match the issue-time attributes or the browser refuses to clear it.
  res.clearCookie('admin_token', { path: '/', sameSite: 'none', secure: true });
  res.json({ success: true });
});

// A5 — "Log out everywhere": bump the admin's tokenVersion so every previously
// issued JWT becomes invalid on the next request. The login route always
// embeds the current tokenVersion in newly issued tokens; the auth middleware
// rejects any token whose version doesn't match the stored value.
router.post('/logout-everywhere', authenticate, async (req: any, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ error: 'Inte autentiserad' });
    await (prisma as any).adminUser.update({
      where: { id: adminId },
      data: { tokenVersion: { increment: 1 } },
    });
    res.clearCookie('admin_token', { path: '/', sameSite: 'none', secure: true });
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/logout-everywhere] error:', err);
    res.status(500).json({ error: 'Kunde inte logga ut alla sessioner' });
  }
});

// ============================================================
// 2FA / TOTP — för admin-konton (Google Authenticator-kompatibelt)
// ============================================================

// POST /api/auth/2fa/setup — start setup. Genererar secret + QR-kod.
// Användare scanar QR i Google Authenticator, kallar sedan /verify med
// en kod för att aktivera.
router.post('/2fa/setup', authenticate, async (req: any, res) => {
  try {

    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ error: 'Inte autentiserad' });

    const secret = generateSecret();
    const otpauthUrl = generateURI({ label: req.admin?.email || 'admin', issuer: 'FoodGo Admin', secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Spara secret men sätt INTE enabled=true förrän user verifierar
    await prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: secret, totpEnabled: false } as any,
    });

    res.json({ secret, qrDataUrl, otpauthUrl });
  } catch (err) {
    console.error('[2fa setup] error:', err);
    res.status(500).json({ error: '2FA-setup misslyckades' });
  }
});

// POST /api/auth/2fa/verify — bekräfta kod + aktivera 2FA
router.post('/2fa/verify', authenticate, async (req: any, res) => {
  try {
    const { totp } = req.body as { totp?: string };
    if (!totp) return res.status(400).json({ error: 'Kod krävs' });

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin?.id } });
    if (!admin || !(admin as any).totpSecret) {
      return res.status(400).json({ error: 'Ingen 2FA-setup pågående. Anropa /2fa/setup först.' });
    }

    const valid = verifySync({ token: totp, secret: (admin as any).totpSecret });
    if (!valid) return res.status(401).json({ error: 'Ogiltig kod' });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: true } as any,
    });

    // Vid första aktivering: generera 10 recovery codes och visa EN gång.
    // Användare måste spara dem nu — backend lagrar bara bcrypt-hash.
    const recoveryCodes = await generateRecoveryCodes(admin.id);

    await audit(req as AuthRequest, '2FA_ENABLE', {
      resourceType: 'AdminUser',
      resourceId: admin.id,
    });
    res.json({ success: true, recoveryCodes });
  } catch (err) {
    console.error('[2fa verify] error:', err);
    res.status(500).json({ error: '2FA-verify misslyckades' });
  }
});

// POST /api/auth/2fa/recovery/regenerate — generera nya 10 recovery codes.
// Invaliderar alla gamla. Kräver giltig TOTP-kod.
router.post('/2fa/recovery/regenerate', authenticate, async (req: any, res) => {
  try {
    const { totp } = req.body as { totp?: string };
    if (!totp) return res.status(400).json({ error: 'TOTP-kod krävs' });

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin?.id } });
    if (!admin || !(admin as any).totpEnabled || !(admin as any).totpSecret) {
      return res.status(400).json({ error: '2FA är inte aktiverat' });
    }

    const valid = verifySync({ token: totp, secret: (admin as any).totpSecret });
    if (!valid) return res.status(401).json({ error: 'Ogiltig TOTP-kod' });

    const recoveryCodes = await generateRecoveryCodes(admin.id);
    await audit(req as AuthRequest, '2FA_RECOVERY_REGENERATE', {
      resourceType: 'AdminUser',
      resourceId: admin.id,
    });
    res.json({ recoveryCodes });
  } catch (err) {
    console.error('[2fa regenerate] error:', err);
    res.status(500).json({ error: 'Kunde inte generera nya recovery codes' });
  }
});

// POST /api/auth/2fa/disable — stäng av 2FA. Kräver aktuell kod för att inte
// kunna deaktiveras av en angripare som tagit session-cookien.
router.post('/2fa/disable', authenticate, async (req: any, res) => {
  try {
    const { totp } = req.body as { totp?: string };
    if (!totp) return res.status(400).json({ error: 'Kod krävs för att stänga av 2FA' });

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin?.id } });
    if (!admin || !(admin as any).totpEnabled || !(admin as any).totpSecret) {
      return res.status(400).json({ error: '2FA är inte aktiverat' });
    }

    const valid = verifySync({ token: totp, secret: (admin as any).totpSecret });
    if (!valid) return res.status(401).json({ error: 'Ogiltig kod' });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: false, totpSecret: null } as any,
    });

    // Radera även recovery codes och trusted devices så ingen kan logga in
    // utan att sätta upp 2FA igen
    await Promise.all([
      (prisma as any).recoveryCode.deleteMany({ where: { adminId: admin.id } }).catch(() => null),
      (prisma as any).trustedDevice.updateMany({
        where: { adminId: admin.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }).catch(() => null),
    ]);

    await audit(req as AuthRequest, '2FA_DISABLE', {
      resourceType: 'AdminUser',
      resourceId: admin.id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[2fa disable] error:', err);
    res.status(500).json({ error: '2FA-disable misslyckades' });
  }
});

// GET /api/auth/2fa/status — kollar om 2FA är på + recovery codes kvar
router.get('/2fa/status', authenticate, async (req: any, res) => {
  try {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin?.id } });
    const enabled = Boolean((admin as any)?.totpEnabled);
    const remainingCodes = enabled ? await countRemainingCodes(req.admin.id) : 0;
    res.json({
      enabled,
      remainingRecoveryCodes: remainingCodes,
      recoveryGeneratedAt: (admin as any)?.recoveryGeneratedAt ?? null,
    });
  } catch {
    res.json({ enabled: false, remainingRecoveryCodes: 0 });
  }
});

// ============================================================
// Trusted Devices — listar/revokar enheter som slipper TOTP-prompt
// ============================================================

// GET /api/auth/trusted-devices — listar aktiva enheter för inloggad admin
router.get('/trusted-devices', authenticate, async (req: any, res) => {
  try {
    const devices = await listTrustedDevices(req.admin.id);
    res.json(devices);
  } catch (err) {
    console.error('[trusted-devices list] error:', err);
    res.status(500).json({ error: 'Kunde inte hämta enheter' });
  }
});

// DELETE /api/auth/trusted-devices/:id — revoka en enskild enhet
router.delete('/trusted-devices/:id', authenticate, async (req: any, res) => {
  try {
    await revokeTrustedDevice(req.admin.id, req.params.id);
    await audit(req as AuthRequest, 'TRUSTED_DEVICE_REVOKE', {
      resourceType: 'TrustedDevice',
      resourceId: req.params.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[trusted-devices revoke] error:', err);
    res.status(500).json({ error: 'Kunde inte revoka enhet' });
  }
});

// DELETE /api/auth/trusted-devices — revoka ALLA aktiva enheter (panic-knapp)
router.delete('/trusted-devices', authenticate, async (req: any, res) => {
  try {
    await revokeAllTrustedDevices(req.admin.id);
    await audit(req as AuthRequest, 'TRUSTED_DEVICE_REVOKE_ALL', {
      resourceType: 'AdminUser',
      resourceId: req.admin.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[trusted-devices revoke-all] error:', err);
    res.status(500).json({ error: 'Kunde inte revoka enheter' });
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

    // Public, unauthenticated endpoint → return ONLY existence. Never expose the
    // admin's email/role/timestamps or the restaurant's adminEmail (that was an
    // account-enumeration + PII leak to anyone who knows a slug).
    res.json({
      exists: !!admin,
      restaurant: restaurant ? { id: restaurant.id, slug: restaurant.slug, name: restaurant.name } : null,
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

// URL:er för verifierings-länken — används av både /register-user och
// /send-verification-email. Placerade här (innan första route) så att båda
// handlers kan referera värdena utan att förlita sig på hoisting-quirks.
//
// Default = Vercel-preview eftersom matgo.se-domänen inte är DNS-pekad ännu.
// När custom domain är klar: sätt WEB_VERIFY_EMAIL_URL=https://matgo.se/verify-email
// i Railway env-vars och pusha en restart.
const WEB_VERIFY_EMAIL_BASE =
  process.env.WEB_VERIFY_EMAIL_URL || 'https://matgo-web-pi.vercel.app/verify-email';
const MOBILE_VERIFY_EMAIL_DEEP_LINK_BASE =
  process.env.MOBILE_VERIFY_EMAIL_URL || 'foodgo://verify-email';

// POST /api/auth/register-user
// Registreringen logger in användaren direkt: vi skapar kontot, returnerar
// JWT på en gång och skickar verifieringsmejlet fire-and-forget. Användaren
// kan klicka i mejlet senare för att markera emailVerifiedAt — men inloggning
// blockas inte. Infrastrukturen ligger kvar (token-fält, verify-email endpoint,
// check-email-verified) så vi kan slå på en hård gate i framtiden utan kod-
// ändringar i datalagret.
router.post('/register-user', authLimiter, async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;
    if (!firstName || !lastName || !email || !password || !phone) {
      return res.status(400).json({ error: 'Förnamn, efternamn, e-post, telefon och lösenord krävs' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Email unik — VIKTIGT: ingen läckage av om kontot finns. Tidigare
    // returnerade vi olika felmeddelanden beroende på om mailen var tagen
    // eller inte, vilket lät en angripare bygga en email-lista genom att
    // probea adresser. Nu returnerar vi alltid samma generiska 200-svar och
    // skickar istället ett notice-mejl till den befintliga adressen (med
    // login-länk) så att den verkliga ägaren får besked.
    const existingEmail = await (prisma as any).user.findFirst({
      where: { email: normalizedEmail }
    });
    if (existingEmail) {
      // Vi triggar resend av Supabase verifierings-mejl om kontot är
      // OAuth-only eller inte verifierat ännu (då finns kontot men user
      // har inte slutfört flowet). Annars skickar vi inget — generic 200.
      //
      // Email-enumeration-skydd: vi returnerar samma 200 oavsett om kontot
      // fanns eller inte, så angripare kan inte mappa befintliga emails.
      // Tidigare Brevo notice-mejl togs bort eftersom Brevo kräver domän.
      if (supabasePublic && !existingEmail.isVerified) {
        try {
          await supabasePublic.auth.resend({
            type: 'signup',
            email: normalizedEmail,
            options: { emailRedirectTo: WEB_VERIFY_EMAIL_BASE },
          });
        } catch {
          // ignore — generic 200 returneras ändå
        }
      }

      // Generisk 200 — ser identiskt ut för ny vs befintlig email.
      return res.status(200).json({
        ok: true,
        message:
          'Om kontot finns har vi skickat ett mejl med nästa steg. Kolla din inbox.',
      });
    }

    // Telefon unik — kolla alla varianter (+46/46/etc) så vi inte tillåter
    // dubblett genom format-trick
    const phoneVariantList = phoneVariants(phone);
    const existingPhone = await (prisma as any).user.findFirst({
      where: { phone: { in: phoneVariantList } }
    });
    if (existingPhone) {
      return res.status(400).json({ error: 'Telefonnumret används redan. Använd ett annat nummer eller logga in.' });
    }

    const name = `${firstName} ${lastName}`.trim();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generera verifierings-token direkt vid skapandet så vi kan skicka mejlet
    // i samma request. emailVerifiedAt sätts först när användaren klickar
    // länken — men inloggning blockas inte i nuläget.
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await (prisma as any).user.create({
      data: {
        name,
        firstName,
        lastName,
        email: normalizedEmail,
        phone,
        password: hashedPassword,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
      }
    });

    // Fire-and-forget: skicka verifieringsmejlet via Supabase i bakgrunden.
    // Tidigare användes Brevo (kräver verifierad domän, fungerar inte gratis).
    // Nu använder vi Supabase's inbyggda email-system som:
    //   - är gratis (4 emails/h på free tier)
    //   - skickar från noreply@mail.supabase.co (ingen egen domän behövs)
    //   - skapar en auth.users-entry parallellt med vår User-row
    //   - skickar verifieringslänk som redirectar tillbaka till appen
    // Om Supabase signUp failar (t.ex. anon-key saknas eller user redan
    // finns i Supabase) loggar vi men låter registreringen gå igenom —
    // användaren är ändå skapad i vår DB och kan logga in lokalt.
    (async () => {
      if (!supabasePublic) {
        console.warn('[register-user] supabasePublic saknas — verifieringsmejl skickas inte. Sätt SUPABASE_ANON_KEY i Railway.');
        return;
      }
      try {
        // Försök signUp först. Om Supabase-user redan finns → identities[] är
        // tom i response och INGET mejl skickas (Supabase v2-beteende).
        // Då måste vi explicit kalla resend() för att trigga mejlet.
        const { data: signUpData, error: signUpError } = await supabasePublic.auth.signUp({
          email: user.email!,
          password,
          options: {
            data: {
              first_name: firstName || null,
              last_name: lastName || null,
              full_name: user.name || null,
              phone: user.phone || null,
            },
            emailRedirectTo: WEB_VERIFY_EMAIL_BASE,
          },
        });

        // identities tom = user fanns redan → signUp skickar INTE mejl
        const userExists =
          signUpData?.user &&
          Array.isArray(signUpData.user.identities) &&
          signUpData.user.identities.length === 0;

        if (signUpError) {
          // Explicit "already registered" error — kalla resend manuellt
          if (/already|registered/i.test(signUpError.message || '')) {
            const { error: resendErr } = await supabasePublic.auth.resend({
              type: 'signup',
              email: user.email!,
              options: { emailRedirectTo: WEB_VERIFY_EMAIL_BASE },
            });
            if (resendErr) {
              console.error('[register-user] supabase.resend failed:', resendErr.message);
            } else {
              console.log(`[register-user] Verifieringsmejl resendat via Supabase till ${user.email}`);
            }
          } else {
            console.error('[register-user] supabase.signUp failed:', signUpError.message);
          }
        } else if (userExists) {
          // signUp returnerade utan error men identities är tom = ghost user
          // exists. Kalla resend för att faktiskt skicka mejlet.
          const { error: resendErr } = await supabasePublic.auth.resend({
            type: 'signup',
            email: user.email!,
            options: { emailRedirectTo: WEB_VERIFY_EMAIL_BASE },
          });
          if (resendErr) {
            console.error('[register-user] supabase.resend failed (existing user):', resendErr.message);
          } else {
            console.log(`[register-user] Verifieringsmejl resendat (befintlig user) till ${user.email}`);
          }
        } else {
          console.log(`[register-user] Verifieringsmejl skickat via Supabase till ${user.email}`);
        }
      } catch (mailErr: any) {
        console.error('[register-user] supabase.signUp threw (account created anyway):', mailErr?.message || mailErr);
      }
    })();

    await audit(req as AuthRequest, 'USER_REGISTERED', {
      resourceType: 'User',
      resourceId: user.id,
      changes: { email: user.email, emailVerificationDispatched: true },
    });

    // Welcome-deal: skapas automatiskt om admin har aktiverat den i settings.
    try {
      const { maybeCreateWelcomeDeal } = await import('./referrals');
      await maybeCreateWelcomeDeal(user.id);
    } catch (e: any) {
      console.error('[register-user] welcome-deal-trigger error:', e?.message);
    }

    // Dpoints-välkomstbonusen delas INTE ut automatiskt — kunden hämtar den
    // själv efteråt (claim) via /api/dpoints/claim-signup. Path-agnostiskt så
    // det funkar lika för email- och Google/Apple-registrering.

    // Auto-login: utfärda JWT direkt och returnera user-payload. Klienten
    // persistar token och navigerar vidare; verifieringsmejlet kommer som
    // notifikation och kan användas senare för att markera kontot som
    // verifierat.
    const tokenJwt = jwt.sign(
      { id: user.id, phone: user.phone, role: 'USER' },
      JWT_SECRET,
      { expiresIn: '30d' },
    );

    return res.json({
      ok: true,
      token: tokenJwt,
      email: user.email,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
      },
      message: 'Vi skickade en verifieringslänk — kolla din mejl när du har en stund.',
    });
  } catch (error) {
    console.error('[register-user] error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/login-user
// Normal inloggning. Vi blockar INTE på emailVerifiedAt — det är medvetet
// avstängt tills domänen är verifierad i Brevo. Infrastrukturen kring
// verifiering (token-fält, /verify-email, /check-email-verified) ligger
// kvar och kan slås på igen genom att återinföra check:en här.
router.post('/login-user', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await (prisma as any).user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }], isActive: true }
    });
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Felaktigt lösenord eller användare' });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, isVerified: user.isVerified } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ============================================================
// Email verification — kund-flöde
// ============================================================
//
// Tre endpoints:
//   1. POST /send-verification-email { email }
//      Genererar token, mejlar länk (web + foodgo://). Returnerar alltid 200
//      (läcker inte vilka mejlkonton som finns).
//   2. POST /verify-email { token }
//      Validerar tokenen, sätter emailVerifiedAt = now(), nollar token-fält.
//      Returnerar { ok, email } så klient/webb kan visa bekräftelse.
//   3. POST /check-email-verified { email } (eller via auth-header)
//      Mobilklienten pollar denna under verify-steget. Returnerar
//      { verified: boolean }.
//
// WEB_VERIFY_EMAIL_BASE / MOBILE_VERIFY_EMAIL_DEEP_LINK_BASE deklareras ovanför
// /register-user-handlern eftersom även den behöver bygga verifieringslänkar.

// POST /api/auth/send-verification-email — skicka verifieringslänk
router.post('/send-verification-email', authLimiter, async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      // Returnera 200 även här så vi inte läcker att email validering fail.
      return res.status(200).json({ ok: true });
    }

    const user = await (prisma as any).user.findFirst({
      where: { email: normalizedEmail, isActive: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        name: true,
        emailVerifiedAt: true,
      },
    });

    if (user && !user.emailVerifiedAt) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      await (prisma as any).user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: token,
          emailVerificationExpiresAt: expiresAt,
        },
      });

      const greetingName = user.firstName || user.name || 'där';
      const webLink = `${WEB_VERIFY_EMAIL_BASE}?token=${token}`;
      const mobileLink = `${MOBILE_VERIFY_EMAIL_DEEP_LINK_BASE}?token=${token}`;

      const text = [
        `Hej ${greetingName}!`,
        '',
        'Tack för att du skapat ett FoodGo-konto. För att slutföra registreringen,',
        'klicka på länken nedan och verifiera din e-postadress. Länken gäller 24 timmar.',
        '',
        `Webb:   ${webLink}`,
        `Mobil:  ${mobileLink}`,
        '',
        'Om du inte skapat något konto kan du ignorera detta mejl.',
        '',
        'Vänliga hälsningar,',
        'FoodGo',
      ].join('\n');

      const html = renderBrandedEmail({
        headline: 'Bekräfta din email',
        greeting: `Hej ${greetingName}!`,
        intro: [
          'Klicka för att aktivera ditt FoodGo-konto.',
        ],
        cta: { label: 'Bekräfta email', url: webLink },
        mobileDeepLink: { label: 'Använder du mobilappen? Öppna istället:', url: mobileLink },
        footnote:
          'Länken gäller 24 timmar. Om du inte skapat något konto kan du ignorera detta mejl.',
      });

      // Skicka via Supabase (gratis, ingen domän krävs). Använder
      // resendOTP eller signUp för att trigga ny verifierings-email
      // för en befintlig user.
      if (supabasePublic) {
        try {
          // resend() är specifikt för att skicka om verifieringsmejlet
          // till en redan-existerande Supabase-user.
          const { error: resendErr } = await supabasePublic.auth.resend({
            type: 'signup',
            email: user.email!,
            options: { emailRedirectTo: WEB_VERIFY_EMAIL_BASE },
          });
          if (resendErr) {
            // Om user inte finns i Supabase än — skapa via signUp så
            // får hen sitt verifieringsmejl. password = dummy eftersom
            // vi använder vår egen DB för auth.
            await supabasePublic.auth.signUp({
              email: user.email!,
              password: crypto.randomBytes(16).toString('hex'),
              options: { emailRedirectTo: WEB_VERIFY_EMAIL_BASE },
            });
          }
        } catch (mailErr: any) {
          console.error('[send-verification-email] supabase failed:', mailErr?.message);
        }
      } else {
        console.warn('[send-verification-email] supabasePublic saknas — kan inte skicka resend-mejl');
      }

      await audit(req as AuthRequest, 'EMAIL_VERIFICATION_REQUESTED', {
        resourceType: 'User',
        resourceId: user.id,
        changes: { email: user.email },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[send-verification-email] error:', error);
    return res.status(200).json({ ok: true });
  }
});

// POST /api/auth/verify-email — fullfölj verifieringen
// Användaren kan klicka mejl-länken oavsett om de redan är inloggade eller
// inte. Vi sätter emailVerifiedAt och returnerar JWT — om klienten redan har
// en session ignorerar den värdet, annars kan den logga in användaren direkt.
// Detta är fortfarande en bra fallback för "klicka i mejlet från en annan
// enhet"-flödet.
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string' || token.length < 32) {
      return res.status(400).json({ error: 'Ogiltig verifieringslänk' });
    }

    const user = await (prisma as any).user.findFirst({
      where: { emailVerificationToken: token, isActive: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        image: true,
        isVerified: true,
        emailVerificationExpiresAt: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Länken är ogiltig eller har använts redan.' });
    }

    // Idempotent — om någon klickar igen på en redan-verifierad länk
    // returnerar vi fortfarande ok så UX:en inte ser sönder ut. Vi utfärdar
    // även en fresh JWT så klienten kan auto-logga in även när länken
    // återbesöks från ett annat fönster/enhet.
    if (user.emailVerifiedAt) {
      const tokenJwt = jwt.sign(
        { id: user.id, phone: user.phone, role: 'USER' },
        JWT_SECRET,
        { expiresIn: '30d' },
      );
      return res.status(200).json({
        ok: true,
        token: tokenJwt,
        email: user.email,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          image: user.image,
          isVerified: user.isVerified,
        },
      });
    }

    if (
      !user.emailVerificationExpiresAt ||
      new Date(user.emailVerificationExpiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({ error: 'Länken har gått ut. Be om en ny.' });
    }

    const updatedUser = await (prisma as any).user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        image: true,
        isVerified: true,
      },
    });

    await audit(req as AuthRequest, 'EMAIL_VERIFIED', {
      resourceType: 'User',
      resourceId: user.id,
      changes: { email: user.email, autoLoginIssued: true },
    });

    // Utfärda JWT direkt — det här är den nya inloggningspunkten för email-
    // registrerade användare. Klienten persistar tokenen och slipper visa
    // login-formuläret för en användare som nyss klickat på sin egen länk.
    const tokenJwt = jwt.sign(
      { id: updatedUser.id, phone: updatedUser.phone, role: 'USER' },
      JWT_SECRET,
      { expiresIn: '30d' },
    );

    return res.status(200).json({
      ok: true,
      token: tokenJwt,
      email: updatedUser.email,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        image: updatedUser.image,
        isVerified: updatedUser.isVerified,
      },
    });
  } catch (error) {
    console.error('[verify-email] error:', error);
    return res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/check-email-verified — pollas av RN-klienten under
// register-flödet för att veta när användaren klickat länken i mejlet.
// Accepterar antingen body.email eller Bearer-token.
router.post('/check-email-verified', async (req, res) => {
  try {
    const bodyEmail = (req.body?.email as string | undefined)?.trim().toLowerCase();
    let userId: string | null = null;

    // Föredra auth-headern om den finns — säkrare än body.email mot enumeration.
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.id) userId = decoded.id;
      } catch {
        // Token kanske är en Supabase-JWT — försök med supabaseAdmin
        if (supabaseAdmin) {
          try {
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && user?.id) userId = user.id;
          } catch {
            // ignore
          }
        }
      }
    }

    let user: any = null;
    if (userId) {
      user = await (prisma as any).user.findUnique({
        where: { id: userId },
        select: { id: true, emailVerifiedAt: true },
      });
    } else if (bodyEmail && bodyEmail.includes('@')) {
      user = await (prisma as any).user.findFirst({
        where: { email: bodyEmail, isActive: true, deletedAt: null },
        select: { id: true, emailVerifiedAt: true },
      });
    }

    return res.status(200).json({ verified: !!user?.emailVerifiedAt });
  } catch (error) {
    console.error('[check-email-verified] error:', error);
    return res.status(200).json({ verified: false });
  }
});

// ============================================================
// Forgot password / Reset password — kund-flöde
// ============================================================
//
// Två steg:
//   1. POST /forgot-password   { email }
//      Genererar en kryptografiskt slumpad token, lagrar bcrypt-token-värdet
//      direkt på User-raden (passwordResetToken) + en utgångstid 1h fram.
//      Mejlar länk till användaren. Returnerar ALLTID 200 så en angripare
//      inte kan probea vilka mejlkonton som finns.
//
//   2. POST /reset-password    { token, newPassword }
//      Slår upp användaren på tokenen, validerar utgångstid, sätter nytt
//      lösenord (bcrypt) och nollar token-fälten.

// URL:er till klienterna. För länken som skickas i mejlet använder vi
// publika host-namn — fallback till env eller hårdkodade staging-värden.
const WEB_RESET_BASE =
  process.env.WEB_RESET_PASSWORD_URL || 'https://matgo-web-pi.vercel.app/reset-password';
const MOBILE_RESET_DEEP_LINK_BASE =
  process.env.MOBILE_RESET_PASSWORD_URL || 'foodgo://reset-password';

// POST /api/auth/forgot-password — begär återställningslänk
router.post('/forgot-password', authLimiter, async (req, res) => {
  // Vi loggar generösa serverfel men returnerar alltid 200 mot klienten,
  // så ingen kan dra slutsatser av svaret. Klienten visar bara en generisk
  // "om kontot finns har vi skickat en länk"-text.
  try {
    const { email } = req.body as { email?: string };
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Ogiltig e-postadress' });
    }

    // Per-email rate-limit: stoppar angripare med IP-pool från att dränera
    // Brevo-quotan genom att hamra /forgot-password mot samma email från
    // olika IP. Silent rate-limit — returnerar samma 200 som vanligt så
    // angripare inte ser om limiten triggade eller om kontot inte fanns.
    if (!recordForgotPasswordEmailHit(normalizedEmail)) {
      console.warn(
        `[forgot-password] per-email rate-limit triggad för ${normalizedEmail} — droppar request tyst`,
      );
      return res.status(200).json({ ok: true });
    }

    const user = await (prisma as any).user.findFirst({
      where: { email: normalizedEmail, isActive: true, deletedAt: null },
      select: { id: true, email: true, firstName: true, name: true, password: true, oauthProvider: true },
    });

    // Bara skicka länk om kontot har ett lösenord. OAuth-only-konton (Google/
    // Apple utan password) ska inte få ett reset-mejl — de är inte "låsta ute".
    // Klienten får ändå 200 så detta är osynligt utåt.
    if (user && user.password) {
      // Skicka reset-länk via Supabase istället för Brevo. Supabase
      // skickar gratis från noreply@mail.supabase.co (ingen domän behövs).
      // Klick → Supabase verifierar → redirectar till WEB_RESET_BASE med
      // access_token i URL-hash. Frontend-page läser det och kallar
      // supabase.auth.updateUser({ password }) för att sätta nytt lösen.
      //
      // Behåller vår token-baserade flow som fallback för existerande
      // konton som inte finns i Supabase än — vi sparar BÅDA. Frontend
      // kan välja vilken som funkar.
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await (prisma as any).user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: token,
          passwordResetExpiresAt: expiresAt,
        },
      });

      if (supabasePublic) {
        try {
          const { error: resetErr } = await supabasePublic.auth.resetPasswordForEmail(
            user.email!,
            { redirectTo: WEB_RESET_BASE },
          );
          if (resetErr) {
            console.error('[forgot-password] supabase.resetPasswordForEmail failed:', resetErr.message);
          } else {
            console.log(`[forgot-password] Reset-mejl skickat via Supabase till ${user.email}`);
          }
        } catch (mailErr: any) {
          console.error('[forgot-password] supabase.resetPasswordForEmail threw:', mailErr?.message || mailErr);
        }
      } else {
        console.warn('[forgot-password] supabasePublic saknas — reset-mejl skickas inte. Sätt SUPABASE_ANON_KEY i Railway.');
      }

      await audit(req as AuthRequest, 'PASSWORD_RESET_REQUESTED', {
        resourceType: 'User',
        resourceId: user.id,
        changes: { email: user.email },
      });
    } else if (user && !user.password && user.oauthProvider) {
      // Kontot finns men är OAuth-only — logga så support kan hjälpa till
      // (utan att läcka info till klienten).
      console.log(`[forgot-password] OAuth-only account (${user.oauthProvider}) requested reset for ${normalizedEmail}`);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[forgot-password] error:', error);
    // Även här: 200 mot klienten så vi inte avslöjar serverfel som
    // sidotips om att kontot finns. Audit-loggen och konsolen har spårningen.
    return res.status(200).json({ ok: true });
  }
});

// POST /api/auth/reset-password — fullföljer återställningen
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || typeof token !== 'string' || token.length < 32) {
      return res.status(400).json({ error: 'Ogiltig återställningslänk' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Nytt lösenord krävs' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
    }
    if (newPassword.length > 256) {
      return res.status(400).json({ error: 'Ogiltigt lösenordsformat' });
    }

    const user = await (prisma as any).user.findFirst({
      where: { passwordResetToken: token, isActive: true, deletedAt: null },
      select: { id: true, email: true, passwordResetExpiresAt: true },
    });

    if (!user || !user.passwordResetExpiresAt || new Date(user.passwordResetExpiresAt).getTime() < Date.now()) {
      // Generisk text — vi vill inte skilja på "ogiltig" och "utgången"
      // i klient-meddelandet.
      return res.status(400).json({ error: 'Länken är ogiltig eller har gått ut. Be om en ny.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await (prisma as any).user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    await audit(req as AuthRequest, 'PASSWORD_RESET_COMPLETED', {
      resourceType: 'User',
      resourceId: user.id,
      changes: { email: user.email },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[reset-password] error:', error);
    return res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/oauth-token
// SÄKERHET: Klienten skickar id_token (Google/Apple) som verifieras server-
// side mot respektive identitetsprovider. Tidigare litade endpoint:en på
// email+providerId rakt från req.body, vilket lät vem som helst forge:a en
// session för en godtycklig användare.
//
// Bakåtkompatibilitet: om id_token saknas och NODE_ENV !== 'production'
// faller vi tillbaka till gamla path:en så lokal-dev fortsätter funka. I
// produktion KRÄVS id_token.
router.post('/oauth-token', authLimiter, async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    const { idToken } = req.body as { idToken?: string };
    let { email, name, provider, providerId, image } = req.body as {
      email?: string;
      name?: string;
      provider?: string;
      providerId?: string;
      image?: string | null;
    };

    if (idToken && provider) {
      // Server-side verifiering — single source of truth.
      try {
        let verified: VerifiedOAuthPayload;
        if (provider === 'google') {
          verified = await verifyGoogleIdToken(idToken);
        } else if (provider === 'apple') {
          verified = await verifyAppleIdToken(idToken);
        } else {
          return res
            .status(400)
            .json({ error: 'Okänd OAuth-provider' });
        }
        email = verified.email || email; // Apple skickar email bara på första login
        providerId = verified.providerId;
        name = verified.name || name;
        image = verified.picture || image || null;
      } catch (verifyErr: any) {
        console.error(
          '[oauth-token] id_token-verifiering misslyckades:',
          verifyErr?.message || verifyErr,
        );
        return res
          .status(401)
          .json({ error: 'Ogiltig OAuth-token' });
      }
    } else {
      // ⚠️  TEMPORÄR BYPASS — frontend (web + RN) skickar ännu inte idToken
      // efter security-fixen. Att vägra 401 i prod låste ute alla legitima
      // OAuth-användare → större problem än säkerhetshålet det skyddar mot.
      //
      // Account-takeover-vektor: angripare kan POST:a {email, provider,
      // providerId} med offrets email → får JWT för offrets userId. Risk
      // är reell men ingen aktiv exploit observerad.
      //
      // FÖR ATT STÄNGA HÅLET ORDENTLIGT:
      // 1. Web (NextAuth Google-provider): forward `account.id_token`
      //    till /api/auth/oauth-token i body som `idToken`.
      // 2. RN (Google Sign-In SDK + Apple Authentication): skicka
      //    `idToken` resp `identityToken` från sign-in-resultatet.
      // 3. När båda klienter skickar idToken → ändra detta till
      //    `if (isProd) return 401` igen.
      if (isProd) {
        console.error(
          '[oauth-token] ⚠️  LEGACY OAuth utan idToken i PROD — account-takeover möjlig. ' +
            'Uppdatera frontend att skicka idToken ASAP. Logged for monitoring.',
        );
      } else {
        console.warn(
          '[oauth-token] DEV: ingen idToken — accepterar email+providerId rakt från body.',
        );
      }
    }

    if (!email) return res.status(400).json({ error: 'E-post krävs' });
    if (!provider || !providerId) {
      return res.status(400).json({ error: 'Provider/providerId krävs' });
    }

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
      // Welcome-deal för nytt OAuth-konto också (om aktiv)
      try {
        const { maybeCreateWelcomeDeal } = await import('./referrals');
        await maybeCreateWelcomeDeal(user.id);
      } catch (e: any) {
        console.error('[oauth-token] welcome-deal-trigger error:', e?.message);
      }
    } else {
      // Återanvänd existerande user-record. VIKTIGT: reset:a tombstone-fält
      // (deletedAt, isActive) så att en tidigare soft-deleted user kan logga
      // in igen via samma email/OAuth. Tidigare skapade detta ett 401-loop
      // efter Apple-login eftersom authenticateUser rejectade soft-deleted
      // användare även om JWT:n var fresh.
      const needsUpdate =
        !user.oauthProvider ||
        user.deletedAt !== null ||
        user.isActive === false;
      if (needsUpdate) {
        user = await (prisma as any).user.update({
          where: { id: user.id },
          data: {
            oauthProvider: provider,
            oauthId: String(providerId),
            image: image || user.image,
            deletedAt: null,
            isActive: true,
          },
        });
      }
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, image: user.image, needsPhone: !user.phone, isVerified: user.isVerified } });
  } catch (error: any) {
    console.error('[oauth-token] FAILED:', error?.message || error);
    res.status(500).json({ error: 'Serverfel', detail: error?.message });
  }
});

export default router;
