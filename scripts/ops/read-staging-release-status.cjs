"use strict";

const { createHostOperations, httpStatus } = require("./staging-web-immutable-executor.cjs");
const ROOT = "/home/ubuntu/memoryai-staging";

/** Reuse the existing executor's read-only inspection and verified manifests.
 * No promotion, reload, schema mutation, lock creation, or credential output.
 */
async function collectStagingWebStatus(expectedSourceSha, ports = {}) {
  if (!/^[a-f0-9]{40}$/.test(expectedSourceSha || "")) throw new Error("EXPECTED_SOURCE_SHA_REQUIRED");
  const inspect = ports.inspect || (() => createHostOperations({ root: ROOT, expectedSourceSha }).inspect());
  const health = ports.health || httpStatus;
  const observed = await inspect();
  const token = observed.pm2.environment.STAGING_ACCESS_TOKEN;
  const [health200, databaseHealth200] = await Promise.all([
    health(3100, "/api/health", token), health(3100, "/api/health/database", token),
  ]);
  // Reinspect after probes; a concurrent promotion invalidates this snapshot.
  const after = await inspect();
  const stable = observed.current.sha === after.current.sha
    && observed.rollback.sha === after.rollback.sha
    && observed.pm2.pid === after.pm2.pid
    && observed.pm2.execPath === after.pm2.execPath;
  const matchesExpectedSource = stable && after.current.sha === expectedSourceSha;
  return {
    observedAt: new Date().toISOString(), environment: "staging",
    status: matchesExpectedSource && health200 && databaseHealth200 ? "INCOMPLETE" : "BLOCKED",
    expectedSourceSha,
    web: { current: after.current.sha, rollback: after.rollback.sha, stable, matchesExpectedSource,
      manifestAndChecksumsVerified: true, online: after.pm2.status === "online", unstableRestarts: after.pm2.unstableRestarts,
      health200, databaseHealth200 },
    // No missing evidence is promoted to a PASS. The database health probe is
    // a connectivity check, not proof of migrations or a successful restore.
    worker: "UNKNOWN", schema: "UNKNOWN", capabilityFlags: "UNKNOWN",
    latestBackup: "UNKNOWN", alertDelivery: "UNKNOWN", lastRestore: "UNKNOWN",
    authenticatedProductAcceptance: "UNKNOWN", productionRelease: "NO_GO",
  };
}

if (require.main === module) {
  collectStagingWebStatus(process.argv[2]).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "BLOCKED" ? 1 : 2;
  }).catch((error) => {
    const code = /^WEB_[A-Z0-9_]+/.exec(String(error?.message))?.[0] || "STAGING_STATUS_UNAVAILABLE";
    console.error(JSON.stringify({ environment: "staging", status: "UNKNOWN", code }));
    process.exitCode = 1;
  });
}

module.exports = { collectStagingWebStatus };
