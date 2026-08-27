import { getVoiceCloneProvider } from "@/src/server/voice-clone";
import type { VoiceCloneProviderJob } from "@/src/server/voice-clone";
import { QWEN_AUDIO_TTS_FLASH_MODEL } from "@/src/server/voice-clone/providers/qwenAudioTtsFlash";
import { withPostgresTransaction } from "@/src/server/database";
import { isAtLeast18 } from "@/features/account-profile/adult-eligibility";

export const QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER = "qwen_audio_tts_flash";

export class VoiceCloneBetaError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

export type ReserveVoiceCloneInput = {
  externalUserId: string;
  memoryId: string;
  audioAssetId: string;
  idempotencyKey: string;
};

export type VoiceCloneReservation = {
  jobId: string;
  storageKey: string;
  existing: boolean;
  status: "pending" | "ready" | "failed";
  voiceId: string | null;
};

type ProviderJobRow = {
  id: string;
  status: string;
  input_key: string | null;
  provider_response: unknown;
};

function readVoiceId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const voiceId = (value as Record<string, unknown>).voiceId;
  return typeof voiceId === "string" && voiceId ? voiceId : null;
}

function jobStatus(value: string): "pending" | "ready" | "failed" {
  if (value === "completed") return "ready";
  if (value === "failed") return "failed";
  return "pending";
}

function providerPrefix(jobId: string): string {
  return `ma${jobId.replace(/-/g, "").slice(0, 8)}`;
}

export class InternalBetaVoiceCloneService {
  async reserve(input: ReserveVoiceCloneInput): Promise<VoiceCloneReservation> {
    return withPostgresTransaction(async (client) => {
      const owner = await client.query<{ user_id: string }>(
        `SELECT m.user_id
           FROM memories m
           JOIN users account ON account.id = m.user_id
          WHERE m.id = $1
            AND account.external_id = $2
            AND m.metadata ->> 'account_deletion_tombstone' IS DISTINCT FROM 'true'
          FOR UPDATE`,
        [input.memoryId, input.externalUserId],
      );
      const userId = owner.rows[0]?.user_id;
      if (!userId) throw new VoiceCloneBetaError("MEMORY_NOT_FOUND", 404);

      const consent = await client.query<{ birth_date: string | null }>(
        `SELECT account.profile ->> 'birth_date' AS birth_date
           FROM consent_records
           JOIN users account ON account.id = consent_records.user_id
          WHERE user_id = $1
            AND memory_id = $2
            AND consent_type = 'voice_clone'
            AND status = 'approved'
            AND metadata ->> 'version' = 'commercial-trust-v1'
          LIMIT 1`,
        [userId, input.memoryId],
      );
      const birthDate = consent.rows[0]?.birth_date;
      if (!birthDate || !isAtLeast18(birthDate)) {
        throw new VoiceCloneBetaError("VOICE_CLONE_CONSENT_REQUIRED", 403);
      }

      const asset = await client.query<{ storage_key: string | null }>(
        `SELECT storage_key
           FROM media_assets
          WHERE id = $1
            AND user_id = $2
            AND memory_id = $3
            AND media_type = 'audio'
            AND status = 'uploaded'
            AND deleted_at IS NULL
          FOR KEY SHARE`,
        [input.audioAssetId, userId, input.memoryId],
      );
      const storageKey = asset.rows[0]?.storage_key;
      if (!storageKey) throw new VoiceCloneBetaError("VOICE_SAMPLE_NOT_FOUND", 404);

      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:qwen-voice-clone:${input.memoryId}:${input.idempotencyKey}`,
      ]);
      const existing = await client.query<ProviderJobRow>(
        `SELECT id, status, input_key, provider_response
           FROM provider_jobs
          WHERE memory_id = $1
            AND job_type = 'voice_clone'
            AND provider = $2
            AND provider_request ->> 'idempotencyKey' = $3
          ORDER BY created_at DESC
          LIMIT 1`,
        [input.memoryId, QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        return {
          jobId: row.id,
          storageKey: row.input_key ?? storageKey,
          existing: true,
          status: jobStatus(row.status),
          voiceId: readVoiceId(row.provider_response),
        };
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO provider_jobs (
           user_id, memory_id, job_type, provider, status, progress, input_key, provider_request
         ) VALUES ($1, $2, 'voice_clone', $3, 'pending', 0, $4, $5::jsonb)
         RETURNING id`,
        [
          userId,
          input.memoryId,
          QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER,
          storageKey,
          JSON.stringify({
            idempotencyKey: input.idempotencyKey,
            audioAssetId: input.audioAssetId,
            model: QWEN_AUDIO_TTS_FLASH_MODEL,
          }),
        ],
      );
      const jobId = inserted.rows[0]?.id;
      if (!jobId) throw new VoiceCloneBetaError("VOICE_CLONE_UNAVAILABLE", 503);
      return { jobId, storageKey, existing: false, status: "pending", voiceId: null };
    });
  }

  async create(reservation: VoiceCloneReservation, input: { memoryId: string; sampleUrl: string }) {
    const provider = getVoiceCloneProvider(QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER);
    const result = await provider.createJob({
      jobId: reservation.jobId,
      memoryId: input.memoryId,
      voiceSampleUrl: input.sampleUrl,
      voicePrefix: providerPrefix(reservation.jobId),
    });
    if (result.status !== "completed" || !result.voiceId) {
      throw new VoiceCloneBetaError("QWEN_VOICE_CLONE_PROVIDER_FAILED", 502);
    }
    return result;
  }

  async complete(input: { reservation: VoiceCloneReservation; memoryId: string; result: VoiceCloneProviderJob }): Promise<void> {
    if (!input.result.voiceId) throw new VoiceCloneBetaError("QWEN_VOICE_CLONE_PROVIDER_FAILED", 502);
    await withPostgresTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE provider_jobs
            SET status = 'completed', progress = 100, provider_response = $1::jsonb, updated_at = NOW()
          WHERE id = $2
            AND memory_id = $3
            AND provider = $4
            AND status = 'pending'`,
        [
          JSON.stringify({ voiceId: input.result.voiceId, requestId: input.result.requestId ?? null }),
          input.reservation.jobId,
          input.memoryId,
          QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER,
        ],
      );
      if (!updated.rows[0] && updated.rowCount !== 1) {
        throw new VoiceCloneBetaError("VOICE_CLONE_UNAVAILABLE", 503);
      }
      await client.query(
        `UPDATE memories
            SET voice_provider = $1,
                voice_model_id = $2,
                voice_clone_status = 'completed',
                voice_clone_error = NULL,
                updated_at = NOW()
          WHERE id = $3`,
        [QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER, input.result.voiceId, input.memoryId],
      );
    });
  }

  async fail(input: { reservation: VoiceCloneReservation; memoryId: string }): Promise<void> {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `UPDATE provider_jobs
            SET status = 'failed', provider_response = '{}'::jsonb, error_message = 'QWEN_VOICE_CLONE_PROVIDER_FAILED', updated_at = NOW()
          WHERE id = $1 AND memory_id = $2 AND provider = $3 AND status = 'pending'`,
        [input.reservation.jobId, input.memoryId, QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_PROVIDER],
      );
      await client.query(
        `UPDATE memories
            SET voice_clone_status = 'failed', voice_clone_error = 'QWEN_VOICE_CLONE_PROVIDER_FAILED', updated_at = NOW()
          WHERE id = $1`,
        [input.memoryId],
      );
    });
  }
}
