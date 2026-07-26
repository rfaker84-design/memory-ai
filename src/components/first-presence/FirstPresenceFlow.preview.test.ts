import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flow = readFileSync("src/components/first-presence/FirstPresenceFlow.tsx", "utf8");
const styles = readFileSync("src/components/first-presence/FirstPresenceFlow.module.css", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
const publicPreview = readFileSync("src/components/memorial-preview/MemorialPreviewExperience.tsx", "utf8");
const chatPage = readFileSync("app/memory-chat/[id]/page.tsx", "utf8");
const conversation = readFileSync("src/components/first-presence/MemoryConversationScene.tsx", "utf8");
const conversationAdapter = readFileSync("src/components/first-presence/memoryConversationAdapter.ts", "utf8");
const recoveryClient = readFileSync("src/components/first-presence/creationRecoveryClient.ts", "utf8");
const mediaRecoveryGate = readFileSync("src/components/first-presence/CreationMediaRecoveryGate.tsx", "utf8");

test("immersive creation asks one question at a time and uses custom media entry points", () => {
  for (const copy of [
    "你想再次遇见谁？",
    "TA 与我的关系",
    "TA 如何称呼我",
    "TA 常说的一句话",
    "TA 的说话习惯",
    "一段共同回忆",
    "选择 TA 的照片",
    "选择真实声音",
  ]) {
    assert.match(flow, new RegExp(copy));
  }
  assert.match(flow, /switch \(questionIndex\)/);
  assert.match(flow, /没有声音也可以继续/);
  assert.match(flow, /没有照片时，会保留文字形象/);
  assert.match(flow, /className=\{styles\.fileInput\}/);
  assert.match(styles, /\.fileInput[\s\S]*clip-path: inset\(50%\)/);
  assert.match(styles, /\.memoryFragment/);
  assert.match(styles, /questionEnter/);
});

test("public preview is explicit and zero-write while the legacy preview remains production-gated", () => {
  assert.match(flow, /process\.env\.NODE_ENV !== "production"/);
  assert.match(flow, /NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true"/);
  assert.match(page, /MemorialPreviewExperience/);
  assert.match(page, /onPreview=\{\(\) => setStage\("preview"\)\}/);
  assert.match(publicPreview, /免费预览/);
  assert.match(publicPreview, /照片只在当前设备完成本次预览/);
  assert.doesNotMatch(publicPreview, /fetch\(|localStorage|sessionStorage|recordTrustConsent/);
  assert.match(flow, /开发预览 · 内容不保存/);
  assert.match(flow, /if \(previewMode\) return;[\s\S]*?fetch\("\/api\/auth\/session"/);
  assert.match(
    flow,
    /if \(previewMode && VISUAL_PREVIEW_ENABLED\) \{\s*setStage\("preview-forming"\);\s*return;/,
  );
  const previewRendering = flow.slice(flow.indexOf('stage === "preview-forming"'));
  assert.doesNotMatch(previewRendering, /fetch\(|recordTrustConsent|MemoryExperienceOffer/);
});

test("formal creation leaves React memory state for the stable owned chat URL", () => {
  assert.match(flow, /router\.replace\(`\/memory-chat\/\$\{encodeURIComponent\(payload\.id\)\}`\)/);
  assert.match(chatPage, /loadOwnedMemory\(id/);
  assert.match(chatPage, /loadOwnedMediaUrl\(memory\.photoAssetId/);
  assert.match(chatPage, /clearCreationRecovery\(\)/);
  assert.match(chatPage, /router\.replace\("\/login"\)/);
  assert.match(chatPage, /firstGreetingKey\(state\.memory\.id\)/);
  assert.match(chatPage, /CreationMediaRecoveryGate/);
  assert.match(mediaRecoveryGate, /MemoryConversationScene/);
  assert.doesNotMatch(chatPage, /completedConversationRounds/);
  assert.doesNotMatch(chatPage, /preferredAddress|catchPhrases|sharedMemory|userId/);
  assert.match(conversation, /restoreConversationWithFirstGreeting/);
  assert.match(
    conversation,
    /completedConversationRounds\(messages, activeSessionId\)/,
  );
  assert.match(conversation, /setActiveSessionId\(restored\.sessionId\)/);
  assert.match(conversationAdapter, /hasPersistedFirstGreeting\(restored\.messages\)/);
});

test("formal creation persists only a minimal recovery record and establishes the stable URL before media upload", () => {
  assert.match(flow, /writeCreationRecovery\(\{\s*idempotencyKey: idempotencyKey\.current,\s*phase: "creating"/);
  assert.match(flow, /recoverPendingCreation\(\)/);
  assert.match(recoveryClient, /request\("\/api\/memories\/recovery"/);
  assert.match(recoveryClient, /body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(flow, /\/api\/media\/upload/);
  assert.match(mediaRecoveryGate, /uploadCreationMedia\(memory\.id, file\)/);
  assert.match(mediaRecoveryGate, /人物资料已经保存。照片或声音尚未完成，你可以重新选择，或稍后补充。/);
  assert.match(
    mediaRecoveryGate,
    /if \(phase === "conversation"\) \{[\s\S]*?<MemoryConversationScene/,
  );
  assert.match(mediaRecoveryGate, /remainingMediaKinds\(record\.phase, Boolean\(memory\.photoAssetId\)\)/);
  assert.match(mediaRecoveryGate, /markTransientCreationMediaUploaded\(memory\.id, kind\)/);
  assert.match(mediaRecoveryGate, /clearCreationRecovery\(\)/);
});

test("portrait remains consistent and the offer appears only after the second exchange", () => {
  assert.match(flow, /setPortraitUrl\(url\)/);
  assert.match(flow, /URL\.revokeObjectURL\(localPortraitUrl\.current\)/);
  assert.match(flow, /stage === "preview-reveal"/);
  assert.match(flow, /stage === "preview-greeting"/);
  assert.match(flow, /stage === "preview-chat-one"/);
  assert.match(flow, /stage === "preview-chat-two"/);
  assert.match(flow, /MemoryAvatar image=\{portraitUrl\}/);
  const secondRound = flow.slice(flow.indexOf('stage === "preview-chat-two"'));
  assert.match(secondRound, /想继续和TA说说话/);
  assert.match(secondRound, /49元 · 30天 · 1个 TA · 100次 AI 回复/);
  const firstRound = flow.slice(
    flow.indexOf('stage === "preview-chat-one"'),
    flow.indexOf('stage === "preview-chat-two"'),
  );
  assert.doesNotMatch(firstRound, /49元/);
});

test("formal screens contain no development panel copy", () => {
  for (const forbidden of [
    "第 1 / 9 次回应",
    "已回应",
    "零网络写入",
    "不调用接口",
    "查看问候示例",
    "结束视觉预览",
    "购买入口视觉预览",
    "真实聊天或数字人",
  ]) {
    assert.doesNotMatch(flow, new RegExp(forbidden));
    assert.doesNotMatch(conversation, new RegExp(forbidden));
  }
});

test("failure, back navigation, and reduced motion preserve the current draft", () => {
  assert.match(flow, /系统不会重复创建 TA/);
  assert.match(flow, /router\.replace\(`\/memory-chat\//);
  assert.match(flow, /返回检查回答/);
  assert.match(flow, /setQuestionIndex\(\(current\) => current - 1\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.reduced \*/);
});
