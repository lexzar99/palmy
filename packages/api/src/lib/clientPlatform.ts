import type { Request } from 'express';

// Klienterna skickar headern X-Client-Type så servern kan skilja app från webb.
// Detta behövs eftersom webben proxyar via /api/platform/* och apparna anropar
// /api/* direkt — efter proxyn finns ingen annan skillnad kvar på servern.
// Används av rabattkoder med platform=APP/WEB (driva app-nedladdningar).
export type ClientType = 'ios' | 'android' | 'web' | 'unknown';

export function clientType(req: Request): ClientType {
  const raw = String(req.headers['x-client-type'] || '').toLowerCase().trim();
  if (raw === 'ios' || raw === 'android' || raw === 'web') return raw;
  return 'unknown';
}

export function isAppClient(req: Request): boolean {
  const t = clientType(req);
  return t === 'ios' || t === 'android';
}

// Får en kupong med given platform-inställning lösas in av det här anropet?
// platform: 'ALL' (default) | 'APP' | 'WEB'. Okänd klient (ingen/felaktig
// header) räknas som "inte app" så app-only-koder inte kan lösas in via curl
// eller webben — bara riktiga app-anrop skickar ios/android.
export function discountPlatformAllowed(
  platform: string | null | undefined,
  req: Request,
): boolean {
  const p = String(platform || 'ALL').toUpperCase();
  if (p === 'APP') return isAppClient(req);
  if (p === 'WEB') return !isAppClient(req);
  return true;
}
