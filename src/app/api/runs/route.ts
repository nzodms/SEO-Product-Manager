import { NextResponse } from "next/server";
import { z } from "zod";
import { createRun } from "@/lib/runs/service";

const FieldsSchema = z.object({
  title: z.boolean().default(false),
  description: z.boolean().default(false),
  meta: z.boolean().default(false),
  handle: z.boolean().default(false),
  tags: z.boolean().default(false),
  altText: z.boolean().default(false),
  internalLinking: z.boolean().default(false),
});

const CreateRunSchema = z.object({
  shopId: z.string(),
  mode: z.enum([
    "UPDATE_PRODUCTS",
    "CREATE_PRODUCTS",
    "OPTIMIZE_COLLECTIONS",
    "CSV_FIX",
    "MATCH_COLLECTIONS",
    "SEO_AUDIT",
  ]),
  resourceIds: z.array(z.string()).min(1),
  fields: FieldsSchema,
});

export async function POST(req: Request) {
  const parsed = CreateRunSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const runId = await createRun(parsed.data);
    return NextResponse.json({ runId }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Run failed" },
      { status: 500 }
    );
  }
}
