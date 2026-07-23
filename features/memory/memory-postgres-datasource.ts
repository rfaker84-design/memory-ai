import { createHash } from "node:crypto";

import type { PoolClient } from "pg";

import {
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";
import type { MemoryDataSource } from "./datasource";
import {
  MemoryMediaConflictError,
  MemoryNotFoundError,
  MemoryValidationError,
} from "./errors";
import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";
import type { UpdateOwnedMemoryInput } from "./types";

type MemoryRow = {
  id: string;
  external_id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  personality_profile: string | null;
  speech_style: string | null;
  catch_phrases: string | null;
  photo_url: string | null;
  photo_asset_id: string | null;
  personality_tags: string[] | string | null;
  birth_year: number | null;
  death_year: number | null;
  values_belief: string | null;
  personality_type: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

const MEMORY_COLUMNS = `
  m.id,
  u.external_id,
  m.name,
  m.relationship,
  m.life_story,
  m.personality_profile,
  m.speech_style,
  m.catch_phrases,
  m.photo_url,
  (
    SELECT a.id
    FROM media_assets a
    WHERE a.memory_id = m.id
      AND a.media_type = 'image'
      AND a.status = 'uploaded'
      AND a.deleted_at IS NULL
    ORDER BY a.created_at DESC
    LIMIT 1
  ) AS photo_asset_id,
  m.personality_tags,
  m.birth_year,
  m.death_year,
  m.values_belief,
  m.personality_type,
  m.created_at,
  m.updated_at
`;

function isoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.external_id,
    name: row.name,
    relationship: row.relationship,
    lifeStory: row.life_story,
    personalityProfile: row.personality_profile,
    speechStyle: row.speech_style,
    catchPhrases: row.catch_phrases,
    photoUrl: row.photo_url,
    photoAssetId: row.photo_asset_id,
    personalityTags: row.personality_tags,
    birthYear: row.birth_year,
    deathYear: row.death_year,
    valuesBelief: row.values_belief,
    personalityType: row.personality_type,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new MemoryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new MemoryValidationError(`${field} is too long`);
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number
): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (value.length > maxLength) {
    throw new MemoryValidationError(`${field} is too long`);
  }
  return value;
}

function validateYear(value: number | null | undefined, field: string) {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    throw new MemoryValidationError(`${field} is invalid`);
  }
}

function validateId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new MemoryValidationError("memoryId is invalid");
  }
  return id;
}

function normalizedFragments(memory: CreateMemoryInput | UpdateMemoryInput) {
  return (memory.fragments ?? [])
    .filter((fragment) => fragment.content.trim().length > 0)
    .map((fragment) => ({
      sourceType: requiredText(fragment.sourceType, "fragment.sourceType", 100),
      content: fragment.content,
    }));
}

function validateCreateInput(memory: CreateMemoryInput): CreateMemoryInput {
  validateYear(memory.birthYear, "birthYear");
  validateYear(memory.deathYear, "deathYear");
  normalizedFragments(memory);
  if (memory.idempotencyKey && !IDEMPOTENCY_KEY_PATTERN.test(memory.idempotencyKey)) {
    throw new MemoryValidationError("Idempotency-Key is invalid");
  }

  return {
    ...memory,
    userId: requiredText(memory.userId, "userId", 255),
    name: requiredText(memory.name, "name", 200),
    relationship: optionalText(memory.relationship, "relationship", 200) ?? "",
    personalityType: optionalText(
      memory.personalityType,
      "personalityType",
      100
    ),
  };
}

