"use strict";

// Versioned Staging-only process controller for the Qwen internal beta.  It
// never reads, writes, or prints DashScope credentials: the PM2 child loads
// them only from the 0600 secret file through the versioned wrapper.
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, realpathSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = "/home/ubuntu/memoryai-staging";
const SECRET_FILE = `${ROOT}/secrets/qwen-voice-clone.env`;
const APP = "memoryai-staging";
const ALLOWLIST_KEY = "MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS";
const FLAG_KEY = "MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED";
const SYNTHETIC_EXTERNAL_ID = /^stg-qwen-vc-beta-[a-z0-9]{16}$/u;
const SHA = /^[a-f0-9]{40}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function command(file, args, options = {}) {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch {
    fail("STAGING_QWEN_BETA_PM2_COMMAND_FAILED");
  }
}

function currentRelease() {
  let current;
  try { current = realpathSync(`${ROOT}/current`); } catch { fail("STAGING_QWEN_BETA_CURRENT_UNAVAILABLE"); }
  const sha = path.basename(current);
  if (!current.startsWith(`${ROOT}/releases/`) || !SHA.test(sha) || !existsSync(path.join(current, "runtime", "standalone-manifest.json"))) {
    fail("STAGING_QWEN_BETA_CURRENT_INVALID");
  }
  return { path: current, sha };
}

function pm2App() {
  let apps;
  try { apps = JSON.parse(command("pm2", ["jlist"])); } catch { fail("STAGING_QWEN_BETA_PM2_LIST_INVALID"); }
  const records = apps.filter((app) => app?.name === APP);
  if (records.length !== 1 || !records[0]?.pm2_env?.env || typeof records[0].pm2_env.env !== "object") {
    fail("STAGING_QWEN_BETA_PM2_APP_INVALID");
  }
  return records[0];
}

function safeRuntimeEnvironment(current, record, enabled) {
  const source = record.pm2_env.env;
  const { DASHSCOPE_API_KEY: _apiKey, DASHSCOPE_VOICE_CLONE_ENDPOINT: _endpoint, ...environment } = source;
  const allowlist = environment[ALLOWLIST_KEY];
  if (!SYNTHETIC_EXTERNAL_ID.test(allowlist ?? "")) fail("STAGING_QWEN_BETA_ALLOWLIST_INVALID");
  if (environment.DEPLOYMENT_ENV !== "staging" || environment.MEMORYAI_DEPLOYMENT_TIER !== "internal-beta" || environment.MEMORYAI_BETA_DATA_SCOPE !== "isolated-test") {
    fail("STAGING_QWEN_BETA_ISOLATION_INVALID");
  }
  return {
    ...environment,
    MEMORYAI_RELEASE_ROOT: path.join(current.path, "runtime"),
    MEMORYAI_PM2_APP_NAME: APP,
    MEMORYAI_PORT: "3100",
    MEMORYAI_STAGING_SECRET_FILE: SECRET_FILE,
    [FLAG_KEY]: enabled ? "true" : "false",
    [ALLOWLIST_KEY]: allowlist,
    MEMORYAI_DEPLOYMENT_TIER: "internal-beta",
    MEMORYAI_BETA_DATA_SCOPE: "isolated-test",
  };
}

function status(pathname, token) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port: 3100, path: pathname, headers: { "X-MemoryAI-Staging-Access": token } }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(7000, () => { request.destroy(); resolve(false); });
  });
}

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function reload(enabled) {
  const current = currentRelease();
  const record = pm2App();
  const environment = safeRuntimeEnvironment(current, record, enabled);
  const config = path.join(__dirname, "staging-web-pm2-manifest.config.cjs");
  const wrapper = path.join(__dirname, "staging-web-secret-runtime-wrapper.cjs");
  if (!existsSync(config) || !existsSync(wrapper)) fail("STAGING_QWEN_BETA_RUNNER_MISSING");

  command("pm2", ["delete", APP], { env: environment });
  command("pm2", ["start", config, "--only", APP, "--update-env"], { env: environment });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(1000);
    const after = pm2App();
    const env = after.pm2_env.env;
    const [health, database] = await Promise.all([status("/api/health", environment.STAGING_ACCESS_TOKEN), status("/api/health/database", environment.STAGING_ACCESS_TOKEN)]);
    if (after.pm2_env.status === "online" && after.pm2_env.unstable_restarts === 0 && after.pm2_env.pm_cwd === path.join(current.path, "runtime") && after.pm2_env.pm_exec_path === wrapper && !env.DASHSCOPE_API_KEY && !env.DASHSCOPE_VOICE_CLONE_ENDPOINT && env[FLAG_KEY] === (enabled ? "true" : "false") && health && database) {
      return { enabled, currentSha: current.sha };
    }
  }
  fail("STAGING_QWEN_BETA_RELOAD_HEALTH_FAILED");
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "enable" && mode !== "disable") fail("STAGING_QWEN_BETA_MODE_INVALID");
  const result = await reload(mode === "enable");
  console.log(`STAGING_QWEN_BETA_RELOAD=${result.enabled ? "ENABLED" : "DISABLED"} health=200 database=200 release=${result.currentSha.slice(0, 12)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`STAGING_QWEN_BETA_RELOAD_FAILED code=${error?.code ?? "UNKNOWN"}`);
    process.exitCode = 1;
  });
}

module.exports = { APP, ALLOWLIST_KEY, FLAG_KEY, ROOT, SECRET_FILE, SYNTHETIC_EXTERNAL_ID, currentRelease, safeRuntimeEnvironment };
