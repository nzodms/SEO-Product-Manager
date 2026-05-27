import { NextResponse } from "next/server";
import { syncProducts, syncCollections } from "@/lib/shopify/service";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource") ?? "products";
  const query = searchParams.get("query") ?? undefined;
  const max = Number(searchParams.get("max") ?? "100");

  try {
    const count =
      resource === "collections"
        ? await syncCollections(params.id, query, max)
        : await syncProducts(params.id, query, max);
    return NextResponse.json({ synced: count, resource });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
