import { runAgent } from "./runner";

export interface OldProductRef {
  shopifyId: string;
  title: string;
  handle: string;
  description?: string;
  tags?: string[];
  productType?: string;
  imageUrls?: string[];
  collections: string[]; // collection handles/titles to re-assign
}

export interface CandidateProduct {
  shopifyId: string;
  title: string;
  handle: string;
  description?: string;
  tags?: string[];
  productType?: string;
  imageUrls?: string[];
}

export interface MatchResult {
  oldShopifyId: string;
  matchShopifyId: string | null;
  confidence: number;
  reason: string;
  collections: string[];
}

interface MatchingOut {
  matchShopifyId: string | null;
  confidence: number;
  reason: string;
}

// Fast deterministic pre-filter: exact handle or title match avoids an LLM call.
function quickMatch(old: OldProductRef, candidates: CandidateProduct[]): CandidateProduct | null {
  const byHandle = candidates.find((c) => c.handle === old.handle);
  if (byHandle) return byHandle;
  const t = old.title.trim().toLowerCase();
  return candidates.find((c) => c.title.trim().toLowerCase() === t) ?? null;
}

export async function matchProducts(
  olds: OldProductRef[],
  candidates: CandidateProduct[],
  runId?: string
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  for (const old of olds) {
    const quick = quickMatch(old, candidates);
    if (quick) {
      results.push({
        oldShopifyId: old.shopifyId,
        matchShopifyId: quick.shopifyId,
        confidence: 1,
        reason: "Correspondance exacte (handle ou titre).",
        collections: old.collections,
      });
      continue;
    }
    // Otherwise ask the matching agent over a trimmed candidate set.
    const out = await runAgent<MatchingOut>({
      agent: "matching",
      runId,
      resourceRef: old.shopifyId,
      userPayload: { old, candidates: candidates.slice(0, 40) },
    });
    results.push({
      oldShopifyId: old.shopifyId,
      matchShopifyId: out.matchShopifyId,
      confidence: out.confidence,
      reason: out.reason,
      collections: old.collections,
    });
  }
  return results;
}

// Build a Matrixify-compatible CSV that re-assigns collections to matched products.
export function buildMatrixifyCsv(results: MatchResult[], candidates: CandidateProduct[]): string {
  const byId = new Map(candidates.map((c) => [c.shopifyId, c]));
  const header = ["Handle", "Command", "Collection"];
  const rows: string[] = [header.join(",")];
  for (const r of results) {
    if (!r.matchShopifyId) continue;
    const cand = byId.get(r.matchShopifyId);
    if (!cand) continue;
    for (const col of r.collections) {
      rows.push([cand.handle, "MERGE", col].map(csvCell).join(","));
    }
  }
  return rows.join("\n");
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
