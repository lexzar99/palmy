import type { Request } from 'express';

type AdminSessionRequest = Pick<Request, 'headers' | 'body'> & {
  cookies?: Record<string, unknown>;
};

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Selects the admin credential in the same order everywhere:
 * HttpOnly cookie first, then Bearer, then the legacy body token only for the
 * explicit session-verification endpoint. A caller cannot override a browser's
 * authoritative cookie by posting a different legacy token.
 */
export function adminSessionTokenFromRequest(
  req: AdminSessionRequest,
  options: { allowLegacyBodyToken?: boolean } = {},
): string | null {
  const cookieToken = nonEmptyString(req.cookies?.admin_token);
  if (cookieToken) return cookieToken;

  const authorization = nonEmptyString(req.headers.authorization);
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = nonEmptyString(bearerMatch?.[1]);
  if (bearerToken) return bearerToken;

  if (options.allowLegacyBodyToken) {
    return nonEmptyString(req.body?.token);
  }

  return null;
}

export type AdminSessionVerificationResult<T> =
  | { status: 200; body: { valid: true; admin: T } }
  | { status: 401; body: { valid: false }; cause?: unknown }
  | { status: 500; body: { valid: false; error: string }; cause: unknown };

const isJwtValidationError = (error: unknown): boolean => {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'JsonWebTokenError' || name === 'TokenExpiredError' || name === 'NotBeforeError';
};

/**
 * Keeps /verify's HTTP semantics deterministic and testable. Invalid, expired,
 * inactive and revoked sessions are authentication failures (401). Unexpected
 * resolver/database failures are server failures (500), never a misleading
 * HTTP 200 with `valid: false`.
 */
export async function verifyAdminSessionToken<T>(
  token: string | null,
  resolver: (token: string) => Promise<T | null>,
): Promise<AdminSessionVerificationResult<T>> {
  if (!token) return { status: 401, body: { valid: false } };

  try {
    const admin = await resolver(token);
    return admin
      ? { status: 200, body: { valid: true, admin } }
      : { status: 401, body: { valid: false } };
  } catch (error) {
    if (isJwtValidationError(error)) {
      return { status: 401, body: { valid: false }, cause: error };
    }
    return {
      status: 500,
      body: { valid: false, error: 'Kunde inte verifiera sessionen' },
      cause: error,
    };
  }
}
