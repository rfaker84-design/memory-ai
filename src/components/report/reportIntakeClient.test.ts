import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchReportJson, fetchReportRequest, prepareReportSubmission, ReportRequestError, type ReportDraft } from "./reportIntakeClient";

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

test("a report request timeout preserves the explicit in-memory retry boundary", async () => {
  await assert.rejects(
    fetchReportRequest("/api/reports", { method: "POST" }, ((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch, undefined, 1),
    (error) => error instanceof ReportRequestError && error.code === "REPORT_REQUEST_TIMEOUT",
  );
});

test("a stalled report JSON body also times out without creating a second submission", async () => {
  await assert.rejects(
    () => fetchReportJson("/api/reports", { method: "POST" }, (async (_input: URL | RequestInfo, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
    }) as unknown as Response) as unknown as typeof fetch, undefined, 1),
    (error) => error instanceof ReportRequestError && error.code === "REPORT_REQUEST_TIMEOUT",
  );
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
  assert.match(source, /fetchReportJson\("\/api\/reports"/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /void load\(controller\.signal\)/);
  assert.match(source, /if \(signal\?\.aborted\) return/);
});
