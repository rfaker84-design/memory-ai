import { queryPostgres } from "@/src/server/database";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  created_at: Date | string;
};

export type PickupPhotoSource = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export class PickupPhotoSourceError extends Error {
  constructor(readonly code: "INVALID_REQUEST") {
    super(code);
    this.name = "PickupPhotoSourceError";
  }
}

function requireUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new PickupPhotoSourceError("INVALID_REQUEST");
  return value;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function record(row: Row): PickupPhotoSource {
  return {
    id: row.id,
    mimeType: row.mime_type ?? "image/*",
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : Number(row.size_bytes ?? 0),
    createdAt: iso(row.created_at),
  };
}

/**
 * A deliberately narrow read model for the photo-led pickup screen.  It does
 * not expose COS keys, hashes, descriptions, or assets from another TA.
 */
export class PickupPhotoSourcePostgresService {
  async list(input: { externalUserId: string; memoryId: string }): Promise<PickupPhotoSource[]> {
    const memoryId = requireUuid(input.memoryId);
    const externalUserId = input.externalUserId.trim();
    if (!externalUserId) throw new PickupPhotoSourceError("INVALID_REQUEST");

    const result = await queryPostgres<Row>(
      `SELECT asset.id, asset.mime_type, asset.size_bytes, asset.created_at
         FROM public.media_assets asset
         JOIN public.memories memory ON memory.id=asset.memory_id
         JOIN public.users account ON account.id=memory.user_id AND account.id=asset.user_id
        WHERE asset.memory_id=$1::uuid AND account.external_id=$2
          AND asset.media_type='image' AND asset.status='uploaded' AND asset.deleted_at IS NULL
        ORDER BY asset.created_at DESC, asset.id DESC`,
      [memoryId, externalUserId],
    );
    return result.rows.map(record);
  }
}
