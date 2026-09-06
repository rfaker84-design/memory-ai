const assert = require("node:assert/strict");
const test = require("node:test");
const { collectStagingWebStatus } = require("./read-staging-release-status.cjs");
const sha = "a".repeat(40);
function observed(current = sha) {
  return { current: { sha: current, path: "/private/current" }, rollback: { sha: "b".repeat(40) },
    pm2: { pid: 1, status: "online", unstableRestarts: 0, execPath: "/private/runner", environment: { STAGING_ACCESS_TOKEN: "never-output-this", DATABASE_URL: "private-db" } } };
}
test("status projects verified web evidence without leaking secrets or claiming full readiness", async () => {
  const paths = [];
  const result = await collectStagingWebStatus(sha, { inspect: () => observed(), health: async (port, path, token) => {
    assert.equal(port, 3100); assert.equal(token, "never-output-this"); paths.push(path); return true;
  } });
  assert.deepEqual(paths.sort(), ["/api/health", "/api/health/database"]);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.schema, "UNKNOWN");
  assert.equal(result.productionRelease, "NO_GO");
  assert.doesNotMatch(JSON.stringify(result), /never-output-this|private|DATABASE_URL|STAGING_ACCESS_TOKEN/);
});
test("source mismatch and concurrent promotion block the snapshot", async () => {
  let reads = 0;
  const result = await collectStagingWebStatus(sha, { inspect: () => observed(reads++ === 0 ? sha : "c".repeat(40)), health: async () => true });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.web.stable, false);
});
test("missing expected source fails before host inspection", async () => {
  await assert.rejects(collectStagingWebStatus("main", { inspect: () => { assert.fail("must not inspect"); } }), /EXPECTED_SOURCE_SHA_REQUIRED/);
});
