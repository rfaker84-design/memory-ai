const { existsSync, lstatSync, readdirSync, statSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const GIB = 1024 ** 3;
const MINIMUM_PREFLIGHT_BYTES = 8 * GIB;
const MINIMUM_POSTFLIGHT_BYTES = 5 * GIB;
const RETENTION_BUFFER_BYTES = 5 * GIB;
const COMPONENTS = new Set(["web", "worker"]);

function fail(code, detail) {
  throw new Error(code + (detail === undefined ? "" : ":" + detail));
}

function requiredFreeBytes(candidateUnpackedBytes) {
  if (!Number.isSafeInteger(candidateUnpackedBytes) || candidateUnpackedBytes <= 0) {
    fail("CANDIDATE_UNPACKED_SIZE_INVALID", candidateUnpackedBytes);
  }
  return Math.max(
    MINIMUM_PREFLIGHT_BYTES,
    (2 * candidateUnpackedBytes) + RETENTION_BUFFER_BYTES,
  );
}

function byteSize(target) {
  const stat = lstatSync(target);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    total += byteSize(path.join(target, entry.name));
  }
  return total;
}

function positiveInteger(value, code) {
  if (!/^[1-9]\d*$/.test(value ?? "")) fail(code, value);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(code, value);
  return parsed;
}

function option(args, name, options = {}) {
  const index = args.indexOf(name);
  if (index === -1) {
    if (options.required) fail("CAPACITY_GATE_OPTION_MISSING", name);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail("CAPACITY_GATE_OPTION_VALUE_MISSING", name);
  return value;
}

function assertComponent(value) {
  if (!COMPONENTS.has(value)) fail("CAPACITY_GATE_COMPONENT_INVALID", value);
  return value;
}

function assertSafeRemotePath(value, code) {
  if (!/^\/[A-Za-z0-9._/-]+$/.test(value) || value.includes("..")) fail(code, value);
  return value;
}

function assertSha(value, code) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function artifactBytes(artifact) {
  if (!existsSync(artifact)) fail("CANDIDATE_ARTIFACT_MISSING", artifact);
  const stat = statSync(artifact);
  if (!stat.isFile()) fail("CANDIDATE_ARTIFACT_NOT_FILE", artifact);
  return stat.size;
}

function writeReleaseCapacityMetadata({ outputDirectory, component }) {
  const destination = path.join(outputDirectory, "release-capacity.json");
  const safeComponent = assertComponent(component);
  const existingMetadataBytes = existsSync(destination) ? statSync(destination).size : 0;
  const payloadBytes = byteSize(outputDirectory) - existingMetadataBytes;
  let candidateUnpackedBytes = payloadBytes;
  let serialized = "";

  // The metadata is part of the artifact too. Iterate until its own encoded
  // length is included, rather than understating the exact unpacked payload.
  for (;;) {
    const payload = {
      version: 1,
      component: safeComponent,
      candidateUnpackedBytes,
      requiredFreeBytes: requiredFreeBytes(candidateUnpackedBytes),
      minimumPostflightBytes: MINIMUM_POSTFLIGHT_BYTES,
    };
    serialized = JSON.stringify(payload, null, 2) + "\n";
    const nextCandidateUnpackedBytes = payloadBytes + Buffer.byteLength(serialized);
    if (nextCandidateUnpackedBytes === candidateUnpackedBytes) {
      writeFileSync(destination, serialized);
      return { destination, ...payload };
    }
    candidateUnpackedBytes = nextCandidateUnpackedBytes;
  }
}

function candidateSizing(args) {
  const artifact = option(args, "--candidate-artifact", { required: true });
  const unpackedDirectory = option(args, "--candidate-unpacked");
  const unpackedBytesText = option(args, "--candidate-unpacked-bytes");
  if (unpackedDirectory && unpackedBytesText) fail("CANDIDATE_UNPACKED_SIZE_AMBIGUOUS");

  const candidateArtifactBytes = artifactBytes(path.resolve(artifact));
  let candidateUnpackedBytes;
  if (unpackedDirectory) {
    const resolved = path.resolve(unpackedDirectory);
    if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) {
      fail("CANDIDATE_UNPACKED_DIRECTORY_MISSING", resolved);
    }
    candidateUnpackedBytes = byteSize(resolved);
  } else {
    candidateUnpackedBytes = positiveInteger(unpackedBytesText, "CANDIDATE_UNPACKED_SIZE_INVALID");
  }

  return {
    candidateArtifactBytes,
    candidateUnpackedBytes,
    requiredFreeBytes: requiredFreeBytes(candidateUnpackedBytes),
  };
}

