import crypto from 'crypto';
import type { Request } from 'express';

/** Konstant-tids-jämförelse — läcker aldrig hemlighetens längd/innehåll via timing. */
const timingSafeEqualStr = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

const headerValue = (req: Request, name: string): string | null => {
  const value = req.headers[name];
  return typeof value === 'string' && value ? value : null;
};

/**
 * Sant ENDAST när requesten bär den delade hemlighet som vår Cloudflare
 * injicerar via en Transform Rule (header `x-viaeats-edge`). Cloudflare
 * skriver över ev. klient-satt header, så bara trafik som faktiskt passerat
 * vår Cloudflare kan bevisa detta. Är hemligheten inte konfigurerad (t.ex.
 * innan CF är påslaget) returneras false → vi litar då aldrig på cf-headers.
 */
export function isFromTrustedEdge(req: Request): boolean {
  const secret = process.env.CLOUDFLARE_ORIGIN_SECRET || '';
  if (!secret) return false;
  const provided = headerValue(req, 'x-viaeats-edge');
  return provided != null && timingSafeEqualStr(provided, secret);
}

/**
 * IP:n vi nycklar rate-limits på. `cf-connecting-ip` litas på ENDAST när
 * requesten bevisat kommit genom vår Cloudflare (isFromTrustedEdge); annars
 * används Express proxy-härledda `req.ip`. Därmed kan en request som går förbi
 * Cloudflare och träffar origin direkt INTE förfalska `cf-connecting-ip` för
 * att prägla obegränsat med färska rate-limit-buckets.
 */
export function trustedClientIp(req: Request): string {
  if (isFromTrustedEdge(req)) {
    const cf = headerValue(req, 'cf-connecting-ip');
    if (cf) return cf;
  }
  return req.ip || 'anon';
}

/**
 * Höjd admin-login-budget för VÅRA egna AI-agenter. Gate:as på en delad
 * hemlighet i headern `x-viaeats-agent` — INTE på den postade e-posten, så en
 * bot kan inte hävda en agent-identitet för att vidga sitt brute-force-fönster.
 * Kräver BÅDE hemligheten OCH en känd agent-identitet. Är hemligheten osatt
 * höjs ingen (säker default) — sätt AGENT_LOGIN_KEY och skicka headern från
 * dina agenter för att aktivera.
 */
export function isVerifiedAgentLogin(
  req: Request,
  knownAgentIds: Set<string>,
  loginId: string,
): boolean {
  const secret = process.env.AGENT_LOGIN_KEY || '';
  if (!secret) return false;
  const provided = headerValue(req, 'x-viaeats-agent');
  if (provided == null || !timingSafeEqualStr(provided, secret)) return false;
  return knownAgentIds.has(loginId);
}
