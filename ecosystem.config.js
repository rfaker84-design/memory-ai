const { existsSync } = require("node:fs");
const path = require("node:path");

const releaseRoot = process.env.MEMORYAI_RELEASE_ROOT;
if (!releaseRoot || !path.isAbsolute(releaseRoot)) {
  throw new Error("MEMORYAI_RELEASE_ROOT_REQUIRED");
}
if (!existsSync(path.join(releaseRoot, "standalone-manifest.json"))
  || !existsSync(path.join(releaseRoot, "run-standalone-from-manifest.cjs"))) {
  throw new Error("MEMORYAI_MANIFEST_RUNTIME_REQUIRED");
}

// This is the sole PM2 application entry. The runtime directory is an
// immutable, manifest-directed release artifact; it is not a source checkout.
module.exports = {
  apps: [{
    name: "memoryai",
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
    error_file: "./logs/app-error.log",
    out_file: "./logs/app-out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    merge_logs: true,
    max_restarts: 10,
    min_uptime: "30s",
    restart_delay: 5000,
    kill_timeout: 10000,
    listen_timeout: 5000,
  }],
};
