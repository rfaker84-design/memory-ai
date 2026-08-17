"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

import { MemoryButton } from "../memory-ui";
import { CompanionMotionBackground } from "../companion/CompanionMotionBackground";
import { resolveConversationMotionVariant } from "../companion/companionMotionState";
import { recordBusinessView } from "../business-metrics/businessMetricsClient";
import { CommerceVideoCreditsEntry } from "./CommerceVideoCreditsEntry";
import { stageChatPickupDraft } from "../memory/pickupDraftHandoff";
import { updateNotificationPreferences } from "../trust/notificationPreferencesClient";
import { CRISIS_RESPONSE } from "@/features/memory-engine/crisis-response";
import {
  completedConversationRounds,
  hasPersistedFirstGreeting,
} from "../memory/conversationExperience";
import { useReducedMotion } from "../../motion";
import { useQuietCompanionPresence } from "./quietCompanionPresence";
import { assistanceExplanation, hasExplicitAssistanceRequest } from "@/features/understanding-assistance/understanding-assistance";
import {
  hasPersistedPendingConversationMessage,
  type PendingConversationMessage,
} from "./memoryConversationRecovery";
import {
  REPLY_CORRECTION_REASONS,
  appendConfirmedCorrection,
  createReplyCorrectionSuggestion,
  type ReplyCorrectionReason,
  type ReplyCorrectionSuggestion,
} from "./memoryReplyCorrection";

import {
  ConversationMessage,
  ConversationRequestError,
  fetchConversationJson,
  hasCompletedInitialPreview,
  loadConversation,
  restoreConversationWithFirstGreeting,
  sendConversationMessage,
} from "./memoryConversationAdapter";
import styles from "./MemoryConversationScene.module.css";

type ConversationPhase = "loading" | "greeting" | "ready" | "sending" | "replying" | "recovering" | "error";
type PendingMessage = PendingConversationMessage;
type CorrectionPhase = "idle" | "saving";
type NotificationPromptState = "hidden" | "available" | "requesting" | "granted" | "denied";
type FormalMemoryProfile = {
  personalityProfile?: string | null;
  speechStyle?: string | null;
};

type Props = {
  memoryId: string;
  memoryName: string;
  firstGreetingKey: string;
  initialPortraitUrl?: string | null;
  onLeave: () => void;
};

function createMessageIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `message-${random}`;
}

function readableFailure(error: unknown) {
  if (error instanceof ConversationRequestError && error.status === 401) return "登录状态已失效。为了保护这段对话，请重新完成登录。";
  if (error instanceof ConversationRequestError && error.status === 404) return "暂时找不到这段记忆，请回到首页重新进入。";
  if (error instanceof ConversationRequestError && error.status === 429 && error.message === "FREE_CHAT_DAILY_LIMIT_REACHED") return "今天的免费对话已用完；你可以明天再来。安全陪伴始终可用。";
  if (error instanceof ConversationRequestError && error.status === 503) return "此刻还没有收到回应。你刚才的话仍留在这里。";
  if (error instanceof ConversationRequestError && error.status === 408) return "请求等待过久。先找回刚才的对话，再由你决定是否重试。";
  return "连接暂时中断。先找回这段对话，再决定是否重试。";
}

function pickupHintViewKey(value: string): string {
  // Presentation only: this opaque key never grants identity or API access.
  return `memoryai.pickup-hint:${value}`;
}

function notificationPromptDismissalKey(memoryId: string): string {
  return `memoryai.greeting-notification-dismissed:${memoryId}`;
}

function isSafetyAssistantMessage(message: ConversationMessage): boolean {
  return message.role === "assistant" && message.content === CRISIS_RESPONSE;
}

function supportRequestId(error: unknown): string | null {
  return error instanceof ConversationRequestError && error.requestId ? error.requestId : null;
}

