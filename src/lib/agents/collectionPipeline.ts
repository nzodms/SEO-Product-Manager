import { runAgent } from "./runner";
import type { ShopRules } from "@/lib/config/shops";
import {
  runGuards,
  verdictFromIssues,
  type DraftFields,
  type GuardIssue,
  type RunContext,
} from "@/lib/security/guards";

interface CollectionDescOut {
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
}

export interface CollectionInput {
  shopifyId: string;
  handle: string;
  title: string;
  bodyHtml: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface CollectionPipelineResult {
  before: DraftFields;
  after: DraftFields;
  issues: GuardIssue[];
  qcStatus: "OK" | "REVIEW" | "RISK";
}

export async function runCollectionPipeline(
  collection: CollectionInput,
  rules: ShopRules,
  runId?: string
): Promise<CollectionPipelineResult> {
  const ref = collection.shopifyId;

  const out = await runAgent<CollectionDescOut>({
    agent: "collection_description",
    runId,
    resourceRef: ref,
    userPayload: {
      collection,
      brandName: rules.brandName,
      seoTitleSuffix: rules.seoTitleSuffix,
      metaSuffix: rules.metaSuffix,
      collectionUrls: rules.collectionUrls,
      storeUrl: rules.storeUrl,
      niche: rules.niche,
      editorialTone: rules.editorialTone,
    },
    maxOutputTokens: 6144,
  });

  const after: DraftFields = {
    bodyHtml: out.bodyHtml,
    seoTitle: out.seoTitle,
    seoDescription: enforceMetaSuffix(out.seoDescription, rules.metaSuffix),
  };

  const before: DraftFields = {
    bodyHtml: collection.bodyHtml ?? undefined,
    seoTitle: collection.seoTitle ?? undefined,
    seoDescription: collection.seoDescription ?? undefined,
  };

  const ctx: RunContext = {
    safeMode: true, // collections never touch handles/images here
    metaSuffix: rules.metaSuffix,
    storeDomain: rules.storeUrl,
  };

  const issues = runGuards(before, after, ctx);
  return { before, after, issues, qcStatus: verdictFromIssues(issues) };
}

function enforceMetaSuffix(meta: string, suffix: string): string {
  const trimmed = (meta ?? "").trim();
  if (trimmed.endsWith(suffix)) return trimmed;
  return `${trimmed.replace(/[.\s]+$/, "")} ${suffix}`.trim();
}
