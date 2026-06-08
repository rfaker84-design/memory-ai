"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  photo_url: string | null;
};

type TimelineEvent = {
  id: string;
  memory_id: string;
  event_year: number | null;
  title: string;
  description: string | null;
};

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [eventsMap, setEventsMap] = useState<Record<string, TimelineEvent[]>>({});
  const [loading, setLoading] = useState(true);

  const loadMemories = async () => {
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert("加载失败：" + error.message);
      setLoading(false);
      return;
    }

    setMemories(data || []);

    // 加载每个记忆体的时间线
    const eventsData: Record<string, TimelineEvent[]> = {};
    for (const mem of data || []) {
      const { data: evts } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("memory_id", mem.id)
        .order("event_year", { ascending: true });
      eventsData[mem.id] = evts || [];
    }
    setEventsMap(eventsData);

    setLoading(false);
  };

  const deleteMemory = async (memoryId: string) => {
    if (!confirm("确认删除这个记忆体？删除后不可恢复。")) return;
    const { error } = await supabase.from("memories").delete().eq("id", memoryId);
    if (error) return alert("删除失败：" + error.message);
    await loadMemories();
  };

  const uploadPhoto = async (memoryId: string, file: File) => {
    const fileName = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("photos").upload(fileName, file);
    if (uploadError) return alert("头像上传失败：" + uploadError.message);

    const { data } = supabase.storage.from("photos").getPublicUrl(fileName);
    const photoUrl = data.publicUrl;

    const { error } = await supabase.from("memories").update({ photo_url: photoUrl }).eq("id", memoryId);
    if (error) return alert("更新头像失败：" + error.message);

    await loadMemories();
  };

  const addEvent = async (memoryId: string, title: string, year?: number, desc?: string) => {
    if (!title.trim()) return alert("请输入事件标题");
    const { error } = await supabase.from("timeline_events").insert([{
      memory_id: memoryId,
      title,
      event_year: year ?? null,
      description: desc ?? "",
    }]);
    if (error) return alert("添加事件失败：" + error.message);
    await loadMemories();
  };

  const updateEvent = async (event: TimelineEvent) => {
    const title = prompt("编辑事件标题", event.title);
    if (!title) return;
    const desc = prompt("编辑事件描述", event.description || "");
    const yearStr = prompt("编辑年份", event.event_year?.toString() || "");
    const year = yearStr ? Number(yearStr) : null;

    const { error } = await supabase.from("timeline_events")
      .update({ title, description: desc, event_year: year })
      .eq("id", event.id);
    if (error) return alert("更新失败：" + error.message);
    await loadMemories();
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm("确认删除此事件？")) return;
    const { error } = await supabase.from("timeline_events").delete().eq("id", eventId);
    if (error) return alert("删除失败：" + error.message);
    await loadMemories();
  };

  useEffect(() => {
    loadMemories();
  }, []);

  if (loading) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">我的记忆体</h1>
          <Link href="/create-memory" className="rounded-lg bg-black px-5 py-3 text-white">
            创建记忆体
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((memory) => (
            <div key={memory.id} className="rounded-2xl bg-white p-4 shadow-sm">
              {/* 头像上传 */}
              <div className="relative cursor-pointer">
                {memory.photo_url ? (
                  <img
                    src={memory.photo_url}
                    alt={memory.name}
                    className="mb-4 h-40 w-full rounded-xl object-cover"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) uploadPhoto(memory.id, file);
                      };
                      input.click();
                    }}
                  />
                ) : (
                  <div
                    className="mb-4 flex h-40 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) uploadPhoto(memory.id, file);
                      };
                      input.click();
                    }}
                  >
                    点击上传头像
                  </div>
                )}
              </div>

              <Link href={`/memories/${memory.id}`}>
                <h2 className="text-xl font-semibold">{memory.name}</h2>
                <p className="mt-1 text-neutral-500">关系：{memory.relationship}</p>
              </Link>

              <div className="mt-2 space-y-1">
                <h3 className="font-semibold">人生时间线：</h3>
                {(eventsMap[memory.id] || []).map((event) => (
                  <div key={event.id} className="flex justify-between items-center bg-neutral-100 p-1 rounded">
                    <span>{event.event_year || "未知年份"}：{event.title}{event.description ? ` - ${event.description}` : ""}</span>
                    <div className="flex gap-1">
                      <button className="bg-yellow-500 px-2 rounded text-white" onClick={() => updateEvent(event)}>编辑</button>
                      <button className="bg-red-600 px-2 rounded text-white" onClick={() => deleteEvent(event.id)}>删除</button>
                    </div>
                  </div>
                ))}
                {/* 添加事件 */}
                <button
                  className="mt-1 bg-black px-3 py-1 rounded text-white text-sm"
                  onClick={() => {
                    const title = prompt("事件标题");
                    if (!title) return;
                    const yearStr = prompt("年份");
                    const year = yearStr ? Number(yearStr) : undefined;
                    const desc = prompt("描述") || "";
                    addEvent(memory.id, title, year, desc);
                  }}
                >
                  添加事件
                </button>
              </div>

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/memories/${memory.id}`}
                  className="rounded-lg bg-black px-4 py-2 text-sm text-white"
                >
                  编辑
                </Link>
                <button
                  onClick={() => deleteMemory(memory.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}