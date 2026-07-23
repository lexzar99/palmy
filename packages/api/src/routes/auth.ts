import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import { cached } from '../lib/ttlCache';
import { getRestaurantAdminLogin, normalizeAdminLoginAlias } from '../lib/adminLogin';
import supabaseAdmin from '../lib/supabase';
import { authenticate, resolveAdminSessionFromToken } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { sendHermesAlert } from '../lib/hermesAlerts';
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
import {
  adminSessionTokenFromRequest,
  verifyAdminSessionToken,
} from '../lib/adminSessionVerification';
import {
  customerAuthMethod,
  hasVerifiedSupabasePhone,
  localCustomerAuthMethod,
} from '../lib/customerAuthPolicy';
import {
  getCachedCustomerIdentity,
  setCachedCustomerIdentity,
} from '../lib/customerIdentityCache';

const router = Router();

// Kundkonton använder endast verifierad telefon-OTP eller Google/Apple OAuth.
// Adminens separata lösenord + 2FA-flöde (/login) påverkas inte. Guard-en ligger
// före alla handlers så gamla webb-/appversioner aldrig kan återaktivera de
// avvecklade lösenords- eller mejllänksflödena via /api/auth eller /api/account.
export const RETIRED_CUSTOMER_AUTH_PATHS = new Set([
  '/register-user',
  '/login-user',
  '/send-verification-email',
  '/verify-email',
  '/check-email-verified',
  '/forgot-password',
  '/reset-password',
]);

router.use((req, res, next) => {
  if (!RETIRED_CUSTOMER_AUTH_PATHS.has(req.path)) return next();
  res.set('Cache-Control', 'no-store');
  return res.status(410).json({
    error: 'Detta kundflöde är avvecklat. Logga in med telefon, Google eller Apple.',
    code: 'CUSTOMER_PASSWORD_AUTH_RETIRED',
  });
});

const AI_AGENT_LOGIN_IDS = new Set([
  'falken@viaeats.se',
  'kundvakten@viaeats.se',
  'kocken@viaeats.se',
  'studion@viaeats.se',
  'torget@viaeats.se',
]);

const isAiAgentLogin = (req: any) => {
  const loginId = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase();
  return AI_AGENT_LOGIN_IDS.has(loginId);
};

// ── Rate-limit på auth-endpoints ────────────────────────────────────────────
// snabbt flöde: 10 försök per IP per 10 min → 5 min lockout. Generöst nog
// att fat-fingers inte låser ute riktiga användare, snålt nog att stoppa bots.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minuter
  max: (req) => (isAiAgentLogin(req) ? 120 : 10),
  standardHeaders: true, // returnerar RateLimit-* headers
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: 'För många försök. Försök igen om några minuter.',
    retryAfter: 300, // klient kan visa nedräkning (5 min)
  },
});

// Always store/compare phone in E.164 format (+46...). Handles legacy records without +.
function normalizePhone(phone: string): string {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (raw.startsWith('00')) return `+${digits.slice(2)}`;
  return digits.startsWith('0') ? `+46${digits.slice(1)}` : `+${digits}`;
}

// Returns all variants of a phone to search across legacy and normalized formats.
function phoneVariants(phone: string): string[] {
  const n = normalizePhone(phone);
  return [n, n.slice(1)]; // e.g. ["+46701234567", "46701234567"]
}

