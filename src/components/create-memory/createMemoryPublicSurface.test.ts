import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/components/create-memory/CreateMemoryExperience.tsx"),
  "utf8",
);
const firstPresence = readFileSync(
  resolve(process.cwd(), "src/components/first-presence/FirstPresenceFlow.tsx"),
  "utf8",
);
const recoveryGate = readFileSync(
  resolve(process.cwd(), "src/components/first-presence/CreationMediaRecoveryGate.tsx"),
  "utf8",
);

test("public TA creation collects only a portrait, not an audio or voice-clone asset", () => {
  assert.match(source, /首发只收集你选择提交的照片和文字资料，不收集声音文件，也不提供声音克隆/);
  assert.match(source, /accept="image\/\*"/);
  assert.doesNotMatch(source, /accept="audio\/\*"/);
  assert.doesNotMatch(source, /选择声音文件/);
  for (const publicCreationSurface of [firstPresence, recoveryGate]) {
    assert.doesNotMatch(publicCreationSurface, /accept="audio\/\*"/);
    assert.doesNotMatch(publicCreationSurface, /voiceFile/);
  }
  assert.match(firstPresence, /公开首发不收集声音、不录音，也不提供声音克隆/);
});

test("creation copy keeps AI responses grounded in confirmed material", () => {
  assert.match(source, /未来回应越能贴近你确认的内容/);
  assert.match(source, /不是现实中的 TA/);
  assert.doesNotMatch(source, /逐渐清晰的存在体/);
});

test("birth date is required, explained, and verified before adult eligibility consent", () => {
  const validation = source.indexOf("const validationError = validateStage(1, draft, birthDate)");
  const validationReturn = source.indexOf("return;", validation);
  const submitting = source.indexOf("submitting.current = true", validation);
  const profileWrite = source.indexOf("saveAdultBirthDate(birthDate)", submitting);
  const consentWrite = source.indexOf('recordTrustConsent("adult_eligibility")', profileWrite);
  const recoveryWrite = source.indexOf("writeCreationRecovery", consentWrite);
  const memoryCreate = source.indexOf('fetchCreationJson("/api/memories"', recoveryWrite);

  assert.ok(validation >= 0);
  assert.ok(validation < validationReturn && validationReturn < submitting);
  assert.ok(submitting < profileWrite && profileWrite < consentWrite);
  assert.ok(consentWrite < recoveryWrite && recoveryWrite < memoryCreate);
  assert.match(source, /<span>TA 的生日<\/span>[\s\S]*?<input aria-label="TA 的生日" type="date"[\s\S]*?required/);
  assert.doesNotMatch(source, /生日（可选）/);
  assert.doesNotMatch(source, /if \(birthDate\)/);
});
