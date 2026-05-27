import { prisma } from "@/lib/db";
import { setRunStatus } from "@/lib/runs/service";
import { withRetry, sleep } from "./retry";
import { buildContext, processItem } from "./handlers";
import { queue } from "./queue";

// Pause between Shopify-writing items to stay friendly with the Admin API
// rate limit. Generation (AI-only) items don't need it.
const APPLY_PACING_MS = 350;
// How many items the local worker processes per inner chunk.
const WORKER_CHUNK = 25;

type BatchState = "CONTINUE" | "DONE" | "PAUSED" | "CANCELLED" | "FAILED";

async function currentStatus(jobId: string): Promise<string> {
  const j = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
  return j?.status ?? "CANCELLED";
}

/**
 * Processes up to `maxItems` PENDING items of a job, then returns its state.
 * Bounded so it can run inside a serverless function (the cron tick calls it
 * repeatedly). FAILED items are terminal (already retried internally) and are
 * never re-selected, so the loop always terminates.
 */
export async function processJobBatch(jobId: string, maxItems: number): Promise<BatchState> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return "FAILED";
  if (job.status === "PAUSED") return "PAUSED";
  if (job.status === "CANCELLED") return "CANCELLED";

  let ctx;
  try {
    ctx = await buildContext(job);
  } catch (err) {
    await failJob(jobId, err);
    return "FAILED";
  }

  if (job.type === "APPLY" && job.runId) await setRunStatus(job.runId, "APPLYING");

  const items = await prisma.jobItem.findMany({
    where: { jobId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: maxItems,
  });

  if (items.length === 0) {
    await finalizeJob(jobId, job.type, job.runId);
    return "DONE";
  }

  const paced = job.type === "APPLY";
  for (const item of items) {
    const status = await currentStatus(jobId);
    if (status === "PAUSED") return "PAUSED";
    if (status === "CANCELLED") {
      await prisma.jobItem.updateMany({ where: { jobId, status: "PENDING" }, data: { status: "SKIPPED" } });
      return "CANCELLED";
    }

    await prisma.jobItem.update({ where: { id: item.id }, data: { status: "RUNNING" } });
    try {
      const outcome = await withRetry(() => processItem(item, ctx!), {
        retries: job.maxAttempts,
        onRetry: () =>
          prisma.jobItem
            .update({ where: { id: item.id }, data: { attempts: { increment: 1 } } })
            .catch(() => {}),
      });
      await prisma.jobItem.update({
        where: { id: item.id },
        data: { status: outcome.ok ? "DONE" : "SKIPPED", logJson: JSON.stringify(outcome.log) },
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

  const remaining = await prisma.jobItem.count({ where: { jobId, status: "PENDING" } });
  if (remaining === 0) {
    await finalizeJob(jobId, job.type, job.runId);
    return "DONE";
  }
  return "CONTINUE";
}

/**
 * Full processing for the LOCAL worker (already claimed RUNNING via claimNext):
 * loops bounded batches until the job is done, paused, or cancelled.
 */
export async function processJob(jobId: string): Promise<void> {
  await prisma.job.updateMany({ where: { id: jobId }, data: { lockedAt: new Date() } });
  try {
    let state: BatchState = "CONTINUE";
    while (state === "CONTINUE") {
      await prisma.job.updateMany({ where: { id: jobId }, data: { lockedAt: new Date() } });
      state = await processJobBatch(jobId, WORKER_CHUNK);
    }
  } finally {
    await prisma.job.updateMany({ where: { id: jobId }, data: { lockedAt: null } });
  }
}

/**
 * Serverless tick: lease-claims due jobs and runs ONE bounded batch each.
 * Called by the cron route and the in-app "Traiter maintenant" button.
 */
export async function tickJobs(opts: { maxItems?: number; maxJobs?: number } = {}): Promise<{
  processedJobs: number;
  results: Array<{ jobId: string; state: BatchState }>;
}> {
  const maxItems = opts.maxItems ?? 5;
  const maxJobs = opts.maxJobs ?? 3;
  const results: Array<{ jobId: string; state: BatchState }> = [];

  for (let i = 0; i < maxJobs; i++) {
    const jobId = await queue.claimForTick();
    if (!jobId) break;
    let state: BatchState = "FAILED";
    try {
      state = await processJobBatch(jobId, maxItems);
    } finally {
      await queue.releaseLock(jobId);
    }
    results.push({ jobId, state });
  }
  return { processedJobs: results.length, results };
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
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { failed: true } });

  // For matching jobs, aggregate per-item results into the job result.
  let resultJson: string | undefined;
  if (type === "MATCHING") {
    const done = await prisma.jobItem.findMany({ where: { jobId, status: { in: ["DONE", "SKIPPED"] } } });
    const results = done.map((it) => JSON.parse(it.logJson || "{}").match).filter(Boolean);
    resultJson = JSON.stringify({ results });
  }

  // Do NOT report a clean COMPLETED if any item failed.
  const status = job.failed > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";

  await prisma.job.update({
    where: { id: jobId },
    data: { status, finishedAt: new Date(), progress: 100, lockedAt: null, ...(resultJson ? { resultJson } : {}) },
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
    // Whole-job retry: back to PENDING so a worker/tick re-claims it later.
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "PENDING", attempts, errorMessage: message, lockedAt: null },
    });
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", attempts, errorMessage: message, finishedAt: new Date(), lockedAt: null },
    });
    if (job.runId) await setRunStatus(job.runId, "FAILED");
  }
}
