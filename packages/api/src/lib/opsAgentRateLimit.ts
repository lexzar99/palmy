import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { JWT_SECRET } from './config';
import { adminSessionTokenFromRequest } from './adminSessionVerification';

// Endast läs-/drift-roller får den egna, generösare rate-bucketen. Skriv-
// roller (ADMIN/STAFF m.fl.) hör inte hemma bland ops-agenterna.
const OPS_RATE_ROLES = new Set(['SUPER_ADMIN', 'GLOBAL_VIEWER']);

// Memoisera per request: max/keyGenerator/handler anropar hjälparen var för sig
// och ska inte verifiera samma JWT tre gånger per anrop.
const CACHE = Symbol('opsAgentRateId');

/**
 * Returnerar en stabil rate-limit-identitet ENDAST för anrop som bär en
 * kryptografiskt giltig admin-session-token vars roll är en ops/viewer-roll.
 *
 * Token verifieras med JWT_SECRET (HS256). En utomstående kan därför inte
 * förfalska den: inget cookie-, header- eller body-värde ger ops-bucketen utan
 * vår signeringsnyckel. Alla andra (inkl. okända botar) får null och hamnar i
 * den vanliga, hårda IP-bucketen. Detta är INTE åtkomstkontroll — dörren är
 * fortfarande authenticate + requireOpsViewer; det här väljer bara vilken
 * rate-budget en redan verifierad aktör räknas mot.
 */
export function opsAgentRateId(req: Request): string | null {
  const cached = (req as unknown as Record<symbol, unknown>)[CACHE];
  if (cached !== undefined) return cached as string | null;

  let result: string | null = null;
  try {
    // Legacy body-token tillåts: den är ändå en signerad JWT som måste
    // verifieras nedan, så det öppnar ingen lucka — bara en extra bärarform.
    const token = adminSessionTokenFromRequest(req, { allowLegacyBodyToken: true });
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
        id?: unknown;
        role?: unknown;
      };
      const id = typeof payload.id === 'string' ? payload.id : null;
      const role = typeof payload.role === 'string' ? payload.role : '';
      if (id && OPS_RATE_ROLES.has(role)) result = id;
    }
  } catch {
    // Ogiltig/utgången/manipulerad token → ingen ops-budget, faller igenom
    // till IP-bucketen. Kastar aldrig; en limiter får inte krascha requesten.
    result = null;
  }

  (req as unknown as Record<symbol, unknown>)[CACHE] = result;
  return result;
}
