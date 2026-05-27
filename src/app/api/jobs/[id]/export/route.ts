import { prisma } from "@/lib/db";
import { buildMatrixifyCsv, type CandidateProduct, type MatchResult } from "@/lib/agents/matching";

// Matrixify-compatible CSV of a completed MATCHING job's results.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const job = await prisma.job.findUnique({ where: { id: params.id } });
  if (!job) return new Response("Job not found", { status: 404 });
  if (job.type !== "MATCHING" || !job.resultJson) {
    return new Response("No matching results available yet.", { status: 400 });
  }

  const payload = JSON.parse(job.payloadJson || "{}");
  const candidates: CandidateProduct[] = payload.candidates ?? [];
  const results: MatchResult[] = JSON.parse(job.resultJson).results ?? [];
  const csv = buildMatrixifyCsv(results, candidates);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="collections-match-${params.id}.csv"`,
    },
  });
}
