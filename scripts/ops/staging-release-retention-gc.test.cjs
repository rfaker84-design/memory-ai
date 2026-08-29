const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const path = require("node:path");

const {
  CAPACITY_FLOOR_BYTES,
  GIB,
  TARGET_BYTES,
  TRIGGER_BYTES,
  buildExecutionPlan,
  candidateIsSafe,
  exclusiveBlocksForSet,
  freedBytesForSet,
  hardlinkFilesystemScanPlan,
  parseLegacyPromotionJournal,
  parseWebImmutableEventJournal,
  remoteProgram,
  selectMinimalReleaseSet,
} = require("./staging-release-retention-gc.cjs");

function sha(value) {
  return value.toString(16).padStart(40, "0");
}

function safeCandidate(value, bytes = GIB) {
  return {
    sha: sha(value),
    path: `/home/ubuntu/memoryai-staging/releases/${sha(value)}`,
    directory: true,
    symlink: false,
    mountpoint: false,
    externalSymlink: false,
    externalHardlink: false,
    openFileDescriptor: false,
    processReference: false,
    pm2Reference: false,
    systemdReference: false,
    nginxReference: false,
    journalReference: false,
    lockReference: false,
    manifestVerified: true,
    checksumsVerified: true,
    immutable: true,
    rebuildable: true,
    gitCommitVerified: true,
    exclusiveBytes: bytes,
  };
}

function journalRow(event, sourceSha, previousCurrent, rollbackBefore, extra = {}) {
  return {
    schemaVersion: 1,
    component: "web",
    event,
    sourceSha,
    previousCurrent,
    rollbackBefore,
    at: `2026-08-29T00:00:0${extra.tick ?? 0}.000Z`,
    ...extra,
  };
}

function parseJournal(rows, currentSha, rollbackSha) {
  return parseWebImmutableEventJournal({
    text: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    fileSha256: "a".repeat(64),
    currentSha,
    rollbackSha,
    failJournal: (code, detail) => { throw new Error(`${code}${detail === undefined ? "" : `:${detail}`}`); },
  });
}

test("current, rollback, and Worker references are never eligible", () => {
  const candidate = safeCandidate(1);
  assert.equal(candidateIsSafe(candidate, new Set([candidate.sha])), false);
  assert.equal(candidateIsSafe({ ...candidate, processReference: true }), false);
  assert.equal(candidateIsSafe({ ...candidate, pm2Reference: true }), false);
});

test("symlink, mount, open-FD, journal, and lock checks fail closed", () => {
  const base = safeCandidate(2);
  for (const field of ["symlink", "mountpoint", "externalSymlink", "externalHardlink", "forbiddenPersistentFile", "openFileDescriptor", "journalReference", "lockReference"]) {
    assert.equal(candidateIsSafe({ ...base, [field]: true }), false, field);
  }
});

test("only inode blocks whose every link is selected count as reclaimable", () => {
  const selected = ["release-a", "release-b"];
  const inodes = [
    { blocks: 10, locations: ["release-a"] },
    { blocks: 20, locations: ["release-a", "release-b"] },
    { blocks: 30, locations: ["release-a", "current"] },
  ];
  assert.equal(exclusiveBlocksForSet(inodes, selected), 30);
  assert.equal(exclusiveBlocksForSet(inodes, ["release-a"]), 10);
});

test("terminal journal evidence does not permanently retain a release", () => {
  const previous = sha(1);
  const rollback = sha(2);
  const candidate = sha(3);
  const parsed = parseJournal([
    journalRow("prepared", candidate, previous, rollback, { tick: 0 }),
    journalRow("candidate_materialized", candidate, previous, rollback, { tick: 1 }),
    journalRow("promoted", candidate, previous, rollback, { current: candidate, rollback: previous, tick: 2 }),
  ], candidate, previous);
  assert.deepEqual(parsed.activeShas, []);
  assert.equal(parsed.terminal.at(-1).event, "promoted");
  assert.deepEqual(parsed.hashChain, { mode: "legacy-file-sha256-anchor", valid: true, entryHashChain: false });
});

