import { z } from "zod";
import type { AgentKey } from "@/lib/ai/registry";

// Per-agent output schemas. Tolerant where a field is non-critical (defaults),
// strict on the fields the pipeline truly relies on — so genuine garbage fails
// validation and triggers repair/retry, while minor omissions are filled.

const strArray = z.array(z.string()).optional().default([]);
const nullableStr = z.string().nullable().optional().default(null);

export const ProductAnalysisSchema = z.object({
  productType: nullableStr,
  niche: nullableStr,
  materials: strArray,
  primaryUse: nullableStr,
  targetRoom: nullableStr,
  style: nullableStr,
  color: nullableStr,
  technicalFacts: strArray,
  confidence: z.string().optional().default("low"),
  missingInfo: strArray,
});

export const KeywordResearchSchema = z.object({
  primary: z.string().min(1),
  secondary: strArray,
  longTail: strArray,
  intent: z.string().optional().default("commerciale"),
  targetPage: z.string().optional().default("product"),
});

export const ProductTitleSchema = z.object({
  title: z.string().min(1),
  brandedName: z.string().nullable().optional().default(null),
  reasoning: z.string().optional().default(""),
});

export const ProductDescriptionSchema = z.object({
  bodyHtml: z.string().min(1),
});

export const MetaSeoSchema = z.object({
  seoTitle: z.string().min(1),
  seoDescription: z.string().min(1),
});

export const HandleSchema = z.object({
  handle: z.string().min(1),
  changed: z.boolean().optional().default(false),
});

export const TagsSchema = z.object({
  tags: z.array(z.string()),
});

export const AltTextSchema = z.object({
  images: z.array(z.object({ position: z.number(), altText: z.string() })),
});

export const InternalLinkingSchema = z.object({
  anchorText: z.string().optional().default(""),
  collectionUrl: z.string().optional().default(""),
  linkHtml: z.string().optional().default(""),
  suggestedSentence: z.string().optional().default(""),
});

export const CollectionDescriptionSchema = z.object({
  bodyHtml: z.string().min(1),
  seoTitle: z.string().min(1),
  seoDescription: z.string().min(1),
});

export const QualityControlSchema = z.object({
  verdict: z.string().optional().default("REVIEW"),
  issues: z
    .array(
      z.object({
        code: z.string().optional().default("QC"),
        severity: z.string().optional().default("warn"),
        message: z.string().optional().default(""),
        field: z.string().optional().default("_"),
      })
    )
    .optional()
    .default([]),
});

export const MatchingSchema = z.object({
  matchShopifyId: z.string().nullable(),
  confidence: z.number(),
  reason: z.string().optional().default(""),
});

export const AGENT_SCHEMAS: Record<AgentKey, z.ZodTypeAny> = {
  product_analysis: ProductAnalysisSchema,
  keyword_research: KeywordResearchSchema,
  product_title: ProductTitleSchema,
  product_description: ProductDescriptionSchema,
  meta_seo: MetaSeoSchema,
  handle: HandleSchema,
  tags: TagsSchema,
  alt_text: AltTextSchema,
  internal_linking: InternalLinkingSchema,
  collection_description: CollectionDescriptionSchema,
  quality_control: QualityControlSchema,
  matching: MatchingSchema,
};
