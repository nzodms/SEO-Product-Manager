import { runAgent } from "./runner";
import type { ShopRules } from "@/lib/config/shops";
import { getNicheKeywords } from "@/lib/config/niches";
import {
  runGuards,
  verdictFromIssues,
  checkBrandedName,
  type DraftFields,
  type GuardIssue,
  type ProductImage,
  type RunContext,
} from "@/lib/security/guards";

// ---- Agent output shapes -------------------------------------------------
interface AnalysisOut {
  productType: string | null;
  niche: string | null;
  materials: string[];
  primaryUse: string | null;
  targetRoom: string | null;
  style: string | null;
  color: string | null;
  technicalFacts: string[];
  confidence: string;
  missingInfo: string[];
}
interface KeywordsOut {
  primary: string;
  secondary: string[];
  longTail: string[];
  intent: string;
  targetPage: string;
}
interface TitleOut {
  title: string;
  brandedName: string | null;
  reasoning: string;
}
interface MetaOut {
  seoTitle: string;
  seoDescription: string;
}
interface HandleOut {
  handle: string;
  changed: boolean;
}
interface TagsOut {
  tags: string[];
}
interface AltOut {
  images: Array<{ position: number; altText: string }>;
}
interface LinkOut {
  anchorText: string;
  collectionUrl: string;
  linkHtml: string;
  suggestedSentence: string;
}
interface DescOut {
  bodyHtml: string;
}
interface QcOut {
  verdict: "OK" | "REVIEW" | "RISK";
  issues: GuardIssue[];
}

export interface ProductInput {
  shopifyId: string;
  handle: string;
  title: string;
  bodyHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: ProductImage[];
}

export interface PipelineOptions {
  safeMode: boolean; // update mode locks handle & images
  fields: {
    title: boolean;
    description: boolean;
    meta: boolean;
    handle: boolean;
    tags: boolean;
    altText: boolean;
    internalLinking: boolean;
    vendor: boolean;
  };
  existingTitles?: string[];
  existingBrandedNames?: string[];
  oldDomains?: string[];
}

export interface PipelineResult {
  before: DraftFields;
  after: DraftFields;
  issues: GuardIssue[];
  qcStatus: "OK" | "REVIEW" | "RISK";
}

