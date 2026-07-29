import { closePostgresPool } from "../src/server/database";
import {
  FirstPresenceVideoPostgresRepository,
  FirstPresenceVideoWorker,
  createFirstPresenceVideoRuntime,
} from "../features/video";

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

async function main(): Promise<void> {
  if (process.env.YIJIAN_VIDEO_WORKER_ENABLED !== "true") {
    throw new Error("VIDEO_WORKER_DISABLED");
  }
  const service = createFirstPresenceVideoRuntime();
  const worker = new FirstPresenceVideoWorker(new FirstPresenceVideoPostgresRepository(), service);
  const once = process.env.VIDEO_WORKER_ONCE === "true";
  const intervalMs = positiveInteger(process.env.VIDEO_WORKER_POLL_INTERVAL_MS, 5_000, 60_000);
  const batchSize = positiveInteger(process.env.VIDEO_WORKER_BATCH_SIZE, 16, 100);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  do {
    const result = await worker.runOnce(batchSize);
    if (result.failures.length > 0) console.error("[video-worker] cycle failures", result.failures);
    if (once || stopping) break;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  } while (!stopping);
  await closePostgresPool();
}

main().catch(async (error) => {
  console.error("[video-worker] stopped", error instanceof Error ? error.message : "VIDEO_WORKER_UNKNOWN_ERROR");
  await closePostgresPool();
  process.exitCode = 1;
});
