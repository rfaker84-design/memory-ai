"use strict";

// This module is installed as a versioned Staging release tool, not with an
// application release. It never accepts a source directory: only one complete,
// SHA-bound immutable archive that contains its own release evidence.
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeSync,
} = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { requiredFreeBytes } = require("./staging-release-capacity-gate.cjs");

const SHA = /^[0-9a-f]{40}$/iu;
const SHA256 = /^[0-9a-f]{64}$/iu;
const REQUIRED_EVIDENCE = ["release-manifest.json", "manifest.json", "provenance.intoto.json", "sbom.spdx.json", "SHA256SUMS"];
const FORMAL_STAGING_RUNNER_WRAPPER_BLOBS = new Set([
  // The installed 5a8 runner used by the serving Staging process. A formal
  // runner may use this blob only from its SHA-named, private tool directory.
  "e1f6b46df71a460d0afc6f18f709ea6fd22df71672a5992c4a1ed7ea10c46b16",
]);
const RECONCILIATION_AUTHORIZATION = "STAGING_WEB_RECONCILIATION_AUTHORIZED_2026-08-27";
const RECONCILIATION_LINEAGE = [
  "219750eebd5bed2ef5243282be45ac0ca5220035",
  "91a844e33d18c2aa1444054b706106dd755c9895",
  "68f52a752d88c0370cc8218d6afe105a0d0545ff",
];
const SERVING_APP_NAME = "memoryai-staging";
const SERVING_PORT = "3100";
const CANDIDATE_PORT = "3110";
const CANDIDATE_APP_PREFIX = "memoryai-staging-candidate-";
const QWEN_RUNTIME_ENVIRONMENT_KEYS = ["DASHSCOPE_API_KEY", "DASHSCOPE_VOICE_CLONE_ENDPOINT"];
const QWEN_BETA_ENVIRONMENT_KEY = "MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED";

function fail(code, detail) {
  throw new Error(`${code}${detail === undefined ? "" : `:${detail}`}`);
}

function sha(value, code) {
  if (!SHA.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function sha256(value, code) {
  if (!SHA256.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function positive(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code, value);
  return value;
}

function rootPath(value) {
  if (typeof value !== "string" || !/^\/[A-Za-z0-9._/-]+$/u.test(value) || value.includes("..")) fail("WEB_EXECUTOR_ROOT_INVALID", value);
  return value.replace(/\/$/u, "");
}

function boundedPath(root, candidate, prefix, suffix, code) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) || !candidate.startsWith(`${root}/${prefix}/`) || !candidate.endsWith(suffix) || candidate.includes("..")) {
    fail(code, candidate);
  }
  return candidate;
}

function hashFile(file) {
  return crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
}

