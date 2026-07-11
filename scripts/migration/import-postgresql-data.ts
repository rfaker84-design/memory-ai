import { createReadStream } from "node:fs";
import { access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { loadEnvConfig } from "@next/env";
import type { PoolClient } from "pg";

import {
  closePostgresPool,
  withPostgresTransaction,
} from "../../src/server/database";
import {
  decryptFile,
  flag,
  option,
  readState,
  safeSummary,
  stableHash,
  writeState,
} from "./common";

loadEnvConfig(process.cwd(), false);

type LegacyRow = Record<string, unknown>;

const TABLES = [
  "user_profiles",
  "users_profile",
  "memories",
  "memory_fragments",
  "chat_sessions",
  "chat_messages",
  "media_assets",
  "consent_records",
  "avatar_jobs",
  "audit_logs",
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(row: LegacyRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function uuid(row: LegacyRow, key: string): string {
  const value = text(row, key);
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is not a valid UUID in migration input`);
  }
  return value;
}

function jsonValue(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function storageKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.replace(/^\/+/, "")) || null;
  } catch {
    return value.replace(/^\/+/, "");
  }
}

function externalUser(row: LegacyRow): string {
  const value = text(row, "user_phone", "phone", "user_id", "external_id");
  if (!value) throw new Error("User ownership is missing in migration input");
  return value;
}

function requiredLegacyText(row: LegacyRow, ...keys: string[]): string {
  const value = text(row, ...keys);
  if (!value) {
    throw new Error(`${keys.join("/")} is missing in migration input`);
  }
  return value;
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

async function importRow(table: (typeof TABLES)[number], row: LegacyRow) {
  await withPostgresTransaction(async (client) => {
    if (table === "user_profiles" || table === "users_profile") {
      await ensureUser(client, externalUser(row));
      return;
    }

    if (table === "memories") {
      const externalId = externalUser(row);
      const userId = await ensureUser(client, externalId);
      const id = uuid(row, "id");
      await client.query(
        `
          INSERT INTO memories (
            id, user_id, name, relationship, life_story,
            personality_profile, speech_style, catch_phrases, photo_url,
            personality_tags, birth_year, death_year, values_belief,
            personality_type, voice_sample_url, voice_provider, voice_model_id,
            voice_model_url, voice_clone_status, voice_training_status,
            voice_clone_error, avatar_video_url, avatar_status, avatar_provider,
            avatar_error, idempotency_key, metadata, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27::jsonb,
            COALESCE($28::timestamptz, NOW()), COALESCE($29::timestamptz, COALESCE($28::timestamptz, NOW()))
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          id,
          userId,
          requiredLegacyText(row, "name"),
          text(row, "relationship") ?? "",
          text(row, "life_story"),
          text(row, "personality_profile"),
          text(row, "speech_style"),
          text(row, "catch_phrases"),
          text(row, "photo_url"),
          row.personality_tags === undefined ? null : jsonValue(row.personality_tags),
          typeof row.birth_year === "number" ? row.birth_year : null,
          typeof row.death_year === "number" ? row.death_year : null,
          text(row, "values_belief"),
          text(row, "personality_type"),
          text(row, "voice_sample_url"),
          text(row, "voice_provider"),
          text(row, "voice_model_id"),
          text(row, "voice_model_url"),
          text(row, "voice_clone_status"),
          text(row, "voice_training_status"),
          text(row, "voice_clone_error"),
          text(row, "avatar_video_url"),
          text(row, "avatar_status"),
          text(row, "avatar_provider"),
          text(row, "avatar_error"),
          stableHash({ source: "supabase", id }),
          jsonValue({ legacySource: "supabase" }),
          text(row, "created_at"),
          text(row, "updated_at"),
        ]
      );
      return;
    }

    if (table === "memory_fragments") {
      const content = requiredLegacyText(row, "content");
      await client.query(
        `
          INSERT INTO memory_fragments
            (id, memory_id, source_type, content, content_hash, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb,
            COALESCE($7::timestamptz, NOW()), COALESCE($8::timestamptz, COALESCE($7::timestamptz, NOW())))
          ON CONFLICT (id) DO NOTHING
        `,
        [
          uuid(row, "id"),
          uuid(row, "memory_id"),
          requiredLegacyText(row, "source_type"),
          content,
          stableHash(content),
          jsonValue(row.metadata),
          text(row, "created_at"),
          text(row, "updated_at"),
        ]
      );
      return;
    }

    const userId = await ensureUser(client, externalUser(row));

    if (table === "chat_sessions") {
      await client.query(
        `
          INSERT INTO conversations
            (id, user_id, memory_id, title, summary, last_message_at, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb,
            COALESCE($8::timestamptz, NOW()), COALESCE($9::timestamptz, COALESCE($8::timestamptz, NOW())))
          ON CONFLICT (id) DO NOTHING
        `,
        [uuid(row, "id"), userId, uuid(row, "memory_id"), text(row, "title"), text(row, "summary"), text(row, "last_message_at"), jsonValue(row.metadata), text(row, "created_at"), text(row, "updated_at")]
      );
      return;
    }

    if (table === "chat_messages") {
      await client.query(
        `
          INSERT INTO messages
            (id, conversation_id, user_id, memory_id, role, content, tokens, emotion, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
            COALESCE($10::timestamptz, NOW()), COALESCE($11::timestamptz, COALESCE($10::timestamptz, NOW())))
          ON CONFLICT (id) DO NOTHING
        `,
        [uuid(row, "id"), text(row, "session_id"), userId, uuid(row, "memory_id"), text(row, "role") ?? "user", text(row, "content") ?? "", typeof row.tokens === "number" ? row.tokens : null, text(row, "emotion"), jsonValue(row.metadata), text(row, "created_at"), text(row, "updated_at")]
      );
      return;
    }

    if (table === "media_assets") {
      await client.query(
        `
          INSERT INTO media_assets
            (id, user_id, memory_id, media_type, storage_key, thumbnail_key, mime_type, size_bytes, status, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
            COALESCE($11::timestamptz, NOW()), COALESCE($12::timestamptz, COALESCE($11::timestamptz, NOW())))
          ON CONFLICT (id) DO NOTHING
        `,
        [uuid(row, "id"), userId, uuid(row, "memory_id"), text(row, "media_type") ?? "unknown", storageKey(row.url ?? row.storage_key), storageKey(row.thumbnail_url ?? row.thumbnail_key), text(row, "mime_type"), typeof row.size === "number" ? row.size : row.size_bytes ?? null, text(row, "status") ?? "pending", jsonValue(row.metadata), text(row, "created_at"), text(row, "updated_at")]
      );
      return;
    }

    if (table === "consent_records") {
      await client.query(
        `
          INSERT INTO consent_records
            (id, user_id, memory_id, consent_type, status, owner_name, relationship_to_owner, proof_key, notes, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
            COALESCE($11::timestamptz, NOW()), COALESCE($12::timestamptz, COALESCE($11::timestamptz, NOW())))
          ON CONFLICT (id) DO NOTHING
        `,
        [uuid(row, "id"), userId, text(row, "memory_id"), text(row, "consent_type") ?? "unknown", text(row, "status") ?? "pending", text(row, "owner_name"), text(row, "relationship_to_owner"), storageKey(row.proof_url ?? row.proof_key), text(row, "notes"), jsonValue(row.metadata), text(row, "created_at"), text(row, "updated_at")]
      );
      return;
    }

    if (table === "avatar_jobs") {
      await client.query(
        `
          INSERT INTO provider_jobs
            (id, user_id, memory_id, job_type, provider, status, progress, input_key, output_key, provider_request, provider_response, error_message, retry_count, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13,
            COALESCE($14::timestamptz, NOW()), COALESCE($15::timestamptz, COALESCE($14::timestamptz, NOW())))
          ON CONFLICT (id) DO NOTHING
        `,
        [uuid(row, "id"), userId, uuid(row, "memory_id"), text(row, "job_type") ?? "unknown", text(row, "provider") ?? "unknown", text(row, "status") ?? "pending", typeof row.progress === "number" ? row.progress : 0, storageKey(row.input_url ?? row.input_key), storageKey(row.output_url ?? row.output_key), jsonValue(row.provider_request), jsonValue(row.provider_response), text(row, "error", "error_message"), typeof row.retry_count === "number" ? row.retry_count : 0, text(row, "created_at"), text(row, "updated_at")]
      );
      return;
    }

    if (table === "audit_logs") {
      await client.query(
        `
          INSERT INTO audit_logs
            (id, user_id, memory_id, action, level, message, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, NOW()))
          ON CONFLICT (id) DO NOTHING
        `,
        [uuid(row, "id"), userId, text(row, "memory_id"), text(row, "action") ?? "system.error", text(row, "level") ?? "info", text(row, "message") ?? "Legacy audit event", jsonValue(row.metadata), text(row, "created_at")]
      );
    }
  });
}

