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
import homeCategoriesRoutes from './routes/homeCategories';
import orderRoutes from './routes/orders';
import adminRoutes from './routes/admin';
import controlCenterRoutes from './routes/controlCenter';
import authRoutes from './routes/auth';
import paymentRoutes from './routes/payments';
import discountRoutes from './routes/discount';
import settingsRoutes from './routes/settings';
import dealsRoutes from './routes/deals';
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
import reviewsAdminRoutes from './routes/reviewsAdmin';
import printingRoutes from './routes/printing';
import referralsRoutes, { publicRouter as referralsPublic, adminRouter as referralsAdmin } from './routes/referrals';
import { ensureDefaultSuperAdmin, ensureRestaurantAdmins } from './lib/bootstrapAuth';
import { runDailyLoyaltyChecks } from './lib/loyalty';
import { runDailyCleanup } from './lib/cleanup';
import { startStripeReconciliation } from './lib/stripeReconcile';
import { startLiveActivityFinalizer } from './lib/liveActivityFinalize';
import { logApnsBootStatus } from './lib/liveActivityPush';
import { checkAllRestaurantsStatus } from './lib/restaurantStatus';
import { isOriginAllowed, ALLOW_WIPE_ORDERS, ENABLE_PASSWORD_PLAIN } from './lib/config';
import { ensureDefaultHomeCategorySections } from './lib/homeCategorySections';
import { resolveAdminSessionFromToken } from './middleware/auth';

const app = express();
app.set('trust proxy', 1); // Trust Railway's proxy
const httpServer = createServer(app);

import { initSocket, getIO } from './lib/socket';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3001';

// Startup-loggning av miljöberoenden så vi ser direkt om något viktigt
// saknas. Servern kraschar inte (admin kan jobba runt), men varningen
// visar exakt vad som behöver konfigureras.
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
);
if (!cloudinaryConfigured) {
  console.warn('⚠️  Cloudinary saknas — bilduppladdning returnerar 503 tills CLOUDINARY_URL eller CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET är satt.');
}
const googleMapsConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY);
if (!googleMapsConfigured) {
  console.warn('⚠️  GOOGLE_MAPS_API_KEY saknas — /api/places faller tillbaka till Geoapify (om EXPO_PUBLIC_GEOAPIFY_KEY finns).');
}
if (ALLOW_WIPE_ORDERS) {
  console.warn('⚠️  ALLOW_WIPE_ORDERS=true — destruktiv /admin/orders/wipe-endpoint är aktiv. Stäng av i produktion när du inte testar längre.');
}
if (!ENABLE_PASSWORD_PLAIN) {
  console.log('ℹ️  ENABLE_PASSWORD_PLAIN=false — restaurang-login visar inte klartext-lösenord.');
}

// In development, we want to allow requests from any local network IP (e.g. 192.168.x.x)
const allowedOrigins = [FRONTEND_URL, ADMIN_URL, 'http://localhost:3002'];

const corsOptions: cors.CorsOptions = {
  origin: (origin: any, callback: any) => {
    // Strikt allow-list via isOriginAllowed:
    //  - Prod blockar saknad origin (curl/Postman med cookies kunde annars CSRF:a)
    //  - Prod blockar `*.vercel.app`-wildcard (preview-URLer måste explicit
    //    läggas till via CORS_ALLOWED_ORIGINS env-var)
    //  - Dev tillåter localhost/192.168.* och saknad origin
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
// receipt-rendering, Cloudinary CDN för bilder).
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
        "https://*.cloudinary.com",
        "wss:",
        "ws:",
      ],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com", "https:"],
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

// Stripe webhooks need raw body
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Cookie-parser — för admin_token (HttpOnly) som middleware/auth.ts läser
app.use(cookieParser());

// Static files
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'För många förfrågningar, försök igen om en stund.' },
  skip: (req) => {
    return ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  },
});
app.use('/api/', limiter);

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 20,
  message: { error: 'För många orderförsök, vänta en minut och försök igen.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.identifier || req.body?.email || '').trim().toLowerCase()}`,
  message: { error: 'För många admin-inloggningar. Vänta 15 minuter och försök igen.' },
});

const sessionVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:verify`,
  message: { error: 'För många sessionskontroller. Vänta en stund och försök igen.' },
});

app.use('/api/orders', orderLimiter);
app.use('/api/account/login', adminLoginLimiter);
app.use('/api/auth/login', adminLoginLimiter);
app.use('/api/account/verify', sessionVerifyLimiter);
app.use('/api/auth/verify', sessionVerifyLimiter);

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', controlCenterRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/payouts', payoutsRoutes);
app.use('/api/admin/reviews', reviewsAdminRoutes);
app.use('/api/admin/printing', printingRoutes);
app.use('/api/admin', referralsAdmin);
app.use('/api/account', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', referralsRoutes);
app.use('/api/public', referralsPublic);
app.use('/api/payments', paymentRoutes);
app.use('/api/discount', discountRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/restaurants', restaurantsRoutes);
app.use('/api/cities', citiesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/admin/reports', reportRoutes);
app.use('/api/admin/upload', uploadRoutes);
app.use('/api/maps-stats', mapsStatsRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sponsors', sponsorsRoutes);
app.use('/api/home-categories', homeCategoriesRoutes);

// Serve uploaded images
import path from 'path';
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO events
getIO().on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  socket.on('join:admin', async (payload?: { restaurantId?: string; token?: string }) => {
    const token = payload?.token || socket.handshake.auth?.token || null;

    if (!token) {
      socket.emit('admin:join-error', { error: 'Token krävs för admin-room' });
      return;
    }

    try {
      const admin = await resolveAdminSessionFromToken(String(token));
      if (!admin) {
        socket.emit('admin:join-error', { error: 'Ogiltig session' });
        return;
      }

      socket.data.admin = admin;
      const requestedRestaurantId = payload?.restaurantId;

      if (admin.role === 'SUPER_ADMIN') {
        if (requestedRestaurantId) {
          socket.join(`admin-room:${requestedRestaurantId}`);
          console.log(`👮 Super Admin joined restaurant room ${requestedRestaurantId}: ${socket.id}`);
          return;
        }

        socket.join('admin-room');
        console.log(`👮 Super Admin joined global room: ${socket.id}`);
        return;
      }

      if (!admin.restaurantId) {
        socket.emit('admin:join-error', { error: 'Kontot saknar restaurangscope' });
        return;
      }

      if (requestedRestaurantId && requestedRestaurantId !== admin.restaurantId) {
        socket.emit('admin:join-error', { error: 'Otillåten restaurangscope' });
        return;
      }

      socket.join(`admin-room:${admin.restaurantId}`);
      console.log(`👮 Restaurant admin joined room ${admin.restaurantId}: ${socket.id}`);
    } catch {
      socket.emit('admin:join-error', { error: 'Kunde inte verifiera admin-session' });
    }
  });

  socket.on('join:order', (orderId: string) => {
    socket.join(`order:${orderId}`);
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
  try {
    await ensureDefaultSuperAdmin();
    console.log('🔐 Super Admin check complete');
    await ensureRestaurantAdmins();
    console.log('🏪 Restaurant admin logins ensured');
    await ensureDefaultHomeCategorySections();
    console.log('🏷️ Home category sections ensured');

    // Run daily maintenance once on startup
    runDailyLoyaltyChecks().catch(err => console.error('[Loyalty] Early run error:', err));
    runDailyCleanup().catch(err => console.error('[Cleanup] Early run error:', err));

    // Stripe reconciliation — polling-loop som ersätter webhook tills den är
    // konfigurerad. Pollar pending payments var 60 sek och refunds var 10 min.
    startStripeReconciliation();
    
    // Schedule daily jobs
    setInterval(() => {
      runDailyLoyaltyChecks().catch(err => console.error('[Loyalty] Scheduled run error:', err));
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

    // P1 — pre-warm the menu cache for every restaurant on boot so the
    // first customer who hits a restaurant page doesn't pay the deep-include
    // cold-start cost. Fire-and-forget — failures are logged but not fatal.
    (async () => {
      try {
        const prismaMod = await import('./lib/prisma');
        const prisma = prismaMod.default;
        const restaurants = await prisma.restaurant.findMany({
          where: { isOpen: true },
          select: { id: true, slug: true },
        });
        const axiosMod = await import('axios');
        const axios = axiosMod.default;
        const base = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
        for (const r of restaurants) {
          axios
            .get(`${base}/api/menu/categories?restaurantId=${r.id}`, { timeout: 30_000 })
            .then(() => console.log(`🍕 Pre-warmed menu cache for ${r.slug}`))
            .catch(() => { /* non-fatal — cache will populate on first real hit */ });
        }
      } catch (err) {
        console.warn('[menu-prewarm] skipped', err);
      }
    })();

  } catch (error) {
    console.warn('⚠️ Bootstrap error:', error);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 FoodGo API körs på port ${PORT}`);
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
