const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { SHA_PATTERN, sourceCommitSha } = require("./release-identity-manifest.cjs");

const GIB = 1024 ** 3;
const STAGING_ROOT = "/home/ubuntu/memoryai-staging";
const TRIGGER_BYTES = 10 * GIB;
const TARGET_BYTES = 12 * GIB;
const CAPACITY_FLOOR_BYTES = 8 * GIB;
const PIPELINE_ID = "staging-immutable-promotion";

function fail(code, detail) {
  const error = new Error(`${code}${detail === undefined ? "" : `:${detail}`}`);
  error.code = code;
  throw error;
}

function assertSafeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, value);
  return value;
}

function toBytes(blocks) {
  return assertSafeInteger(blocks, "RELEASE_GC_BLOCKS_INVALID") * 512;
}

function exclusiveBlocksForSet(inodes, selectedPaths) {
  const selected = new Set(selectedPaths);
  let blocks = 0;
  for (const inode of inodes) {
    if (!Array.isArray(inode.locations) || !inode.locations.every((location) => selected.has(location))) continue;
    blocks += assertSafeInteger(inode.blocks, "RELEASE_GC_BLOCKS_INVALID");
  }
  return blocks;
}

function freedBytesForSet(selected, inodes = []) {
  const ownBytes = selected.reduce((total, candidate) => total + assertSafeInteger(candidate.exclusiveBytes, "RELEASE_GC_EXCLUSIVE_BYTES_INVALID"), 0);
  return ownBytes + toBytes(exclusiveBlocksForSet(inodes, selected.map((candidate) => candidate.path)));
}

function hardlinkFilesystemScanPlan(records) {
  return [...new Set(records.filter((record) => typeof record.mountRoot === "string" && record.mountRoot.startsWith("/")).map((record) => record.mountRoot))]
    .sort()
    .map((mountRoot) => ({ mountRoot, scans: 1 }));
}

function candidateIsSafe(candidate, protectedShas = new Set()) {
  if (!SHA_PATTERN.test(candidate.sha ?? "")) return false;
  if (protectedShas.has(candidate.sha)) return false;
  if (candidate.directory !== true || candidate.symlink === true || candidate.mountpoint === true) return false;
  if (candidate.externalSymlink === true || candidate.externalHardlink === true || candidate.forbiddenPersistentFile === true) return false;
  if (candidate.openFileDescriptor === true || candidate.processReference === true) return false;
  if (candidate.pm2Reference === true || candidate.systemdReference === true || candidate.nginxReference === true) return false;
  if (candidate.journalReference === true || candidate.lockReference === true) return false;
  if (candidate.manifestVerified !== true || candidate.checksumsVerified !== true || candidate.gitCommitVerified !== true) return false;
  if (candidate.immutable !== true || candidate.rebuildable !== true) return false;
  return Number.isSafeInteger(candidate.exclusiveBytes) && candidate.exclusiveBytes >= 0;
}

function chooseMinimalReleaseSet(safe, needed, inodes) {
  let best = null;
  for (let count = 1; count <= safe.length; count += 1) {
    const choose = (start, selected) => {
      if (selected.length === count) {
        const total = freedBytesForSet(selected, inodes);
        if (total < needed) return;
        const shas = selected.map((candidate) => candidate.sha).sort();
        const candidate = { selected: [...selected], total, shas };
        if (!best || candidate.total < best.total || (candidate.total === best.total && candidate.shas.join(",") < best.shas.join(","))) best = candidate;
        return;
      }
      for (let index = start; index <= safe.length - (count - selected.length); index += 1) choose(index + 1, [...selected, safe[index]]);
    };
    choose(0, []);
    if (best) return best;
  }
  return null;
}

function selectMinimalReleaseSet({ availableBytes, candidates, inodes = [] }) {
  assertSafeInteger(availableBytes, "RELEASE_GC_AVAILABLE_INVALID");
  if (availableBytes >= TRIGGER_BYTES) return { triggered: false, targetReached: true, selected: [], expectedFreedBytes: 0 };
  const safe = candidates.filter((candidate) => candidateIsSafe(candidate));
  const best = chooseMinimalReleaseSet(safe, Math.max(0, TARGET_BYTES - availableBytes), inodes);
  if (!best) {
    const maximumFreedBytes = freedBytesForSet(safe, inodes);
    return {
      triggered: true,
      targetReached: false,
      selected: [],
      expectedFreedBytes: 0,
      maximumFreedBytes,
      capacityFloorReached: availableBytes + maximumFreedBytes >= CAPACITY_FLOOR_BYTES,
    };
  }
  return { triggered: true, targetReached: true, selected: best.selected, expectedFreedBytes: best.total };
}

function buildExecutionPlan({ availableBytes, candidates, apply, inodes = [] }) {
  const selection = selectMinimalReleaseSet({ availableBytes, candidates, inodes });
  if (!selection.triggered) return { state: "no_op", deletePaths: [], ...selection };
  if (!selection.targetReached) return { state: "blocked", deletePaths: [], ...selection };
  return { state: apply ? "apply" : "dry_run", deletePaths: selection.selected.map((candidate) => candidate.path), ...selection };
}

