"use strict";

// A Staging-only, versioned E2E harness. It keeps provider audio URLs and
// voice IDs in process memory only, prints redacted status, and refuses to
// run unless the existing one-account isolated beta gate is active.
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { loadStagingQwenSecrets } = require("./staging-web-secret-runtime-wrapper.cjs");

const ROOT = "/home/ubuntu/memoryai-staging";
const APP = "memoryai-staging";
const MODEL = "qwen-audio-3.0-tts-flash";
const ORIGIN = "https://app.staging.yijianmemory.cn";
const COOKIE = "__Host-memoryai_session";
const SYNTHETIC_ID = /^stg-qwen-vc-beta-[a-z0-9]{16}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PREVIEW_DIRECTORY = `${ROOT}/private-e2e`;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function command(file, args, options = {}) {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch {
    fail("STAGING_QWEN_E2E_COMMAND_FAILED");
  }
}

function pm2Record() {
  let apps;
  try { apps = JSON.parse(command("pm2", ["jlist"])); } catch { fail("STAGING_QWEN_E2E_PM2_LIST_INVALID"); }
  const matches = apps.filter((item) => item?.name === APP);
  if (matches.length !== 1 || !matches[0]?.pm2_env?.env) fail("STAGING_QWEN_E2E_PM2_APP_INVALID");
  return matches[0];
}

function currentRuntime(record) {
  const cwd = record.pm2_env.pm_cwd;
  if (typeof cwd !== "string" || !cwd.startsWith(`${ROOT}/releases/`) || !cwd.endsWith("/runtime") || !existsSync(path.join(cwd, "standalone-manifest.json"))) {
    fail("STAGING_QWEN_E2E_RUNTIME_INVALID");
  }
  return cwd;
}

function preflight(record, requireEnabled = true) {
  const env = record.pm2_env.env;
  if (record.pm2_env.status !== "online" || record.pm2_env.unstable_restarts !== 0 || env.DASHSCOPE_API_KEY || env.DASHSCOPE_VOICE_CLONE_ENDPOINT) {
    fail("STAGING_QWEN_E2E_PM2_CONTRACT_INVALID");
  }
  if (env.DEPLOYMENT_ENV !== "staging" || env.MEMORYAI_DEPLOYMENT_TIER !== "internal-beta" || env.MEMORYAI_BETA_DATA_SCOPE !== "isolated-test" || (requireEnabled && env.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED !== "true") || (!requireEnabled && !["true", "false"].includes(env.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED)) || !SYNTHETIC_ID.test(env.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS ?? "")) {
    fail("STAGING_QWEN_E2E_BETA_GATE_INVALID");
  }
  if (env.AUTH_ALLOWED_ORIGIN !== ORIGIN || !env.STAGING_ACCESS_TOKEN || !env.SESSION_SECRET || !env.DATABASE_URL || !env.STAGING_MEDIA_ROOT) {
    fail("STAGING_QWEN_E2E_RUNTIME_CONFIGURATION_INVALID");
  }
  return env;
}

function database(runtime, databaseUrl) {
  let PgClient;
  try { ({ Client: PgClient } = require(require.resolve("pg", { paths: [runtime] }))); } catch { fail("STAGING_QWEN_E2E_PG_UNAVAILABLE"); }
  return new PgClient({ connectionString: databaseUrl, application_name: "memoryai-staging-qwen-e2e" });
}

