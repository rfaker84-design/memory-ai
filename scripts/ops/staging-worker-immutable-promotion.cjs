const { renameSync, writeFileSync } = require("node:fs");
const path = require("node:path");

function fail(code, detail) {
  throw new Error(code + (detail === undefined ? "" : ":" + detail));
}

function assertSha(value, code) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function assertRelease(release, role) {
  if (!release || typeof release !== "object") fail("WORKER_" + role + "_RELEASE_MISSING");
  const sha = assertSha(release.sha, "WORKER_" + role + "_SHA_INVALID");
  if (typeof release.path !== "string" || !release.path.endsWith("/" + sha)) {
    fail("WORKER_" + role + "_PATH_INVALID", release.path);
  }
  if (release.immutable !== true) fail("WORKER_" + role + "_NOT_IMMUTABLE", release.path);
  return { sha, path: release.path, immutable: true };
}

function assertCurrentRuntime(current, pm2Cwd) {
  const release = assertRelease(current, "CURRENT");
  if (current.runtimeSmokeVerified !== true) fail("WORKER_CURRENT_RUNTIME_SMOKE_UNVERIFIED", release.sha);
  if (current.pm2Status !== "online" || current.unstableRestarts !== 0) {
    fail("WORKER_CURRENT_PM2_UNHEALTHY", `${current.pm2Status}:${current.unstableRestarts}`);
  }
  if (pm2Cwd !== release.path + "/worker") fail("WORKER_CURRENT_PM2_CWD_MISMATCH", pm2Cwd);
  return release;
}

function assertCandidate(candidate) {
  const release = assertRelease(candidate, "CANDIDATE");
  if (candidate.artifactVerified !== true) fail("WORKER_CANDIDATE_ARTIFACT_UNVERIFIED", release.sha);
  if (candidate.runtimeSmokeVerified !== true || candidate.readyVerified !== true) {
    fail("WORKER_CANDIDATE_RUNTIME_UNVERIFIED", release.sha);
  }
  return release;
}

function assertCapacity({ availableBytes, requiredBytes }) {
  if (!Number.isSafeInteger(availableBytes) || !Number.isSafeInteger(requiredBytes) || requiredBytes <= 0) {
    fail("WORKER_PROMOTION_CAPACITY_INPUT_INVALID");
  }
  if (availableBytes < requiredBytes) fail("WORKER_PROMOTION_CAPACITY_BLOCKED", `${availableBytes}<${requiredBytes}`);
}

function createWorkerPromotion(input) {
  const bootstrap = input.bootstrap === true;
  const candidate = assertCandidate(input.candidate);
  assertCapacity(input.capacity);
  if (!input.current && !bootstrap) fail("WORKER_CURRENT_REQUIRED_WITHOUT_BOOTSTRAP");
  if (input.current && bootstrap) fail("WORKER_BOOTSTRAP_CURRENT_PRESENT");

  const previousRelease = input.current ? assertCurrentRuntime(input.current, input.pm2Cwd) : null;
  if (previousRelease && previousRelease.path === candidate.path) {
    fail("WORKER_CANDIDATE_MUST_USE_NEW_RELEASE_DIRECTORY", candidate.path);
  }

  return {
    version: 1,
    component: "worker",
    phase: "prepared",
    bootstrap,
    promotionStartedAt: input.promotionStartedAt ?? new Date().toISOString(),
    pm2CwdBefore: input.pm2Cwd ?? null,
    previousRelease,
    candidateRelease: candidate,
    currentRelease: previousRelease,
    rollbackRelease: null,
  };
}

function isCriticalRuntimeHealthy(checks) {
  return checks?.pm2Online === true
    && checks?.ready === true
    && checks?.runtimeDependencies === true
    && checks?.smoke === true
    && checks?.unstableRestarts === 0;
}

