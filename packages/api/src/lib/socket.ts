import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

let ioInstance: SocketIOServer | undefined;

// Socket.IO med Redis-adapter — krävs när backend kör multi-instance
// (Railway scales horisontellt). Utan adapter levereras `emit` bara till
// clients anslutna till SAMMA instans, så hälften av admin-skärmarna missar
// nya ordrar.
//
// Om REDIS_URL saknas (dev) faller vi tillbaka till default in-memory adapter
// så lokal utveckling fortsätter fungera utan Redis.
export async function initSocket(httpServer: HttpServer, options: any) {
  const io = new SocketIOServer(httpServer, options);
  // Sätt ioInstance direkt så getIO() inte kraschar medan Redis-adaptern
  // ansluts — broadcasts under det fönstret hamnar bara i lokala instansen
  // (sekunder vid startup, försumbart för restaurangsystem).
  ioInstance = io;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => console.error('[socket-redis] pub error:', err?.message));
      subClient.on('error', (err) => console.error('[socket-redis] sub error:', err?.message));

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('🔗 Socket.IO Redis-adapter ansluten — multi-instance broadcast aktiv');
    } catch (err: any) {
      console.error(
        '❌ Socket.IO Redis-adapter kunde inte initialiseras — fortsätter med in-memory (multi-instance broadcast FUNGERAR INTE):',
        err?.message,
      );
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '⚠️  REDIS_URL ej satt i produktion — Socket.IO använder in-memory-adapter. Multi-instance deploy kommer att tappa events. Sätt REDIS_URL i Railway.',
      );
    }
  }

  return io;
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}
