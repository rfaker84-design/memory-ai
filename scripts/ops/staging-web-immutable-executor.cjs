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
const RECONCILIATION_AUTHORIZATION = "STAGING_WEB_RECONCILIATION_AUTHORIZED_2026-08-27";
const RECONCILIATION_LINEAGE = [
  "219750eebd5bed2ef5243282be45ac0ca5220035",
  "91a844e33d18c2aa1444054b706106dd755c9895",
  "68f52a752d88c0370cc8218d6afe105a0d0545ff",
];

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
  if (candidatePort === 3100 || candidatePort > 65535) fail("WEB_EXECUTOR_CANDIDATE_PORT_INVALID", candidatePort);
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

function pm2Record(appName = "memoryai-staging") {
  const raw = command("pm2", ["jlist"]);
  let record;
  try { record = JSON.parse(raw).find((value) => value.name === appName); } catch { fail("WEB_EXECUTOR_PM2_JLIST_INVALID"); }
  if (!record) fail("WEB_EXECUTOR_PM2_APP_MISSING");
  const env = record.pm2_env ?? {};
  const currentEnv = env.env;
  if (!currentEnv || typeof currentEnv !== "object") fail("WEB_EXECUTOR_PM2_ENV_MISSING");
  return {
    pid: positive(record.pid, "WEB_EXECUTOR_PM2_PID_INVALID"),
    status: env.status,
    unstableRestarts: env.unstable_restarts,
    cwd: env.pm_cwd,
    execPath: env.pm_exec_path,
    port: currentEnv.PORT,
    environment: currentEnv,
  };
}

function usesVersionedSecretWrapper(release, execPath) {
  // The executor itself is versioned independently from the serving release.
  // A healthy current release may therefore point at a prior immutable Qwen
  // runner while a newer runner performs the next promotion.  Accept only the
  // SHA-bound tool layout, never an arbitrary wrapper path.
  return /^\/home\/ubuntu\/memoryai-staging\/tools\/qwen-e2e-[0-9a-f]{40}\/staging-web-secret-runtime-wrapper\.cjs$/iu.test(execPath ?? "")
    || execPath === `${release.path}/runtime/run-standalone-from-manifest.cjs`;
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
  let candidateApp = `memoryai-staging-candidate-${plan.expectedSourceSha.slice(0, 12)}`;
  const pm2Config = path.join(__dirname, "staging-web-pm2-manifest.config.cjs");

  const pm2 = (args, environment) => command("pm2", args, { env: environment });
  const pm2Environment = (release, port, appName) => {
    const { DASHSCOPE_API_KEY: _apiKey, DASHSCOPE_VOICE_CLONE_ENDPOINT: _endpoint, ...inherited } = capturedPm2.environment;
    return {
      ...inherited,
      MEMORYAI_RELEASE_ROOT: path.join(release.path, "runtime"),
      MEMORYAI_PM2_APP_NAME: appName,
      MEMORYAI_PORT: String(port),
      MEMORYAI_STAGING_SECRET_FILE: "/home/ubuntu/memoryai-staging/secrets/qwen-voice-clone.env",
    };
  };
  const health = async (release, port, appName) => {
    const token = capturedPm2.environment.STAGING_ACCESS_TOKEN;
    const [health200, databaseHealth200] = await Promise.all([
      httpStatus(port, "/api/health", token),
      httpStatus(port, "/api/health/database", token),
    ]);
    const record = pm2Record(appName);
    return {
      pm2Online: record.status === "online",
      pm2CwdMatchesManifest: record.cwd === path.join(release.path, "runtime"),
      pm2ExecMatchesRunner: record.execPath === path.join(__dirname, "staging-web-secret-runtime-wrapper.cjs"),
      manifestVerified: existsSync(path.join(release.path, "runtime", "standalone-manifest.json")),
      checksumsVerified: true,
      health200,
      databaseHealth200,
      unstableRestarts: record.unstableRestarts,
    };
  };

  return {
    inspect: () => {
      const selections = currentSelections(root);
      verifyInstalledRelease(selections.current);
      verifyInstalledRelease(selections.rollback);
      capturedPm2 = pm2Record();
      if (capturedPm2.status !== "online" || capturedPm2.unstableRestarts !== 0 || !usesVersionedSecretWrapper(selections.current, capturedPm2.execPath)) {
        fail("WEB_EXECUTOR_CURRENT_PM2_INVALID");
      }
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
        const result = await health(candidate, plan.candidatePort, candidateApp);
        if (result.pm2Online && result.health200 && result.databaseHealth200) return result;
      }
      return { pm2Online: false, pm2CwdMatchesManifest: false, manifestVerified: false, checksumsVerified: false, health200: false, databaseHealth200: false, unstableRestarts: 1 };
    },
    stopCandidate: () => { try { pm2(["stop", candidateApp]); } catch { /* retain PM2 record and logs for diagnosis */ } },
    switchSelections: (current, rollback) => { atomicSelectionPair(root, current, rollback); },
    restoreSelections: (current, rollback) => { atomicSelectionPair(root, current, rollback); },
    startServing: async (release) => {
      const environment = pm2Environment(release, 3100, "memoryai-staging");
      for (const args of servingPm2Actions(pm2Config)) pm2(args, environment);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(1000);
        const result = await health(release, 3100, "memoryai-staging");
        if (result.pm2Online && result.pm2CwdMatchesManifest && result.health200 && result.databaseHealth200 && result.unstableRestarts === 0) return result;
      }
      return { pm2Online: false, pm2CwdMatchesManifest: false, manifestVerified: false, checksumsVerified: false, health200: false, databaseHealth200: false, unstableRestarts: 1 };
    },
    releaseDirectory: () => candidateDirectory,
    journalPath,
  };
}

function healthy(checks) {
  return checks?.pm2Online === true && checks?.pm2CwdMatchesManifest === true && checks?.pm2ExecMatchesRunner === true && checks?.manifestVerified === true && checks?.checksumsVerified === true && checks?.health200 === true && checks?.databaseHealth200 === true && checks?.unstableRestarts === 0;
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
    cutoverAttempted = true;
    ops.switchSelections({ sha: plan.expectedSourceSha, path: `${plan.root}/releases/${plan.expectedSourceSha}` }, observed.current);
    const servingChecks = await ops.startServing({ sha: plan.expectedSourceSha, path: `${plan.root}/releases/${plan.expectedSourceSha}` });
    if (healthy(servingChecks)) {
      try { command("pm2", ["delete", `memoryai-staging-candidate-${plan.expectedSourceSha.slice(0, 12)}`]); } catch { /* serving release is already healthy */ }
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
  assertArchiveInput,
  assertReconciliationInput,
  createHostOperations,
  executeImmutableWebPromotion,
  healthy,
  httpStatus,
  requiredPromotionBytes,
  reconcileStagingWebHistory,
  runtimeIdentity,
  servingPm2Actions,
  usesVersionedSecretWrapper,
  verifyChecksums,
  writeExclusiveJson,
};
