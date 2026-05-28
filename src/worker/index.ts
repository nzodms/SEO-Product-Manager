// Robust env loading — walks up from cwd / this file to find the repo root,
// loads .env + .env.local, and logs which critical vars are missing.
// Relative path on purpose: works regardless of how tsx was invoked.
import "../lib/env";
import { queue } from "@/lib/jobs/queue";
import { processJob } from "@/lib/jobs/processor";
import { sleep } from "@/lib/jobs/retry";

// Standalone job worker. Run alongside the app: `npm run worker`.
// It polls the DB-backed queue, claims one job at a time, and processes it.
// Swapping DbJobQueue for a BullMQ queue later means this loop becomes a
// BullMQ Worker — the processor/handlers stay identical.

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS ?? "3000");
let shuttingDown = false;

async function loop() {
  console.log(`[worker] started (poll ${POLL_INTERVAL_MS}ms)`);
  while (!shuttingDown) {
    try {
      const jobId = await queue.claimNext();
      if (!jobId) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      console.log(`[worker] processing job ${jobId}`);
      await processJob(jobId);
      console.log(`[worker] finished job ${jobId}`);
    } catch (err) {
      console.error("[worker] loop error:", err instanceof Error ? err.message : err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log("[worker] stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, finishing current job then exiting…`);
    shuttingDown = true;
  });
}

loop();
