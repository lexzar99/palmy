const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("matgo123", 10);
  
  const admin = await prisma.adminUser.upsert({
    where: { email: "matgoo" },
    update: { 
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true
    },
    create: {
      email: "matgoo",
      password: hashedPassword,
      name: "Matgoooo Admin",
      role: "ADMIN",
      isActive: true
    }
  });
  console.log("Fixed matgoo admin:", admin.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
