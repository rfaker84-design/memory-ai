"use strict";

// Staging-only, no-Qwen-secret transport preflight. It proves that the exact
// signed-media boundary used by voice cloning is anonymously fetchable and
// byte-exact before a provider credential is ever requested.
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const { canonicalFixture } = require("./staging-qwen-audio-gate.cjs");
const { auditAndNormalizeWav } = require("./staging-qwen-audio-evidence.cjs");

const ROOT = "/home/ubuntu/memoryai-staging";
const APP = "memoryai-staging";
const API_ORIGIN = "https://api.staging.yijianmemory.cn";
const SYNTHETIC_EXTERNAL_ID = "stg-qwen-vc-beta-0000000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function pm2Environment() {
  let apps;
  try { apps = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); } catch { fail("STAGING_QWEN_AUDIO_PREFLIGHT_PM2_FAILED"); }
  const matches = apps.filter((item) => item?.name === APP);
  const env = matches.length === 1 ? matches[0]?.pm2_env?.env : null;
  if (!env || matches[0]?.pm2_env?.status !== "online" || env.DEPLOYMENT_ENV !== "staging" || env.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED !== "false" || env.DASHSCOPE_API_KEY || env.DASHSCOPE_VOICE_CLONE_ENDPOINT) {
    fail("STAGING_QWEN_AUDIO_PREFLIGHT_CONTRACT_INVALID");
  }
  if (typeof env.STAGING_MEDIA_ROOT !== "string" || typeof env.STAGING_MEDIA_SIGNING_SECRET !== "string" || Buffer.byteLength(env.STAGING_MEDIA_SIGNING_SECRET) < 32) {
    fail("STAGING_QWEN_AUDIO_PREFLIGHT_MEDIA_CONFIG_INVALID");
  }
  return env;
}

function storagePath(root, key) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...key.split("/").map(encodeURIComponent));
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) fail("STAGING_QWEN_AUDIO_PREFLIGHT_PATH_INVALID");
  return target;
}

function signedUrl(environment, key, nowSeconds) {
  const expires = nowSeconds + 900;
  const signature = crypto.createHmac("sha256", environment.STAGING_MEDIA_SIGNING_SECRET)
    .update(`staging-media\0${key}\0${expires}`)
    .digest("base64url");
  const url = new URL("/api/media/local", API_ORIGIN);
  url.searchParams.set("key", key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return { url, expires };
}

async function run() {
  const environment = pm2Environment();
  const runId = crypto.randomUUID();
  if (!UUID.test(runId)) fail("STAGING_QWEN_AUDIO_PREFLIGHT_RUN_ID_INVALID");
  const key = `media/${SYNTHETIC_EXTERNAL_ID}/${runId}/audio/${crypto.randomUUID()}.wav`;
  const target = storagePath(environment.STAGING_MEDIA_ROOT, key);
  const evidenceDirectory = path.join(ROOT, "private-e2e");
  const audio = canonicalFixture();
  let stored = false;
  try {
    const inspected = auditAndNormalizeWav(audio, { evidenceDirectory, label: `offline-${runId}` });
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, inspected.audio, { mode: 0o600, flag: "wx" });
    stored = true;
    const now = Math.floor(Date.now() / 1000);
    const signed = signedUrl(environment, key, now);
    const response = await fetch(signed.url, { redirect: "error" });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    const downloaded = Buffer.from(await response.arrayBuffer());
    const expected = crypto.createHash("sha256").update(inspected.audio).digest("hex");
    const actual = crypto.createHash("sha256").update(downloaded).digest("hex");
    if (response.status !== 200 || response.redirected || (contentType !== "audio/wav" && contentType !== "audio/x-wav") || actual !== expected || signed.expires - now < 840) {
      fail("STAGING_QWEN_AUDIO_PREFLIGHT_SIGNED_URL_INVALID");
    }
    console.log(`STAGING_QWEN_OFFLINE_AUDIO_PREFLIGHT=PASS format=pcm_s16le mono=1 sample_rate=${inspected.wav.sampleRate} duration_ms=${inspected.wav.durationMilliseconds} signed_url=anonymous-200 byte_match=sha256 ttl_seconds=900 storage=ephemeral-cleaned`);
  } finally {
    if (stored || existsSync(target)) rmSync(target, { force: true });
  }
}

run().catch((error) => {
  console.error(`STAGING_QWEN_OFFLINE_AUDIO_PREFLIGHT_FAILED code=${error?.code ?? "UNKNOWN"}`);
  process.exitCode = 1;
});

module.exports = { signedUrl, storagePath };
