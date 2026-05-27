import { prisma } from "@/lib/db";

// CSV safety-backup export of the current cached product snapshot for a shop.
// Generate this BEFORE applying changes so a manual restore path always exists.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");
  if (!shopId) return new Response("shopId required", { status: 400 });

  const products = await prisma.product.findMany({ where: { shopId } });

  const headers = [
    "shopifyId",
    "handle",
    "title",
    "vendor",
    "productType",
    "tags",
    "seoTitle",
    "seoDescription",
  ];
  const rows = products.map((p) =>
    [
      p.shopifyId,
      p.handle,
      p.title,
      p.vendor ?? "",
      p.productType ?? "",
      p.tags ?? "",
      p.seoTitle ?? "",
      p.seoDescription ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-${shopId}-${Date.now()}.csv"`,
    },
  });
}

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
