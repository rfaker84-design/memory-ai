import { queryPostgres } from "../../src/server/database";
import { createMediaStorage } from "../../src/server/storage";

interface CleanupRow { id: string; storage_key: string | null }

async function main() {
  const storage = createMediaStorage();
  const batch = await queryPostgres<CleanupRow>(
    `SELECT id, storage_key FROM media_assets
     WHERE status IN ('deleted','cleanup_failed') AND cleaned_at IS NULL
       AND cleanup_after <= NOW() ORDER BY cleanup_after ASC LIMIT 100`
  );
  let cleaned = 0;
  let failed = 0;
  for (const asset of batch.rows) {
    try {
      if (asset.storage_key) await storage.delete(asset.storage_key);
      await queryPostgres("UPDATE media_assets SET cleaned_at=NOW(),storage_key=NULL,failure_code=NULL WHERE id=$1", [asset.id]);
      cleaned += 1;
    } catch {
      await queryPostgres("UPDATE media_assets SET status='cleanup_failed',failure_code='STORAGE_DELETE_FAILED',cleanup_after=NOW()+INTERVAL '1 hour' WHERE id=$1", [asset.id]).catch(() => undefined);
      console.error(`[media-cleanup] ALERT asset=${asset.id} cleanup failed`);
      failed += 1;
    }
  }
  console.log(`MEDIA_CLEANUP scanned=${batch.rowCount ?? 0} cleaned=${cleaned} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[media-cleanup] ALERT fatal", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
