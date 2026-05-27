import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { queue } from "@/lib/jobs/queue";

// Enqueues an APPLY job over the APPROVED drafts of a run. Only validated rows
// are applied; RISK drafts are skipped unless force=true.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const batchSize = Number(searchParams.get("batchSize") ?? "25") as 10 | 25 | 50;

  const run = await prisma.optimizationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const approved = await prisma.optimizationDraft.findMany({
    where: { runId: params.id, approval: "APPROVED" },
    select: { id: true },
  });
  if (approved.length === 0) {
    return NextResponse.json({ error: "No approved drafts to apply." }, { status: 400 });
  }

  const jobId = await queue.enqueue({
    shopId: run.shopId,
    type: "APPLY",
    batchSize: [10, 25, 50].includes(batchSize) ? batchSize : 25,
    runId: params.id,
    payload: { force },
    items: approved.map((d) => ({ resourceRef: d.id })),
  });

  return NextResponse.json({ jobId, queued: approved.length }, { status: 201 });
}
