"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  personality_profile: string | null;
  photo_url: string | null;
  user_phone: string | null;
};

type TimelineEvent = {
  id: string;
  event_year: number | null;
  title: string;
  description: string | null;
};

type ChatMessage = {
  id: string;
  memory_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export default function MemoryChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [phone, setPhone] = useState("");
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("memory_id", id)
      .order("created_at", { ascending: true });

    setMessages((data || []) as ChatMessage[]);
  }, [id]);

  useEffect(() => {
    const savedPhone = window.localStorage.getItem("yijian_phone");

    if (!savedPhone) {
      window.location.href = "/login";
      return;
    }

    setPhone(savedPhone);

    const loadData = async () => {
      const { data: memoryData, error: memoryError } = await supabase
        .from("memories")
        .select("*")
        .eq("id", id)
        .eq("user_phone", savedPhone)
        .single();

      if (memoryError || !memoryData) {
        alert("无法访问该记忆体");
        window.location.href = "/memories";
        return;
      }

      setMemory(memoryData);

      const { data: eventData } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("memory_id", id)
        .order("event_year", { ascending: true });

      setEvents(eventData || []);
      await loadMessages();
    };

    loadData();
  }, [id, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleAsk = async () => {
    if (sendingRef.current) return;
    if (!memory || !question.trim() || !phone) return;

    sendingRef.current = true;
    setLoading(true);

    const currentQuestion = question.trim();
    setQuestion("");

    const res = await fetch("/api/memory-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_phone: phone,
        memory_id: memory.id,
        name: memory.name,
        relationship: memory.relationship,
        life_story: memory.life_story,
        personality_profile: memory.personality_profile,
        timeline: events,
        question: currentQuestion,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "AI回答失败");
    }

    await loadMessages();

    setLoading(false);
    sendingRef.current = false;
  };

  const generateVoice = async (text: string) => {
    if (!text.trim()) return;

    setTtsLoading(true);

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    setTtsLoading(false);

    if (!res.ok) {
      alert(data.error || "语音生成失败");
      return;
    }

    const binary = atob(data.audioBase64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    setAudioUrl(url);

    setTimeout(() => {
      audioRef.current?.play();
    }, 100);
  };

  if (!memory) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex items-center gap-4">
          {memory.photo_url && (
            <img
              src={memory.photo_url}
              alt={memory.name}
              className="h-20 w-20 rounded-2xl object-cover"
            />
          )}

          <div>
            <h1 className="text-3xl font-bold">和{memory.name}聊天</h1>
            <p className="mt-1 text-neutral-500">关系：{memory.relationship}</p>
          </div>
        </div>

        <div className="mt-6 max-h-[420px] space-y-3 overflow-y-auto rounded-xl border bg-white p-4">
          {messages.length === 0 ? (
            <p className="text-neutral-500">暂无聊天记录。</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-black text-white"
                      : "bg-neutral-100 text-neutral-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {message.role === "assistant" && (
                    <button
                      onClick={() => generateVoice(message.content)}
                      disabled={ttsLoading}
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {ttsLoading ? "生成中..." : "听TA说"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-neutral-500">
              AI正在思考中...
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <textarea
          className="mt-6 w-full rounded-lg border p-3"
          rows={4}
          placeholder={`想问${memory.name}什么？`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <button
          onClick={handleAsk}
          disabled={loading}
          className="mt-4 rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {loading ? "思考中..." : "发送"}
        </button>

        {audioUrl && (
          <div className="mt-6 rounded-lg bg-neutral-100 p-4">
            <p className="mb-2 font-semibold">AI语音</p>
            <audio ref={audioRef} controls className="w-full" src={audioUrl} />
          </div>
        )}
      </div>
    </main>
  );
}
