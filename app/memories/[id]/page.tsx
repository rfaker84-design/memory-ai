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

export default function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const [editName, setEditName] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [editLifeStory, setEditLifeStory] = useState("");

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventYear, setNewEventYear] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");

  const loadMemory = async () => {
    const { data, error } = await supabase.from("memories").select("*").eq("id", id).single();
    if (error) return alert("读取记忆体失败：" + error.message);
    setMemory(data);
    setEditName(data.name);
    setEditRelationship(data.relationship);
    setEditLifeStory(data.life_story || "");
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("memory_id", id)
      .order("event_year", { ascending: true });
    if (error) return alert("读取时间线失败：" + error.message);
    setEvents(data || []);
  };

  useEffect(() => {
    loadMemory();
    loadEvents();
  }, [id]);

  const updateMemory = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("memories")
      .update({ name: editName, relationship: editRelationship, life_story: editLifeStory })
      .eq("id", id);
    setLoading(false);
    if (error) return alert("更新失败：" + error.message);
    alert("记忆体更新成功");
    await loadMemory();
  };

  const deleteMemory = async () => {
    if (!confirm("确认删除整个记忆体？操作不可恢复")) return;
    const { error } = await supabase.from("memories").delete().eq("id", id);
    if (error) return alert("删除失败：" + error.message);
    alert("记忆体已删除");
    window.location.href = "/memories";
  };

  const addEvent = async () => {
    if (!newEventTitle.trim()) return alert("请输入事件标题");
    const { error } = await supabase.from("timeline_events").insert([
      {
        memory_id: id,
        event_year: newEventYear ? Number(newEventYear) : null,
        title: newEventTitle,
        description: newEventDesc,
      },
    ]);
    if (error) return alert("添加事件失败：" + error.message);
    setNewEventTitle("");
    setNewEventYear("");
    setNewEventDesc("");
    await loadEvents();
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm("确认删除此事件？")) return;
    const { error } = await supabase.from("timeline_events").delete().eq("id", eventId);
    if (error) return alert("删除失败：" + error.message);
    await loadEvents();
  };

  const updateEvent = async (event: TimelineEvent) => {
    const title = prompt("编辑事件标题", event.title);
    if (!title) return;
    const description = prompt("编辑事件描述", event.description || "");
    const yearStr = prompt("编辑年份", event.event_year?.toString() || "");
    const year = yearStr ? Number(yearStr) : null;
    const { error } = await supabase
      .from("timeline_events")
      .update({ title, description, event_year: year })
      .eq("id", event.id);
    if (error) return alert("更新失败：" + error.message);
    await loadEvents();
  };

  if (!memory) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">编辑记忆体</h1>

        {memory.photo_url && (
          <img
            src={memory.photo_url}
            alt={memory.name}
            className="my-4 h-64 w-64 rounded-2xl object-cover"
          />
        )}

        <div className="mt-4 space-y-2">
          <input
            className="w-full rounded-lg border p-2"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="姓名"
          />
          <input
            className="w-full rounded-lg border p-2"
            value={editRelationship}
            onChange={(e) => setEditRelationship(e.target.value)}
            placeholder="关系"
          />
          <textarea
            className="w-full rounded-lg border p-2"
            rows={4}
            value={editLifeStory}
            onChange={(e) => setEditLifeStory(e.target.value)}
            placeholder="人生故事"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={updateMemory} className="bg-black text-white px-4 py-2 rounded">
              保存修改
            </button>
            <button onClick={deleteMemory} className="bg-red-600 text-white px-4 py-2 rounded">
              删除记忆体
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold">人生时间线</h2>
          <div className="mt-2 space-y-2">
            {events.length === 0 ? (
              <p>暂无事件</p>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex justify-between items-center bg-neutral-100 p-2 rounded"
                >
                  <div>
                    {event.event_year || "未知年份"}：{event.title}{" "}
                    {event.description ? `- ${event.description}` : ""}
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="bg-yellow-500 px-2 rounded text-white"
                      onClick={() => updateEvent(event)}
                    >
                      编辑
                    </button>
                    <button
                      className="bg-red-600 px-2 rounded text-white"
                      onClick={() => deleteEvent(event.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <input
              className="rounded-lg border p-2"
              placeholder="年份"
              value={newEventYear}
              onChange={(e) => setNewEventYear(e.target.value)}
            />
            <input
              className="rounded-lg border p-2"
              placeholder="事件标题"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
            />
            <textarea
              className="rounded-lg border p-2"
              placeholder="事件描述"
              rows={2}
              value={newEventDesc}
              onChange={(e) => setNewEventDesc(e.target.value)}
            />
            <button
              onClick={addEvent}
              className="bg-black text-white px-4 py-2 rounded"
            >
              添加事件
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}