"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabase";

type TimelineEvent = {
  id: string;
  event_year: number | null;
  title: string;
  description: string | null;
};

type Memory = { id: string; name: string; photo_url: string | null };

export default function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: mem } = await supabase.from("memories").select("id, name, photo_url").eq("id", id).single();
      setMemory(mem);
      const { data: evts } = await supabase.from("timeline_events").select("*").eq("memory_id", id).order("event_year", { ascending: true });
      setEvents((evts || []) as TimelineEvent[]);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-neutral-950"><p className="text-white/40">加载中...</p></main>;

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Link href={"/memory-chat/" + id} className="text-sm text-white/40 hover:text-white/60">&larr; 返回聊天</Link>

        <div className="mt-8 mb-10">
          <h1 className="text-3xl font-light text-white">{memory?.name}的人生轨迹</h1>
          <p className="mt-2 text-white/30">每一个节点，都是一段故事</p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-10 text-center">
            <p className="text-4xl">📅</p>
            <p className="mt-3 text-white/40">还没有人生事件</p>
            <p className="mt-1 text-sm text-white/20">在聊天中AI会逐渐了解TA的人生</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-2 bottom-2 w-px bg-white/10" />

            <div className="space-y-8">
              {events.map((e) => (
                <div key={e.id} className="relative flex gap-5 pl-12">
                  {/* Dot */}
                  <div className="absolute left-4 top-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white/20 bg-neutral-950" />

                  {/* Year */}
                  <div className="shrink-0 pt-1">
                    <span className="text-sm font-medium text-white/60">{e.event_year || "?"}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-xl bg-white/5 p-4">
                    <h3 className="font-medium text-white/90">{e.title}</h3>
                    {e.description && (
                      <p className="mt-1 text-sm leading-relaxed text-white/50">{e.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}