import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeShopifyProductCsv } from "@/lib/migration/shopifyProducts";
import { matchOldToNew } from "@/lib/migration/match";

const Body = z.object({
  oldCsv: z.string().min(1),
  newCsv: z.string().min(1),
});

// Deterministic matching of old-shop products to new-shop products.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "oldCsv et newCsv requis" }, { status: 400 });
  }
  try {
    const oldA = analyzeShopifyProductCsv(parsed.data.oldCsv);
    const newA = analyzeShopifyProductCsv(parsed.data.newCsv);
    const matches = matchOldToNew(oldA.products, newA.products);

    const summary = {
      total: matches.length,
      sure: matches.filter((m) => m.bucket === "sure").length,
      medium: matches.filter((m) => m.bucket === "medium").length,
      none: matches.filter((m) => m.bucket === "none").length,
      oldProducts: oldA.products.length,
      newProducts: newA.products.length,
    };
    return NextResponse.json({ matches, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Matching échoué" },
      { status: 500 }
    );
  }
}
