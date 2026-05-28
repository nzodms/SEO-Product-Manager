import { NextResponse } from "next/server";
import { tickJobs } from "@/lib/jobs/processor";

export const runtime = "nodejs";
// Allow up to 60s so a tick can process a small batch even when AI calls are slow.
export const maxDuration = 60;

// Secured tick endpoint for Vercel Cron (or any external scheduler).
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the
// CRON_SECRET env var is set. We also accept ?secret= / x-cron-secret for other
// schedulers. If CRON_SECRET is unset (local dev), the route is open.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(req.url);
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return (
    bearer === secret ||
    req.headers.get("x-cron-secret") === secret ||
    searchParams.get("secret") === secret
  );
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await tickJobs({ maxItems: 8, maxJobs: 3 });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
