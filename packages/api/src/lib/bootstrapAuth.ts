import bcrypt from 'bcryptjs';
import { getRestaurantAdminLogin } from './adminLogin';
import prisma from './prisma';
import { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } from './config';
import { planSuperAdminBootstrap } from './superAdminBootstrap';

// Ensures the super admin credentials exist.
//
// I produktion får ett saknat konto bara skapas med ett starkt, explicit
// SUPER_ADMIN_PASSWORD. Ett avstängt konto återaktiveras aldrig av deploy.
// SUPER_ADMIN_PASSWORD_FORCE får endast återställa ett redan aktivt konto.
export async function ensureDefaultSuperAdmin(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !String(process.env.SUPER_ADMIN_EMAIL || '').trim()) {
    throw new Error('SUPER_ADMIN_EMAIL måste sättas explicit i produktion');
  }
  const email = SUPER_ADMIN_EMAIL || 'admin';
  const forcePassword = process.env.SUPER_ADMIN_PASSWORD_FORCE;
  const existing = await prisma.adminUser.findUnique({ where: { email } });

  const plan = planSuperAdminBootstrap({
    production: process.env.NODE_ENV === 'production',
    existing,
    initialPassword: SUPER_ADMIN_PASSWORD || undefined,
    forcePassword,
  });

  if (plan.kind === 'none') {
    if (plan.reason === 'inactive_development') {
      console.warn(
        `⚠️  Admin '${email}' är avstängd och lämnas avstängd. Återaktivera kontot manuellt vid behov.`,
      );
    }
    return;
  }

  if (plan.kind === 'reset') {
    const hashedPassword = await bcrypt.hash(plan.password, 12);
    await prisma.adminUser.update({
      where: { email },
      data: {
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        name: existing?.name || 'Super Admin',
      },
    });
    console.log(`🔐 Admin '${email}' lösenord forcat-resettat via SUPER_ADMIN_PASSWORD_FORCE.`);
    return;
  }

  if (plan.kind === 'promote') {
    // Behåll kontots aktiva status; den här grenen nås aldrig för ett
    // avstängt konto eftersom säkerhetspolicyn ovan stoppar det först.
    await prisma.adminUser.update({
      where: { email },
      data: { role: 'SUPER_ADMIN' },
    });
    return;
  }

  if (plan.kind === 'create') {
    const hashedPassword = await bcrypt.hash(plan.password, 12);
    await prisma.adminUser.create({
      data: {
        email,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
        name: 'Super Admin',
      },
    });
    console.log(`✨ Skapade Super Admin: ${email} med explicit bootstrap-lösenord`);
  }
}

// Ensures each restaurant has a corresponding admin login entry.
// If an AdminUser already exists for a restaurant slug, we NEVER touch the password.
// If no AdminUser exists, we only log a warning — accounts MUST be created
// via the admin panel with an explicit password.
export async function ensureRestaurantAdmins(): Promise<void> {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, slug: true, name: true, adminEmail: true },
  });

  for (const r of restaurants) {
    const email = getRestaurantAdminLogin(r);
    const legacySlugLogin = r.slug.toLowerCase();
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    const legacyExisting =
      email !== legacySlugLogin
        ? await prisma.adminUser.findUnique({ where: { email: legacySlugLogin } })
        : null;

    if (!existing && legacyExisting && legacyExisting.role !== 'SUPER_ADMIN') {
      await prisma.adminUser.update({
        where: { email: legacySlugLogin },
        data: {
          email,
          role: 'ADMIN',
          isActive: true,
          name: legacyExisting.name || `${r.name} Admin`,
        },
      });
      console.log(`🔄 Synced restaurant admin login ${legacySlugLogin} → ${email}`);
      continue;
    }

    if (existing) {
      // Ensure role is always ADMIN (never STAFF or anything else) for restaurant accounts
      if (existing.role !== 'ADMIN' && existing.role !== 'SUPER_ADMIN') {
        await prisma.adminUser.update({
          where: { email },
          data: { 
            role: 'ADMIN',
            isActive: true, 
            name: existing.name || `${r.name} Admin` 
          },
        });
        console.log(`🔄 Updated role for ${email} from ${existing.role} → ADMIN`);
      }
    } else {
      // No admin account exists for this restaurant — log a warning
      // Do NOT auto-generate passwords, as they'll be unknown to the user.
      console.warn(`⚠️  No admin account for restaurant "${r.name}" (slug: ${r.slug}). Create one via the admin panel.`);
    }
  }
}
