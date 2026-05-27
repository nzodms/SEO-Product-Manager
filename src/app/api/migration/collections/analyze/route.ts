import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMatrixifyCollections } from "@/lib/migration/matrixifyCollections";

const Body = z.object({ csv: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "csv requis" }, { status: 400 });
  }
  try {
    const analysis = analyzeMatrixifyCollections(parsed.data.csv);
    return NextResponse.json({
      stats: analysis.stats,
      issues: analysis.issues,
      preview: analysis.collections.slice(0, 200).map((c) => ({
        handle: c.handle,
        title: c.title,
        products: c.products.length,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analyse échouée" },
      { status: 500 }
    );
  }
}
