import 'dotenv/config';

// Sentry — måste init:as ALLRA FÖRST, innan andra imports som kan trigga
// errors. När SENTRY_DSN saknas är init() en no-op och Sentry-anrop nedan
// blir tysta. Detta gör att utvecklare lokalt slipper Sentry-aktivitet.
import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Sample 10% av transactions för performance monitoring — free-tier
    // räcker länge med detta. Höj/sänk efter behov.
    tracesSampleRate: 0.1,
    // 100% av errors (de är viktiga)
    sampleRate: 1.0,
  });
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './lib/logger';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

import menuRoutes from './routes/menu';
import mapsStatsRoutes from './routes/mapsStats';
import placesRoutes from './routes/places';
import sponsorsRoutes from './routes/sponsors';
import restaurantTagsRoutes from './routes/restaurantTags';
import showcaseAdminRoutes from './routes/showcaseAdmin';
import adsRoutes from './routes/ads';
import contentPlacementsRoutes from './routes/contentPlacements';
import pushRoutes from './routes/push';
import homeCategoriesRoutes from './routes/homeCategories';
import launchRoutes from './routes/launch';
import orderRoutes from './routes/orders';
import adminRoutes from './routes/admin';
import companyLookupRoutes from './routes/companyLookup';
import controlCenterRoutes from './routes/controlCenter';
import authRoutes from './routes/auth';
import terminalRoutes from './routes/terminal';
// Kompatibilitetsrouter för Stripes gamla webhook-URL. Gamla klient-endpoints
// är pensionerade; alla aktiva klienter använder provider-neutrala API:t.
import legacyPaymentClientRoutes from './routes/paymentsLegacyClient';
import paymentRoutes from './routes/payments';
import discountRoutes from './routes/discount';
import settingsRoutes from './routes/settings';
import dealsRoutes from './routes/deals';
import homePulseRoutes from './routes/homePulse';
import restaurantsRoutes from './routes/restaurants';
import citiesRoutes from './routes/cities';
import profileRoutes from './routes/profile';
import customerRoutes from './routes/customers';
import campaignRoutes from './routes/campaigns';
import deliveryRoutes from './routes/delivery';
import reportRoutes from './routes/reports';
import uploadRoutes from './routes/upload';
import notificationRoutes from './routes/notifications';
import payoutsRoutes from './routes/payouts';
import financeRoutes from './routes/finance';
import courierRoutes, { adminCourierRouter, courierApplicationPublicRouter, adminCourierApplicationRouter } from './routes/courier';
import reviewsAdminRoutes from './routes/reviewsAdmin';
import printingRoutes from './routes/printing';
import referralsRoutes, { publicRouter as referralsPublic, adminRouter as referralsAdmin } from './routes/referrals';
import inviteRoutes, { publicInviteRouter } from './routes/invite';
import paymentMethodsRoutes from './routes/paymentMethods';
import apiHealthAdminRoutes from './routes/apiHealthAdmin';
import opsAdminRoutes from './routes/opsAdmin';
import hermesRoutes from './routes/hermes';
import { recordRateLimitHit, recordRequest } from './lib/opsMetrics';
import { opsAgentRateId } from './lib/opsAgentRateLimit';
import { trustedClientIp, isVerifiedAgentLogin } from './lib/edgeTrust';
import { ensureDefaultSuperAdmin, ensureRestaurantAdmins } from './lib/bootstrapAuth';
import { runDailyCleanup } from './lib/cleanup';
import { startStripeRefundSync } from './lib/stripeReconcile';
import { startPaymentReconciliation } from './lib/payments/reconcile';
import { startLiveActivityFinalizer } from './lib/liveActivityFinalize';
import { logApnsBootStatus } from './lib/liveActivityPush';
import { checkAllRestaurantsStatus } from './lib/restaurantStatus';
import { isOriginAllowed } from './lib/config';
import { ensureDefaultHomeCategorySections } from './lib/homeCategorySections';
import { resolveAdminSessionFromToken } from './middleware/auth';
import prisma from './lib/prisma';
import {
  assertRuntimeCriticalConfiguration,
  getLaunchConfigIssues,
  getPublicApiBaseUrl,
} from './lib/launchReadiness';
import { getLaunchDatabaseSchemaIssues } from './lib/launchDatabaseReadiness';
import {
  getCustomerNotificationWorkerIssues,
  startCustomerNotificationWorkers,
} from './lib/customerNotificationWorkers';
import { validOrderId, verifyOrderAccessProof } from './lib/orderAccess';
import { cookieFromHeader, isPaymentWebhookRequest } from './lib/requestSecurity';
import { PRELAUNCH_ACCESS_HEADER, prelaunchModeEnabled, validPrelaunchProof } from './lib/prelaunchAccess';
import { isAppClient } from './lib/clientPlatform';
import { KIOSK_ACCESS_HEADER, validKioskAccessProof } from './lib/kioskAccess';

