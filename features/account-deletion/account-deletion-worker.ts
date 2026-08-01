import { queryPostgres, withPostgresTransaction } from "@/src/server/database";
import { createMediaStorage } from "@/src/server/storage";
import { createVideoArtifactStorageFromEnvironment } from "@/features/video/video-artifact-storage";

type TaskKind = "revoke_sessions" | "content_online" | "cos_provider" | "backup_retention" | "financial_archive" | "audit_receipt";
type ClaimedTask = { id: string; deletionRequestId: string; userId: string; kind: TaskKind };
type ObjectRow = { id: string; object_kind: "media_object" | "video_artifact" | "provider_task"; object_key: string | null; provider: string | null; provider_task_id: string | null };

export class AccountDeletionProviderBlocked extends Error {
  constructor(readonly provider: string) { super("ACCOUNT_DELETION_PROVIDER_DELETE_NOT_CONFIGURED"); }
}

/**
 * Deliberately invoked by an explicit worker entrypoint only. No web route
 * starts it, and it owns exactly one claimed task at a time.
 */
export class PostgresAccountDeletionWorker {
  async runOnce(): Promise<"idle" | "completed" | "retry"> {
    const task = await this.claim();
    if (!task) return "idle";
    try {
      await this.execute(task);
      await queryPostgres(
        `UPDATE public.account_deletion_tasks SET status='completed', completed_at=NOW(), receipt=$2::jsonb, last_error_code=NULL
         WHERE id=$1::uuid AND status='running'`, [task.id, JSON.stringify({ completed: true, kind: task.kind })],
      );
      return "completed";
    } catch (error) {
      const code = error instanceof AccountDeletionProviderBlocked ? "PROVIDER_DELETE_BLOCKED" : "DELETE_RETRY";
      const status = error instanceof AccountDeletionProviderBlocked ? "failed" : "retry";
      await queryPostgres(
        `UPDATE public.account_deletion_tasks SET status=$2, next_attempt_at=NOW()+INTERVAL '1 hour', last_error_code=$3
         WHERE id=$1::uuid AND status='running'`, [task.id, status, code],
      ).catch(() => undefined);
      return "retry";
    }
  }

  private async claim(): Promise<ClaimedTask | null> {
    return withPostgresTransaction(async (client) => {
      const selected = await client.query<{ id: string; deletion_request_id: string; user_id: string; kind: TaskKind }>(
        `SELECT t.id, t.deletion_request_id, r.user_id, t.kind
         FROM public.account_deletion_tasks t JOIN public.account_deletion_requests r ON r.id=t.deletion_request_id
         WHERE t.status IN ('pending','retry') AND t.next_attempt_at <= NOW() AND NOT r.legal_hold
         ORDER BY t.next_attempt_at, t.id FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return null;
      await client.query(`UPDATE public.account_deletion_tasks SET status='running', attempt_count=attempt_count+1 WHERE id=$1::uuid`, [row.id]);
      return { id: row.id, deletionRequestId: row.deletion_request_id, userId: row.user_id, kind: row.kind };
    });
  }

  private async execute(task: ClaimedTask): Promise<void> {
    if (task.kind === "revoke_sessions") return;
    if (task.kind === "content_online") return this.deleteOnlineContent(task.userId);
    if (task.kind === "cos_provider") return this.deleteExternalObjects(task.deletionRequestId);
    if (task.kind === "backup_retention") return this.verifyBackupTombstone(task.deletionRequestId);
    if (task.kind === "financial_archive") return;
    if (task.kind === "audit_receipt") return this.completeWhenAllTasksTerminal(task.deletionRequestId);
  }

  private async deleteOnlineContent(userId: string): Promise<void> {
    await withPostgresTransaction(async (client) => {
      // Content is removed, while remote locators were copied to the private
      // deletion ledger at request time for the later 30-day purge.
      for (const statement of [
        "DELETE FROM public.memory_chat_turns WHERE user_id=$1::uuid",
        "DELETE FROM public.memory_first_greetings WHERE user_id=$1::uuid",
        "DELETE FROM public.messages WHERE user_id=$1::uuid",
        "DELETE FROM public.conversations WHERE user_id=$1::uuid",
        "DELETE FROM public.video_generation_jobs WHERE user_id=$1::uuid",
        "DELETE FROM public.provider_jobs WHERE user_id=$1::uuid",
        "DELETE FROM public.media_assets WHERE user_id=$1::uuid",
        "DELETE FROM public.memories WHERE user_id=$1::uuid",
        "UPDATE public.users SET profile='{}'::jsonb, updated_at=NOW() WHERE id=$1::uuid",
      ]) await client.query(statement, [userId]);
    });
  }

  private async deleteExternalObjects(requestId: string): Promise<void> {
    const objects = await queryPostgres<ObjectRow>(
      `SELECT id, object_kind, object_key, provider, provider_task_id FROM public.account_deletion_object_ledger
       WHERE deletion_request_id=$1::uuid AND status IN ('pending','retry') ORDER BY id`, [requestId],
    );
    const media = createMediaStorage();
    const artifacts = createVideoArtifactStorageFromEnvironment();
    for (const object of objects.rows) {
      if (object.object_kind === "provider_task") throw new AccountDeletionProviderBlocked(object.provider ?? "unknown");
      if (!object.object_key) throw new Error("ACCOUNT_DELETION_OBJECT_LOCATOR_INVALID");
      if (object.object_kind === "media_object") await media.delete(object.object_key);
      else await artifacts.deleteArtifact({ artifactKey: object.object_key });
      await queryPostgres(`UPDATE public.account_deletion_object_ledger SET status='deleted', deleted_at=NOW(), receipt=$2::jsonb, last_error_code=NULL WHERE id=$1::uuid`, [object.id, JSON.stringify({ deleted: true })]);
    }
  }

  private async verifyBackupTombstone(requestId: string): Promise<void> {
    const pending = await queryPostgres<{ count: string }>(`SELECT count(*)::text FROM public.account_deletion_object_ledger WHERE deletion_request_id=$1::uuid AND status <> 'deleted'`, [requestId]);
    if (Number(pending.rows[0]?.count ?? 0) !== 0) throw new Error("ACCOUNT_DELETION_EXTERNAL_PURGE_PENDING");
  }

  private async completeWhenAllTasksTerminal(requestId: string): Promise<void> {
    const remaining = await queryPostgres<{ count: string }>(`SELECT count(*)::text FROM public.account_deletion_tasks WHERE deletion_request_id=$1::uuid AND kind <> 'audit_receipt' AND status <> 'completed'`, [requestId]);
    if (Number(remaining.rows[0]?.count ?? 0) !== 0) throw new Error("ACCOUNT_DELETION_TASKS_PENDING");
    await queryPostgres(`UPDATE public.account_deletion_requests SET status='completed', completed_at=NOW() WHERE id=$1::uuid AND NOT legal_hold`, [requestId]);
  }
}
