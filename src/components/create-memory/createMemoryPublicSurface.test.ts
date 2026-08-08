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

test("birth date is optional and, when supplied, is verified before adult eligibility consent", () => {
  assert.doesNotMatch(source, /stage === 0 && !birthDate/);
  assert.match(source, /if \(birthDate\) \{[\s\S]*?const profile = await saveAdultBirthDate\(birthDate\);[\s\S]*?await recordTrustConsent\("adult_eligibility"\)/);
  assert.match(source, /label="生日（可选）"/);
});
