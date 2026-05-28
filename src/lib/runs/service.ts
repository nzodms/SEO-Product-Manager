import { prisma } from "@/lib/db";
import { parseShopRules, type ShopRules } from "@/lib/config/shops";
import {
  runProductPipeline,
  type ProductInput,
  type PipelineOptions,
} from "@/lib/agents/productPipeline";
import { runCollectionPipeline, type CollectionInput } from "@/lib/agents/collectionPipeline";
import {
  applyProductUpdate,
  applyCollectionUpdate,
  createProductInShopify,
} from "@/lib/shopify/service";
import type { ProductImage } from "@/lib/security/guards";

export type RunMode =
  | "UPDATE_PRODUCTS"
  | "OPTIMIZE_SEO"
  | "CREATE_PRODUCTS"
  | "OPTIMIZE_COLLECTIONS"
  | "CSV_FIX"
  | "MATCH_COLLECTIONS"
  | "SEO_AUDIT";

export interface CreateRunOptions {
  shopId: string;
  mode: RunMode;
  fields: PipelineOptions["fields"];
}

// Creates the run shell only. Drafts are produced asynchronously by job items
// so the request never blocks — the AI never publishes here, it only proposes.
export async function createGenerationRun(opts: CreateRunOptions): Promise<{ runId: string; resource: "PRODUCT" | "COLLECTION"; safeMode: boolean }> {
  const resource = opts.mode === "OPTIMIZE_COLLECTIONS" ? "COLLECTION" : "PRODUCT";
  const safeMode = opts.mode === "UPDATE_PRODUCTS";
  const run = await prisma.optimizationRun.create({
    data: {
      shopId: opts.shopId,
      mode: opts.mode,
      resource,
      status: "GENERATING",
      optionsJson: JSON.stringify({ ...opts.fields, safeMode }),
    },
  });
  return { runId: run.id, resource, safeMode };
}

export async function setRunStatus(runId: string, status: string): Promise<void> {
  await prisma.optimizationRun.update({ where: { id: runId }, data: { status } });
}

// ---- Per-item generation (called by job handlers, one resource at a time) --
export interface ProductGenContext {
  shopId: string;
  runId: string;
  rules: ShopRules;
  fields: PipelineOptions["fields"];
  safeMode: boolean;
  existingTitles: string[];
  existingBrandedNames: string[];
}

// A branded name is the segment after the last " | " in a product title
// (branded shops only). Non-branded titles contribute nothing.
function extractBrandedName(title: string): string | null {
  const parts = title.split(" | ");
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].trim();
  return last || null;
}

export async function buildProductGenContext(
  shopId: string,
  runId: string,
  fields: PipelineOptions["fields"],
  safeMode: boolean
): Promise<ProductGenContext> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  const titles = (
    await prisma.product.findMany({ where: { shopId }, select: { title: true } })
  ).map((p) => p.title);
  const branded = Array.from(
    new Set(titles.map(extractBrandedName).filter((b): b is string => Boolean(b)))
  );
  return {
    shopId,
    runId,
    rules: parseShopRules(shop.rulesJson),
    fields,
    safeMode,
    existingTitles: titles,
    existingBrandedNames: branded,
  };
}

export async function buildShopRules(shopId: string): Promise<ShopRules> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  return parseShopRules(shop.rulesJson);
}

export async function generateProductDraft(
  ctx: ProductGenContext,
  productLocalId: string
): Promise<{ qcStatus: string; issues: number }> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productLocalId } });
  const input: ProductInput = {
    shopifyId: product.shopifyId,
    handle: product.handle,
    title: product.title,
    bodyHtml: product.bodyHtml,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags ? product.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: JSON.parse(product.imagesJson) as ProductImage[],
  };
  const pipelineOpts: PipelineOptions = {
    safeMode: ctx.safeMode,
    fields: ctx.fields,
    existingTitles: ctx.existingTitles.filter((t) => t !== product.title),
    existingBrandedNames: ctx.existingBrandedNames,
  };
  const result = await runProductPipeline(input, ctx.rules, pipelineOpts, ctx.runId);
  await prisma.optimizationDraft.create({
    data: {
      runId: ctx.runId,
      productId: product.id,
      beforeJson: JSON.stringify(result.before),
      afterJson: JSON.stringify(result.after),
      qcStatus: result.qcStatus,
      issuesJson: JSON.stringify(result.issues),
    },
  });
  return { qcStatus: result.qcStatus, issues: result.issues.length };
}

export async function generateCollectionDraft(
  shopId: string,
  runId: string,
  rules: ShopRules,
  collectionLocalId: string
): Promise<{ qcStatus: string; issues: number }> {
  const col = await prisma.collection.findUniqueOrThrow({ where: { id: collectionLocalId } });
  const input: CollectionInput = {
    shopifyId: col.shopifyId,
    handle: col.handle,
    title: col.title,
    bodyHtml: col.bodyHtml,
    seoTitle: col.seoTitle,
    seoDescription: col.seoDescription,
  };
  const result = await runCollectionPipeline(input, rules, runId);
  await prisma.optimizationDraft.create({
    data: {
      runId,
      collectionId: col.id,
      beforeJson: JSON.stringify(result.before),
      afterJson: JSON.stringify(result.after),
      qcStatus: result.qcStatus,
      issuesJson: JSON.stringify(result.issues),
    },
  });
  return { qcStatus: result.qcStatus, issues: result.issues.length };
}