// ── OAuth id_token-verifiering ──────────────────────────────────────────────
// Google: stödjer en eller flera client-id:n (web/ios/android) — comma-sep i
// GOOGLE_OAUTH_CLIENT_ID. verifyIdToken accepterar antingen string eller
// array som audience.
const GOOGLE_OAUTH_CLIENT_IDS = (process.env.GOOGLE_OAUTH_CLIENT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const APPLE_OAUTH_CLIENT_IDS = [
  process.env.APPLE_OAUTH_CLIENT_ID,
  process.env.APPLE_IOS_BUNDLE_ID,
  process.env.APPLE_OAUTH_CLIENT_IDS,
  'se.viaeats.swift',
]
  .flatMap((value) => (value || '').split(','))
  .map((s) => s.trim())
  .filter(Boolean);

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
  if (!APPLE_OAUTH_CLIENT_IDS.length) {
    throw new Error('Apple OAuth audience är inte konfigurerad');
  }
  const appleAudiences = APPLE_OAUTH_CLIENT_IDS as [string, ...string[]];
  const decoded: any = await new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      appleGetKey,
      {
        algorithms: ['RS256'],
        audience: appleAudiences,
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

type VerifiedSupabaseOAuthPayload = VerifiedOAuthPayload & {
  provider: 'google' | 'apple';
};

/**
 * Verifiera Supabase OAuth-sessionen server-side. Webben och native Google
 * använder Supabase hosted OAuth och får därför en access token, inte alltid
 * leverantörens råa id_token. E-post/provider-id från request-body är aldrig
 * en identitetskälla.
 */
async function verifySupabaseOAuthToken(
  accessToken: string,
): Promise<VerifiedSupabaseOAuthPayload> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin auth är inte konfigurerad');
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) {
    throw new Error('Ogiltig Supabase-session');
  }

  const provider = String(user.app_metadata?.provider || '').toLowerCase();
  if (provider !== 'google' && provider !== 'apple') {
    throw new Error('Sessionen kommer inte från en tillåten OAuth-provider');
  }

  const meta = user.user_metadata || {};
  const first = String(meta.first_name || meta.given_name || '').trim();
  const last = String(meta.last_name || meta.family_name || '').trim();
  const name = String(meta.full_name || meta.name || [first, last].filter(Boolean).join(' ')).trim();

  return {
    provider,
    email: user.email || null,
    providerId: user.id,
    name: name || null,
    picture: String(meta.avatar_url || meta.picture || '').trim() || null,
    emailVerified: Boolean(user.email_confirmed_at),
  };
}

