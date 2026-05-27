import { prisma } from "@/lib/db";
import { parseShopRules } from "@/lib/config/shops";
import {
  runProductPipeline,
  type ProductInput,
  type PipelineOptions,
} from "@/lib/agents/productPipeline";
import { runCollectionPipeline, type CollectionInput } from "@/lib/agents/collectionPipeline";
import {
  applyProductUpdate,
  applyCollectionUpdate,
} from "@/lib/shopify/service";
import type { ProductImage } from "@/lib/security/guards";

export type RunMode =
  | "UPDATE_PRODUCTS"
  | "CREATE_PRODUCTS"
  | "OPTIMIZE_COLLECTIONS"
  | "CSV_FIX"
  | "MATCH_COLLECTIONS"
  | "SEO_AUDIT";

export interface CreateRunOptions {
  shopId: string;
  mode: RunMode;
  resourceIds: string[]; // Product.id or Collection.id (local ids)
  fields: PipelineOptions["fields"];
}

// Generate drafts for a batch. UPDATE_PRODUCTS => safeMode true (locks handle/images).
export async function createRun(opts: CreateRunOptions): Promise<string> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: opts.shopId } });
  const rules = parseShopRules(shop.rulesJson);
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

  try {
    if (resource === "PRODUCT") {
      // Existing titles in this shop for duplicate detection.
      const titles = (
        await prisma.product.findMany({
          where: { shopId: opts.shopId },
          select: { title: true },
        })
      ).map((p) => p.title);

      for (const pid of opts.resourceIds) {
        const product = await prisma.product.findUniqueOrThrow({ where: { id: pid } });
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
          safeMode,
          fields: opts.fields,
          existingTitles: titles.filter((t) => t !== product.title),
        };
        const result = await runProductPipeline(input, rules, pipelineOpts, run.id);
        await prisma.optimizationDraft.create({
          data: {
            runId: run.id,
            productId: product.id,
            beforeJson: JSON.stringify(result.before),
            afterJson: JSON.stringify(result.after),
            qcStatus: result.qcStatus,
            issuesJson: JSON.stringify(result.issues),
          },
        });
      }
    } else {
      for (const cid of opts.resourceIds) {
        const col = await prisma.collection.findUniqueOrThrow({ where: { id: cid } });
        const input: CollectionInput = {
          shopifyId: col.shopifyId,
          handle: col.handle,
          title: col.title,
          bodyHtml: col.bodyHtml,
          seoTitle: col.seoTitle,
          seoDescription: col.seoDescription,
        };
        const result = await runCollectionPipeline(input, rules, run.id);
        await prisma.optimizationDraft.create({
          data: {
            runId: run.id,
            collectionId: col.id,
            beforeJson: JSON.stringify(result.before),
            afterJson: JSON.stringify(result.after),
            qcStatus: result.qcStatus,
            issuesJson: JSON.stringify(result.issues),
          },
        });
      }
    }

    await prisma.optimizationRun.update({
      where: { id: run.id },
      data: { status: "READY_FOR_REVIEW" },
    });
  } catch (err) {
    await prisma.optimizationRun.update({
      where: { id: run.id },
      data: { status: "FAILED" },
    });
    throw err;
  }

  return run.id;
}

// Apply approved drafts to Shopify. Backs up each resource first, then writes,
// then records a changelog entry per field. RISK drafts are skipped unless forced.
export async function applyRun(runId: string, force = false): Promise<{ applied: number; skipped: number; failed: number }> {
  const run = await prisma.optimizationRun.findUniqueOrThrow({ where: { id: runId } });
  const drafts = await prisma.optimizationDraft.findMany({
    where: { runId, approval: "APPROVED" },
    include: { product: true, collection: true },
  });

  await prisma.optimizationRun.update({ where: { id: runId }, data: { status: "APPLYING" } });

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const draft of drafts) {
    if (draft.qcStatus === "RISK" && !force) {
      skipped++;
      continue;
    }
    const after = JSON.parse(draft.afterJson);
    const before = JSON.parse(draft.beforeJson);

    try {
      if (draft.product) {
        // Backup full snapshot before mutating.
        await prisma.backup.create({
          data: {
            shopId: run.shopId,
            resource: "PRODUCT",
            shopifyId: draft.product.shopifyId,
            snapshotJson: JSON.stringify(before),
            runId,
          },
        });
        await applyProductUpdate(run.shopId, draft.product.shopifyId, after);
        await recordChanges(run.shopId, "PRODUCT", draft.product.shopifyId, before, after, runId);
      } else if (draft.collection) {
        await prisma.backup.create({
          data: {
            shopId: run.shopId,
            resource: "COLLECTION",
            shopifyId: draft.collection.shopifyId,
            snapshotJson: JSON.stringify(before),
            runId,
          },
        });
        await applyCollectionUpdate(run.shopId, draft.collection.shopifyId, after);
        await recordChanges(run.shopId, "COLLECTION", draft.collection.shopifyId, before, after, runId);
      }
      await prisma.optimizationDraft.update({
        where: { id: draft.id },
        data: { approval: "APPLIED", appliedAt: new Date() },
      });
      applied++;
    } catch (err) {
      failed++;
      await prisma.optimizationDraft.update({
        where: { id: draft.id },
        data: { approval: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  await prisma.optimizationRun.update({
    where: { id: runId },
    data: { status: failed > 0 ? "APPLIED" : "APPLIED" },
  });

  return { applied, skipped, failed };
}

async function recordChanges(
  shopId: string,
  resource: string,
  shopifyId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  runId: string
) {
  const fields = ["title", "bodyHtml", "seoTitle", "seoDescription", "handle", "tags", "vendor"];
  for (const field of fields) {
    if (after[field] === undefined) continue;
    const oldVal = serialize(before[field]);
    const newVal = serialize(after[field]);
    if (oldVal === newVal) continue;
    await prisma.changeLog.create({
      data: { shopId, resource, shopifyId, field, oldValue: oldVal, newValue: newVal, runId },
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
