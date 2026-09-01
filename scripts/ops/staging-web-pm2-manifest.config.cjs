"use strict";

// Installed with the versioned Web promotion executor, never copied from a
// Worker release and never resolved through current/rollback symlinks.
const { existsSync } = require("node:fs");
const path = require("node:path");

const releaseRoot = process.env.MEMORYAI_RELEASE_ROOT;
const appName = process.env.MEMORYAI_PM2_APP_NAME;
const port = process.env.MEMORYAI_PORT;
const secretFile = process.env.MEMORYAI_STAGING_SECRET_FILE;
const wrapper = path.join(__dirname, "staging-web-secret-runtime-wrapper.cjs");
if (!releaseRoot || !path.isAbsolute(releaseRoot) || !appName || !/^memoryai-staging(?:-candidate-[a-z0-9-]+)?$/u.test(appName) || !/^(?:[1-9]\d{0,4})$/u.test(port ?? "") || Number(port) > 65535 || secretFile !== "/home/ubuntu/memoryai-staging/secrets/qwen-voice-clone.env" || process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT) {
  throw new Error("STAGING_WEB_PM2_MANIFEST_INPUT_INVALID");
}
for (const file of ["standalone-manifest.json", "run-standalone-from-manifest.cjs", wrapper]) {
  if (!existsSync(file === wrapper ? file : path.join(releaseRoot, file))) throw new Error("STAGING_WEB_PM2_MANIFEST_RUNTIME_INVALID");
}

module.exports = {
  apps: [{
    name: appName,
    cwd: releaseRoot,
    script: wrapper,
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "512M",
    env: {
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: port,
      AUTH_PROXY_LOOPBACK_ONLY: "true",
    },
    max_restarts: 10,
    min_uptime: "30s",
    restart_delay: 5000,
    kill_timeout: 10000,
    listen_timeout: 5000,
  }],
};
