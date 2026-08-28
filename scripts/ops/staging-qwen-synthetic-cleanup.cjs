"use strict";

// This is a Staging host operation, intentionally separate from the web
// release lifecycle.  It handles only media rows explicitly tagged as the
// disposable Qwen voice-clone synthetic test and refuses every other scope.
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { closeSync, mkdirSync, openSync, rmSync } = require("node:fs");
const { readFile, rm } = require("node:fs/promises");
const path = require("node:path");
const posix = path.posix;

const STAGING_ROOT = "/home/ubuntu/memoryai-staging";
const TOKEN_FILE = posix.join(STAGING_ROOT, "secrets", "qwen-synthetic-cleanup-v1.env");
const LOCK_DIRECTORY = posix.join(STAGING_ROOT, ".promotion", "locks");
const LOCK_FILE = posix.join(LOCK_DIRECTORY, "qwen-synthetic-cleanup-v1.lock");
const SYNTHETIC_MARKER = "qwen-voice-clone";
const QWEN_MODEL = "qwen-audio-3.0-tts-flash";
const CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization";
const TOKEN = /^[A-Za-z0-9_-]{64}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const VOICE_ID = /^qwen-audio-3\.0-tts-flash-[A-Za-z0-9-]{1,160}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function required(value, code) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail(code);
  return value;
}

function stagingPath(value, code) {
  const candidate = required(value, code);
  const resolved = posix.resolve(candidate);
  if (resolved !== STAGING_ROOT && !resolved.startsWith(`${STAGING_ROOT}/`)) fail(code);
  return resolved;
}

function parseTokenConfig(value) {
  const entries = new Map();
  for (const line of value.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0 || line.indexOf("=", separator + 1) !== -1) fail("QWEN_CLEANUP_TOKEN_FILE_INVALID");
    const key = line.slice(0, separator);
    const entry = line.slice(separator + 1);
    if (entries.has(key)) fail("QWEN_CLEANUP_TOKEN_FILE_INVALID");
    entries.set(key, entry);
  }
  if (entries.size !== 2) fail("QWEN_CLEANUP_TOKEN_FILE_INVALID");
  const token = entries.get("STAGING_QWEN_SYNTHETIC_CLEANUP_TOKEN");
  const expectedHash = entries.get("STAGING_QWEN_SYNTHETIC_CLEANUP_TOKEN_SHA256");
  if (!TOKEN.test(token ?? "") || !SHA256.test(expectedHash ?? "")) fail("QWEN_CLEANUP_TOKEN_FILE_INVALID");
  const actualHash = crypto.createHash("sha256").update(token).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"))) fail("QWEN_CLEANUP_TOKEN_INVALID");
  return { token, tokenHash: expectedHash };
}

function loadPm2Environment() {
  let processes;
  try {
    processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    fail("QWEN_CLEANUP_PM2_UNAVAILABLE");
  }
  const record = processes.find((entry) => entry?.name === "memoryai-staging");
  if (!record || record?.pm2_env?.status !== "online" || !record.pm2_env.env || typeof record.pm2_env.env !== "object") {
    fail("QWEN_CLEANUP_STAGING_PROCESS_INVALID");
  }
  const environment = record.pm2_env.env;
  if (environment.DEPLOYMENT_ENV !== "staging") fail("QWEN_CLEANUP_SCOPE_INVALID");
  const databaseName = required(environment.STAGING_DATABASE_NAME, "QWEN_CLEANUP_DATABASE_NAME_INVALID");
  if (!/^[A-Za-z][A-Za-z0-9_]{2,62}$/u.test(databaseName) || !databaseName.toLowerCase().includes("staging")) {
    fail("QWEN_CLEANUP_DATABASE_NAME_INVALID");
  }
  const databaseUrl = required(environment.DATABASE_URL, "QWEN_CLEANUP_DATABASE_URL_INVALID");
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { fail("QWEN_CLEANUP_DATABASE_URL_INVALID"); }
  if (!/^postgres(?:ql)?:$/u.test(parsed.protocol) || decodeURIComponent(parsed.pathname.slice(1)) !== databaseName) {
    fail("QWEN_CLEANUP_DATABASE_URL_INVALID");
  }
  return {
    databaseUrl,
    databaseSsl: environment.DATABASE_SSL === "true",
    mediaRoot: stagingPath(environment.STAGING_MEDIA_ROOT, "QWEN_CLEANUP_MEDIA_ROOT_INVALID"),
    dashscopeApiKey: environment.DASHSCOPE_API_KEY,
    dashscopeEndpoint: environment.DASHSCOPE_VOICE_CLONE_ENDPOINT,
    runtimeRoot: stagingPath(environment.MEMORYAI_RELEASE_ROOT, "QWEN_CLEANUP_RELEASE_ROOT_INVALID"),
  };
}

function resolveMediaPath(mediaRoot, key) {
  if (typeof key !== "string" || !key) fail("QWEN_CLEANUP_MEDIA_KEY_INVALID");
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    fail("QWEN_CLEANUP_MEDIA_KEY_INVALID");
  }
  const root = stagingPath(mediaRoot, "QWEN_CLEANUP_MEDIA_ROOT_INVALID");
  const resolved = posix.resolve(root, ...segments.map(encodeURIComponent));
  const relative = posix.relative(root, resolved);
  if (!relative || relative.startsWith("..") || posix.isAbsolute(relative)) fail("QWEN_CLEANUP_MEDIA_KEY_INVALID");
  return resolved;
}

