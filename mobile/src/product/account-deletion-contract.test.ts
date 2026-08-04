import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile account deletion uses only the formal session-bound API and requires explicit confirmation", () => {
  assert.match(api, /getAccountDeletion\(\)[\s\S]*?"\/api\/account\/deletion"/);
  assert.match(api, /requestAccountDeletion\(\)[\s\S]*?confirmation: "DELETE_ACCOUNT"/);
  assert.match(app, /productApi\.getAccountDeletion\(\)/);
  assert.match(app, /deletionConfirming \? [\s\S]*?确认注销账户/);
  assert.match(app, /系统不会自动重试提交/);
  assert.doesNotMatch(app, /clear.*token.*注销|注销.*clear.*token/i);
});

test("fresh reauthentication returns to a manual deletion confirmation without auto-submitting", () => {
  assert.match(app, /error instanceof ProductApiError && error\.status === 403/);
  assert.match(app, /setResumeDeletionAfterLogin\(true\)/);
  assert.match(app, /if \(resumeDeletionAfterLogin\)[\s\S]*?setScreen\("profile"\)/);
  assert.match(app, /系统不会自动提交/);
});

test("unavailable deletion progress can only be explicitly reread, never auto-submitted", () => {
  assert.match(app, /deletionReadAttempt, setDeletionReadAttempt/);
  assert.match(app, /\[deletionReadAttempt, mode, screen\]/);
  assert.match(app, /deletionState === "unavailable"[\s\S]*?setDeletionReadAttempt\(\(current\) => current \+ 1\)\}>重新读取注销进度/);
  assert.doesNotMatch(app, /deletionState === "unavailable"[\s\S]{0,500}requestAccountDeletion\(/);
});
