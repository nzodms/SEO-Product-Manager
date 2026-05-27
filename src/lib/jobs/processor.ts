import { prisma } from "@/lib/db";
import { setRunStatus } from "@/lib/runs/service";
import { withRetry, sleep } from "./retry";
import { buildContext, processItem } from "./handlers";

// Pause between Shopify-writing items to stay friendly with the Admin API
// rate limit. Generation (AI-only) items don't need it.
const APPLY_PACING_MS = 350;

async function currentStatus(jobId: string): Promise<string> {
  const j = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
  return j?.status ?? "CANCELLED";
}

/**
 * Process one already-claimed (RUNNING) job to completion, a pause, or a cancel.
 * Idempotent on resume: only PENDING items are processed, so DONE items are skipped.
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

  let ctx;
  try {
    ctx = await buildContext(job);
  } catch (err) {
    await failJob(jobId, err);
    return;
  }

  if (job.type === "APPLY" && job.runId) await setRunStatus(job.runId, "APPLYING");

  const items = await prisma.jobItem.findMany({
    where: { jobId, status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "asc" },
  });

  const paced = job.type === "APPLY";
  let stopped: "PAUSED" | "CANCELLED" | null = null;

  for (let i = 0; i < items.length; i += job.batchSize) {
    const batch = items.slice(i, i + job.batchSize);

    // Checkpoint between batches: honour pause/cancel requested via the API.
    const status = await currentStatus(jobId);
    if (status === "PAUSED") { stopped = "PAUSED"; break; }
    if (status === "CANCELLED") { stopped = "CANCELLED"; break; }

    for (const item of batch) {
      await prisma.jobItem.update({ where: { id: item.id }, data: { status: "RUNNING" } });
      try {
        const outcome = await withRetry(() => processItem(item, ctx!), {
          retries: job.maxAttempts,
          onRetry: async (attempt) => {
            await prisma.jobItem.update({
              where: { id: item.id },
              data: { attempts: { increment: 1 } },
            }).catch(() => {});
          },
        });
        await prisma.jobItem.update({
          where: { id: item.id },
          data: {
            status: outcome.ok ? "DONE" : "SKIPPED",
            logJson: JSON.stringify(outcome.log),
          },
        });
        await bumpJob(jobId, outcome.ok ? "succeeded" : "skipped");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.jobItem.update({
          where: { id: item.id },
          data: { status: "FAILED", errorMessage: message, logJson: JSON.stringify({ error: message }) },
        });
        await bumpJob(jobId, "failed");
      }

      if (paced) await sleep(APPLY_PACING_MS);
    }
  }

  if (stopped === "CANCELLED") {
    await prisma.jobItem.updateMany({ where: { jobId, status: "PENDING" }, data: { status: "SKIPPED" } });
    return; // status already CANCELLED
  }
  if (stopped === "PAUSED") return; // leave PAUSED for resume

  await finalizeJob(jobId, job.type, job.runId);
}

// Atomically advance counters + progress after each item.
async function bumpJob(jobId: string, outcome: "succeeded" | "failed" | "skipped"): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { total: true, processed: true },
  });
  const processed = job.processed + 1;
  const progress = job.total > 0 ? Math.min(100, Math.round((processed / job.total) * 100)) : 100;
  await prisma.job.update({
    where: { id: jobId },
    data: {
      processed,
      progress,
      ...(outcome === "succeeded" ? { succeeded: { increment: 1 } } : {}),
      ...(outcome === "failed" ? { failed: { increment: 1 } } : {}),
    },
  });
}

async function finalizeJob(jobId: string, type: string, runId: string | null): Promise<void> {
  // For matching jobs, aggregate per-item results into the job result.
  let resultJson: string | undefined;
  if (type === "MATCHING") {
    const done = await prisma.jobItem.findMany({ where: { jobId, status: { in: ["DONE", "SKIPPED"] } } });
    const results = done.map((it) => JSON.parse(it.logJson || "{}").match).filter(Boolean);
    resultJson = JSON.stringify({ results });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "COMPLETED", finishedAt: new Date(), progress: 100, ...(resultJson ? { resultJson } : {}) },
  });

  if (runId) {
    await setRunStatus(runId, type === "APPLY" ? "APPLIED" : "READY_FOR_REVIEW");
  }
}

async function failJob(jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const attempts = job.attempts + 1;
  if (attempts < job.maxAttempts) {
    // Whole-job retry: back to PENDING so the worker re-claims it later.
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "PENDING", attempts, errorMessage: message },
    });
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", attempts, errorMessage: message, finishedAt: new Date() },
    });
    if (job.runId) await setRunStatus(job.runId, "FAILED");
  }
}
