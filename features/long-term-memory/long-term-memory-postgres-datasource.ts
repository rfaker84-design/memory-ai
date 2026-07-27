import { createHash } from "node:crypto";

import type { PoolClient } from "pg";

import { queryPostgres, withPostgresTransaction } from "../../src/server/database";
import type { LongTermMemoryDataSource } from "./datasource";
import {
  LongTermMemoryConflictError,
  LongTermMemoryNotFoundError,
  LongTermMemoryValidationError,
} from "./errors";
import type {
  CreateLongTermMemoryInput,
  DeleteLongTermMemoryInput,
  ListLongTermMemoriesInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

type LongTermMemoryRow = {
  id: string;
  memory_id: string;
  content: string;
  content_hash: string;
  source_type: string;
  source_id: string | null;
  importance: number;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = `
  id, memory_id, content, content_hash, source_type, source_id,
  importance, tags, metadata, created_at, updated_at
`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toEntity(row: LongTermMemoryRow): LongTermMemory {
  return {
    id: row.id,
    memoryId: row.memory_id,
    content: row.content,
    contentHash: row.content_hash,
    sourceType: row.source_type,
    sourceId: row.source_id,
    importance: row.importance,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new LongTermMemoryValidationError(`${field} is invalid`);
  }
  return normalized;
}

function validateMemoryId(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new LongTermMemoryValidationError("memoryId is invalid");
  }
  return value;
}

function validateLongTermMemoryId(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new LongTermMemoryValidationError("longTermMemoryId is invalid");
  }
  return value;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((tag) => requiredText(tag, "tag", 64)))];
}

function importance(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new LongTermMemoryValidationError("importance is invalid");
  }
  return value;
}

function topK(value: number | undefined): number {
  const resolved = value ?? 10;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 25) {
    throw new LongTermMemoryValidationError("topK is invalid");
  }
  return resolved;
}

function listLimit(value: number | undefined): number {
  const resolved = value ?? 100;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new LongTermMemoryValidationError("limit is invalid");
  }
  return resolved;
}

function recallKeywords(query: string): string[] {
  const words = query.trim().toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const keywords = new Set<string>();
  for (const word of words) {
    if (/^\p{Script=Han}+$/u.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) {
        keywords.add(word.slice(index, index + 2));
        if (keywords.size >= 12) return [...keywords];
      }
    } else {
      keywords.add(word.slice(0, 64));
    }
    if (keywords.size >= 12) break;
  }
  return [...keywords];
}

function qualifiedColumns(alias: string): string {
  return COLUMNS.split(",")
    .map((column) => `${alias}.${column.trim()}`)
    .join(", ");
}

async function requireOwnedMemory(
  client: PoolClient,
  memoryId: string,
  externalUserId: string
): Promise<void> {
  const owned = await client.query(
    `SELECT m.id
     FROM memories m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND u.external_id = $2
     FOR KEY SHARE OF m`,
    [memoryId, externalUserId]
  );
  if (!owned.rows[0]) {
    throw new LongTermMemoryNotFoundError("Memory not found");
  }
}

