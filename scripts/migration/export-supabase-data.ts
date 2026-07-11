import { appendFile, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import {
  encryptFile,
  ensurePrivateDirectory,
  flag,
  option,
  readState,
  safeSummary,
  writeState,
} from "./common";

loadEnvConfig(process.cwd(), false);

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
const REQUIRED_TABLES = new Set(["memories", "memory_fragments"]);
const PAGE_SIZE = 500;

async function main() {
  const dryRun = flag("dry-run");
  const resume = flag("resume");
  const outputDirectory = resolve(
    option("output") ?? join(tmpdir(), `memoryai-supabase-export-${Date.now()}`)
  );
  const statePath = join(outputDirectory, "export-state.json");
  const manifestPath = join(outputDirectory, "manifest.json");
  const url = process.env.LEGACY_SUPABASE_URL;
  const key =
    process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.LEGACY_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Legacy Supabase migration environment is not configured");
  }

  safeSummary("EXPORT_PLAN", {
    dryRun,
    resume,
    tableCount: TABLES.length,
    outputDirectory,
    protection: process.env.MIGRATION_EXPORT_KEY
      ? "aes-256-gcm"
      : "filesystem-0600",
  });
  if (dryRun) return;

  await ensurePrivateDirectory(outputDirectory);
  const state = resume ? await readState(statePath) : {};
  const manifest: Record<string, { count: number; status: string }> = {};
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const table of TABLES) {
    let offset = state[table] ?? 0;
    const dataPath = join(outputDirectory, `${table}.ndjson`);
    if (!resume && offset === 0) {
      await writeFile(dataPath, "", { mode: 0o600 });
      await chmod(dataPath, 0o600);
    }

    let status = "exported";
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        if (REQUIRED_TABLES.has(table)) throw new Error(`Required source table ${table} failed`);
        status = "source-table-unavailable";
        break;
      }

      const rows = data ?? [];
      if (rows.length === 0) break;
      await appendFile(
        dataPath,
        `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
        { mode: 0o600 }
      );
      offset += rows.length;
      state[table] = offset;
      await writeState(statePath, state);
      if (rows.length < PAGE_SIZE) break;
    }

    if (status === "exported") await encryptFile(dataPath);
    manifest[table] = { count: offset, status };
    safeSummary("EXPORT_TABLE", { table, count: offset, status });
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        protection: process.env.MIGRATION_EXPORT_KEY
          ? "aes-256-gcm"
          : "filesystem-0600",
        tables: manifest,
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  await chmod(manifestPath, 0o600);
  safeSummary("EXPORT_COMPLETE", {
    tableCount: Object.keys(manifest).length,
    outputDirectory,
  });
}

main().catch((error) => {
  console.error("EXPORT_FAILED", {
    message: error instanceof Error ? error.message : "Unknown export error",
  });
  process.exitCode = 1;
});