function syncDirectory(directory) {
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function appendJsonLine(file, entry) {
  const descriptor = openSync(file, "a", 0o600);
  try {
    const serialized = `${JSON.stringify(entry)}\n`;
    const bytes = Buffer.byteLength(serialized);
    if (writeSync(descriptor, serialized) !== bytes) fail("WEB_JOURNAL_APPEND_INCOMPLETE", file);
    fsyncSync(descriptor);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusiveJson(file, entry) {
  const descriptor = openSync(file, "wx", 0o600);
  try {
    const serialized = `${JSON.stringify(entry)}\n`;
    const bytes = Buffer.byteLength(serialized);
    if (writeSync(descriptor, serialized) !== bytes) fail("WEB_RECONCILIATION_WRITE_INCOMPLETE", file);
    fsyncSync(descriptor);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function releasePath(root, value, code) {
  const checked = sha(value, code);
  return { sha: checked, path: `${root}/releases/${checked}` };
}

function candidateAppName(sourceSha) {
  return `${CANDIDATE_APP_PREFIX}${sha(sourceSha, "WEB_EXECUTOR_CANDIDATE_NAME_SHA_INVALID").slice(0, 12)}`;
}

function assertArchiveInput(input) {
  const root = rootPath(input.remoteRoot);
  const expectedSourceSha = sha(input.expectedSourceSha, "WEB_EXECUTOR_EXPECTED_SOURCE_SHA_INVALID");
  const expectedCurrentSha = sha(input.expectedCurrentSha, "WEB_EXECUTOR_EXPECTED_CURRENT_SHA_INVALID");
  const expectedRollbackSha = sha(input.expectedRollbackSha, "WEB_EXECUTOR_EXPECTED_ROLLBACK_SHA_INVALID");
  const archivePath = boundedPath(root, input.archivePath, ".incoming", ".tar.gz", "WEB_EXECUTOR_ARCHIVE_PATH_INVALID");
  const archiveSha256 = sha256(input.archiveSha256, "WEB_EXECUTOR_ARCHIVE_SHA_INVALID");
  const evidence = input.evidence;
  if (!evidence || typeof evidence !== "object") fail("WEB_EXECUTOR_EVIDENCE_INPUT_MISSING");
  const evidenceSha256 = Object.fromEntries(REQUIRED_EVIDENCE.map((name) => [name, sha256(evidence[name], `WEB_EXECUTOR_EVIDENCE_SHA_INVALID_${name}`)]));
  const candidatePort = positive(input.candidatePort, "WEB_EXECUTOR_CANDIDATE_PORT_INVALID");
  if (candidatePort !== Number(CANDIDATE_PORT)) fail("WEB_EXECUTOR_CANDIDATE_PORT_INVALID", candidatePort);
  if (input.component !== "web") fail("WEB_EXECUTOR_COMPONENT_INVALID", input.component);
  return { root, expectedSourceSha, expectedCurrentSha, expectedRollbackSha, archivePath, archiveSha256, evidenceSha256, candidatePort };
}

function recursiveBytes(directory) {
  let total = 0;
  for (const entry of require("node:fs").readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) fail("WEB_EXECUTOR_ARCHIVE_SYMLINK_FORBIDDEN", file);
    if (entry.isDirectory()) total += recursiveBytes(file);
    else if (entry.isFile()) total += stat.size;
    else fail("WEB_EXECUTOR_ARCHIVE_ENTRY_INVALID", file);
  }
  return total;
}

function runtimeIdentity(directory) {
  const files = [];
  const visit = (base, relative = "") => {
    for (const entry of require("node:fs").readdirSync(base, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const next = path.join(base, entry.name);
      const name = path.posix.join(relative, entry.name);
      const stat = lstatSync(next);
      if (stat.isSymbolicLink()) fail("WEB_EXECUTOR_ARCHIVE_SYMLINK_FORBIDDEN", name);
      if (entry.isDirectory()) visit(next, name);
      else if (entry.isFile()) files.push({ path: name, bytes: stat.size, sha256: hashFile(next) });
      else fail("WEB_EXECUTOR_ARCHIVE_ENTRY_INVALID", name);
    }
  };
  visit(directory);
  const bytes = files.reduce((total, file) => total + file.bytes, 0);
  return {
    fileCount: files.length,
    bytes,
    sha256: crypto.createHash("sha256").update(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join("")).digest("hex"),
  };
}

function requiredPromotionBytes(archiveBytes, unpackedBytes) {
  if (!Number.isSafeInteger(archiveBytes) || archiveBytes <= 0) fail("WEB_EXECUTOR_ARCHIVE_SIZE_INVALID", archiveBytes);
  // `available` is captured with the delivered archive still in .incoming.
  // Include it explicitly in the audit value as well as the retained/current
  // release budget, rather than treating a synthetic size as evidence.
  return Math.max(requiredFreeBytes(unpackedBytes), (2 * unpackedBytes) + archiveBytes + (5 * 1024 ** 3));
}

function command(file, args, options = {}) {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join(" ").trim();
    fail("WEB_EXECUTOR_COMMAND_FAILED", `${file}:${output}`);
  }
}

// A full artifact contains thousands of files.  `sha256sum --check` normally
// emits one success line per file, so capture only stderr and ask GNU coreutils
// for status-only output.  This keeps complete checksum validation fail-closed
// without exhausting Node's default 1 MiB child-process buffer.
function verifyChecksums(directory, commandRunner = command) {
  return commandRunner("sha256sum", ["--check", "--status", "SHA256SUMS"], {
    cwd: directory,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function servingPm2Actions(pm2Config) {
  // `startOrReload` can retain PM2's prior cwd, environment, and restart
  // history.  A serving cutover must instead create one fresh process from the
  // release-local manifest after the already-healthy candidate is available.
  return [
    ["delete", "memoryai-staging"],
    ["start", pm2Config, "--only", "memoryai-staging", "--update-env"],
  ];
}

function parseJson(file, code) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { fail(code, file); }
}

function assertReleaseManifest(file, expectedSha) {
  const manifest = parseJson(file, "WEB_EXECUTOR_RELEASE_MANIFEST_INVALID");
  if (manifest.version !== 1 || manifest.immutable !== true || manifest.rebuildable !== true || manifest.persistentData !== false || manifest.noEnvironmentFiles !== true || manifest.component !== "web") {
    fail("WEB_EXECUTOR_RELEASE_MANIFEST_INVALID", file);
  }
  if (sha(manifest.sourceSha, "WEB_EXECUTOR_RELEASE_MANIFEST_SOURCE_INVALID") !== expectedSha) fail("WEB_EXECUTOR_RELEASE_MANIFEST_SOURCE_MISMATCH", file);
  return manifest;
}

function verifyBundle(directory, plan) {
  const entries = require("node:fs").readdirSync(directory, { withFileTypes: true });
  const allowed = new Set([...REQUIRED_EVIDENCE, "runtime"]);
  if (entries.some((entry) => !allowed.has(entry.name))) fail("WEB_EXECUTOR_ARCHIVE_CONTENT_INVALID");
  const runtimeEntry = entries.find((entry) => entry.name === "runtime");
  if (!runtimeEntry?.isDirectory()) fail("WEB_EXECUTOR_RUNTIME_DIRECTORY_INVALID");
  for (const file of REQUIRED_EVIDENCE) if (!existsSync(path.join(directory, file))) fail("WEB_EXECUTOR_EVIDENCE_FILE_MISSING", file);
  for (const [file, expectedHash] of Object.entries(plan.evidenceSha256)) {
    if (hashFile(path.join(directory, file)) !== expectedHash) fail("WEB_EXECUTOR_EVIDENCE_HASH_MISMATCH", file);
  }
  verifyChecksums(directory);
  const releaseManifest = assertReleaseManifest(path.join(directory, "release-manifest.json"), plan.expectedSourceSha);
  const runtimeManifest = assertReleaseManifest(path.join(directory, "runtime", "release-manifest.json"), plan.expectedSourceSha);
  if (JSON.stringify(releaseManifest) !== JSON.stringify(runtimeManifest)) fail("WEB_EXECUTOR_RELEASE_MANIFEST_COPIES_DIFFER");
  const manifest = parseJson(path.join(directory, "manifest.json"), "WEB_EXECUTOR_MANIFEST_INVALID");
  if (manifest?.schemaVersion !== 1 || sha(manifest?.source?.commit, "WEB_EXECUTOR_MANIFEST_SOURCE_INVALID") !== plan.expectedSourceSha || manifest?.runtime?.directory !== "runtime") {
    fail("WEB_EXECUTOR_MANIFEST_IDENTITY_MISMATCH");
  }
  const runtimeDigest = sha256(manifest?.runtime?.sha256, "WEB_EXECUTOR_RUNTIME_DIGEST_INVALID");
  const actualRuntime = runtimeIdentity(path.join(directory, "runtime"));
  if (manifest?.runtime?.fileCount !== actualRuntime.fileCount || manifest?.runtime?.bytes !== actualRuntime.bytes || runtimeDigest !== actualRuntime.sha256) {
    fail("WEB_EXECUTOR_RUNTIME_DIGEST_MISMATCH");
  }
  const provenance = parseJson(path.join(directory, "provenance.intoto.json"), "WEB_EXECUTOR_PROVENANCE_INVALID");
  if (provenance?._type !== "https://in-toto.io/Statement/v1" || provenance?.subject?.[0]?.digest?.sha256 !== runtimeDigest) fail("WEB_EXECUTOR_PROVENANCE_RUNTIME_MISMATCH");
  const sbom = parseJson(path.join(directory, "sbom.spdx.json"), "WEB_EXECUTOR_SBOM_INVALID");
  if (typeof sbom?.spdxVersion !== "string" || !sbom.spdxVersion.startsWith("SPDX-")) fail("WEB_EXECUTOR_SBOM_INVALID");
  if (manifest?.build?.featureFlags?.qwenAudioTtsFlashVoiceClone !== true) fail("WEB_EXECUTOR_QWEN_VOICE_CLONE_UNVERIFIED");
  const runtime = path.join(directory, "runtime");
  for (const required of ["standalone-manifest.json", "run-standalone-from-manifest.cjs", "release-manifest.json"]) {
    if (!existsSync(path.join(runtime, required))) fail("WEB_EXECUTOR_RUNTIME_FILE_MISSING", required);
  }
  return { runtimeDigest, manifest, releaseManifest };
}

function parsePm2Records(raw) {
  let records;
  try { records = JSON.parse(raw); } catch { fail("WEB_EXECUTOR_PM2_JLIST_INVALID"); }
  if (!Array.isArray(records)) fail("WEB_EXECUTOR_PM2_JLIST_INVALID");
  return records;
}

function parsePm2Record(raw, appName = SERVING_APP_NAME) {
  const records = parsePm2Records(raw).filter((value) => value?.name === appName);
  if (records.length !== 1) fail("WEB_EXECUTOR_PM2_APP_COUNT_INVALID", records.length);
  const record = records[0];
  const env = record.pm2_env ?? {};
  const currentEnv = env.env;
  if (!currentEnv || typeof currentEnv !== "object") fail("WEB_EXECUTOR_PM2_ENV_MISSING");
  return {
    name: record.name,
    pid: positive(record.pid, "WEB_EXECUTOR_PM2_PID_INVALID"),
    status: env.status,
    unstableRestarts: env.unstable_restarts,
    cwd: env.pm_cwd,
    execPath: env.pm_exec_path,
    port: currentEnv.PORT,
    environment: currentEnv,
  };
}

function pm2Records() {
  return parsePm2Records(command("pm2", ["jlist"]));
}

function pm2RecordFromRecords(records, appName = SERVING_APP_NAME) {
  return parsePm2Record(JSON.stringify(records), appName);
}

function pm2Record(appName = SERVING_APP_NAME) {
  return pm2RecordFromRecords(pm2Records(), appName);
}

function lstatExact(file, expectedType, code, dependencies) {
  let metadata;
  try { metadata = dependencies.lstatSync(file); } catch { fail(code, file); }
  if ((expectedType === "file" && !metadata.isFile()) || (expectedType === "directory" && !metadata.isDirectory()) || metadata.isSymbolicLink()) {
    fail(code, file);
  }
  return metadata;
}

function assertExactRealPath(file, code, dependencies) {
  let resolved;
  try { resolved = dependencies.realpathSync(file); } catch { fail(code, file); }
  if (resolved !== file) fail(code, file);
}

function mountPath(value) {
  return value.replace(/\\([0-7]{3})/gu, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function assertNotMountedDirectory(directory, code, dependencies) {
  let mountInfo;
  try { mountInfo = dependencies.readMountInfo(); } catch { fail(code, directory); }
  if (typeof mountInfo !== "string") fail(code, directory);
  for (const line of mountInfo.split("\n")) {
    const fields = line.split(" ");
    // Linux mountinfo field 5 is the mount point. A separately mounted or
    // bind-mounted runner directory is not an immutable deployment tool.
    if (fields.length >= 5 && mountPath(fields[4]) === directory) fail(code, directory);
  }
}

function assertControlledRunnerDirectory(directory, code, dependencies, options = {}) {
  const metadata = lstatExact(directory, "directory", code, dependencies);
  if (
    metadata.uid !== dependencies.expectedUid
    || metadata.gid !== dependencies.expectedGid
    || (metadata.mode & 0o022) !== 0
    || (options.expectedDevice !== undefined && metadata.dev !== options.expectedDevice)
    || (options.requiredNlink !== undefined && metadata.nlink !== options.requiredNlink)
  ) fail(code, directory);
  assertExactRealPath(directory, code, dependencies);
  assertNotMountedDirectory(directory, code, dependencies);
  return metadata;
}

function assertPrivateRunnerFile(file, code, dependencies, expectedDevice) {
  const metadata = lstatExact(file, "file", code, dependencies);
  if (
    metadata.uid !== dependencies.expectedUid
    || metadata.gid !== dependencies.expectedGid
    || (metadata.mode & 0o077) !== 0
    || metadata.nlink !== 1
    || metadata.dev !== expectedDevice
  ) fail(code, file);
  assertExactRealPath(file, code, dependencies);
  return metadata;
}

function assertReleaseLauncher(file, dependencies) {
  const metadata = lstatExact(file, "file", "WEB_EXECUTOR_RELEASE_LAUNCHER_INVALID", dependencies);
  if (metadata.uid !== dependencies.expectedUid || (metadata.mode & 0o022) !== 0 || metadata.nlink !== 1) fail("WEB_EXECUTOR_RELEASE_LAUNCHER_INVALID", file);
  assertExactRealPath(file, "WEB_EXECUTOR_RELEASE_LAUNCHER_INVALID", dependencies);
  return metadata;
}

function formalRunnerDependencies(overrides = {}) {
  return {
    root: "/home/ubuntu/memoryai-staging",
    expectedUid: typeof process.getuid === "function" ? process.getuid() : null,
    expectedGid: typeof process.getgid === "function" ? process.getgid() : null,
    lstatSync,
    realpathSync,
    hashFile,
    readMountInfo: () => readFileSync("/proc/self/mountinfo", "utf8"),
    ...overrides,
  };
}

function assertFormalStagingRunnerWrapper(release, execPath, overrides = {}) {
  const dependencies = formalRunnerDependencies(overrides);
  const root = dependencies.root;
  const expected = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/tools/staging-web-immutable-runner-([0-9a-f]{40})/staging-web-secret-runtime-wrapper\\.cjs$`, "u");
  const matched = typeof execPath === "string" ? execPath.match(expected) : null;
  if (!matched || execPath.includes("..")) fail("WEB_EXECUTOR_FORMAL_WRAPPER_PATH_INVALID", execPath);
  const tools = `${root}/tools`;
  const runner = `${tools}/staging-web-immutable-runner-${matched[1]}`;
  // Realpath on each segment proves that the absolute, SHA-named runner path
  // stays beneath the controlled Staging root. Every controlled directory is
  // owned by the deployment account and cannot be group/world-written. The
  // leaf directory has exactly two links (it has no child directories), while
  // the executable wrapper itself must remain an unshared regular file.
  const controlledRoot = assertControlledRunnerDirectory(root, "WEB_EXECUTOR_FORMAL_ROOT_DIRECTORY_INVALID", dependencies);
  assertControlledRunnerDirectory(tools, "WEB_EXECUTOR_FORMAL_TOOLS_DIRECTORY_INVALID", dependencies, { expectedDevice: controlledRoot.dev });
  assertControlledRunnerDirectory(runner, "WEB_EXECUTOR_FORMAL_WRAPPER_DIRECTORY_INVALID", dependencies, {
    expectedDevice: controlledRoot.dev,
    requiredNlink: 2,
  });
  assertPrivateRunnerFile(execPath, "WEB_EXECUTOR_FORMAL_WRAPPER_FILE_INVALID", dependencies, controlledRoot.dev);
  if (!FORMAL_STAGING_RUNNER_WRAPPER_BLOBS.has(dependencies.hashFile(execPath))) fail("WEB_EXECUTOR_FORMAL_WRAPPER_IDENTITY_INVALID", runner);
  const runtime = `${release.path}/runtime`;
  const launcher = `${runtime}/run-standalone-from-manifest.cjs`;
  assertReleaseLauncher(launcher, dependencies);
  return { runnerSha: matched[1], runnerPath: runner, wrapperPath: execPath, launcherPath: launcher };
}

function usesVersionedSecretWrapper(release, execPath, dependencies = {}) {
  if (execPath === `${release.path}/runtime/run-standalone-from-manifest.cjs`) return true;
  try {
    assertFormalStagingRunnerWrapper(release, execPath, dependencies);
    return true;
  } catch {
    return false;
  }
}

function assertNoQwenCandidateEnvironment(environment) {
  if (QWEN_RUNTIME_ENVIRONMENT_KEYS.some((key) => Object.hasOwn(environment ?? {}, key)) || environment?.[QWEN_BETA_ENVIRONMENT_KEY] !== "false") {
    fail("WEB_EXECUTOR_CANDIDATE_QWEN_ENVIRONMENT_INVALID");
  }
}

function assertPm2IdentityCommon(release, record, expectedName, expectedPort, identityCode, targetCode, dependencies = {}, requireSourceSha = false) {
  const runtime = `${release.path}/runtime`;
  if (record?.name !== expectedName || record.status !== "online" || record.unstableRestarts !== 0 || record.cwd !== runtime || String(record.port) !== expectedPort) {
    fail(identityCode);
  }
  if (
    record.environment?.MEMORYAI_RELEASE_ROOT !== runtime
    || (requireSourceSha && record.environment?.MEMORYAI_RELEASE_SOURCE_SHA !== release.sha)
    || record.environment?.MEMORYAI_PM2_APP_NAME !== expectedName
    || String(record.environment?.MEMORYAI_PORT) !== expectedPort
    || record.environment?.HOSTNAME !== "127.0.0.1"
    || record.environment?.AUTH_PROXY_LOOPBACK_ONLY !== "true"
  ) {
    fail(targetCode);
  }
  try { assertFormalStagingRunnerWrapper(release, record.execPath, dependencies); } catch { fail(identityCode); }
  const launcher = `${runtime}/run-standalone-from-manifest.cjs`;
  const activeDependencies = formalRunnerDependencies(dependencies);
  assertReleaseLauncher(launcher, activeDependencies);
  return { runtime, launcher, wrapper: record.execPath };
}

function assertServingPm2Identity(release, record, dependencies = {}) {
  return assertPm2IdentityCommon(release, record, SERVING_APP_NAME, SERVING_PORT, "WEB_EXECUTOR_CURRENT_PM2_INVALID", "WEB_EXECUTOR_CURRENT_PM2_RELEASE_TARGET_INVALID", dependencies);
}

function assertCandidatePm2Identity(release, record, dependencies = {}) {
  const expectedName = candidateAppName(release.sha);
  assertNoQwenCandidateEnvironment(record?.environment);
  return assertPm2IdentityCommon(release, record, expectedName, CANDIDATE_PORT, "WEB_EXECUTOR_CANDIDATE_PM2_INVALID", "WEB_EXECUTOR_CANDIDATE_PM2_RELEASE_TARGET_INVALID", dependencies, true);
}

function assertPm2RolePopulation(records, role, expectedCandidateApp) {
  const serving = records.filter((record) => record?.name === SERVING_APP_NAME);
  if (serving.length !== 1) fail("WEB_EXECUTOR_PM2_APP_COUNT_INVALID", serving.length);
  const candidates = records.filter((record) => typeof record?.name === "string" && record.name.startsWith(CANDIDATE_APP_PREFIX));
  if (role === "serving") {
    if (candidates.length !== 0) fail("WEB_EXECUTOR_CANDIDATE_RESIDUE_INVALID", candidates.length);
    return { serving: pm2RecordFromRecords(records, SERVING_APP_NAME), candidate: null };
  }
  if (role !== "candidate" || typeof expectedCandidateApp !== "string" || candidates.length !== 1 || candidates[0].name !== expectedCandidateApp) {
    fail("WEB_EXECUTOR_CANDIDATE_POPULATION_INVALID", candidates.length);
  }
  return { serving: pm2RecordFromRecords(records, SERVING_APP_NAME), candidate: pm2RecordFromRecords(records, expectedCandidateApp) };
}

function verifyInstalledRelease(release) {
  if (!existsSync(release.path)) fail("WEB_EXECUTOR_INSTALLED_RELEASE_MISSING", release.sha);
  verifyChecksums(release.path);
  const manifestPath = existsSync(path.join(release.path, "release-manifest.json"))
    ? path.join(release.path, "release-manifest.json")
    : path.join(release.path, "runtime", "release-manifest.json");
  assertReleaseManifest(manifestPath, release.sha);
}

function currentSelections(root) {
  const currentPath = realpathSync(path.join(root, "current"));
  const rollbackPath = realpathSync(path.join(root, "rollback"));
  const read = (value, code) => {
    const name = path.basename(value);
    const release = releasePath(root, name, code);
    if (release.path !== value) fail(code, value);
    return release;
  };
  return { current: read(currentPath, "WEB_EXECUTOR_CURRENT_LINK_INVALID"), rollback: read(rollbackPath, "WEB_EXECUTOR_ROLLBACK_LINK_INVALID") };
}

function httpStatus(port, pathname, token) {
  return new Promise((resolve) => {
    // Staging API middleware deliberately accepts only this dedicated header;
    // a generic Authorization bearer is not a Staging access credential.
    const request = http.get({ host: "127.0.0.1", port, path: pathname, headers: token ? { "X-MemoryAI-Staging-Access": token } : {} }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(7000, () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

function httpHealth(port, token) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/api/health", headers: token ? { "X-MemoryAI-Staging-Access": token } : {} }, (response) => {
      let body = "";
      let overflow = false;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (body.length + chunk.length > 8192) { overflow = true; response.destroy(); return; }
        body += chunk;
      });
      response.on("end", () => {
        if (overflow || response.statusCode !== 200) { resolve({ health200: false, sourceSha: null }); return; }
        try {
          const parsed = JSON.parse(body);
          resolve({ health200: parsed?.status === "ok", sourceSha: typeof parsed?.sourceSha === "string" ? parsed.sourceSha : null });
        } catch { resolve({ health200: false, sourceSha: null }); }
      });
      response.on("error", () => resolve({ health200: false, sourceSha: null }));
    });
    request.setTimeout(7000, () => { request.destroy(); resolve({ health200: false, sourceSha: null }); });
    request.on("error", () => resolve({ health200: false, sourceSha: null }));
  });
}

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function atomicLink(root, name, target) {
  const destination = path.join(root, name);
  const temporary = path.join(root, `.link-${name}-${process.pid}-${Date.now()}`);
  symlinkSync(target, temporary);
  renameSync(temporary, destination);
  syncDirectory(root);
}

function atomicSelectionPair(root, current, rollback) {
  const before = currentSelections(root);
  try {
    atomicLink(root, "current", current.path);
    atomicLink(root, "rollback", rollback.path);
    const after = currentSelections(root);
    if (after.current.sha !== current.sha || after.rollback.sha !== rollback.sha) fail("WEB_EXECUTOR_SELECTION_SWITCH_INCOMPLETE");
  } catch (error) {
    try {
      atomicLink(root, "current", before.current.path);
      atomicLink(root, "rollback", before.rollback.path);
    } catch {
      fail("WEB_EXECUTOR_SELECTION_RESTORE_FAILED");
    }
    throw error;
  }
}

function createHostOperations(plan) {
  if (process.platform !== "linux") fail("WEB_EXECUTOR_LINUX_REQUIRED", process.platform);
  const root = plan.root;
  const promotionDirectory = path.join(root, ".promotion");
  const lockDirectory = path.join(promotionDirectory, "locks");
  const journalPath = path.join(promotionDirectory, "web-immutable-events.jsonl");
  const candidatesDirectory = path.join(root, ".candidates");
  const releaseDirectory = path.join(root, "releases", plan.expectedSourceSha);
  const lockPath = path.join(lockDirectory, "memoryai-staging-web-immutable-promotion.lock");
  let candidateDirectory = null;
  let capturedPm2 = null;
  let candidateApp = candidateAppName(plan.expectedSourceSha);
  let servingRelease = null;
  const pm2Config = path.join(__dirname, "staging-web-pm2-manifest.config.cjs");

  const pm2 = (args, environment) => command("pm2", args, { env: environment });
  const pm2Environment = (release, port, appName) => {
    const {
      DASHSCOPE_API_KEY: _apiKey,
      DASHSCOPE_VOICE_CLONE_ENDPOINT: _endpoint,
      [QWEN_BETA_ENVIRONMENT_KEY]: _beta,
      ...inherited
    } = capturedPm2.environment;
    return {
      ...inherited,
      MEMORYAI_RELEASE_ROOT: path.join(release.path, "runtime"),
      MEMORYAI_RELEASE_SOURCE_SHA: release.sha,
      MEMORYAI_PM2_APP_NAME: appName,
      MEMORYAI_PORT: String(port),
      MEMORYAI_STAGING_SECRET_FILE: "/home/ubuntu/memoryai-staging/secrets/qwen-voice-clone.env",
      HOSTNAME: "127.0.0.1",
      AUTH_PROXY_LOOPBACK_ONLY: "true",
      [QWEN_BETA_ENVIRONMENT_KEY]: "false",
    };
  };
  const health = async (release, port, role) => {
    const token = capturedPm2.environment.STAGING_ACCESS_TOKEN;
    const [healthProbe, databaseHealth200] = await Promise.all([
      httpHealth(port, token),
      httpStatus(port, "/api/health/database", token),
    ]);
    let population;
    try { population = assertPm2RolePopulation(pm2Records(), role, candidateApp); } catch {
      return {
        pm2Online: false,
        pm2CwdMatchesManifest: false,
        pm2ExecMatchesRunner: false,
        manifestVerified: existsSync(path.join(release.path, "runtime", "standalone-manifest.json")),
        checksumsVerified: true,
        health200: healthProbe.health200,
        healthSourceMatchesRelease: release.sha !== plan.expectedSourceSha || healthProbe.sourceSha === release.sha,
        databaseHealth200,
        unstableRestarts: 1,
      };
    }
    const record = role === "candidate" ? population.candidate : population.serving;
    return {
      pm2Online: record.status === "online",
      pm2CwdMatchesManifest: record.cwd === path.join(release.path, "runtime"),
      pm2ExecMatchesRunner: (() => {
        try {
          assertServingPm2Identity(servingRelease ?? release, population.serving);
          if (role === "candidate") assertCandidatePm2Identity(release, record);
          else assertServingPm2Identity(release, record);
          return true;
        } catch { return false; }
      })(),
      manifestVerified: existsSync(path.join(release.path, "runtime", "standalone-manifest.json")),
      checksumsVerified: true,
      health200: healthProbe.health200,
      healthSourceMatchesRelease: release.sha !== plan.expectedSourceSha || healthProbe.sourceSha === release.sha,
      databaseHealth200,
      unstableRestarts: record.unstableRestarts,
    };
  };

  return {
    inspect: () => {
      const selections = currentSelections(root);
      verifyInstalledRelease(selections.current);
      verifyInstalledRelease(selections.rollback);
      const records = pm2Records();
      const population = assertPm2RolePopulation(records, "serving");
      capturedPm2 = population.serving;
      assertServingPm2Identity(selections.current, capturedPm2);
      servingRelease = selections.current;
      return { ...selections, pm2: capturedPm2 };
    },
    acquireLock: () => {
      mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
      const descriptor = openSync(lockPath, "wx", 0o600);
      try { writeSync(descriptor, `${JSON.stringify({ pid: process.pid, candidate: plan.expectedSourceSha, startedAt: new Date().toISOString() })}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      syncDirectory(lockDirectory);
    },
    releaseLock: () => { if (existsSync(lockPath)) { unlinkSync(lockPath); syncDirectory(lockDirectory); } },
    appendJournal: (entry) => {
      mkdirSync(promotionDirectory, { recursive: true, mode: 0o700 });
      const bytes = appendJsonLine(journalPath, entry);
      syncDirectory(promotionDirectory);
      return { journalPath, bytes };
    },
    verifyArchive: () => {
      if (!existsSync(plan.archivePath) || !lstatSync(plan.archivePath).isFile()) fail("WEB_EXECUTOR_ARCHIVE_MISSING", plan.archivePath);
      if (hashFile(plan.archivePath) !== plan.archiveSha256) fail("WEB_EXECUTOR_ARCHIVE_HASH_MISMATCH", plan.archivePath);
      const listing = command("tar", ["-tvzf", plan.archivePath]).split("\n").filter(Boolean);
      if (listing.some((line) => !/^-/.test(line) && !/^d/.test(line))) fail("WEB_EXECUTOR_ARCHIVE_LINK_OR_SPECIAL_ENTRY_FORBIDDEN");
      if (listing.some((line) => {
        const name = line.trim().split(/\s+/u).at(-1) ?? "";
        return name.startsWith("/") || name.split("/").includes("..");
      })) fail("WEB_EXECUTOR_ARCHIVE_PATH_TRAVERSAL");
      return { archiveBytes: lstatSync(plan.archivePath).size };
    },
    materialize: () => {
      if (existsSync(releaseDirectory)) fail("WEB_EXECUTOR_RELEASE_ALREADY_EXISTS", releaseDirectory);
      mkdirSync(candidatesDirectory, { recursive: true, mode: 0o700 });
      candidateDirectory = mkdtempSync(path.join(candidatesDirectory, `${plan.expectedSourceSha}.`));
      command("tar", ["-xzf", plan.archivePath, "-C", candidateDirectory]);
      const evidence = verifyBundle(candidateDirectory, plan);
      const candidateUnpackedBytes = recursiveBytes(candidateDirectory);
      const availableBytes = Number(command("df", ["-B1", "--output=avail", root]).trim().split("\n").at(-1).trim());
      const archiveBytes = lstatSync(plan.archivePath).size;
      const requiredBytes = requiredPromotionBytes(archiveBytes, candidateUnpackedBytes);
      if (!Number.isSafeInteger(availableBytes) || availableBytes < requiredBytes) {
        fail("WEB_EXECUTOR_CAPACITY_BLOCKED", `${availableBytes}<${requiredBytes}`);
      }
      renameSync(candidateDirectory, releaseDirectory);
      syncDirectory(path.dirname(releaseDirectory));
      candidateDirectory = releaseDirectory;
      return { runtimeDigest: evidence.runtimeDigest, candidateUnpackedBytes, archiveBytes, availableBytes, requiredBytes, releaseDirectory };
    },
    startCandidate: async () => {
      const candidate = { sha: plan.expectedSourceSha, path: releaseDirectory };
      pm2(["start", pm2Config, "--only", candidateApp, "--update-env"], pm2Environment(candidate, plan.candidatePort, candidateApp));
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(1000);
        const result = await health(candidate, plan.candidatePort, "candidate");
        if (result.pm2Online && result.health200 && result.databaseHealth200) return result;
      }
      return { pm2Online: false, pm2CwdMatchesManifest: false, manifestVerified: false, checksumsVerified: false, health200: false, healthSourceMatchesRelease: false, databaseHealth200: false, unstableRestarts: 1 };
    },
    stopCandidate: () => { try { pm2(["stop", candidateApp]); } catch { /* retain PM2 record and logs for diagnosis */ } },
    removeCandidate: () => { pm2(["delete", candidateApp]); },
    switchSelections: (current, rollback) => { atomicSelectionPair(root, current, rollback); },
    restoreSelections: (current, rollback) => { atomicSelectionPair(root, current, rollback); },
    startServing: async (release) => {
      const environment = pm2Environment(release, 3100, "memoryai-staging");
      for (const args of servingPm2Actions(pm2Config)) pm2(args, environment);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(1000);
        const result = await health(release, 3100, "serving");
        if (result.pm2Online && result.pm2CwdMatchesManifest && result.health200 && result.databaseHealth200 && result.unstableRestarts === 0) return result;
      }
      return { pm2Online: false, pm2CwdMatchesManifest: false, manifestVerified: false, checksumsVerified: false, health200: false, healthSourceMatchesRelease: false, databaseHealth200: false, unstableRestarts: 1 };
    },
    releaseDirectory: () => candidateDirectory,
    journalPath,
  };
}

function healthy(checks) {
  return checks?.pm2Online === true && checks?.pm2CwdMatchesManifest === true && checks?.pm2ExecMatchesRunner === true && checks?.manifestVerified === true && checks?.checksumsVerified === true && checks?.health200 === true && checks?.healthSourceMatchesRelease === true && checks?.databaseHealth200 === true && checks?.unstableRestarts === 0;
}

async function executeImmutableWebPromotion(input, operations = null) {
  const plan = assertArchiveInput(input);
  const ops = operations ?? createHostOperations(plan);
  await ops.acquireLock();
  let observed = null;
  let cutoverAttempted = false;
  let journalStarted = false;
  try {
    observed = await ops.inspect();
    if (observed.current.sha !== plan.expectedCurrentSha || observed.rollback.sha !== plan.expectedRollbackSha) {
      fail("WEB_EXECUTOR_SELECTION_DRIFT", `${observed.current.sha}:${observed.rollback.sha}`);
    }
    if (observed.current.sha === plan.expectedSourceSha || observed.rollback.sha === plan.expectedSourceSha) fail("WEB_EXECUTOR_CANDIDATE_SELECTION_COLLISION");
    const journal = (event, extra = {}) => {
      const result = ops.appendJournal({ schemaVersion: 1, component: "web", event, sourceSha: plan.expectedSourceSha, previousCurrent: observed.current.sha, rollbackBefore: observed.rollback.sha, at: new Date().toISOString(), ...extra });
      journalStarted = true;
      return result;
    };
    journal("prepared", { archiveSha256: plan.archiveSha256 });
    const archive = ops.verifyArchive();
    const materialized = ops.materialize();
    journal("candidate_materialized", { ...archive, ...materialized });
    const candidateChecks = await ops.startCandidate();
    if (!healthy(candidateChecks)) {
      ops.stopCandidate();
      journal("aborted_before_cutover", { candidateChecks, candidateRetained: true });
      return { phase: "aborted_before_cutover", current: observed.current, rollback: observed.rollback, candidateRetained: true };
    }
    ops.removeCandidate();
    cutoverAttempted = true;
    ops.switchSelections({ sha: plan.expectedSourceSha, path: `${plan.root}/releases/${plan.expectedSourceSha}` }, observed.current);
    const servingChecks = await ops.startServing({ sha: plan.expectedSourceSha, path: `${plan.root}/releases/${plan.expectedSourceSha}` });
    if (healthy(servingChecks)) {
      journal("promoted", { current: plan.expectedSourceSha, rollback: observed.current.sha, servingChecks });
      return { phase: "promoted", current: { sha: plan.expectedSourceSha }, rollback: observed.current, candidateRetained: true };
    }
    ops.restoreSelections(observed.current, observed.rollback);
    const restoredChecks = await ops.startServing(observed.current);
    ops.stopCandidate();
    if (!healthy(restoredChecks)) fail("WEB_EXECUTOR_AUTO_ROLLBACK_FAILED", observed.current.sha);
    journal("rolled_back", { current: observed.current.sha, rollback: observed.rollback.sha, servingChecks, restoredChecks, candidateRetained: true });
    cutoverAttempted = false;
    return { phase: "rolled_back", current: observed.current, rollback: observed.rollback, candidateRetained: true };
  } catch (error) {
    let recovery = null;
    if (cutoverAttempted && observed) {
      try {
        ops.restoreSelections(observed.current, observed.rollback);
        const restoredChecks = await ops.startServing(observed.current);
        ops.stopCandidate();
        if (!healthy(restoredChecks)) fail("WEB_EXECUTOR_AUTO_ROLLBACK_FAILED", observed.current.sha);
        recovery = { current: observed.current.sha, rollback: observed.rollback.sha, restoredChecks };
      } catch (restoreError) {
        try { ops.appendJournal({ schemaVersion: 1, component: "web", event: "auto_rollback_failed", sourceSha: plan.expectedSourceSha, at: new Date().toISOString(), reason: restoreError instanceof Error ? restoreError.message : "unknown", candidateRetained: true }); } catch { /* retain primary failure */ }
        fail("WEB_EXECUTOR_AUTO_ROLLBACK_FAILED", restoreError instanceof Error ? restoreError.message : "unknown");
      }
    }
    if (observed && journalStarted) {
      try { ops.appendJournal({ schemaVersion: 1, component: "web", event: "failed", sourceSha: plan.expectedSourceSha, previousCurrent: observed.current.sha, rollbackBefore: observed.rollback.sha, at: new Date().toISOString(), reason: error instanceof Error ? error.message : "unknown", recovery, candidateRetained: true }); } catch { /* retain primary failure */ }
    }
    throw error;
  } finally {
    await ops.releaseLock();
  }
}

function assertReconciliationInput(input) {
  const root = rootPath(input.remoteRoot);
  if (input.authorization !== RECONCILIATION_AUTHORIZATION) fail("WEB_RECONCILIATION_AUTHORIZATION_INVALID");
  const promotionSha = sha(input.promotionSha, "WEB_RECONCILIATION_PROMOTION_SHA_INVALID");
  const previousSha = sha(input.previousSha, "WEB_RECONCILIATION_PREVIOUS_SHA_INVALID");
  const staleRollbackSha = sha(input.staleRollbackSha, "WEB_RECONCILIATION_STALE_ROLLBACK_SHA_INVALID");
  if (input.lineageVerified !== true) fail("WEB_RECONCILIATION_LINEAGE_UNVERIFIED");
  if (!Array.isArray(input.lineage) || input.lineage.length !== RECONCILIATION_LINEAGE.length || input.lineage.some((value, index) => sha(value, "WEB_RECONCILIATION_LINEAGE_SHA_INVALID") !== RECONCILIATION_LINEAGE[index])) {
    fail("WEB_RECONCILIATION_LINEAGE_INVALID");
  }
  if (promotionSha !== RECONCILIATION_LINEAGE[2] || previousSha !== RECONCILIATION_LINEAGE[1] || staleRollbackSha !== RECONCILIATION_LINEAGE[0]) fail("WEB_RECONCILIATION_IDENTITIES_INVALID");
  return { root, promotionSha, previousSha, staleRollbackSha };
}

function reconciliationState(plan) {
  const observed = currentSelections(plan.root);
  if (observed.current.sha !== plan.promotionSha || observed.rollback.sha !== plan.previousSha) fail("WEB_RECONCILIATION_SELECTION_DRIFT");
  for (const release of [observed.current, observed.rollback, releasePath(plan.root, plan.staleRollbackSha, "WEB_RECONCILIATION_STALE_RELEASE_INVALID")]) verifyInstalledRelease(release);
  const pm2 = pm2Record();
  if (pm2.status !== "online" || pm2.unstableRestarts !== 0 || String(pm2.port) !== "3100" || pm2.execPath !== `${observed.current.path}/runtime/run-standalone-from-manifest.cjs`) fail("WEB_RECONCILIATION_PM2_DRIFT");
  return { observed, pm2 };
}

async function reconcileStagingWebHistory(input) {
  if (process.platform !== "linux") fail("WEB_EXECUTOR_LINUX_REQUIRED", process.platform);
  const plan = assertReconciliationInput(input);
  const before = reconciliationState(plan);
  const promotionDirectory = path.join(plan.root, ".promotion");
  const oldJournal = path.join(promotionDirectory, `${plan.promotionSha}.json`);
  if (!existsSync(oldJournal)) fail("WEB_RECONCILIATION_OLD_JOURNAL_MISSING", oldJournal);
  const oldJournalText = readFileSync(oldJournal, "utf8");
  const oldJournalSha256 = hashFile(oldJournal);
  const legacyJournal = parseJson(oldJournal, "WEB_RECONCILIATION_OLD_JOURNAL_INVALID");
  if (legacyJournal.previous !== plan.previousSha || legacyJournal.rollback !== plan.staleRollbackSha) fail("WEB_RECONCILIATION_OLD_JOURNAL_CONTENT_DRIFT");
  const reconciliationDirectory = path.join(promotionDirectory, "reconciliations");
  mkdirSync(reconciliationDirectory, { recursive: true, mode: 0o700 });
  const destination = path.join(reconciliationDirectory, `${plan.promotionSha}-rollback-reconciliation-v1.json`);
  const record = {
    schemaVersion: 1,
    type: "staging_web_rollback_reconciliation",
    authorization: RECONCILIATION_AUTHORIZATION,
    promotionSha: plan.promotionSha,
    actualCurrent: before.observed.current.sha,
    actualRollback: before.observed.rollback.sha,
    legacyJournalRollback: plan.staleRollbackSha,
    legacyJournalSha256: oldJournalSha256,
    legacyJournalText: oldJournalText,
    decision: "retain_actual_rollback",
    reason: "one_time_promote_68f52a7_sh_created_journal_symlink_disagreement",
    pm2: { pid: before.pm2.pid, status: before.pm2.status, port: before.pm2.port, execPath: before.pm2.execPath },
    recordedAt: new Date().toISOString(),
  };
  const appendedBytes = writeExclusiveJson(destination, record);
  syncDirectory(reconciliationDirectory);
  const after = reconciliationState(plan);
  if (after.pm2.pid !== before.pm2.pid || after.pm2.status !== before.pm2.status || after.pm2.port !== before.pm2.port || after.pm2.execPath !== before.pm2.execPath) fail("WEB_RECONCILIATION_PM2_CHANGED");
  const healthToken = before.pm2.environment.STAGING_ACCESS_TOKEN;
  const [health200, databaseHealth200] = await Promise.all([httpStatus(3100, "/api/health", healthToken), httpStatus(3100, "/api/health/database", healthToken)]);
  if (!health200 || !databaseHealth200) fail("WEB_RECONCILIATION_HEALTH_FAILED");
  return { destination, appendedBytes, oldJournalSha256, newJournalSha256: hashFile(destination), record: parseJson(destination, "WEB_RECONCILIATION_RESULT_INVALID") };
}

module.exports = {
  RECONCILIATION_AUTHORIZATION,
  RECONCILIATION_LINEAGE,
  appendJsonLine,
  assertFormalStagingRunnerWrapper,
  assertArchiveInput,
  assertReconciliationInput,
  assertCandidatePm2Identity,
  assertPm2RolePopulation,
  assertServingPm2Identity,
  candidateAppName,
  createHostOperations,
  executeImmutableWebPromotion,
  healthy,
  httpHealth,
  httpStatus,
  parsePm2Record,
  parsePm2Records,
  requiredPromotionBytes,
  reconcileStagingWebHistory,
  runtimeIdentity,
  servingPm2Actions,
  usesVersionedSecretWrapper,
  verifyChecksums,
  writeExclusiveJson,
};
