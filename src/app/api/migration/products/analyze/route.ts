import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeShopifyProductCsv } from "@/lib/migration/shopifyProducts";

const Body = z.object({ csv: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "csv requis" }, { status: 400 });
  }
  try {
    const analysis = analyzeShopifyProductCsv(parsed.data.csv);
    // Return stats + issues + a trimmed product preview (full set can be large).
    return NextResponse.json({
      stats: analysis.stats,
      issues: analysis.issues,
      preview: analysis.products.slice(0, 200).map((p) => ({
        handle: p.handle,
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        images: p.images.length,
        variants: p.variantCount,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analyse échouée" },
      { status: 500 }
    );
  }
}
