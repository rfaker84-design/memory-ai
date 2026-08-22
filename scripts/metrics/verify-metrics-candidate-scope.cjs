const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const base = process.argv[2];
if (!/^[0-9a-f]{40}$/i.test(base || "")) throw new Error("USAGE: node verify-metrics-candidate-scope.cjs <approved-base-sha>");
const tracked = execFileSync("git", ["diff", "--name-only", base], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const paths = [...new Set([...tracked, ...untracked])].sort();
const exact = new Set([
  "app/page.tsx",
  "app/memory/[id]/encounter/page.tsx",
  "features/account-deletion/account-deletion-worker.ts",
  "features/account-deletion/account-deletion-worker-contract.test.ts",
  "package.json",
  "src/components/first-presence/FirstPresenceFlow.tsx",
  "src/components/first-presence/CommerceVideoCreditsEntry.tsx",
]);
const prefixes = [
  "app/api/product-interactions/",
  "database/migrations/030_",
  "database/migrations/031_",
  "database/tests/030-",
  "database/tests/031-",
  "database/verification/030-",
  "database/verification/031-",
  "docs/Deployment/immutable-artifact-release-runbook.md",
  "docs/product/MemoryAI_Metrics_Cost_Contract_v1.md",
  "features/product-metrics/",
  "scripts/metrics/",
  "scripts/ops/",
  "src/components/product-metrics/",
  "src/server/auth/metrics-anonymous-session",
];
for (const path of paths) {
  assert(!/\.(?:css|scss|less)$/i.test(path), `VISUAL_SCOPE_CSS_FORBIDDEN:${path}`);
  assert(!path.startsWith("src/components/create-memory/"), `CREATE_UI_FORBIDDEN:${path}`);
  assert(!path.startsWith("features/consent/"), `CONSENT_UI_FORBIDDEN:${path}`);
  assert(!/(?:provider|worker)/i.test(path) || path.startsWith("scripts/ops/") || path.startsWith("features/account-deletion/"), `WORKER_OR_PROVIDER_FORBIDDEN:${path}`);
  assert(exact.has(path) || prefixes.some((prefix) => path.startsWith(prefix)), `OUT_OF_SCOPE_PATH:${path}`);
}
console.log(JSON.stringify({ scope: "PASS", base, changedFiles: paths.length }));
