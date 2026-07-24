const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const startupEntries = [
  "package.json",
  "Dockerfile",
  "docker-compose.yml",
  "ecosystem.config.js",
  "worker/server.py",
  "scripts/deploy.sh",
  "scripts/deploy-production.sh",
  "scripts/safe-deploy.sh",
];

function parseCompose(source) {
  const parsed = yaml.load(source);
  assert.equal(typeof parsed, "object");
  assert.equal(typeof parsed.services, "object");
  return parsed;
}

function assertRedisIsInternalOnly(compose) {
  const redis = compose.services?.redis;
  assert.ok(redis, "Compose must define the Redis service");
  assert.notEqual(redis.network_mode, "host", "Redis must not use host networking");

  for (const port of redis.ports ?? []) {
    if (typeof port === "string" || typeof port === "number") {
      const published = String(port).split("/")[0];
      const parts = published.split(":");
      if (parts.length === 2) throw new Error("Redis publishes a host port without a loopback host IP");
      if (parts.length >= 3 && parts[0] !== "127.0.0.1") {
        throw new Error("Redis publishes a host port outside loopback");
      }
      continue;
    }
    if (port && typeof port === "object" && port.published !== undefined) {
      if (port.host_ip !== "127.0.0.1") {
        throw new Error("Redis long-syntax published port is not loopback-only");
      }
    }
  }
}

test("every tracked production startup entry is loopback-only", () => {
  for (const file of startupEntries) {
    assert.doesNotMatch(read(file), /0\.0\.0\.0|HOSTNAME\s*=\s*0\.0\.0\.0|-H\s+0\.0\.0\.0/, file);
  }

  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts.dev, /-H 127\.0\.0\.1 -p 3000/);
  assert.match(packageJson.scripts.start, /-H 127\.0\.0\.1 -p 3000/);
  assert.equal("lan" in packageJson.scripts, false);
  assert.match(read("Dockerfile"), /ENV HOSTNAME=127\.0\.0\.1/);
  assert.match(read("docker-compose.yml"), /127\.0\.0\.1:3000:3000/);
  assert.match(read("ecosystem.config.js"), /args: "start -H 127\.0\.0\.1 -p 3000"/);
  assert.match(read("worker/server.py"), /host="127\.0\.0\.1"/);
});

test("Docker standalone runtime starts only through its packaged manifest", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /npm run build && npm run package:standalone-rc/);
  assert.match(dockerfile, /\.next\/standalone-rc/);
  assert.match(dockerfile, /CMD \["node", "run-standalone-from-manifest\.cjs"\]/);
  assert.doesNotMatch(dockerfile, /CMD \["node", "server\.js"\]/);
});

test("Compose keeps Redis on the internal network only", () => {
  const compose = parseCompose(read("docker-compose.yml"));
  assertRedisIsInternalOnly(compose);
  assert.equal("ports" in compose.services.redis, false);
  assert.deepEqual(compose.services.redis.expose.map(String), ["6379"]);
});

test("Redis contract rejects unsafe short, long, and host-network configurations", () => {
  const unsafeFixtures = [
    "services:\n  redis:\n    ports:\n      - \"6379:6379\"\n",
    "services:\n  redis:\n    ports:\n      - \"0.0.0.0:6379:6379\"\n",
    "services:\n  redis:\n    ports:\n      - target: 6379\n        published: 6379\n        protocol: tcp\n",
    "services:\n  redis:\n    ports:\n      - target: 6379\n        published: 6379\n        host_ip: 0.0.0.0\n",
    "services:\n  redis:\n    network_mode: host\n",
  ];
  for (const fixture of unsafeFixtures) {
    assert.throws(() => assertRedisIsInternalOnly(parseCompose(fixture)));
  }
});

test("trusted proxy requires loopback attestation and Nginx replacement gates", () => {
  const requestSecurity = read("src/server/auth/request-security.ts");
  assert.match(requestSecurity, /AUTH_TRUST_NGINX_PROXY/);
  assert.match(requestSecurity, /AUTH_PROXY_LOOPBACK_ONLY/);

  for (const file of [
    "scripts/deploy.sh",
    "scripts/deploy-production.sh",
    "scripts/safe-deploy.sh",
  ]) {
    const source = read(file);
    assert.match(source, /nginx -T/);
    assert.match(source, /X-Real-IP/);
    assert.match(source, /\$remote_addr/);
    assert.match(source, /ss -H -ltn 'sport = :3000'/);
  }
});
