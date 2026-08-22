const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { writeReleaseCapacityMetadata } = require("./staging-release-capacity-gate.cjs");

const root = path.resolve(__dirname, "../..");
const outputDirectory = process.env.VIDEO_WORKER_RELEASE_OUTPUT
  ? path.resolve(process.env.VIDEO_WORKER_RELEASE_OUTPUT)
  : path.join(root, ".next", "video-worker-release");
const packageJson = path.join(root, "package.json");
const packageLock = path.join(root, "package-lock.json");
const workerEntry = path.join(root, "scripts", "video-worker.ts");

function required(file, code) {
  if (!existsSync(file)) throw new Error(`${code}:${file}`);
}

required(packageJson, "WORKER_PACKAGE_JSON_MISSING");
required(packageLock, "WORKER_PACKAGE_LOCK_MISSING");
required(workerEntry, "WORKER_ENTRY_MISSING");
if (existsSync(outputDirectory)) throw new Error(`WORKER_OUTPUT_ALREADY_EXISTS:${outputDirectory}`);

mkdirSync(outputDirectory, { recursive: true });
cpSync(packageJson, path.join(outputDirectory, "package.json"));
cpSync(packageLock, path.join(outputDirectory, "package-lock.json"));

try {
  // Install from the root lockfile inside the exact release payload. This keeps
  // sharp and every platform-selected @img runtime package in one production
  // dependency closure instead of selectively copying packages after bundling.
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--omit=dev", "--ignore-scripts"], {
    cwd: outputDirectory,
    stdio: "inherit",
  });
  const esbuild = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  required(esbuild, "WORKER_ESBUILD_MISSING");
  execFileSync(esbuild, [
    workerEntry,
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node20",
    "--define:import.meta.url=__filename",
    "--external:sharp",
    `--outfile=${path.join(outputDirectory, "video-worker.cjs")}`,
  ], { stdio: "inherit" });
} catch (error) {
  rmSync(outputDirectory, { recursive: true, force: true });
  throw error;
}

const capacity = writeReleaseCapacityMetadata({ outputDirectory, component: "worker" });
console.log(`VIDEO_WORKER_RELEASE_PACKAGED output=${outputDirectory} candidateUnpackedBytes=${capacity.candidateUnpackedBytes}`);
