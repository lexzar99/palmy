import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

import menuRoutes from './routes/menu';
import mapsStatsRoutes from './routes/mapsStats';
import placesRoutes from './routes/places';
import sponsorsRoutes from './routes/sponsors';
import orderRoutes from './routes/orders';
import adminRoutes from './routes/admin';
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
import { ensureDefaultSuperAdmin, ensureRestaurantAdmins } from './lib/bootstrapAuth';
import { runDailyLoyaltyChecks } from './lib/loyalty';
import { runDailyCleanup } from './lib/cleanup';
import { checkAllRestaurantsStatus } from './lib/restaurantStatus';
import { getAllowedOrigins } from './lib/config';

const app = express();
app.set('trust proxy', 1); // Trust Railway's proxy
const httpServer = createServer(app);

import { initSocket, getIO } from './lib/socket';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3001';

// In development, we want to allow requests from any local network IP (e.g. 192.168.x.x)
const allowedOrigins = [FRONTEND_URL, ADMIN_URL, 'http://localhost:3002'];

const corsOptions: cors.CorsOptions = {
  origin: (origin: any, callback: any) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = getAllowedOrigins();
    // Also allow any localhost or 192.168.x.x for dev, or any vercel deployments
    const isLocalDev = /^https?:\/\/(localhost|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isVercel = origin.endsWith('.vercel.app');
    
    if (allowed.includes(origin) || isLocalDev || isVercel) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

// Socket.IO setup
initSocket(httpServer, {
  cors: corsOptions,
});

// Middleware
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors(corsOptions));
app.use(compression());

// Stripe webhooks need raw body
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body.phone || req.ip) as string,
  message: { error: 'För många SMS-förfrågningar. Vänta 10 minuter.' },
});

app.use('/api/account/send-otp', otpLimiter);
app.use('/api/orders', orderLimiter);

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/account', authRoutes);
app.use('/api/auth', authRoutes);
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
  
  socket.on('join:admin', (payload?: { restaurantId?: string }) => {
    const restaurantId = payload?.restaurantId;
    if (restaurantId) {
      socket.join(`admin-room:${restaurantId}`);
      console.log(`👮 Admin joined (restaurant ${restaurantId}): ${socket.id}`);
      return;
    }

    socket.join('admin-room'); // Global (super admin)
    console.log(`👮 Admin joined (global): ${socket.id}`);
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

// Error handler
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

    // Run daily maintenance once on startup
    runDailyLoyaltyChecks().catch(err => console.error('[Loyalty] Early run error:', err));
    runDailyCleanup().catch(err => console.error('[Cleanup] Early run error:', err));
    
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

  } catch (error) {
    console.warn('⚠️ Bootstrap error:', error);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 MatGo API körs på port ${PORT}`);
    console.log(`📡 Socket.IO redo`);
    console.log(`🌍 Internt: http://localhost:${PORT}`);
    console.log(`🌐 Externt: http://192.168.0.3:${PORT} (kontrollera ifconfig om detta ej funkar)\n`);
  });
})();


export default app;
