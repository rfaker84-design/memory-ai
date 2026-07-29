const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { mkdtempSync, rmSync } = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { packageStandaloneRuntime, readStandaloneManifest } = require("./standalone-runtime-layout.cjs");
const { createStagingRuntimeTestEnvironment } = require("../test-support/staging-runtime-test-environment.cjs");

const root = path.resolve(__dirname, "../..");
const standalone = path.join(root, ".next", "standalone");
const runtimeParent = mkdtempSync(path.join(os.tmpdir(), "memoryai-standalone-"));
const runtime = path.join(runtimeParent, "runtime");

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname }, (response) => {
      response.resume();
      response.on("end", () => resolve(response));
    });
    req.on("error", reject);
  });
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(port, child) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`standalone exited early: ${child.exitCode}`);
    try {
      const response = await request(port, "/icon-192.png");
      if (response.statusCode === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("standalone did not start");
}

function startStandalone(port, environment) {
  const output = [];
  const child = spawn(process.execPath, ["run-standalone-from-manifest.cjs"], {
    cwd: runtime,
    env: {
      ...process.env,
      ...environment,
      NODE_PATH: "",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  return { child, output: () => output.join("") };
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

async function main() {
  const packaged = packageStandaloneRuntime({
    standaloneDirectory: standalone,
    outputDirectory: runtime,
    publicDirectory: path.join(root, "public"),
    staticDirectory: path.join(root, ".next", "static"),
  });
  const manifest = readStandaloneManifest(runtime);
  assert.equal(manifest.serverEntry, packaged.serverEntry);

  const runtimeRequire = createRequire(path.join(runtime, manifest.serverEntry));
  const cosEntry = runtimeRequire.resolve("cos-nodejs-sdk-v5");
  assert.ok(cosEntry.startsWith(runtime), "COS resolved outside the standalone runtime");
  assert.equal(runtimeRequire("cos-nodejs-sdk-v5/package.json").version, "3.0.0");
  assert.equal(typeof runtimeRequire("cos-nodejs-sdk-v5"), "function");
  assert.throws(() => runtimeRequire.resolve("request"), /Cannot find module/);

  const staging = createStagingRuntimeTestEnvironment();
  let started;
  let incomplete;
  try {
    const incompletePort = await freePort();
    const incompleteEnvironment = { ...staging.environment };
    // Override any host-inherited value so the negative path remains isolated.
    incompleteEnvironment.DEPLOYMENT_ENV = "";
    incomplete = startStandalone(incompletePort, incompleteEnvironment);
    await waitForServer(incompletePort, incomplete.child);
    const denied = await request(incompletePort, "/_next/image?url=%2Ficon-192.png&w=64&q=75");
    assert.equal(denied.statusCode, 500, "incomplete production staging contract must fail closed");
    assert.match(incomplete.output(), /DEPLOYMENT_ENV_INVALID/);
    await stopChild(incomplete.child);
    incomplete = undefined;

    const port = await freePort();
    started = startStandalone(port, staging.environment);
    await waitForServer(port, started.child);
    const icon = await request(port, "/icon-192.png");
    assert.equal(icon.statusCode, 200, "standalone public icon must be served");
    const optimized = await request(port, "/_next/image?url=%2Ficon-192.png&w=64&q=75");
    assert.equal(optimized.statusCode, 200, "standalone image optimization must succeed");
    assert.equal(optimized.headers["content-type"], "image/png");
    assert.doesNotMatch(started.output(), /DEPLOYMENT_ENV_INVALID/);
  } finally {
    if (incomplete) await stopChild(incomplete.child);
    if (started) await stopChild(started.child);
    staging.cleanup();
  }

  console.log(`STANDALONE_MEDIA_RUNTIME_PASS cos=${path.relative(runtime, cosEntry)}`);
}

main()
  .finally(() => rmSync(runtimeParent, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
