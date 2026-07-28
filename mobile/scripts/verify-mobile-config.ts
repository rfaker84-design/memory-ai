import config from "../capacitor.config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (config.appId !== "cn.yijianmemory.mobile" || config.webDir !== "dist") {
  throw new Error("Invalid native application identity or web directory.");
}
if (config.server?.url) {
  throw new Error("Packaged mobile builds must never contain a remote server.url.");
}

const nativeConfigPath = resolve("android/app/src/main/assets/capacitor.config.json");
if (existsSync(nativeConfigPath)) {
  const nativeConfig = JSON.parse(readFileSync(nativeConfigPath, "utf8")) as { server?: { url?: string } };
  if (nativeConfig.server?.url) throw new Error("Android release config contains a remote server.url.");
}

console.log("Mobile configuration is local-package only; no remote server.url is present.");
