import bcrypt from 'bcryptjs';
import prisma from './prisma';

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