// Checkout får aldrig starta med en okänd eller okonfigurerad aktiv PSP.
// Övriga launchkrav rapporteras på /ready utan att skapa en restart-loop.
assertRuntimeCriticalConfiguration();

const app = express();
app.set('trust proxy', 1); // Trust Railway's proxy
const httpServer = createServer(app);

import { initSocket, getIO } from './lib/socket';

for (const issue of getLaunchConfigIssues()) {
  const line = `[launch-readiness] ${issue.key}: ${issue.message}`;
  if (issue.severity === 'error') console.error(`❌ ${line}`);
  else console.warn(`⚠️ ${line}`);
}
const corsOptions: cors.CorsOptions = {
  origin: (origin: any, callback: any) => {
    // Strikt allow-list via isOriginAllowed:
    //  - Browser-origin måste finnas exakt i allow-listan.
    //  - Dev tillåter även localhost/192.168.*.
    //  - Server/native/webhook utan Origin tillåts; de autentiseras separat.
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      // VIKTIGT: callback(null, false) istället för callback(new Error(...)).
      // Error propagerar upp som 500 internal server error i Express (synligt
      // i Sentry/Railway-logs som "uncaught"), och klienten ser "Kan inte
      // nå servern". `false` returnerar bara request UTAN CORS-headers,
      // browsern blockar då med en ren CORS-error utan att backend kraschar.
      console.warn(`🚫 CORS blocked origin: ${origin || '(missing)'}`);
      callback(null, false);
    }
  },
  credentials: true,
};

// Socket.IO setup — async pga Redis-adapter-anslutning. Vi väntar inte på
// resultatet eftersom Redis-fail ska inte blockera startup (fallback till
// in-memory). initSocket loggar status själv.
void initSocket(httpServer, {
  cors: corsOptions,
});

// Middleware
// CSP är en backend-API, så scripts/styles serveras inte härifrån — vi blockerar
// allt utom det API:et självt behöver (own origin för felmeddelanden,
// Stripe.js för card-element callbacks i webhooks, data: för base64-images i
// receipt-rendering, R2/CDN för bilder via https:-jokern i imgSrc).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      connectSrc: [
        "'self'",
        "https://api.stripe.com",
        "https://*.supabase.co",
        "wss:",
        "ws:",
      ],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
app.use(cors(corsOptions));
app.use(compression());

// Request-loggning (måste komma efter cors/helmet så vi har en chans att logga,
// men före routes så vi får request-ID i alla downstream calls)
app.use(requestLogger);

