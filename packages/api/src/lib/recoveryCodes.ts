import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from './prisma';

const CODE_COUNT = 10;

/**
 * Genererar en kod på formen `XXXX-XXXX` (8 chars base32-ish).
 * Tillräcklig entropi (40 bits per kod) eftersom de är engångs och
 * vi rate-limiter inloggning.
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exkluderar 0/O/1/I för läsbarhet
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[bytes[i] % chars.length];
    if (i === 3) out += '-';
  }
  return out;
}

/**
 * Genererar 10 nya recovery codes för en admin, raderar gamla, returnerar
 * koderna i klartext (visas EN gång till användaren — vi sparar bara hash).
 */
export async function generateRecoveryCodes(adminId: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < CODE_COUNT; i++) {
    codes.push(generateCode());
  }

  // Hasha alla parallellt
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));

  // Atomic replace — radera gamla, skapa nya, uppdatera timestamp på admin
  await prisma.$transaction([
    (prisma as any).recoveryCode.deleteMany({ where: { adminId } }),
    (prisma as any).recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ adminId, codeHash })),
    }),
    prisma.adminUser.update({
      where: { id: adminId },
      data: { recoveryGeneratedAt: new Date() } as any,
    }),
  ]);

  return codes;
}

/**
 * Försöker använda en recovery code. Om koden matchar och inte är använd:
 *   - markeras som usedAt = nu
 *   - returnerar true
 * Annars false.
 */
export async function consumeRecoveryCode(
  adminId: string,
  code: string,
): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(normalized)) return false;

  // Hämta alla oanvända koder för denna admin. Max 10 så det är billigt.
  const candidates = await (prisma as any).recoveryCode.findMany({
    where: { adminId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  for (const c of candidates) {
    if (await bcrypt.compare(normalized, c.codeHash)) {
      await (prisma as any).recoveryCode.update({
        where: { id: c.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

/** Antal oanvända koder kvar — visas på /2fa-sidan. */
export async function countRemainingCodes(adminId: string): Promise<number> {
  return (prisma as any).recoveryCode.count({
    where: { adminId, usedAt: null },
  });
}
