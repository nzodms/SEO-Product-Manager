import { prisma } from "@/lib/db";
import type { JobType, BatchSize } from "./types";

export interface EnqueueParams {
  shopId: string;
  type: JobType;
  batchSize?: BatchSize;
  payload?: Record<string, unknown>;
  runId?: string;
  // One item per unit of work. resourceRef = local id of product/collection/draft.
  items: Array<{ resourceRef: string; label?: string }>;
  maxAttempts?: number;
}

/**
 * Queue abstraction. The MVP uses a DB-backed implementation (the Job/JobItem
 * tables ARE the queue). To scale, implement this same interface on top of
 * BullMQ/Redis and swap `queue` below — the processor/worker stay unchanged.
 */
export interface JobQueue {
  enqueue(params: EnqueueParams): Promise<string>;
  /** Atomically claim one PENDING job and mark it RUNNING. Returns its id or null. */
  claimNext(): Promise<string | null>;
  /** Lease-claim the next PENDING/RUNNING job for a serverless tick. */
  claimForTick(leaseMs?: number): Promise<string | null>;
  /** Release a tick lease so the job can be reclaimed by the next tick. */
  releaseLock(jobId: string): Promise<void>;
  pause(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export class DbJobQueue implements JobQueue {
  async enqueue(params: EnqueueParams): Promise<string> {
    const job = await prisma.job.create({
      data: {
        shopId: params.shopId,
        type: params.type,
        batchSize: params.batchSize ?? 25,
        total: params.items.length,
        maxAttempts: params.maxAttempts ?? 3,
        payloadJson: JSON.stringify(params.payload ?? {}),
        runId: params.runId ?? null,
        items: {
          create: params.items.map((it) => ({
            resourceRef: it.resourceRef,
            label: it.label ?? null,
          })),
        },
      },
    });
    return job.id;
  }

  // Atomic claim: pick the oldest PENDING job, then guard the transition with
  // updateMany(where status=PENDING). If we flipped exactly one row, it's ours.
  async claimNext(): Promise<string | null> {
    const candidate = await prisma.job.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!candidate) return null;

    const claimed = await prisma.job.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    return claimed.count === 1 ? candidate.id : null;
  }

  // Lease-based claim for serverless ticking: takes the oldest job that is
  // PENDING or already RUNNING (resumed across ticks) whose lock is null or
  // stale, and stamps lockedAt. Used by /api/jobs/tick.
  async claimForTick(leaseMs = 120000): Promise<string | null> {
    const cutoff = new Date(Date.now() - leaseMs);
    const candidate = await prisma.job.findFirst({
      where: {
        status: { in: ["PENDING", "RUNNING"] },
        OR: [{ lockedAt: null }, { lockedAt: { lt: cutoff } }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true },
    });
    if (!candidate) return null;

    const claimed = await prisma.job.updateMany({
      where: {
        id: candidate.id,
        status: { in: ["PENDING", "RUNNING"] },
        OR: [{ lockedAt: null }, { lockedAt: { lt: cutoff } }],
      },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        ...(candidate.status === "PENDING" ? { startedAt: new Date() } : {}),
      },
    });
    return claimed.count === 1 ? candidate.id : null;
  }

  async releaseLock(jobId: string): Promise<void> {
    await prisma.job.updateMany({ where: { id: jobId }, data: { lockedAt: null } });
  }

  async pause(jobId: string): Promise<void> {
    // Only meaningful while pending/running; processor stops at the next checkpoint.
    await prisma.job.updateMany({
      where: { id: jobId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "PAUSED" },
    });
  }

  async resume(jobId: string): Promise<void> {
    // Back to PENDING so the worker re-claims it; DONE items are skipped on resume.
    await prisma.job.updateMany({
      where: { id: jobId, status: "PAUSED" },
      data: { status: "PENDING" },
    });
  }

  async cancel(jobId: string): Promise<void> {
    await prisma.job.updateMany({
      where: { id: jobId, status: { in: ["PENDING", "RUNNING", "PAUSED"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    await prisma.jobItem.updateMany({
      where: { jobId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
  }
}

export const queue: JobQueue = new DbJobQueue();
