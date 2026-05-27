import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const PatchSchema = z.object({
  approval: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  // Optional manual edits to the proposed "after" fields before approval.
  after: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: { approval: string; afterJson?: string } = { approval: parsed.data.approval };
  if (parsed.data.after) data.afterJson = JSON.stringify(parsed.data.after);

  const draft = await prisma.optimizationDraft.update({
    where: { id: params.id },
    data,
    select: { id: true, approval: true, qcStatus: true },
  });
  return NextResponse.json({ draft });
}
