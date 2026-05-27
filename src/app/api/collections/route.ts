import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

  const collections = await prisma.collection.findMany({
    where: { shopId },
    orderBy: { syncedAt: "desc" },
    take: 250,
    select: {
      id: true,
      shopifyId: true,
      handle: true,
      title: true,
      seoTitle: true,
      seoDescription: true,
    },
  });
  return NextResponse.json({ collections });
}
