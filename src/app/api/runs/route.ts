import { NextResponse } from "next/server";
import { z } from "zod";
import { createGenerationRun } from "@/lib/runs/service";
import { queue } from "@/lib/jobs/queue";
import { ALLOWED_BATCH_SIZES } from "@/lib/jobs/types";

const FieldsSchema = z.object({
  title: z.boolean().default(false),
  description: z.boolean().default(false),
  meta: z.boolean().default(false),
  handle: z.boolean().default(false),
  tags: z.boolean().default(false),
  altText: z.boolean().default(false),
  internalLinking: z.boolean().default(false),
  vendor: z.boolean().default(false),
});

const CreateRunSchema = z.object({
  shopId: z.string(),
  mode: z.enum([
    "UPDATE_PRODUCTS",
    "OPTIMIZE_SEO",
    "CREATE_PRODUCTS",
    "OPTIMIZE_COLLECTIONS",
    "CSV_FIX",
    "MATCH_COLLECTIONS",
    "SEO_AUDIT",
  ]),
  resourceIds: z.array(z.string()).min(1),
  fields: FieldsSchema,
  batchSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(25),
});

// Creates a generation run and ENQUEUES a job. Generation happens async in the
// worker so large batches never time out. The AI only proposes drafts here —
// nothing is published to Shopify until the user approves and applies.
export async function POST(req: Request) {
  const parsed = CreateRunSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { shopId, mode, resourceIds, fields, batchSize } = parsed.data;

  try {
    const { runId, resource, safeMode } = await createGenerationRun({ shopId, mode, fields });
    const jobId = await queue.enqueue({
      shopId,
      type: resource === "COLLECTION" ? "GENERATE_COLLECTIONS" : "GENERATE_PRODUCTS",
      batchSize: ALLOWED_BATCH_SIZES.includes(batchSize) ? batchSize : 25,
      runId,
      payload: { fields, safeMode },
      items: resourceIds.map((id) => ({ resourceRef: id })),
    });
    return NextResponse.json({ runId, jobId }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Run failed" },
      { status: 500 }
    );
  }
}