function base64Json(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

function signedSession(environment, identity) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Json({ alg: "HS256", typ: "JWT", kid: environment.SESSION_SECRET_KID || "current" });
  const payload = base64Json({
    sub: identity.userId,
    externalUserId: identity.externalUserId,
    iss: "memoryai",
    aud: "memoryai-web",
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID(),
  });
  const signature = crypto.createHmac("sha256", environment.SESSION_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function ttsEndpoint(customizationEndpoint) {
  const endpoint = new URL(customizationEndpoint);
  endpoint.pathname = "/api/v1/services/audio/tts/SpeechSynthesizer";
  endpoint.search = "";
  return endpoint.toString();
}

async function providerJson(endpoint, apiKey, payload) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { fail("STAGING_QWEN_E2E_PROVIDER_NETWORK_FAILED"); }
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function synthesize(endpoint, apiKey, voice, text) {
  const { response, body } = await providerJson(endpoint, apiKey, {
    model: MODEL,
    input: {
      text,
      voice,
      format: "wav",
      sample_rate: 24000,
      language_hints: ["zh"],
      enable_aigc_tag: true,
    },
  });
  const audioUrl = body?.output?.audio?.url;
  if (!response.ok || body?.output?.finish_reason !== "stop" || typeof audioUrl !== "string") fail("STAGING_QWEN_E2E_SYNTHESIS_FAILED");
  let parsed;
  try { parsed = new URL(audioUrl); } catch { fail("STAGING_QWEN_E2E_AUDIO_URL_INVALID"); }
  // DashScope result objects can use an HTTP OSS URL.  Accept only Alibaba's
  // result domain, never an arbitrary provider-controlled fetch target.
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || !/(?:^|\.)aliyuncs\.com$/iu.test(parsed.hostname)) {
    fail("STAGING_QWEN_E2E_AUDIO_URL_INVALID");
  }
  let audio;
  try {
    const audioResponse = await fetch(parsed, { redirect: "error" });
    if (!audioResponse.ok) fail("STAGING_QWEN_E2E_AUDIO_DOWNLOAD_FAILED");
    audio = Buffer.from(await audioResponse.arrayBuffer());
  } catch (error) {
    if (error?.code?.startsWith("STAGING_")) throw error;
    fail("STAGING_QWEN_E2E_AUDIO_DOWNLOAD_FAILED");
  }
  return { audio, wav: parseWav(audio) };
}

function parseWav(audio) {
  if (!Buffer.isBuffer(audio) || audio.length < 44 || audio.subarray(0, 4).toString("ascii") !== "RIFF" || audio.subarray(8, 12).toString("ascii") !== "WAVE") {
    fail("STAGING_QWEN_E2E_WAV_INVALID");
  }
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= audio.length) {
    const name = audio.subarray(offset, offset + 4).toString("ascii");
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > audio.length) fail("STAGING_QWEN_E2E_WAV_INVALID");
    if (name === "fmt " && size >= 16) byteRate = audio.readUInt32LE(start + 8);
    if (name === "data") dataBytes = size;
    offset = start + size + (size % 2);
  }
  const durationMilliseconds = Math.round((dataBytes / byteRate) * 1000);
  if (!Number.isFinite(durationMilliseconds) || dataBytes < 1024 || durationMilliseconds < 3000 || durationMilliseconds > 90000) {
    fail("STAGING_QWEN_E2E_WAV_DURATION_INVALID");
  }
  return { bytes: audio.length, durationMilliseconds };
}

async function identity(client, externalUserId) {
  const result = await client.query(
    `SELECT account.id AS user_id, account.external_id, memory.id AS memory_id
       FROM users account
       JOIN memories memory ON memory.user_id = account.id
      WHERE account.external_id = $1
        AND memory.metadata ->> 'account_deletion_tombstone' IS DISTINCT FROM 'true'
        AND EXISTS (
          SELECT 1 FROM consent_records consent
           WHERE consent.user_id = account.id
             AND consent.memory_id = memory.id
             AND consent.consent_type = 'voice_clone'
             AND consent.status = 'approved'
             AND consent.metadata ->> 'version' = 'commercial-trust-v1'
        )
      ORDER BY memory.created_at ASC
      LIMIT 2`,
    [externalUserId],
  );
  if (result.rows.length !== 1) fail("STAGING_QWEN_E2E_SYNTHETIC_IDENTITY_INVALID");
  const row = result.rows[0];
  if (!UUID.test(row.user_id) || !UUID.test(row.memory_id) || row.external_id !== externalUserId) fail("STAGING_QWEN_E2E_SYNTHETIC_IDENTITY_INVALID");
  return { userId: row.user_id, externalUserId, memoryId: row.memory_id };
}

