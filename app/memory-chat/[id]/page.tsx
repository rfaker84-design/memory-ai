"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
};

type TimelineEvent = {
  id: string;
  event_year: number | null;
  title: string;
  description: string | null;
};

export default function MemoryChatPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [userId, setUserId] = useState<string | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    // 加载当前用户的记忆体
    const loadData = async () => {
      const { data: mem, error: memErr } = await supabase
        .from("memories")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (memErr) return alert("读取记忆体失败：" + memErr.message);
      setMemory(mem);

      const { data: evts, error: evtErr } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("memory_id", id)
        .order("event_year", { ascending: true });
      if (evtErr) return alert("读取时间线失败：" + evtErr.message);
      setEvents(evts || []);
    };

    loadData();
  }, [id, userId]);

  const handleAsk = async () => {
    if (!memory || !userId || !question.trim()) return;

    setLoading(true);
    setAnswer("");

    const res = await fetch("/api/memory-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memory_id: memory.id,
        user_id: userId,
        name: memory.name,
        relationship: memory.relationship,
        life_story: memory.life_story,
        timeline: events,
        question,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) return alert(data.error || "AI回答失败");

    setAnswer(data.answer);
    setQuestion("");
  };

  if (!memory) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">和 {memory.name} 聊天</h1>
        <p className="mt-2 text-neutral-500">关系：{memory.relationship}</p>

        <div className="mt-6 rounded-lg bg-neutral-100 p-4 text-neutral-700">
          <p className="font-semibold">已载入人生故事：</p>
          <p className="mt-2 whitespace-pre-wrap">{memory.life_story || "暂无人生故事"}</p>
        </div>

        <div className="mt-4 rounded-lg bg-neutral-100 p-4 text-neutral-700">
          <p className="font-semibold">已载入人生时间线：</p>
          {events.length === 0 ? (
            <p className="mt-2">暂无时间线事件</p>
          ) : (
            <div className="mt-2 space-y-2">
              {events.map((event) => (
                <div key={event.id}>
                  {event.event_year || "未知年份"}：{event.title}
                  {event.description ? ` - ${event.description}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>

        <textarea
          className="mt-6 w-full rounded-lg border p-3"
          rows={4}
          placeholder={`想问 ${memory.name} 什么？`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <button
          onClick={handleAsk}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {loading ? "思考中..." : "发送"}
        </button>

        {answer && (
          <div className="mt-8 rounded-lg bg-neutral-100 p-4">
            <h2 className="mb-2 font-semibold">AI回答</h2>
            <p className="whitespace-pre-wrap">{answer}</p>
          </div>
        )}
      </div>
    </main>
  );
}