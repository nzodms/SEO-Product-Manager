import { NextResponse } from "next/server";
import { z } from "zod";
import { matchProducts, buildMatrixifyCsv } from "@/lib/agents/matching";

const ProductRefSchema = z.object({
  shopifyId: z.string(),
  title: z.string(),
  handle: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  productType: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

const BodySchema = z.object({
  olds: z.array(ProductRefSchema.extend({ collections: z.array(z.string()) })),
  candidates: z.array(ProductRefSchema),
  format: z.enum(["json", "matrixify"]).default("json"),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { olds, candidates, format } = parsed.data;
  const results = await matchProducts(olds, candidates);

  if (format === "matrixify") {
    const csv = buildMatrixifyCsv(results, candidates);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="collections-match.csv"`,
      },
    });
  }
  return NextResponse.json({ results });
}
