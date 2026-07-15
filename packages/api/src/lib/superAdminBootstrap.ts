export const MIN_SUPER_ADMIN_BOOTSTRAP_PASSWORD_LENGTH = 16;

export type ExistingBootstrapAdmin = {
  role: string;
  isActive: boolean;
  name?: string | null;
};

export type SuperAdminBootstrapPlan =
  | { kind: 'create'; password: string }
  | { kind: 'reset'; password: string }
  | { kind: 'promote' }
  | { kind: 'none'; reason: 'already_ready' | 'inactive_development' };

const supplied = (value: string | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Length is the primary strength rule so password-manager values and long
 * passphrases both work. Known defaults and trivially repeated strings are
 * rejected even if someone pads them to the minimum length.
 */
export function isStrongSuperAdminBootstrapPassword(value: string | undefined): boolean {
  if (!supplied(value) || value.length < MIN_SUPER_ADMIN_BOOTSTRAP_PASSWORD_LENGTH) return false;

  const normalized = value.trim().toLowerCase();
  if (/^(admin123|password|changeme|viaeats)([!._\-\d]*)$/.test(normalized)) return false;
  return new Set(value).size >= 4;
}

/**
 * Pure launch-security policy. In production an absent account is created only
 * with an explicit strong SUPER_ADMIN_PASSWORD. An intentionally inactive
 * account is never revived by a deploy; production instead stops for manual
 * operator action.
 */
export function planSuperAdminBootstrap(input: {
  production: boolean;
  existing: ExistingBootstrapAdmin | null;
  initialPassword?: string;
  forcePassword?: string;
}): SuperAdminBootstrapPlan {
  const { production, existing, initialPassword, forcePassword } = input;

  if (existing) {
    if (!existing.isActive) {
      if (production) {
        throw new Error(
          'Bootstrap-superadmin är avstängd; kontot måste återaktiveras manuellt och granskas före start',
        );
      }
      return { kind: 'none', reason: 'inactive_development' };
    }

    if (supplied(forcePassword)) {
      if (production && !isStrongSuperAdminBootstrapPassword(forcePassword)) {
        throw new Error(
          `SUPER_ADMIN_PASSWORD_FORCE måste vara minst ${MIN_SUPER_ADMIN_BOOTSTRAP_PASSWORD_LENGTH} tecken och får inte vara ett standardlösenord`,
        );
      }
      return { kind: 'reset', password: forcePassword };
    }

    return existing.role === 'SUPER_ADMIN'
      ? { kind: 'none', reason: 'already_ready' }
      : { kind: 'promote' };
  }

  if (production) {
    if (!isStrongSuperAdminBootstrapPassword(initialPassword)) {
      throw new Error(
        `En saknad produktions-superadmin får bara skapas med ett explicit SUPER_ADMIN_PASSWORD på minst ${MIN_SUPER_ADMIN_BOOTSTRAP_PASSWORD_LENGTH} tecken`,
      );
    }
    return { kind: 'create', password: initialPassword! };
  }

  return { kind: 'create', password: supplied(initialPassword) ? initialPassword : 'admin123' };
}
