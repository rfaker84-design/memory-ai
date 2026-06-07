"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  photo_url: string | null;
};

type TimelineEvent = {
  id: string;
  memory_id: string;
  event_year: number | null;
  title: string;
  description: string | null;
};

export default function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [eventYear, setEventYear] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("memory_id", id)
      .order("event_year", { ascending: true });

    if (error) {
      alert("读取时间线失败：" + error.message);
      return;
    }

    setEvents(data || []);
  };

  useEffect(() => {
    const loadMemory = async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        alert("读取失败：" + error.message);
        return;
      }

      setMemory(data);
    };

    loadMemory();
    loadEvents();
  }, [id]);

  const addEvent = async () => {
    if (!eventTitle.trim()) {
      alert("请填写事件标题");
      return;
    }

    const { error } = await supabase.from("timeline_events").insert([
      {
        memory_id: id,
        event_year: eventYear ? Number(eventYear) : null,
        title: eventTitle,
        description: eventDescription,
      },
    ]);

    if (error) {
      alert("添加失败：" + error.message);
      return;
    }

    setEventYear("");
    setEventTitle("");
    setEventDescription("");

    await loadEvents();
  };

  if (!memory) {
    return <main className="p-8">加载中...</main>;
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        {memory.photo_url && (
          <img
            src={memory.photo_url}
            alt={memory.name}
            className="mb-6 h-64 w-64 rounded-2xl object-cover"
          />
        )}

        <h1 className="text-3xl font-bold">{memory.name}</h1>

        <p className="mt-2 text-neutral-500">
          关系：{memory.relationship}
        </p>

        <div className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">人生故事</h2>
          <p className="whitespace-pre-wrap text-neutral-700">
            {memory.life_story || "暂无人生故事"}
          </p>
        </div>

        <div className="mt-10 border-t pt-8">
          <h2 className="mb-4 text-xl font-semibold">人生时间线</h2>

          <div className="mb-6 grid gap-3">
            <input
              className="rounded-lg border p-3"
              placeholder="年份，例如 1992"
              value={eventYear}
              onChange={(e) => setEventYear(e.target.value)}
            />

            <input
              className="rounded-lg border p-3"
              placeholder="事件标题，例如：第一次外出打工"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
            />

            <textarea
              className="rounded-lg border p-3"
              placeholder="事件描述"
              rows={3}
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
            />

            <button
              onClick={addEvent}
              className="w-fit rounded-lg bg-black px-6 py-3 text-white"
            >
              添加人生事件
            </button>
          </div>

          {events.length === 0 ? (
            <p className="text-neutral-500">还没有时间线事件。</p>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <div key={event.id} className="rounded-xl bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">
                    {event.event_year || "未知年份"}
                  </p>
                  <h3 className="mt-1 font-semibold">{event.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-neutral-700">
                    {event.description || "暂无描述"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <a
          href={`/memory-chat/${memory.id}`}
          className="mt-8 inline-block rounded-lg bg-black px-6 py-3 text-white"
        >
          和TA聊天
        </a>
      </div>
    </main>
  );
}
