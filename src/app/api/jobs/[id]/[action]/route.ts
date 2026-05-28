import { NextResponse } from "next/server";
import { queue } from "@/lib/jobs/queue";
import { rollbackByJob } from "@/lib/runs/service";

const ACTIONS = ["pause", "resume", "cancel", "rollback"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(
  _req: Request,
  { params }: { params: { id: string; action: string } }
) {
  const action = params.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "pause":
        await queue.pause(params.id);
        return NextResponse.json({ ok: true, status: "PAUSED" });
      case "resume":
        await queue.resume(params.id);
        return NextResponse.json({ ok: true, status: "PENDING" });
      case "cancel":
        await queue.cancel(params.id);
        return NextResponse.json({ ok: true, status: "CANCELLED" });
      case "rollback": {
        const result = await rollbackByJob(params.id);
        return NextResponse.json({ ok: true, ...result });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
