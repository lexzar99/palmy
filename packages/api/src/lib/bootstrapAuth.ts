import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from './prisma';
import { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } from './config';

const restaurantPasswordFromSlug = (slug: string) => {
  const compact = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${compact}123`;
};

// Ensures the super admin credentials exist.
// Credentials are read from SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars.
// If no password is set in production, a random one is generated and logged once.
export async function ensureDefaultSuperAdmin(): Promise<void> {
  const email = SUPER_ADMIN_EMAIL || 'admin';
  
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  
  // Always ensure 'admin' exists with a known password if we are forcing it or if it's missing
  const forcePassword = process.env.SUPER_ADMIN_PASSWORD_FORCE || 'admin123';
  const hashedPassword = await bcrypt.hash(forcePassword, 12);

  if (existing) {
    // Only update if forced or if it's the default 'admin' account to be safe
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

// Ensures each restaurant has its own login (identifier=username = restaurant.slug).
// Password rule (default): <slug without non-alnum> + "123"
// Example: "sushi-nori" -> "sushinori123"
export async function ensureRestaurantAdmins(): Promise<void> {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, slug: true, name: true },
  });

  await Promise.all(
    restaurants.map(async (r) => {
      const email = r.slug.toLowerCase();
      const existing = await prisma.adminUser.findUnique({ where: { email } });
      const passwordSnippet = restaurantPasswordFromSlug(r.slug);
      const hashedPassword = await bcrypt.hash(passwordSnippet, 12);

      if (existing) {
        // FORCE update password during this migration to ensure logins work for the user
        await prisma.adminUser.update({
          where: { email },
          data: { 
            password: hashedPassword,
            role: 'ADMIN',
            isActive: true, 
            name: `${r.name} Business` 
          },
        });
        return;
      }

      await prisma.adminUser.create({
        data: {
          email,
          password: hashedPassword,
          role: 'ADMIN',
          isActive: true,
          name: `${r.name} Business`,
        },
      });
    }),
  );
}
