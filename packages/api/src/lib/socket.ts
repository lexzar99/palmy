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
    // Tysta retry-loopen efter första felet — annars spammar redis-klienten
    // konsollen med "ENOTFOUND"-fel varannan sekund om hostname är dött
    // (typ: REDIS_URL env kvar efter att Redis-service raderats i Railway).
    let redisErrorLogged = false;
    const onRedisError = (err: any) => {
      if (!redisErrorLogged) {
        console.error('[socket-redis] error (further errors suppressed):', err?.message);
        redisErrorLogged = true;
      }
    };
    try {
      const pubClient = createClient({
        url: redisUrl,
        socket: {
          // Ge upp efter 3 försök istället för att retry:a för evigt.
          reconnectStrategy: (retries: number) => {
            if (retries > 3) return new Error('Redis unreachable — giving up');
            return Math.min(retries * 200, 1000);
          },
          connectTimeout: 5000,
        },
      });
      const subClient = pubClient.duplicate();

      pubClient.on('error', onRedisError);
      subClient.on('error', onRedisError);

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('🔗 Socket.IO Redis-adapter ansluten — multi-instance broadcast aktiv');
    } catch (err: any) {
      console.error(
        '❌ Socket.IO Redis-adapter kunde inte initialiseras — fortsätter med in-memory (multi-instance broadcast FUNGERAR INTE). Ta bort REDIS_URL från env om Redis inte används:',
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