// Stripes gamla kompatibilitets-webhook behöver rå body. Mollies webhook är
// form-encoded (id=tr_…) och hanteras av den globala express.urlencoded nedan.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
// Stripe hosted Checkout-provider använder /webhooks/stripe och behöver också rå body.
app.use('/api/payments/webhooks/stripe', express.raw({ type: 'application/json' }));
// Adyen-webhooken kräver rå body för HMAC-verifiering (annars konsumerar express.json den).
app.use('/api/payments/webhooks/adyen', express.raw({ type: 'application/json' }));
// Leveransbevis kan innehålla ett base64-foto på högst 6 MB (~8 MB som
// data-URL). Ge bara den smala kurir-routen det större JSON-taket. Multipart-
// bilduppladdningar parsas av multer med en separat 15 MB filgräns.
app.use('/api/courier/deliveries', express.json({ limit: '9mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
// Cookie-parser — för admin_token (HttpOnly) som middleware/auth.ts läser
app.use(cookieParser());

// Static files
app.use(express.static('public'));

// Rate limiting
// Konsoliderade Hermes-agenter (2026-07-24): ett konto per uppdrag.
// Kocken äger meny+bild (fd Studion), Falken driftövervakning (fd Kund-
// vakten), Torget tillväxt. Fd-kontona är avaktiverade i DB, inte raderade.
const AI_AGENT_LOGIN_IDS = new Set([
  'falken@viaeats.se',
  'kocken@viaeats.se',
  'torget@viaeats.se',
]);

const loginIdFromBody = (body: any) =>
  String(body?.identifier || body?.email || '').trim().toLowerCase();

// Höjd login-budget kräver en delad agent-hemlighet (x-viaeats-agent), inte
// bara den postade e-posten — annars kunde vem som helst hävda falken@… för
// att få 80 gissningar. loginIdFromBody scopar ändå till våra 3 agent-konton.
const isAiAgentLogin = (req: express.Request) =>
  isVerifiedAgentLogin(req, AI_AGENT_LOGIN_IDS, loginIdFromBody(req.body));

// 429-händelser loggas till opsMetrics så vakt-cronen (Falken) ser vem som
// slår i vilken limiter via GET /api/admin/ops. `key` identifierar aktören
// (IP, telefon eller inloggnings-id beroende på limiter).
const opsRateLimitHandler =
  (limiterName: string, key: (req: express.Request) => string) =>
  (req: express.Request, res: express.Response, _next: express.NextFunction, options: any) => {
    recordRateLimitHit(limiterName, req.originalUrl.split('?')[0], req.ip || '', key(req));
    res.status(options.statusCode).json(options.message);
  };

// cf-connecting-ip litas bara på när requesten bevisat kommit genom vår
// Cloudflare (delad edge-hemlighet). Se lib/edgeTrust.ts.
const clientIp = (req: express.Request) => trustedClientIp(req);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'För många förfrågningar, försök igen om en stund.' },
  skip: (req) => {
    return ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
      isPaymentWebhookRequest(req.method, req.originalUrl);
  },
  handler: opsRateLimitHandler('general', clientIp),
});

// Bred missbruks-broms som täcker ÄVEN GET (limitern ovan hoppar över läs-
// trafik). Stoppar skrapning/spam av publika endpoints utan att störa normal
// browsing — 300 req/min/IP ≈ 5/s ihållande, långt över vad en äkta användare
// genererar men dödar en spam-loop. Cloudflare-regler framför API:t är det
// PRIMÄRA försvaret mot riktig DDoS; detta är app-nivå-backstop.
//
// Nyckel: trustedClientIp() — CF-Connecting-IP litas bara på när requesten
// bär vår delade edge-hemlighet (annars spoofbar vid direkt-mot-origin),
// annars Railways forwarded req.ip. Fungerar både före och efter Cloudflare.
// Verifierade ops-agenter (Falken m.fl.) delar annars IP-bucket med publik
// trafik och svälts ut när flera agenter kör från samma utgående IP. De får
// därför en egen nyckel (`ops:<admin-id>`) och en generösare men fortfarande
// BUNDEN budget — en läckt ops-token kan inte spamma obegränsat, och 429-
// träffar loggas per admin-id. Nyckeln kräver en giltig signerad token, så
// ingen okänd bot kan hamna i ops-bucketen.
const abuseRateKey = (req: express.Request) => {
  const opsId = opsAgentRateId(req);
  if (opsId) return `ops:${opsId}`;
  return trustedClientIp(req);
};

const abuseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => (opsAgentRateId(req) ? 1200 : 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isPaymentWebhookRequest(req.method, req.originalUrl),
  message: { error: 'För många förfrågningar. Sakta ner och försök igen om en stund.' },
  keyGenerator: abuseRateKey,
  handler: opsRateLimitHandler('abuse', abuseRateKey),
});

