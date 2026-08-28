const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { SHA_PATTERN, sourceCommitSha } = require("./release-identity-manifest.cjs");

const GIB = 1024 ** 3;
const STAGING_ROOT = "/home/ubuntu/memoryai-staging";
const RELEASES_DIRECTORY = `${STAGING_ROOT}/releases`;
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

function pathIsWithin(candidatePath, targetPath) {
  return targetPath === candidatePath || targetPath.startsWith(`${candidatePath}${path.posix.sep}`);
}

// A dangling unit symlink cannot make a release live: it has no readable unit
// file or executable target.  Existing targets remain protected when they
// resolve into a candidate release.
function existingSystemdTargetReferencesCandidate({ candidatePath, targetExists, targetPath }) {
  return targetExists === true && typeof targetPath === "string" && pathIsWithin(candidatePath, targetPath);
}

function classifySystemdSymlinkTarget({ targetExists, targetPath, targetType }) {
  if (targetExists !== true) return "broken";
  if (targetPath === "/dev/null" && targetType === "character-device") return "masked";
  if (targetType === "file") return "unit";
  return "invalid";
}

function exclusiveBlocksForSet(inodes, selectedPaths) {
  const selected = new Set(selectedPaths);
  let blocks = 0;
  for (const inode of inodes) {
    if (!inode.locations.every((location) => selected.has(location))) continue;
    blocks += assertSafeInteger(inode.blocks, "RELEASE_GC_BLOCKS_INVALID");
  }
  return blocks;
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
  if (!Number.isSafeInteger(candidate.exclusiveBytes) || candidate.exclusiveBytes < 0) return false;
  return true;
}

