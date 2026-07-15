import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const roots = ["app", "src"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const forbiddenKeys = [
  ["yijian", "phone"].join("_"),
  ["yj", "phone"].join("_"),
  ["yijian", "session"].join("_"),
  ["yj", "uid"].join("_"),
  ["yj", "sess"].join("_"),
];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

test("client source contains no localStorage or sessionStorage identity authority", () => {
  const files = roots.flatMap((root) => sourceFiles(path.resolve(root)));
  for (const file of files) {
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const key of forbiddenKeys) {
      assert.equal(source.includes(key), false, `${file} contains forbidden identity key ${key}`);
    }
    for (const line of source.split(/\r?\n/)) {
      if (!/(?:localStorage|sessionStorage)\.(?:getItem|setItem)/.test(line)) continue;
      const storageNeutralLine = line.replace(/localStorage|sessionStorage/g, "storage");
      assert.doesNotMatch(storageNeutralLine, /phone|user(?:Id|_id)|session|token/i, `${file} has identity storage access`);
    }
  }
});

test("legacy identity pages use formal Session or redirect to formal routes", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");
  assert.match(read("src/components/auth/SessionGateUnavailable.tsx"), /\/api\/auth\/session/);
  assert.match(read("app/(bond)/bond/page.tsx"), /\/memory-world/);
  assert.match(read("app/(dialogue)/dialogue/page.tsx"), /\/memory-chat\//);
  assert.match(read("app/memories/[id]/page.tsx"), /\/memory\//);
  assert.doesNotMatch(read("app/lib/user-journey.ts"), /supabase|localStorage|sessionStorage/i);
});
