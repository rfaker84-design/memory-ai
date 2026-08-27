"use strict";

// This is intentionally a Web-only promotion state machine.  It has no SSH,
// file-write, or PM2 CLI side effects: an approved, separately installed
// executor supplies the narrowly-scoped operations below.  The CLI exposes
// dry-run only, so this repository candidate cannot promote a release by
// itself.
const { requiredFreeBytes } = require("./staging-release-capacity-gate.cjs");

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const COMPONENT = "web";
const LOCK_NAME = "memoryai-staging-web-immutable-promotion";

function fail(code, detail) {
  throw new Error(`${code}${detail === undefined ? "" : `:${detail}`}`);
}

function assertSha(value, code) {
  if (!SHA_PATTERN.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function assertSha256(value, code) {
  if (!SHA256_PATTERN.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function assertPositiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code, value);
  return value;
}

function assertRemoteRoot(value) {
  if (typeof value !== "string" || !/^\/[A-Za-z0-9._/-]+$/u.test(value) || value.includes("..")) {
    fail("WEB_PROMOTION_REMOTE_ROOT_INVALID", value);
  }
  return value.replace(/\/$/u, "");
}

function assertRelease(root, release, role) {
  if (!release || typeof release !== "object") fail(`WEB_${role}_RELEASE_MISSING`);
  const sha = assertSha(release.sha, `WEB_${role}_SHA_INVALID`);
  const expectedPath = `${root}/releases/${sha}`;
  if (release.path !== expectedPath) fail(`WEB_${role}_PATH_INVALID`, release.path);
  if (release.immutable !== true) fail(`WEB_${role}_NOT_IMMUTABLE`, release.path);
  if (release.checksumsVerified !== true) fail(`WEB_${role}_CHECKSUM_UNVERIFIED`, sha);
  if (assertSha(release.manifestSourceSha, `WEB_${role}_MANIFEST_SOURCE_INVALID`) !== sha) {
    fail(`WEB_${role}_MANIFEST_SOURCE_MISMATCH`, sha);
  }
  return { sha, path: expectedPath, immutable: true, checksumsVerified: true, manifestSourceSha: sha };
}

function assertCurrent(root, current, pm2Cwd) {
  const release = assertRelease(root, current, "CURRENT");
  if (current.pm2Status !== "online" || current.unstableRestarts !== 0) {
    fail("WEB_CURRENT_PM2_UNHEALTHY", `${current.pm2Status}:${current.unstableRestarts}`);
  }
  if (pm2Cwd !== `${release.path}/runtime`) fail("WEB_CURRENT_PM2_CWD_MISMATCH", pm2Cwd);
  if (current.healthVerified !== true || current.databaseHealthVerified !== true) {
    fail("WEB_CURRENT_HEALTH_UNVERIFIED", release.sha);
  }
  return release;
}

function assertCandidate(root, candidate) {
  const release = assertRelease(root, candidate, "CANDIDATE");
  const artifact = candidate.artifact;
  if (!artifact || typeof artifact !== "object") fail("WEB_CANDIDATE_ARTIFACT_MISSING");
  assertSha256(artifact.artifactSha256, "WEB_CANDIDATE_ARTIFACT_SHA_INVALID");
  const evidence = artifact.evidence;
  if (!evidence || typeof evidence !== "object") fail("WEB_CANDIDATE_EVIDENCE_MISSING");
  if (evidence.sha256sumsVerified !== true) fail("WEB_CANDIDATE_SHA256SUMS_UNVERIFIED");
  assertSha256(evidence.manifestSha256, "WEB_CANDIDATE_MANIFEST_SHA_INVALID");
  assertSha256(evidence.sbomSha256, "WEB_CANDIDATE_SBOM_SHA_INVALID");
  assertSha256(evidence.provenanceSha256, "WEB_CANDIDATE_PROVENANCE_SHA_INVALID");
  const manifestSourceSha = assertSha(evidence.manifestSourceSha, "WEB_CANDIDATE_EVIDENCE_SOURCE_INVALID");
  if (manifestSourceSha !== release.sha || evidence.component !== COMPONENT) {
    fail("WEB_CANDIDATE_EVIDENCE_IDENTITY_MISMATCH", release.sha);
  }
  const runtimeSha256 = assertSha256(evidence.runtimeSha256, "WEB_CANDIDATE_RUNTIME_SHA_INVALID");
  if (assertSha256(evidence.provenanceRuntimeSha256, "WEB_CANDIDATE_PROVENANCE_RUNTIME_SHA_INVALID") !== runtimeSha256) {
    fail("WEB_CANDIDATE_PROVENANCE_RUNTIME_MISMATCH", release.sha);
  }
  if (candidate.standaloneManifestVerified !== true || candidate.pm2ManifestLauncherVerified !== true) {
    fail("WEB_CANDIDATE_MANIFEST_LAUNCHER_UNVERIFIED", release.sha);
  }
  return { ...release, artifact: { artifactSha256: artifact.artifactSha256.toLowerCase(), runtimeSha256 } };
}

function assertCapacity(capacity) {
  if (!capacity || typeof capacity !== "object") fail("WEB_PROMOTION_CAPACITY_MISSING");
  const availableBytes = assertPositiveInteger(capacity.availableBytes, "WEB_PROMOTION_AVAILABLE_BYTES_INVALID");
  const candidateUnpackedBytes = assertPositiveInteger(capacity.candidateUnpackedBytes, "WEB_PROMOTION_CANDIDATE_BYTES_INVALID");
  const requiredBytes = requiredFreeBytes(candidateUnpackedBytes);
  if (capacity.requiredBytes !== requiredBytes) fail("WEB_PROMOTION_REQUIRED_BYTES_MISMATCH", capacity.requiredBytes);
  if (availableBytes < requiredBytes) fail("WEB_PROMOTION_CAPACITY_BLOCKED", `${availableBytes}<${requiredBytes}`);
  return { availableBytes, candidateUnpackedBytes, requiredBytes };
}

function assessHistory(history, previousRelease, rollbackBefore) {
  if (!history || typeof history !== "object") fail("WEB_PROMOTION_HISTORY_MISSING");
  const journalPrevious = assertSha(history.journalPreviousSha, "WEB_HISTORY_JOURNAL_PREVIOUS_INVALID");
  const journalRollback = assertSha(history.journalRollbackSha, "WEB_HISTORY_JOURNAL_ROLLBACK_INVALID");
  if (journalPrevious !== rollbackBefore.sha) fail("WEB_HISTORY_PREVIOUS_MISMATCH", journalPrevious);
  const mismatch = journalRollback !== rollbackBefore.sha;
  const reconciliation = history.reconciliation;
  if (!mismatch) return { status: "consistent", journalPrevious, journalRollback };
  if (
    reconciliation?.verified === true
    && reconciliation.correctedRollbackSha === rollbackBefore.sha
    && typeof reconciliation.appendOnlyJournalPath === "string"
    && reconciliation.appendOnlyJournalPath.includes("/.promotion/reconciliations/")
  ) {
    return { status: "reconciled", journalPrevious, journalRollback, reconciliation: reconciliation.appendOnlyJournalPath };
  }
  return {
    status: "reconciliation_required",
    journalPrevious,
    journalRollback,
    actualRollback: rollbackBefore.sha,
    requiredPrevious: previousRelease.sha,
  };
}

function createWebPromotion(input) {
  const root = assertRemoteRoot(input.remoteRoot);
  const previousRelease = assertCurrent(root, input.current, input.pm2Cwd);
  const rollbackBefore = assertRelease(root, input.rollback, "ROLLBACK");
  const candidateRelease = assertCandidate(root, input.candidate);
  const capacity = assertCapacity(input.capacity);
  if (candidateRelease.path === previousRelease.path || candidateRelease.path === rollbackBefore.path) {
    fail("WEB_CANDIDATE_MUST_USE_NEW_RELEASE_DIRECTORY", candidateRelease.path);
  }
  const history = assessHistory(input.history, previousRelease, rollbackBefore);
  return {
    version: 1,
    component: COMPONENT,
    phase: history.status === "reconciliation_required" ? "reconciliation_required" : "prepared",
    promotionStartedAt: input.promotionStartedAt ?? new Date().toISOString(),
    lockName: LOCK_NAME,
    remoteRoot: root,
    pm2CwdBefore: input.pm2Cwd,
    previousRelease,
    rollbackBefore,
    candidateRelease,
    capacity,
    history,
    currentRelease: previousRelease,
    rollbackRelease: rollbackBefore,
    candidateRetained: true,
  };
}

function isCriticalRuntimeHealthy(checks) {
  return checks?.pm2Online === true
    && checks?.pm2CwdMatchesManifest === true
    && checks?.manifestVerified === true
    && checks?.checksumsVerified === true
    && checks?.health200 === true
    && checks?.databaseHealth200 === true
    && checks?.unstableRestarts === 0;
}

function requireOperations(operations) {
  for (const name of [
    "acquireLock",
    "releaseLock",
    "appendJournal",
    "verifyCandidateEvidence",
    "materializeImmutableRelease",
    "startCandidateViaPm2Manifest",
    "probeCandidateRuntime",
    "atomicallySwitchCurrentAndRollback",
    "reloadServingPm2ViaManifest",
    "probeServingRuntime",
    "atomicallyRestoreCurrentAndRollback",
  ]) {
    if (typeof operations?.[name] !== "function") fail("WEB_PROMOTION_OPERATION_MISSING", name);
  }
}

async function executeWebPromotion(transaction, operations) {
  if (transaction.phase !== "prepared") fail("WEB_PROMOTION_NOT_PREPARED", transaction.phase);
  requireOperations(operations);
  if (await operations.acquireLock({ name: transaction.lockName, candidateSha: transaction.candidateRelease.sha }) !== true) {
    fail("WEB_PROMOTION_LOCK_UNAVAILABLE", transaction.lockName);
  }
  let lockHeld = true;
  const journal = async (event, payload = {}) => operations.appendJournal({
    schemaVersion: 1,
    component: COMPONENT,
    event,
    promotionStartedAt: transaction.promotionStartedAt,
    previousRelease: transaction.previousRelease,
    rollbackBefore: transaction.rollbackBefore,
    candidateRelease: transaction.candidateRelease,
    ...payload,
  });
  try {
    await journal("prepared");
    if (await operations.verifyCandidateEvidence(transaction.candidateRelease) !== true) {
      const result = { ...transaction, phase: "aborted_before_materialization" };
      await journal("aborted_before_materialization", { reason: "candidate_evidence_unverified" });
      return result;
    }
    if (await operations.materializeImmutableRelease(transaction.candidateRelease) !== true) {
      const result = { ...transaction, phase: "aborted_before_cutover" };
      await journal("aborted_before_cutover", { reason: "immutable_materialization_failed" });
      return result;
    }
    if (await operations.startCandidateViaPm2Manifest(transaction.candidateRelease) !== true) {
      const result = { ...transaction, phase: "aborted_before_cutover" };
      await journal("aborted_before_cutover", { reason: "candidate_pm2_manifest_start_failed" });
      return result;
    }
    const candidateChecks = await operations.probeCandidateRuntime(transaction.candidateRelease);
    if (!isCriticalRuntimeHealthy(candidateChecks)) {
      const result = { ...transaction, phase: "aborted_before_cutover", failure: { candidateChecks } };
      await journal("aborted_before_cutover", { reason: "candidate_runtime_unhealthy", candidateChecks });
      return result;
    }

    await operations.atomicallySwitchCurrentAndRollback({
      current: transaction.candidateRelease,
      rollback: transaction.previousRelease,
    });
    if (await operations.reloadServingPm2ViaManifest(transaction.candidateRelease) !== true) {
      throw new Error("WEB_PROMOTION_SERVING_PM2_RELOAD_FAILED");
    }
    const servingChecks = await operations.probeServingRuntime(transaction.candidateRelease);
    if (isCriticalRuntimeHealthy(servingChecks)) {
      const result = {
        ...transaction,
        phase: "promoted",
        currentRelease: transaction.candidateRelease,
        rollbackRelease: transaction.previousRelease,
      };
      await journal("promoted", { currentRelease: result.currentRelease, rollbackRelease: result.rollbackRelease, servingChecks });
      return result;
    }

    await operations.atomicallyRestoreCurrentAndRollback({
      current: transaction.previousRelease,
      rollback: transaction.rollbackBefore,
    });
    if (await operations.reloadServingPm2ViaManifest(transaction.previousRelease) !== true) {
      fail("WEB_PROMOTION_AUTO_ROLLBACK_PM2_RELOAD_FAILED", transaction.previousRelease.sha);
    }
    const restoredChecks = await operations.probeServingRuntime(transaction.previousRelease);
    if (!isCriticalRuntimeHealthy(restoredChecks)) fail("WEB_PROMOTION_AUTO_ROLLBACK_FAILED", transaction.previousRelease.sha);
    const result = {
      ...transaction,
      phase: "rolled_back",
      currentRelease: transaction.previousRelease,
      rollbackRelease: transaction.rollbackBefore,
      failure: { servingChecks, restoredChecks },
    };
    await journal("rolled_back", { currentRelease: result.currentRelease, rollbackRelease: result.rollbackRelease, servingChecks, restoredChecks });
    return result;
  } finally {
    if (lockHeld) await operations.releaseLock({ name: transaction.lockName, candidateSha: transaction.candidateRelease.sha });
    lockHeld = false;
  }
}

function dryRun(input) {
  const transaction = createWebPromotion(input);
  const report = {
    command: "staging-web-immutable-promotion dry-run",
    mode: "read-only",
    phase: transaction.phase,
    candidateSha: transaction.candidateRelease.sha,
    artifactSha256: transaction.candidateRelease.artifact.artifactSha256,
    runtimeSha256: transaction.candidateRelease.artifact.runtimeSha256,
    availableBytes: transaction.capacity.availableBytes,
    requiredBytes: transaction.capacity.requiredBytes,
    currentSha: transaction.currentRelease.sha,
    rollbackSha: transaction.rollbackRelease.sha,
    history: transaction.history,
    remoteWrites: 0,
  };
  return { transaction, report };
}

function main(args) {
  const command = args.shift();
  if (command !== "dry-run") fail("WEB_PROMOTION_COMMAND_INVALID", command ?? "missing");
  if (args[0] !== "--input" || !args[1] || args.length !== 2) fail("WEB_PROMOTION_DRY_RUN_INPUT_REQUIRED");
  // Reading an operator-provided record is the only CLI filesystem access.
  const input = JSON.parse(require("node:fs").readFileSync(args[1], "utf8"));
  const { report } = dryRun(input);
  console.log(JSON.stringify(report));
  if (report.phase !== "prepared") process.exitCode = 10;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "WEB_PROMOTION_FAILED");
    process.exitCode = 64;
  }
}

module.exports = {
  COMPONENT,
  LOCK_NAME,
  assertCapacity,
  createWebPromotion,
  dryRun,
  executeWebPromotion,
  isCriticalRuntimeHealthy,
};
