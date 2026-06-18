"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "../../../src/lib/supabase";

type Memory = { id: string; name: string; photo_url: string | null; voice_sample_url: string | null };
type HeirloomItem = { type: "photo" | "voice" | "letter"; label: string; url?: string; content?: string; created_at?: string };

export default function HeirloomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [items, setItems] = useState<HeirloomItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from("memories").select("id, name, photo_url, voice_sample_url").eq("id", id).single();
      setMemory(mem);
      const built: HeirloomItem[] = [];
      if (mem?.photo_url) built.push({ type: "photo", label: "TA 的照片", url: mem.photo_url });
      if (mem?.voice_sample_url) built.push({ type: "voice", label: "TA 的声音", url: mem.voice_sample_url });
      const { data: msgs } = await supabase.from("chat_messages").select("content, created_at").eq("memory_id", id).eq("role", "assistant").order("created_at", { ascending: false }).limit(3);
      (msgs || []).forEach((m: Record<string,string>) => built.push({ type: "letter", label: "TA 写给你的信", content: m.content, created_at: m.created_at }));
      setItems(built); setLoading(false);
    })();
  }, [id]);

  if (loading) return <main className=""><div className="h-10 w-10 rounded-full bg-rose/10 animate-breathe" /></main>;

  return (
    <main className="animate-blur-in ">
      <div className="mx-auto max-w-lg">
        <Link href={"/memory-chat/" + id} className="text-[13px] text-text-muted hover:text-text-soft">&larr; 返回聊天</Link>

        <header className="mt-8 mb-10 animate-fade-in-up">
          <h1 className="font-serif text-[28px] font-light text-text">TA 留下的东西</h1>
          <p className="mt-2 text-[15px] text-text-muted">每一件，都是 TA 存在过的证明</p>
        </header>

        {items.length === 0 ? (
          <div className="animate-scale-in rounded-[28px] bg-surface p-10 text-center shadow-card">
            <span className="text-5xl">📦</span>
            <p className="mt-4 text-text-muted">这里还空着</p>
            <p className="mt-1 text-[14px] text-text-muted">上传照片和声音，和 TA 聊天，这里会逐渐丰富起来</p>
          </div>
        ) : (
          <div className="space-y-4 stagger">
            {items.map((item, i) => (
              <div key={i} className="overflow-hidden rounded-[22px] bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover" style={{"--i":i} as React.CSSProperties}>
                {item.type === "photo" && item.url && (
                  <>
                    <img src={item.url} alt="" className="w-full h-56 object-cover" />
                    <div className="p-4"><p className="text-[13px] text-text-muted">{item.label}</p></div>
                  </>
                )}
                {item.type === "voice" && item.url && (
                  <div className="p-5">
                    <p className="text-[13px] text-text-muted mb-3">{item.label}</p>
                    <audio controls src={item.url} className="w-full h-10" />
                  </div>
                )}
                {item.type === "letter" && item.content && (
                  <div className="p-5">
                    <p className="text-[11px] uppercase tracking-wider text-rose mb-3">
                      {item.label}{item.created_at ? " · " + new Date(item.created_at).toLocaleDateString("zh-CN") : ""}
                    </p>
                    <p className="text-[15px] leading-relaxed text-text-soft whitespace-pre-wrap">{item.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 rounded-[22px] bg-rose/10 p-6 text-center">
          <p className="text-[14px] text-rose">💌 和 TA 多聊聊天</p>
          <p className="mt-1 text-[13px] text-text-muted">AI 会捕捉 TA 的语气和记忆，生成专属来信</p>
        </div>
      </div>
    </main>
  );
}