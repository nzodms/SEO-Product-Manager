import { PrismaClient } from "@prisma/client";
import { NICHE_KEYWORDS } from "../src/lib/config/niches";

const prisma = new PrismaClient();

async function main() {
  for (const [niche, kw] of Object.entries(NICHE_KEYWORDS)) {
    const existing = await prisma.keywordSet.findFirst({ where: { niche, shopId: null } });
    const dataJson = JSON.stringify(kw);
    if (existing) {
      await prisma.keywordSet.update({ where: { id: existing.id }, data: { dataJson } });
    } else {
      await prisma.keywordSet.create({ data: { niche, dataJson } });
    }
    console.log(`Seeded keyword set: ${niche}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