// Request-timing för opsMetrics: räknar 5xx och långsamma svar (>2s) per
// route. Ligger före limiters så även 429-trafik syns i totalen.
app.use('/api', (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    recordRequest(req.method, req.originalUrl.split('?')[0], res.statusCode, ms);
  });
  next();
});

app.use('/api/', abuseLimiter);
app.use('/api/', limiter);

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 20,
  message: { error: 'För många orderförsök, vänta en minut och försök igen.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  // Order POSTs arrive via the Vercel proxy → same egress IP for everyone, so an
  // IP-keyed limiter would throttle ALL customers as one (max 20/min globally,
  // collapsing checkout at scale). Key per customer (phone, else idempotency-key)
  // so legit concurrent orders aren't blocked; IP is only a last-resort fallback.
  keyGenerator: (req) => {
    const phone = typeof req.body?.customerPhone === 'string' ? req.body.customerPhone.trim() : '';
    const idem = req.headers['idempotency-key'];
    return phone || (typeof idem === 'string' ? idem : '') || req.ip || 'order';
  },
  handler: opsRateLimitHandler('order', (req) => {
    const phone = typeof req.body?.customerPhone === 'string' ? req.body.customerPhone.trim() : '';
    return phone || req.ip || 'order';
  }),
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (isAiAgentLogin(req) ? 80 : 8),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${trustedClientIp(req)}:${String(req.body?.identifier || req.body?.email || '').trim().toLowerCase()}`,
  message: { error: 'För många admin-inloggningar. Vänta 15 minuter och försök igen.' },
  handler: opsRateLimitHandler('admin-login', (req) => loginIdFromBody(req.body) || req.ip || 'anon'),
});

// `${req.ip}:verify` delades tidigare av ALLA klienter bakom samma IP (60/5min
// = 12/min), så flera ops-agenter som verifierar sin session cannibaliserade
// varandra → intermittent 429. Verifierade ops-tokens får egen nyckel + tak.
const verifyRateKey = (req: express.Request) => {
  const opsId = opsAgentRateId(req);
  return opsId ? `ops-verify:${opsId}` : `${trustedClientIp(req)}:verify`;
};

const sessionVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: (req) => (opsAgentRateId(req) ? 240 : 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: verifyRateKey,
  message: { error: 'För många sessionskontroller. Vänta en stund och försök igen.' },
  handler: opsRateLimitHandler('session-verify', verifyRateKey),
});

app.use('/api/orders', orderLimiter);
app.use('/api/account/login', adminLoginLimiter);
app.use('/api/auth/login', adminLoginLimiter);
app.use('/api/account/verify', sessionVerifyLimiter);
app.use('/api/auth/verify', sessionVerifyLimiter);

// När smoke-test/launch-gaten är aktiv räcker det inte att gömma webbsidorna:
// direktanrop mot API:t får inte kunna skapa order eller starta Mollie. Webb-
// proxyn vidarebefordrar antingen den signerade HttpOnly-cookien eller den
// kortlivade kiosk-proofen som behövs när iframe-cookies blockeras.
const requirePrelaunchCheckoutAccess: express.RequestHandler = (req, res, next) => {
  if (!prelaunchModeEnabled()) return next();
  // Apparna är inte publikt distribuerade under prelaunch, så app-klienter
  // (X-Client-Type: ios/android) släpps igenom utan proof. Medveten avvägning:
  // headern kan spoofas via curl, men grinden är temporär smoke-test-skydd,
  // inte en säkerhetsgräns. Tas bort tillsammans med prelaunch-läget.
  if (isAppClient(req)) return next();
  if (validPrelaunchProof(req.header(PRELAUNCH_ACCESS_HEADER))) return next();
  const kioskRestaurantSlug = validKioskAccessProof(req.header(KIOSK_ACCESS_HEADER));
  if (kioskRestaurantSlug) {
    const kioskAllowedRestaurants = new Set(
      String(process.env.KIOSK_RESTAURANT_SLUGS || 'palmyra-pizzeria-lund')
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean),
    );
    if (!kioskAllowedRestaurants.has(kioskRestaurantSlug)) {
      res.status(403).json({ error: 'KIOSK_RESTAURANT_NOT_ALLOWED' });
      return;
    }
    const requestedRestaurantSlug = typeof req.body?.restaurantSlug === 'string'
      ? req.body.restaurantSlug.trim()
      : null;
    // Order creation must be bound to the restaurant in the signed kiosk proof.
    // Payment creation is already bound to an existing order id and is checked
    // by the payment route's order-access rules.
    if (req.originalUrl.startsWith('/api/orders') && requestedRestaurantSlug !== kioskRestaurantSlug) {
      res.status(403).json({ error: 'KIOSK_RESTAURANT_MISMATCH' });
      return;
    }
    return next();
  }
  res.status(423).json({ error: 'PRELAUNCH_LOCKED', message: 'Beställning öppnar snart.' });
};
app.post('/api/orders', requirePrelaunchCheckoutAccess);
app.post('/api/payments/create', requirePrelaunchCheckoutAccess);

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', controlCenterRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', companyLookupRoutes);
app.use('/api/admin/payouts', payoutsRoutes);
app.use('/api/admin/finance', financeRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/courier-applications', courierApplicationPublicRouter);
app.use('/api/admin/couriers', adminCourierRouter);
app.use('/api/admin/courier-applications', adminCourierApplicationRouter);
app.use('/api/admin/reviews', reviewsAdminRoutes);
app.use('/api/admin/printing', printingRoutes);
app.use('/api/admin', referralsAdmin);
app.use('/api/admin/api-health', apiHealthAdminRoutes);
app.use('/api/admin/ops', opsAdminRoutes);
app.use('/api/account', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', paymentMethodsRoutes);
app.use('/api/terminal/pair', adminLoginLimiter);
app.use('/api/terminal', terminalRoutes);
app.use('/api/account', referralsRoutes);
app.use('/api/account', inviteRoutes);
app.use('/api/public', referralsPublic);
app.use('/api/public', publicInviteRouter);
app.use('/api/payments', legacyPaymentClientRoutes); // Endast gammal Stripe-webhook + 410 för gamla klienter
app.use('/api/payments', paymentRoutes); // Provider-neutralt create/status/webhooks
app.use('/api/discount', discountRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/home', homePulseRoutes);
app.use('/api/restaurants', restaurantsRoutes);
app.use('/api/cities', citiesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/hermes', hermesRoutes);
app.use('/api/admin/reports', reportRoutes);
// uploadRoutes monteras direkt på /api/admin så routern's egna paths
// (/upload, /upload-r2, /images/list, /images/exists, /images/auto-match,
// /images/migrate) hamnar på de URL:er admin-klienten faktiskt anropar.
app.use('/api/admin', uploadRoutes);
app.use('/api/maps-stats', mapsStatsRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sponsors', sponsorsRoutes);
app.use('/api/restaurant-tags', restaurantTagsRoutes);
app.use('/api/admin/showcase', showcaseAdminRoutes);
app.use('/api/admin/content-placements', contentPlacementsRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/home-categories', homeCategoriesRoutes);
app.use('/api/launch', launchRoutes);

// Serve uploaded images
import path from 'path';
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Health check
app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness är striktare än liveness: den testar databasen och alla blockerande
// launchberoenden. Railway bör använda /health för process-liveness och extern
// övervakning bör larma på /ready. Inga hemliga värden exponeras.
app.get('/ready', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const issues = getLaunchConfigIssues();
  let database: 'ok' | 'error' = 'ok';
  let databaseSchema: 'ok' | 'error' = 'ok';
  let adminMfa: 'ok' | 'error' = 'ok';
  const notificationWorkerIssues = getCustomerNotificationWorkerIssues();
  const notificationWorkers: 'ok' | 'error' = notificationWorkerIssues.length ? 'error' : 'ok';
  for (const issue of notificationWorkerIssues) {
    issues.push({ ...issue, severity: 'error' });
  }
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('database timeout')), 5_000)),
    ]);

    const schemaIssues = await getLaunchDatabaseSchemaIssues();
    if (schemaIssues.length) {
      databaseSchema = 'error';
      for (const issue of schemaIssues) {
        issues.push({ ...issue, severity: 'error' });
      }
    }

    const [activeSuperAdmins, protectedSuperAdmins] = await Promise.all([
      prisma.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true } }),
      prisma.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true, totpEnabled: true } }),
    ]);
    if (activeSuperAdmins < 1 || protectedSuperAdmins !== activeSuperAdmins) {
      adminMfa = 'error';
      issues.push({
        key: 'super_admin_mfa',
        severity: 'error',
        message:
          activeSuperAdmins < 1
            ? 'Ingen aktiv superadmin finns'
            : 'Alla aktiva superadmins måste aktivera 2FA före launch',
      });
    }
  } catch (error: any) {
    database = 'error';
    databaseSchema = 'error';
    issues.push({
      key: 'database_connection',
      severity: 'error',
      message: String(error?.message || 'Databasen svarar inte').slice(0, 120),
    });
  }

  const blockers = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  res.status(blockers.length ? 503 : 200).json({
    status: blockers.length ? 'not_ready' : warnings.length ? 'ready_with_warnings' : 'ready',
    timestamp: new Date().toISOString(),
    checks: { database, databaseSchema, adminMfa, notificationWorkers },
    blockers,
    warnings,
  });
});

// Socket.IO events
getIO().on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  socket.on('join:admin', async (payload?: { restaurantId?: string; token?: string }) => {
    // Browser-admin använder endast HttpOnly-cookie. Socket-servern läser den
    // från handshaken; frontend behöver aldrig kunna stjäla/serialisera JWT:n.
    const token = payload?.token ||
      socket.handshake.auth?.token ||
      cookieFromHeader(socket.handshake.headers.cookie, 'admin_token');

    if (!token) {
      console.warn(`⚠️ Admin room rejected (missing token): ${socket.id}`);
      socket.emit('admin:join-error', { error: 'Token krävs för admin-room' });
      return;
    }

    try {
      const admin = await resolveAdminSessionFromToken(String(token));
      if (!admin) {
        console.warn(`⚠️ Admin room rejected (invalid session): ${socket.id}`);
        socket.emit('admin:join-error', { error: 'Ogiltig session' });
        return;
      }

      socket.data.admin = admin;
      const requestedRestaurantId = payload?.restaurantId;

      if (admin.role === 'SUPER_ADMIN') {
        if (requestedRestaurantId) {
          socket.join(`admin-room:${requestedRestaurantId}`);
          socket.emit('admin:joined', { restaurantId: requestedRestaurantId, scope: 'restaurant' });
          console.log(`👮 Super Admin joined restaurant room ${requestedRestaurantId}: ${socket.id}`);
          return;
        }

        socket.join('admin-room');
        socket.emit('admin:joined', { restaurantId: null, scope: 'global' });
        console.log(`👮 Super Admin joined global room: ${socket.id}`);
        return;
      }

      if (!admin.restaurantId) {
        console.warn(`⚠️ Admin room rejected (missing restaurant scope): ${socket.id}`);
        socket.emit('admin:join-error', { error: 'Kontot saknar restaurangscope' });
        return;
      }

      if (requestedRestaurantId && requestedRestaurantId !== admin.restaurantId) {
        console.warn(`⚠️ Admin room rejected (restaurant scope mismatch): ${socket.id}`);
        socket.emit('admin:join-error', { error: 'Otillåten restaurangscope' });
        return;
      }

      socket.join(`admin-room:${admin.restaurantId}`);
      socket.emit('admin:joined', { restaurantId: admin.restaurantId, scope: 'restaurant' });
      console.log(`👮 Restaurant admin joined room ${admin.restaurantId}: ${socket.id}`);
    } catch {
      console.warn(`⚠️ Admin room rejected (token verification failed): ${socket.id}`);
      socket.emit('admin:join-error', { error: 'Kunde inte verifiera admin-session' });
    }
  });

  socket.on('join:order', (payload?: { orderId?: unknown; proof?: unknown }) => {
    const orderId = payload?.orderId;
    const allowed = verifyOrderAccessProof(payload?.proof, orderId);

    if (!allowed || !validOrderId(orderId)) {
      socket.emit('order:join-error', { error: 'Order hittades inte' });
      return;
    }

    socket.join(`order:${orderId}`);
    socket.emit('order:joined', { orderId });
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint inte hittad' });
});

// Sentry — fångar uncaught errors innan den lokala handlern svarar 500.
// När DSN saknas är detta en no-op.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Error handler — sista utvägen om Sentry inte fångar / ingen DSN
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internt serverfel' });
});

const PORT = Number(process.env.PORT || 4000);

(async () => {
  // Säkerhetskritisk bootstrap körs separat från övrig best-effort-bootstrap.
  // Ett saknat/svagt eller avstängt produktionskonto, och ett ofullständigt
  // launchschema, får aldrig döljas av catch-blocket som ändå startar servern.
  try {
    await ensureDefaultSuperAdmin();
    console.log('🔐 Super Admin check complete');

    if (process.env.NODE_ENV === 'production') {
      const schemaIssues = await getLaunchDatabaseSchemaIssues();
      if (schemaIssues.length) {
        throw new Error(
          `Produktionsdatabasen saknar launchpatchar: ${schemaIssues.map((issue) => issue.key).join(', ')}`,
        );
      }
      console.log('🗄️ Launch database schema check complete');
    }
  } catch (error) {
    console.error('FATAL: säkerhetskritisk launch-bootstrap misslyckades:', error);
    process.exit(1);
  }

  // This starts outside the unrelated best-effort bootstrap below. A failure
  // therefore cannot be swallowed by menu prewarm, watchdog or mail setup;
  // its local heartbeat makes /ready fail until notification delivery recovers.
  try {
    startCustomerNotificationWorkers();
    console.log('🔔 Customer notification workers started');
  } catch (error) {
    console.error('[customerNotificationWorkers] startup failed:', error);
  }

  try {
    await ensureRestaurantAdmins();
    console.log('🏪 Restaurant admin logins ensured');
    await ensureDefaultHomeCategorySections();
    console.log('🏷️ Home category sections ensured');

    // Run daily maintenance once on startup
    runDailyCleanup().catch(err => console.error('[Cleanup] Early run error:', err));

    // En provider-neutral pending-poller för alla PSP:er. Stripe har dessutom
    // en separat refund-sync för manuella refunds från Dashboard.
    startStripeRefundSync();
    startPaymentReconciliation();
    
    // Schedule daily jobs
    setInterval(() => {
      runDailyCleanup().catch(err => console.error('[Cleanup] Scheduled run error:', err));
    }, 24 * 60 * 60 * 1000);

    // Restaurant Status Watchdog (checks every minute)
    checkAllRestaurantsStatus();
    setInterval(() => {
      checkAllRestaurantsStatus().catch(err => console.error('[Watchdog] Scheduled run error:', err));
    }, 60 * 1000);

    // Live Activity finaliser — auto-flips DELIVERING → "Levererad" after
    // 15 min and dismisses the LA after a further ~3 min. Survives server
    // restarts because it's a periodic DB scan, not in-flight setTimeouts.
    startLiveActivityFinalizer();

    // A13 — scheduled push dispatcher. Runs every 60s, picks rows where
    // scheduledFor <= now AND sentAt IS NULL AND cancelledAt IS NULL, and
    // dispatches them via the same paths as the immediate send endpoints.
    const dispatchScheduledPushes = async () => {
      try {
        const { dispatchDueScheduledPushes } = await import('./lib/scheduledPushDispatcher');
        await dispatchDueScheduledPushes();
      } catch (err) {
        console.error('[scheduledPush] dispatcher error:', err);
      }
    };
    void dispatchScheduledPushes();
    setInterval(() => { void dispatchScheduledPushes(); }, 60 * 1000);

    // Efter 15 min: stäm av AWAITING_PAYMENT mot PSP:n, avbryt en fortfarande
    // öppen Mollie-betalning och flytta den ur aktiva orderflöden. Kör var 5:e
    // minut, så faktisk städning sker efter cirka 15–20 minuter.
    const expireAbandoned = async () => {
      try {
        const { expireAbandonedAwaitingPayment } = await import('./lib/cleanup');
        await expireAbandonedAwaitingPayment();
      } catch (err) {
        console.error('[cleanup] expireAbandonedAwaitingPayment error:', err);
      }
    };
    void expireAbandoned();
    setInterval(() => { void expireAbandoned(); }, 5 * 60 * 1000);

    // Smart kurir-tilldelning — riktade erbjudanden i vågor med sweeper som
    // överlever omstarter. DISPATCH_MODE=open stänger av (broadcast-läge).
    void import('./lib/dispatch').then(({ startDispatchEngine }) => startDispatchEngine());

    // Kapacitets-bevakning — mejlar admin + socket-alert när Supabase/host
    // närmar sig en gräns (var 30:e min, throttlat). Proaktiva notifikationer.
    void import('./lib/capacityMonitor').then(({ startCapacityMonitor }) => startCapacityMonitor());

    // Falken-notifiern — server-side ordervakt till Hermes/WhatsApp via
    // API-outbox, webhook eller direct bridge.
    void import('./lib/falkenNotifier').then(({ startFalkenNotifier }) => startFalkenNotifier());

    // Restaurang-bedrägerivakt — larmar (Hermes/WhatsApp) om en restaurang är
    // pausad/stängd > 30 min under sina öppettider (leker och stänger / stänger
    // tidigt). Deal-skapande + paus/förlängning larmas event-drivet i routerna.
    void import('./lib/restaurantWatch').then(({ startRestaurantFraudWatch }) => startRestaurantFraudWatch());

    // Pre-warm only a bounded set of recently updated public menus. A small
    // worker pool avoids a DB/heap spike after every Railway restart; all other
    // restaurants populate the bounded LRU cache on their first real request.
    (async () => {
      try {
        const configuredLimit = Number(process.env.MENU_PREWARM_LIMIT);
        const configuredConcurrency = Number(process.env.MENU_PREWARM_CONCURRENCY);
        const prewarmLimit = Number.isFinite(configuredLimit)
          ? Math.max(0, Math.min(1_000, Math.round(configuredLimit)))
          : 100;
        const concurrency = Number.isFinite(configuredConcurrency)
          ? Math.max(1, Math.min(10, Math.round(configuredConcurrency)))
          : 4;
        if (prewarmLimit === 0) {
          console.log('[menu-prewarm] disabled');
          return;
        }
        const prismaMod = await import('./lib/prisma');
        const prisma = prismaMod.default;
        const restaurants = await prisma.restaurant.findMany({
          where: { draft: false, archivedAt: null },
          select: { id: true, slug: true },
          orderBy: { updatedAt: 'desc' },
          take: prewarmLimit,
        });
        const axiosMod = await import('axios');
        const axios = axiosMod.default;
        const base = getPublicApiBaseUrl() || `http://localhost:${PORT}`;
        let nextIndex = 0;
        let warmed = 0;
        const worker = async () => {
          while (nextIndex < restaurants.length) {
            const restaurant = restaurants[nextIndex++];
            try {
              await axios.get(
                `${base}/api/menu/categories?restaurantId=${encodeURIComponent(restaurant.id)}&format=normalized`,
                { timeout: 30_000 },
              );
              warmed += 1;
            } catch {
              // Non-fatal — this menu populates on its first real request.
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(concurrency, restaurants.length) }, () => worker()),
        );
        console.log(`[menu-prewarm] warmed ${warmed}/${restaurants.length} menus (concurrency ${concurrency})`);
      } catch (err) {
        console.warn('[menu-prewarm] skipped', err);
      }
    })();

  } catch (error) {
    console.warn('⚠️ Bootstrap error:', error);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ViaEats API körs på port ${PORT}`);
    console.log(`📡 Socket.IO redo`);
    console.log(`🌍 Internt: http://localhost:${PORT}`);
    console.log(`🌐 Externt: http://192.168.0.3:${PORT} (kontrollera ifconfig om detta ej funkar)\n`);
    // Print APNs configuration status as the very last boot line so it's
    // impossible to miss in Railway's log tail. If this prints "❌ NOT
    // CONFIGURED" the killed-app Live Activity path is guaranteed dead and
    // no amount of frontend work can fix it.
    logApnsBootStatus();
  });
})();


export default app;
