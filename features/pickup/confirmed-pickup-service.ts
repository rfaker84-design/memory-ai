import { createHash } from "node:crypto";

import type { PoolClient } from "pg";

import { queryPostgres, withPostgresTransaction } from "@/src/server/database";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,64}$/;
const SOURCE_PREFIX = "user_confirmed_pickup:";

type Row = {
  id: string;
  memory_id: string;
  content: string;
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ConfirmedPickup = {
  id: string;
  memoryId: string;
  requestKey: string;
  originalText: string;
  organizedText: string;
  createdAt: string;
  updatedAt: string;
};

export class ConfirmedPickupError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "MEMORY_NOT_FOUND" | "PICKUP_NOT_FOUND" | "REQUEST_KEY_CONFLICT") {
    super(code);
    this.name = "ConfirmedPickupError";
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function text(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 8_000) throw new ConfirmedPickupError("INVALID_REQUEST");
  return normalized;
}

function memoryId(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new ConfirmedPickupError("INVALID_REQUEST");
  return value;
}

function pickupId(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new ConfirmedPickupError("INVALID_REQUEST");
  return value;
}

function requestKey(value: string): string {
  if (!REQUEST_KEY_PATTERN.test(value)) throw new ConfirmedPickupError("INVALID_REQUEST");
  return value;
}

function sourceType(key: string): string {
  return `${SOURCE_PREFIX}${key}`;
}

