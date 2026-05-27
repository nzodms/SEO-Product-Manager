import type { Job, JobItem } from "@prisma/client";
import {
  buildProductGenContext,
  buildShopRules,
  generateProductDraft,
  generateCollectionDraft,
  applyDraftById,
  type ProductGenContext,
} from "@/lib/runs/service";
import { matchProducts, type OldProductRef, type CandidateProduct } from "@/lib/agents/matching";
import type { ShopRules } from "@/lib/config/shops";
import type { PipelineOptions } from "@/lib/agents/productPipeline";

// Context built once per job run, then reused for every item.
export type JobContext =
  | { type: "GENERATE_PRODUCTS"; product: ProductGenContext }
  | { type: "GENERATE_COLLECTIONS"; shopId: string; runId: string; rules: ShopRules }
  | { type: "APPLY"; shopId: string; runId?: string; force: boolean }
  | { type: "MATCHING"; olds: OldProductRef[]; candidates: CandidateProduct[] };

export async function buildContext(job: Job): Promise<JobContext> {
  const payload = JSON.parse(job.payloadJson || "{}");
  switch (job.type as JobContext["type"]) {
    case "GENERATE_PRODUCTS": {
      const fields = payload.fields as PipelineOptions["fields"];
      const safeMode = Boolean(payload.safeMode);
      const product = await buildProductGenContext(job.shopId, job.runId!, fields, safeMode);
      return { type: "GENERATE_PRODUCTS", product };
    }
    case "GENERATE_COLLECTIONS":
      return {
        type: "GENERATE_COLLECTIONS",
        shopId: job.shopId,
        runId: job.runId!,
        rules: await buildShopRules(job.shopId),
      };
    case "APPLY":
      return { type: "APPLY", shopId: job.shopId, runId: job.runId ?? undefined, force: Boolean(payload.force) };
    case "MATCHING":
      return { type: "MATCHING", olds: payload.olds ?? [], candidates: payload.candidates ?? [] };
  }
}

export interface ItemOutcome {
  ok: boolean;
  log: Record<string, unknown>;
}

// Process a single job item. Throws on retryable failure (the processor retries);
// returns ok:false only for terminal/non-retryable item failures already handled.
export async function processItem(item: JobItem, ctx: JobContext): Promise<ItemOutcome> {
  switch (ctx.type) {
    case "GENERATE_PRODUCTS": {
      const r = await generateProductDraft(ctx.product, item.resourceRef);
      return { ok: true, log: { qcStatus: r.qcStatus, issues: r.issues } };
    }
    case "GENERATE_COLLECTIONS": {
      const r = await generateCollectionDraft(ctx.shopId, ctx.runId, ctx.rules, item.resourceRef);
      return { ok: true, log: { qcStatus: r.qcStatus, issues: r.issues } };
    }
    case "APPLY": {
      const result = await applyDraftById(item.resourceRef, {
        shopId: ctx.shopId,
        runId: ctx.runId,
        force: ctx.force,
      });
      return { ok: result === "APPLIED", log: { result } };
    }
    case "MATCHING": {
      const idx = Number(item.resourceRef);
      const old = ctx.olds[idx];
      const [match] = await matchProducts([old], ctx.candidates);
      return { ok: Boolean(match?.matchShopifyId), log: { match } };
    }
  }
}
