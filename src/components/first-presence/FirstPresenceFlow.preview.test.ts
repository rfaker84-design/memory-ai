import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flow = readFileSync("src/components/first-presence/FirstPresenceFlow.tsx", "utf8");
const styles = readFileSync("src/components/first-presence/FirstPresenceFlow.module.css", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
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
  ]) {
    assert.match(flow, new RegExp(copy));
  }
  assert.match(flow, /switch \(questionIndex\)/);
  assert.match(flow, /公开首发不收集声音、不录音，也不提供声音克隆/);
  assert.doesNotMatch(flow, /accept="audio\/\*"/);
  assert.doesNotMatch(flow, /voiceFile/);
  assert.match(flow, /没有照片时，会保留文字形象/);
  assert.match(flow, /className=\{styles\.fileInput\}/);
  assert.match(styles, /\.fileInput[\s\S]*clip-path: inset\(50%\)/);
  assert.match(styles, /\.memoryFragment/);
  assert.match(styles, /questionEnter/);
});

test("preview is explicit, zero-write, and production-gated", () => {
  assert.match(flow, /process\.env\.NODE_ENV !== "production"/);
  assert.match(flow, /NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true"/);
  assert.match(page, /initialStage="preview-create"/);
  assert.match(flow, /开发预览 · 内容不保存/);
  assert.match(flow, /if \(previewMode\) return;[\s\S]*?fetchAuthRequestJson\("\/api\/auth\/session"/);
  assert.match(
    flow,
    /if \(previewMode && VISUAL_PREVIEW_ENABLED\) \{\s*setStage\("preview-forming"\);\s*return;/,
  );
  const previewRendering = flow.slice(flow.indexOf('stage === "preview-forming"'));
  assert.doesNotMatch(previewRendering, /fetch\(|recordTrustConsent|MemoryExperienceOffer/);
});

test("home cold start is a disclosed static loading state, not a blank client-only screen", () => {
  assert.match(page, /function HomeLoadingFallback/);
  assert.match(page, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(page, /正在准备陪伴空间/);
  assert.match(page, /loading: \(\) => <HomeLoadingFallback \/>/);
  assert.match(page, /stage === "checking" && <HomeLoadingFallback \/>/);
  assert.match(page, /stage === "home" && homeState && \(/);
  assert.match(page, /<GuestExperience/);
  assert.match(page, /stage === "login" && <OriginalHomeLogin/);
});

test("direct SMS login exposes both policies and cannot request or verify without agreement", () => {
  const sendCode = flow.slice(flow.indexOf("const sendCode"), flow.indexOf("const verifyCode"));
  const verifyCode = flow.slice(flow.indexOf("const verifyCode"), flow.indexOf("const reviseText"));
  assert.match(sendCode, /resolveSmsLoginAction\(loginAgreementAccepted\)[\s\S]*?fetchAuthRequestJson\("\/api\/auth\/send-code"/);
  assert.match(verifyCode, /resolveSmsLoginAction\(loginAgreementAccepted\)[\s\S]*?fetchAuthRequestJson\("\/api\/auth\/verify-code"/);
  assert.match(verifyCode, /fetchAuthRequestJson\("\/api\/auth\/session"/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/session"[\s\S]*?fetch, controller\.signal/);
  assert.match(flow, /href="\/terms"/);
  assert.match(flow, /href="\/privacy"/);
  assert.match(flow, /disabled=\{!loginAgreementAccepted\}/);
  assert.doesNotMatch(flow, /localStorage[\s\S]{0,120}loginAgreementAccepted/);
});

test("formal creation leaves React memory state for the stable owned chat URL", () => {
  assert.match(flow, /await completeCreatedMemory\(payload\.id, idempotencyKey\.current\)/);
  assert.match(chatPage, /loadOwnedMemory\(id/);
  assert.match(chatPage, /loadOwnedMediaUrl\(memory\.photoAssetId/);
  assert.match(chatPage, /const load = useCallback/);
  assert.match(chatPage, /void load\(controller\.signal\)/);
  assert.match(chatPage, /\(state\.status === "timeout" \|\| state\.status === "error"\) && <button[^>]*onClick=\{\(\) => void load\(\)\}>重新读取<\/button>/);
  assert.match(chatPage, /error instanceof OwnedMemoryRequestError && error\.status === 408/);
  assert.match(chatPage, /state\.status === "timeout"/);
  assert.match(chatPage, /读取等待过久，尚未创建或修改任何内容。/);
  assert.match(chatPage, /clearCreationRecovery\(\)/);
  assert.match(chatPage, /router\.replace\("\/login"\)/);
  assert.match(chatPage, /firstGreetingKey\(state\.memory\.id\)/);
  assert.match(chatPage, /router\.replace\("\/companion"\)/);
  assert.doesNotMatch(chatPage, /onLeave=\{\(\) => router\.replace\("\/"\)\}/);
  assert.match(chatPage, /CreationMediaRecoveryGate/);
  assert.match(chatPage, /<MotionProvider>/);
  assert.match(mediaRecoveryGate, /MemoryConversationScene/);
  assert.doesNotMatch(chatPage, /completedConversationRounds/);
  assert.doesNotMatch(chatPage, /preferredAddress|catchPhrases|sharedMemory/);
  assert.match(conversation, /restoreConversationWithFirstGreeting/);
  assert.match(
    conversation,
    /completedConversationRounds\(messages, activeSessionId\)/,
  );
  assert.match(conversation, /setActiveSessionId\(restored\.sessionId\)/);
  assert.match(conversationAdapter, /hasPersistedFirstGreeting\(restored\.messages\)/);
});

test("formal creation uploads current selected media before the one stable chat navigation", () => {
  assert.match(flow, /writeCreationRecovery\(\{\s*idempotencyKey: idempotencyKey\.current,\s*phase: "creating"/);
  assert.match(flow, /recoverPendingCreation\(\)/);
  assert.match(recoveryClient, /fetchCreationJson\("\/api\/memories\/recovery"/);
  assert.match(recoveryClient, /body: JSON\.stringify\(\{\}\)/);
  assert.match(flow, /await uploadCurrentCreationMedia\(/);
  assert.match(flow, /await completeCreatedMemory\(payload\.id, idempotencyKey\.current\)/);
  const completion = flow.slice(flow.indexOf("const completeCreatedMemory"), flow.indexOf("const continueRecoveredCreation"));
  assert.match(completion, /await uploadCurrentCreationMedia\([\s\S]*?markCreationChatHandoff\(memoryId\)[\s\S]*?router\.replace\(`\/memory-chat\//);
  assert.match(flow, /creationOperationInFlight\.current/);
  assert.match(recoveryClient, /uploadPayload\.asset\.status !== "uploaded"/);
  assert.match(recoveryClient, /clearCreationRecovery\(storage\)/);
  assert.match(mediaRecoveryGate, /uploadCreationMedia\(memory\.id, file\)/);
  assert.match(mediaRecoveryGate, /人物资料已经保存。照片尚未完成，你可以重新选择，或稍后补充。/);
  assert.doesNotMatch(mediaRecoveryGate, /accept="audio\/\*"/);
  assert.match(
    mediaRecoveryGate,
    /if \(phase === "conversation"\) \{[\s\S]*?<MemoryConversationScene/,
  );
  assert.match(mediaRecoveryGate, /remainingMediaKinds\(record\.phase, Boolean\(memory\.photoAssetId\)\)/);
  assert.match(mediaRecoveryGate, /markTransientCreationMediaUploaded\(memory\.id, kind\)/);
  assert.match(mediaRecoveryGate, /clearCreationRecovery\(\)/);
});

test("handoff failures never enter a local conversation or local greeting", () => {
  const formalCreate = flow.slice(flow.indexOf("const createRealPresence"), flow.indexOf("useEffect(() => {", flow.indexOf("const createRealPresence")));
  assert.match(formalCreate, /if \(!writeCreationRecovery\(/);
  assert.match(formalCreate, /setStage\("network-failed"\)/);
  assert.doesNotMatch(formalCreate, /previewGreeting/);
  assert.match(mediaRecoveryGate, /if \(!record \|\| record\.memoryId !== memory\.id\)[\s\S]*?setPhase\("error"\)/);
  assert.match(chatPage, /const requiresMediaRecovery = readCreationRecovery\(\)\?\.memoryId === memory\.id/);
  assert.match(chatPage, /const creationChatHandoff = consumeCreationChatHandoff\(memory\.id\)/);
  assert.match(conversationAdapter, /fetchConversationJson\(`\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}\/first-greeting`/);
  assert.match(conversationAdapter, /CHAT_REQUEST_TIMEOUT/);
});

test("portrait remains consistent and the retired purchase card cannot render", () => {
  assert.match(flow, /setPortraitUrl\(url\)/);
  assert.match(flow, /URL\.revokeObjectURL\(localPortraitUrl\.current\)/);
  assert.match(flow, /stage === "preview-reveal"/);
  assert.match(flow, /stage === "preview-greeting"/);
  assert.match(flow, /stage === "preview-chat-one"/);
  assert.match(flow, /MemoryAvatar image=\{portraitUrl\}/);
  assert.match(flow, /MemoryButton onClick=\{leaveFlow\}/);
  assert.doesNotMatch(flow, /preview-chat-two|49元|previewOffer/);
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

test("continuous chat preserves the draft while offline and never auto-sends on reconnect", () => {
  assert.match(conversation, /网络已断开/);
  assert.match(conversation, /内容仍留在输入框/);
  assert.match(conversation, /刚才未送出的内容不会被自动发送/);
  assert.match(conversation, /window\.addEventListener\("offline"/);
  assert.match(conversation, /disabled=\{!draft\.trim\(\) \|\| isBusy \|\| phase === "error" \|\| networkOffline\}/);
});

test("ordinary chat offers pickup once per browser session and never writes it as a memory", () => {
  assert.match(conversation, /completedConversationRounds\(messages, activeSessionId\) < 1/);
  assert.match(conversation, /memoryai\.pickup-hint/);
  assert.match(conversation, /window\.sessionStorage\.setItem\(viewKey, "shown"\)/);
  assert.match(conversation, /这次先不用/);
  assert.match(conversation, /window\.sessionStorage\.setItem\(viewKey, "dismissed"\)/);
  assert.match(conversation, /\/memory\/\$\{memoryId\}\/pickup/);
  assert.doesNotMatch(conversation, /long-term-memories/);
});

test("greeting notification permission is optional and requires both a completed preview and completed chat round", () => {
  assert.match(conversation, /completedConversationRounds\(messages, activeSessionId\) < 1/);
  assert.match(conversation, /hasCompletedInitialPreview\(memoryId\)/);
  assert.match(conversation, /Notification\.permission !== "default"/);
  assert.match(conversation, /Notification\.requestPermission\(\)/);
  assert.match(conversation, /updateNotificationPreferences\(true\)/);
  assert.match(conversation, /忆见里有一份新的问候。/);
  assert.match(conversation, /不会显示 TA 姓名或内容/);
  assert.match(conversation, /memoryai\.greeting-notification-dismissed/);
  assert.doesNotMatch(conversation, /notification\/push/);
});

test("ordinary chat names the durable free-chat limit instead of presenting it as a transport failure", () => {
  assert.match(conversation, /error\.status === 429 && error\.message === "FREE_CHAT_DAILY_LIMIT_REACHED"/);
  assert.match(conversation, /今天的免费对话已用完；你可以明天再来。安全陪伴始终可用。/);
  assert.doesNotMatch(conversation, /FREE_CHAT_DAILY_LIMIT_REACHED[\s\S]{0,180}(?:购买|充值|订阅)/);
});
