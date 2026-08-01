#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const patterns = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["tencent_secret_id", /\bAKID[a-zA-Z0-9]{32,}\b/],
  ["openai_api_key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{20,}\b/],
];

function hasLikelyProductionDatabaseCredential(text) {
  return /postgres(?:ql)?:\/\/[^\s:@]+:(?!<[^>]+>|(?:secret|password|isolated|example|test|placeholder)(?:@|$))[^\s@]+@(?!(?:127\.0\.0\.1|localhost)(?::|\/|$))[^\s/]+/i.test(text);
}

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // The checked-in environment template deliberately contains commented
  // variable documentation. Scan its active assignments, while all source,
  // test and documentation comments remain subject to the full scan.
  const scannableText = file === ".env.example"
    ? text.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("#")).join("\n")
    : text;
  for (const [kind, pattern] of patterns) {
    if (pattern.test(scannableText)) findings.push({ file, kind });
  }
  if (hasLikelyProductionDatabaseCredential(scannableText)) findings.push({ file, kind: "production_database_credential" });
}

if (findings.length) {
  for (const finding of findings) console.error(`TRACKED_SECRET_PATTERN_FOUND file=${finding.file} kind=${finding.kind}`);
  process.exit(1);
}

console.log("TRACKED_SECRET_SCAN=PASS files=" + files.length);
