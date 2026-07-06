import pino from 'pino';

// Strukturerad loggning med Pino. I prod ger JSON-output som Railway/Datadog/Sentry
// kan parse direkt. I dev ger vi pretty-printed för läsbarhet.
//
// Alla loggar bör inkludera kontext: { orderId, restaurantId, userId, ... }
// så att vi kan filtrera och korrelera över requests.
const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  // I prod: rå JSON (Railway och alla log-aggregators tolkar det).
  // I dev: använder vi inte pretty-transport eftersom det kräver pino-pretty
  // som dep. Plain JSON är OK i dev också — använd `pnpm dev | npx pino-pretty`
  // om man vill ha färgad output.
  base: {
    service: 'viaeats-api',
    env: process.env.NODE_ENV || 'development',
  },
  // Maskera kända PII-fält automatiskt om de hamnar i log-objekt
  redact: {
    paths: [
      'customerPhone',
      'customerEmail',
      'deliveryStreet',
      'deliveryZip',
      'password',
      'token',
      'authorization',
      '*.password',
      '*.token',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Convenience-funktioner med default-kontext
export const logOrder = (action: string, data: Record<string, unknown>) =>
  logger.info({ action, scope: 'order', ...data });

export const logPayment = (action: string, data: Record<string, unknown>) =>
  logger.info({ action, scope: 'payment', ...data });

export const logAuth = (action: string, data: Record<string, unknown>) =>
  logger.info({ action, scope: 'auth', ...data });
