import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Job history for a shop.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");
  const take = Math.min(Number(searchParams.get("take") ?? "50"), 200);

  const jobs = await prisma.job.findMany({
    where: shopId ? { shopId } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      status: true,
      total: true,
      processed: true,
      succeeded: true,
      failed: true,
      progress: true,
      runId: true,
      batchSize: true,
      errorMessage: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  return NextResponse.json({ jobs });
}
