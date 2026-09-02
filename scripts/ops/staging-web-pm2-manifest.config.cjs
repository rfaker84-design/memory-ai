"use strict";

// Installed with the versioned Web promotion executor, never copied from a
// Worker release and never resolved through current/rollback symlinks.
const { existsSync } = require("node:fs");
const path = require("node:path");

const releaseRoot = process.env.MEMORYAI_RELEASE_ROOT;
const appName = process.env.MEMORYAI_PM2_APP_NAME;
const port = process.env.MEMORYAI_PORT;
const sourceSha = process.env.MEMORYAI_RELEASE_SOURCE_SHA;
const secretFile = process.env.MEMORYAI_STAGING_SECRET_FILE;
const wrapper = path.join(__dirname, "staging-web-secret-runtime-wrapper.cjs");
const releaseSha = path.basename(path.dirname(releaseRoot ?? ""));
const releaseParent = path.basename(path.dirname(path.dirname(releaseRoot ?? "")));
const candidateName = /^memoryai-staging-candidate-([0-9a-f]{12})$/u.exec(appName ?? "");
const servingRole = appName === "memoryai-staging" && port === "3100";
const candidateRole = candidateName && port === "3110" && candidateName[1] === releaseSha.slice(0, 12);
if (!releaseRoot || !path.isAbsolute(releaseRoot) || releaseParent !== "releases" || !/^[0-9a-f]{40}$/u.test(releaseSha) || sourceSha !== releaseSha || !appName || (!servingRole && !candidateRole) || secretFile !== "/home/ubuntu/memoryai-staging/secrets/qwen-voice-clone.env" || process.env.DASHSCOPE_API_KEY !== undefined || process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT !== undefined || process.env.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED !== "false") {
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
      MEMORYAI_RELEASE_ROOT: releaseRoot,
      MEMORYAI_RELEASE_SOURCE_SHA: sourceSha,
      MEMORYAI_PM2_APP_NAME: appName,
      MEMORYAI_PORT: port,
      MEMORYAI_STAGING_SECRET_FILE: secretFile,
      MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "false",
    },
    max_restarts: 10,
    min_uptime: "30s",
    restart_delay: 5000,
    kill_timeout: 10000,
    listen_timeout: 5000,
  }],
};
