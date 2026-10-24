import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.eventConfig.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });

  for (const round of [
    { number: 1, name: "Round 1 — Cyberattack investigation" },
    { number: 2, name: "Round 2 — Deeper investigation" },
    { number: 3, name: "Round 3 — Final device-unlocking mission" },
  ]) {
    await prisma.round.upsert({
      where: { number: round.number },
      update: {},
      create: round,
    });
  }
} finally {
  await prisma.$disconnect();
}
