import assert from "node:assert/strict";
import test from "node:test";

import { legalHoldBlocksTask, legalHoldClaimPredicate } from "./legal-hold-scope";

test("a legal hold blocks only its explicit deletion scope while Session revocation remains immediate", () => {
  const financial = ["refund_dispute"];
  assert.equal(legalHoldBlocksTask("revoke_sessions", financial), false);
  assert.equal(legalHoldBlocksTask("content_online", financial), false);
  assert.equal(legalHoldBlocksTask("cos_provider", financial), false);
  assert.equal(legalHoldBlocksTask("backup_retention", financial), false);
  assert.equal(legalHoldBlocksTask("financial_archive", financial), true);
  assert.equal(legalHoldBlocksTask("audit_receipt", financial), true);
  assert.equal(legalHoldBlocksTask("content_online", ["content"]), true);
  assert.equal(legalHoldBlocksTask("financial_archive", ["content"]), false);
});

test("ambiguous legal-hold scopes fail closed and the claim predicate is static and scope-aware", () => {
  assert.equal(legalHoldBlocksTask("revoke_sessions", ["unknown_scope"]), false);
  assert.equal(legalHoldBlocksTask("content_online", ["unknown_scope"]), true);
  assert.equal(legalHoldBlocksTask("cos_provider", []), true);
  const predicate = legalHoldClaimPredicate("task", "request");
  assert.doesNotMatch(predicate, /task\.kind='revoke_sessions'/, "Session revocation is deliberately never a legal-hold blocker");
  assert.match(predicate, /refund_dispute/);
  assert.match(predicate, /hold_scope\.value NOT IN/);
  assert.doesNotMatch(predicate, /\$\{/);
});