async function resolveAdminByIdentifier(loginId: string) {
  const directAdmin = await prisma.adminUser.findFirst({
    where: { email: loginId, isActive: true },
  });

  if (directAdmin) {
    return directAdmin;
  }

  // Inloggning med e-post (case-insensitivt) eller användarnamn (handle).
  const lowered = loginId.trim().toLowerCase();
  if (lowered) {
    const byEmailOrUsername = await prisma.adminUser.findFirst({
      where: {
        isActive: true,
        OR: [{ email: lowered }, { username: lowered }],
      },
    });
    if (byEmailOrUsername) {
      return byEmailOrUsername;
    }
  }

  const normalizedLoginId = normalizeAdminLoginAlias(loginId);
  if (!normalizedLoginId) {
    return null;
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { archivedAt: null },
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
// Routes som en OAuth-only user (Google/Apple men ingen telefon) får träffa
// innan den godkända SMS-OTP-verifieringen är klar.
const PHONE_LINKING_ALLOWED_PATHS = new Set<string>([
  '/api/profile',
  '/api/auth/me',
  '/api/auth/lookup-phone',
]);

export const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Logga in först' });
  }
  const token = authHeader.split(' ')[1];

  // Fast path: skip Supabase validation + the multi-query identity upsert, but
  // still read the tiny local account-state row. That single indexed lookup is
  // what makes deletion/ban immediate across every API replica; a process-local
  // cache alone could otherwise authorize a deleted account for its full TTL.
  const cachedIdentity = getCachedCustomerIdentity(token);
  if (cachedIdentity) {
    const accountState = await (prisma as any).user.findUnique({
      where: { id: cachedIdentity.id },
      select: { deletedAt: true, isActive: true },
    }).catch(() => null);
    if (!accountState || accountState.deletedAt) {
      return res.status(401).json({ error: 'Konto borttaget' });
    }
    if (accountState.isActive === false) {
      return res.status(401).json({ error: 'Konto avstängt' });
    }
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
        const authMethod = customerAuthMethod(user);
        if (!authMethod) {
          return res.status(401).json({
            error: 'Logga in med telefon, Google eller Apple',
            code: 'CUSTOMER_AUTH_METHOD_NOT_ALLOWED',
          });
        }
        // A Supabase access token can remain locally cached after an account
        // deletion. The local tombstone is authoritative: request middleware
        // must never revive it. A future explicit signup goes through the
        // dedicated auth flow after the Supabase identity has been removed.
        const tombstone = await (prisma as any).user.findUnique({
          where: { id: user.id },
          select: { deletedAt: true, isActive: true, firstName: true, lastName: true },
        }).catch(() => null);

        // ID-mismatch-fix för importerade/äldre User-rader med cuid() medan
        // Supabase auth.users har UUID. Om id inte matchar någon User i vår
        // DB, men email matchar → samma person, bara olika historiska id:n.
        // Då länkar vi till den befintliga raden och använder Supabase-status.
        // Annars skulle vi skapa en SEKUNDÄR User-row och användaren skulle
        // ha två konton i parallell — buggen som gav "isVerified=false trots
        // verifierad email".
        const verifiedSupabaseEmail = user.email && user.email_confirmed_at
          ? user.email.toLowerCase()
          : null;
        let resolvedUserId = user.id;
        if (!tombstone && verifiedSupabaseEmail) {
          const existingByEmail = await (prisma as any).user.findFirst({
            where: { email: verifiedSupabaseEmail, deletedAt: null },
            select: { id: true, isVerified: true, isActive: true },
          }).catch(() => null);
          if (existingByEmail) {
            if (existingByEmail.isActive === false) {
              return res.status(401).json({ error: 'Konto avstängt' });
            }
            resolvedUserId = existingByEmail.id;
            // Den här länken görs enbart via en uttryckligen bekräftad e-post.
            // Ett bekräftat telefonnummer får aldrig attestera en e-postadress.
            if (!existingByEmail.isVerified) {
              await (prisma as any).user.update({
                where: { id: existingByEmail.id },
                data: { isVerified: true },
              }).catch(() => null);
              console.log(`[auth] User ${existingByEmail.id} (email=${verifiedSupabaseEmail}) markerad som verifierad via Supabase`);
            }
            req.user = { id: resolvedUserId, email: verifiedSupabaseEmail, phone: null, role: 'USER' };
            setCachedCustomerIdentity(token, req.user);
            return next();
          }
        }

        if (tombstone?.isActive === false) {
          // Permanent block — admin set isActive=false. Reject without revival.
          return res.status(401).json({ error: 'Konto avstängt' });
        }
        if (tombstone?.deletedAt) {
          return res.status(401).json({ error: 'Konto borttaget' });
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
          if (existingByPhone.isActive === false) {
            return res.status(401).json({ error: 'Konto avstängt' });
          }
          // Merge: keep the richer existing record, normalise phone and mark verified.
          await (prisma as any).user.update({
            where: { id: existingByPhone.id },
            data: {
              phone: normalizedPhone,
              isVerified: true,
              email: verifiedSupabaseEmail || existingByPhone.email || undefined,
              name: user.user_metadata?.name || user.user_metadata?.full_name || existingByPhone.name || undefined,
              image: user.user_metadata?.avatar_url || user.user_metadata?.picture || existingByPhone.image || undefined,
              oauthProvider: existingByPhone.oauthProvider || authMethod,
              oauthId: existingByPhone.oauthId || user.id,
            },
          }).catch(() => null);
          req.user = { id: existingByPhone.id, email: existingByPhone.email, phone: normalizedPhone, role: 'USER' };
          setCachedCustomerIdentity(token, req.user);
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

        const upsertedUser = await (prisma as any).user.upsert({
          where: { id: user.id },
          update: {
            email: verifiedSupabaseEmail || undefined,
            image: sbImage || undefined,
            phone: normalizedPhone || undefined,
            isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at || undefined,
            oauthProvider: authMethod,
            // Names: ONLY fill in if the DB row currently has nothing. This
            // satisfies "never overwrite stored name from Apple". Prisma
            // doesn't have a native conditional-update so we backfill via a
            // separate updateMany below — the upsert leaves them untouched.
          },
          create: {
            id: user.id,
            email: verifiedSupabaseEmail,
            // Empty string when nothing came from the OAuth provider — the
            // client detects `needsName: true` from GET /api/profile and
            // prompts the user. NEVER use "Användare" or any other
            // placeholder; the user explicitly does not want a fallback name.
            name: sbName ?? '',
            firstName: sbFirst,
            lastName: sbLast,
            image: sbImage,
            phone: normalizedPhone ?? null,
            oauthProvider: authMethod,
            oauthId: user.id,
            isVerified: !!user.phone_confirmed_at || !!user.email_confirmed_at,
          },
        }).catch(() => null);
        if (!wasExistingUser && upsertedUser) {
          void sendHermesAlert({
            source: 'viaeats-auth',
            type: 'customer:new',
            severity: 'info',
            userId: user.id,
            customerName: sbName,
            customerPhone: normalizedPhone,
            customerEmail: user.email || null,
            method: authMethod,
            text: `Ny kund registrerad: ${sbName || normalizedPhone || user.email || user.id}.`,
          });
        }

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
        setCachedCustomerIdentity(token, req.user);
        return next();
      }
    } catch {
      // Fall through to legacy JWT
    }
  }

  // ── 2. Fall back to legacy custom JWT ────────────────────────────────────
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    if (payload?.role !== 'USER' || typeof payload?.id !== 'string' || !payload.id) {
      return res.status(401).json({ error: 'Ogiltig kundsession' });
    }
    const account = await (prisma as any).user.findUnique({
      where: { id: payload.id },
      select: {
        deletedAt: true,
        isActive: true,
        phone: true,
        isVerified: true,
        oauthProvider: true,
      },
    }).catch(() => null);
    if (account?.deletedAt) {
      return res.status(401).json({ error: 'Konto borttaget' });
    }
    if (!account || account.isActive === false) {
      return res.status(401).json({ error: 'Konto avstängt' });
    }
    if (!localCustomerAuthMethod(account)) {
      return res.status(401).json({
        error: 'Logga in med telefon, Google eller Apple',
        code: 'CUSTOMER_AUTH_METHOD_NOT_ALLOWED',
      });
    }
    req.user = payload;
    setCachedCustomerIdentity(token, req.user);
    return next();
  } catch {
    return res.status(401).json({ error: 'Session utgången' });
  }
};