test("journal unknown event, tampered transition, and unfinished transaction fail closed", () => {
  const previous = sha(4);
  const rollback = sha(5);
  const candidate = sha(6);
  assert.throws(() => parseJournal([journalRow("prepared", candidate, previous, rollback)], previous, rollback), /RELEASE_GC_JOURNAL_TRANSACTION_UNTERMINATED/);
  assert.throws(() => parseJournal([journalRow("mystery", candidate, previous, rollback)], previous, rollback), /RELEASE_GC_JOURNAL_EVENT_UNKNOWN/);
  assert.throws(() => parseJournal([
    journalRow("prepared", candidate, previous, rollback, { tick: 0 }),
    journalRow("promoted", candidate, previous, rollback, { current: rollback, rollback: previous, tick: 1 }),
  ], candidate, previous), /RELEASE_GC_JOURNAL_PROMOTION_INVALID/);
  assert.throws(() => parseJournal([journalRow("prepared", candidate, previous, rollback, { entryHash: "f".repeat(64) })], previous, rollback), /RELEASE_GC_JOURNAL_HASH_CHAIN_UNSUPPORTED/);
});

test("a prior auto-rollback failure must be proven recovered and legacy terminal records parse", () => {
  const previous = sha(7);
  const rollback = sha(8);
  const failedCandidate = sha(9);
  const laterCandidate = sha(10);
  const parsed = parseJournal([
    journalRow("prepared", failedCandidate, previous, rollback, { tick: 0 }),
    { schemaVersion: 1, component: "web", event: "auto_rollback_failed", sourceSha: failedCandidate, at: "2026-08-29T00:00:01.000Z" },
    journalRow("prepared", laterCandidate, previous, rollback, { tick: 2 }),
    journalRow("promoted", laterCandidate, previous, rollback, { current: laterCandidate, rollback: previous, tick: 3 }),
  ], laterCandidate, previous);
  assert.deepEqual(parsed.recoveredAutoRollbackFailures, [failedCandidate]);
  const legacy = parseLegacyPromotionJournal({ name: `${laterCandidate}.json`, fileSha256: "b".repeat(64), record: { version: 1, sourceSha: laterCandidate, previous, rollback, status: "promoted" }, failJournal: (code) => { throw new Error(code); } });
  assert.equal(legacy.status, "promoted");
  assert.throws(() => parseLegacyPromotionJournal({ name: "unknown.json", fileSha256: "c".repeat(64), record: { version: 1 }, failJournal: (code) => { throw new Error(code); } }), /RELEASE_GC_LEGACY_JOURNAL_UNKNOWN/);
});

test("a shared hardlink contributes blocks only after every release link is selected", () => {
  const first = safeCandidate(11, 0);
  const second = safeCandidate(12, 0);
  const inodes = [{ blocks: 8, locations: [first.path, second.path] }];
  assert.equal(freedBytesForSet([first], inodes), 0);
  assert.equal(freedBytesForSet([first, second], inodes), 8 * 512);
});

test("12,597 hardlinked files require one NUL-safe index scan per filesystem", () => {
  const records = Array.from({ length: 12_597 }, (_, index) => ({ mountRoot: "/", inode: index, path: `/release/${index}\nwith spaces` }));
  assert.deepEqual(hardlinkFilesystemScanPlan(records), [{ mountRoot: "/", scans: 1 }]);
  const remote = remoteProgram({ remoteRoot: "/home/ubuntu/memoryai-staging", mode: "dry-run", gitApprovedShas: [], plannedDeleteShas: [] });
  assert.match(remote, /function hardlinkFilesystemScanPlan\(candidates\)/);
  assert.match(remote, /new Map\(filesystemPlan\.map\(\(\{ mountRoot \}\) => \[mountRoot, scanHardlinkFilesystem\(mountRoot\)\]\)\)/);
  assert.match(remote, /%D\\\\0%i\\\\0%n\\\\0%b\\\\0%p\\\\0/);
  assert.match(remote, /"grep", "-r", "-l"/);
  assert.match(remote, /"readlink", "-z", "--", link/);
  assert.match(remote, /function activePromotionLockPaths\(\)/);
  assert.match(remote, /"kill", \["-0", String\(legacy\.pid\)\]/);
  assert.match(remote, /RELEASE_GC_HISTORICAL_LOCK_ACTIVE/);
  assert.match(remote, /staging_release_retention_lock_reconciliation/);
});

