import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

import menuRoutes from './routes/menu';
import orderRoutes from './routes/orders';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import paymentRoutes from './routes/payments';
import discountRoutes from './routes/discount';
import settingsRoutes from './routes/settings';
import dealsRoutes from './routes/deals';
import restaurantsRoutes from './routes/restaurants';
import { ensureDefaultSuperAdmin, ensureRestaurantAdmins } from './lib/bootstrapAuth';

const app = express();
app.set('trust proxy', 1); // Trust Railway's proxy
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3001';

// In development, we want to allow requests from any local network IP (e.g. 192.168.x.x)
const allowedOrigins = [FRONTEND_URL, ADMIN_URL, 'http://localhost:3002'];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Broadly allow all origins dynamically for local network and mobile testing contexts
    callback(null, true);
  },
  credentials: true,
};

// Socket.IO setup
export const io = new SocketIOServer(httpServer, {
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
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  message: { error: 'För många förfrågningar, försök igen om en stund.' },
  skip: (req) => {
    const isAdminRoute = req.path.startsWith('/admin');
    const isAuthenticated = req.headers.authorization?.startsWith('Bearer ');
    return ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || isAdminRoute || Boolean(isAuthenticated);
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
app.use('/api/orders', orderLimiter);

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/discount', discountRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/restaurants', restaurantsRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO events
io.on('connection', (socket) => {
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
    console.log('🔐 Default SUPER_ADMIN ensured (admin/admin123)');
    await ensureRestaurantAdmins();
    console.log('🏪 Restaurant admin logins ensured (one per restaurant slug)');
  } catch (error) {
    console.warn('⚠️ Could not ensure default SUPER_ADMIN:', error);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Palmyra API körs på port ${PORT}`);
    console.log(`📡 Socket.IO redo`);
    console.log(`🌍 Internt: http://localhost:${PORT}`);
    console.log(`🌐 Externt: http://192.168.0.3:${PORT} (kontrollera ifconfig om detta ej funkar)\n`);
  });
})();


export default app;
