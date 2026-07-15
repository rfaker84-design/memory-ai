import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Generated and untracked files are excluded by `git ls-files`. These are the
// only binary formats currently tracked; every other tracked file is audited.
const trackedBinaryExtensions = new Set([".png", ".webm"]);
const identityTerms = /phone|user(?:Id|_id)|session|token/i;
const storageCall = /(?:localStorage|sessionStorage)\.(?:getItem|setItem)/;

function trackedTextFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: process.cwd(),
    encoding: "buffer",
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
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
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!storageCall.test(line)) continue;
      const storageNeutralLine = line.replace(/localStorage|sessionStorage/g, "storage");
      assert.doesNotMatch(
        storageNeutralLine,
        identityTerms,
        `${file}:${index + 1} has identity storage access`,
      );
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
  for (const file of [
    "app-production/page.tsx",
    "app-production/chat/page.tsx",
    "app-production/memories/page.tsx",
    "app-production/profile/page.tsx",
  ]) {
    assert.match(read(file), /SessionGateUnavailable/);
  }
});