export class LongTermMemoryPostgresDataSource
  implements LongTermMemoryDataSource
{
  async create(input: CreateLongTermMemoryInput): Promise<LongTermMemory> {
    const externalUserId = requiredText(input.externalUserId, "externalUserId", 255);
    const memoryId = validateMemoryId(input.memoryId);
    const content = requiredText(input.content, "content", 8_000);
    const sourceType = requiredText(input.sourceType, "sourceType", 100);
    const sourceId = input.sourceId === undefined || input.sourceId === null
      ? null
      : requiredText(input.sourceId, "sourceId", 255);
    const contentHash = createHash("sha256").update(content).digest("hex");
    const normalizedTags = normalizeTags(input.tags);
    const normalizedImportance = importance(input.importance);
    const metadata = input.metadata ?? {};

    return withPostgresTransaction(async (client) => {
      await requireOwnedMemory(client, memoryId, externalUserId);
      const inserted = await client.query<LongTermMemoryRow>(
        `INSERT INTO long_term_memories (
           memory_id, content, content_hash, source_type, source_id,
           importance, tags, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb)
         ON CONFLICT (memory_id, source_type, content_hash) DO NOTHING
         RETURNING ${COLUMNS}`,
        [
          memoryId,
          content,
          contentHash,
          sourceType,
          sourceId,
          normalizedImportance,
          normalizedTags,
          JSON.stringify(metadata),
        ]
      );
      if (inserted.rows[0]) return toEntity(inserted.rows[0]);

      const duplicate = await client.query<LongTermMemoryRow>(
        `SELECT ${COLUMNS}
         FROM long_term_memories
         WHERE memory_id = $1 AND source_type = $2 AND content_hash = $3
         LIMIT 1`,
        [memoryId, sourceType, contentHash]
      );
      if (!duplicate.rows[0]) {
        throw new LongTermMemoryValidationError("Long-term memory conflict is inconsistent");
      }
      return toEntity(duplicate.rows[0]);
    });
  }

  async recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    const externalUserId = requiredText(input.externalUserId, "externalUserId", 255);
    const memoryId = validateMemoryId(input.memoryId);
    const query = requiredText(input.query, "query", 4_000);
    const keywords = recallKeywords(query);
    const result = await queryPostgres<LongTermMemoryRow & { relevance_score: string }>(
      `SELECT l.id, l.memory_id, l.content, l.content_hash, l.source_type,
         l.source_id, l.importance, l.tags, l.metadata, l.created_at, l.updated_at,
         COALESCE((
           SELECT COUNT(*)
           FROM unnest($3::text[]) AS keyword
           WHERE LOWER(l.content) LIKE ('%' || keyword || '%')
         ), 0) AS relevance_score
       FROM long_term_memories l
       JOIN memories m ON m.id = l.memory_id
       JOIN users u ON u.id = m.user_id
       WHERE l.memory_id = $1 AND u.external_id = $2
       ORDER BY relevance_score DESC, l.importance DESC, l.created_at DESC
       LIMIT $4`,
      [memoryId, externalUserId, keywords, topK(input.topK)]
    );
    return { memories: result.rows.map(toEntity), query };
  }

  async list(input: ListLongTermMemoriesInput): Promise<LongTermMemory[]> {
    const externalUserId = requiredText(input.externalUserId, "externalUserId", 255);
    const memoryId = validateMemoryId(input.memoryId);
    const result = await queryPostgres<LongTermMemoryRow>(
      `SELECT ${qualifiedColumns("l")}
       FROM long_term_memories l
       JOIN memories m ON m.id = l.memory_id
       JOIN users u ON u.id = m.user_id
       WHERE l.memory_id = $1 AND u.external_id = $2
       ORDER BY l.updated_at DESC, l.created_at DESC
       LIMIT $3`,
      [memoryId, externalUserId, listLimit(input.limit)]
    );
    return result.rows.map(toEntity);
  }

  async update(input: UpdateLongTermMemoryInput): Promise<LongTermMemory> {
    const externalUserId = requiredText(input.externalUserId, "externalUserId", 255);
    const memoryId = validateMemoryId(input.memoryId);
    const longTermMemoryId = validateLongTermMemoryId(input.longTermMemoryId);
    const content = requiredText(input.content, "content", 8_000);
    const contentHash = createHash("sha256").update(content).digest("hex");

    try {
      const result = await queryPostgres<LongTermMemoryRow>(
        `UPDATE long_term_memories l
         SET content = $4, content_hash = $5, updated_at = NOW(),
             metadata = l.metadata || '{"userCorrected":true}'::jsonb
         FROM memories m
         JOIN users u ON u.id = m.user_id
         WHERE l.id = $1 AND l.memory_id = $2 AND m.id = l.memory_id
           AND u.external_id = $3
         RETURNING ${qualifiedColumns("l")}`,
        [longTermMemoryId, memoryId, externalUserId, content, contentHash]
      );
      if (!result.rows[0]) {
        throw new LongTermMemoryNotFoundError("Long-term memory not found");
      }
      return toEntity(result.rows[0]);
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "23505"
      ) {
        throw new LongTermMemoryConflictError("The corrected memory already exists");
      }
      throw error;
    }
  }

  async delete(input: DeleteLongTermMemoryInput): Promise<void> {
    const externalUserId = requiredText(input.externalUserId, "externalUserId", 255);
    const memoryId = validateMemoryId(input.memoryId);
    const longTermMemoryId = validateLongTermMemoryId(input.longTermMemoryId);
    const result = await queryPostgres<{ id: string }>(
      `DELETE FROM long_term_memories l
       USING memories m, users u
       WHERE l.id = $1 AND l.memory_id = $2 AND m.id = l.memory_id
         AND u.id = m.user_id AND u.external_id = $3
       RETURNING l.id`,
      [longTermMemoryId, memoryId, externalUserId]
    );
    if (!result.rows[0]) {
      throw new LongTermMemoryNotFoundError("Long-term memory not found");
    }
  }
}