export function MemoryConversationScene({ memoryId, memoryName, firstGreetingKey, initialPortraitUrl = null, onLeave }: Props) {
  const reducedMotion = useReducedMotion();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConversationPhase>("loading");
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [notice, setNotice] = useState("");
  const [failureRequestId, setFailureRequestId] = useState<string | null>(null);
  const [assistanceOfferVisible, setAssistanceOfferVisible] = useState(false);
  const [networkOffline, setNetworkOffline] = useState(false);
  const [pickupSuggestionVisible, setPickupSuggestionVisible] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState<ConversationMessage | null>(null);
  const [correctionReason, setCorrectionReason] = useState<ReplyCorrectionReason>("称呼不对");
  const [correctionDetail, setCorrectionDetail] = useState("");
  const [correctionSuggestion, setCorrectionSuggestion] = useState<ReplyCorrectionSuggestion | null>(null);
  const [correctionPhase, setCorrectionPhase] = useState<CorrectionPhase>("idle");
  const [correctionError, setCorrectionError] = useState("");
  const [notificationPrompt, setNotificationPrompt] = useState<NotificationPromptState>("hidden");
  const portraitUrl = initialPortraitUrl;
  const [controlsVisible, setControlsVisible] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const correctionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const correctionCloseRef = useRef<HTMLButtonElement | null>(null);
  const inFlightRef = useRef(false);
  const retryCandidateRef = useRef<PendingMessage | null>(null);
  const greetingViewedRef = useRef(false);
  const replyPulseTimer = useRef<number | null>(null);
  const notificationEligibilityCheckedRef = useRef(false);
  const [replyPulse, setReplyPulse] = useState(false);
  const titleId = useId();

  const restore = useCallback(async (signal?: AbortSignal) => {
    const snapshot = await loadConversation(memoryId, signal);
    setActiveSessionId(snapshot.sessionId);
    setMessages(snapshot.messages);
    return snapshot.messages;
  }, [memoryId]);

  const loadOrRequestGreeting = useCallback(async (signal?: AbortSignal) => {
    setPhase("loading");
    setNotice("");
    setFailureRequestId(null);
    try {
      setPhase("greeting");
      const restored = await restoreConversationWithFirstGreeting(
        memoryId,
        firstGreetingKey,
        signal,
      );
      setActiveSessionId(restored.sessionId);
      setMessages(restored.messages);
      setPhase("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setNotice(readableFailure(error));
      setFailureRequestId(supportRequestId(error));
      setPhase("error");
    }
  }, [firstGreetingKey, memoryId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrRequestGreeting(controller.signal);
    return () => controller.abort();
  }, [loadOrRequestGreeting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const disconnected = () => {
      setNetworkOffline(true);
      setNotice("网络已断开。你可以继续阅读这段对话；恢复连接后再由你决定是否发送。");
    };
    const reconnected = () => {
      setNetworkOffline(false);
      setNotice("网络已恢复。刚才未送出的内容不会被自动发送。");
    };
    if (!navigator.onLine) disconnected();
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", reconnected);
    return () => {
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", reconnected);
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId || completedConversationRounds(messages, activeSessionId) < 1 || typeof window === "undefined") return;
    const viewKey = pickupHintViewKey(activeSessionId);
    if (completedConversationRounds(messages, activeSessionId) > 1) {
      // Continuing the conversation without choosing the suggestion is an
      // explicit product-level ignore for this session, not a repeated prompt.
      window.sessionStorage.setItem(viewKey, "dismissed");
      setPickupSuggestionVisible(false);
      return;
    }
    // The suggestion is deliberately a single, non-blocking invitation. A
    // refresh, navigation away, or simply carrying on elsewhere counts as
    // ignoring it; reopening this session must not turn silence into a nudge.
    if (window.sessionStorage.getItem(viewKey)) {
      setPickupSuggestionVisible(false);
      return;
    }
    window.sessionStorage.setItem(viewKey, "shown");
    setPickupSuggestionVisible(true);
  }, [activeSessionId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [messages, pendingMessage, phase, reducedMotion]);

  useEffect(() => {
    if (phase === "ready" && controlsVisible) inputRef.current?.focus();
  }, [controlsVisible, phase]);

  useEffect(() => {
    if (!greetingViewedRef.current && hasPersistedFirstGreeting(messages)) {
      greetingViewedRef.current = true;
      recordBusinessView("first_greeting_viewed", memoryId);
    }
  }, [memoryId, messages]);

  useEffect(() => {
    if (notificationEligibilityCheckedRef.current || !activeSessionId || completedConversationRounds(messages, activeSessionId) < 1) return;
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "default") return;
    if (window.sessionStorage.getItem(notificationPromptDismissalKey(memoryId)) === "dismissed") return;
    notificationEligibilityCheckedRef.current = true;
    let live = true;
    void hasCompletedInitialPreview(memoryId).then((completed) => {
      if (live && completed) setNotificationPrompt("available");
    }).catch(() => {
      // A notification preference is never important enough to surface an
      // unrelated read failure or to infer a completed preview locally.
    });
    return () => { live = false; };
  }, [activeSessionId, memoryId, messages]);

  const requestGreetingNotifications = async () => {
    if (notificationPrompt !== "available" || typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPrompt("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationPrompt("denied");
        return;
      }
      const saved = await updateNotificationPreferences(true);
      setNotificationPrompt(saved.greetingNotificationsEnabled ? "granted" : "denied");
    } catch {
      setNotificationPrompt("denied");
    }
  };

  useEffect(() => {
    if (controlsVisible || !hasPersistedFirstGreeting(messages)) return;
    const timer = window.setTimeout(
      () => setControlsVisible(true),
      reducedMotion ? 0 : 760,
    );
    return () => window.clearTimeout(timer);
  }, [controlsVisible, messages, reducedMotion]);

  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== "assistant" || reducedMotion) return;
    setReplyPulse(true);
    if (replyPulseTimer.current) window.clearTimeout(replyPulseTimer.current);
    replyPulseTimer.current = window.setTimeout(() => setReplyPulse(false), 900);
    return () => { if (replyPulseTimer.current) window.clearTimeout(replyPulseTimer.current); };
  }, [messages, reducedMotion]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || inFlightRef.current || phase !== "ready") return;
    if (hasExplicitAssistanceRequest(message)) {
      setDraft("");
      setAssistanceOfferVisible(true);
      setNotice("");
      return;
    }
    if (networkOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setNetworkOffline(true);
      setNotice("当前离线，内容仍留在输入框；恢复连接后请由你决定是否发送。");
      return;
    }

    const retryCandidate = retryCandidateRef.current;
    const idempotencyKey = retryCandidate?.content === message
      ? retryCandidate.idempotencyKey
      : createMessageIdempotencyKey();
    retryCandidateRef.current = null;
    inFlightRef.current = true;
    setDraft("");
    setPendingMessage({ content: message, idempotencyKey });
    setNotice("");
    setFailureRequestId(null);
    setPhase("sending");
    const replyingTimer = window.setTimeout(() => setPhase("replying"), reducedMotion ? 0 : 360);

    try {
      const admission = await sendConversationMessage(memoryId, message, idempotencyKey);
      await restore();
      setPendingMessage(null);
      setPhase("ready");
      if (admission.freeChatWarning) {
        setNotice("今天的免费陪伴次数快用完了。你仍可以慢慢说；危机支持不受这个限制。");
      }
    } catch (error) {
      inFlightRef.current = false;
      setFailureRequestId(supportRequestId(error));
      setNotice(`${readableFailure(error)} 已保留原文，但不会自动重发。`);
      setPhase("error");
    } finally {
      window.clearTimeout(replyingTimer);
      inFlightRef.current = false;
    }
  };

  const recoverConversation = async () => {
    if (!pendingMessage) return;
    const candidate = pendingMessage;
    inFlightRef.current = true;
    setPhase("recovering");
    setNotice("");
    setFailureRequestId(null);
    try {
      const restored = await restore();
      if (hasPersistedPendingConversationMessage(restored, candidate)) {
        retryCandidateRef.current = null;
        setPendingMessage(null);
        setPhase("ready");
        setNotice("这句话已经留在对话里了。");
      } else {
        setPhase("error");
        retryCandidateRef.current = candidate;
        setDraft(candidate.content);
        setPendingMessage(null);
        setPhase("ready");
        setNotice("这句话还没有出现在对话里。原文已经放回输入框，由你决定是否再送一次。");
      }
    } catch (error) {
      setPhase("error");
      setNotice(readableFailure(error));
      setFailureRequestId(supportRequestId(error));
    } finally {
      inFlightRef.current = false;
    }
  };

  const retryGreetingRecovery = () => {
    void loadOrRequestGreeting();
  };

  const dismissPickupSuggestion = () => {
    if (activeSessionId && typeof window !== "undefined") {
      const viewKey = pickupHintViewKey(activeSessionId);
      window.sessionStorage.setItem(viewKey, "dismissed");
    }
    setPickupSuggestionVisible(false);
  };

  const closeReplyCorrection = useCallback(() => {
    setCorrectionMessage(null);
    setCorrectionSuggestion(null);
    setCorrectionError("");
    // The correction panel is intentionally non-modal: chat remains readable,
    // but keyboard users should return to the exact reply they corrected.
    queueMicrotask(() => correctionTriggerRef.current?.focus());
  }, []);

  const openReplyCorrection = (message: ConversationMessage, trigger: HTMLButtonElement) => {
    correctionTriggerRef.current = trigger;
    setCorrectionMessage(message);
    setCorrectionReason("称呼不对");
    setCorrectionDetail("");
    setCorrectionSuggestion(null);
    setCorrectionError("");
  };

  useEffect(() => {
    if (!correctionMessage) return;
    correctionCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && correctionPhase !== "saving") {
        event.preventDefault();
        closeReplyCorrection();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeReplyCorrection, correctionMessage, correctionPhase]);

  const generateReplyCorrectionSuggestion = () => {
    if (!correctionMessage) return;
    const suggestion = createReplyCorrectionSuggestion(
      correctionReason,
      correctionDetail,
      correctionMessage.content,
    );
    if (!suggestion) {
      setCorrectionError("请先写下你确认的正确说法或资料，不会替你猜测。");
      return;
    }
    setCorrectionError("");
    setCorrectionSuggestion(suggestion);
  };

  const confirmReplyCorrection = async () => {
    if (!correctionSuggestion || correctionPhase === "saving") return;
    setCorrectionPhase("saving");
    setCorrectionError("");
    try {
      const { response: currentResponse, body: current } = await fetchConversationJson(`/api/memories/${encodeURIComponent(memoryId)}`, {
        credentials: "same-origin",
      });
      if (!currentResponse.ok) throw new Error("memory-read-failed");
      const currentProfile = current as FormalMemoryProfile;
      const field = correctionSuggestion.field;
      const currentValue = currentProfile[field];

      // A retry after an uncertain response first checks the formal profile,
      // so it cannot append the same user-confirmed correction twice.
      if (!currentValue?.includes(correctionSuggestion.text)) {
        const { response: updateResponse } = await fetchConversationJson(`/api/memories/${encodeURIComponent(memoryId)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            [field]: appendConfirmedCorrection(currentValue, correctionSuggestion.text),
          }),
        });
        if (!updateResponse.ok) throw new Error("memory-update-failed");
      }

      closeReplyCorrection();
      setNotice("你的校正已写入 TA 的已确认资料；历史对话没有被改写。");
    } catch {
      setCorrectionError("校正尚未写入。请稍后重试；在确认保存前，TA 的资料不会改变。");
    } finally {
      setCorrectionPhase("idle");
    }
  };

  const isBusy = phase === "loading" || phase === "greeting" || phase === "sending" || phase === "replying" || phase === "recovering";
  const conversationPresenceVariant = resolveConversationMotionVariant({
    phase,
    draft,
    hasPendingMessage: Boolean(pendingMessage),
  });
  const quietPresence = useQuietCompanionPresence({
    reducedMotion: reducedMotion || assistanceOfferVisible,
    replying: conversationPresenceVariant !== "idle" || replyPulse,
  });
  const completedRounds = completedConversationRounds(messages, activeSessionId);
  const status = phase === "sending" ? "正在送出这句话…" : phase === "replying" ? "忆见正在整理回复…" : phase === "greeting" ? "忆见正在生成第一句回复…" : phase === "recovering" ? "正在找回刚才的对话…" : "";

  return (
    <section className={`${styles.scene} ${reducedMotion ? styles.reduced : ""}`} aria-labelledby={titleId}>
      <section className={styles.presence} data-presence={quietPresence} aria-label={`${memoryName} 的生活场景`}>
        <div className={styles.portraitFrame} role="img" aria-label={portraitUrl ? `${memoryName} 的照片` : `${memoryName} 的文字形象`}>
          {portraitUrl ? (
            <CompanionMotionBackground
              className={styles.portraitMotion}
              memoryId={memoryId}
              portraitUrl={portraitUrl}
              variant={draft.trim() ? "attentive" : "idle"}
              motionEnabled={!reducedMotion}
            />
          ) : (
            <span className={styles.portraitInitials}>{Array.from(memoryName).slice(0, 2).join("")}</span>
          )}
          <span className={styles.sceneVeil} aria-hidden="true" />
        </div>

        <p className={styles.brand} aria-label="忆见">忆见</p>
        <header className={styles.identity}>
          <h1 id={titleId}>{memoryName}</h1>
          <span role="note">AI生成 · 基于你确认的记忆</span>
        </header>
      </section>

      <div className={styles.conversation}>
        {notificationPrompt === "available" && (
          <aside className={styles.notificationPrompt} aria-label="问候通知选择">
            <p>如果你愿意，可以在这里开启忆见的问候提醒。锁屏提醒只会显示“忆见里有一份新的问候。”，不会显示 TA 姓名或内容。</p>
            <MemoryButton variant="secondary" onClick={() => void requestGreetingNotifications()}>开启问候提醒</MemoryButton>
            <button type="button" className={styles.notificationDismiss} onClick={() => {
              window.sessionStorage.setItem(notificationPromptDismissalKey(memoryId), "dismissed");
              setNotificationPrompt("hidden");
            }}>现在不用</button>
          </aside>
        )}
        {notificationPrompt === "granted" && <p className={styles.status} role="status">已允许此设备的问候提醒并保存账号偏好。提醒只会显示“忆见里有一份新的问候。”，不会显示 TA 姓名或内容；你可以随时在陪伴安全设置中关闭。</p>}
        {notificationPrompt === "denied" && <p className={styles.status} role="status">提醒未开启；这不会影响你在忆见中的阅读和对话。</p>}

        {status && <p className={styles.status} role="status" aria-live="polite">{status}</p>}
        {notice && <p className={styles.alert} role="alert">{notice}</p>}
        {assistanceOfferVisible && <aside className={styles.safetyActions} aria-label="忆见理解与协助">
          <p><strong>忆见理解与协助</strong>：{assistanceExplanation}</p>
          <button type="button" onClick={() => setNotice(assistanceExplanation)}>再给我解释一次</button>
          <button type="button" onClick={() => setAssistanceOfferVisible(false)}>暂时不操作</button>
          <Link className={styles.sourceLink} href="/settings/understanding-assistance">请可信任的人协助</Link>
        </aside>}
        {failureRequestId && <p className={styles.alert} role="status">请求编号：{failureRequestId}</p>}

        <div className={styles.messages} aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && phase !== "loading" && phase !== "greeting" && (
            <p className={styles.empty}>当你准备好，可以先说第一句话。</p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
              {message.role === "assistant" && (
                <span className={styles.messageIdentity}>
                  {isSafetyAssistantMessage(message) ? (
                    <>
                      <i>忆见安全陪伴助手</i>
                      <span role="note">安全支持 · 不代表 TA</span>
                    </>
                  ) : (
                    <>
                      <i>{memoryName}</i>
                      <span role="note">AI生成 · 基于你确认的记忆</span>
                      <Link className={styles.sourceLink} href={`/memory/${memoryId}/sources`}>查看资料来源</Link>
                    </>
                  )}
                </span>
              )}
              <p>{message.content}</p>
              {message.role === "user" && (
                <Link
                  className={styles.saveMoment}
                  href={`/memory/${encodeURIComponent(memoryId)}/pickup?from=chat`}
                  onClick={() => {
                    stageChatPickupDraft({
                      memoryId,
                      sourceMessageId: message.id,
                      originalText: message.content,
                      ...(message.createdAt ? { createdAt: message.createdAt } : {}),
                    });
                    dismissPickupSuggestion();
                  }}
                >
                  保存这一刻
                </Link>
              )}
              {isSafetyAssistantMessage(message) && (
                <p className={styles.safetyActions} role="note">
                  请先联系现实中的紧急服务或可信赖的人。你也可以查看
                  <Link className={styles.sourceLink} href="/help">安全支持说明</Link>
                  和
                  <Link className={styles.sourceLink} href="/settings/companion">陪伴安全设置</Link>
                  ；后者仅用于你明确预授权的内部支持队列，不替代紧急服务，也不表示已经通知外部人员。
                </p>
              )}
              {message.role === "assistant" && !isSafetyAssistantMessage(message) && (
                <button
                  type="button"
                  className={styles.replyCorrection}
                  onClick={(event) => openReplyCorrection(message, event.currentTarget)}
                >
                  这句话不太像 {memoryName}
                </button>
              )}
            </article>
          ))}
          {pendingMessage && <article className={styles.pendingMessage} aria-label="正在确认的消息"><p>{pendingMessage.content}</p></article>}
          <div ref={bottomRef} />
        </div>

        {phase === "error" && !pendingMessage && (
          <div className={styles.recoveryActions}>
            <MemoryButton variant="secondary" onClick={retryGreetingRecovery}>重新连接问候</MemoryButton>
          </div>
        )}

        {pendingMessage && (
          <div className={styles.recoveryActions}>
            <button type="button" className={styles.recoverButton} disabled={phase === "recovering"} onClick={() => void recoverConversation()}>找回刚才的对话</button>
          </div>
        )}

        {pickupSuggestionVisible && (
          <aside className={styles.pickupSuggestion} aria-label="拾忆建议">
            <p>如果刚才想起了一件事，可以把它留到拾忆里；只有你确认后，才会成为 TA 可以引用的资料。</p>
            <div>
              <Link href={`/memory/${memoryId}/pickup`} onClick={dismissPickupSuggestion}>去拾忆</Link>
              <button type="button" onClick={dismissPickupSuggestion}>这次先不用</button>
            </div>
          </aside>
        )}

        {correctionMessage && (
          <aside
            className={styles.correctionDialog}
            role="dialog"
            aria-labelledby={`${titleId}-correction-title`}
          >
            <div className={styles.correctionHeading}>
              <div>
                <p>校正 TA</p>
                <h2 id={`${titleId}-correction-title`}>这句话哪里不太像 {memoryName}？</h2>
              </div>
              <button ref={correctionCloseRef} type="button" onClick={closeReplyCorrection} disabled={correctionPhase === "saving"}>关闭</button>
            </div>
            <p className={styles.correctionQuote}>“{correctionMessage.content}”</p>
            <fieldset disabled={correctionPhase === "saving"}>
              <legend>选择一个原因</legend>
              <div className={styles.correctionReasons}>
                {REPLY_CORRECTION_REASONS.map((reason) => (
                  <label key={reason}>
                    <input
                      type="radio"
                      name={`${titleId}-correction-reason`}
                      value={reason}
                      checked={correctionReason === reason}
                      onChange={() => {
                        setCorrectionReason(reason);
                        setCorrectionSuggestion(null);
                      }}
                    />
                    {reason}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={styles.correctionDetail} htmlFor={`${titleId}-correction-detail`}>
              请写下你确认的正确说法或资料
              <textarea
                id={`${titleId}-correction-detail`}
                value={correctionDetail}
                onChange={(event) => {
                  setCorrectionDetail(event.currentTarget.value);
                  setCorrectionSuggestion(null);
                }}
                rows={3}
                disabled={correctionPhase === "saving"}
                placeholder="例如：她会称我小林，语气更克制，不会这样说。"
              />
            </label>
            {correctionError && <p className={styles.correctionError} role="alert">{correctionError}</p>}
            {!correctionSuggestion ? (
              <button type="button" className={styles.correctionAction} onClick={generateReplyCorrectionSuggestion} disabled={correctionPhase === "saving"}>
                生成校正建议
              </button>
            ) : (
              <div className={styles.correctionReview}>
                <p>建议写入（请先核对）：{correctionSuggestion.text}</p>
                <p>只有确认后才会写入 TA 的正式资料；这不会改写已经发生的对话。</p>
                <div>
                  <button type="button" onClick={() => setCorrectionSuggestion(null)} disabled={correctionPhase === "saving"}>返回修改</button>
                  <button type="button" className={styles.correctionAction} onClick={() => void confirmReplyCorrection()} disabled={correctionPhase === "saving"}>
                    {correctionPhase === "saving" ? "正在确认保存…" : "确认写入 TA 资料"}
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}

        {controlsVisible && (
          <form className={styles.composer} onSubmit={(event) => void submit(event)}>
            <label className={styles.visuallyHidden} htmlFor={`${titleId}-draft`}>对 {memoryName} 说</label>
            <div>
              <button className={styles.voicePlaceholder} type="button" disabled aria-label="声音输入暂未开放">声音</button>
              <textarea
                ref={inputRef}
                id={`${titleId}-draft`}
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="说一件此刻想让 TA 知道的事…"
                disabled={isBusy || phase === "error"}
                rows={1}
              />
              <MemoryButton type="submit" loading={phase === "sending" || phase === "replying"} disabled={!draft.trim() || isBusy || phase === "error" || networkOffline}>{networkOffline ? "等待" : "发送"}</MemoryButton>
            </div>
            <p>网络不稳定时，这句话不会被自动重复发送。</p>
          </form>
        )}

        {completedRounds >= 2 && activeSessionId && (
          <details className={styles.videoOpportunity}>
            <summary>影像机会</summary>
            <CommerceVideoCreditsEntry memoryId={memoryId} />
          </details>
        )}

        <button type="button" className={styles.leave} onClick={onLeave}>返回相伴</button>
      </div>
    </section>
  );
}
