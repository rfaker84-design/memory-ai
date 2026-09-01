"use strict";

const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  RECONCILIATION_AUTHORIZATION,
  RECONCILIATION_LINEAGE,
  appendJsonLine,
  assertArchiveInput,
  assertReconciliationInput,
  executeImmutableWebPromotion,
  httpStatus,
  requiredPromotionBytes,
  runtimeIdentity,
  servingPm2Actions,
  usesVersionedSecretWrapper,
  verifyChecksums,
  writeExclusiveJson,
} = require("./staging-web-immutable-executor.cjs");

const ROOT = "/home/ubuntu/memoryai-staging";
const CURRENT = "1111111111111111111111111111111111111111";
const ROLLBACK = "2222222222222222222222222222222222222222";
const CANDIDATE = "3333333333333333333333333333333333333333";
const HASH = "a".repeat(64);

function input(overrides = {}) {
  return {
    remoteRoot: ROOT,
    component: "web",
    expectedSourceSha: CANDIDATE,
    expectedCurrentSha: CURRENT,
    expectedRollbackSha: ROLLBACK,
    archivePath: `${ROOT}/.incoming/web/${CANDIDATE}.tar.gz`,
    archiveSha256: HASH,
    candidatePort: 3110,
    evidence: {
      "release-manifest.json": "b".repeat(64),
      "manifest.json": "c".repeat(64),
      "provenance.intoto.json": "d".repeat(64),
      "sbom.spdx.json": "e".repeat(64),
      SHA256SUMS: "f".repeat(64),
    },
    ...overrides,
  };
}

function healthy() {
  return { pm2Online: true, pm2CwdMatchesManifest: true, pm2ExecMatchesRunner: true, manifestVerified: true, checksumsVerified: true, health200: true, databaseHealth200: true, unstableRestarts: 0 };
}

function operations(calls, overrides = {}) {
  const current = { sha: CURRENT, path: `${ROOT}/releases/${CURRENT}` };
  const rollback = { sha: ROLLBACK, path: `${ROOT}/releases/${ROLLBACK}` };
  return {
    inspect: async () => ({ current, rollback, pm2: { pid: 10 } }),
    acquireLock: async () => calls.push("lock"),
    releaseLock: async () => calls.push("unlock"),
    appendJournal: (entry) => calls.push(`journal:${entry.event}`),
    verifyArchive: () => calls.push("verify-archive"),
    materialize: () => { calls.push("materialize"); return { candidateUnpackedBytes: 100, availableBytes: 9 * 1024 ** 3, requiredBytes: 8 * 1024 ** 3 }; },
    startCandidate: async () => { calls.push("candidate-health"); return healthy(); },
    stopCandidate: () => calls.push("stop-candidate"),
    switchSelections: (next, previous) => calls.push(`switch:${next.sha}:${previous.sha}`),
    restoreSelections: (previous, rollbackBefore) => calls.push(`restore:${previous.sha}:${rollbackBefore.sha}`),
    startServing: async (release) => { calls.push(`serving:${release.sha}`); return healthy(); },
    ...overrides,
  };
}

test("execute accepts only a SHA-bound archive under Staging incoming and no source directory", () => {
  const plan = assertArchiveInput(input());
  assert.equal(plan.archivePath, `${ROOT}/.incoming/web/${CANDIDATE}.tar.gz`);
  assert.throws(() => assertArchiveInput(input({ archivePath: `${ROOT}/releases/${CANDIDATE}/runtime` })), /WEB_EXECUTOR_ARCHIVE_PATH_INVALID/);
  assert.throws(() => assertArchiveInput(input({ component: "worker" })), /WEB_EXECUTOR_COMPONENT_INVALID/);
});

test("successful execute preserves archive evidence and advances rollback to prior current", async () => {
  const calls = [];
  const result = await executeImmutableWebPromotion(input(), operations(calls));
  assert.equal(result.phase, "promoted");
  assert.equal(result.current.sha, CANDIDATE);
  assert.equal(result.rollback.sha, CURRENT);
  assert.deepEqual(calls, [
    "lock", "journal:prepared", "verify-archive", "materialize", "journal:candidate_materialized", "candidate-health",
    `switch:${CANDIDATE}:${CURRENT}`, `serving:${CANDIDATE}`, "journal:promoted", "unlock",
  ]);
});

test("candidate health fault injects before cutover and leaves selected releases unchanged", async () => {
  const calls = [];
  const result = await executeImmutableWebPromotion(input(), operations(calls, {
    startCandidate: async () => { calls.push("candidate-health"); return { ...healthy(), databaseHealth200: false }; },
  }));
  assert.equal(result.phase, "aborted_before_cutover");
  assert.equal(result.current.sha, CURRENT);
  assert.equal(result.rollback.sha, ROLLBACK);
  assert.ok(!calls.some((value) => value.startsWith("switch:")));
  assert.ok(calls.includes("stop-candidate"));
});

