import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/agents/productPipeline";

const IntakeProduct = z.object({
  title: z.string().min(1),
  bodyHtml: z.string().optional(),
  productType: z.string().optional(),
  vendor: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const BodySchema = z.object({
  shopId: z.string(),
  products: z.array(IntakeProduct).min(1),
});

// Creates local DRAFT products from pasted/CSV input. They carry a placeholder
// shopifyId ("new:…") and are CREATED in Shopify only at apply time (as DRAFT),
// after the user reviews and approves the generated sheet.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { shopId, products } = parsed.data;
  await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

  const created: string[] = [];
  for (const p of products) {
    const row = await prisma.product.create({
      data: {
        shopId,
        shopifyId: `new:${crypto.randomUUID()}`,
        handle: slugify(p.title),
        title: p.title,
        bodyHtml: p.bodyHtml ?? null,
        productType: p.productType ?? null,
        vendor: p.vendor ?? null,
        tags: (p.tags ?? []).join(","),
        status: "DRAFT",
      },
      select: { id: true },
    });
    created.push(row.id);
  }

  return NextResponse.json({ productIds: created }, { status: 201 });
}
