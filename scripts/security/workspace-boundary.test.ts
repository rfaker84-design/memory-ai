import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { sourceAuditFiles } from "./source-audit-files";

const ROOT = process.cwd();
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const IMPORT_SPECIFIER = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function referencesMobileSource(file: string, specifier: string): boolean {
  if (specifier === "mobile" || specifier.startsWith("mobile/") || specifier === "@/mobile" || specifier.startsWith("@/mobile/")) {
    return true;
  }

  if (!specifier.startsWith(".")) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return resolved === "mobile" || resolved.startsWith("mobile/");
}

test("root TypeScript excludes the independently locked mobile workspace", () => {
  const tsconfig = JSON.parse(readFileSync(path.join(ROOT, "tsconfig.json"), "utf8").replace(/^\uFEFF/, "")) as { exclude?: string[] };
  assert.ok(tsconfig.exclude?.includes("mobile"), "root tsconfig must exclude mobile");
});

test("root Web/Core source does not import mobile source", () => {
  const violations: string[] = [];
  for (const file of sourceAuditFiles(ROOT)) {
    if (file.startsWith("mobile/") || !SOURCE_EXTENSION.test(file)) continue;
    const source = readFileSync(path.join(ROOT, file), "utf8");
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (referencesMobileSource(file, specifier)) violations.push(`${file} -> ${specifier}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("Capacitor and Vite remain in the mobile lockfile only", () => {
  const rootPackage = readFileSync(path.join(ROOT, "package.json"), "utf8");
  const rootLockfile = readFileSync(path.join(ROOT, "package-lock.json"), "utf8");
  assert.doesNotMatch(rootPackage, /"@capacitor\//);
  assert.doesNotMatch(rootPackage, /"vite"\s*:/);
  assert.doesNotMatch(rootLockfile, /node_modules\/@capacitor\//);
  assert.doesNotMatch(rootLockfile, /node_modules\/vite\//);
});
