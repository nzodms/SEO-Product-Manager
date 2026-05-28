import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { queue } from "@/lib/jobs/queue";

const ProductRefSchema = z.object({
  shopifyId: z.string(),
  title: z.string(),
  handle: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  productType: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

const BodySchema = z.object({
  shopId: z.string(),
  olds: z.array(ProductRefSchema.extend({ collections: z.array(z.string()) })),
  candidates: z.array(ProductRefSchema),
  batchSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(25),
});

// Enqueues a MATCHING job (one item per old product) so matching hundreds of
// products never times out. Results are aggregated on the job; pull the
// Matrixify CSV from /api/jobs/[id]/export?format=matrixify when COMPLETED.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { shopId, olds, candidates, batchSize } = parsed.data;

  await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

  const jobId = await queue.enqueue({
    shopId,
    type: "MATCHING",
    batchSize,
    payload: { olds, candidates },
    items: olds.map((o, i) => ({ resourceRef: String(i), label: o.title })),
  });

  return NextResponse.json({ jobId, queued: olds.length }, { status: 201 });
}