test("below 10 GiB selects the fewest releases needed to return to 12 GiB", () => {
  const candidates = [safeCandidate(3, 1 * GIB), safeCandidate(4, 3 * GIB), safeCandidate(5, 4 * GIB)];
  const plan = selectMinimalReleaseSet({ availableBytes: 9 * GIB, candidates });
  assert.equal(plan.triggered, true);
  assert.equal(plan.targetReached, true);
  assert.equal(plan.selected.length, 1);
  assert.equal(plan.selected[0].sha, candidates[1].sha);
  assert.equal(plan.expectedFreedBytes, 3 * GIB);
});

test("at or above 10 GiB is a true no-op", () => {
  const plan = buildExecutionPlan({ availableBytes: TRIGGER_BYTES, candidates: [safeCandidate(6)], apply: true });
  assert.equal(plan.state, "no_op");
  assert.deepEqual(plan.deletePaths, []);
});

test("dry-run plans paths but never requests deletion", () => {
  const plan = buildExecutionPlan({ availableBytes: 9 * GIB, candidates: [safeCandidate(7, 3 * GIB)], apply: false });
  assert.equal(plan.state, "dry_run");
  assert.equal(plan.deletePaths.length, 1);
});

test("insufficient safe candidates block before the formal 8 GiB floor", () => {
  const plan = selectMinimalReleaseSet({ availableBytes: 7 * GIB, candidates: [safeCandidate(8, 512 * 1024 ** 2)] });
  assert.equal(plan.targetReached, false);
  assert.equal(plan.capacityFloorReached, false);
  assert.equal(7 * GIB + plan.maximumFreedBytes < CAPACITY_FLOOR_BYTES, true);
});

test("re-running an already completed plan is idempotent", () => {
  const plan = buildExecutionPlan({ availableBytes: TARGET_BYTES, candidates: [safeCandidate(9)], apply: true });
  assert.equal(plan.state, "no_op");
  assert.equal(plan.deletePaths.length, 0);
});

test("apply is unavailable outside the formal immutable Staging promotion contract", () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, "staging-release-retention-gc.cjs"),
    "apply",
    "--pipeline-id", "staging-immutable-promotion",
    "--ssh-target", "not-contacted.invalid",
    "--remote-root", "/home/ubuntu/memoryai-staging",
    "--audit-output", path.join(__dirname, "not-created.json"),
  ], { encoding: "utf8", env: { ...process.env, STAGING_IMMUTABLE_PROMOTION: "" } });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /RELEASE_GC_APPLY_REQUIRES_STAGING_IMMUTABLE_PROMOTION/);
});

test("historical-lock reconciliation requires the dedicated Owner authorization contract", () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, "staging-release-retention-gc.cjs"),
    "reconcile",
    "--pipeline-id", "staging-immutable-promotion",
    "--ssh-target", "not-contacted.invalid",
    "--remote-root", "/home/ubuntu/memoryai-staging",
    "--audit-output", path.join(__dirname, "not-created-reconciliation.json"),
  ], { encoding: "utf8", env: { ...process.env, STAGING_RELEASE_RETENTION_RECONCILIATION: "" } });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /RELEASE_GC_RECONCILIATION_AUTHORIZATION_REQUIRED/);
});

test("missing manifest or Git evidence fails closed", () => {
  const base = safeCandidate(10);
  assert.equal(candidateIsSafe({ ...base, manifestVerified: false }), false);
  assert.equal(candidateIsSafe({ ...base, checksumsVerified: false }), false);
  assert.equal(candidateIsSafe({ ...base, gitCommitVerified: false }), false);
});
