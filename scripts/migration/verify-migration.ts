import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

import {
  closePostgresPool,
  queryPostgres,
} from "../../src/server/database";
import { option, safeSummary } from "./common";

loadEnvConfig(process.cwd(), false);

const TABLES = [
  "users",
  "memories",
  "memory_fragments",
  "conversations",
  "messages",
  "media_assets",
  "consent_records",
  "provider_jobs",
  "audit_logs",
] as const;

const SOURCE_TABLE: Partial<Record<(typeof TABLES)[number], string>> = {
  memories: "memories",
  memory_fragments: "memory_fragments",
  conversations: "chat_sessions",
  messages: "chat_messages",
  media_assets: "media_assets",
  consent_records: "consent_records",
  provider_jobs: "avatar_jobs",
  audit_logs: "audit_logs",
};

type Manifest = {
  tables?: Record<string, { count?: number; status?: string }>;
};

async function scalar(sql: string): Promise<number> {
  const result = await queryPostgres<{ value: string }>(sql);
  return Number.parseInt(result.rows[0]?.value ?? "0", 10);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

  const manifestPath = option("manifest");
  let manifest: Manifest | undefined;
  if (manifestPath) {
    manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as Manifest;
  }

  const failures: string[] = [];
  for (const table of TABLES) {
    const count = await scalar(`SELECT COUNT(*)::text AS value FROM ${table}`);
    const duplicatePrimaryKeys = await scalar(
      `SELECT COUNT(*)::text AS value FROM (SELECT id FROM ${table} GROUP BY id HAVING COUNT(*) > 1) duplicates`
    );
    const missingCreatedAt = await scalar(
      `SELECT COUNT(*)::text AS value FROM ${table} WHERE created_at IS NULL`
    );

    if (duplicatePrimaryKeys > 0) failures.push(`${table}:duplicate-primary-key`);
    if (missingCreatedAt > 0) failures.push(`${table}:missing-created-at`);

    const sourceTable = SOURCE_TABLE[table];
    const sourceCount = sourceTable ? manifest?.tables?.[sourceTable]?.count : undefined;
    if (typeof sourceCount === "number" && sourceCount !== count) {
      failures.push(`${table}:source-count-mismatch`);
    }

    safeSummary("VERIFY_TABLE", {
      table,
      count,
      duplicatePrimaryKeys,
      missingCreatedAt,
      sourceCount: sourceCount ?? "not-provided",
    });
  }

  const checks = {
    memoriesWithoutUsers: await scalar(
      "SELECT COUNT(*)::text AS value FROM memories m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL"
    ),
    fragmentsWithoutMemories: await scalar(
      "SELECT COUNT(*)::text AS value FROM memory_fragments f LEFT JOIN memories m ON m.id = f.memory_id WHERE m.id IS NULL"
    ),
    conversationsWithoutOwnership: await scalar(
      "SELECT COUNT(*)::text AS value FROM conversations c LEFT JOIN users u ON u.id = c.user_id LEFT JOIN memories m ON m.id = c.memory_id WHERE u.id IS NULL OR m.id IS NULL"
    ),
    messagesWithoutOwnership: await scalar(
      "SELECT COUNT(*)::text AS value FROM messages x LEFT JOIN users u ON u.id = x.user_id LEFT JOIN memories m ON m.id = x.memory_id WHERE u.id IS NULL OR m.id IS NULL"
    ),
    futureCreatedAt: await scalar(
      "SELECT COUNT(*)::text AS value FROM memories WHERE created_at > NOW() + INTERVAL '5 minutes'"
    ),
  };

  for (const [name, count] of Object.entries(checks)) {
    if (count > 0) failures.push(name);
  }
  safeSummary("VERIFY_RELATIONSHIPS", checks);

  if (failures.length > 0) {
    safeSummary("VERIFY_FAILED", { failures });
    process.exitCode = 1;
    return;
  }

  safeSummary("VERIFY_COMPLETE", { status: "pass", tableCount: TABLES.length });
}

main()
  .catch((error) => {
    console.error("VERIFY_FAILED", {
      message: error instanceof Error ? error.message : "Unknown verification error",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
