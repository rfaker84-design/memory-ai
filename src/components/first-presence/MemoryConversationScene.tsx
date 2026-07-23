"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { MemoryAvatar, MemoryButton } from "../memory-ui";
import { MemoryExperienceOffer } from "../payment/MemoryExperienceOffer";
import { recordBusinessView } from "../business-metrics/businessMetricsClient";
import { useReducedMotion } from "../../motion";

import {
  ConversationMessage,
  ConversationRequestError,
  loadConversation,
  requestFirstGreeting,
  sendConversationMessage,
} from "./memoryConversationAdapter";
import styles from "./MemoryConversationScene.module.css";

type ConversationPhase = "loading" | "greeting" | "ready" | "sending" | "replying" | "recovering" | "error";
type PendingMessage = { content: string; idempotencyKey: string };

type Props = {
  memoryId: string;
  memoryName: string;
  firstGreetingKey: string;
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
  if (error instanceof ConversationRequestError && error.status === 404) return "这位亲人的对话服务尚未准备好。不会创建任何本地替身消息。";
  if (error instanceof ConversationRequestError && error.status === 503) return "对话服务暂时不可用。消息没有在客户端重复发送。";
  return "连接暂时中断。我们会先恢复服务端对话，再决定下一步。";
}

export function MemoryConversationScene({ memoryId, memoryName, firstGreetingKey, onLeave }: Props) {
  const reducedMotion = useReducedMotion();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [phase, setPhase] = useState<ConversationPhase>("loading");
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const greetingRequestedRef = useRef(false);
  const retryCandidateRef = useRef<PendingMessage | null>(null);
  const greetingViewedRef = useRef(false);
  const titleId = useId();

  const restore = useCallback(async (signal?: AbortSignal) => {
    const snapshot = await loadConversation(memoryId, signal);
    setMessages(snapshot.messages);
    return snapshot.messages;
  }, [memoryId]);

  const loadOrRequestGreeting = useCallback(async (signal?: AbortSignal) => {
    setPhase("loading");
    setNotice("");
    try {
      const restored = await restore(signal);
      const hasAssistant = restored.some((message) => message.role === "assistant");
      if (hasAssistant || greetingRequestedRef.current) {
        setPhase("ready");
        return;
      }
      setPhase("greeting");
      greetingRequestedRef.current = true;
      await requestFirstGreeting(memoryId, firstGreetingKey, signal);
      await restore(signal);
      setPhase("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setNotice(readableFailure(error));
      setPhase("error");
    }
  }, [firstGreetingKey, memoryId, restore]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrRequestGreeting(controller.signal);
    return () => controller.abort();
  }, [loadOrRequestGreeting]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [messages, pendingMessage, phase, reducedMotion]);

  useEffect(() => {
    if (phase === "ready") inputRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!greetingViewedRef.current && messages.some((message) => message.role === "assistant")) {
      greetingViewedRef.current = true;
      recordBusinessView("first_greeting_viewed", memoryId);
    }
  }, [memoryId, messages]);

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
        setNotice("服务端已确认收到这句话；对话已恢复。" );
      } else {
        setPhase("error");
        setNotice("服务端尚未能确认这句话是否已送达。为避免重复消息，系统不会自动重发；原文仍保留在输入框。" );
        retryCandidateRef.current = candidate;
        setDraft(candidate.content);
        setPendingMessage(null);
        setPhase("ready");
        setNotice("\u670d\u52a1\u7aef\u6682\u672a\u8bb0\u5f55\u8fd9\u53e5\u8bdd\u3002\u73b0\u5728\u7531\u4f60\u51b3\u5b9a\u662f\u5426\u91cd\u65b0\u53d1\u9001\uff1b\u7cfb\u7edf\u4e0d\u4f1a\u66ff\u4f60\u53d1\u9001\u3002");
      }
    } catch (error) {
      setPhase("error");
      setNotice(readableFailure(error));
    } finally {
      inFlightRef.current = false;
    }
  };

  const retryGreetingRecovery = () => {
    greetingRequestedRef.current = false;
    void loadOrRequestGreeting();
  };

  const isBusy = phase === "loading" || phase === "greeting" || phase === "sending" || phase === "replying" || phase === "recovering";
  const status = phase === "sending" ? "正在送出这句话…" : phase === "replying" ? `${memoryName} 正在回应…` : phase === "greeting" ? "正在等待服务端的第一声问候…" : phase === "recovering" ? "正在从服务端恢复对话…" : "";

  return (
    <section className={`${styles.scene} ${reducedMotion ? styles.reduced : ""}`} aria-labelledby={titleId}>
      <div className={styles.presence} aria-label={`${memoryName} 的形象`}>
        <div className={styles.orbit} aria-hidden="true" />
        <MemoryAvatar initials={memoryName} alt={memoryName} presence={isBusy ? "quiet" : "online"} size={112} />
        <p>{memoryName}</p>
      </div>

      <div className={styles.conversation}>
        <p className={styles.eyebrow}>真实长期记忆对话</p>
        <h1 id={titleId}>第一句之后，慢慢说。</h1>
        <p className={styles.intro}>这里仅显示服务端已持久化的问候与对话。刷新页面会从同一段对话恢复。</p>

        {status && <p className={styles.status} role="status" aria-live="polite">{status}</p>}
        {notice && <p className={styles.alert} role="alert">{notice}</p>}

        <div className={styles.messages} aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && phase !== "loading" && phase !== "greeting" && (
            <p className={styles.empty}>当你准备好，可以先说第一句话。</p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
              {message.role === "assistant" && <span>{memoryName}</span>}
              <p>{message.content}</p>
            </article>
          ))}
          {pendingMessage && <article className={styles.pendingMessage} aria-label="等待服务端确认的消息"><p>{pendingMessage.content}</p></article>}
          <div ref={bottomRef} />
        </div>

        {messages.some((message) => message.role === "assistant") && <MemoryExperienceOffer memoryId={memoryId} />}

        {phase === "error" && !pendingMessage && (
          <div className={styles.recoveryActions}>
            <MemoryButton variant="secondary" onClick={retryGreetingRecovery}>重新连接问候</MemoryButton>
          </div>
        )}

        {pendingMessage && (
          <div className={styles.recoveryActions}>
            <button type="button" className={styles.recoverButton} disabled={phase === "recovering"} onClick={() => void recoverConversation()}>恢复服务端对话</button>
          </div>
        )}

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
          <p>Enter 送出，Shift + Enter 换行。网络不确定时，先恢复服务端对话，不会自动重复发送。</p>
        </form>

        <button type="button" className={styles.leave} onClick={onLeave}>回到首页</button>
      </div>
    </section>
  );
}
