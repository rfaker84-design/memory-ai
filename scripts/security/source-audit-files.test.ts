import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sourceAuditFiles, sourceAuditRouteFiles } from "./source-audit-files";

test("source archive fallback is stable and excludes generated trees", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "memoryai-source-audit-"));
  mkdirSync(path.join(root, "app", "api", "health"), { recursive: true });
  mkdirSync(path.join(root, "mobile", "build"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "ignored"), { recursive: true });
  mkdirSync(path.join(root, ".next", "generated"), { recursive: true });
  writeFileSync(path.join(root, "app", "api", "health", "route.ts"), "export {}\n");
  writeFileSync(path.join(root, "mobile", "build", "session-origin.ts"), "export {}\n");
  writeFileSync(path.join(root, ".env.example"), "EXAMPLE_ONLY=true\n");
  writeFileSync(path.join(root, "node_modules", "ignored", "package.js"), "ignored\n");
  writeFileSync(path.join(root, ".next", "generated", "page.js"), "ignored\n");

  assert.deepEqual(sourceAuditFiles(root), [
    ".env.example",
    "app/api/health/route.ts",
    "mobile/build/session-origin.ts",
  ]);
  assert.deepEqual(sourceAuditRouteFiles(root), ["app/api/health/route.ts"]);
});

test("source archive fallback fails closed for a real environment file", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "memoryai-source-audit-"));
  writeFileSync(path.join(root, ".env.local"), "SECRET=not-for-archive\n");
  assert.throws(() => sourceAuditFiles(root), /SOURCE_AUDIT_REAL_ENVIRONMENT_FILE:\.env\.local/);
});