export async function runProductPipeline(
  product: ProductInput,
  rules: ShopRules,
  opts: PipelineOptions,
  runId?: string
): Promise<PipelineResult> {
  const ref = product.shopifyId;
  const niche = getNicheKeywords(rules.niche);

  // 1. Analysis — the factual foundation every other agent depends on.
  const analysis = await runAgent<AnalysisOut>({
    agent: "product_analysis",
    runId,
    resourceRef: ref,
    userPayload: { product, niche: rules.niche },
  });

  // 2. Keyword plan.
  const keywords = await runAgent<KeywordsOut>({
    agent: "keyword_research",
    runId,
    resourceRef: ref,
    userPayload: { analysis, nicheSeedKeywords: niche, niche: rules.niche },
  });

  // 3. Internal link (only if collection URLs are configured and enabled).
  let link: LinkOut | null = null;
  if (opts.fields.internalLinking && Object.keys(rules.collectionUrls).length) {
    link = await runAgent<LinkOut>({
      agent: "internal_linking",
      runId,
      resourceRef: ref,
      userPayload: {
        analysis,
        keywords,
        collectionUrls: rules.collectionUrls,
        storeUrl: rules.storeUrl,
      },
    });
  }

  const after: DraftFields = {};
  let brandedName: string | null = null;

  // 4. Title.
  if (opts.fields.title) {
    const t = await runAgent<TitleOut>({
      agent: "product_title",
      runId,
      resourceRef: ref,
      userPayload: {
        analysis,
        keywords,
        rules: {
          brandName: rules.brandName,
          useBrandedNames: rules.useBrandedNames,
          editorialTone: rules.editorialTone,
        },
        useBrandedNames: rules.useBrandedNames,
        existingTitles: opts.existingTitles ?? [],
        existingBrandedNames: opts.existingBrandedNames ?? [],
        currentTitle: product.title,
      },
    });
    after.title = t.title;
    brandedName = rules.useBrandedNames ? t.brandedName : null;
  }

  const effectiveTitle = after.title ?? product.title;

  // 5. Meta SEO.
  if (opts.fields.meta) {
    const m = await runAgent<MetaOut>({
      agent: "meta_seo",
      runId,
      resourceRef: ref,
      userPayload: {
        title: effectiveTitle,
        keywords,
        brandName: rules.brandName,
        seoTitleSuffix: rules.seoTitleSuffix,
        metaSuffix: rules.metaSuffix,
      },
    });
    after.seoTitle = m.seoTitle;
    after.seoDescription = enforceMetaSuffix(m.seoDescription, rules.metaSuffix);
  }

  // 6. Handle — never changed in safe mode.
  if (opts.fields.handle && !opts.safeMode) {
    const h = await runAgent<HandleOut>({
      agent: "handle",
      runId,
      resourceRef: ref,
      userPayload: {
        title: effectiveTitle,
        keywords,
        currentHandle: product.handle,
        safeMode: opts.safeMode,
      },
    });
    after.handle = slugify(h.handle);
  }

  // 7. Tags.
  if (opts.fields.tags) {
    const tg = await runAgent<TagsOut>({
      agent: "tags",
      runId,
      resourceRef: ref,
      userPayload: { analysis, keywords, niche: rules.niche, currentTags: product.tags },
    });
    after.tags = dedupeTags(tg.tags);
  }

  // 7b. Vendor / fournisseur — set to the store brand to clean supplier junk.
  if (opts.fields.vendor && rules.brandName) {
    after.vendor = rules.brandName;
  }

  // 8. Description (consumes the internal link if present).
  if (opts.fields.description) {
    const d = await runAgent<DescOut>({
      agent: "product_description",
      runId,
      resourceRef: ref,
      userPayload: {
        title: effectiveTitle,
        analysis,
        keywords,
        internalLink: link
          ? { linkHtml: link.linkHtml, suggestedSentence: link.suggestedSentence }
          : null,
        editorialTone: rules.editorialTone,
      },
      maxOutputTokens: 6144,
    });
    after.bodyHtml = d.bodyHtml;
  }

  // 9. Alt text — only fills alt, never src/position; empty src stays empty.
  if (opts.fields.altText && product.images.length) {
    const a = await runAgent<AltOut>({
      agent: "alt_text",
      runId,
      resourceRef: ref,
      userPayload: { title: effectiveTitle, images: product.images },
    });
    after.images = product.images.map((img) => {
      const match = a.images.find((x) => x.position === img.position);
      const altText = !img.src ? "" : (match?.altText ?? img.altText);
      return { ...img, altText };
    });
  }

  const before: DraftFields = {
    title: product.title,
    bodyHtml: product.bodyHtml ?? undefined,
    seoTitle: product.seoTitle ?? undefined,
    seoDescription: product.seoDescription ?? undefined,
    handle: product.handle,
    tags: product.tags,
    vendor: product.vendor ?? undefined,
    images: product.images,
  };

  // 10. Deterministic guards (the gate that cannot be bypassed).
  const ctx: RunContext = {
    safeMode: opts.safeMode,
    metaSuffix: rules.metaSuffix,
    storeDomain: rules.storeUrl,
    oldDomains: opts.oldDomains ?? rules.oldDomains,
    existingTitles: opts.existingTitles,
    existingBrandedNames: opts.existingBrandedNames,
  };
  const guardIssues = [
    ...runGuards(before, after, ctx),
    ...checkBrandedName(brandedName, opts.existingBrandedNames ?? []),
  ];

  // 11. QC agent (second opinion). Non-fatal if it errors.
  let qcIssues: GuardIssue[] = [];
  try {
    const qc = await runAgent<QcOut>({
      agent: "quality_control",
      runId,
      resourceRef: ref,
      userPayload: { before, after, context: ctx },
    });
    qcIssues = Array.isArray(qc.issues) ? qc.issues : [];
  } catch {
    qcIssues = [
      {
        code: "QC_AGENT_FAILED",
        severity: "warn",
        field: "_",
        message: "L'agent de contrôle qualité n'a pas répondu ; vérifier manuellement.",
      },
    ];
  }

  const issues = [...guardIssues, ...qcIssues];
  return { before, after, issues, qcStatus: verdictFromIssues(issues) };
}

// ---- helpers -------------------------------------------------------------
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    // strip combining diacritical marks (U+0300–U+036F)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function enforceMetaSuffix(meta: string, suffix: string): string {
  const trimmed = meta.trim();
  if (trimmed.endsWith(suffix)) return trimmed;
  return `${trimmed.replace(/[.\s]+$/, "")} ${suffix}`.trim();
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(t.trim());
    }
  }
  return out;
}