export const authenticateUserOptional = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  return authenticateUser(req, res, next);
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

// Kundinloggning är lösenordsfri: telefon-OTP sker i Supabase och byts mot
// plattformstoken via /phone-token. Google/Apple använder /oauth-token.

// POST /api/auth/lookup-phone
router.post('/lookup-phone', authLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefonnummer krävs' });

    const user = await (prisma as any).user.findFirst({
      where: { phone: { in: phoneVariants(phone) } },
      select: { id: true, phone: true, email: true, isVerified: true, oauthProvider: true },
    });

    res.json({
      exists: Boolean(user),
      phone,
      hasFullAccount: Boolean(user && (user.oauthProvider || user.isVerified)),
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
// Profil-teaser för det stegvisa login-flödet: användarnamn → visa namn +
// avatar innan lösenordssteget. Svarar ALLTID 200 med samma form så svaret
// i sig inte bekräftar om kontot finns; hårt rate-limitat via authLimiter.
router.post('/login-profile', authLimiter, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { identifier } = req.body as { identifier?: string };
    const loginId = String(identifier || '').trim().toLowerCase();
    if (!loginId) {
      res.status(400).json({ error: 'Användarnamn krävs' });
      return;
    }
    const admin = await resolveAdminByIdentifier(loginId);
    res.json({
      name: admin?.name || null,
      avatarUrl: (admin as { avatarUrl?: string | null } | null)?.avatarUrl || null,
    });
  } catch (error) {
    console.error('Login profile error:', error);
    res.json({ name: null, avatarUrl: null });
  }
});

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
    // GLOBAL_VIEWER/MENU_AGENT (Hermes-systemkonton) har inget restaurang-
    // scope: global read, skrivrätter gates av autoRoleGate + draft-gaten.
    if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'GLOBAL_VIEWER' && admin.role !== 'MENU_AGENT' && admin.role !== 'GROWTH_AGENT') {
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          archivedAt: null,
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

    // HttpOnly cookie — primary auth method. office.viaeats.se och
    // api.viaeats.se är cross-origin men SAME-SITE, så Lax fungerar för fetch
    // och stänger samtidigt ute cross-site CSRF från andra domäner.
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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

    res.json({
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
  res.clearCookie('admin_token', {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
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
    res.clearCookie('admin_token', {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
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
    const otpauthUrl = generateURI({ label: req.admin?.email || 'admin', issuer: 'ViaEats Admin', secret });
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
      where: { slug: email, archivedAt: null },
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
  res.set('Cache-Control', 'no-store');

  const token = adminSessionTokenFromRequest(req, { allowLegacyBodyToken: true });
  const result = await verifyAdminSessionToken(token, resolveAdminSessionFromToken);

  if (result.status === 500) {
    console.error('[auth/verify] session resolver failed:', result.cause);
  }

  res.status(result.status).json(result.body);
});

// POST /api/auth/oauth-token
// SÄKERHET: Klienten skickar id_token (Google/Apple) som verifieras server-
// side mot respektive identitetsprovider. Tidigare litade endpoint:en på
// email+providerId rakt från req.body, vilket lät vem som helst forge:a en
// session för en godtycklig användare.
//
// Antingen krävs ett provider-verifierat id_token eller en verifierad
// Supabase OAuth-session. Request-body-identitet accepteras aldrig.
router.post('/oauth-token', authLimiter, async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    let { name, provider, providerId, image } = req.body as {
      name?: string;
      provider?: string;
      providerId?: string;
      image?: string | null;
    };
    let email: string | undefined;
    let emailVerified = false;

    const authHeader = req.headers.authorization;
    const supabaseAccessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

    if (supabaseAccessToken) {
      try {
        const verified = await verifySupabaseOAuthToken(supabaseAccessToken);
        if (provider && provider !== 'supabase' && provider !== verified.provider) {
          return res.status(401).json({ error: 'OAuth-provider matchar inte sessionen' });
        }
        provider = verified.provider;
        email = verified.email || undefined;
        emailVerified = verified.emailVerified;
        providerId = verified.providerId;
        name = verified.name || name;
        image = verified.picture || image || null;
      } catch (verifyErr: any) {
        console.error(
          '[oauth-token] Supabase-session kunde inte verifieras:',
          verifyErr?.message || verifyErr,
        );
        return res.status(401).json({ error: 'Ogiltig OAuth-session' });
      }
    } else if (idToken && provider) {
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
        // Request-body email is never an identity source. Apple may omit email
        // after the first authorization; exact provider+sub lookup below still
        // lets that returning customer sign in safely.
        email = verified.email || undefined;
        emailVerified = verified.emailVerified;
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
      // Body-fälten email/providerId är användardata och bevisar ingen
      // identitet. Fail closed i alla miljöer så en osäker dev-path aldrig
      // råkar nå produktion igen.
      return res.status(401).json({
        error: 'Verifierad OAuth-token eller Supabase-session krävs',
      });
    }

    if (!provider || !providerId) {
      return res.status(400).json({ error: 'Provider/providerId krävs' });
    }

    // First resolve the cryptographically verified provider identity. Email is
    // only allowed as an account-linking key when the provider attested it.
    let matchedByVerifiedEmail = false;
    let user = await (prisma as any).user.findFirst({
      where: { oauthProvider: provider, oauthId: String(providerId) },
    });
    if (!user && email && emailVerified) {
      user = await (prisma as any).user.findFirst({
        where: { email: email.toLowerCase() },
      });
      matchedByVerifiedEmail = Boolean(user);
    }

    if (!user) {
      if (!email || !emailVerified) {
        return res.status(400).json({
          error: 'Verifierad e-post krävs när ett nytt OAuth-konto skapas',
        });
      }
      user = await (prisma as any).user.create({
        data: {
          email: email.toLowerCase(),
          // Använd ALDRIG email-prefixet som namn. Apple "Dölj min e-post" ger
          // ett slump-relä (slumphash@privaterelay.appleid.com) → prefixet blev
          // ett "random namn". Saknas riktigt namn lämnar vi det tomt så profil-
          // grinden ber användaren fylla i det.
          name: (name || '').trim(),
          oauthProvider: provider,
          oauthId: String(providerId),
          image: image || null,
          phone: null,
        }
      });
      void sendHermesAlert({
        source: 'viaeats-auth',
        type: 'customer:new',
        severity: 'info',
        userId: user.id,
        customerName: user.name,
        customerPhone: user.phone,
        customerEmail: user.email,
        method: provider,
        text: `Ny kund registrerad via ${provider}: ${user.name || 'namn saknas'}${user.email ? `, ${user.email}` : ''}.`,
      });
      // Welcome-deal för nytt OAuth-konto också (om aktiv)
      try {
        const { maybeCreateWelcomeDeal } = await import('./referrals');
        await maybeCreateWelcomeDeal(user.id);
      } catch (e: any) {
        console.error('[oauth-token] welcome-deal-trigger error:', e?.message);
      }
    } else {
      if (user.isActive === false) {
        return res.status(403).json({ error: 'Konto avstängt' });
      }

      // User has one legacy provider slot. Prefer Apple's sub after a verified
      // email match because Apple may omit email on later logins; Google keeps
      // resolving safely by its provider-verified email. This makes switching
      // between Google and Apple stable without weakening email linking.
      const providerIdentityDiffers =
        user.oauthProvider !== provider || user.oauthId !== String(providerId);
      const shouldReplaceProviderIdentity =
        providerIdentityDiffers &&
        (!user.oauthProvider ||
          (matchedByVerifiedEmail &&
            (provider === 'apple' || user.oauthProvider !== 'apple')));

      // A user-initiated soft deletion may register again with the same
      // verified provider. An admin-deactivated account is never reactivated.
      const needsUpdate =
        shouldReplaceProviderIdentity ||
        user.deletedAt !== null ||
        Boolean(emailVerified && email && user.email !== email.toLowerCase());
      if (needsUpdate) {
        user = await (prisma as any).user.update({
          where: { id: user.id },
          data: {
            ...(shouldReplaceProviderIdentity
              ? { oauthProvider: provider, oauthId: String(providerId) }
              : {}),
            image: image || user.image,
            email: emailVerified && email ? email.toLowerCase() : user.email,
            deletedAt: null,
          },
        });
      }
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, image: user.image, needsPhone: !user.phone, isVerified: user.isVerified } });
  } catch (error: any) {
    console.error('[oauth-token] FAILED:', error?.message || error);
    res.status(500).json({
      error: 'Serverfel',
      ...(process.env.NODE_ENV !== 'production' ? { detail: error?.message } : {}),
    });
  }
});

// POST /api/auth/phone-token — byt en verifierad Supabase phone-session (SMS-OTP)
// mot ett långlivat platform-JWT. authenticateUser validerar Supabase-token
// server-side (getUser) och upsertar User:n via telefon-vägen → säkert: OTP +
// Supabase-token bevisar nummerägande. Driver lösenordsfri telefon-inloggning
// (web + RN). Telefon-konton saknar e-post, så oauth-token (email-keyad) duger ej.
router.post('/phone-token', authenticateUser, async (req: any, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Telefoninloggning är inte konfigurerad' });
    }
    const authHeader = String(req.headers.authorization || '');
    const supabaseAccessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';
    const { data: { user: supabaseUser }, error: supabaseError } = await cached(
      'auth:sb',
      supabaseAccessToken,
      30_000,
      () => supabaseAdmin!.auth.getUser(supabaseAccessToken),
    );
    if (supabaseError || !supabaseUser || !hasVerifiedSupabasePhone(supabaseUser)) {
      return res.status(401).json({
        error: 'En verifierad SMS-session krävs',
        code: 'VERIFIED_PHONE_SESSION_REQUIRED',
      });
    }

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Ej inloggad' });
    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, image: true, isVerified: true },
    });
    if (!user) return res.status(404).json({ error: 'Konto saknas' });
    const verifiedPhone = normalizePhone(supabaseUser.phone!);
    if (!user.phone || normalizePhone(user.phone) !== verifiedPhone) {
      return res.status(409).json({
        error: 'Det verifierade numret matchar inte kundkontot',
        code: 'VERIFIED_PHONE_MISMATCH',
      });
    }
    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email, image: user.image, needsPhone: !user.phone, isVerified: user.isVerified },
    });
  } catch (error: any) {
    console.error('[phone-token] FAILED:', error?.message || error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
