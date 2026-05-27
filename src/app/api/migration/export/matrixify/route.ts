import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeMatrixifyCollections,
  rebuildMatrixifyCollections,
} from "@/lib/migration/matrixifyCollections";

const Body = z.object({
  collectionsCsv: z.string().min(1),
  // old product handle → new product handle
  handleMap: z.record(z.string(), z.string()),
});

// Rebuilds a corrected Matrixify Custom Collections CSV and returns it with a
// report. Associations whose product wasn't matched are dropped and listed —
// never shipped silently with unknown handles.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "collectionsCsv et handleMap requis" }, { status: 400 });
  }
  try {
    const { collections } = analyzeMatrixifyCollections(parsed.data.collectionsCsv);
    const { csv, report } = rebuildMatrixifyCollections(collections, parsed.data.handleMap);
    return NextResponse.json({ csv, report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export échoué" },
      { status: 500 }
    );
  }
}