function selectMinimalReleaseSet({ availableBytes, candidates }) {
  assertSafeInteger(availableBytes, "RELEASE_GC_AVAILABLE_INVALID");
  if (availableBytes >= TRIGGER_BYTES) {
    return { triggered: false, targetReached: true, selected: [], expectedFreedBytes: 0 };
  }
  const safe = candidates.filter((candidate) => candidateIsSafe(candidate));
  const needed = Math.max(0, TARGET_BYTES - availableBytes);
  let best = null;
  for (let count = 1; count <= safe.length; count += 1) {
    const choose = (start, selected, total) => {
      if (selected.length === count) {
        if (total < needed) return;
        const shas = selected.map((candidate) => candidate.sha).sort();
        const candidate = { selected: [...selected], total, shas };
        if (
          !best
          || candidate.total < best.total
          || (candidate.total === best.total && candidate.shas.join(",") < best.shas.join(","))
        ) best = candidate;
        return;
      }
      for (let index = start; index <= safe.length - (count - selected.length); index += 1) {
        choose(index + 1, [...selected, safe[index]], total + safe[index].exclusiveBytes);
      }
    };
    choose(0, [], 0);
    if (best) break;
  }
  if (!best) {
    const maximumFreedBytes = safe.reduce((total, candidate) => total + candidate.exclusiveBytes, 0);
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

function buildExecutionPlan({ availableBytes, candidates, apply }) {
  const selection = selectMinimalReleaseSet({ availableBytes, candidates });
  if (!selection.triggered) return { state: "no_op", deletePaths: [], ...selection };
  if (!selection.targetReached) return { state: "blocked", deletePaths: [], ...selection };
  return {
    state: apply ? "apply" : "dry_run",
    deletePaths: selection.selected.map((candidate) => candidate.path),
    ...selection,
  };
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
const { spawnSync } = require("node:child_process");

const config = JSON.parse(Buffer.from("${Buffer.from(JSON.stringify(config)).toString("base64")}", "base64").toString("utf8"));
const GIB = 1024 ** 3;
const TRIGGER_BYTES = 10 * GIB;
const TARGET_BYTES = 12 * GIB;
const CAPACITY_FLOOR_BYTES = 8 * GIB;
const SHA = /^[0-9a-f]{40}$/;
const root = "/home/ubuntu/memoryai-staging";
const releases = path.join(root, "releases");

function fail(code, detail) { const error = new Error(code + (detail ? ":" + detail : "")); error.code = code; throw error; }
function inside(base, target) { const relative = path.relative(base, target); return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); }
function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { encoding: "utf8", timeout: options.timeout || 120000 });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error ? result.error.message : null };
}
function mustCommand(commandName, args, code) {
  const result = command(commandName, args);
  if (result.error || result.status !== 0) fail(code, result.error || result.stderr.trim() || String(result.status));
  return result.stdout;
}
function sudoCommand(commandName, args, code, options = {}) {
  const result = command("sudo", ["-n", "--", commandName, ...args], options);
  if (result.error || result.status !== 0) fail(code, result.error || result.stderr.trim() || String(result.status));
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
    for (const match of found) {
      const sha = match.match(/[0-9a-f]{40}/)[0];
      protectedShas.add(sha);
    }
  }
  return protectedShas;
}
function releaseEntries() {
  return fs.readdirSync(releases, { withFileTypes: true })
    .filter((entry) => SHA.test(entry.name))
    .map((entry) => ({ sha: entry.name, path: path.join(releases, entry.name) }));
}
function grepReference(candidatePath, roots, code) {
  for (const directory of roots) {
    if (!fs.existsSync(directory)) continue;
    const result = command("grep", ["-r", "-l", "--binary-files=without-match", "--fixed-strings", "--", candidatePath, directory]);
    if (result.status === 0) return true;
    if (result.status !== 1 || result.error) fail(code, directory);
  }
  return false;
}
function inspectSystemdEntries(code) {
  const directories = ["/etc/systemd/system", "/lib/systemd/system"];
  const entries = [];
  const brokenLinks = [];
  const maskedLinks = [];
  const visit = (entryPath) => {
    let stat;
    try { stat = fs.lstatSync(entryPath); } catch (error) { fail(code, "lstat:" + entryPath + ":" + (error.code || "unknown")); }
    if (stat.isDirectory()) {
      let children;
      try { children = fs.readdirSync(entryPath); } catch (error) { fail(code, "readdir:" + entryPath + ":" + (error.code || "unknown")); }
      for (const child of children) visit(path.join(entryPath, child));
      return;
    }
    if (stat.isFile()) {
      entries.push({ path: entryPath, contentPath: entryPath });
      return;
    }
    if (!stat.isSymbolicLink()) fail(code, "entry:" + entryPath);
    let target;
    let resolvedTarget;
    try {
      target = fs.readlinkSync(entryPath);
      resolvedTarget = path.resolve(path.dirname(entryPath), target);
    } catch (error) {
      fail(code, "readlink:" + entryPath + ":" + (error.code || "unknown"));
    }
    try {
      const targetStat = fs.statSync(resolvedTarget);
      if (targetStat.isFile()) {
        entries.push({ path: entryPath, contentPath: resolvedTarget, target });
        return;
      }
      if (resolvedTarget === "/dev/null" && targetStat.isCharacterDevice()) {
        maskedLinks.push({ path: entryPath, target, resolvedTarget });
        return;
      }
      fail(code, "target-not-file:" + entryPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        brokenLinks.push({ path: entryPath, target, resolvedTarget });
        return;
      }
      fail(code, "target:" + entryPath + ":" + (error.code || "unknown"));
    }
  };
  for (const directory of directories) visit(directory);
  return { entries, brokenLinks, maskedLinks };
}
function systemdReference(candidatePath, inspection, code) {
  for (const entry of inspection.entries) {
    if (inside(candidatePath, entry.path) || inside(candidatePath, entry.contentPath)) return true;
    let content;
    try { content = fs.readFileSync(entry.contentPath, "utf8"); } catch (error) { fail(code, "read:" + entry.contentPath + ":" + (error.code || "unknown")); }
    if (content.includes(candidatePath)) return true;
  }
  return false;
}
function rootConfigReference(candidatePath, code, systemdInspection) {
  const nginx = command("sudo", ["-n", "--", "nginx", "-T"]);
  if (nginx.status !== 0 || nginx.error) fail(code, "nginx");
  if ((nginx.stdout + nginx.stderr).includes(candidatePath)) return { nginxReference: true, systemdReference: false };
  return { nginxReference: false, systemdReference: systemdReference(candidatePath, systemdInspection, code) };
}
function mountSafe(candidatePath) {
  const result = mustCommand("findmnt", ["-R", "-n", "-o", "TARGET", "--target", candidatePath], "RELEASE_GC_MOUNT_CHECK_FAILED");
  const targets = result.trim().split(/\n/).map((item) => item.trim()).filter(Boolean);
  return !targets.some((target) => target === candidatePath || target.startsWith(candidatePath + "/"));
}
function noOpenDescriptors(candidatePath) {
  const result = command("sudo", ["-n", "--", "lsof", "-nP", "+D", candidatePath], { timeout: 180000 });
  if (result.error || ![0, 1].includes(result.status)) fail("RELEASE_GC_OPEN_FD_CHECK_FAILED", candidatePath);
  return result.status === 1 && result.stdout.trim() === "";
}
function hardlinkIndex() {
  const mountRoot = mustCommand("findmnt", ["-n", "-o", "TARGET", "--target", releases], "RELEASE_GC_FILESYSTEM_ROOT_UNREADABLE").trim();
  if (!mountRoot.startsWith("/")) fail("RELEASE_GC_FILESYSTEM_ROOT_INVALID", mountRoot);
  const output = sudoCommand("find", [mountRoot, "-xdev", "-type", "f", "-links", "+1", "-printf", "%D\\t%i\\t%n\\t%b\\t%p\\0"], "RELEASE_GC_HARDLINK_INDEX_FAILED", { timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const inodes = new Map();
  for (const record of output.split("\0")) {
    if (!record) continue;
    const fields = [];
    let start = 0;
    for (let index = 0; index < 4; index += 1) {
      const separator = record.indexOf("\t", start);
      if (separator === -1) fail("RELEASE_GC_HARDLINK_INDEX_INVALID");
      fields.push(record.slice(start, separator));
      start = separator + 1;
    }
    const [dev, ino, nlink, blocks] = fields.map((value) => Number(value));
    const location = record.slice(start);
    if (![dev, ino, nlink, blocks].every(Number.isSafeInteger) || nlink <= 1 || blocks < 0 || !location.startsWith("/")) fail("RELEASE_GC_HARDLINK_INDEX_INVALID");
    const key = String(dev) + ":" + String(ino);
    const prior = inodes.get(key);
    if (prior && (prior.nlink !== nlink || prior.blocks !== blocks)) fail("RELEASE_GC_HARDLINK_INDEX_DRIFT", location);
    if (prior) prior.locations.push(location);
    else inodes.set(key, { nlink, blocks, locations: [location] });
  }
  return { mountRoot, inodes };
}
function walk(candidatePath, hardlinks) {
  const candidateReal = fs.realpathSync(candidatePath);
  let blocks = 0;
  let externalSymlink = false;
  let externalHardlink = false;
  let forbiddenPersistentFile = false;
  const inodeLocations = new Map();
  const visit = (entryPath) => {
    const stat = fs.lstatSync(entryPath);
    const name = path.basename(entryPath);
    if (stat.isFile() && (name === ".env" || name.startsWith(".env.") || /\.(pem|key|p12|pfx|sqlite|db|dump)$/i.test(name))) {
      forbiddenPersistentFile = true;
    }
    if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(entryPath);
      if (!inside(candidateReal, resolved)) externalSymlink = true;
      return;
    }
    if (stat.dev !== fs.statSync(candidateReal).dev) fail("RELEASE_GC_CHILD_MOUNTPOINT", entryPath);
    if (stat.isDirectory()) {
      blocks += Number(stat.blocks) * 512;
      for (const entry of fs.readdirSync(entryPath)) visit(path.join(entryPath, entry));
      return;
    }
    if (!stat.isFile()) {
      if (Number(stat.blocks) > 0) blocks += Number(stat.blocks) * 512;
      return;
    }
    const key = String(stat.dev) + ":" + String(stat.ino);
    if (!inodeLocations.has(key)) inodeLocations.set(key, { dev: stat.dev, ino: stat.ino, nlink: stat.nlink, blocks: Number(stat.blocks), locations: [] });
    inodeLocations.get(key).locations.push(entryPath);
  };
  visit(candidateReal);
  for (const inode of inodeLocations.values()) {
    if (inode.nlink <= 1) {
      blocks += inode.blocks * 512;
      continue;
    }
    const indexed = hardlinks.inodes.get(String(inode.dev) + ":" + String(inode.ino));
    if (!indexed || indexed.nlink !== inode.nlink || indexed.blocks !== inode.blocks || indexed.locations.length !== inode.nlink || indexed.locations.some((link) => !inside(candidateReal, link))) externalHardlink = true;
    else blocks += inode.blocks * 512;
  }
  return { exclusiveBytes: blocks, externalSymlink, externalHardlink, forbiddenPersistentFile };
}
function manifest(candidatePath, sha) {
  const identityPath = path.join(candidatePath, "release-manifest.json");
  const checksumPath = path.join(candidatePath, "SHA256SUMS");
  if (!fs.existsSync(identityPath) || !fs.existsSync(checksumPath) || !fs.lstatSync(identityPath).isFile() || !fs.lstatSync(checksumPath).isFile()) return { manifestVerified: false, checksumsVerified: false, immutable: false, rebuildable: false };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(identityPath, "utf8")); } catch { return { manifestVerified: false, checksumsVerified: false, immutable: false, rebuildable: false }; }
  const manifestVerified = parsed
    && parsed.version === 1
    && parsed.immutable === true
    && parsed.rebuildable === true
    && parsed.persistentData === false
    && parsed.noEnvironmentFiles === true
    && parsed.sourceSha === sha
    && (parsed.component === "web" || parsed.component === "worker");
  const checksumsVerified = command("bash", ["-lc", "cd -- \"$1\" && sha256sum --check SHA256SUMS >/dev/null", "release-gc", candidatePath]).status === 0;
  return { manifestVerified, checksumsVerified, immutable: manifestVerified && checksumsVerified, rebuildable: manifestVerified && checksumsVerified, sourceSha: parsed?.sourceSha || null };
}
function inspectCandidate(entry, protectedShas, systemdInspection, hardlinks) {
  const stat = fs.lstatSync(entry.path);
  const candidate = { sha: entry.sha, path: entry.path, directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), mountpoint: false, externalSymlink: false, externalHardlink: false, forbiddenPersistentFile: false, openFileDescriptor: false, processReference: protectedShas.has(entry.sha), pm2Reference: protectedShas.has(entry.sha), systemdReference: false, nginxReference: false, journalReference: false, lockReference: false, manifestVerified: false, checksumsVerified: false, immutable: false, rebuildable: false, gitCommitVerified: config.gitApprovedShas.includes(entry.sha), exclusiveBytes: 0, reasons: [] };
  if (!candidate.directory || candidate.symlink) { candidate.reasons.push("NOT_PLAIN_DIRECTORY"); return candidate; }
  candidate.mountpoint = !mountSafe(entry.path);
  if (candidate.mountpoint) candidate.reasons.push("MOUNTPOINT");
  const walked = walk(entry.path, hardlinks);
  candidate.externalSymlink = walked.externalSymlink;
  candidate.externalHardlink = walked.externalHardlink;
  candidate.forbiddenPersistentFile = walked.forbiddenPersistentFile;
  candidate.exclusiveBytes = walked.exclusiveBytes;
  if (candidate.externalSymlink) candidate.reasons.push("EXTERNAL_SYMLINK");
  if (candidate.externalHardlink) candidate.reasons.push("EXTERNAL_HARDLINK");
  if (candidate.forbiddenPersistentFile) candidate.reasons.push("PERSISTENT_OR_SECRET_FILE");
  candidate.openFileDescriptor = !noOpenDescriptors(entry.path);
  if (candidate.openFileDescriptor) candidate.reasons.push("OPEN_FD");
  candidate.journalReference = grepReference(entry.path, [path.join(root, "operations"), path.join(root, ".promotion")], "RELEASE_GC_JOURNAL_CHECK_FAILED");
  if (candidate.journalReference) candidate.reasons.push("JOURNAL_REFERENCE");
  const locks = mustCommand("find", [root, "-xdev", "-maxdepth", "3", "-type", "f", "-name", "*.lock", "-print"], "RELEASE_GC_LOCK_CHECK_FAILED").trim();
  candidate.lockReference = Boolean(locks);
  if (candidate.lockReference) candidate.reasons.push("LOCK_PRESENT");
  const serviceReferences = rootConfigReference(entry.path, "RELEASE_GC_SERVICE_REFERENCE_CHECK_FAILED", systemdInspection);
  candidate.systemdReference = serviceReferences.systemdReference;
  candidate.nginxReference = serviceReferences.nginxReference;
  if (candidate.systemdReference) candidate.reasons.push("SYSTEM_REFERENCE");
  const releaseManifest = manifest(entry.path, entry.sha);
  Object.assign(candidate, releaseManifest);
  if (!candidate.manifestVerified) candidate.reasons.push("MANIFEST_INVALID");
  if (!candidate.checksumsVerified) candidate.reasons.push("CHECKSUM_INVALID");
  if (!candidate.gitCommitVerified) candidate.reasons.push("GIT_COMMIT_UNVERIFIED");
  if (candidate.pm2Reference) candidate.reasons.push("PROCESS_REFERENCE");
  return candidate;
}
function candidateSafe(candidate) {
  return candidate.directory && !candidate.symlink && !candidate.mountpoint && !candidate.externalSymlink && !candidate.externalHardlink && !candidate.forbiddenPersistentFile && !candidate.openFileDescriptor && !candidate.processReference && !candidate.pm2Reference && !candidate.systemdReference && !candidate.nginxReference && !candidate.journalReference && !candidate.lockReference && candidate.manifestVerified && candidate.checksumsVerified && candidate.immutable && candidate.rebuildable && candidate.gitCommitVerified;
}
function select(available, candidates) {
  if (available >= TRIGGER_BYTES) return { triggered: false, targetReached: true, selected: [], expectedFreedBytes: 0 };
  const safe = candidates.filter(candidateSafe);
  const needed = TARGET_BYTES - available;
  let best = null;
  for (let count = 1; count <= safe.length; count += 1) {
    const choose = (start, selected, total) => {
      if (selected.length === count) {
        if (total < needed) return;
        const shas = selected.map((item) => item.sha).sort();
        if (!best || total < best.total || (total === best.total && shas.join(",") < best.shas.join(","))) best = { selected: [...selected], total, shas };
        return;
      }
      for (let index = start; index <= safe.length - (count - selected.length); index += 1) choose(index + 1, [...selected, safe[index]], total + safe[index].exclusiveBytes);
    };
    choose(0, [], 0);
    if (best) break;
  }
  if (!best) {
    const maximumFreedBytes = safe.reduce((sum, item) => sum + item.exclusiveBytes, 0);
    return { triggered: true, targetReached: false, selected: [], expectedFreedBytes: 0, maximumFreedBytes, capacityFloorReached: available + maximumFreedBytes >= CAPACITY_FLOOR_BYTES };
  }
  return { triggered: true, targetReached: true, selected: best.selected, expectedFreedBytes: best.total };
}
function main() {
  if (config.remoteRoot !== root) fail("RELEASE_GC_STAGING_ROOT_REQUIRED", config.remoteRoot);
  const baseline = rootState();
  const beforeBytes = availableBytes();
  const protectedShas = pm2References();
  protectedShas.add(baseline.current.sha); protectedShas.add(baseline.rollback.sha);
  const systemdInspection = inspectSystemdEntries("RELEASE_GC_SERVICE_REFERENCE_CHECK_FAILED");
  const hardlinks = hardlinkIndex();
  const systemd = { scannedEntries: systemdInspection.entries.length, brokenLinks: systemdInspection.brokenLinks, maskedLinks: systemdInspection.maskedLinks };
  if (beforeBytes >= TRIGGER_BYTES) {
    return { version: 1, mode: config.mode, state: "no_op", beforeBytes, afterBytes: beforeBytes, actualFreedBytes: 0, expectedFreedBytes: 0, current: baseline.current.sha, rollback: baseline.rollback.sha, protectedShas: [...protectedShas].sort(), systemd, candidates: [], deletedPaths: [] };
  }
  const candidates = releaseEntries().map((entry) => inspectCandidate(entry, protectedShas, systemdInspection, hardlinks));
  const plan = select(beforeBytes, candidates);
  if (!plan.targetReached) return { version: 1, mode: config.mode, state: "blocked", beforeBytes, afterBytes: beforeBytes, actualFreedBytes: 0, current: baseline.current.sha, rollback: baseline.rollback.sha, protectedShas: [...protectedShas].sort(), systemd, candidates, deletedPaths: [], plan };
  const selected = plan.selected;
  const selectedShas = selected.map((item) => item.sha).sort();
  if (config.mode === "dry-run") return { version: 1, mode: config.mode, state: "dry_run", beforeBytes, afterBytes: beforeBytes, actualFreedBytes: 0, expectedFreedBytes: plan.expectedFreedBytes, current: baseline.current.sha, rollback: baseline.rollback.sha, protectedShas: [...protectedShas].sort(), systemd, candidates, deletedPaths: [], plan: { ...plan, selected: selectedShas } };
  if (JSON.stringify(selectedShas) !== JSON.stringify([...config.plannedDeleteShas].sort())) fail("RELEASE_GC_PLAN_CHANGED");
  for (const candidate of selected) {
    const latest = inspectCandidate({ sha: candidate.sha, path: candidate.path }, protectedShas, systemdInspection, hardlinks);
    if (!candidateSafe(latest)) fail("RELEASE_GC_CANDIDATE_CHANGED", candidate.sha);
    if (fs.realpathSync(latest.path) !== latest.path || path.dirname(latest.path) !== releases || !fs.lstatSync(latest.path).isDirectory() || fs.lstatSync(latest.path).isSymbolicLink()) fail("RELEASE_GC_DELETE_TARGET_INVALID", latest.path);
    fs.rmSync(latest.path, { recursive: true, force: false, maxRetries: 0 });
  }
  const afterBytes = availableBytes();
  return { version: 1, mode: config.mode, state: "applied", beforeBytes, afterBytes, actualFreedBytes: afterBytes - beforeBytes, expectedFreedBytes: plan.expectedFreedBytes, current: baseline.current.sha, rollback: baseline.rollback.sha, protectedShas: [...protectedShas].sort(), systemd, candidates, deletedPaths: selected.map((candidate) => candidate.path), plan: { ...plan, selected: selectedShas } };
}
try { console.log(JSON.stringify(main())); } catch (error) { console.log(JSON.stringify({ version: 1, mode: config.mode, state: "blocked", error: error && error.message ? error.message : "RELEASE_GC_FAILED" })); process.exitCode = 64; }
`;
}

function executeRemote({ sshTarget, mode, gitApprovedShas, plannedDeleteShas }) {
  const program = remoteProgram({ remoteRoot: STAGING_ROOT, mode, gitApprovedShas, plannedDeleteShas });
  const result = spawnSync("ssh", [sshTarget, "node", "-"], { input: program, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) fail("RELEASE_GC_SSH_FAILED", result.error.message);
  let audit;
  try { audit = JSON.parse((result.stdout || "").trim()); } catch { fail("RELEASE_GC_REMOTE_AUDIT_INVALID", result.stderr || result.stdout); }
  if (result.status !== 0 || audit.error) fail(audit.error || "RELEASE_GC_REMOTE_BLOCKED");
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
  if (mode === "apply") {
    if (pipelineId !== PIPELINE_ID || process.env.STAGING_IMMUTABLE_PROMOTION !== "1") {
      fail("RELEASE_GC_APPLY_REQUIRES_STAGING_IMMUTABLE_PROMOTION");
    }
  }
  return { mode, sshTarget, remoteRoot, sourceRoot, auditOutput, releaseSha: releaseSha?.toLowerCase() ?? null };
}

function runReleaseRetentionGc(input) {
  const initial = executeRemote({ sshTarget: input.sshTarget, mode: "dry-run", gitApprovedShas: [], plannedDeleteShas: [] });
  if (initial.state === "no_op") return initial;
  const gitApprovedShas = initial.candidates
    .filter((candidate) => candidate.manifestVerified && candidate.checksumsVerified)
    .filter((candidate) => verifyGitCommit(input.sourceRoot, candidate.sha))
    .map((candidate) => candidate.sha);
  const planned = executeRemote({ sshTarget: input.sshTarget, mode: "dry-run", gitApprovedShas, plannedDeleteShas: [] });
  if (input.mode === "dry-run" || planned.state !== "dry_run") return planned;
  const applied = executeRemote({
    sshTarget: input.sshTarget,
    mode: "apply",
    gitApprovedShas,
    plannedDeleteShas: planned.plan.selected,
  });
  if (applied.afterBytes < TARGET_BYTES || applied.afterBytes < CAPACITY_FLOOR_BYTES) fail("RELEASE_GC_POST_APPLY_CAPACITY_INVALID");
  return applied;
}

function main(args) {
  const input = parseArgs(args);
  const toolSourceSha = sourceCommitSha(input.sourceRoot);
  if (input.releaseSha && !verifyGitCommit(input.sourceRoot, input.releaseSha)) {
    fail("RELEASE_GC_RELEASE_SHA_UNVERIFIED", input.releaseSha);
  }
  const audit = runReleaseRetentionGc(input);
  const auditPath = writeAudit(input.auditOutput, {
    ...audit,
    recordedAt: new Date().toISOString(),
    sourceRoot: input.sourceRoot,
    toolSourceSha,
    publicationSha: input.releaseSha ?? toolSourceSha,
    releasePipeline: input.mode === "apply" ? PIPELINE_ID : null,
  });
  console.log(`STAGING_RELEASE_RETENTION_${audit.state.toUpperCase()} audit=${auditPath} availableBytes=${audit.afterBytes} deleted=${audit.deletedPaths.length}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "RELEASE_GC_FAILED");
    process.exitCode = 64;
  }
}

module.exports = {
  CAPACITY_FLOOR_BYTES,
  GIB,
  PIPELINE_ID,
  STAGING_ROOT,
  TARGET_BYTES,
  TRIGGER_BYTES,
  buildExecutionPlan,
  candidateIsSafe,
  classifySystemdSymlinkTarget,
  existingSystemdTargetReferencesCandidate,
  exclusiveBlocksForSet,
  runReleaseRetentionGc,
  selectMinimalReleaseSet,
};
