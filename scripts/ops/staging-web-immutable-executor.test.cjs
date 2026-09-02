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
  assertFormalStagingRunnerWrapper,
  assertArchiveInput,
  assertCandidatePm2Identity,
  assertPm2RolePopulation,
  assertReconciliationInput,
  assertServingPm2Identity,
  candidateAppName,
  executeImmutableWebPromotion,
  httpHealth,
  httpStatus,
  requiredPromotionBytes,
  runtimeIdentity,
  parsePm2Record,
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
const FORMAL_RUNNER = "5a8ae44b4e066d5e624cb5ca142ff0339663aa2f";
const FORMAL_WRAPPER_HASH = "e1f6b46df71a460d0afc6f18f709ea6fd22df71672a5992c4a1ed7ea10c46b16";

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
  return { pm2Online: true, pm2CwdMatchesManifest: true, pm2ExecMatchesRunner: true, manifestVerified: true, checksumsVerified: true, health200: true, healthSourceMatchesRelease: true, databaseHealth200: true, unstableRestarts: 0 };
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
    removeCandidate: () => calls.push("remove-candidate"),
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
    "remove-candidate", `switch:${CANDIDATE}:${CURRENT}`, `serving:${CANDIDATE}`, "journal:promoted", "unlock",
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

function privateMetadata(type = "file", overrides = {}) {
  return {
    uid: 1000,
    gid: 1000,
    mode: type === "directory" ? 0o40700 : 0o100600,
    nlink: type === "directory" ? 2 : 1,
    dev: 700,
    isFile: () => type === "file",
    isDirectory: () => type === "directory",
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function formalWrapperFixture(release, overrides = {}) {
  const runner = `${ROOT}/tools/staging-web-immutable-runner-${FORMAL_RUNNER}`;
  const wrapper = `${runner}/staging-web-secret-runtime-wrapper.cjs`;
  const launcher = `${release.path}/runtime/run-standalone-from-manifest.cjs`;
  const metadata = new Map([
    [ROOT, privateMetadata("directory", { mode: 0o40700, nlink: 23 })],
    [`${ROOT}/tools`, privateMetadata("directory", { mode: 0o40755, nlink: 17 })],
    [runner, privateMetadata("directory")],
    [wrapper, privateMetadata("file")],
    [launcher, privateMetadata("file")],
  ]);
  return {
    wrapper,
    dependencies: {
      root: ROOT,
      expectedUid: 1000,
      expectedGid: 1000,
      lstatSync: (target) => {
        if (!metadata.has(target)) throw new Error("ENOENT");
        return metadata.get(target);
      },
      realpathSync: (target) => target,
      hashFile: (target) => target === wrapper ? FORMAL_WRAPPER_HASH : HASH,
      readMountInfo: () => "",
      ...overrides,
    },
  };
}

test("a promotion accepts only a private, nlink=2 formal Staging runner wrapper or the legacy launcher", () => {
  const release = { path: `${ROOT}/releases/${CURRENT}` };
  assert.equal(usesVersionedSecretWrapper(release, `${release.path}/runtime/run-standalone-from-manifest.cjs`), true);
  const fixture = formalWrapperFixture(release);
  assert.deepEqual(assertFormalStagingRunnerWrapper(release, fixture.wrapper, fixture.dependencies), {
    runnerSha: FORMAL_RUNNER,
    runnerPath: `${ROOT}/tools/staging-web-immutable-runner-${FORMAL_RUNNER}`,
    wrapperPath: fixture.wrapper,
    launcherPath: `${release.path}/runtime/run-standalone-from-manifest.cjs`,
  });
  assert.equal(usesVersionedSecretWrapper(release, fixture.wrapper, fixture.dependencies), true);
  assert.equal(usesVersionedSecretWrapper(release, "/runner/staging-web-secret-runtime-wrapper.cjs"), false);
  assert.equal(usesVersionedSecretWrapper(release, `${ROOT}/tools/staging-web-immutable-runner-not-a-sha/staging-web-secret-runtime-wrapper.cjs`), false);
});

test("candidate source-SHA health mismatch injects before cutover and leaves selected releases unchanged", async () => {
  const calls = [];
  const result = await executeImmutableWebPromotion(input(), operations(calls, {
    startCandidate: async () => { calls.push("candidate-health"); return { ...healthy(), healthSourceMatchesRelease: false }; },
  }));
  assert.equal(result.phase, "aborted_before_cutover");
  assert.equal(result.current.sha, CURRENT);
  assert.ok(!calls.some((value) => value.startsWith("switch:")));
  assert.ok(calls.includes("stop-candidate"));
});

test("formal wrapper validation rejects path escapes, links, wrong ownership, writable directories, mounts, hard links, and unpinned content", () => {
  const release = { path: `${ROOT}/releases/${CURRENT}` };
  const fixture = formalWrapperFixture(release);
  const runner = `${ROOT}/tools/staging-web-immutable-runner-${FORMAL_RUNNER}`;
  assert.throws(() => assertFormalStagingRunnerWrapper(release, `${ROOT}/tools/staging-web-immutable-runner-${FORMAL_RUNNER}/../staging-web-secret-runtime-wrapper.cjs`, fixture.dependencies), /WEB_EXECUTOR_FORMAL_WRAPPER_PATH_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, hashFile: () => "b".repeat(64) }), /WEB_EXECUTOR_FORMAL_WRAPPER_IDENTITY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === runner ? privateMetadata("directory", { nlink: 1 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === runner ? privateMetadata("directory", { mode: 0o40720 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === runner ? privateMetadata("directory", { uid: 2000 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === runner ? privateMetadata("directory", { gid: 2000 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === ROOT ? privateMetadata("directory", { isSymbolicLink: () => true }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_ROOT_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === `${ROOT}/tools` ? privateMetadata("directory", { isSymbolicLink: () => true }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_TOOLS_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === `${ROOT}/tools` ? privateMetadata("directory", { mode: 0o40775 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_TOOLS_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, realpathSync: (target) => target === `${ROOT}/tools` ? `${ROOT}/outside` : target }), /WEB_EXECUTOR_FORMAL_TOOLS_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, readMountInfo: () => `1 0 8:1 / ${runner} rw - ext4 /dev/sda rw` }), /WEB_EXECUTOR_FORMAL_WRAPPER_DIRECTORY_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === fixture.wrapper ? privateMetadata("file", { isSymbolicLink: () => true }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_FILE_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === fixture.wrapper ? privateMetadata("file", { nlink: 2 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_FILE_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === fixture.wrapper ? privateMetadata("file", { gid: 2000 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_FILE_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, lstatSync: (target) => target === fixture.wrapper ? privateMetadata("file", { mode: 0o100640 }) : fixture.dependencies.lstatSync(target) }), /WEB_EXECUTOR_FORMAL_WRAPPER_FILE_INVALID/);
  assert.throws(() => assertFormalStagingRunnerWrapper(release, fixture.wrapper, { ...fixture.dependencies, realpathSync: (target) => target === fixture.wrapper ? `${ROOT}/outside` : target }), /WEB_EXECUTOR_FORMAL_WRAPPER_FILE_INVALID/);
});

test("serving PM2 identity binds one app, port 3100, loopback, source SHA, cwd, formal wrapper, and release-local launcher", () => {
  const release = { sha: CURRENT, path: `${ROOT}/releases/${CURRENT}` };
  const fixture = formalWrapperFixture(release);
  const record = {
    name: "memoryai-staging", status: "online", unstableRestarts: 0, cwd: `${release.path}/runtime`, port: "3100", execPath: fixture.wrapper,
    environment: {
      MEMORYAI_RELEASE_ROOT: `${release.path}/runtime`, MEMORYAI_RELEASE_SOURCE_SHA: CURRENT, MEMORYAI_PM2_APP_NAME: "memoryai-staging", MEMORYAI_PORT: "3100",
      HOSTNAME: "127.0.0.1", AUTH_PROXY_LOOPBACK_ONLY: "true",
    },
  };
  assert.equal(assertServingPm2Identity(release, record, fixture.dependencies).launcher, `${release.path}/runtime/run-standalone-from-manifest.cjs`);
  assert.throws(() => assertServingPm2Identity(release, { ...record, name: candidateAppName(CURRENT) }, fixture.dependencies), /WEB_EXECUTOR_CURRENT_PM2_INVALID/);
  assert.throws(() => assertServingPm2Identity(release, { ...record, cwd: `${ROOT}/releases/${ROLLBACK}/runtime` }, fixture.dependencies), /WEB_EXECUTOR_CURRENT_PM2_INVALID/);
  assert.throws(() => assertServingPm2Identity(release, { ...record, port: "3110" }, fixture.dependencies), /WEB_EXECUTOR_CURRENT_PM2_INVALID/);
  assert.throws(() => assertServingPm2Identity(release, { ...record, environment: { ...record.environment, HOSTNAME: "0.0.0.0" } }, fixture.dependencies), /WEB_EXECUTOR_CURRENT_PM2_RELEASE_TARGET_INVALID/);
  assert.throws(() => assertServingPm2Identity(release, { ...record, environment: { ...record.environment, MEMORYAI_RELEASE_ROOT: `${ROOT}/releases/${ROLLBACK}/runtime` } }, fixture.dependencies), /WEB_EXECUTOR_CURRENT_PM2_RELEASE_TARGET_INVALID/);
  const raw = JSON.stringify([{ name: "memoryai-staging", pid: 1, pm2_env: { status: "online", unstable_restarts: 0, pm_cwd: record.cwd, pm_exec_path: record.execPath, env: record.environment } }, { name: "memoryai-staging", pid: 2, pm2_env: { status: "online", unstable_restarts: 0, pm_cwd: record.cwd, pm_exec_path: record.execPath, env: record.environment } }]);
  assert.throws(() => parsePm2Record(raw), /WEB_EXECUTOR_PM2_APP_COUNT_INVALID/);
});

test("candidate PM2 identity is SHA-derived, loopback-only, source-bound, and cannot carry Qwen configuration", () => {
  const current = { sha: CURRENT, path: `${ROOT}/releases/${CURRENT}` };
  const candidate = { sha: CANDIDATE, path: `${ROOT}/releases/${CANDIDATE}` };
  const fixture = formalWrapperFixture(candidate);
  const candidateRecord = {
    name: candidateAppName(CANDIDATE), status: "online", unstableRestarts: 0, cwd: `${candidate.path}/runtime`, port: "3110", execPath: fixture.wrapper,
    environment: {
      MEMORYAI_RELEASE_ROOT: `${candidate.path}/runtime`, MEMORYAI_RELEASE_SOURCE_SHA: CANDIDATE, MEMORYAI_PM2_APP_NAME: candidateAppName(CANDIDATE), MEMORYAI_PORT: "3110",
      HOSTNAME: "127.0.0.1", AUTH_PROXY_LOOPBACK_ONLY: "true", MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "false",
    },
  };
  assert.equal(assertCandidatePm2Identity(candidate, candidateRecord, fixture.dependencies).launcher, `${candidate.path}/runtime/run-standalone-from-manifest.cjs`);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, name: "memoryai-staging" }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, port: "3100" }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, name: "memoryai-staging-candidate-333333333333-extra" }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, cwd: `${current.path}/runtime` }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, execPath: `${candidate.path}/runtime/run-standalone-from-manifest.cjs` }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, environment: { ...candidateRecord.environment, MEMORYAI_RELEASE_SOURCE_SHA: CURRENT } }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_RELEASE_TARGET_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, environment: { ...candidateRecord.environment, HOSTNAME: "0.0.0.0" } }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_PM2_RELEASE_TARGET_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, environment: { ...candidateRecord.environment, DASHSCOPE_API_KEY: "fake" } }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_QWEN_ENVIRONMENT_INVALID/);
  assert.throws(() => assertCandidatePm2Identity(candidate, { ...candidateRecord, environment: { ...candidateRecord.environment, MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "true" } }, fixture.dependencies), /WEB_EXECUTOR_CANDIDATE_QWEN_ENVIRONMENT_INVALID/);
});

test("PM2 role populations reject duplicates, residual candidates, cross-role replacement, and arbitrary prefixes", () => {
  const release = { path: `${ROOT}/releases/${CURRENT}` };
  const fixture = formalWrapperFixture(release);
  const serving = {
    name: "memoryai-staging", pid: 1, pm2_env: { status: "online", unstable_restarts: 0, pm_cwd: `${release.path}/runtime`, pm_exec_path: fixture.wrapper, env: {
      MEMORYAI_RELEASE_ROOT: `${release.path}/runtime`, MEMORYAI_RELEASE_SOURCE_SHA: CURRENT, MEMORYAI_PM2_APP_NAME: "memoryai-staging", MEMORYAI_PORT: "3100", HOSTNAME: "127.0.0.1", AUTH_PROXY_LOOPBACK_ONLY: "true",
    } },
  };
  const candidate = {
    name: candidateAppName(CANDIDATE), pid: 2, pm2_env: { status: "online", unstable_restarts: 0, pm_cwd: `${ROOT}/releases/${CANDIDATE}/runtime`, pm_exec_path: fixture.wrapper, env: {
      MEMORYAI_RELEASE_ROOT: `${ROOT}/releases/${CANDIDATE}/runtime`, MEMORYAI_RELEASE_SOURCE_SHA: CANDIDATE, MEMORYAI_PM2_APP_NAME: candidateAppName(CANDIDATE), MEMORYAI_PORT: "3110", HOSTNAME: "127.0.0.1", AUTH_PROXY_LOOPBACK_ONLY: "true", MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "false",
    } },
  };
  assert.throws(() => assertPm2RolePopulation([serving, candidate], "serving"), /WEB_EXECUTOR_CANDIDATE_RESIDUE_INVALID/);
  assert.deepEqual(assertPm2RolePopulation([serving, candidate], "candidate", candidate.name).candidate.name, candidate.name);
  assert.throws(() => assertPm2RolePopulation([serving, { ...candidate, name: "memoryai-staging-candidate-aaaaaaaaaaaa" }], "candidate", candidate.name), /WEB_EXECUTOR_CANDIDATE_POPULATION_INVALID/);
  assert.throws(() => assertPm2RolePopulation([serving, candidate, { ...candidate, pid: 3 }], "candidate", candidate.name), /WEB_EXECUTOR_CANDIDATE_POPULATION_INVALID/);
  assert.throws(() => assertPm2RolePopulation([{ ...serving, name: candidate.name, pid: 3 }, candidate], "candidate", candidate.name), /WEB_EXECUTOR_PM2_APP_COUNT_INVALID/);
  assert.throws(() => assertPm2RolePopulation([{ ...serving, name: "memoryai-staging-candidateish" }], "serving"), /WEB_EXECUTOR_PM2_APP_COUNT_INVALID/);
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

test("health identity requires an OK response with the release source SHA", async () => {
  const token = "b".repeat(48);
  const server = http.createServer((request, response) => {
    assert.equal(request.headers["x-memoryai-staging-access"], token);
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok", sourceSha: CANDIDATE }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.deepEqual(await httpHealth(address.port, token), { health200: true, sourceSha: CANDIDATE });
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