async function executeWorkerPromotion(transaction, operations, options = {}) {
  if (transaction.phase !== "prepared") fail("WORKER_PROMOTION_NOT_PREPARED", transaction.phase);
  if (options.journalPath) writePromotionJournal(options.journalPath, transaction);
  const complete = (result) => {
    if (options.journalPath) writePromotionJournal(options.journalPath, result);
    return result;
  };
  if (await operations.verifyCandidateExactArtifact() !== true) {
    return complete({ ...transaction, phase: "aborted_before_cutover", candidateRetained: true });
  }

  await operations.switchPm2ToCandidate(transaction.candidateRelease);
  const candidateChecks = await operations.probeCandidateRuntime(transaction.candidateRelease);
  const rollbackSmoke = transaction.previousRelease
    ? await operations.probeRollbackRuntime(transaction.previousRelease)
    : true;

  if (isCriticalRuntimeHealthy(candidateChecks) && rollbackSmoke === true) {
    return complete({
      ...transaction,
      phase: "promoted",
      currentRelease: transaction.candidateRelease,
      rollbackRelease: transaction.previousRelease,
      candidateRetained: true,
    });
  }

  if (!transaction.previousRelease) {
    return complete({
      ...transaction,
      phase: "bootstrap_candidate_failed",
      candidateRetained: true,
      failure: { candidateChecks, rollbackSmoke },
    });
  }

  await operations.restorePm2ToPrevious(transaction.previousRelease);
  const previousOnline = await operations.probePreviousOnline(transaction.previousRelease);
  if (previousOnline !== true) fail("WORKER_AUTO_ROLLBACK_FAILED", transaction.previousRelease.sha);
  return complete({
    ...transaction,
    phase: "rolled_back",
    currentRelease: transaction.previousRelease,
    rollbackRelease: null,
    candidateRetained: true,
    failure: { candidateChecks, rollbackSmoke },
  });
}

function writePromotionJournal(destination, transaction) {
  const resolved = path.resolve(destination);
  const temporary = resolved + ".tmp-" + process.pid;
  writeFileSync(temporary, JSON.stringify(transaction, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, resolved);
  return resolved;
}

function readOption(args, name, options = {}) {
  const index = args.indexOf(name);
  if (index === -1) {
    if (options.required) fail("WORKER_PROMOTION_OPTION_MISSING", name);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail("WORKER_PROMOTION_OPTION_VALUE_MISSING", name);
  return value;
}

function readPositiveInteger(args, name) {
  const value = readOption(args, name, { required: true });
  if (!/^\d+$/.test(value)) fail("WORKER_PROMOTION_INTEGER_INVALID", name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("WORKER_PROMOTION_INTEGER_INVALID", name);
  return parsed;
}

function dryRun(args) {
  const bootstrap = args.includes("--bootstrap");
  const candidate = {
    sha: readOption(args, "--candidate-sha", { required: true }),
    path: readOption(args, "--candidate-path", { required: true }),
    immutable: args.includes("--candidate-immutable"),
    artifactVerified: args.includes("--candidate-artifact-verified"),
    runtimeSmokeVerified: args.includes("--candidate-runtime-smoke-verified"),
    readyVerified: args.includes("--candidate-ready-verified"),
  };
  const hasCurrent = args.includes("--current-present");
  const current = hasCurrent ? {
    sha: readOption(args, "--current-sha", { required: true }),
    path: readOption(args, "--current-path", { required: true }),
    immutable: args.includes("--current-immutable"),
    runtimeSmokeVerified: args.includes("--current-runtime-smoke-verified"),
    pm2Status: readOption(args, "--current-pm2-status", { required: true }),
    unstableRestarts: readPositiveInteger(args, "--current-unstable-restarts"),
  } : null;
  const transaction = createWorkerPromotion({
    bootstrap,
    current,
    candidate,
    pm2Cwd: readOption(args, "--pm2-cwd", { required: hasCurrent }),
    capacity: {
      availableBytes: readPositiveInteger(args, "--available-bytes"),
      requiredBytes: readPositiveInteger(args, "--required-bytes"),
    },
    promotionStartedAt: readOption(args, "--promotion-started-at") ?? "dry-run",
  });
  const journal = readOption(args, "--journal");
  if (journal) writePromotionJournal(journal, transaction);
  console.log([
    "WORKER_PROMOTION_DRY_RUN_ALLOWED",
    "bootstrap=" + transaction.bootstrap,
    "previousRelease=" + (transaction.previousRelease?.path ?? "none"),
    "candidateRelease=" + transaction.candidateRelease.path,
    "futureRollback=" + (transaction.previousRelease?.path ?? "none"),
  ].join(" "));
}

function main(args) {
  const command = args.shift();
  if (command === "dry-run") return dryRun(args);
  fail("WORKER_PROMOTION_COMMAND_INVALID", command ?? "missing");
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "WORKER_PROMOTION_FAILED");
    process.exitCode = 64;
  }
}

module.exports = {
  createWorkerPromotion,
  executeWorkerPromotion,
  isCriticalRuntimeHealthy,
  writePromotionJournal,
};
