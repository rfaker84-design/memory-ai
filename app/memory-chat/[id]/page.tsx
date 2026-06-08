"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";

type Memory = { id: string; name: string; relationship: string; life_story: string | null; photo_url?: string | null };
type TimelineEvent = { id: string; event_year: number | null; title: string; description: string | null };

export default function MemoryChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const { data: memoryData, error: memoryError } = await supabase.from("memories").select("*").eq("id", id).single();
      if (memoryError) return alert("读取记忆体失败：" + memoryError.message);
      setMemory(memoryData);

      const { data: eventData, error: eventError } = await supabase.from("timeline_events").select("*").eq("memory_id", id).order("event_year", { ascending: true });
      if (eventError) return alert("读取时间线失败：" + eventError.message);
      setEvents(eventData || []);
    };
    loadData();
  }, [id]);

  const handleAsk = async () => {
    if (!memory || !question.trim()) return;
    setLoading(true); setAnswer("");

    const res = await fetch("/api/memory-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memory_id: memory.id,
        name: memory.name,
        relationship: memory.relationship,
        life_story: memory.life_story,
        timeline: events,
        question
      })
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) return alert(data.error || "AI回答失败");
    setAnswer(data.answer); window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(data.answer); utterance.lang = "zh-CN"; utterance.rate = 0.9; window.speechSynthesis.speak(utterance);
    setQuestion("");
  };

  if (!memory) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        {memory.photo_url && <img src={memory.photo_url} alt={memory.name} className="mb-6 h-64 w-64 rounded-2xl object-cover" />}
        <h1 className="text-3xl font-bold">和{memory.name}聊天</h1>
        <p className="mt-2 text-neutral-500">关系：{memory.relationship}</p>

        <div className="mt-6 rounded-lg bg-neutral-100 p-4 text-neutral-700">
          <p className="font-semibold">人生故事：</p>
          <p className="mt-2 whitespace-pre-wrap">{memory.life_story || "暂无人生故事"}</p>
        </div>

        <div className="mt-4 rounded-lg bg-neutral-100 p-4 text-neutral-700">
          <p className="font-semibold">人生时间线：</p>
          {events.length===0 ? <p className="mt-2">暂无时间线事件</p> :
            <div className="mt-2 space-y-2">{events.map(ev => <div key={ev.id}>{ev.event_year||"未知年份"}：{ev.title}{ev.description?` - ${ev.description}`:""}</div>)}</div>}
        </div>

        <textarea className="mt-6 w-full rounded-lg border p-3" rows={4} placeholder={`想问${memory.name}什么？`} value={question} onChange={e=>setQuestion(e.target.value)} />
        <button onClick={handleAsk} disabled={loading} className="mt-4 rounded-lg bg-black px-6 py-3 text-white">{loading?"思考中...":"发送"}</button>

        {answer && <div className="mt-8 rounded-lg bg-neutral-100 p-4">
          <h2 className="mb-2 font-semibold">AI回答</h2>
          <p className="whitespace-pre-wrap">{answer}</p>
        </div>}
      </div>
    </main>
  );
}
