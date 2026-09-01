"use strict";

// Installs one owned, Staging-only crontab block. The scheduled program emits
// only redacted count/code output and reads credentials from the 0600 runtime
// secret file; credentials never occur in crontab, arguments, or logs.
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync } = require("node:fs");

const ROOT = "/home/ubuntu/memoryai-staging";
const MARKER = "# memoryai-staging-qwen-synthetic-cleanup-v1";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function toolPath(value) {
  if (typeof value !== "string" || !new RegExp(`^${ROOT}/tools/qwen-e2e-[0-9a-f]{40}/staging-qwen-real-e2e\\.cjs$`, "u").test(value) || !existsSync(value)) {
    fail("STAGING_QWEN_CLEANUP_TOOL_INVALID");
  }
  return value;
}

function readCrontab() {
  try { return execFileSync("crontab", ["-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (error) {
    if (error.status === 1) return "";
    fail("STAGING_QWEN_CLEANUP_CRONTAB_READ_FAILED");
  }
}

function managedCrontab(existing, nodePath, e2eTool) {
  if (typeof existing !== "string" || !/^\/[A-Za-z0-9._/-]+$/u.test(nodePath)) fail("STAGING_QWEN_CLEANUP_NODE_INVALID");
  const kept = existing.split("\n").filter((line) => line !== MARKER && !line.includes(`${ROOT}/tools/qwen-e2e-`)).join("\n").replace(/\n+$/u, "");
  const command = `*/5 * * * * /usr/bin/flock -n ${ROOT}/.promotion/locks/qwen-synthetic-cleanup.lock ${nodePath} ${e2eTool} cleanup >> ${ROOT}/logs/qwen-synthetic-cleanup.log 2>&1`;
  return `${kept ? `${kept}\n` : ""}${MARKER}\n${command}\n`;
}

function install(e2eTool) {
  const tool = toolPath(e2eTool);
  if (!/^\/[A-Za-z0-9._/-]+$/u.test(process.execPath) || !existsSync(process.execPath)) fail("STAGING_QWEN_CLEANUP_NODE_INVALID");
  mkdirSync(`${ROOT}/.promotion/locks`, { recursive: true, mode: 0o700 });
  mkdirSync(`${ROOT}/logs`, { recursive: true, mode: 0o700 });
  const updated = managedCrontab(readCrontab(), process.execPath, tool);
  try { execFileSync("crontab", ["-"], { input: updated, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); } catch { fail("STAGING_QWEN_CLEANUP_CRONTAB_WRITE_FAILED"); }
  if ((readCrontab().match(new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== 1) fail("STAGING_QWEN_CLEANUP_CRONTAB_VERIFY_FAILED");
  console.log("STAGING_QWEN_SYNTHETIC_CLEANUP_SCHEDULE=EVERY_5_MINUTES");
}

if (require.main === module) {
  try {
    if (process.argv[2] !== "install" || process.argv.length !== 4) fail("STAGING_QWEN_CLEANUP_USAGE_INVALID");
    install(process.argv[3]);
  } catch (error) {
    console.error(`STAGING_QWEN_CLEANUP_SCHEDULE_FAILED code=${error?.code ?? "UNKNOWN"}`);
    process.exitCode = 1;
  }
}

module.exports = { MARKER, managedCrontab };
