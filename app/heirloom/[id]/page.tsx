"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabase";

type Memory = { id: string; name: string; photo_url: string | null; voice_sample_url: string | null };

type HeirloomItem = {
  type: "photo" | "voice" | "letter";
  label: string;
  url?: string;
  content?: string;
  created_at?: string;
};

export default function HeirloomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [items, setItems] = useState<HeirloomItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: mem } = await supabase.from("memories").select("id, name, photo_url, voice_sample_url").eq("id", id).single();
      setMemory(mem);

      const built: HeirloomItem[] = [];
      if (mem?.photo_url) built.push({ type: "photo", label: "TA的照片", url: mem.photo_url });
      if (mem?.voice_sample_url) built.push({ type: "voice", label: "TA的声音", url: mem.voice_sample_url });

      const { data: msgs } = await supabase.from("chat_messages").select("content, created_at").eq("memory_id", id).eq("role", "assistant").order("created_at", { ascending: false }).limit(3);
      (msgs || []).forEach((m: Record<string,string>) => {
        built.push({ type: "letter", label: "TA写给你的信", content: m.content, created_at: m.created_at });
      });

      setItems(built);
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
          <h1 className="text-3xl font-light text-white">TA留下的东西</h1>
          <p className="mt-2 text-white/30">每一件，都是TA存在过的证明</p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-10 text-center">
            <p className="text-4xl">📦</p>
            <p className="mt-3 text-white/40">这里还空着</p>
            <p className="mt-1 text-sm text-white/20">上传照片和声音，和TA聊天，这里会逐渐丰富起来</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white/5">
                {item.type === "photo" && item.url && (
                  <>
                    <img src={item.url} alt={item.label} className="w-full h-64 object-cover" />
                    <div className="p-4"><p className="text-sm text-white/50">{item.label}</p></div>
                  </>
                )}
                {item.type === "voice" && item.url && (
                  <div className="p-5">
                    <p className="text-sm text-white/50 mb-3">{item.label}</p>
                    <audio controls src={item.url} className="w-full" />
                  </div>
                )}
                {item.type === "letter" && item.content && (
                  <div className="p-5">
                    <p className="text-xs text-white/30 mb-3">{item.label}{item.created_at ? " · " + new Date(item.created_at).toLocaleDateString("zh-CN") : ""}</p>
                    <p className="text-[15px] leading-relaxed text-white/70 whitespace-pre-wrap">{item.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI letter generation hint */}
        <div className="mt-10 rounded-2xl bg-white/5 p-6 text-center">
          <p className="text-white/40">💌 和TA多聊聊天</p>
          <p className="mt-2 text-sm text-white/20">AI会捕捉TA的语气和记忆，生成专属来信</p>
        </div>
      </div>
    </main>
  );
}