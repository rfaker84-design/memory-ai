const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dataMap = readFileSync(path.join(__dirname, "data-map-and-retention-candidate.md"), "utf8");
const deletionContract = readFileSync(path.join(root, "docs/Security/account-deletion-contract.md"), "utf8");

test("candidate data map preserves the implemented content, provider, backup, and archive boundaries", () => {
  for (const expected of [
    "ACCOUNT_DELETION_CONTENT_RETENTION_DAYS",
    "ACCOUNT_DELETION_PROVIDER_RETENTION_DAYS",
    "ACCOUNT_DELETION_BACKUP_RETENTION_DAYS",
    "account_deletion_object_ledger",
    "financial_archive",
    "Vidu",
    "90",
  ]) {
    assert.match(dataMap, new RegExp(expected));
  }
  assert.match(deletionContract, /7, 30, and 90 days respectively/);
  assert.match(deletionContract, /must not restore photos, chat text,[\s\S]*voice or generated media to product access/);
});

test("candidate disclosure does not represent unverified Provider deletion as complete", () => {
  assert.match(dataMap, /Provider/);
  assert.match(dataMap, /SLA/);
  assert.match(deletionContract, /until Vidu[\s\S]*provides a documented deletion route or human-process receipt/);
  assert.match(deletionContract, /must[\s\S]*keep the provider task pending or blocked/);
});
