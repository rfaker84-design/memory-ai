import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { prepareReportSubmission, type ReportDraft } from "./reportIntakeClient";

const draft: ReportDraft = {
  category: "rights",
  requestedAction: "review",
  details: "Please review this content concern.",
};

test("an unconfirmed report retry reuses only the exact in-memory draft key", () => {
  let calls = 0;
  const createKey = () => `report-test-key-${++calls}`;
  const first = prepareReportSubmission(null, draft, createKey);
  assert.equal(first.idempotencyKey, "report-test-key-1");
  assert.equal(prepareReportSubmission(first, { ...draft }, createKey), first);
  const changed = prepareReportSubmission(first, { ...draft, details: "A different concern." }, createKey);
  assert.equal(changed.idempotencyKey, "report-test-key-2");
  assert.notEqual(changed, first);
});

test("report retry recovery never persists complaint text to browser storage", () => {
  const source = readFileSync(new URL("./reportIntakeClient.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("report UI gates submission on a confirmed session and serializes an in-flight retry", () => {
  const source = readFileSync(new URL("./ReportIntake.tsx", import.meta.url), "utf8");
  assert.match(source, /暂时无法读取工单状态；尚未提交新的工单/);
  assert.match(source, /非登录状态的权利或隐私请求渠道尚未配置/);
  assert.match(source, /请勿向未核验地址发送身份材料、照片、声音或聊天内容/);
  assert.doesNotMatch(source, /下方正式邮箱/);
  assert.match(source, /loadState[\s\S]*"loading"[\s\S]*"ready"[\s\S]*"unauthenticated"[\s\S]*"unavailable"/);
  assert.match(source, /loadState === "unauthenticated"/);
  assert.match(source, /loadState === "unavailable"/);
  assert.match(source, /前往登录/);
  assert.match(source, /重新读取/);
  assert.match(source, /if \(submitting\) return/);
  assert.match(source, /disabled=\{submitting\}/);
});
