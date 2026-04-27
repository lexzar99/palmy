import bcrypt from 'bcryptjs';
import { getRestaurantAdminLogin } from './adminLogin';
import prisma from './prisma';
import { SUPER_ADMIN_EMAIL } from './config';

// Ensures the super admin credentials exist.
// Credentials are read from SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars.
export async function ensureDefaultSuperAdmin(): Promise<void> {
  const email = SUPER_ADMIN_EMAIL || 'admin';
  
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  
  const forcePassword = process.env.SUPER_ADMIN_PASSWORD_FORCE || 'admin123';
  const hashedPassword = await bcrypt.hash(forcePassword, 12);

  if (existing) {
    if (process.env.SUPER_ADMIN_PASSWORD_FORCE || email === 'admin') {
      await prisma.adminUser.update({
        where: { email },
        data: { 
          password: hashedPassword, 
          role: 'SUPER_ADMIN', 
          isActive: true,
          name: 'Super Admin'
        },
      });
      console.log(`🔐 Admin account '${email}' synchronized with password.`);
    }
    return;
  }

  await prisma.adminUser.create({
    data: {
      email,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      name: 'Super Admin',
    },
  });
  console.log(`✨ Created default Super Admin: ${email} / ${forcePassword}`);
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
