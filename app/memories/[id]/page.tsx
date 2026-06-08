"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";

type Memory = { id: string; name: string; relationship: string; life_story: string | null; photo_url: string | null };
type TimelineEvent = { id: string; memory_id: string; event_year: number | null; title: string; description: string | null };

export default function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  const loadMemory = async () => {
    const { data, error } = await supabase.from("memories").select("*").eq("id", id).single();
    if (error) return alert("读取记忆体失败：" + error.message);
    setMemory(data);
  };

  const loadEvents = async () => {
    const { data, error } = await supabase.from("timeline_events").select("*").eq("memory_id", id).order("event_year", { ascending: true });
    if (error) return alert("读取时间线失败：" + error.message);
    setEvents(data || []);
  };

  useEffect(() => { loadMemory(); loadEvents(); }, [id]);

  if (!memory) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">{memory.name}</h1>
        <p className="mt-2 text-neutral-500">关系：{memory.relationship}</p>

        {memory.photo_url && (
          <img src={memory.photo_url} alt={memory.name} className="mt-4 mb-4 h-64 w-64 rounded-2xl object-cover" />
        )}

        <div className="bg-neutral-100 p-4 rounded mb-4">
          <p className="font-semibold">人生故事：</p>
          <p className="whitespace-pre-wrap">{memory.life_story || "暂无人生故事"}</p>
        </div>

        <div className="bg-neutral-100 p-4 rounded">
          <p className="font-semibold">人生时间线：</p>
          {events.length === 0 ? <p>暂无事件</p> :
            events.map(e => (
              <div key={e.id}>{e.event_year || "未知年份"}：{e.title} {e.description ? ` - ${e.description}` : ""}</div>
            ))
          }
        </div>
      </div>
    </main>
  );
}