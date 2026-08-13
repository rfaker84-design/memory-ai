import type { QueryResultRow } from "pg";
import { queryPostgres, withPostgresTransaction } from "../../src/server/database";
import type { MediaDataSource } from "./datasource";
import type { MediaAsset, MediaStatus, MediaType, ReserveMediaInput, ReserveMediaResult } from "./types";

interface MediaRow extends QueryResultRow {
  id: string; user_id: string; memory_id: string; media_type: MediaType; storage_key: string | null;
  mime_type: string; size_bytes: string; sha256: string; status: MediaStatus; failure_code: string | null;
  metadata: Record<string, unknown>;
  deleted_at: Date | null; created_at: Date; updated_at: Date;
}
const columns = "id,user_id,memory_id,media_type,storage_key,mime_type,size_bytes,sha256,status,failure_code,metadata,deleted_at,created_at,updated_at";
const toAsset = (row: MediaRow): MediaAsset => ({ id: row.id, userId: row.user_id, memoryId: row.memory_id,
  mediaType: row.media_type, storageKey: row.storage_key, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes),
  sha256: row.sha256, status: row.status, failureCode: row.failure_code, deletedAt: row.deleted_at?.toISOString() ?? null,
  metadata: row.metadata ?? {},
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });

export class MediaPostgresDataSource implements MediaDataSource {
  async reserve(input: ReserveMediaInput): Promise<ReserveMediaResult> {
    return withPostgresTransaction(async (client) => {
      const owner = await client.query<{ id: string }>(
        "SELECT u.id FROM users u JOIN memories m ON m.user_id=u.id WHERE u.external_id=$1 AND m.id=$2 FOR UPDATE",
        [input.externalUserId, input.memoryId]);
      if (!owner.rows[0]) throw new Error("MEDIA_MEMORY_NOT_OWNED");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${owner.rows[0].id}:${input.memoryId}:${input.mediaType}:${input.sha256}`,
      ]);
      const existing = await client.query<MediaRow>(
        `SELECT ${columns} FROM media_assets WHERE user_id=$1 AND memory_id=$2 AND sha256=$3 AND media_type=$4 AND status IN ('pending','uploaded') AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [owner.rows[0].id, input.memoryId, input.sha256, input.mediaType]);
      if (existing.rows[0]) {
        const existingAsset = toAsset(existing.rows[0]);
        if (input.metadata?.qualityPreflightStatus === "passed" || input.metadata?.qualityPreflightStatus === "failed") {
          const refreshed = await client.query<MediaRow>(
            `UPDATE media_assets
             SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING ${columns}`,
            [existingAsset.id, JSON.stringify(input.metadata)],
          );
          return { asset: toAsset(refreshed.rows[0]), duplicate: true };
        }
        return { asset: existingAsset, duplicate: true };
      }
      const inserted = await client.query<MediaRow>(
        `INSERT INTO media_assets (user_id,memory_id,media_type,storage_key,mime_type,size_bytes,sha256,status,upload_attempts,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',1,$8::jsonb) RETURNING ${columns}`,
        [owner.rows[0].id, input.memoryId, input.mediaType, input.storageKey, input.mimeType, input.sizeBytes, input.sha256, JSON.stringify(input.metadata ?? {})]);
      return { asset: toAsset(inserted.rows[0]), duplicate: false };
    });
  }
  async markUploaded(id: string, userId: string): Promise<MediaAsset> {
    const returning = columns.split(",").map((column) => `a.${column}`).join(",");
    const result = await queryPostgres<MediaRow>(`UPDATE media_assets a SET status='uploaded',failure_code=NULL FROM users u WHERE a.id=$1 AND a.user_id=u.id AND u.external_id=$2 RETURNING ${returning}`,[id,userId]);
    if (!result.rows[0]) throw new Error("MEDIA_UPLOAD_UPDATE_FAILED");
    return toAsset(result.rows[0]);
  }
  async markFailed(id: string, userId: string, code: string): Promise<void> {
    await queryPostgres("UPDATE media_assets a SET status='failed',failure_code=$3 FROM users u WHERE a.id=$1 AND a.user_id=u.id AND u.external_id=$2",[id,userId,code]);
  }
  async updateQualityPreflight(
    id: string,
    userId: string,
    metadata: Record<string, unknown>,
    failureCode: string | null,
  ): Promise<MediaAsset | null> {
    const returning = columns.split(",").map((column) => `a.${column}`).join(",");
    const result = await queryPostgres<MediaRow>(
      `UPDATE media_assets a
       SET metadata = COALESCE(a.metadata, '{}'::jsonb) || $3::jsonb,
           failure_code = $4,
           updated_at = NOW()
       FROM users u
       WHERE a.id = $1 AND a.user_id = u.id AND u.external_id = $2
         AND a.media_type = 'image' AND a.status = 'uploaded' AND a.deleted_at IS NULL
       RETURNING ${returning}`,
      [id, userId, JSON.stringify(metadata), failureCode],
    );
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }
  async findOwned(id: string, userId: string): Promise<MediaAsset | null> {
    const result = await queryPostgres<MediaRow>(`SELECT ${columns.split(",").map((c)=>`a.${c}`).join(",")} FROM media_assets a JOIN users u ON u.id=a.user_id WHERE a.id=$1 AND u.external_id=$2 AND a.deleted_at IS NULL`,[id,userId]);
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }
  async softDelete(id: string, userId: string): Promise<MediaAsset | null> {
    const returning = columns.split(",").map((column) => `a.${column}`).join(",");
    const result = await queryPostgres<MediaRow>(`UPDATE media_assets a SET status='deleted',deleted_at=NOW(),cleanup_after=NOW()+INTERVAL '24 hours' FROM users u WHERE a.id=$1 AND a.user_id=u.id AND u.external_id=$2 AND a.deleted_at IS NULL RETURNING ${returning}`,[id,userId]);
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }
}
