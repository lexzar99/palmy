import bcrypt from 'bcryptjs';
import prisma from './prisma';

const restaurantPasswordFromSlug = (slug: string) => {
  // Easier to type than including dashes/spaces.
  const compact = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${compact}123`;
};

// Ensures the requested "superior admin" credentials exist.
// Username: admin
// Password: admin123
//
// NOTE: This is intentionally explicit because the deployment is expected to be non-public
// and the user requested fixed credentials. If you later want to harden this, move the
// credentials into env vars and remove the upsert.
export async function ensureDefaultSuperAdmin(): Promise<void> {
  const email = 'admin';
  const password = 'admin123';

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.adminUser.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      name: 'Superior Admin',
    },
    create: {
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