async function existingDataPath(inputDirectory: string, table: string) {
  const plain = join(inputDirectory, `${table}.ndjson`);
  try {
    await access(plain);
    return { path: plain, temporary: false };
  } catch {
    const encrypted = `${plain}.enc`;
    try {
      await access(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }

    const temporary = join(tmpdir(), `memoryai-import-${table}-${Date.now()}.ndjson`);
    await decryptFile(encrypted, temporary);
    return { path: temporary, temporary: true };
  }
}

async function main() {
  const dryRun = flag("dry-run");
  const resume = flag("resume");
  const inputDirectory = option("input");
  if (!inputDirectory) throw new Error("--input=<export-directory> is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

  const resolvedInput = resolve(inputDirectory);
  const statePath = join(resolvedInput, "import-state.json");
  const state = resume ? await readState(statePath) : {};
  safeSummary("IMPORT_PLAN", { dryRun, resume, inputDirectory: resolvedInput });

  for (const table of TABLES) {
    const source = await existingDataPath(resolvedInput, table);
    if (!source) {
      safeSummary("IMPORT_TABLE", { table, status: "not-present", count: 0 });
      continue;
    }
    if (dryRun) {
      safeSummary("IMPORT_TABLE", { table, status: "ready", count: "not-read" });
      if (source.temporary) await rm(source.path, { force: true });
      continue;
    }

    const completed = state[table] ?? 0;
    let lineNumber = 0;
    let imported = completed;
    const lines = createInterface({
      input: createReadStream(source.path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    try {
      for await (const line of lines) {
        lineNumber += 1;
        if (lineNumber <= completed || !line.trim()) continue;
        await importRow(table, JSON.parse(line) as LegacyRow);
        imported = lineNumber;
        if (imported % 100 === 0) {
          state[table] = imported;
          await writeState(statePath, state);
        }
      }
      state[table] = imported;
      await writeState(statePath, state);
      safeSummary("IMPORT_TABLE", { table, status: "imported", count: imported });
    } finally {
      if (source.temporary) await rm(source.path, { force: true });
    }
  }

  safeSummary("IMPORT_COMPLETE", { tableCount: TABLES.length });
}

main()
  .catch((error) => {
    console.error("IMPORT_FAILED", {
      message: error instanceof Error ? error.message : "Unknown import error",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