test("serving PM2 fault restores current and rollback and retains the candidate release", async () => {
  const calls = [];
  let serving = 0;
  const result = await executeImmutableWebPromotion(input(), operations(calls, {
    startServing: async (release) => {
      calls.push(`serving:${release.sha}`);
      serving += 1;
      return serving === 1 ? { ...healthy(), pm2Online: false } : healthy();
    },
  }));
  assert.equal(result.phase, "rolled_back");
  assert.equal(result.current.sha, CURRENT);
  assert.equal(result.rollback.sha, ROLLBACK);
  assert.ok(calls.includes(`restore:${CURRENT}:${ROLLBACK}`));
  assert.ok(calls.includes("stop-candidate"));
});

test("selection drift stops before lock or journal write", async () => {
  const calls = [];
  await assert.rejects(
    executeImmutableWebPromotion(input(), operations(calls, {
      inspect: async () => ({ current: { sha: "4".repeat(40), path: `${ROOT}/releases/${"4".repeat(40)}` }, rollback: { sha: ROLLBACK, path: `${ROOT}/releases/${ROLLBACK}` } }),
    })),
    /WEB_EXECUTOR_SELECTION_DRIFT/,
  );
  assert.deepEqual(calls, ["lock", "unlock"]);
});

test("journal append fsync payloads and reconciliation records are exclusive", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-web-journal-"));
  try {
    const journal = path.join(directory, "events.jsonl");
    assert.ok(appendJsonLine(journal, { event: "prepared" }) > 0);
    assert.ok(appendJsonLine(journal, { event: "promoted" }) > 0);
    assert.equal(readFileSync(journal, "utf8").trim().split("\n").length, 2);
    const record = path.join(directory, "reconciliation.json");
    assert.ok(writeExclusiveJson(record, { decision: "retain_actual_rollback" }) > 0);
    assert.throws(() => writeExclusiveJson(record, { duplicate: true }), /EEXIST/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("capacity gate accounts for the real archive and unpacked runtime and the runtime digest is deterministic", () => {
  assert.ok(requiredPromotionBytes(1024, 2048) >= 8 * 1024 ** 3);
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-web-runtime-"));
  try {
    mkdirSync(path.join(directory, "nested"));
    writeFileSync(path.join(directory, "nested", "one.txt"), "one");
    writeFileSync(path.join(directory, "two.txt"), "two");
    assert.deepEqual(runtimeIdentity(directory), runtimeIdentity(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("checksum verification is status-only so a large valid artifact cannot overflow captured output", () => {
  const calls = [];
  verifyChecksums("/candidate", (...args) => calls.push(args));
  assert.deepEqual(calls, [[
    "sha256sum",
    ["--check", "--status", "SHA256SUMS"],
    { cwd: "/candidate", stdio: ["ignore", "ignore", "pipe"] },
  ]]);
});

test("serving cutover replaces the previous PM2 record with the release-local manifest", () => {
  assert.deepEqual(servingPm2Actions("/runner/staging-web-pm2-manifest.config.cjs"), [
    ["delete", "memoryai-staging"],
    ["start", "/runner/staging-web-pm2-manifest.config.cjs", "--only", "memoryai-staging", "--update-env"],
  ]);
});

test("a first secret-wrapper promotion accepts the legacy launcher, but candidates must use the versioned wrapper", () => {
  const release = { path: `${ROOT}/releases/${CURRENT}` };
  assert.equal(usesVersionedSecretWrapper(release, `${release.path}/runtime/run-standalone-from-manifest.cjs`), true);
  assert.equal(usesVersionedSecretWrapper(release, "/runner/staging-web-secret-runtime-wrapper.cjs"), false);
});

test("health probes send the dedicated Staging access header", async () => {
  const token = "a".repeat(48);
  const server = http.createServer((request, response) => {
    assert.equal(request.headers["x-memoryai-staging-access"], token);
    assert.equal(request.headers.authorization, undefined);
    response.writeHead(200).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.equal(await httpStatus(address.port, "/api/health", token), true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("reconciliation requires the exact Owner authorization and independently asserted lineage", () => {
  const valid = assertReconciliationInput({
    remoteRoot: ROOT,
    authorization: RECONCILIATION_AUTHORIZATION,
    promotionSha: RECONCILIATION_LINEAGE[2],
    previousSha: RECONCILIATION_LINEAGE[1],
    staleRollbackSha: RECONCILIATION_LINEAGE[0],
    lineageVerified: true,
    lineage: RECONCILIATION_LINEAGE,
  });
  assert.equal(valid.previousSha, RECONCILIATION_LINEAGE[1]);
  assert.throws(() => assertReconciliationInput({
    remoteRoot: ROOT,
    authorization: "wrong",
    promotionSha: RECONCILIATION_LINEAGE[2],
    previousSha: RECONCILIATION_LINEAGE[1],
    staleRollbackSha: RECONCILIATION_LINEAGE[0],
    lineageVerified: true,
    lineage: RECONCILIATION_LINEAGE,
  }), /WEB_RECONCILIATION_AUTHORIZATION_INVALID/);
});
