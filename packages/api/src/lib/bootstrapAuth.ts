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
  const email = SUPER_ADMIN_EMAIL;
  
  // Check if admin already exists
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  
  if (existing) {
    // Admin exists — don't overwrite password. Just ensure role/active status.
    await prisma.adminUser.update({
      where: { email },
      data: { role: 'SUPER_ADMIN', isActive: true },
    });
    return;
  }

  // Admin doesn't exist — create with configured or generated password
  let password = SUPER_ADMIN_PASSWORD;
  if (!password) {
    password = crypto.randomBytes(16).toString('hex');
    console.log(`\n🔐 ═══════════════════════════════════════════`);
    console.log(`   Generated SUPER_ADMIN password (SAVE THIS!):`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Set SUPER_ADMIN_PASSWORD env var to avoid this.`);
    console.log(`🔐 ═══════════════════════════════════════════\n`);
  }
  
  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: {
      email,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      name: 'Superior Admin',
    },
  });
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
      const password = restaurantPasswordFromSlug(r.slug);
      const hashedPassword = await bcrypt.hash(password, 12);
      await prisma.adminUser.upsert({
        where: { email: r.slug.toLowerCase() },
        update: {
          password: hashedPassword,
          role: 'STAFF',
          isActive: true,
          name: `${r.name} Admin`,
        },
        create: {
          email: r.slug.toLowerCase(),
          password: hashedPassword,
          role: 'STAFF',
          isActive: true,
          name: `${r.name} Admin`,
        },
      });
    }),
  );
}
