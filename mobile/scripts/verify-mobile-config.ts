import config from "../capacitor.config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RELEASE_APP_HOSTNAME = "app.yijianmemory.cn";

if (config.appId !== "cn.yijianmemory.mobile" || config.webDir !== "dist") {
  throw new Error("Invalid native application identity or web directory.");
}
if (config.server?.url) {
  throw new Error("Packaged mobile builds must never contain a remote server.url.");
}
if (config.server?.hostname !== RELEASE_APP_HOSTNAME || config.server.androidScheme !== "https") {
  throw new Error("Release must use the packaged HTTPS App origin and no alternate hostname.");
}

const nativeConfigPath = resolve("android/app/src/main/assets/capacitor.config.json");
if (existsSync(nativeConfigPath)) {
  const nativeConfig = JSON.parse(readFileSync(nativeConfigPath, "utf8")) as {
    server?: { url?: string; hostname?: string; androidScheme?: string };
  };
  if (nativeConfig.server?.url) throw new Error("Android release config contains a remote server.url.");
  if (
    nativeConfig.server?.hostname !== RELEASE_APP_HOSTNAME
    || nativeConfig.server.androidScheme !== "https"
  ) {
    throw new Error("Android release config must use the packaged production App origin over HTTPS.");
  }
}

console.log("Release mobile configuration is local-package only; no remote server.url or Debug API is present.");
