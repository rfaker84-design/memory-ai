"use strict";

// A versioned Staging runner wrapper.  PM2 receives only the path to the
// private file; this process reads the two Qwen credentials after PM2 has
// forked it, so `pm2 save` and `pm2 jlist` never contain the credential values.
const { closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, statSync, writeSync } = require("node:fs");
const path = require("node:path");

const STAGING_ROOT = "/home/ubuntu/memoryai-staging";
const SECRET_FILE = `${STAGING_ROOT}/secrets/qwen-voice-clone.env`;
const CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization";
// Workspace-scoped DashScope keys use `sk-ws-` and permit dotted, underscored,
// and hyphenated opaque segments. Keep a finite total length and reject every
// whitespace, newline, and control character before it can reach disk.
const API_KEY = /^sk-ws-[A-Za-z0-9._-]{1,506}$/u;
const ENDPOINT = /^https:\/\/[a-z0-9-]{1,63}\.cn-beijing\.maas\.aliyuncs\.com\/api\/v1\/services\/audio\/tts\/customization$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function required(value, code) {
  if (typeof value !== "string" || !value || value.trim() !== value) fail(code);
  return value;
}

function canonicalEndpoint(value) {
  const endpoint = required(value, "STAGING_QWEN_SECRET_ENDPOINT_INVALID");
  if (!ENDPOINT.test(endpoint)) fail("STAGING_QWEN_SECRET_ENDPOINT_INVALID");
  const parsed = new URL(endpoint);
  if (parsed.toString() !== endpoint) fail("STAGING_QWEN_SECRET_ENDPOINT_INVALID");
  return endpoint;
}

function parseSecretText(text) {
  if (typeof text !== "string" || !text.endsWith("\n") || text.includes("\r")) fail("STAGING_QWEN_SECRET_FILE_INVALID");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== 2) fail("STAGING_QWEN_SECRET_FILE_INVALID");
  const [keyLine, endpointLine] = lines;
  const keyPrefix = "DASHSCOPE_API_KEY=";
  const endpointPrefix = "DASHSCOPE_VOICE_CLONE_ENDPOINT=";
  if (!keyLine.startsWith(keyPrefix) || !endpointLine.startsWith(endpointPrefix)) fail("STAGING_QWEN_SECRET_FILE_INVALID");
  const apiKey = keyLine.slice(keyPrefix.length);
  const endpoint = endpointLine.slice(endpointPrefix.length);
  if (!API_KEY.test(apiKey)) fail("STAGING_QWEN_SECRET_KEY_INVALID");
  return Object.freeze({ DASHSCOPE_API_KEY: apiKey, DASHSCOPE_VOICE_CLONE_ENDPOINT: canonicalEndpoint(endpoint) });
}

function assertSecretFile(file = SECRET_FILE) {
  if (file !== SECRET_FILE || !path.isAbsolute(file) || path.dirname(file) !== `${STAGING_ROOT}/secrets`) fail("STAGING_QWEN_SECRET_FILE_PATH_INVALID");
  let metadata;
  try { metadata = statSync(file); } catch { fail("STAGING_QWEN_SECRET_FILE_UNAVAILABLE"); }
  if (!metadata.isFile() || metadata.uid !== process.getuid() || (metadata.mode & 0o077) !== 0) {
    fail("STAGING_QWEN_SECRET_FILE_PERMISSIONS_INVALID");
  }
  return file;
}

function loadStagingQwenSecrets(file = SECRET_FILE) {
  return parseSecretText(readFileSync(assertSecretFile(file), "utf8"));
}

function serializedSecretFile(input) {
  const apiKey = required(input?.apiKey, "STAGING_QWEN_SECRET_KEY_INVALID");
  if (!API_KEY.test(apiKey)) fail("STAGING_QWEN_SECRET_KEY_INVALID");
  const endpoint = canonicalEndpoint(input?.endpoint);
  return `${"DASHSCOPE_API_KEY="}${apiKey}\n${"DASHSCOPE_VOICE_CLONE_ENDPOINT="}${endpoint}\n`;
}

function writeStagingQwenSecrets(input, file = SECRET_FILE) {
  if (file !== SECRET_FILE) fail("STAGING_QWEN_SECRET_FILE_PATH_INVALID");
  const directory = path.dirname(file);
  const content = serializedSecretFile(input);
  let directoryMetadata;
  try { directoryMetadata = statSync(directory); } catch { fail("STAGING_QWEN_SECRET_DIRECTORY_UNAVAILABLE"); }
  if (!directoryMetadata.isDirectory() || directoryMetadata.uid !== process.getuid() || (directoryMetadata.mode & 0o077) !== 0) {
    fail("STAGING_QWEN_SECRET_DIRECTORY_PERMISSIONS_INVALID");
  }
  try {
    const existing = lstatSync(file);
    if (!existing.isFile() || existing.uid !== process.getuid() || (existing.mode & 0o077) !== 0) fail("STAGING_QWEN_SECRET_FILE_PERMISSIONS_INVALID");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    const bytes = Buffer.from(content, "utf8");
    if (writeSync(descriptor, bytes) !== bytes.length) fail("STAGING_QWEN_SECRET_WRITE_FAILED");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, file);
  const directoryDescriptor = openSync(directory, "r");
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  assertSecretFile(file);
}

function runtimeRoot() {
  const value = required(process.env.MEMORYAI_RELEASE_ROOT, "STAGING_WEB_SECRET_RUNTIME_ROOT_INVALID");
  const root = path.resolve(value);
  if (!root.startsWith(`${STAGING_ROOT}/releases/`) || !root.endsWith("/runtime") || root.includes("..")) {
    fail("STAGING_WEB_SECRET_RUNTIME_ROOT_INVALID");
  }
  return root;
}

function start() {
  if (process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT) {
    fail("STAGING_WEB_SECRET_PM2_ENV_FORBIDDEN");
  }
  const root = runtimeRoot();
  const secrets = loadStagingQwenSecrets(process.env.MEMORYAI_STAGING_SECRET_FILE ?? SECRET_FILE);
  Object.assign(process.env, secrets);
  const launcher = path.join(root, "run-standalone-from-manifest.cjs");
  try { require(launcher); } catch (error) {
    if (error?.code?.startsWith("STAGING_")) throw error;
    throw error;
  }
}

if (require.main === module) start();

module.exports = {
  CUSTOMIZATION_PATH,
  SECRET_FILE,
  STAGING_ROOT,
  assertSecretFile,
  canonicalEndpoint,
  loadStagingQwenSecrets,
  parseSecretText,
  serializedSecretFile,
  writeStagingQwenSecrets,
};
