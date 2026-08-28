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
  existingSystemdTargetReferencesCandidate,
  exclusiveBlocksForSet,
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

test("only existing systemd symlink targets can retain a release", () => {
  const candidatePath = "/home/ubuntu/memoryai-staging/releases/0000000000000000000000000000000000000002";
  assert.equal(existingSystemdTargetReferencesCandidate({ candidatePath, targetExists: false, targetPath: candidatePath }), false);
  assert.equal(existingSystemdTargetReferencesCandidate({ candidatePath, targetExists: true, targetPath: `${candidatePath}/memoryai.service` }), true);
  assert.equal(existingSystemdTargetReferencesCandidate({ candidatePath, targetExists: true, targetPath: "/etc/systemd/system/memoryai.service" }), false);
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

test("missing manifest or Git evidence fails closed", () => {
  const base = safeCandidate(10);
  assert.equal(candidateIsSafe({ ...base, manifestVerified: false }), false);
  assert.equal(candidateIsSafe({ ...base, checksumsVerified: false }), false);
  assert.equal(candidateIsSafe({ ...base, gitCommitVerified: false }), false);
});
