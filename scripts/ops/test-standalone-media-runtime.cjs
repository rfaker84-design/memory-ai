const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { mkdtempSync, rmSync } = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { packageStandaloneRuntime, readStandaloneManifest } = require("./standalone-runtime-layout.cjs");

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

  const port = await freePort();
  const child = spawn(process.execPath, ["run-standalone-from-manifest.cjs"], {
    cwd: runtime,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NODE_PATH: "",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: "postgresql://memoryai:password@127.0.0.1:5432/memoryai",
      AUTH_VERIFICATION_PEPPER: "p".repeat(32),
      SESSION_SECRET: "s".repeat(32),
      REFUND_REVIEW_ACCESS_TOKEN: "r".repeat(48),
      AUTH_ALLOWED_ORIGIN: `https://127.0.0.1:${port}`,
      AUTH_TRUST_NGINX_PROXY: "true",
      AUTH_PROXY_LOOPBACK_ONLY: "true",
      LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "standalone-test-key",
      DEEPSEEK_MODEL: "deepseek-chat",
    },
    stdio: "ignore",
  });
  try {
    await waitForServer(port, child);
    const optimized = await request(port, "/_next/image?url=%2Ficon-192.png&w=64&q=75");
    assert.equal(optimized.statusCode, 200, "standalone image optimization must succeed");
    assert.match(optimized.headers["content-type"] ?? "", /^image\//);
  } finally {
    await stopChild(child);
  }

  console.log(`STANDALONE_MEDIA_RUNTIME_PASS cos=${path.relative(runtime, cosEntry)}`);
}

main()
  .finally(() => rmSync(runtimeParent, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
