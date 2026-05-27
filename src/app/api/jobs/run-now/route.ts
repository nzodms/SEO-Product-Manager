import { NextResponse } from "next/server";
import { tickJobs } from "@/lib/jobs/processor";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same-origin trigger for the in-app "Traiter maintenant" button. The CRON_SECRET
// protects the *scheduled* /api/jobs/tick endpoint; this one shares the app's
// trust level (the app itself should sit behind access control in production).
export async function POST() {
  const result = await tickJobs({ maxItems: 12, maxJobs: 3 });
  return NextResponse.json({ ok: true, ...result });
}
