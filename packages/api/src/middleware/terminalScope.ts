import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { terminalWriteAllowed } from '../lib/terminalSettings';

/**
 * Restaurangplattans token (JWT med deviceId) är ett vanligt restaurangkonto, och
 * skulle annars kunna skriva allt som restaurangens admin får. Här släpps bara
 * det igenom som v1 och v2 faktiskt skickar (se terminalWriteAllowed). Priser,
 * zonavgifter och öppettider går i stället via /api/terminal, där bara de
 * tillåtna fälten finns. Andra inloggningar påverkas inte.
 */
export function terminalWriteGate(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.admin?.deviceId) {
    next();
    return;
  }
  const path = `${req.baseUrl || ''}${req.path}`;
  const verdict = terminalWriteAllowed(req.method, path, req.body);
  if (verdict.allowed) {
    next();
    return;
  }
  console.warn('[terminal-scope] nekade plattan', {
    restaurantId: req.admin.restaurantId,
    device: String(req.admin.deviceId).slice(0, 8),
    reason: verdict.reason,
  });
  res.status(403).json({ error: 'Det här kan inte ändras från plattan', code: 'TERMINAL_SCOPE' });
}
