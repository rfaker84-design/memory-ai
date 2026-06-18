"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  photo_url: string | null;
  voice_sample_url: string | null;
  user_phone: string | null;
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

  const [phone, setPhone] = useState("");
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [newEventYear, setNewEventYear] = useState("");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");

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
    };

    loadData();
  }, [id]);

  const addEvent = async () => {
    if (!phone) return;
    if (!newEventTitle.trim()) return alert("请输入事件标题");

    const { error } = await supabase.from("timeline_events").insert([
      {
        memory_id: id,
        user_phone: phone,
        event_year: newEventYear ? Number(newEventYear) : null,
        title: newEventTitle,
        description: newEventDesc,
      },
    ]);

    if (error) {
      alert("添加失败：" + error.message);
      return;
    }

    setNewEventYear("");
    setNewEventTitle("");
    setNewEventDesc("");

    const { data } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("memory_id", id)
      .order("event_year", { ascending: true });

    setEvents(data || []);
  };

  const deleteMemory = async () => {
    if (!phone) return;
    if (!confirm("确认删除这个记忆体？")) return;

    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("user_phone", phone);

    if (error) {
      alert("删除失败：" + error.message);
      return;
    }

    window.location.href = "/memories";
  };

  if (!memory) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        {memory.photo_url ? (
          <img
            src={memory.photo_url}
            alt={memory.name}
            className="mb-6 h-64 w-64 rounded-2xl object-cover"
          />
        ) : (
          <div className="mb-6 flex h-64 w-64 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500">
            暂无照片
          </div>
        )}

        <h1 className="text-3xl font-bold">{memory.name}</h1>
        <p className="mt-2 text-neutral-500">关系：{memory.relationship}</p>

        {memory.voice_sample_url && (
          <div className="mt-6 rounded-xl bg-neutral-100 p-4">
            <p className="mb-2 font-semibold">亲人声音样本</p>
            <audio controls className="w-full" src={memory.voice_sample_url} />
          </div>
        )}

        <div className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">人生故事</h2>
          <p className="whitespace-pre-wrap text-neutral-700">
            {memory.life_story || "暂无人生故事"}
          </p>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">人生时间线</h2>

          {events.length === 0 ? (
            <p className="text-neutral-500">暂无时间线事件</p>
          ) : (
            <div className="space-y-3">
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

          <div className="mt-6 grid gap-3">
            <input
              className="rounded-lg border p-3"
              placeholder="年份，例如 1992"
              value={newEventYear}
              onChange={(e) => setNewEventYear(e.target.value)}
            />

            <input
              className="rounded-lg border p-3"
              placeholder="事件标题"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
            />

            <textarea
              className="rounded-lg border p-3"
              rows={3}
              placeholder="事件描述"
              value={newEventDesc}
              onChange={(e) => setNewEventDesc(e.target.value)}
            />

            <button
              onClick={addEvent}
              className="w-fit rounded-lg bg-black px-6 py-3 text-white"
            >
              添加人生事件
            </button>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <a
            href={`/memory-chat/${memory.id}`}
            className="rounded-lg bg-black px-6 py-3 text-white"
          >
            和TA聊天
          </a>

          <button
            onClick={deleteMemory}
            className="rounded-lg bg-red-600 px-6 py-3 text-white"
          >
            删除记忆体
          </button>
        </div>
      </div>
    </main>
  );
}
