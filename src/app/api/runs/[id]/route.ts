import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const run = await prisma.optimizationRun.findUnique({
    where: { id: params.id },
    include: {
      drafts: {
        include: {
          product: { select: { handle: true, title: true } },
          collection: { select: { handle: true, title: true } },
        },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  // Parse JSON columns for the client.
  const drafts = run.drafts.map((d) => ({
    id: d.id,
    productHandle: d.product?.handle ?? d.collection?.handle ?? null,
    title: d.product?.title ?? d.collection?.title ?? null,
    before: JSON.parse(d.beforeJson),
    after: JSON.parse(d.afterJson),
    qcStatus: d.qcStatus,
    issues: JSON.parse(d.issuesJson),
    approval: d.approval,
    errorMessage: d.errorMessage,
  }));

  return NextResponse.json({
    run: { id: run.id, mode: run.mode, resource: run.resource, status: run.status },
    drafts,
  });
}
