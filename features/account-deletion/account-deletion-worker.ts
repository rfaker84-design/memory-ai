import { queryPostgres, withPostgresTransaction } from "@/src/server/database";
import { createMediaStorage } from "@/src/server/storage";
import { createVideoArtifactStorageFromEnvironment } from "@/features/video/video-artifact-storage";
import { archiveFinancialRecords, FinancialArchiveRefundPendingError, purgeLiveFinancialProductRecords } from "./financial-archive";
import { legalHoldClaimPredicate, type AccountDeletionTaskKind } from "./legal-hold-scope";

type TaskKind = AccountDeletionTaskKind;
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
        `UPDATE public.account_deletion_tasks SET status='completed', claimed_at=NULL, completed_at=NOW(), receipt=$2::jsonb, last_error_code=NULL
         WHERE id=$1::uuid AND status='running'`, [task.id, JSON.stringify({ completed: true, kind: task.kind })],
      );
      await this.refreshRequestStatus(task.deletionRequestId);
      return "completed";
    } catch (error) {
      const code = error instanceof AccountDeletionProviderBlocked
        ? "PROVIDER_DELETE_BLOCKED"
        : error instanceof FinancialArchiveRefundPendingError
          ? "FINANCIAL_ARCHIVE_REFUND_PENDING"
          : "DELETE_RETRY";
      // A missing provider deletion capability is not a completed deletion.
      // Keep the task durable and retryable so a later approved adapter can
      // resume it without recreating the customer request.
      const status = "retry";
      await queryPostgres(
        `UPDATE public.account_deletion_tasks SET status=$2, claimed_at=NULL, next_attempt_at=NOW()+INTERVAL '1 hour', last_error_code=$3
         WHERE id=$1::uuid AND status='running'`, [task.id, status, code],
      ).catch(() => undefined);
      return "retry";
    }
  }

  private async claim(): Promise<ClaimedTask | null> {
    return withPostgresTransaction(async (client) => {
      // Holds require a concrete expiry. Once it has elapsed, content deletion
      // must resume automatically rather than preserving the whole account
      // indefinitely under an obsolete hold.
      await client.query(
        `UPDATE public.account_deletion_requests
         SET legal_hold=false, legal_hold_reason=NULL, legal_hold_scope=NULL,
             legal_hold_approved_by=NULL, legal_hold_expires_at=NULL,
             status='content_pending'
         WHERE legal_hold AND legal_hold_expires_at <= NOW()`,
      );
      const selected = await client.query<{ id: string; deletion_request_id: string; user_id: string; kind: TaskKind }>(
        `SELECT t.id, t.deletion_request_id, r.user_id, t.kind
         FROM public.account_deletion_tasks t JOIN public.account_deletion_requests r ON r.id=t.deletion_request_id
         WHERE (
           (t.status IN ('pending','retry') AND t.next_attempt_at <= NOW())
           OR (t.status='running' AND t.claimed_at < NOW() - INTERVAL '10 minutes')
         ) AND ${legalHoldClaimPredicate("t", "r")}
         ORDER BY t.next_attempt_at,
           CASE t.kind
             WHEN 'revoke_sessions' THEN 1
             WHEN 'content_online' THEN 2
             WHEN 'financial_archive' THEN 3
             WHEN 'cos_provider' THEN 4
             WHEN 'backup_retention' THEN 5
             WHEN 'audit_receipt' THEN 6
             ELSE 99
           END,
           t.id FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return null;
      await client.query(`UPDATE public.account_deletion_tasks SET status='running', claimed_at=NOW(), attempt_count=attempt_count+1 WHERE id=$1::uuid`, [row.id]);
      return { id: row.id, deletionRequestId: row.deletion_request_id, userId: row.user_id, kind: row.kind };
    });
  }

  private async execute(task: ClaimedTask): Promise<void> {
    if (task.kind === "revoke_sessions") return this.verifySessionInvalidation(task.userId);
    if (task.kind === "content_online") return this.deleteOnlineContent(task.userId);
    if (task.kind === "cos_provider") return this.deleteExternalObjects(task.deletionRequestId);
    if (task.kind === "backup_retention") return this.verifyBackupTombstone(task.deletionRequestId);
    if (task.kind === "financial_archive") {
      await archiveFinancialRecords({ deletionRequestId: task.deletionRequestId, userId: task.userId });
      return purgeLiveFinancialProductRecords(task.userId);
    }
    if (task.kind === "audit_receipt") return this.completeWhenAllTasksTerminal(task.deletionRequestId);
  }

  private async deleteOnlineContent(userId: string): Promise<void> {
    await withPostgresTransaction(async (client) => {
      // Content is removed, while remote locators were copied to the private
      // deletion ledger at request time for the later 30-day purge.
      for (const statement of [
        `DELETE FROM public.long_term_memories
         WHERE memory_id IN (SELECT id FROM public.memories WHERE user_id=$1::uuid)`,
        `DELETE FROM public.memory_fragments
         WHERE memory_id IN (SELECT id FROM public.memories WHERE user_id=$1::uuid)`,
        "DELETE FROM public.memory_chat_turns WHERE user_id=$1::uuid",
        "DELETE FROM public.memory_first_greetings WHERE user_id=$1::uuid",
        "DELETE FROM public.messages WHERE user_id=$1::uuid",
        "DELETE FROM public.conversations WHERE user_id=$1::uuid",
        "DELETE FROM public.business_funnel_events WHERE user_id=$1::uuid",
        "DELETE FROM public.product_interaction_events WHERE owner_id=$1::uuid",
        "DELETE FROM public.product_first_touch_attributions WHERE owner_id=$1::uuid",
        "DELETE FROM public.product_metrics_subject_flags WHERE user_id=$1::uuid",
        "DELETE FROM public.commerce_photo_remedies WHERE user_id=$1::uuid",
        "DELETE FROM public.video_generation_jobs WHERE user_id=$1::uuid",
        "DELETE FROM public.provider_jobs WHERE user_id=$1::uuid",
        "DELETE FROM public.media_assets WHERE user_id=$1::uuid",
        "DELETE FROM public.auth_external_identities WHERE user_id=$1::uuid",
        "DELETE FROM public.auth_oauth_states WHERE link_user_id=$1::uuid",
        `UPDATE public.consent_records
         SET memory_id=NULL, owner_name=NULL, relationship_to_owner=NULL,
             proof_key=NULL, notes=NULL,
             metadata=jsonb_build_object('account_deletion_tombstone', true), updated_at=NOW()
         WHERE user_id=$1::uuid`,
        `UPDATE public.audit_logs
         SET memory_id=NULL, message='account deletion audit retained',
             metadata=jsonb_build_object('account_deletion_tombstone', true)
         WHERE user_id=$1::uuid`,
        `UPDATE public.memories SET
          name='已删除', relationship='', life_story=NULL, personality_profile=NULL,
          speech_style=NULL, catch_phrases=NULL, photo_url=NULL, personality_tags=NULL,
          birth_year=NULL, death_year=NULL, values_belief=NULL, personality_type=NULL,
          voice_sample_url=NULL, voice_provider=NULL, voice_model_id=NULL,
          voice_model_url=NULL, voice_clone_status=NULL, voice_training_status=NULL,
          voice_clone_error=NULL, avatar_video_url=NULL, avatar_status=NULL,
          avatar_job_id=NULL, avatar_provider=NULL, avatar_error=NULL,
          metadata=jsonb_build_object('account_deletion_tombstone', true), deleted_at=NOW(), updated_at=NOW()
         WHERE user_id=$1::uuid`,
        "UPDATE public.users SET profile='{}'::jsonb, updated_at=NOW() WHERE id=$1::uuid",
      ]) await client.query(statement, [userId]);
    });
  }

  private async verifySessionInvalidation(userId: string): Promise<void> {
    const invalidated = await queryPostgres<{ active: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.auth_session_invalidations WHERE user_id=$1::uuid) AS active`, [userId],
    );
    if (!invalidated.rows[0]?.active) throw new Error("ACCOUNT_DELETION_SESSION_INVALIDATION_MISSING");
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

  private async refreshRequestStatus(requestId: string): Promise<void> {
    await queryPostgres(
      `UPDATE public.account_deletion_requests r
       SET status = CASE
         WHEN r.legal_hold THEN 'legal_hold'
         WHEN EXISTS (
           SELECT 1 FROM public.account_deletion_tasks t
           WHERE t.deletion_request_id=r.id AND t.kind='content_online' AND t.status <> 'completed'
         ) THEN 'content_pending'
         WHEN EXISTS (
           SELECT 1 FROM public.account_deletion_tasks t
           WHERE t.deletion_request_id=r.id AND t.kind IN ('cos_provider','backup_retention') AND t.status <> 'completed'
         ) THEN 'provider_pending'
         ELSE r.status
       END
       WHERE r.id=$1::uuid AND r.status <> 'completed'`,
      [requestId],
    );
  }
}
