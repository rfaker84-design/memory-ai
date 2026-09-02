"use strict";

const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  createWebPromotion,
  dryRun,
  executeWebPromotion,
} = require("./staging-web-immutable-promotion.cjs");

const runnerSource = readFileSync(path.join(__dirname, "staging-web-immutable-promotion.cjs"), "utf8");

const ROOT = "/home/ubuntu/memoryai-staging";
const CURRENT_SHA = "1111111111111111111111111111111111111111";
const ROLLBACK_SHA = "2222222222222222222222222222222222222222";
const CANDIDATE_SHA = "3333333333333333333333333333333333333333";
const LEGACY_JOURNAL_ROLLBACK = "4444444444444444444444444444444444444444";
const HASH = "a".repeat(64);

function release(sha, extra = {}) {
  return {
    sha,
    path: `${ROOT}/releases/${sha}`,
    immutable: true,
    checksumsVerified: true,
    manifestSourceSha: sha,
    ...extra,
  };
}

function input(overrides = {}) {
  return {
    remoteRoot: ROOT,
    current: release(CURRENT_SHA, {
      pm2Status: "online",
      unstableRestarts: 0,
      healthVerified: true,
      databaseHealthVerified: true,
    }),
    rollback: release(ROLLBACK_SHA),
    candidate: release(CANDIDATE_SHA, {
      standaloneManifestVerified: true,
      pm2ManifestLauncherVerified: true,
      artifact: {
        artifactSha256: HASH,
        evidence: {
          sha256sumsVerified: true,
          manifestSha256: "b".repeat(64),
          sbomSha256: "c".repeat(64),
          provenanceSha256: "d".repeat(64),
          manifestSourceSha: CANDIDATE_SHA,
          component: "web",
          runtimeSha256: "e".repeat(64),
          provenanceRuntimeSha256: "e".repeat(64),
        },
      },
    }),
    pm2Cwd: `${ROOT}/releases/${CURRENT_SHA}/runtime`,
    capacity: {
      availableBytes: 9 * 1024 ** 3,
      candidateUnpackedBytes: 100,
      requiredBytes: 8 * 1024 ** 3,
    },
    history: {
      journalPreviousSha: ROLLBACK_SHA,
      journalRollbackSha: ROLLBACK_SHA,
    },
    promotionStartedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

function healthy() {
  return {
    pm2Online: true,
    pm2CwdMatchesManifest: true,
    manifestVerified: true,
    checksumsVerified: true,
    health200: true,
    databaseHealth200: true,
    unstableRestarts: 0,
  };
}

function operations(calls, overrides = {}) {
  return {
    acquireLock: async () => { calls.push("lock"); return true; },
    releaseLock: async () => { calls.push("unlock"); },
    appendJournal: async (entry) => { calls.push(`journal:${entry.event}`); },
    verifyCandidateEvidence: async () => { calls.push("verify-evidence"); return true; },
    materializeImmutableRelease: async () => { calls.push("materialize"); return true; },
    startCandidateViaPm2Manifest: async () => { calls.push("candidate-pm2-manifest"); return true; },
    probeCandidateRuntime: async () => { calls.push("candidate-health"); return healthy(); },
    atomicallySwitchCurrentAndRollback: async ({ current, rollback }) => { calls.push(`switch:${current.sha}:${rollback.sha}`); },
    reloadServingPm2ViaManifest: async (target) => { calls.push(`serving-pm2-manifest:${target.sha}`); return true; },
    probeServingRuntime: async () => { calls.push("serving-health"); return healthy(); },
    atomicallyRestoreCurrentAndRollback: async ({ current, rollback }) => { calls.push(`restore:${current.sha}:${rollback.sha}`); },
    ...overrides,
  };
}

test("prepared Web promotion binds immutable artifact evidence, capacity, PM2 manifest, current, and rollback", () => {
  const transaction = createWebPromotion(input());
  assert.equal(transaction.phase, "prepared");
  assert.equal(transaction.component, "web");
  assert.equal(transaction.capacity.requiredBytes, 8 * 1024 ** 3);
  assert.equal(transaction.candidateRelease.artifact.artifactSha256, HASH);
  assert.equal(transaction.rollbackBefore.sha, ROLLBACK_SHA);
});

test("successful Web promotion uses append-only journal, atomic current/rollback selection, and PM2 manifest launcher", async () => {
  const calls = [];
  const result = await executeWebPromotion(createWebPromotion(input()), operations(calls));
  assert.equal(result.phase, "promoted");
  assert.equal(result.currentRelease.sha, CANDIDATE_SHA);
  assert.equal(result.rollbackRelease.sha, CURRENT_SHA);
  assert.deepEqual(calls, [
    "lock",
    "journal:prepared",
    "verify-evidence",
    "materialize",
    "candidate-pm2-manifest",
    "candidate-health",
    `switch:${CANDIDATE_SHA}:${CURRENT_SHA}`,
    `serving-pm2-manifest:${CANDIDATE_SHA}`,
    "serving-health",
    "journal:promoted",
    "unlock",
  ]);
});

test("fault injection before cutover keeps current and rollback untouched while retaining candidate evidence", async () => {
  const calls = [];
  const result = await executeWebPromotion(createWebPromotion(input()), operations(calls, {
    verifyCandidateEvidence: async () => { calls.push("verify-evidence"); return false; },
  }));
  assert.equal(result.phase, "aborted_before_materialization");
  assert.equal(result.currentRelease.sha, CURRENT_SHA);
  assert.equal(result.rollbackRelease.sha, ROLLBACK_SHA);
  assert.equal(result.candidateRetained, true);
  assert.deepEqual(calls, ["lock", "journal:prepared", "verify-evidence", "journal:aborted_before_materialization", "unlock"]);
});

test("fault injection after atomic cutover restores previous current and historical rollback", async () => {
  const calls = [];
  let servingProbe = 0;
  const result = await executeWebPromotion(createWebPromotion(input()), operations(calls, {
    probeServingRuntime: async () => {
      calls.push("serving-health");
      servingProbe += 1;
      return servingProbe === 1 ? { ...healthy(), health200: false } : healthy();
    },
  }));
  assert.equal(result.phase, "rolled_back");
  assert.equal(result.currentRelease.sha, CURRENT_SHA);
  assert.equal(result.rollbackRelease.sha, ROLLBACK_SHA);
  assert.ok(calls.includes(`restore:${CURRENT_SHA}:${ROLLBACK_SHA}`));
  assert.ok(calls.includes(`serving-pm2-manifest:${CURRENT_SHA}`));
  assert.deepEqual(calls.slice(-2), ["journal:rolled_back", "unlock"]);
});

test("real 68-style journal disagreement is dry-run blocked until an append-only reconciliation is verified", () => {
  const { report } = dryRun(input({
    history: {
      journalPreviousSha: ROLLBACK_SHA,
      journalRollbackSha: LEGACY_JOURNAL_ROLLBACK,
    },
  }));
  assert.equal(report.phase, "reconciliation_required");
  assert.equal(report.rollbackSha, ROLLBACK_SHA);
  assert.equal(report.history.actualRollback, ROLLBACK_SHA);
  assert.equal(report.remoteWrites, 0);
});

test("dry-run CLI remains read-only even though execute is an explicit separate command", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-web-promotion-"));
  try {
    const plan = path.join(directory, "plan.json");
    writeFileSync(plan, JSON.stringify(input({
      history: { journalPreviousSha: ROLLBACK_SHA, journalRollbackSha: LEGACY_JOURNAL_ROLLBACK },
    })));
    const result = spawnSync(process.execPath, ["staging-web-immutable-promotion.cjs", "dry-run", "--input", plan], {
      cwd: __dirname,
      encoding: "utf8",
    });
    assert.equal(result.status, 10);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "read-only");
    assert.equal(report.remoteWrites, 0);
    assert.equal(readFileSync(plan, "utf8").includes(CANDIDATE_SHA), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Web PM2 config launches the versioned secret wrapper with a release-local manifest launcher", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-web-pm2-manifest-"));
  try {
    const releaseRoot = path.join(directory, "releases", CANDIDATE_SHA, "runtime");
    mkdirSync(releaseRoot, { recursive: true });
    writeFileSync(path.join(releaseRoot, "standalone-manifest.json"), "{}\n");
    writeFileSync(path.join(releaseRoot, "run-standalone-from-manifest.cjs"), "\n");
    const config = path.join(__dirname, "staging-web-pm2-manifest.config.cjs");
    const output = spawnSync(process.execPath, ["-e", "const x=require(process.argv[1]); console.log(JSON.stringify(x.apps[0]))", config], {
      env: {
        ...process.env,
        MEMORYAI_RELEASE_ROOT: releaseRoot,
        MEMORYAI_RELEASE_SOURCE_SHA: CANDIDATE_SHA,
        MEMORYAI_PM2_APP_NAME: "memoryai-staging",
        MEMORYAI_PORT: "3100",
        MEMORYAI_STAGING_SECRET_FILE: "/home/ubuntu/memoryai-staging/secrets/qwen-voice-clone.env",
        MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "false",
      },
      encoding: "utf8",
    });
    assert.equal(output.status, 0, output.stderr);
    const app = JSON.parse(output.stdout);
    assert.equal(app.cwd, releaseRoot);
    assert.equal(app.script, path.join(__dirname, "staging-web-secret-runtime-wrapper.cjs"));
    assert.equal(app.env.PORT, "3100");
    assert.equal(app.env.AUTH_PROXY_LOOPBACK_ONLY, "true");
    assert.equal(app.env.MEMORYAI_RELEASE_SOURCE_SHA, CANDIDATE_SHA);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Web PM2 config accepts only the exact serving or SHA-derived candidate role with beta disabled", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-web-pm2-role-"));
  try {
    const releaseRoot = path.join(directory, "releases", CANDIDATE_SHA, "runtime");
    mkdirSync(releaseRoot, { recursive: true });
    writeFileSync(path.join(releaseRoot, "standalone-manifest.json"), "{}\n");
    writeFileSync(path.join(releaseRoot, "run-standalone-from-manifest.cjs"), "\n");
    const config = path.join(__dirname, "staging-web-pm2-manifest.config.cjs");
    const base = {
      ...process.env,
      MEMORYAI_RELEASE_ROOT: releaseRoot,
      MEMORYAI_RELEASE_SOURCE_SHA: CANDIDATE_SHA,
      MEMORYAI_PM2_APP_NAME: `memoryai-staging-candidate-${CANDIDATE_SHA.slice(0, 12)}`,
      MEMORYAI_PORT: "3110",
      MEMORYAI_STAGING_SECRET_FILE: "/home/ubuntu/memoryai-staging/secrets/qwen-voice-clone.env",
      MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "false",
    };
    const invoke = (overrides = {}) => spawnSync(process.execPath, ["-e", "require(process.argv[1])", config], { env: { ...base, ...overrides }, encoding: "utf8" });
    assert.equal(invoke().status, 0);
    assert.notEqual(invoke({ MEMORYAI_PORT: "3100" }).status, 0);
    assert.notEqual(invoke({ MEMORYAI_PM2_APP_NAME: "memoryai-staging-candidate-aaaaaaaaaaaa" }).status, 0);
    assert.notEqual(invoke({ MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "true" }).status, 0);
    assert.notEqual(invoke({ DASHSCOPE_API_KEY: "synthetic-only" }).status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Web runner cannot invoke a Worker helper, SSH, or a direct release write", () => {
  assert.doesNotMatch(runnerSource, /staging-worker-immutable-promotion|child_process|\bssh\b|writeFileSync|renameSync/u);
  assert.match(runnerSource, /command !== "dry-run"/);
});