function idempotencyKey(memory: CreateMemoryInput): string {
  const payload = {
    userId: memory.userId,
    name: memory.name,
    relationship: memory.relationship,
    lifeStory: memory.lifeStory ?? null,
    personalityProfile: memory.personalityProfile ?? null,
    speechStyle: memory.speechStyle ?? null,
    catchPhrases: memory.catchPhrases ?? null,
    photoUrl: memory.photoUrl ?? null,
    personalityTags: memory.personalityTags ?? null,
    birthYear: memory.birthYear ?? null,
    deathYear: memory.deathYear ?? null,
    valuesBelief: memory.valuesBelief ?? null,
    personalityType: memory.personalityType ?? null,
    fragments: normalizedFragments(memory),
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function creationIdempotencyKey(memory: CreateMemoryInput): string {
  return memory.idempotencyKey ?? idempotencyKey(memory);
}

async function ensureUser(client: PoolClient, externalId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO users (external_id)
      VALUES ($1)
      ON CONFLICT (external_id)
      DO UPDATE SET updated_at = users.updated_at
      RETURNING id
    `,
    [externalId]
  );

  return result.rows[0].id;
}

async function replaceFragments(
  client: PoolClient,
  memoryId: string,
  fragments: ReturnType<typeof normalizedFragments>
) {
  await client.query("DELETE FROM memory_fragments WHERE memory_id = $1", [
    memoryId,
  ]);

  for (const fragment of fragments) {
    const contentHash = createHash("sha256")
      .update(fragment.content)
      .digest("hex");
    await client.query(
      `
        INSERT INTO memory_fragments
          (memory_id, source_type, content, content_hash)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (memory_id, source_type, content_hash) DO NOTHING
      `,
      [memoryId, fragment.sourceType, fragment.content, contentHash]
    );
  }
}

export class MemoryPostgresDataSource implements MemoryDataSource {
  async create(input: CreateMemoryInput): Promise<Memory> {
    const memory = validateCreateInput(input);
    const fragments = normalizedFragments(memory);
    const payloadKey = idempotencyKey(memory);
    const requestKey = creationIdempotencyKey(memory);

    const row = await withPostgresTransaction(async (client) => {
      const userId = await ensureUser(client, memory.userId);
      const findExisting = () => client.query<MemoryRow>(
        `
          SELECT ${MEMORY_COLUMNS}
          FROM memories m
          JOIN users u ON u.id = m.user_id
          WHERE m.user_id = $1
            AND (m.creation_idempotency_key = $2 OR m.idempotency_key = $3)
          ORDER BY (m.creation_idempotency_key = $2) DESC
          LIMIT 1
        `,
        [userId, requestKey, payloadKey]
      );

      const existing = await findExisting();
      if (existing.rows[0]) return { row: existing.rows[0], created: false };

      try {
        const result = await client.query<MemoryRow>(
        `
          WITH written AS (
            INSERT INTO memories (
              user_id,
              name,
              relationship,
              life_story,
              personality_profile,
              speech_style,
              catch_phrases,
              photo_url,
              personality_tags,
              birth_year,
              death_year,
              values_belief,
              personality_type,
              idempotency_key,
              creation_idempotency_key
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
              $10, $11, $12, $13, $14, $15
            )
            RETURNING *
          )
          SELECT
            written.id,
            users.external_id,
            written.name,
            written.relationship,
            written.life_story,
            written.personality_profile,
            written.speech_style,
            written.catch_phrases,
            written.photo_url,
            written.personality_tags,
            written.birth_year,
            written.death_year,
            written.values_belief,
            written.personality_type,
            written.created_at,
            written.updated_at
          FROM written
          JOIN users ON users.id = written.user_id
        `,
        [
          userId,
          memory.name,
          memory.relationship,
          memory.lifeStory ?? null,
          memory.personalityProfile ?? null,
          memory.speechStyle ?? null,
          memory.catchPhrases ?? null,
          memory.photoUrl ?? null,
          memory.personalityTags === undefined
            ? null
            : JSON.stringify(memory.personalityTags),
          memory.birthYear ?? null,
          memory.deathYear ?? null,
          memory.valuesBelief ?? null,
          memory.personalityType ?? null,
          payloadKey,
          requestKey,
        ]
        );

        await replaceFragments(client, result.rows[0].id, fragments);
        await client.query(
          `INSERT INTO public.business_funnel_events (user_id, memory_id, event_type, event_key)
           VALUES ($1, $2, 'memory_created', $3)
           ON CONFLICT (event_type, event_key) DO NOTHING`,
          [userId, result.rows[0].id, `memory_created:${result.rows[0].id}`],
        );
        return { row: result.rows[0], created: true };
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error;
        const conflicted = await findExisting();
        if (!conflicted.rows[0]) throw error;
        return { row: conflicted.rows[0], created: false };
      }
    });

    return toMemory(row.row);
  }

  async findById(id: string): Promise<Memory | null> {
    const memoryId = validateId(id);
    const result = await queryPostgres<MemoryRow>(
      `
        SELECT ${MEMORY_COLUMNS}
        FROM memories m
        JOIN users u ON u.id = m.user_id
        WHERE m.id = $1
        LIMIT 1
      `,
      [memoryId]
    );

    return result.rows[0] ? toMemory(result.rows[0]) : null;
  }

  async findByIdForUser(id: string, userId: string): Promise<Memory | null> {
    const memoryId = validateId(id);
    const externalId = requiredText(userId, "userId", 255);
    const result = await queryPostgres<MemoryRow>(
      `
        SELECT ${MEMORY_COLUMNS}
        FROM memories m
        JOIN users u ON u.id = m.user_id
        WHERE m.id = $1 AND u.external_id = $2
        LIMIT 1
      `,
      [memoryId, externalId]
    );

    return result.rows[0] ? toMemory(result.rows[0]) : null;
  }

  async update(id: string, memory: UpdateMemoryInput): Promise<Memory> {
    return this.updateInternal(id, memory);
  }

  async updateForUser(
    id: string,
    userId: string,
    memory: UpdateOwnedMemoryInput
  ): Promise<Memory> {
    return this.updateInternal(
      id,
      memory,
      requiredText(userId, "userId", 255)
    );
  }

  private async updateInternal(
    id: string,
    memory: UpdateMemoryInput,
    externalUserId?: string
  ): Promise<Memory> {
    const memoryId = validateId(id);
    validateYear(memory.birthYear, "birthYear");
    validateYear(memory.deathYear, "deathYear");
    const fragments =
      memory.fragments === undefined ? undefined : normalizedFragments(memory);

    const row = await withPostgresTransaction(async (client) => {
      if (externalUserId) {
        const owned = await client.query(
          `SELECT m.id
           FROM memories m
           JOIN users u ON u.id = m.user_id
           WHERE m.id = $1 AND u.external_id = $2
           FOR UPDATE`,
          [memoryId, externalUserId]
        );
        if (!owned.rows[0]) return null;
      }

      const assignments: string[] = [];
      const values: unknown[] = [];

      const add = (column: string, value: unknown, cast = "") => {
        values.push(value);
        assignments.push(`${column} = $${values.length}${cast}`);
      };

      if (memory.userId !== undefined) {
        const externalId = requiredText(memory.userId, "userId", 255);
        add("user_id", await ensureUser(client, externalId));
      }
      if (memory.name !== undefined) {
        add("name", requiredText(memory.name, "name", 200));
      }
      if (memory.relationship !== undefined) {
        add(
          "relationship",
          optionalText(memory.relationship, "relationship", 200) ?? ""
        );
      }
      if (memory.lifeStory !== undefined) add("life_story", memory.lifeStory);
      if (memory.personalityProfile !== undefined) {
        add("personality_profile", memory.personalityProfile);
      }
      if (memory.speechStyle !== undefined) add("speech_style", memory.speechStyle);
      if (memory.catchPhrases !== undefined) {
        add("catch_phrases", memory.catchPhrases);
      }
      if (memory.photoUrl !== undefined) add("photo_url", memory.photoUrl);
      if (memory.personalityTags !== undefined) {
        add("personality_tags", JSON.stringify(memory.personalityTags), "::jsonb");
      }
      if (memory.birthYear !== undefined) add("birth_year", memory.birthYear);
      if (memory.deathYear !== undefined) add("death_year", memory.deathYear);
      if (memory.valuesBelief !== undefined) add("values_belief", memory.valuesBelief);
      if (memory.personalityType !== undefined) {
        add(
          "personality_type",
          optionalText(memory.personalityType, "personalityType", 100)
        );
      }

      let result;
      if (assignments.length === 0) {
        result = await client.query<MemoryRow>(
          `
            SELECT ${MEMORY_COLUMNS}
            FROM memories m
            JOIN users u ON u.id = m.user_id
            WHERE m.id = $1${externalUserId ? " AND u.external_id = $2" : ""}
            LIMIT 1
          `,
          externalUserId ? [memoryId, externalUserId] : [memoryId]
        );
      } else {
        values.push(memoryId);
        const memoryIdParameter = values.length;
        if (externalUserId) values.push(externalUserId);
        result = await client.query<MemoryRow>(
          `
            WITH written AS (
              UPDATE memories
              SET ${assignments.join(", ")}, updated_at = NOW()
              WHERE id = $${memoryIdParameter}
                ${
                  externalUserId
                    ? `AND user_id = (
                        SELECT id FROM users
                        WHERE external_id = $${values.length}
                      )`
                    : ""
                }
              RETURNING *
            )
            SELECT
              written.id,
              users.external_id,
              written.name,
              written.relationship,
              written.life_story,
              written.personality_profile,
              written.speech_style,
              written.catch_phrases,
              written.photo_url,
              written.personality_tags,
              written.birth_year,
              written.death_year,
              written.values_belief,
              written.personality_type,
              written.created_at,
              written.updated_at
            FROM written
            JOIN users ON users.id = written.user_id
          `,
          values
        );
      }

      if (!result.rows[0]) return null;
      if (fragments !== undefined) {
        await replaceFragments(client, memoryId, fragments);
      }
      return result.rows[0];
    });

    if (!row) throw new MemoryNotFoundError("Memory not found");
    return toMemory(row);
  }

  async delete(id: string): Promise<void> {
    const memoryId = validateId(id);
    await withPostgresTransaction(async (client) => {
      await client.query("DELETE FROM memories WHERE id = $1", [memoryId]);
    });
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    const memoryId = validateId(id);
    const externalId = requiredText(userId, "userId", 255);

    await withPostgresTransaction(async (client) => {
      const owned = await client.query(
        `SELECT m.id
         FROM memories m
         JOIN users u ON u.id = m.user_id
         WHERE m.id = $1 AND u.external_id = $2
         FOR UPDATE`,
        [memoryId, externalId]
      );
      if (!owned.rows[0]) throw new MemoryNotFoundError("Memory not found");

      const uncleanMedia = await client.query(
        `SELECT id
         FROM media_assets
         WHERE memory_id = $1
           AND (cleaned_at IS NULL OR storage_key IS NOT NULL)
         LIMIT 1
         FOR UPDATE`,
        [memoryId]
      );
      if (uncleanMedia.rows[0]) {
        throw new MemoryMediaConflictError(
          "Memory media must be cleaned before deletion"
        );
      }

      // Migration 003 cascades fragments and cleaned media metadata, while
      // audit_logs.memory_id is retained as NULL. The guard above prevents
      // cascading a row that could still reference a COS object.
      const deleted = await client.query(
        `DELETE FROM memories m
         USING users u
         WHERE m.id = $1
           AND m.user_id = u.id
           AND u.external_id = $2
         RETURNING m.id`,
        [memoryId, externalId]
      );
      if (!deleted.rows[0]) throw new MemoryNotFoundError("Memory not found");
    });
  }

  async listByUser(userId: string): Promise<Memory[]> {
    const externalId = requiredText(userId, "userId", 255);
    const result = await queryPostgres<MemoryRow>(
      `
        SELECT ${MEMORY_COLUMNS}
        FROM memories m
        JOIN users u ON u.id = m.user_id
        WHERE u.external_id = $1
        ORDER BY m.created_at DESC
      `,
      [externalId]
    );

    return result.rows.map(toMemory);
  }
}
