import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { sourceAuditFiles } from "@/scripts/security/source-audit-files";

// Generated and untracked files are excluded by `git ls-files`. These are the
// only binary formats currently tracked; every other tracked file is audited.
const trackedBinaryExtensions = new Set([".jar", ".png", ".webm"]);
const identityTerms = /phone|user(?:Id|_id)|session|token/i;
const storageOperation = /(?:localStorage|sessionStorage)\s*(?:\.|\?\.)\s*(?:getItem|setItem)\s*\(\s*([\s\S]{0,240}?)(?:\)|$)/gi;
const legacyIdentityKeys = [
  ["yijian", "phone"].join("_"),
  ["yj", "phone"].join("_"),
  ["yijian", "session", "token"].join("_"),
  ["memoryai", "session", "token"].join("_"),
];

function identityStorageFindings(source: string): string[] {
  return Array.from(source.matchAll(storageOperation))
    .filter((match) => identityTerms.test(match[1]))
    .map((match) => match[0]);
}

function trackedTextFiles(): string[] {
  return sourceAuditFiles()
    // `git ls-files` intentionally retains an index entry until a deletion is
    // staged. Audit the current source tree rather than attempting to reopen a
    // removed file from the index.
    .filter((file) => fs.existsSync(path.resolve(file)))
    .filter((file) => !trackedBinaryExtensions.has(path.extname(file).toLowerCase()));
}

function decodeTrackedText(file: string): string {
  const buffer = fs.readFileSync(path.resolve(file));
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  assert.equal(buffer.includes(0), false, `${file} is binary but missing from the explicit exclusion set`);
  return buffer.toString("utf8");
}

test("all git-tracked text contains no Web Storage identity authority", () => {
  const files = trackedTextFiles();
  assert.ok(files.includes("PROJECT_CONTEXT.md"), "tracked documentation must be audited");
  assert.ok(files.some((file) => path.extname(file) === ""), "extensionless tracked text must be audited");

  for (const file of files) {
    const source = decodeTrackedText(file);
    assert.deepEqual(identityStorageFindings(source), [], `${file} has identity storage access`);
    for (const key of legacyIdentityKeys) {
      assert.equal(source.includes(key), false, `${file} contains legacy identity key ${key}`);
    }
  }
});

test("identity scanner detects multiline and adjacent-text storage authority", () => {
  const storageName = ["local", "Storage"].join("");
  const identityKey = ["yijian", "phone"].join("_");
  const multiline = `${storageName}\n  .getItem(\n    "${identityKey}"\n  )`;
  assert.equal(identityStorageFindings(multiline).length, 1);
});

test("tracked documentation does not describe browser storage or a phone as authority", () => {
  const authorityPatterns = [
    new RegExp(["手机号", "即身份"].join("[\\s\\S]{0,40}"), "i"),
    new RegExp(["手机号", "作为", "身份"].join("[\\s\\S]{0,40}"), "i"),
    new RegExp(
      ["(?:localStorage|sessionStorage|Web Storage)", "(?:权限来源|身份来源|认证来源|授权依据)"].join("[\\s\\S]{0,160}"),
      "i",
    ),
  ];
  for (const file of trackedTextFiles().filter((file) => [".md", ".txt", ".example", ""].includes(path.extname(file).toLowerCase()))) {
    const source = decodeTrackedText(file);
    for (const pattern of authorityPatterns) assert.doesNotMatch(source, pattern, file);
  }
});

test("legacy identity pages use formal Session or redirect to formal routes", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");
  assert.match(read("src/components/auth/SessionGateUnavailable.tsx"), /\/api\/auth\/session/);
  assert.match(read("app/(bond)/bond/page.tsx"), /\/memory-world/);
  assert.match(read("app/(dialogue)/dialogue/page.tsx"), /\/memory-chat\//);
  assert.match(read("app/memories/[id]/page.tsx"), /\/memory\//);
  assert.doesNotMatch(read("app/lib/user-journey.ts"), /supabase|localStorage|sessionStorage/i);
  for (const file of [
    "app-production/page.tsx",
    "app-production/chat/page.tsx",
    "app-production/memories/page.tsx",
    "app-production/profile/page.tsx",
  ]) {
    assert.match(read(file), /SessionGateUnavailable/);
  }
});
