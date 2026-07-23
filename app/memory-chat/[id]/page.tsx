"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Message as ChatMessage } from "../../../features/chat/types";
import type { Memory } from "../../../features/memory/types";
import {
  loadOwnedMemory,
  OwnedMemoryRequestError,
} from "../../../src/components/memory/ownedMemoryClient";
import { MemoryExperienceOffer } from "../../../src/components/payment/MemoryExperienceOffer";

type MemoryFragment = {
  content: string;
  sourceType: string;
};

export default function MemoryChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [memory, setMemory] = useState<Memory | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fragments, setFragments] = useState<MemoryFragment[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [chatError, setChatError] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [, setAudioUrl] = useState("");
  const [showFragments, setShowFragments] = useState(true);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/memories/${encodeURIComponent(id)}/chat-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({}),
      cache: "no-store",
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "CHAT_SESSION_FAILED");
    setMessages(Array.isArray(body.messages) ? body.messages : []);
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setPageStatus("loading");
    void loadOwnedMemory(id, controller.signal)
      .then(async (ownedMemory) => {
        setMemory(ownedMemory);
        setFragments(
          (ownedMemory.lifeStory ?? "")
            .split(/[。！？.!?]/)
            .map((content) => content.trim())
            .filter(Boolean)
            .slice(0, 6)
            .map((content) => ({ content, sourceType: "story" }))
        );
        await loadMessages(controller.signal);
        setPageStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPageStatus(
          error instanceof OwnedMemoryRequestError && error.status === 404
            ? "not-found"
            : "error"
        );
      });
    return () => controller.abort();
  }, [id, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleAsk = async () => {
    if (sendingRef.current || !memory || !question.trim()) return;
    sendingRef.current = true;
    setLoading(true);
    setChatError("");
    setShowFragments(false);

    const currentQuestion = question.trim();
    setQuestion("");

    try {
      const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `memory-chat-${crypto.randomUUID()}`
        : `memory-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch("/api/memory-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        credentials: "same-origin",
        body: JSON.stringify({
          memoryId: memory.id,
          question: currentQuestion,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "CHAT_SEND_FAILED");
      await loadMessages();
    } catch {
      setChatError("消息发送失败，请重试。");
      setQuestion(currentQuestion);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const generateVoice = async (text: string) => {
    if (!text.trim()) return;
    setTtsLoading(true);
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    setTtsLoading(false);
    if (!res.ok) return;

    const binary = atob(data.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    setTimeout(() => audioRef.current?.play(), 100);
  };

  const fragmentLabels: Record<string, string> = {
    catch_phrase: "口头禅",
    habit: "生活习惯",
    encouragement: "鼓励方式",
    story: "人生故事",
    emotion: "情感片段",
  };

  if (!memory || pageStatus !== "ready") {
    const label = pageStatus === "not-found"
      ? "找不到这个记忆"
      : pageStatus === "error"
        ? "对话暂时无法加载，请稍后重试"
        : "正在准备...";
    return <main className="flex min-h-screen items-center justify-center"><p className="text-[#A89888] font-light">{label}</p></main>;
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#F7F2EA]/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-[#A89888] hover:text-[#7A6E62]">&larr;</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href={"/timeline/" + id} className="text-[#7A6E62] hover:text-[#A89888]">时间轴</Link>
            <Link href={"/heirloom/" + id} className="text-[#7A6E62] hover:text-[#A89888]">留下的东西</Link>
          </div>
          <div className="text-center">
            <p className="text-sm text-[#7A6E62]">{memory.name}</p>
            <p className="text-xs text-emerald-400/80">正在陪伴你</p>
          </div>
          <Link href={"/voice-chat/" + id} className="text-[#A89888] hover:text-[#7A6E62]">🎙️</Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 pb-32">
        {/* Avatar + Info */}
        {showFragments && messages.length === 0 && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-6 h-28 w-28 overflow-hidden rounded-full ring-2 ring-white/10">
              {memory.photoUrl ? (
                <img src={memory.photoUrl} alt={memory.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-[#3D3226]/[0.06] text-4xl text-[#A89888]">{memory.name.charAt(0)}</div>
              )}
            </div>
            <h2 className="text-2xl font-semibold text-[#3D3226]">{memory.name}</h2>
            <p className="mt-1 text-[#A89888]">{memory.relationship}</p>
            <p className="mt-2 text-sm text-emerald-400/60">正在陪伴你</p>

            {/* Fragments */}
            {fragments.length > 0 && (
              <div className="mt-10 space-y-3 text-left">
                <p className="text-xs uppercase tracking-wider text-[#A89888]">TA的记忆碎片</p>
                {fragments.slice(0, 4).map((f, i) => (
                  <div key={i} className="rounded-xl bg-[#3D3226]/[0.06] px-4 py-3">
                    <p className="text-xs text-[#7A6E62]">{fragmentLabels[f.sourceType] || f.sourceType}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#5C4A3A]">{f.content}</p>
                  </div>
                ))}
              </div>
            )}

            {memory.speechStyle && (
              <div className="mt-6 rounded-xl bg-[#3D3226]/[0.06] px-4 py-3 text-left">
                <p className="text-xs text-[#7A6E62]">说话风格</p>
                <p className="mt-1 text-sm leading-relaxed text-[#7A6E62]">{memory.speechStyle}</p>
              </div>
            )}

            {memory.catchPhrases && (
              <div className="mt-3 rounded-xl bg-[#3D3226]/[0.06] px-4 py-3 text-left">
                <p className="text-xs text-[#7A6E62]">TA常说的话</p>
                <p className="mt-1 text-sm leading-relaxed text-[#7A6E62]">{memory.catchPhrases}</p>
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        <div className="space-y-4 py-6">
          {messages.map((msg) => (
            <div key={msg.id} className={"flex " + (msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[80%] rounded-2xl px-5 py-3 " + (msg.role === "user" ? "bg-[#C4A882]/25 text-[#3D3226]" : "bg-[#3D3226]/[0.06] text-[#3D3226]")}>
                {msg.role === "assistant" && (
                  <p className="mb-1 text-xs text-[#7A6E62]">{memory.name}</p>
                )}
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                {msg.role === "assistant" && (
                  <button onClick={() => generateVoice(msg.content)} disabled={ttsLoading}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-30">
                    {ttsLoading ? "准备声音..." : "🔊 听TA说"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-[#3D3226]/[0.06] px-5 py-3">
                <p className="text-xs text-[#7A6E62]">{memory.name}</p>
                <div className="mt-2 flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#C4A882]/40" style={{animationDelay: "0ms"}} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#C4A882]/40" style={{animationDelay: "150ms"}} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#C4A882]/40" style={{animationDelay: "300ms"}} />
                </div>
              </div>
            </div>
          )}
          {chatError && <p role="alert" className="text-center text-sm text-red-300">{chatError}</p>}
          {messages.some((message) => message.role === "assistant") && <MemoryExperienceOffer memoryId={memory.id} tone="light" />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/5 bg-[#F7F2EA]/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3 px-6 py-4">
          <input
            className="flex-1 rounded-xl bg-[#3D3226]/[0.06] px-5 py-3 text-[#3D3226] placeholder-[#A89888]/50 outline-none focus:bg-[#3D3226]/[0.08]"
            placeholder={"想和" + memory.name + "说什么..."}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <button onClick={handleAsk} disabled={loading}
            className="shrink-0 rounded-xl px-6 py-3 text-sm font-medium text-[#3D3226] disabled:opacity-30" style={{background:"rgba(196,168,130,0.20)"}}>
            发送
          </button>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </main>
  );
}
