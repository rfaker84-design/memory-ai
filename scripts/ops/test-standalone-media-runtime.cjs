const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { existsSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const standalone = path.join(root, ".next", "standalone");
const runtime = mkdtempSync(path.join(os.tmpdir(), "memoryai-standalone-"));

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
  assert.ok(existsSync(path.join(standalone, "server.js")), "missing standalone server");
  cpSync(standalone, runtime, { recursive: true });
  cpSync(path.join(root, "public"), path.join(runtime, "public"), { recursive: true });
  mkdirSync(path.join(runtime, ".next"), { recursive: true });
  cpSync(path.join(root, ".next", "static"), path.join(runtime, ".next", "static"), { recursive: true });

  const runtimeRequire = createRequire(path.join(runtime, "server.js"));
  const cosEntry = runtimeRequire.resolve("cos-nodejs-sdk-v5");
  assert.ok(cosEntry.startsWith(runtime), "COS resolved outside the standalone runtime");
  assert.equal(runtimeRequire("cos-nodejs-sdk-v5/package.json").version, "3.0.0");
  assert.equal(typeof runtimeRequire("cos-nodejs-sdk-v5"), "function");
  assert.throws(() => runtimeRequire.resolve("request"), /Cannot find module/);

  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
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
  .finally(() => rmSync(runtime, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