function configuredEndpoint(input) {
  const endpoint = required(input, "QWEN_CLEANUP_PROVIDER_NOT_CONFIGURED");
  let url;
  try { url = new URL(endpoint); } catch { fail("QWEN_CLEANUP_PROVIDER_NOT_CONFIGURED"); }
  const allowedHost = url.hostname === "dashscope.aliyuncs.com" || url.hostname.endsWith(".maas.aliyuncs.com");
  if (url.protocol !== "https:" || !allowedHost || url.pathname !== CUSTOMIZATION_PATH) {
    fail("QWEN_CLEANUP_PROVIDER_NOT_CONFIGURED");
  }
  return url.toString();
}

async function deleteProviderVoice(voiceId, environment) {
  if (!VOICE_ID.test(voiceId)) fail("QWEN_CLEANUP_VOICE_ID_INVALID");
  const response = await fetch(configuredEndpoint(environment.dashscopeEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required(environment.dashscopeApiKey, "QWEN_CLEANUP_PROVIDER_NOT_CONFIGURED")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voice-enrollment",
      input: { action: "delete_voice", voice_id: voiceId },
    }),
  });
  if (!response.ok) fail("QWEN_CLEANUP_PROVIDER_DELETE_FAILED");
}

function acquireLock() {
  mkdirSync(LOCK_DIRECTORY, { recursive: true, mode: 0o700 });
  let descriptor;
  try { descriptor = openSync(LOCK_FILE, "wx", 0o600); } catch { fail("QWEN_CLEANUP_LOCKED"); }
  return () => {
    try { closeSync(descriptor); } finally { rmSync(LOCK_FILE, { force: true }); }
  };
}

function postgresFromRuntime(runtimeRoot) {
  try {
    return require(require.resolve("pg", { paths: [runtimeRoot] }));
  } catch {
    fail("QWEN_CLEANUP_POSTGRES_RUNTIME_MISSING");
  }
}

async function main() {
  const releaseToken = await readFile(TOKEN_FILE, "utf8");
  parseTokenConfig(releaseToken);
  const environment = loadPm2Environment();
  const releaseLock = acquireLock();
  let client;
  let scanned = 0;
  let cleaned = 0;
  let deferred = 0;
  try {
    const { Client } = postgresFromRuntime(environment.runtimeRoot);
    client = new Client({
      connectionString: environment.databaseUrl,
      ssl: environment.databaseSsl ? { rejectUnauthorized: true } : false,
    });
    await client.connect();
    const result = await client.query(`
      SELECT asset.id, asset.memory_id, asset.storage_key,
             memory.voice_provider, memory.voice_model_id
        FROM media_assets asset
        JOIN memories memory ON memory.id = asset.memory_id
       WHERE asset.metadata ->> 'synthetic_test' = $1
         AND asset.status IN ('deleted', 'cleanup_failed')
         AND asset.cleaned_at IS NULL
         AND asset.cleanup_after <= NOW()
       ORDER BY asset.cleanup_after ASC
       LIMIT 25`, [SYNTHETIC_MARKER]);
    scanned = result.rowCount ?? 0;
    for (const row of result.rows) {
      const voiceId = row.voice_provider === "qwen_audio_tts_flash" ? row.voice_model_id : null;
      try {
        // Never remove the only source sample before a created third-party
        // voice has been removed.  A missing provider configuration therefore
        // leaves the row retryable rather than orphaning a provider resource.
        if (voiceId) await deleteProviderVoice(voiceId, environment);
        if (row.storage_key) await rm(resolveMediaPath(environment.mediaRoot, row.storage_key), { force: true });
        await client.query("BEGIN");
        await client.query(
          `UPDATE media_assets
              SET cleaned_at=NOW(), storage_key=NULL, thumbnail_key=NULL,
                  failure_code=NULL, status='deleted', updated_at=NOW()
            WHERE id=$1 AND metadata ->> 'synthetic_test'=$2`,
          [row.id, SYNTHETIC_MARKER],
        );
        if (voiceId) {
          await client.query(
            `UPDATE memories
                SET voice_provider=NULL, voice_model_id=NULL, voice_model_url=NULL,
                    voice_clone_status=NULL, voice_training_status=NULL,
                    voice_clone_error='SYNTHETIC_CLEANED', updated_at=NOW()
              WHERE id=$1`,
            [row.memory_id],
          );
          await client.query(
            `UPDATE provider_jobs
                SET input_key=NULL, output_key=NULL, provider_request='{}'::jsonb,
                    provider_response='{}'::jsonb, error_message='SYNTHETIC_CLEANED', updated_at=NOW()
              WHERE memory_id=$1 AND provider=$2 AND job_type='voice_clone'`,
            [row.memory_id, "qwen_audio_tts_flash"],
          );
        }
        await client.query("COMMIT");
        cleaned += 1;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        await client.query(
          `UPDATE media_assets
              SET status='cleanup_failed', failure_code=$1,
                  cleanup_after=NOW() + INTERVAL '5 minutes', updated_at=NOW()
            WHERE id=$2 AND metadata ->> 'synthetic_test'=$3`,
          [error?.code === "QWEN_CLEANUP_PROVIDER_NOT_CONFIGURED" ? "PROVIDER_DELETE_PENDING" : "SYNTHETIC_CLEANUP_FAILED", row.id, SYNTHETIC_MARKER],
        ).catch(() => undefined);
        deferred += 1;
      }
    }
    console.log(`QWEN_SYNTHETIC_CLEANUP scanned=${scanned} cleaned=${cleaned} deferred=${deferred}`);
    if (deferred > 0) process.exitCode = 1;
  } finally {
    await client?.end().catch(() => undefined);
    releaseLock();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`QWEN_SYNTHETIC_CLEANUP_FATAL code=${error?.code ?? "UNKNOWN"}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CUSTOMIZATION_PATH,
  STAGING_ROOT,
  parseTokenConfig,
  resolveMediaPath,
};
