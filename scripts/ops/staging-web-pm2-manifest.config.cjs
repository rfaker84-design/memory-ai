"use strict";

// Installed with the versioned Web promotion executor, never copied from a
// Worker release and never resolved through current/rollback symlinks.
const { existsSync } = require("node:fs");
const path = require("node:path");

const releaseRoot = process.env.MEMORYAI_RELEASE_ROOT;
const appName = process.env.MEMORYAI_PM2_APP_NAME;
if (!releaseRoot || !path.isAbsolute(releaseRoot) || !appName || !/^memoryai-staging(?:-candidate-[a-z0-9-]+)?$/u.test(appName)) {
  throw new Error("STAGING_WEB_PM2_MANIFEST_INPUT_INVALID");
}
for (const file of ["standalone-manifest.json", "run-standalone-from-manifest.cjs"]) {
  if (!existsSync(path.join(releaseRoot, file))) throw new Error("STAGING_WEB_PM2_MANIFEST_RUNTIME_INVALID");
}

module.exports = {
  apps: [{
    name: appName,
    cwd: releaseRoot,
    script: "run-standalone-from-manifest.cjs",
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "512M",
    env: {
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      AUTH_PROXY_LOOPBACK_ONLY: "true",
    },
    max_restarts: 10,
    min_uptime: "30s",
    restart_delay: 5000,
    kill_timeout: 10000,
    listen_timeout: 5000,
  }],
};
