import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const creationSource = readFileSync(new URL("./product/creation-flow.ts", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./product/api.ts", import.meta.url), "utf8");

test("mobile shell labels AI memorial conversation and never makes a living-presence claim", () => {
  assert.match(source, /AI纪念陪伴/);
  assert.match(source, /AI生成 · 基于已确认资料/);
  assert.match(source, /message\.role === "assistant" && <>\s*<small>AI生成 · 基于已确认资料<\/small>/);
  assert.doesNotMatch(source, /我在。关于|我一直在听|TA 在这里|让 TA 出现|继续相见/);
});

test("public TA creation is photo-only and clearly does not record or upload voice", () => {
  assert.doesNotMatch(source, /照片与声音/);
  assert.match(source, /不录音或上传声音/);
  assert.match(creationSource, /media\.every\(isPhoto\)/);
  assert.match(creationSource, /assertPhotoOnly\(pending\.media\)/);
  assert.doesNotMatch(apiSource, /"audio\/(?:mpeg|wav|ogg|mp4)"/);
});

test("mobile offline state does not claim an unsent draft was durably saved", () => {
  assert.match(source, /未送出的内容不会自动发送/);
  assert.doesNotMatch(source, /你已写下的内容会留在这里/);
});

test("mobile reconnect retries the session-bound restore flow instead of only navigating to welcome", () => {
  assert.match(source, /const \[reconnectAttempt, setReconnectAttempt\] = useState\(0\)/);
  assert.match(source, /\[applyOwnedMemories, loadOwnedMemories, reconnectAttempt\]/);
  assert.match(source, /setReconnectAttempt\(\(current\) => current \+ 1\)/);
  assert.doesNotMatch(source, /<Offline retry=\{\(\) => setScreen\(navigator\.onLine \? "welcome" : "offline"\)\}/);
});

test("a failed authenticated cold start remains explicitly unavailable instead of looking logged out", () => {
  assert.match(source, /type Screen = [\s\S]*?"unavailable"/);
  assert.match(source, /if \(active\) setScreen\("unavailable"\);/);
  assert.match(source, /暂时无法读取服务状态/);
  assert.match(source, /不会切换为预览，也不会自动发送、创建或修改任何内容/);
  assert.match(source, /if \(screen === "unavailable"\) return <ServiceUnavailable/);
});

test("a failed ordinary chat request retains the draft and never represents it as sent", () => {
  const start = source.indexOf("const sendQuestion = async () => {");
  const end = source.indexOf("const resetPickupDraft", start);
  const sendQuestion = source.slice(start, end);
  assert.match(sendQuestion, /const idempotencyKey = questionIdempotencyKey \?\? `mobile-chat-\$\{crypto\.randomUUID\(\)\}`/);
  assert.ok(sendQuestion.indexOf("await productApi.askMemory(memory.id, value, idempotencyKey);") < sendQuestion.indexOf("setQuestion(\"\");"));
  assert.match(sendQuestion, /setQuestionIdempotencyKey\(idempotencyKey\)/);
  assert.match(sendQuestion, /setQuestionIdempotencyKey\(null\)/);
  assert.match(source, /onChange=\{\(event\) => \{ setQuestion\(event\.target\.value\); setQuestionIdempotencyKey\(null\); \}\}/);
  assert.match(sendQuestion, /catch \(error\) \{ setQuestion\(value\); setNotice\(`\$\{friendlyError\(error\)\} Your message was not confirmed as sent\.`\); \}/);
});
