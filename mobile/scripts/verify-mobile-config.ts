import config from "../capacitor.config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const RELEASE_APP_HOSTNAME = "app.yijianmemory.cn";
const RELEASE_FORBIDDEN_MARKERS = [
  "app.staging.yijianmemory.cn",
  "api.staging.yijianmemory.cn",
  "x-memoryai-staging-access",
  "staging_fixed_sms",
  "vite_mobile_staging_access_token",
];

function releaseAssetText(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const child = resolve(directory, entry.name);
      return entry.isDirectory() ? releaseAssetText(child) : readFileSync(child).toString("utf8");
    })
    .join("\n");
}

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

const nativeManifestPath = resolve("android/app/src/main/AndroidManifest.xml");
const nativeManifest = readFileSync(nativeManifestPath, "utf8");
if (!/android:allowBackup="false"/.test(nativeManifest)) {
  throw new Error("Android Release must disable system backup for session and memorial-content privacy.");
}
if (!/android:usesCleartextTraffic="false"/.test(nativeManifest)) {
  throw new Error("Android Release must explicitly reject cleartext traffic.");
}

const releaseAssetsPath = resolve("android/app/src/main/assets/public");
if (existsSync(releaseAssetsPath)) {
  const assets = releaseAssetText(releaseAssetsPath).toLowerCase();
  const forbidden = RELEASE_FORBIDDEN_MARKERS.find((marker) => assets.includes(marker));
  if (forbidden) throw new Error(`Android Release assets contain forbidden staging marker: ${forbidden}`);
}

console.log("Release mobile configuration is local-package only; no remote server.url, staging token, or Debug API is present.");