function record(row: Row): ConfirmedPickup {
  const originalText = typeof row.metadata.originalText === "string" ? row.metadata.originalText : "";
  const organizedText = typeof row.metadata.organizedText === "string" ? row.metadata.organizedText : row.content;
  const key = typeof row.source_id === "string" ? row.source_id : "";
  if (!originalText || !organizedText || !key) throw new ConfirmedPickupError("PICKUP_NOT_FOUND");
  return {
    id: row.id,
    memoryId: row.memory_id,
    requestKey: key,
    originalText,
    organizedText,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function requireOwnedMemory(client: PoolClient, value: string, externalUserId: string): Promise<void> {
  const owned = await client.query(
    `SELECT m.id FROM public.memories m
      JOIN public.users u ON u.id=m.user_id
     WHERE m.id=$1::uuid AND u.external_id=$2
     FOR KEY SHARE OF m`,
    [value, externalUserId],
  );
  if (!owned.rows[0]) throw new ConfirmedPickupError("MEMORY_NOT_FOUND");
}

export class ConfirmedPickupPostgresService {
  async confirm(input: {
    externalUserId: string;
    memoryId: string;
    requestKey: string;
    originalText: string;
    organizedText: string;
  }): Promise<ConfirmedPickup> {
    const owner = text(input.externalUserId, "externalUserId");
    const targetMemoryId = memoryId(input.memoryId);
    const targetRequestKey = requestKey(input.requestKey);
    const originalText = text(input.originalText, "originalText");
    const organizedText = text(input.organizedText, "organizedText");
    const targetSourceType = sourceType(targetRequestKey);
    const metadata = {
      schema: "pickup-v1",
      sourceKind: "user_confirmed_pickup",
      originalText,
      organizedText,
      confirmedAt: new Date().toISOString(),
    };

    return withPostgresTransaction(async (client) => {
      await requireOwnedMemory(client, targetMemoryId, owner);
      const existing = await client.query<Row>(
        `SELECT id, memory_id, content, source_id, metadata, created_at, updated_at
           FROM public.long_term_memories
          WHERE memory_id=$1::uuid AND source_type=$2
          FOR UPDATE`,
        [targetMemoryId, targetSourceType],
      );
      if (existing.rows[0]) {
        const saved = record(existing.rows[0]);
        if (saved.originalText !== originalText || saved.organizedText !== organizedText) {
          throw new ConfirmedPickupError("REQUEST_KEY_CONFLICT");
        }
        return saved;
      }
      const contentHash = createHash("sha256").update(organizedText).digest("hex");
      const inserted = await client.query<Row>(
        `INSERT INTO public.long_term_memories
          (memory_id, content, content_hash, source_type, source_id, importance, tags, metadata)
         VALUES ($1::uuid,$2,$3,$4,$5,70,ARRAY['user-confirmed']::text[],$6::jsonb)
         RETURNING id, memory_id, content, source_id, metadata, created_at, updated_at`,
        [targetMemoryId, organizedText, contentHash, targetSourceType, targetRequestKey, JSON.stringify(metadata)],
      );
      return record(inserted.rows[0]!);
    }, { preserveError: (error) => error instanceof ConfirmedPickupError });
  }

  async list(input: { externalUserId: string; memoryId: string }): Promise<ConfirmedPickup[]> {
    const owner = text(input.externalUserId, "externalUserId");
    const targetMemoryId = memoryId(input.memoryId);
    const result = await queryPostgres<Row>(
      `SELECT l.id, l.memory_id, l.content, l.source_id, l.metadata, l.created_at, l.updated_at
         FROM public.long_term_memories l
         JOIN public.memories m ON m.id=l.memory_id
         JOIN public.users u ON u.id=m.user_id
        WHERE l.memory_id=$1::uuid AND u.external_id=$2
          AND l.source_type LIKE $3 AND l.metadata ->> 'sourceKind' = 'user_confirmed_pickup'
        ORDER BY l.updated_at DESC, l.created_at DESC`,
      [targetMemoryId, owner, `${SOURCE_PREFIX}%`],
    );
    return result.rows.map(record);
  }

  async update(input: {
    externalUserId: string;
    memoryId: string;
    pickupId: string;
    originalText: string;
    organizedText: string;
  }): Promise<ConfirmedPickup> {
    const owner = text(input.externalUserId, "externalUserId");
    const targetMemoryId = memoryId(input.memoryId);
    const targetPickupId = pickupId(input.pickupId);
    const originalText = text(input.originalText, "originalText");
    const organizedText = text(input.organizedText, "organizedText");
    const hash = createHash("sha256").update(organizedText).digest("hex");
    const metadata = JSON.stringify({ originalText, organizedText, editedAt: new Date().toISOString() });
    const result = await queryPostgres<Row>(
      `UPDATE public.long_term_memories l
          SET content=$5, content_hash=$6, metadata=l.metadata || $7::jsonb, updated_at=NOW()
         FROM public.memories m
         JOIN public.users u ON u.id=m.user_id
        WHERE l.id=$1::uuid AND l.memory_id=$2::uuid AND m.id=l.memory_id AND u.external_id=$3
          AND l.source_type LIKE $4 AND l.metadata ->> 'sourceKind' = 'user_confirmed_pickup'
      RETURNING l.id, l.memory_id, l.content, l.source_id, l.metadata, l.created_at, l.updated_at`,
      [targetPickupId, targetMemoryId, owner, `${SOURCE_PREFIX}%`, organizedText, hash, metadata],
    );
    if (!result.rows[0]) throw new ConfirmedPickupError("PICKUP_NOT_FOUND");
    return record(result.rows[0]);
  }

  async delete(input: { externalUserId: string; memoryId: string; pickupId: string }): Promise<void> {
    const owner = text(input.externalUserId, "externalUserId");
    const targetMemoryId = memoryId(input.memoryId);
    const targetPickupId = pickupId(input.pickupId);
    const result = await queryPostgres(
      `DELETE FROM public.long_term_memories l
        USING public.memories m, public.users u
        WHERE l.id=$1::uuid AND l.memory_id=$2::uuid AND m.id=l.memory_id AND u.id=m.user_id
          AND u.external_id=$3 AND l.source_type LIKE $4
          AND l.metadata ->> 'sourceKind' = 'user_confirmed_pickup'
        RETURNING l.id`,
      [targetPickupId, targetMemoryId, owner, `${SOURCE_PREFIX}%`],
    );
    if (!result.rows[0]) throw new ConfirmedPickupError("PICKUP_NOT_FOUND");
  }
}
