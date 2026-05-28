import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Bulk approve: approve a lot of N drafts, or all "safe" (non-RISK) drafts.
const BulkSchema = z.object({
  // "count" approves the first N still-pending; "safe" approves all OK/REVIEW.
  strategy: z.enum(["count", "safe", "all"]),
  count: z.number().int().positive().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const parsed = BulkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { strategy, count } = parsed.data;
  const where: Record<string, unknown> = { runId: params.id, approval: "PENDING" };
  if (strategy === "safe") where.qcStatus = { in: ["OK", "REVIEW"] };

  const drafts = await prisma.optimizationDraft.findMany({
    where,
    select: { id: true },
    ...(strategy === "count" && count ? { take: count } : {}),
  });

  await prisma.optimizationDraft.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { approval: "APPROVED" },
  });

  return NextResponse.json({ approved: drafts.length });
}
