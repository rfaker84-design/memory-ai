import { closePostgresPool } from "../../src/server/database";
import { PostgresAccountDeletionWorker } from "../../features/account-deletion/account-deletion-worker";

async function main(): Promise<void> {
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED !== "true") {
    throw new Error("ACCOUNT_DELETION_WORKER_DISABLED");
  }
  const worker = new PostgresAccountDeletionWorker();
  let processed = 0;
  for (;;) {
    const result = await worker.runOnce();
    if (result === "idle") break;
    processed += 1;
  }
  console.log(`ACCOUNT_DELETION_WORKER processed=${processed}`);
}

main().catch((error) => {
  console.error("[account-deletion-worker] failed", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}).finally(() => closePostgresPool());
