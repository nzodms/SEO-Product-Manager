import { similarityRatio } from "@/lib/security/guards";
import type { ParsedProduct } from "./shopifyProducts";

export type MatchBucket = "sure" | "medium" | "none";

export interface MatchRow {
  oldHandle: string;
  oldTitle: string;
  newHandle: string | null;
  newTitle: string | null;
  confidence: number;
  bucket: MatchBucket;
  reasons: string[];
}

// Image identity survives re-import better via the original filename than the
// CDN URL. Strip host, query, extension, and Shopify size suffixes (_1024x1024).
function imageKey(src: string): string {
  try {
    const path = src.split("?")[0];
    const file = path.substring(path.lastIndexOf("/") + 1);
    return file
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/_\d+x\d+$/i, "")
      .replace(/_(small|medium|large|grande|original|master)$/i, "")
      .toLowerCase();
  } catch {
    return src.toLowerCase();
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const tagSet = (tags: string) =>
  new Set(tags.split(",").map((t) => norm(t)).filter(Boolean));

function tagOverlap(a: string, b: string): number {
  const sa = tagSet(a);
  const sb = tagSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.max(sa.size, sb.size);
}

interface ScoreResult {
  score: number;
  reasons: string[];
}

function score(oldP: ParsedProduct, newP: ParsedProduct): ScoreResult {
  let s = 0;
  const reasons: string[] = [];

  // Image source identity (strong).
  const oldImgs = new Set(oldP.images.map((i) => imageKey(i.src)));
  const imgMatch = newP.images.some((i) => oldImgs.has(imageKey(i.src)));
  if (imgMatch) {
    s += 0.4;
    reasons.push("image identique");
  }

  if (oldP.handle && oldP.handle === newP.handle) {
    s += 0.3;
    reasons.push("handle identique");
  }

  if (norm(oldP.title) && norm(oldP.title) === norm(newP.title)) {
    s += 0.4;
    reasons.push("titre identique");
  } else if (oldP.title && newP.title) {
    const sim = similarityRatio(norm(oldP.title), norm(newP.title));
    if (sim >= 0.85) {
      s += 0.25;
      reasons.push(`titre proche (${Math.round(sim * 100)}%)`);
    }
  }

  if (oldP.bodyHtml && newP.bodyHtml) {
    const sim = similarityRatio(oldP.bodyHtml, newP.bodyHtml);
    if (sim >= 0.9) {
      s += 0.3;
      reasons.push("description identique");
    } else if (sim >= 0.7) {
      s += 0.15;
      reasons.push(`description proche (${Math.round(sim * 100)}%)`);
    }
  }

  const tagsOv = tagOverlap(oldP.tags, newP.tags);
  if (tagsOv > 0) {
    s += tagsOv * 0.1;
    if (tagsOv >= 0.5) reasons.push("tags communs");
  }
  if (oldP.vendor && norm(oldP.vendor) === norm(newP.vendor)) {
    s += 0.05;
  }
  if (oldP.productType && norm(oldP.productType) === norm(newP.productType)) {
    s += 0.05;
  }

  return { score: Math.min(1, s), reasons };
}

function bucketFor(confidence: number): MatchBucket {
  if (confidence >= 0.8) return "sure";
  if (confidence >= 0.5) return "medium";
  return "none";
}

export function matchOldToNew(
  oldProducts: ParsedProduct[],
  newProducts: ParsedProduct[]
): MatchRow[] {
  // Exact-key indexes for fast, high-confidence hits.
  const byHandle = new Map<string, ParsedProduct>();
  const byTitle = new Map<string, ParsedProduct>();
  const byImage = new Map<string, ParsedProduct>();
  for (const p of newProducts) {
    if (p.handle) byHandle.set(p.handle, p);
    if (norm(p.title)) byTitle.set(norm(p.title), p);
    for (const img of p.images) byImage.set(imageKey(img.src), p);
  }

  return oldProducts.map((oldP) => {
    // Try cheap exact matches first.
    let candidate: ParsedProduct | undefined;
    const exactImg = oldP.images.map((i) => byImage.get(imageKey(i.src))).find(Boolean);
    candidate = byHandle.get(oldP.handle) || byTitle.get(norm(oldP.title)) || exactImg;

    let best: { product: ParsedProduct; result: ScoreResult } | null = null;
    if (candidate) {
      best = { product: candidate, result: score(oldP, candidate) };
    }
    // Always scan to confirm there isn't a stronger fuzzy match.
    for (const newP of newProducts) {
      if (best && newP === best.product) continue;
      const r = score(oldP, newP);
      if (!best || r.score > best.result.score) best = { product: newP, result: r };
    }

    const confidence = best?.result.score ?? 0;
    const bucket = bucketFor(confidence);
    const matched = bucket !== "none" && best;

    return {
      oldHandle: oldP.handle,
      oldTitle: oldP.title,
      newHandle: matched ? best!.product.handle : null,
      newTitle: matched ? best!.product.title : null,
      confidence,
      bucket,
      reasons: matched ? best!.result.reasons : ["aucune correspondance fiable"],
    };
  });
}
