import type { CapacitorConfig } from "@capacitor/cli";

import { resolveMobileSessionContract } from "./build/session-origin";

const buildChannel = process.env.MOBILE_BUILD_CHANNEL === "debug" ? "debug" : "release";
const sessionContract = resolveMobileSessionContract(buildChannel, process.env);

const config: CapacitorConfig = {
  appId: "cn.yijianmemory.mobile",
  appName: "MemoryAI",
  webDir: "dist",
  // This changes Capacitor's local WebView origin only. It never loads a remote
  // page: server.url is intentionally absent and dist is copied into the APK.
  server: {
    hostname: sessionContract.appHostname,
    androidScheme: "https",
  },
};

export default config;
