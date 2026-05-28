import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

  const search = searchParams.get("q") ?? undefined;
  const take = Math.min(Number(searchParams.get("take") ?? "100"), 250);

  const products = await prisma.product.findMany({
    where: {
      shopId,
      ...(search ? { title: { contains: search } } : {}),
    },
    orderBy: { syncedAt: "desc" },
    take,
    select: {
      id: true,
      shopifyId: true,
      handle: true,
      title: true,
      vendor: true,
      productType: true,
      seoTitle: true,
      seoDescription: true,
      status: true,
    },
  });
  return NextResponse.json({ products });
}