async function assertCleanStart(client, owner) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM provider_jobs WHERE user_id = $1 AND memory_id = $2 AND provider = 'qwen_audio_tts_flash') AS qwen_jobs,
       (SELECT count(*)::int FROM media_assets WHERE user_id = $1 AND memory_id = $2 AND media_type = 'audio' AND deleted_at IS NULL AND status IN ('pending', 'uploaded')) AS active_audio,
       (SELECT count(*)::int FROM memories WHERE id = $2 AND user_id = $1 AND (voice_model_id IS NOT NULL OR voice_provider IS NOT NULL OR voice_clone_status IS NOT NULL)) AS voice_bound`,
    [owner.userId, owner.memoryId],
  );
  const row = result.rows[0];
  if (row.qwen_jobs !== 0 || row.active_audio !== 0 || row.voice_bound !== 0) fail("STAGING_QWEN_E2E_SYNTHETIC_NOT_CLEAN");
}

function logSnapshot(record) {
  const paths = [record.pm2_env.pm_out_log_path, record.pm2_env.pm_err_log_path].filter((value) => typeof value === "string");
  return paths.map((file) => ({ file, bytes: existsSync(file) ? statSync(file).size : 0 }));
}

function assertNoUrlLeak(snapshot) {
  for (const item of snapshot) {
    if (!existsSync(item.file)) continue;
    const file = readFileSync(item.file);
    const appended = file.subarray(Math.min(item.bytes, file.length)).toString("utf8");
    if (/(?:\/api\/media\/local|[?&]signature=|DASHSCOPE_API_KEY|https?:\/\/[^\s]*[?&](?:Signature|signature|Expires|expires)=)/iu.test(appended)) {
      fail("STAGING_QWEN_E2E_SIGNED_URL_LEAK_DETECTED");
    }
  }
}

function form(audio) {
  const body = new FormData();
  body.set("file", new Blob([audio], { type: "audio/wav" }), "synthetic-qwen-sample.wav");
  return body;
}

async function callClone(environment, session, owner, key, audio) {
  const response = await fetch(`http://127.0.0.1:3100/api/memories/${owner.memoryId}/voice-clone`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "X-MemoryAI-Staging-Access": environment.STAGING_ACCESS_TOKEN,
      Cookie: `${COOKIE}=${session}`,
      "Idempotency-Key": key,
    },
    body: form(audio),
  });
  const body = await response.json().catch(() => ({}));
  if (JSON.stringify(body).match(/(?:\/api\/media\/local|[?&]signature=|https?:\/\/)/iu)) fail("STAGING_QWEN_E2E_CLIENT_URL_LEAK_DETECTED");
  return { response, body };
}

async function assertPermissionGate(environment, session) {
  const response = await fetch(`http://127.0.0.1:3100/api/memories/${crypto.randomUUID()}/voice-clone`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "X-MemoryAI-Staging-Access": environment.STAGING_ACCESS_TOKEN,
      Cookie: `${COOKIE}=${session}`,
      "Idempotency-Key": `qwen-permission-${crypto.randomUUID()}`,
    },
    body: form(Buffer.from("not-used")),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 403 || body?.error !== "VOICE_CLONE_CONSENT_REQUIRED") fail("STAGING_QWEN_E2E_PERMISSION_GATE_FAILED");
}

function isBetaDisabledResponse(response, body) {
  return response.status === 404 && body?.error === "BETA_NOT_AVAILABLE";
}

