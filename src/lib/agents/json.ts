import { z } from "zod";

export type SafeParse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; excerpt: string };

// Strips markdown code fences and trims to the outermost JSON object/array.
export function extractJsonText(raw: string): string {
  let s = (raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace !== -1) s = s.slice(0, lastBrace + 1);
  return s.trim();
}

/**
 * Parses an AI JSON response defensively: strips fences, JSON.parse, then
 * validates against an optional Zod schema. Never throws — returns a result so
 * the caller can decide to repair/retry.
 */
export function safeParseAIJson<T>(raw: string, schema?: z.ZodType<T>): SafeParse<T> {
  const excerpt = (raw ?? "").slice(0, 300);
  let value: unknown;
  try {
    value = JSON.parse(extractJsonText(raw));
  } catch (err) {
    return { ok: false, error: `JSON.parse: ${err instanceof Error ? err.message : String(err)}`, excerpt };
  }
  if (!schema) return { ok: true, data: value as T };
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: `Schema: ${result.error.issues.map((i) => `${i.path.join(".") || "_"}: ${i.message}`).join("; ")}`,
    excerpt,
  };
}
