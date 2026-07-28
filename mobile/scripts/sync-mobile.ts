import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const channel = process.argv[2];
if (channel !== "debug" && channel !== "release") {
  throw new Error("Usage: tsx scripts/sync-mobile.ts <debug|release>");
}

const environment: NodeJS.ProcessEnv = { ...process.env, MOBILE_BUILD_CHANNEL: channel };
if (channel === "release") {
  delete environment.VITE_MOBILE_API_BASE_URL;
  delete environment.VITE_MOBILE_TEST_VIDEO_URL;
}

function run(script: string, args: string[]): void {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(resolve("node_modules", "vite", "bin", "vite.js"), ["build", ...(channel === "debug" ? ["--mode", "debug"] : [])]);
run(resolve("node_modules", "@capacitor", "cli", "bin", "capacitor"), ["sync", "android"]);
