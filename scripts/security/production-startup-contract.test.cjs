const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

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