function option(args, name, required = false) {
  const index = args.indexOf(name);
  if (index === -1) {
    if (required) fail("RELEASE_GC_OPTION_MISSING", name);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail("RELEASE_GC_OPTION_VALUE_MISSING", name);
  return value;
}

function assertStagingRoot(value) {
  if (value !== STAGING_ROOT) fail("RELEASE_GC_STAGING_ROOT_REQUIRED", value);
  return value;
}

function verifyGitCommit(sourceRoot, sha) {
  const result = spawnSync("git", ["-C", sourceRoot, "cat-file", "-e", `${sha}^{commit}`], { encoding: "utf8" });
  return result.status === 0;
}

function remoteProgram(config) {
  return String.raw`
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const config = JSON.parse(Buffer.from("${Buffer.from(JSON.stringify(config)).toString("base64")}", "base64").toString("utf8"));
const GIB = 1024 ** 3;
const TRIGGER_BYTES = 10 * GIB;
const TARGET_BYTES = 12 * GIB;
const CAPACITY_FLOOR_BYTES = 8 * GIB;
const SHA = /^[0-9a-f]{40}$/;
const root = "/home/ubuntu/memoryai-staging";
const releases = path.join(root, "releases");
const gcLock = path.join(root, ".promotion", "release-retention-gc.lock");
const INDEX_TIMEOUT_MS = 10 * 60 * 1000;
const INDEX_MAX_BYTES = 512 * 1024 * 1024;

function fail(code, detail) { const error = new Error(code + (detail === undefined ? "" : ":" + detail)); error.code = code; throw error; }
function inside(base, target) { const relative = path.relative(base, target); return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); }
function safeNumber(value, code) { if (!Number.isSafeInteger(value) || value < 0) fail(code, value); return value; }
function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { encoding: "utf8", timeout: options.timeout || 120000, maxBuffer: options.maxBuffer || 16 * 1024 * 1024 });
  return { status: result.status, signal: result.signal || null, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error ? result.error.message : null };
}
function binaryCommand(commandName, args, options = {}) {
  const maxBuffer = options.maxBuffer || INDEX_MAX_BYTES;
  const result = spawnSync(commandName, args, { encoding: null, timeout: options.timeout || INDEX_TIMEOUT_MS, maxBuffer });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
  return { status: result.status, signal: result.signal || null, stdout, stderr, error: result.error ? result.error.message : null, maxBuffer };
}
function mustCommand(commandName, args, code, options = {}) {
  const result = command(commandName, args, options);
  if (result.error || result.signal || result.status !== 0) fail(code, result.error || result.signal || result.stderr.trim() || String(result.status));
  return result.stdout;
}
function mustBinary(commandName, args, code, options = {}) {
  const result = binaryCommand(commandName, args, options);
  if (result.error || result.signal || result.status !== 0 || result.stdout.length >= result.maxBuffer) fail(code, result.error || result.signal || result.stderr.trim() || "TRUNCATED_OR_NONZERO");
  return result.stdout;
}
function shaFromRelease(value, code) {
  const resolved = fs.realpathSync(value);
  if (!inside(releases, resolved) || path.dirname(resolved) !== releases) fail(code, resolved);
  const sha = path.basename(resolved);
  if (!SHA.test(sha)) fail(code, resolved);
  return { sha, path: resolved };
}
function availableBytes() {
  const output = mustCommand("df", ["-B1", "--output=avail", root], "RELEASE_GC_DF_FAILED").trim().split(/\n/);
  const value = output.at(-1).trim();
  if (!/^\d+$/.test(value)) fail("RELEASE_GC_DF_INVALID", value);
  return Number(value);
}
function rootState() {
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || fs.realpathSync(root) !== root) fail("RELEASE_GC_ROOT_INVALID", root);
  const releasesStat = fs.lstatSync(releases);
  if (!releasesStat.isDirectory() || releasesStat.isSymbolicLink() || fs.realpathSync(releases) !== releases) fail("RELEASE_GC_RELEASES_ROOT_INVALID", releases);
  const current = shaFromRelease(path.join(root, "current"), "RELEASE_GC_CURRENT_INVALID");
  const rollback = shaFromRelease(path.join(root, "rollback"), "RELEASE_GC_ROLLBACK_INVALID");
  if (current.sha === rollback.sha) fail("RELEASE_GC_CURRENT_ROLLBACK_NOT_DISTINCT");
  return { current, rollback };
}
function pm2References() {
  const raw = mustCommand("pm2", ["jlist"], "RELEASE_GC_PM2_UNREADABLE");
  let entries;
  try { entries = JSON.parse(raw); } catch { fail("RELEASE_GC_PM2_JSON_INVALID"); }
  const protectedShas = new Set();
  for (const entry of entries) {
    const encoded = JSON.stringify(entry);
    const found = encoded.match(/\/home\/ubuntu\/memoryai-staging\/releases\/([0-9a-f]{40})(?:\/|\")/g) || [];
    for (const match of found) protectedShas.add(match.match(/[0-9a-f]{40}/)[0]);
  }
  return [...protectedShas].sort();
}
function parseNulRecords(buffer, fieldsPerRecord, code) {
  if (!Buffer.isBuffer(buffer)) fail(code, "NOT_BUFFER");
  if (buffer.length === 0) return [];
  if (buffer.at(-1) !== 0) fail(code, "MISSING_NUL_TERMINATOR");
  const fields = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    fields.push(buffer.subarray(start, index).toString("utf8"));
    start = index + 1;
  }
  if (start !== buffer.length || fields.length % fieldsPerRecord !== 0) fail(code, "MALFORMED_NUL_RECORDS");
  const records = [];
  for (let index = 0; index < fields.length; index += fieldsPerRecord) records.push(fields.slice(index, index + fieldsPerRecord));
  return records;
}
function lockPaths() {
  const output = mustBinary("find", [root, "-xdev", "-maxdepth", "3", "-type", "f", "-name", "*.lock", "-print0"], "RELEASE_GC_LOCK_CHECK_FAILED", { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  return parseNulRecords(output, 1, "RELEASE_GC_LOCK_OUTPUT_INVALID").map((record) => record[0]).sort();
}
function releaseEntries() {
  return fs.readdirSync(releases, { withFileTypes: true }).filter((entry) => SHA.test(entry.name)).map((entry) => ({ sha: entry.name, path: path.join(releases, entry.name) })).sort((left, right) => left.sha.localeCompare(right.sha));
}
function grepReference(candidatePath, roots, code) {
  for (const directory of roots) {
    if (!fs.existsSync(directory)) continue;
    const result = command("grep", ["-r", "-l", "--binary-files=without-match", "--fixed-strings", "--", candidatePath, directory]);
    if (result.status === 0) return true;
    if (result.status !== 1 || result.error || result.signal) fail(code, directory);
  }
  return false;
}
function rootConfigReference(candidatePath, code) {
  const nginx = command("sudo", ["-n", "--", "nginx", "-T"]);
  if (nginx.status !== 0 || nginx.error || nginx.signal) fail(code, "nginx");
  if ((nginx.stdout + nginx.stderr).includes(candidatePath)) return { nginxReference: true, systemdReference: false };
  const systemd = command("sudo", ["-n", "--", "grep", "-R", "-l", "--binary-files=without-match", "--fixed-strings", "--", candidatePath, "/etc/systemd/system", "/lib/systemd/system"]);
  if (systemd.error || systemd.signal || ![0, 1].includes(systemd.status)) fail(code, "systemd");
  return { nginxReference: false, systemdReference: systemd.status === 0 };
}
function mountInfo(candidatePath) {
  const recursive = mustCommand("findmnt", ["-R", "-n", "-o", "TARGET", "--target", candidatePath], "RELEASE_GC_MOUNT_CHECK_FAILED").trim().split(/\n/).map((item) => item.trim()).filter(Boolean);
  if (recursive.some((target) => target === candidatePath || target.startsWith(candidatePath + "/"))) return { mountpoint: true, mountRoot: null };
  const mountRoot = mustCommand("findmnt", ["-n", "-o", "TARGET", "--target", candidatePath], "RELEASE_GC_FILESYSTEM_ROOT_UNREADABLE").trim();
  if (!mountRoot.startsWith("/") || !fs.existsSync(mountRoot)) fail("RELEASE_GC_FILESYSTEM_ROOT_INVALID", mountRoot);
  const candidateDev = fs.statSync(candidatePath).dev;
  if (fs.statSync(mountRoot).dev !== candidateDev) fail("RELEASE_GC_UNKNOWN_MOUNT", candidatePath);
  return { mountpoint: false, mountRoot };
}
function noOpenDescriptors(candidatePath) {
  const result = command("sudo", ["-n", "--", "lsof", "-nP", "+D", candidatePath], { timeout: 180000 });
  if (result.error || result.signal || ![0, 1].includes(result.status)) fail("RELEASE_GC_OPEN_FD_CHECK_FAILED", candidatePath);
  return result.status === 1 && result.stdout.trim() === "";
}
function walkCandidate(candidatePath, mountRoot) {
  const candidateReal = fs.realpathSync(candidatePath);
  const rootStat = fs.statSync(candidateReal);
  const device = rootStat.dev;
  const mountDevice = fs.statSync(mountRoot).dev;
  let exclusiveBytes = 0;
  let externalSymlink = false;
  let forbiddenPersistentFile = false;
  const inodes = new Map();
  const addBytes = (blocks) => { exclusiveBytes += safeNumber(Number(blocks), "RELEASE_GC_BLOCKS_INVALID") * 512; };
  const visit = (entryPath) => {
    const stat = fs.lstatSync(entryPath);
    const name = path.basename(entryPath);
    if (stat.isFile() && (name === ".env" || name.startsWith(".env.") || /\.(pem|key|p12|pfx|sqlite|db|dump)$/i.test(name))) forbiddenPersistentFile = true;
    if (stat.isSymbolicLink()) {
      try { if (!inside(candidateReal, fs.realpathSync(entryPath))) externalSymlink = true; } catch { externalSymlink = true; }
      return;
    }
    if (stat.dev !== device || stat.dev !== mountDevice) fail("RELEASE_GC_CHILD_MOUNTPOINT", entryPath);
    if (stat.isDirectory()) {
      addBytes(stat.blocks);
      for (const entry of fs.readdirSync(entryPath)) visit(path.join(entryPath, entry));
      return;
    }
    if (!stat.isFile()) { addBytes(stat.blocks); return; }
    const key = String(stat.dev) + ":" + String(stat.ino);
    const existing = inodes.get(key);
    const metadata = { key, dev: String(stat.dev), ino: String(stat.ino), nlink: safeNumber(Number(stat.nlink), "RELEASE_GC_NLINK_INVALID"), blocks: safeNumber(Number(stat.blocks), "RELEASE_GC_BLOCKS_INVALID"), locations: [] };
    if (existing && (existing.nlink !== metadata.nlink || existing.blocks !== metadata.blocks)) fail("RELEASE_GC_INODE_METADATA_DRIFT", key);
    const inode = existing || metadata;
    inode.locations.push(entryPath);
    inodes.set(key, inode);
  };
  visit(candidateReal);
  return { exclusiveBytes, externalSymlink, forbiddenPersistentFile, inodes: [...inodes.values()] };
}
function scanHardlinkFilesystem(mountRoot) {
  const output = mustBinary("sudo", ["-n", "--", "find", mountRoot, "-xdev", "-type", "f", "-links", "+1", "-printf", "%D\\0%i\\0%n\\0%b\\0%p\\0"], "RELEASE_GC_HARDLINK_INDEX_FAILED", { timeout: INDEX_TIMEOUT_MS, maxBuffer: INDEX_MAX_BYTES });
  const entries = new Map();
  for (const [dev, ino, nlink, blocks, location] of parseNulRecords(output, 5, "RELEASE_GC_HARDLINK_INDEX_OUTPUT_INVALID")) {
    if (!/^\d+$/.test(dev) || !/^\d+$/.test(ino) || !/^\d+$/.test(nlink) || !/^\d+$/.test(blocks) || !location.startsWith("/") || !inside(mountRoot, location)) fail("RELEASE_GC_HARDLINK_INDEX_RECORD_INVALID");
    const key = dev + ":" + ino;
    const metadata = { key, dev, ino, nlink: safeNumber(Number(nlink), "RELEASE_GC_NLINK_INVALID"), blocks: safeNumber(Number(blocks), "RELEASE_GC_BLOCKS_INVALID"), locations: [] };
    if (metadata.nlink < 2) fail("RELEASE_GC_HARDLINK_INDEX_RECORD_INVALID", key);
    const existing = entries.get(key);
    if (existing && (existing.nlink !== metadata.nlink || existing.blocks !== metadata.blocks)) fail("RELEASE_GC_HARDLINK_INDEX_METADATA_DRIFT", key);
    const inode = existing || metadata;
    inode.locations.push(location);
    entries.set(key, inode);
  }
  for (const inode of entries.values()) {
    inode.locations.sort();
    if (inode.locations.length !== inode.nlink) fail("RELEASE_GC_HARDLINK_COUNT_MISMATCH", inode.key);
  }
  return { mountRoot, entries };
}
function hardlinkFilesystemScanPlan(candidates) {
  return [...new Set(candidates.filter((candidate) => candidate.mountRoot).map((candidate) => candidate.mountRoot))].sort().map((mountRoot) => ({ mountRoot, scans: 1 }));
}
function hashInodeIndex(indexes) {
  const rows = [];
  for (const index of [...indexes.values()].sort((left, right) => left.mountRoot.localeCompare(right.mountRoot))) {
    for (const inode of [...index.entries.values()].sort((left, right) => left.key.localeCompare(right.key))) rows.push([index.mountRoot, inode.key, inode.nlink, inode.blocks, inode.locations]);
  }
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
function releaseRootFor(location, knownReleasePaths) {
  if (!inside(releases, location)) return null;
  const relative = path.relative(releases, location);
  const first = relative.split(path.sep)[0];
  if (!SHA.test(first)) return null;
  const releasePath = path.join(releases, first);
  return knownReleasePaths.has(releasePath) && inside(releasePath, location) ? releasePath : null;
}
function finaliseHardlinkAccounting(candidates, indexes) {
  const knownReleasePaths = new Set(candidates.map((candidate) => candidate.path));
  const inodes = new Map();
  for (const candidate of candidates) {
    if (!candidate.walked) continue;
    for (const inode of candidate.walked.inodes) {
      if (inode.nlink <= 1) { candidate.exclusiveBytes += inode.blocks * 512; continue; }
      const index = indexes.get(candidate.mountRoot);
      const indexed = index && index.entries.get(inode.key);
      if (!indexed || indexed.nlink !== inode.nlink || indexed.blocks !== inode.blocks || indexed.locations.length !== inode.nlink) fail("RELEASE_GC_HARDLINK_COUNT_MISMATCH", inode.key);
      const releaseLocations = new Set();
      for (const location of indexed.locations) {
        const releasePath = releaseRootFor(location, knownReleasePaths);
        if (!releasePath) { candidate.externalHardlink = true; break; }
        releaseLocations.add(releasePath);
      }
      if (candidate.externalHardlink) continue;
      const managed = { key: candidate.mountRoot + ":" + inode.key, blocks: inode.blocks, locations: [...releaseLocations].sort() };
      const existing = inodes.get(managed.key);
      if (existing && (existing.blocks !== managed.blocks || JSON.stringify(existing.locations) !== JSON.stringify(managed.locations))) fail("RELEASE_GC_HARDLINK_INDEX_METADATA_DRIFT", managed.key);
      inodes.set(managed.key, managed);
    }
    delete candidate.walked;
  }
  return [...inodes.values()];
}
function manifest(candidatePath, sha) {
  const identityPath = path.join(candidatePath, "release-manifest.json");
  const checksumPath = path.join(candidatePath, "SHA256SUMS");
  if (!fs.existsSync(identityPath) || !fs.existsSync(checksumPath) || !fs.lstatSync(identityPath).isFile() || !fs.lstatSync(checksumPath).isFile()) return { manifestVerified: false, checksumsVerified: false, immutable: false, rebuildable: false };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(identityPath, "utf8")); } catch { return { manifestVerified: false, checksumsVerified: false, immutable: false, rebuildable: false }; }
  const manifestVerified = parsed && parsed.version === 1 && parsed.immutable === true && parsed.rebuildable === true && parsed.persistentData === false && parsed.noEnvironmentFiles === true && parsed.sourceSha === sha && (parsed.component === "web" || parsed.component === "worker");
  const checksumsVerified = command("bash", ["-lc", "cd -- \"$1\" && sha256sum --check SHA256SUMS >/dev/null", "release-gc", candidatePath], { timeout: INDEX_TIMEOUT_MS }).status === 0;
  return { manifestVerified, checksumsVerified, immutable: manifestVerified && checksumsVerified, rebuildable: manifestVerified && checksumsVerified, sourceSha: parsed?.sourceSha || null };
}
function inspectCandidate(entry, protectedShas, locks) {
  const stat = fs.lstatSync(entry.path);
  const candidate = { sha: entry.sha, path: entry.path, directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), mountpoint: false, mountRoot: null, externalSymlink: false, externalHardlink: false, forbiddenPersistentFile: false, openFileDescriptor: false, processReference: protectedShas.includes(entry.sha), pm2Reference: protectedShas.includes(entry.sha), systemdReference: false, nginxReference: false, journalReference: false, lockReference: locks.length > 0, manifestVerified: false, checksumsVerified: false, immutable: false, rebuildable: false, gitCommitVerified: config.gitApprovedShas.includes(entry.sha), exclusiveBytes: 0, reasons: [] };
  if (!candidate.directory || candidate.symlink) { candidate.reasons.push("NOT_PLAIN_DIRECTORY"); return candidate; }
  const mounted = mountInfo(entry.path);
  candidate.mountpoint = mounted.mountpoint;
  candidate.mountRoot = mounted.mountRoot;
  if (candidate.mountpoint) { candidate.reasons.push("MOUNTPOINT"); return candidate; }
  candidate.walked = walkCandidate(entry.path, candidate.mountRoot);
  candidate.externalSymlink = candidate.walked.externalSymlink;
  candidate.forbiddenPersistentFile = candidate.walked.forbiddenPersistentFile;
  candidate.exclusiveBytes = candidate.walked.exclusiveBytes;
  if (candidate.externalSymlink) candidate.reasons.push("EXTERNAL_SYMLINK");
  if (candidate.forbiddenPersistentFile) candidate.reasons.push("PERSISTENT_OR_SECRET_FILE");
  candidate.openFileDescriptor = !noOpenDescriptors(entry.path);
  if (candidate.openFileDescriptor) candidate.reasons.push("OPEN_FD");
  candidate.journalReference = grepReference(entry.path, [path.join(root, "operations"), path.join(root, ".promotion")], "RELEASE_GC_JOURNAL_CHECK_FAILED");
  if (candidate.journalReference) candidate.reasons.push("JOURNAL_REFERENCE");
  if (candidate.lockReference) candidate.reasons.push("LOCK_PRESENT");
  const serviceReferences = rootConfigReference(entry.path, "RELEASE_GC_SERVICE_REFERENCE_CHECK_FAILED");
  candidate.systemdReference = serviceReferences.systemdReference;
  candidate.nginxReference = serviceReferences.nginxReference;
  if (candidate.systemdReference || candidate.nginxReference) candidate.reasons.push("SYSTEM_REFERENCE");
  const releaseManifest = manifest(entry.path, entry.sha);
  Object.assign(candidate, releaseManifest);
  if (!candidate.manifestVerified) candidate.reasons.push("MANIFEST_INVALID");
  if (!candidate.checksumsVerified) candidate.reasons.push("CHECKSUM_INVALID");
  if (!candidate.gitCommitVerified) candidate.reasons.push("GIT_COMMIT_UNVERIFIED");
  if (candidate.pm2Reference) candidate.reasons.push("PROCESS_REFERENCE");
  return candidate;
}
function candidateSafe(candidate) {
  return candidate.directory && !candidate.symlink && !candidate.mountpoint && !candidate.externalSymlink && !candidate.externalHardlink && !candidate.forbiddenPersistentFile && !candidate.openFileDescriptor && !candidate.processReference && !candidate.pm2Reference && !candidate.systemdReference && !candidate.nginxReference && !candidate.journalReference && !candidate.lockReference && candidate.manifestVerified && candidate.checksumsVerified && candidate.immutable && candidate.rebuildable && candidate.gitCommitVerified && Number.isSafeInteger(candidate.exclusiveBytes) && candidate.exclusiveBytes >= 0;
}
function blocksForSet(inodes, selectedPaths) {
  const selected = new Set(selectedPaths);
  return inodes.reduce((total, inode) => total + (inode.locations.every((location) => selected.has(location)) ? inode.blocks : 0), 0);
}
function freedBytesForSet(selected, inodes) { return selected.reduce((total, candidate) => total + candidate.exclusiveBytes, 0) + blocksForSet(inodes, selected.map((candidate) => candidate.path)) * 512; }
function choose(safe, needed, inodes) {
  let best = null;
  for (let count = 1; count <= safe.length; count += 1) {
    const chooseSubset = (start, selected) => {
      if (selected.length === count) {
        const total = freedBytesForSet(selected, inodes);
        if (total < needed) return;
        const shas = selected.map((item) => item.sha).sort();
        if (!best || total < best.total || (total === best.total && shas.join(",") < best.shas.join(","))) best = { selected: [...selected], total, shas };
        return;
      }
      for (let index = start; index <= safe.length - (count - selected.length); index += 1) chooseSubset(index + 1, [...selected, safe[index]]);
    };
    chooseSubset(0, []);
    if (best) return best;
  }
  return null;
}
function select(available, candidates, inodes) {
  if (available >= TRIGGER_BYTES) return { triggered: false, targetReached: true, selected: [], expectedFreedBytes: 0 };
  const safe = candidates.filter(candidateSafe);
  const best = choose(safe, TARGET_BYTES - available, inodes);
  if (!best) {
    const maximumFreedBytes = freedBytesForSet(safe, inodes);
    return { triggered: true, targetReached: false, selected: [], expectedFreedBytes: 0, maximumFreedBytes, capacityFloorReached: available + maximumFreedBytes >= CAPACITY_FLOOR_BYTES };
  }
  return { triggered: true, targetReached: true, selected: best.selected, expectedFreedBytes: best.total };
}
function sameArray(left, right) { return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort()); }
function assertExpectedSnapshot(baseline, protectedShas, locks) {
  if (config.mode !== "apply") return;
  if (config.expectedCurrent !== baseline.current.sha || config.expectedRollback !== baseline.rollback.sha) fail("RELEASE_GC_SELECTION_DRIFT");
  if (!sameArray(config.expectedProtectedShas || [], protectedShas) || !sameArray(config.expectedLocks || [], locks)) fail("RELEASE_GC_SELECTION_DRIFT");
}
function acquireApplyLock() {
  if (lockPaths().length !== 0) fail("RELEASE_GC_LOCK_PRESENT");
  let descriptor;
  try { descriptor = fs.openSync(gcLock, "wx", 0o600); fs.writeFileSync(descriptor, String(process.pid) + "\n"); }
  catch (error) { fail("RELEASE_GC_LOCK_ACQUIRE_FAILED", error && error.code ? error.code : "UNKNOWN"); }
  return () => { try { fs.closeSync(descriptor); } finally { try { fs.unlinkSync(gcLock); } catch {} } };
}
function runInspection() {
  const baseline = rootState();
  const protectedShas = pm2References();
  protectedShas.push(baseline.current.sha, baseline.rollback.sha);
  const uniqueProtectedShas = [...new Set(protectedShas)].sort();
  const locks = lockPaths().filter((lock) => lock !== gcLock);
  assertExpectedSnapshot(baseline, uniqueProtectedShas, locks);
  const entries = releaseEntries();
  const candidates = entries.map((entry) => inspectCandidate(entry, uniqueProtectedShas, locks));
  const filesystemPlan = hardlinkFilesystemScanPlan(candidates);
  const indexes = new Map(filesystemPlan.map(({ mountRoot }) => [mountRoot, scanHardlinkFilesystem(mountRoot)]));
  const inodes = finaliseHardlinkAccounting(candidates, indexes);
  const inodeIndexDigest = hashInodeIndex(indexes);
  if (config.mode === "apply" && config.expectedInodeIndexDigest !== inodeIndexDigest) fail("RELEASE_GC_INODE_INDEX_DRIFT");
  for (const candidate of candidates) {
    if (candidate.externalHardlink) candidate.reasons.push("EXTERNAL_HARDLINK");
    delete candidate.mountRoot;
  }
  return { baseline, protectedShas: uniqueProtectedShas, locks, candidates, inodes, inodeIndexDigest, hardlinkIndex: { filesystems: filesystemPlan.map(({ mountRoot, scans }) => ({ mountRoot, scans, entries: indexes.get(mountRoot).entries.size })), scanCount: filesystemPlan.length } };
}
function inventory() {
  const baseline = rootState();
  const protectedShas = [...new Set([...pm2References(), baseline.current.sha, baseline.rollback.sha])].sort();
  return { version: 2, mode: "inventory", state: "inventory", current: baseline.current.sha, rollback: baseline.rollback.sha, protectedShas, locks: lockPaths(), releaseShas: releaseEntries().map((entry) => entry.sha) };
}
function main() {
  if (config.remoteRoot !== root) fail("RELEASE_GC_STAGING_ROOT_REQUIRED", config.remoteRoot);
  if (config.mode === "inventory") return inventory();
  let releaseApplyLock = null;
  try {
    if (config.mode === "apply") releaseApplyLock = acquireApplyLock();
    const inspected = runInspection();
    const beforeBytes = availableBytes();
    if (beforeBytes >= TRIGGER_BYTES) return { version: 2, mode: config.mode, state: "no_op", beforeBytes, afterBytes: beforeBytes, actualFreedBytes: 0, expectedFreedBytes: 0, current: inspected.baseline.current.sha, rollback: inspected.baseline.rollback.sha, protectedShas: inspected.protectedShas, locks: inspected.locks, candidates: [], deletedPaths: [], inodeIndexDigest: inspected.inodeIndexDigest, hardlinkIndex: inspected.hardlinkIndex };
    const plan = select(beforeBytes, inspected.candidates, inspected.inodes);
    if (!plan.targetReached) return { version: 2, mode: config.mode, state: "blocked", beforeBytes, afterBytes: beforeBytes, actualFreedBytes: 0, current: inspected.baseline.current.sha, rollback: inspected.baseline.rollback.sha, protectedShas: inspected.protectedShas, locks: inspected.locks, candidates: inspected.candidates, deletedPaths: [], plan, inodeIndexDigest: inspected.inodeIndexDigest, hardlinkIndex: inspected.hardlinkIndex };
    const selected = plan.selected;
    const selectedShas = selected.map((item) => item.sha).sort();
    if (config.mode === "dry-run") return { version: 2, mode: config.mode, state: "dry_run", beforeBytes, afterBytes: beforeBytes, actualFreedBytes: 0, expectedFreedBytes: plan.expectedFreedBytes, current: inspected.baseline.current.sha, rollback: inspected.baseline.rollback.sha, protectedShas: inspected.protectedShas, locks: inspected.locks, candidates: inspected.candidates, deletedPaths: [], plan: { ...plan, selected: selectedShas }, inodeIndexDigest: inspected.inodeIndexDigest, hardlinkIndex: inspected.hardlinkIndex };
    if (JSON.stringify(selectedShas) !== JSON.stringify([...(config.plannedDeleteShas || [])].sort())) fail("RELEASE_GC_PLAN_CHANGED");
    for (const candidate of selected) {
      if (!candidateSafe(candidate) || fs.realpathSync(candidate.path) !== candidate.path || path.dirname(candidate.path) !== releases || !fs.lstatSync(candidate.path).isDirectory() || fs.lstatSync(candidate.path).isSymbolicLink()) fail("RELEASE_GC_DELETE_TARGET_INVALID", candidate.sha);
      fs.rmSync(candidate.path, { recursive: true, force: false, maxRetries: 0 });
    }
    const afterBytes = availableBytes();
    return { version: 2, mode: config.mode, state: "applied", beforeBytes, afterBytes, actualFreedBytes: afterBytes - beforeBytes, expectedFreedBytes: plan.expectedFreedBytes, current: inspected.baseline.current.sha, rollback: inspected.baseline.rollback.sha, protectedShas: inspected.protectedShas, locks: inspected.locks, candidates: inspected.candidates, deletedPaths: selected.map((candidate) => candidate.path), plan: { ...plan, selected: selectedShas }, inodeIndexDigest: inspected.inodeIndexDigest, hardlinkIndex: inspected.hardlinkIndex };
  } finally { if (releaseApplyLock) releaseApplyLock(); }
}
try { console.log(JSON.stringify(main())); } catch (error) { console.log(JSON.stringify({ version: 2, mode: config.mode, state: "blocked", error: error && error.message ? error.message : "RELEASE_GC_FAILED" })); process.exitCode = 64; }
`;
}

function executeRemote({ sshTarget, mode, gitApprovedShas = [], plannedDeleteShas = [], expectedSnapshot = null }) {
  const program = remoteProgram({ remoteRoot: STAGING_ROOT, mode, gitApprovedShas, plannedDeleteShas, ...(expectedSnapshot || {}) });
  const result = spawnSync("ssh", [sshTarget, "node", "-"], { input: program, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  let audit;
  try { audit = JSON.parse((result.stdout || "").trim()); } catch { fail("RELEASE_GC_REMOTE_AUDIT_INVALID", result.stderr || result.stdout); }
  if (result.error || result.status !== 0 || audit.error || audit.state === "blocked" && audit.error) fail(audit.error || "RELEASE_GC_REMOTE_BLOCKED");
  return audit;
}

function writeAudit(file, audit) {
  const resolved = path.resolve(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 });
  return resolved;
}

function parseArgs(args) {
  const mode = args.shift() ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply") fail("RELEASE_GC_MODE_INVALID", mode);
  const sshTarget = option(args, "--ssh-target", true);
  const remoteRoot = assertStagingRoot(option(args, "--remote-root", true));
  const sourceRoot = path.resolve(option(args, "--source-root", false) ?? path.resolve(__dirname, "../.."));
  const auditOutput = option(args, "--audit-output", true);
  const pipelineId = option(args, "--pipeline-id", false);
  const releaseSha = option(args, "--release-sha", false);
  if (!existsSync(sourceRoot)) fail("RELEASE_GC_SOURCE_ROOT_MISSING", sourceRoot);
  if (releaseSha && !SHA_PATTERN.test(releaseSha)) fail("RELEASE_GC_RELEASE_SHA_INVALID", releaseSha);
  if (mode === "apply" && (pipelineId !== PIPELINE_ID || process.env.STAGING_IMMUTABLE_PROMOTION !== "1")) fail("RELEASE_GC_APPLY_REQUIRES_STAGING_IMMUTABLE_PROMOTION");
  return { mode, sshTarget, remoteRoot, sourceRoot, auditOutput, releaseSha: releaseSha?.toLowerCase() ?? null };
}

function runReleaseRetentionGc(input) {
  const inventory = executeRemote({ sshTarget: input.sshTarget, mode: "inventory" });
  const gitApprovedShas = inventory.releaseShas.filter((sha) => verifyGitCommit(input.sourceRoot, sha));
  const planned = executeRemote({ sshTarget: input.sshTarget, mode: "dry-run", gitApprovedShas });
  if (input.mode === "dry-run" || planned.state !== "dry_run") return planned;
  const expectedSnapshot = { expectedCurrent: planned.current, expectedRollback: planned.rollback, expectedProtectedShas: planned.protectedShas, expectedLocks: planned.locks, expectedInodeIndexDigest: planned.inodeIndexDigest };
  const applied = executeRemote({ sshTarget: input.sshTarget, mode: "apply", gitApprovedShas, plannedDeleteShas: planned.plan.selected, expectedSnapshot });
  if (applied.afterBytes < TARGET_BYTES || applied.afterBytes < CAPACITY_FLOOR_BYTES) fail("RELEASE_GC_POST_APPLY_CAPACITY_INVALID");
  return applied;
}

function main(args) {
  const input = parseArgs(args);
  const toolSourceSha = sourceCommitSha(input.sourceRoot);
  if (input.releaseSha && !verifyGitCommit(input.sourceRoot, input.releaseSha)) fail("RELEASE_GC_RELEASE_SHA_UNVERIFIED", input.releaseSha);
  const audit = runReleaseRetentionGc(input);
  const auditPath = writeAudit(input.auditOutput, { ...audit, recordedAt: new Date().toISOString(), sourceRoot: input.sourceRoot, toolSourceSha, publicationSha: input.releaseSha ?? toolSourceSha, releasePipeline: input.mode === "apply" ? PIPELINE_ID : null });
  console.log(`STAGING_RELEASE_RETENTION_${audit.state.toUpperCase()} audit=${auditPath} availableBytes=${audit.afterBytes ?? "n/a"} deleted=${audit.deletedPaths?.length ?? 0}`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : "RELEASE_GC_FAILED"); process.exitCode = 64; }
}

module.exports = { CAPACITY_FLOOR_BYTES, GIB, PIPELINE_ID, STAGING_ROOT, TARGET_BYTES, TRIGGER_BYTES, buildExecutionPlan, candidateIsSafe, exclusiveBlocksForSet, freedBytesForSet, hardlinkFilesystemScanPlan, remoteProgram, runReleaseRetentionGc, selectMinimalReleaseSet };