async function assertBetaDisabled(environment, session) {
  const response = await fetch(`http://127.0.0.1:3100/api/memories/${crypto.randomUUID()}/voice-clone`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "X-MemoryAI-Staging-Access": environment.STAGING_ACCESS_TOKEN,
      Cookie: `${COOKIE}=${session}`,
      "Idempotency-Key": `qwen-disabled-${crypto.randomUUID()}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!isBetaDisabledResponse(response, body)) fail("STAGING_QWEN_E2E_BETA_DISABLE_NOT_ENFORCED");
}

async function createdJob(client, owner, idempotencyKey) {
  const result = await client.query(
    `SELECT job.id, job.user_id, job.memory_id, job.status, job.provider_request, job.provider_response,
            memory.voice_provider, memory.voice_model_id, memory.voice_clone_status
       FROM provider_jobs job
       JOIN memories memory ON memory.id = job.memory_id
      WHERE job.memory_id = $1 AND job.user_id = $2 AND job.provider = 'qwen_audio_tts_flash'
        AND job.job_type = 'voice_clone' AND job.provider_request ->> 'idempotencyKey' = $3`,
    [owner.memoryId, owner.userId, idempotencyKey],
  );
  if (result.rows.length !== 1) fail("STAGING_QWEN_E2E_IDEMPOTENCY_FAILED");
  const row = result.rows[0];
  const requestText = JSON.stringify(row.provider_request);
  const responseText = JSON.stringify(row.provider_response);
  const voiceId = row.provider_response?.voiceId;
  if (row.status !== "completed" || row.user_id !== owner.userId || row.memory_id !== owner.memoryId || row.voice_provider !== "qwen_audio_tts_flash" || row.voice_clone_status !== "completed" || row.voice_model_id !== voiceId || typeof voiceId !== "string" || !voiceId || requestText.includes("http") || requestText.includes("signature") || responseText.includes("http") || responseText.includes("signature")) {
    fail("STAGING_QWEN_E2E_OWNER_OR_STORAGE_CHECK_FAILED");
  }
  if (row.provider_request?.model !== MODEL) fail("STAGING_QWEN_E2E_MODEL_BINDING_FAILED");
  return { id: row.id, voiceId };
}

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function assertProviderVoice(endpoint, apiKey, voiceId, expectedPresent) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { response, body } = await providerJson(endpoint, apiKey, { model: "voice-enrollment", input: { action: "query_voice", voice_id: voiceId } });
    if (expectedPresent) {
      if (!response.ok || body?.output?.target_model !== MODEL) fail("STAGING_QWEN_E2E_PROVIDER_QUERY_FAILED");
      if (body?.output?.status === "OK") return;
    } else if (!response.ok) {
      return;
    }
    if (attempt < 11) await wait(expectedPresent ? 3000 : 1000);
  }
  fail(expectedPresent ? "STAGING_QWEN_E2E_PROVIDER_READY_TIMEOUT" : "STAGING_QWEN_E2E_PROVIDER_DELETE_UNCONFIRMED");
}

async function deleteProviderVoice(endpoint, apiKey, voiceId) {
  const { response } = await providerJson(endpoint, apiKey, { model: "voice-enrollment", input: { action: "delete_voice", voice_id: voiceId } });
  if (!response.ok) fail("STAGING_QWEN_E2E_PROVIDER_DELETE_FAILED");
  await assertProviderVoice(endpoint, apiKey, voiceId, false);
}

function storagePath(mediaRoot, storageKey, owner) {
  const allowed = new RegExp(`^media/${owner.externalUserId}/${owner.memoryId}/audio/[0-9a-f-]{36}\\.(?:wav|mp3|m4a)$`, "iu");
  if (typeof mediaRoot !== "string" || !path.isAbsolute(mediaRoot) || mediaRoot === "/" || !allowed.test(storageKey ?? "")) fail("STAGING_QWEN_E2E_MEDIA_PATH_INVALID");
  const target = path.resolve(mediaRoot, ...storageKey.split("/").map(encodeURIComponent));
  const root = path.resolve(mediaRoot);
  if (!target.startsWith(`${root}${path.sep}`)) fail("STAGING_QWEN_E2E_MEDIA_PATH_INVALID");
  return target;
}

async function cleanupRun(client, environment, owner, job, runStartedAt) {
  const assets = await client.query(
    `SELECT id, storage_key FROM media_assets
      WHERE user_id = $1 AND memory_id = $2 AND media_type = 'audio' AND created_at >= $3`,
    [owner.userId, owner.memoryId, runStartedAt],
  );
  for (const asset of assets.rows) rmSync(storagePath(environment.STAGING_MEDIA_ROOT, asset.storage_key, owner), { force: true });
  await client.query("BEGIN");
  try {
    const memory = await client.query(
      `UPDATE memories SET voice_provider = NULL, voice_model_id = NULL, voice_model_url = NULL,
          voice_clone_status = NULL, voice_clone_error = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND voice_provider = 'qwen_audio_tts_flash' AND voice_model_id = $3`,
      [owner.memoryId, owner.userId, job.voiceId],
    );
    const deletedJob = await client.query("DELETE FROM provider_jobs WHERE id = $1 AND user_id = $2 AND memory_id = $3", [job.id, owner.userId, owner.memoryId]);
    if (memory.rowCount !== 1 || deletedJob.rowCount !== 1) fail("STAGING_QWEN_E2E_DATABASE_CLEANUP_FAILED");
    if (assets.rows.length) await client.query("DELETE FROM media_assets WHERE id = ANY($1::uuid[])", [assets.rows.map((asset) => asset.id)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  const remaining = await client.query(
    `SELECT
       (SELECT count(*)::int FROM provider_jobs WHERE id = $1) AS jobs,
       (SELECT count(*)::int FROM media_assets WHERE user_id = $2 AND memory_id = $3 AND media_type = 'audio' AND created_at >= $4) AS media,
       (SELECT count(*)::int FROM memories WHERE id = $3 AND user_id = $2 AND (voice_model_id IS NOT NULL OR voice_provider IS NOT NULL OR voice_clone_status IS NOT NULL)) AS memory_voice`,
    [job.id, owner.userId, owner.memoryId, runStartedAt],
  );
  const row = remaining.rows[0];
  if (row.jobs !== 0 || row.media !== 0 || row.memory_voice !== 0) fail("STAGING_QWEN_E2E_DATABASE_REMAINS");
  return assets.rows.length;
}

function previewPath(runId) {
  if (!UUID.test(runId)) fail("STAGING_QWEN_E2E_RUN_ID_INVALID");
  return path.join(PREVIEW_DIRECTORY, `qwen-e2e-preview-${runId}.wav`);
}

async function run(runId) {
  const record = pm2Record();
  const environment = preflight(record);
  const runtime = currentRuntime(record);
  const secret = loadStagingQwenSecrets();
  const client = database(runtime, environment.DATABASE_URL);
  const startedAt = new Date();
  let job = null;
  let providerDeleted = false;
  try {
    await client.connect();
    const owner = await identity(client, environment.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS);
    await assertCleanStart(client, owner);
    const session = signedSession(environment, owner);
    const logs = logSnapshot(record);
    const tts = ttsEndpoint(secret.DASHSCOPE_VOICE_CLONE_ENDPOINT);
    const source = await synthesize(tts, secret.DASHSCOPE_API_KEY, "longanhuan_v3.6", "这是一个仅用于隔离内部测试的合成语音样本。它不对应任何真实用户，也不会用于生产环境。完成验证后，相关音色和临时数据将被立即删除。");
    const idempotencyKey = `qwen-e2e-${runId}`;
    await assertPermissionGate(environment, session);
    const first = await callClone(environment, session, owner, idempotencyKey, source.audio);
    if (first.response.status !== 201 || first.body?.job?.status !== "ready" || typeof first.body?.job?.id !== "string") fail("STAGING_QWEN_E2E_CLONE_FAILED");
    const repeated = await callClone(environment, session, owner, idempotencyKey, source.audio);
    if (repeated.response.status !== 200 || repeated.body?.job?.status !== "ready" || repeated.body?.job?.id !== first.body.job.id) fail("STAGING_QWEN_E2E_IDEMPOTENCY_FAILED");
    job = await createdJob(client, owner, idempotencyKey);
    await assertProviderVoice(secret.DASHSCOPE_VOICE_CLONE_ENDPOINT, secret.DASHSCOPE_API_KEY, job.voiceId, true);
    const preview = await synthesize(tts, secret.DASHSCOPE_API_KEY, job.voiceId, "这是忆见 Staging 的内部试听。该声音仅用于合成测试，验证完成后已从供应商删除，并且不会在生产环境使用。");
    const target = previewPath(runId);
    if (existsSync(target)) fail("STAGING_QWEN_E2E_PREVIEW_COLLISION");
    mkdirSync(PREVIEW_DIRECTORY, { recursive: true, mode: 0o700 });
    writeFileSync(target, preview.audio, { mode: 0o600, flag: "wx" });
    await deleteProviderVoice(secret.DASHSCOPE_VOICE_CLONE_ENDPOINT, secret.DASHSCOPE_API_KEY, job.voiceId);
    providerDeleted = true;
    const cleanedMedia = await cleanupRun(client, environment, owner, job, startedAt);
    assertNoUrlLeak(logs);
    console.log(`QWEN_E2E_SUCCESS run=${runId} preview=READY duration_ms=${preview.wav.durationMilliseconds} source_duration_ms=${source.wav.durationMilliseconds} owner_binding=verified permission_gate=verified idempotency=verified signed_url_leak=absent vendor_voice=deleted synthetic_cleanup=complete media=${cleanedMedia}`);
  } catch (error) {
    if (job?.voiceId && !providerDeleted) {
      try { await deleteProviderVoice(secret.DASHSCOPE_VOICE_CLONE_ENDPOINT, secret.DASHSCOPE_API_KEY, job.voiceId); } catch { /* leave the durable job for the scheduled cleaner and stop beta */ }
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function removePreview(runId) {
  const target = previewPath(runId);
  rmSync(target, { force: true });
  if (existsSync(target)) fail("STAGING_QWEN_E2E_PREVIEW_CLEANUP_FAILED");
  console.log(`QWEN_E2E_PREVIEW_CLEANED run=${runId}`);
}

function agedPreviews() {
  if (!existsSync(PREVIEW_DIRECTORY)) return 0;
  let removed = 0;
  for (const item of readdirSync(PREVIEW_DIRECTORY, { withFileTypes: true })) {
    if (!item.isFile() || !/^qwen-e2e-preview-[0-9a-f-]{36}\.wav$/iu.test(item.name)) continue;
    const target = path.join(PREVIEW_DIRECTORY, item.name);
    if (Date.now() - statSync(target).mtimeMs > 10 * 60 * 1000) {
      rmSync(target, { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function cleanup() {
  const record = pm2Record();
  const environment = preflight(record, false);
  const runtime = currentRuntime(record);
  const secret = loadStagingQwenSecrets();
  const client = database(runtime, environment.DATABASE_URL);
  try {
    await client.connect();
    const owner = await identity(client, environment.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS);
    const jobs = await client.query(
      `SELECT id, provider_response FROM provider_jobs
        WHERE user_id = $1 AND memory_id = $2 AND provider = 'qwen_audio_tts_flash' AND job_type = 'voice_clone'`,
      [owner.userId, owner.memoryId],
    );
    const jobIds = jobs.rows.map((job) => job.id);
    const voiceIds = jobs.rows.map((job) => job.provider_response?.voiceId).filter((value) => typeof value === "string" && value);
    for (const voiceId of voiceIds) await deleteProviderVoice(secret.DASHSCOPE_VOICE_CLONE_ENDPOINT, secret.DASHSCOPE_API_KEY, voiceId);
    const assets = jobIds.length === 0 ? { rows: [] } : await client.query(
      `SELECT DISTINCT asset.id, asset.storage_key
         FROM media_assets asset
         JOIN provider_jobs job ON job.provider_request ->> 'audioAssetId' = asset.id::text
        WHERE job.id = ANY($1::uuid[]) AND asset.user_id = $2 AND asset.memory_id = $3 AND asset.media_type = 'audio'`,
      [jobIds, owner.userId, owner.memoryId],
    );
    for (const asset of assets.rows) rmSync(storagePath(environment.STAGING_MEDIA_ROOT, asset.storage_key, owner), { force: true });
    if (jobIds.length) {
      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE memories SET voice_provider = NULL, voice_model_id = NULL, voice_model_url = NULL,
              voice_clone_status = NULL, voice_clone_error = NULL, updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND voice_provider = 'qwen_audio_tts_flash'`,
          [owner.memoryId, owner.userId],
        );
        await client.query("DELETE FROM provider_jobs WHERE id = ANY($1::uuid[])", [jobIds]);
        if (assets.rows.length) await client.query("DELETE FROM media_assets WHERE id = ANY($1::uuid[])", [assets.rows.map((asset) => asset.id)]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
    const remains = await client.query("SELECT count(*)::int AS count FROM provider_jobs WHERE user_id = $1 AND memory_id = $2 AND provider = 'qwen_audio_tts_flash'", [owner.userId, owner.memoryId]);
    if (remains.rows[0]?.count !== 0) fail("STAGING_QWEN_E2E_SYNTHETIC_CLEANUP_REMAINS");
    console.log(`QWEN_SYNTHETIC_CLEANUP_COMPLETE jobs=${jobIds.length} media=${assets.rows.length} provider_voices=${voiceIds.length} aged_previews=${agedPreviews()}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertDisabled() {
  const record = pm2Record();
  const environment = preflight(record, false);
  if (environment.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED !== "false") {
    fail("STAGING_QWEN_E2E_BETA_DISABLE_NOT_ENFORCED");
  }
  const runtime = currentRuntime(record);
  const client = database(runtime, environment.DATABASE_URL);
  try {
    await client.connect();
    const owner = await identity(client, environment.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS);
    await assertBetaDisabled(environment, signedSession(environment, owner));
    console.log("QWEN_BETA_DISABLED_VERIFIED external=404 code=BETA_NOT_AVAILABLE");
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const [mode, runId] = process.argv.slice(2);
  if (mode === "run" && runId) return run(runId);
  if (mode === "remove-preview" && runId) return removePreview(runId);
  if (mode === "cleanup" && runId === undefined) return cleanup();
  if (mode === "assert-disabled" && runId === undefined) return assertDisabled();
  fail("STAGING_QWEN_E2E_USAGE_INVALID");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`QWEN_E2E_FAILED code=${error?.code ?? "UNKNOWN"}`);
    process.exitCode = 1;
  });
}

module.exports = { MODEL, ORIGIN, SYNTHETIC_ID, isBetaDisabledResponse, parseWav, previewPath, ttsEndpoint };
