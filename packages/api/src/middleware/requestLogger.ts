import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger';

// Adds a unique request-ID to every request and logs request/response with
// structured fields. Lets us correlate logs when a customer reports an issue:
// "min order failed kl 14:32" → grep req.id i loggarna och se hela kedjan.
//
// Headers:
//   - X-Request-ID i response så frontend kan visa "Support-kod: abc123"
//   - Använd inkommande X-Request-ID om satt (för request-tracing över services)

export interface RequestWithId extends Request {
  id?: string;
}

export const requestLogger = (req: RequestWithId, res: Response, next: NextFunction): void => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logFn = res.statusCode >= 500 ? logger.error : res.statusCode >= 400 ? logger.warn : logger.info;
    logFn.call(logger, {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 120),
    }, 'http_request');
  });

  next();
};