// ---- Per-item apply (called by APPLY job handler) ------------------------
export async function applyDraftById(
  draftId: string,
  opts: { shopId: string; runId?: string; force: boolean }
): Promise<"APPLIED" | "SKIPPED"> {
  const draft = await prisma.optimizationDraft.findUniqueOrThrow({
    where: { id: draftId },
    include: { product: true, collection: true },
  });
  if (draft.approval !== "APPROVED") return "SKIPPED";
  // Safety: a RISK draft is never published unless explicitly forced.
  if (draft.qcStatus === "RISK" && !opts.force) return "SKIPPED";

  const after = JSON.parse(draft.afterJson);
  const before = JSON.parse(draft.beforeJson);

  if (draft.product) {
    // Intake products carry a placeholder id ("new:…"); they are CREATED in
    // Shopify (as DRAFT, never auto-published) rather than updated.
    if (draft.product.shopifyId.startsWith("new:")) {
      const newGid = await createProductInShopify(opts.shopId, {
        title: after.title ?? draft.product.title,
        bodyHtml: after.bodyHtml,
        handle: after.handle ?? draft.product.handle,
        tags: after.tags,
        vendor: after.vendor ?? draft.product.vendor ?? undefined,
        productType: draft.product.productType ?? undefined,
        seoTitle: after.seoTitle,
        seoDescription: after.seoDescription,
      });
      // Replace the placeholder id with the real Shopify gid.
      await prisma.product.update({
        where: { id: draft.product.id },
        data: { shopifyId: newGid, status: "DRAFT" },
      });
      await recordChanges(opts.shopId, "PRODUCT", newGid, {}, after, opts.runId);
    } else {
      await prisma.backup.create({
        data: {
          shopId: opts.shopId,
          resource: "PRODUCT",
          shopifyId: draft.product.shopifyId,
          snapshotJson: JSON.stringify(before),
          runId: opts.runId ?? null,
        },
      });
      await applyProductUpdate(opts.shopId, draft.product.shopifyId, after);
      await recordChanges(opts.shopId, "PRODUCT", draft.product.shopifyId, before, after, opts.runId);
    }
  } else if (draft.collection) {
    await prisma.backup.create({
      data: {
        shopId: opts.shopId,
        resource: "COLLECTION",
        shopifyId: draft.collection.shopifyId,
        snapshotJson: JSON.stringify(before),
        runId: opts.runId ?? null,
      },
    });
    await applyCollectionUpdate(opts.shopId, draft.collection.shopifyId, after);
    await recordChanges(opts.shopId, "COLLECTION", draft.collection.shopifyId, before, after, opts.runId);
  }

  await prisma.optimizationDraft.update({
    where: { id: draft.id },
    data: { approval: "APPLIED", appliedAt: new Date() },
  });
  return "APPLIED";
}

async function recordChanges(
  shopId: string,
  resource: string,
  shopifyId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  runId?: string
) {
  const fields = ["title", "bodyHtml", "seoTitle", "seoDescription", "handle", "tags", "vendor"];
  for (const field of fields) {
    if (after[field] === undefined) continue;
    const oldVal = serialize(before[field]);
    const newVal = serialize(after[field]);
    if (oldVal === newVal) continue;
    await prisma.changeLog.create({
      data: { shopId, resource, shopifyId, field, oldValue: oldVal, newValue: newVal, runId: runId ?? null },
    });
  }
}

function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

// Restore a resource to its most recent backup snapshot (rollback).
export async function rollback(backupId: string): Promise<void> {
  const backup = await prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
  const snapshot = JSON.parse(backup.snapshotJson);
  if (backup.resource === "PRODUCT") {
    await applyProductUpdate(backup.shopId, backup.shopifyId, snapshot);
  } else {
    await applyCollectionUpdate(backup.shopId, backup.shopifyId, snapshot);
  }
  await prisma.changeLog.create({
    data: {
      shopId: backup.shopId,
      resource: backup.resource,
      shopifyId: backup.shopifyId,
      field: "_rollback",
      oldValue: null,
      newValue: `Restored from backup ${backup.id}`,
    },
  });
}

// Roll back every product/collection touched by a job's run (job-level rollback).
// Backups are linked to a run via runId; an APPLY job carries that runId.
export async function rollbackByJob(jobId: string): Promise<{ restored: number }> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (!job.runId) return { restored: 0 };
  const runBackups = await prisma.backup.findMany({
    where: { runId: job.runId },
    orderBy: { createdAt: "asc" },
  });
  // Restore the earliest snapshot per resource (its pre-change state).
  const seen = new Set<string>();
  let restored = 0;
  for (const b of runBackups) {
    const key = `${b.resource}:${b.shopifyId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await rollback(b.id);
    restored++;
  }
  return { restored };
}
