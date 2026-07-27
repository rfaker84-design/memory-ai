"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { MemoryAvatar, MemoryButton } from "../memory-ui";
import { recordBusinessView } from "../business-metrics/businessMetricsClient";
import {
  completedConversationRounds,
  hasPersistedFirstGreeting,
} from "../memory/conversationExperience";
import { useReducedMotion } from "../../motion";

import {
  ConversationMessage,
  ConversationRequestError,
  loadConversation,
  restoreConversationWithFirstGreeting,
  sendConversationMessage,
} from "./memoryConversationAdapter";
import styles from "./MemoryConversationScene.module.css";

type ConversationPhase = "loading" | "greeting" | "ready" | "sending" | "replying" | "recovering" | "error";
type PendingMessage = { content: string; idempotencyKey: string };

type Props = {
  memoryId: string;
  memoryName: string;
  firstGreetingKey: string;
  initialPortraitUrl?: string | null;
  onLeave: () => void;
};

function hasServerMessage(messages: ConversationMessage[], content: string) {
  return messages.some((message) => message.role === "user" && message.content === content);
}

function createMessageIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `message-${random}`;
}

function readableFailure(error: unknown) {
  if (error instanceof ConversationRequestError && error.status === 401) return "登录状态已失效。为了保护这段对话，请重新完成登录。";
  if (error instanceof ConversationRequestError && error.status === 404) return "暂时找不到这段记忆，请回到首页重新进入。";
  if (error instanceof ConversationRequestError && error.status === 503) return "此刻还没有收到回应。你刚才的话仍留在这里。";
  return "连接暂时中断。先找回这段对话，再决定是否重试。";
}

export function MemoryConversationScene({ memoryId, memoryName, firstGreetingKey, initialPortraitUrl = null, onLeave }: Props) {
  const reducedMotion = useReducedMotion();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConversationPhase>("loading");
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [notice, setNotice] = useState("");
  const portraitUrl = initialPortraitUrl;
  const [controlsVisible, setControlsVisible] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const retryCandidateRef = useRef<PendingMessage | null>(null);
  const greetingViewedRef = useRef(false);
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
      setPhase("error");
    }
  }, [firstGreetingKey, memoryId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrRequestGreeting(controller.signal);
    return () => controller.abort();
  }, [loadOrRequestGreeting]);

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
    if (controlsVisible || !hasPersistedFirstGreeting(messages)) return;
    const timer = window.setTimeout(
      () => setControlsVisible(true),
      reducedMotion ? 0 : 760,
    );
    return () => window.clearTimeout(timer);
  }, [controlsVisible, messages, reducedMotion]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || inFlightRef.current || phase !== "ready") return;

    const retryCandidate = retryCandidateRef.current;
    const idempotencyKey = retryCandidate?.content === message
      ? retryCandidate.idempotencyKey
      : createMessageIdempotencyKey();
    retryCandidateRef.current = null;
    inFlightRef.current = true;
    setDraft("");
    setPendingMessage({ content: message, idempotencyKey });
    setNotice("");
    setPhase("sending");
    const replyingTimer = window.setTimeout(() => setPhase("replying"), reducedMotion ? 0 : 360);

    try {
      await sendConversationMessage(memoryId, message, idempotencyKey);
      await restore();
      setPendingMessage(null);
      setPhase("ready");
    } catch (error) {
      inFlightRef.current = false;
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
    try {
      const restored = await restore();
      if (hasServerMessage(restored, candidate.content)) {
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
    } finally {
      inFlightRef.current = false;
    }
  };

  const retryGreetingRecovery = () => {
    void loadOrRequestGreeting();
  };

  const isBusy = phase === "loading" || phase === "greeting" || phase === "sending" || phase === "replying" || phase === "recovering";
  const completedRounds = completedConversationRounds(messages, activeSessionId);
  const status = phase === "sending" ? "正在送出这句话…" : phase === "replying" ? `${memoryName} 正在回应…` : phase === "greeting" ? "第一句话正在慢慢靠近…" : phase === "recovering" ? "正在找回刚才的对话…" : "";

  return (
    <section className={`${styles.scene} ${reducedMotion ? styles.reduced : ""}`} aria-labelledby={titleId}>
      <div className={styles.presence} aria-label={`${memoryName} 的形象`}>
        <div className={styles.orbit} aria-hidden="true" />
        <div className={styles.portraitFrame} role="img" aria-label={portraitUrl ? `${memoryName} 的照片` : `${memoryName} 的文字形象`}>
          {portraitUrl ? (
            <div className={styles.portraitPhoto} style={{ backgroundImage: `url("${portraitUrl}")` }} />
          ) : (
            <span className={styles.portraitInitials}>{Array.from(memoryName).slice(0, 2).join("")}</span>
          )}
        </div>
        <p>{memoryName}</p>
      </div>

      <div className={styles.conversation}>
        <p className={styles.eyebrow}>回到这段记忆里</p>
        <h1 id={titleId}>第一句之后，慢慢说。</h1>
        <p className={styles.intro}>离开再回来，你们说过的话仍会留在这里。</p>

        {status && <p className={styles.status} role="status" aria-live="polite">{status}</p>}
        {notice && <p className={styles.alert} role="alert">{notice}</p>}

        <div className={styles.messages} aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && phase !== "loading" && phase !== "greeting" && (
            <p className={styles.empty}>当你准备好，可以先说第一句话。</p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
              {message.role === "assistant" && (
                <span className={styles.messageIdentity}>
                  <MemoryAvatar image={portraitUrl} initials={memoryName} alt={`${memoryName} 的照片`} presence={isBusy ? "quiet" : "online"} size={30} />
                  <i>{memoryName}</i>
                </span>
              )}
              <p>{message.content}</p>
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

        {controlsVisible && (
          <form className={styles.composer} onSubmit={(event) => void submit(event)}>
            <label htmlFor={`${titleId}-draft`}>对 {memoryName} 说</label>
            <div>
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
                rows={2}
              />
              <MemoryButton type="submit" loading={phase === "sending" || phase === "replying"} disabled={!draft.trim() || isBusy || phase === "error"}>送出</MemoryButton>
            </div>
            <p>网络不稳定时，这句话不会被自动重复发送。</p>
          </form>
        )}

        <button type="button" className={styles.leave} onClick={onLeave}>回到首页</button>
      </div>
    </section>
  );
}
