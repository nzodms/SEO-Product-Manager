import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Job detail: live status, progress, counters, and per-item logs.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          resourceRef: true,
          label: true,
          status: true,
          attempts: true,
          errorMessage: true,
          logJson: true,
        },
      },
    },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      total: job.total,
      processed: job.processed,
      succeeded: job.succeeded,
      failed: job.failed,
      progress: job.progress,
      batchSize: job.batchSize,
      runId: job.runId,
      errorMessage: job.errorMessage,
      result: job.resultJson ? JSON.parse(job.resultJson) : null,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    },
    items: job.items.map((it) => ({
      id: it.id,
      resourceRef: it.resourceRef,
      label: it.label,
      status: it.status,
      attempts: it.attempts,
      errorMessage: it.errorMessage,
      log: JSON.parse(it.logJson || "{}"),
    })),
  });
}
