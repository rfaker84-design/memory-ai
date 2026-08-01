import type { PoolClient } from "pg";

import { withPostgresTransaction } from "@/src/server/database";

type JsonRow = { value: Record<string, unknown> };

export type AccountDataExport = {
  schemaVersion: "memoryai-account-data-export-v1";
  generatedAt: string;
  account: { id: string; createdAt: string };
  memories: Record<string, unknown>[];
  memoryFragments: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  firstGreetings: Record<string, unknown>[];
  media: Record<string, unknown>[];
  videoJobs: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  notices: string[];
};

export class AccountDataExportError extends Error {
  constructor(readonly code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_DELETION_IN_PROGRESS") {
    super(code);
  }
}

async function jsonRows(client: PoolClient, query: string, userId: string): Promise<Record<string, unknown>[]> {
  return (await client.query<JsonRow>(query, [userId])).rows.map((row) => row.value);
}

function queuedJsonRows(client: PoolClient, userId: string): (query: string) => Promise<Record<string, unknown>[]> {
  let tail: Promise<void> = Promise.resolve();
  return (query) => {
    const result = tail.then(() => jsonRows(client, query, userId));
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

/**
 * Builds a customer-readable, read-only copy of owned product data. It
 * deliberately excludes authentication secrets, provider request/response
 * payloads, object locators, payment rail identifiers, and internal audit
 * metadata. Media remains downloadable through the already owner-bound media
 * endpoint while the authenticated session is valid.
 */
export class PostgresAccountDataExportService {
  async create(input: { userId: string; externalUserId: string; now?: Date }): Promise<AccountDataExport> {
    const now = input.now ?? new Date();
    return withPostgresTransaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SET LOCAL statement_timeout = '15s'");
      const account = await client.query<{ id: string; created_at: Date }>(
        "SELECT id, created_at FROM public.users WHERE id=$1::uuid AND external_id=$2",
        [input.userId, input.externalUserId],
      );
      if (!account.rows[0]) throw new AccountDataExportError("ACCOUNT_NOT_FOUND");

      const deletion = await client.query<{ status: string }>(
        "SELECT status FROM public.account_deletion_requests WHERE user_id=$1::uuid",
        [input.userId],
      );
      if (deletion.rows[0] && deletion.rows[0].status !== "failed") {
        throw new AccountDataExportError("ACCOUNT_DELETION_IN_PROGRESS");
      }

      const exportRows = queuedJsonRows(client, input.userId);
      const [memories, memoryFragments, conversations, messages, firstGreetings, media, videoJobs, consents, payments, refunds] = await Promise.all([
        exportRows(`SELECT jsonb_build_object(
          'id', m.id, 'name', m.name, 'relationship', m.relationship,
          'lifeStory', m.life_story, 'personalityProfile', m.personality_profile,
          'speechStyle', m.speech_style, 'catchPhrases', m.catch_phrases,
          'personalityTags', m.personality_tags, 'birthYear', m.birth_year,
          'deathYear', m.death_year, 'valuesBelief', m.values_belief,
          'personalityType', m.personality_type, 'voiceCloneStatus', m.voice_clone_status,
          'voiceTrainingStatus', m.voice_training_status, 'createdAt', m.created_at,
          'updatedAt', m.updated_at, 'deletedAt', m.deleted_at
        ) AS value FROM public.memories m WHERE m.user_id=$1::uuid ORDER BY m.created_at, m.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', f.id, 'memoryId', f.memory_id, 'sourceType', f.source_type,
          'content', f.content, 'createdAt', f.created_at, 'updatedAt', f.updated_at
        ) AS value FROM public.memory_fragments f JOIN public.memories m ON m.id=f.memory_id
        WHERE m.user_id=$1::uuid ORDER BY f.created_at, f.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', c.id, 'memoryId', c.memory_id, 'title', c.title, 'summary', c.summary,
          'lastMessageAt', c.last_message_at, 'createdAt', c.created_at, 'updatedAt', c.updated_at
        ) AS value FROM public.conversations c WHERE c.user_id=$1::uuid ORDER BY c.created_at, c.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', m.id, 'conversationId', m.conversation_id, 'memoryId', m.memory_id,
          'role', m.role, 'content', m.content, 'emotion', m.emotion,
          'createdAt', m.created_at, 'updatedAt', m.updated_at
        ) AS value FROM public.messages m WHERE m.user_id=$1::uuid ORDER BY m.created_at, m.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', g.id, 'memoryId', g.memory_id, 'conversationId', g.conversation_id,
          'status', g.status, 'createdAt', g.created_at, 'updatedAt', g.updated_at
        ) AS value FROM public.memory_first_greetings g WHERE g.user_id=$1::uuid ORDER BY g.created_at, g.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', a.id, 'memoryId', a.memory_id, 'mediaType', a.media_type,
          'mimeType', a.mime_type, 'sizeBytes', a.size_bytes, 'sha256', a.sha256,
          'status', a.status, 'failureCode', a.failure_code, 'createdAt', a.created_at,
          'updatedAt', a.updated_at, 'deletedAt', a.deleted_at,
          'downloadEndpoint', '/api/media/' || a.id::text || '?expiresIn=300'
        ) AS value FROM public.media_assets a WHERE a.user_id=$1::uuid ORDER BY a.created_at, a.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', j.id, 'memoryId', j.memory_id, 'provider', j.provider, 'status', j.status,
          'qualityStatus', j.quality_status, 'actualCredits', j.actual_credits,
          'createdAt', j.created_at, 'updatedAt', j.updated_at
        ) AS value FROM public.video_generation_jobs j WHERE j.user_id=$1::uuid ORDER BY j.created_at, j.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', c.id, 'memoryId', c.memory_id, 'consentType', c.consent_type,
          'status', c.status, 'ownerName', c.owner_name,
          'relationshipToOwner', c.relationship_to_owner, 'notes', c.notes,
          'createdAt', c.created_at, 'updatedAt', c.updated_at
        ) AS value FROM public.consent_records c WHERE c.user_id=$1::uuid ORDER BY c.created_at, c.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', o.id, 'memoryId', o.memory_id, 'productId', o.product_id,
          'amountFen', o.amount_fen, 'currency', o.currency, 'durationDays', o.duration_days,
          'chatQuota', o.chat_quota, 'status', o.status, 'expiresAt', o.expires_at,
          'paidAt', o.paid_at, 'failedAt', o.failed_at, 'cancelledAt', o.cancelled_at,
          'refundedAt', o.refunded_at, 'createdAt', o.created_at, 'updatedAt', o.updated_at
        ) AS value FROM public.payment_orders o WHERE o.user_id=$1::uuid ORDER BY o.created_at, o.id`),
        exportRows(`SELECT jsonb_build_object(
          'id', r.id, 'memoryId', r.memory_id, 'orderId', r.order_id, 'reason', r.reason,
          'status', r.status, 'eligibility', r.eligibility, 'decisionCode', r.decision_code,
          'createdAt', r.created_at, 'requestedAt', r.requested_at,
          'resolvedAt', r.resolved_at, 'updatedAt', r.updated_at
        ) AS value FROM public.refund_requests r WHERE r.user_id=$1::uuid ORDER BY r.created_at, r.id`),
      ]);

      return {
        schemaVersion: "memoryai-account-data-export-v1",
        generatedAt: now.toISOString(),
        account: { id: account.rows[0].id, createdAt: account.rows[0].created_at.toISOString() },
        memories,
        memoryFragments,
        conversations,
        messages,
        firstGreetings,
        media,
        videoJobs,
        consents,
        payments,
        refunds,
        notices: [
          "该副本不包含登录凭据、设备标识、验证码、Provider 请求或响应、对象存储定位符、签名 URL、支付渠道交易标识及内部审计元数据。",
          "媒体条目给出受当前 Owner Session 保护的下载入口；已审批视频继续由现有播放授权边界控制。",
          "法定财务、退款争议与会计归档与产品内容物理/逻辑隔离；本副本只包含面向用户的最小订单和退款摘要。",
        ],
      };
    }, { preserveError: (error) => error instanceof AccountDataExportError });
  }
}
