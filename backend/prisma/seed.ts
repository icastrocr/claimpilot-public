import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Only create the default user (for fresh installs)
  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { handle: "demo" },
    update: {},
    create: {
      handle: "demo",
      email: "demo@claimpilot.local",
      passwordHash,
    },
  });
  console.log(`  User: ${user.handle} (${user.id})`);

  console.log("Seed complete. Use Import Documents to add real data.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
