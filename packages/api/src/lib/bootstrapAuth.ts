import bcrypt from 'bcryptjs';
import { getRestaurantAdminLogin } from './adminLogin';
import prisma from './prisma';
import { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } from './config';

// Ensures the super admin credentials exist.
//
// Lösen-prioritering:
//   1. SUPER_ADMIN_PASSWORD_FORCE — om satt, RESETTA lösenordet vid varje
//      startup. Användbart om man har glömt lösen och vill återställa via deploy.
//   2. SUPER_ADMIN_PASSWORD — använd som initialt lösen vid CREATE. Rör INTE
//      befintliga lösen (admin kan ha bytt det i admin-panelen, det respekteras).
//   3. 'admin123' — sista utvägen om varken finns. Bara för dev/första-boot.
export async function ensureDefaultSuperAdmin(): Promise<void> {
  const email = SUPER_ADMIN_EMAIL || 'admin';

  const forcePassword = process.env.SUPER_ADMIN_PASSWORD_FORCE;
  const initialPassword = SUPER_ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing) {
    // Bara resetta lösenordet om SUPER_ADMIN_PASSWORD_FORCE är explicit satt.
    // Tidigare resettade vi även när email === 'admin' vilket betydde att admin
    // som bytt lösen i panelen fick det överskrivet på varje deploy.
    if (forcePassword) {
      const hashedPassword = await bcrypt.hash(forcePassword, 12);
      await prisma.adminUser.update({
        where: { email },
        data: {
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          isActive: true,
          name: existing.name || 'Super Admin',
        },
      });
      console.log(`🔐 Admin '${email}' lösenord forcat-resettat via SUPER_ADMIN_PASSWORD_FORCE.`);
    } else {
      // Säkerställ bara att rollen + active-status är rätt, rör inte lösenordet
      if (existing.role !== 'SUPER_ADMIN' || !existing.isActive) {
        await prisma.adminUser.update({
          where: { email },
          data: { role: 'SUPER_ADMIN', isActive: true },
        });
      }
    }
    return;
  }

  // Kontot finns inte — skapa med initial-lösen
  const hashedPassword = await bcrypt.hash(initialPassword, 12);
  await prisma.adminUser.create({
    data: {
      email,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      name: 'Super Admin',
    },
  });
  console.log(`✨ Skapade Super Admin: ${email} (lösen satt från SUPER_ADMIN_PASSWORD eller 'admin123' om saknad)`);
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
