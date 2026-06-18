"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "../../../src/lib/supabase";

type TimelineEvent = { id: string; event_year: number | null; title: string; description: string | null; };
type Memory = { id: string; name: string; photo_url: string | null };

export default function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from("memories").select("id, name, photo_url").eq("id", id).single();
      setMemory(mem);
      const { data: evts } = await supabase.from("timeline_events").select("*").eq("memory_id", id).order("event_year", { ascending: true });
      setEvents((evts || []) as TimelineEvent[]);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <main className=""><div className="h-10 w-10 rounded-full bg-primary-soft animate-breathe" /></main>;

  return (
    <main className="animate-blur-in ">
      <div className="mx-auto max-w-lg">
        <Link href={"/memory-chat/" + id} className="text-[13px] text-text-muted hover:text-text-soft">&larr; 返回聊天</Link>

        <header className="mt-8 mb-10 animate-fade-in-up">
          <h1 className="font-serif text-[28px] font-light text-text">{memory?.name} 的人生轨迹</h1>
          <p className="mt-2 text-[15px] text-text-muted">每一个节点，都是一段故事</p>
        </header>

        {events.length === 0 ? (
          <div className="animate-scale-in rounded-[28px] bg-surface p-10 text-center shadow-card">
            <span className="text-5xl">📅</span>
            <p className="mt-4 text-text-muted">还没有人生事件</p>
            <p className="mt-1 text-[14px] text-text-muted">在聊天中 AI 会逐渐了解 TA 的人生</p>
          </div>
        ) : (
          <div className="relative stagger">
            <div className="absolute left-[22px] top-3 bottom-3 w-px bg-ink-faint/15" />
            <div className="space-y-8">
              {events.map((e, i) => (
                <div key={e.id} className="relative pl-14" style={{"--i":i} as React.CSSProperties}>
                  <div className="absolute left-[14px] top-1.5 h-4 w-4 rounded-full border-2 border-gold bg-bg" />
                  <div className="rounded-2xl bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                    <span className="text-[13px] font-medium text-primary">{e.event_year || "?"}</span>
                    <h3 className="mt-1 font-serif text-lg text-text">{e.title}</h3>
                    {e.description && <p className="mt-1 text-[14px] leading-relaxed text-text-muted">{e.description}</p>}
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