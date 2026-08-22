const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createWorkerPromotion,
  executeWorkerPromotion,
  writePromotionJournal,
} = require("./staging-worker-immutable-promotion.cjs");

const CURRENT_SHA = "9eca191b348acaf10b45795563bdbf36f5e3f3ee";
const CANDIDATE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CURRENT_PATH = "/releases/" + CURRENT_SHA;
const CANDIDATE_PATH = "/releases/" + CANDIDATE_SHA;

function input(overrides = {}) {
  return {
    current: {
      sha: CURRENT_SHA,
      path: CURRENT_PATH,
      immutable: true,
      runtimeSmokeVerified: true,
      pm2Status: "online",
      unstableRestarts: 0,
    },
    candidate: {
      sha: CANDIDATE_SHA,
      path: CANDIDATE_PATH,
      immutable: true,
      artifactVerified: true,
      runtimeSmokeVerified: true,
      readyVerified: true,
    },
    pm2Cwd: CURRENT_PATH + "/worker",
    capacity: { availableBytes: 9, requiredBytes: 8 },
    promotionStartedAt: "2026-08-22T00:00:00.000Z",
    ...overrides,
  };
}

function healthyChecks() {
  return { pm2Online: true, ready: true, runtimeDependencies: true, smoke: true, unstableRestarts: 0 };
}

test("verified current without historical rollback is eligible for a Worker promotion", () => {
  const transaction = createWorkerPromotion(input());
  assert.equal(transaction.phase, "prepared");
  assert.deepEqual(transaction.previousRelease, { sha: CURRENT_SHA, path: CURRENT_PATH, immutable: true });
  assert.equal(transaction.rollbackRelease, null);
  assert.equal(transaction.pm2CwdBefore, CURRENT_PATH + "/worker");
});

test("successful Worker promotion records previous current as the rollback", async () => {
  const transaction = createWorkerPromotion(input());
  const calls = [];
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-worker-promotion-result-"));
  try {
    const journalPath = path.join(directory, "promotion.json");
    const result = await executeWorkerPromotion(transaction, {
      verifyCandidateExactArtifact: async () => { calls.push("artifact"); return true; },
      switchPm2ToCandidate: async () => { calls.push("switch-candidate"); },
      probeCandidateRuntime: async () => { calls.push("candidate-smoke"); return healthyChecks(); },
      probeRollbackRuntime: async () => { calls.push("rollback-smoke"); return true; },
      restorePm2ToPrevious: async () => { calls.push("restore-previous"); },
      probePreviousOnline: async () => { calls.push("previous-online"); return true; },
    }, { journalPath });
    assert.equal(result.phase, "promoted");
    assert.deepEqual(result.currentRelease, { sha: CANDIDATE_SHA, path: CANDIDATE_PATH, immutable: true });
    assert.deepEqual(result.rollbackRelease, { sha: CURRENT_SHA, path: CURRENT_PATH, immutable: true });
    assert.equal(JSON.parse(readFileSync(journalPath, "utf8")).rollbackRelease.sha, CURRENT_SHA);
    assert.deepEqual(calls, ["artifact", "switch-candidate", "candidate-smoke", "rollback-smoke"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("promotion journal records previous, candidate, start time, and PM2 cwd", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-worker-promotion-"));
  try {
    const transaction = createWorkerPromotion(input());
    const destination = writePromotionJournal(path.join(directory, "promotion.json"), transaction);
    const journal = JSON.parse(readFileSync(destination, "utf8"));
    assert.equal(journal.previousRelease.sha, CURRENT_SHA);
    assert.equal(journal.candidateRelease.sha, CANDIDATE_SHA);
    assert.equal(journal.promotionStartedAt, "2026-08-22T00:00:00.000Z");
    assert.equal(journal.pm2CwdBefore, CURRENT_PATH + "/worker");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed candidate runtime restores previous current and retains candidate evidence", async () => {
  const transaction = createWorkerPromotion(input());
  const calls = [];
  const result = await executeWorkerPromotion(transaction, {
    verifyCandidateExactArtifact: async () => true,
    switchPm2ToCandidate: async () => { calls.push("switch-candidate"); },
    probeCandidateRuntime: async () => ({ ...healthyChecks(), smoke: false }),
    probeRollbackRuntime: async () => true,
    restorePm2ToPrevious: async () => { calls.push("restore-previous"); },
    probePreviousOnline: async () => { calls.push("previous-online"); return true; },
  });
  assert.equal(result.phase, "rolled_back");
  assert.deepEqual(result.currentRelease, { sha: CURRENT_SHA, path: CURRENT_PATH, immutable: true });
  assert.equal(result.candidateRetained, true);
  assert.deepEqual(calls, ["switch-candidate", "restore-previous", "previous-online"]);
});

test("missing current is fail-closed unless bootstrap is explicit", () => {
  const noCurrent = input({ current: null, pm2Cwd: null });
  assert.throws(() => createWorkerPromotion(noCurrent), /WORKER_CURRENT_REQUIRED_WITHOUT_BOOTSTRAP/);
  const bootstrap = createWorkerPromotion({ ...noCurrent, bootstrap: true });
  assert.equal(bootstrap.bootstrap, true);
  assert.equal(bootstrap.previousRelease, null);
});
