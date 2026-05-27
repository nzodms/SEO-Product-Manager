import { NextResponse } from "next/server";
import { applyRun } from "@/lib/runs/service";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  try {
    const result = await applyRun(params.id, force);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Apply failed" },
      { status: 500 }
    );
  }
}