function remoteInspection({ sshTarget, remoteRoot, component, rollbackSha, candidateTempPath = null }) {
  const remoteScript = [
    "set -euo pipefail",
    'root="$1"',
    'component="$2"',
    'rollback_sha="$3"',
    'candidate_temp="$' + '{4:-}"',
    'release_root="$root/releases"',
    '[ -d "$release_root" ] || { echo "CAPACITY_GATE_REMOTE_ROOT_MISSING:$release_root" >&2; exit 61; }',
    '[ -d "$release_root/$rollback_sha" ] || { echo "CAPACITY_GATE_ROLLBACK_MISSING:$release_root/$rollback_sha" >&2; exit 62; }',
    'if [ "$component" = web ]; then app=memoryai-staging; active_release=$(readlink -f "$root/current"); [ -d "$active_release/runtime" ] || { echo "CAPACITY_GATE_WEB_CURRENT_INVALID:$active_release" >&2; exit 63; }; else app=memoryai-staging-video-worker; active_release=""; fi',
    'pid=$(pm2 pid "$app" | tail -n 1 | tr -d "[:space:]")',
    'case "$pid" in ""|0|*[!0-9]*) echo "CAPACITY_GATE_PM2_PID_MISSING:$app" >&2; exit 64;; esac',
    'cwd=$(readlink -f "/proc/$pid/cwd")',
    'case "$cwd" in "$release_root"/*) ;; *) echo "CAPACITY_GATE_PM2_CWD_OUTSIDE_RELEASES:$cwd" >&2; exit 65;; esac',
    'if [ "$component" = worker ]; then active_release=$(dirname "$cwd"); fi',
    '[ "$active_release" != "$release_root/$rollback_sha" ] || { echo "CAPACITY_GATE_DISTINCT_ROLLBACK_REQUIRED:$rollback_sha" >&2; exit 66; }',
    'if [ "$component" = web ]; then [ "$cwd" = "$active_release/runtime" ] || { echo "CAPACITY_GATE_WEB_CWD_MISMATCH:$cwd" >&2; exit 67; }; else [ "$cwd" = "$active_release/worker" ] || { echo "CAPACITY_GATE_WORKER_CWD_MISMATCH:$cwd" >&2; exit 68; }; fi',
    'if [ -n "$candidate_temp" ] && [ -e "$candidate_temp" ]; then echo "CAPACITY_GATE_TEMP_NOT_CLEANED:$candidate_temp" >&2; exit 69; fi',
    'available=$(df -B1 --output=avail "$root" | tail -n 1 | tr -d "[:space:]")',
    'echo "availableBytes=$available"',
    'echo "activeRelease=$active_release"',
    'echo "activeCwd=$cwd"',
    'echo "rollbackRelease=$release_root/$rollback_sha"',
  ].join("\n");

  const result = spawnSync("ssh", [
    sshTarget,
    "bash",
    "-s",
    "--",
    remoteRoot,
    component,
    rollbackSha,
    candidateTempPath ?? "",
  ], { input: remoteScript, encoding: "utf8" });
  if (result.error) fail("CAPACITY_GATE_SSH_FAILED", result.error.message);
  if (result.status !== 0) {
    fail("CAPACITY_GATE_REMOTE_FAILED", (result.stderr || result.stdout || ("exit=" + result.status)).trim());
  }
  const values = Object.fromEntries((result.stdout || "").trim().split("\n").filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  return {
    availableBytes: positiveInteger(values.availableBytes, "CAPACITY_GATE_REMOTE_AVAILABLE_INVALID"),
    activeRelease: values.activeRelease,
    activeCwd: values.activeCwd,
    rollbackRelease: values.rollbackRelease,
  };
}

function printPreflight({ component, sizing, remote }) {
  const state = remote.availableBytes >= sizing.requiredFreeBytes ? "PASS" : "BLOCKED";
  console.log([
    "STAGING_RELEASE_CAPACITY_" + state,
    "component=" + component,
    "artifactBytes=" + sizing.candidateArtifactBytes,
    "candidateUnpackedBytes=" + sizing.candidateUnpackedBytes,
    "availableBytes=" + remote.availableBytes,
    "requiredBytes=" + sizing.requiredFreeBytes,
    "activeRelease=" + remote.activeRelease,
    "rollbackRelease=" + remote.rollbackRelease,
  ].join(" "));
  if (state !== "PASS") process.exitCode = 10;
}

function preflight(args) {
  const component = assertComponent(option(args, "--component", { required: true }));
  const sshTarget = option(args, "--ssh-target", { required: true });
  const remoteRoot = assertSafeRemotePath(option(args, "--remote-root", { required: true }), "CAPACITY_GATE_REMOTE_ROOT_INVALID");
  const rollbackSha = assertSha(option(args, "--rollback-sha", { required: true }), "CAPACITY_GATE_ROLLBACK_SHA_INVALID");
  const sizing = candidateSizing(args);
  const remote = remoteInspection({ sshTarget, remoteRoot, component, rollbackSha });
  printPreflight({ component, sizing, remote });
}

function postflight(args) {
  const component = assertComponent(option(args, "--component", { required: true }));
  const sshTarget = option(args, "--ssh-target", { required: true });
  const remoteRoot = assertSafeRemotePath(option(args, "--remote-root", { required: true }), "CAPACITY_GATE_REMOTE_ROOT_INVALID");
  const rollbackSha = assertSha(option(args, "--rollback-sha", { required: true }), "CAPACITY_GATE_ROLLBACK_SHA_INVALID");
  const candidateTempPath = assertSafeRemotePath(option(args, "--candidate-temp-path", { required: true }), "CAPACITY_GATE_TEMP_PATH_INVALID");
  const remote = remoteInspection({ sshTarget, remoteRoot, component, rollbackSha, candidateTempPath });
  const state = remote.availableBytes >= MINIMUM_POSTFLIGHT_BYTES ? "PASS" : "BLOCKED";
  console.log([
    "STAGING_RELEASE_POSTFLIGHT_" + state,
    "component=" + component,
    "availableBytes=" + remote.availableBytes,
    "minimumBytes=" + MINIMUM_POSTFLIGHT_BYTES,
    "activeRelease=" + remote.activeRelease,
    "rollbackRelease=" + remote.rollbackRelease,
    "candidateTempPath=" + candidateTempPath,
  ].join(" "));
  if (state !== "PASS") process.exitCode = 11;
}

function main(args) {
  const command = args.shift();
  if (command === "preflight") return preflight(args);
  if (command === "postflight") return postflight(args);
  fail("CAPACITY_GATE_COMMAND_INVALID", command ?? "missing");
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CAPACITY_GATE_FAILED");
    process.exitCode = 64;
  }
}

module.exports = {
  GIB,
  MINIMUM_POSTFLIGHT_BYTES,
  MINIMUM_PREFLIGHT_BYTES,
  RETENTION_BUFFER_BYTES,
  byteSize,
  requiredFreeBytes,
  writeReleaseCapacityMetadata,
};
