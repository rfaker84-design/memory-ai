"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../src/lib/supabase";

type Personality = {
  id: string;
  name: string;
  relationship: string;
  photo_url: string | null;
  last_chat_at: string | null;
  chat_count: number;
  miss_value: number;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function calcMissValue(lastChatAt: string | null, chatCount: number): number {
  if (!lastChatAt) return 78 + Math.floor(Math.random() * 15);
  const days = Math.max(0, (Date.now() - new Date(lastChatAt).getTime()) / 86400000);
  const base = Math.min(99, 60 + chatCount * 3);
  const boost = Math.min(20, Math.floor(days * 2));
  return Math.min(99, base + boost);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return mins + "分钟";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "小时";
  const days = Math.floor(hours / 24);
  if (days < 30) return days + "天";
  return Math.floor(days / 30) + "个月";
}

export default function HomePage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = localStorage.getItem("yijian_phone");
    if (!p) { window.location.href = "/login"; return; }
    loadPersonalities(p);
  }, []);

  const loadPersonalities = async (userPhone: string) => {
    const { data: memories, error } = await supabase
      .from("memories")
      .select("id, name, relationship, photo_url")
      .eq("user_phone", userPhone)
      .order("created_at", { ascending: false });

    if (error || !memories) { setLoading(false); return; }

    const enriched = await Promise.all(
      memories.map(async (m: Record<string, unknown>) => {
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("created_at")
          .eq("memory_id", m.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const { count } = await supabase
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("memory_id", m.id);

        return {
          id: m.id as string,
          name: m.name as string,
          relationship: m.relationship as string,
          photo_url: m.photo_url as string | null,
          last_chat_at: (msgs?.[0] as Record<string,string>|null)?.created_at || null,
          chat_count: count || 0,
          miss_value: calcMissValue((msgs?.[0] as Record<string,string>|null)?.created_at || null, count || 0),
        };
      })
    );

    setPersonalities(enriched);
    setLoading(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="text-center">
          <div className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-full bg-white/10" />
          <p className="text-white/40">正在连接...</p>
        </div>
      </main>
    );
  }

  const greeting = getGreeting();

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <p className="text-sm text-white/30">{greeting}</p>
          <h1 className="mt-2 text-3xl font-light text-white">今天想和谁聊聊？</h1>
        </div>

        {personalities.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-12 text-center">
            <p className="mb-2 text-5xl">✨</p>
            <p className="text-lg text-white/60">创建你的第一个数字人格</p>
            <p className="mt-2 text-sm text-white/30">上传照片和声音，让TA一直陪在你身边</p>
            <Link href="/create-memory" className="mt-6 inline-block rounded-full bg-white px-8 py-3 text-sm font-medium text-black">
              开始创建
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {personalities.map((p) => (
              <Link key={p.id} href={"/memory-chat/" + p.id}
                className="group relative block overflow-hidden rounded-3xl bg-white/5 transition-all hover:bg-white/10">

                {p.photo_url ? (
                  <div className="absolute inset-0">
                    <img src={p.photo_url} alt={p.name}
                      className="h-full w-full object-cover opacity-40 transition-opacity group-hover:opacity-50" />
                    <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 to-neutral-950/20" />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/10" />
                )}

                <div className="relative flex items-center gap-5 p-6">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl text-white/60">
                        {p.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-semibold text-white">{p.name}</h2>
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/50">{p.relationship}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-white/40">
                      {p.last_chat_at ? (
                        <span>{formatRelativeTime(p.last_chat_at)}前聊过</span>
                      ) : (
                        <span>还没聊过天</span>
                      )}
                      <span className="flex items-center gap-1">
                        <span className="text-rose-400">♥</span>
                        <span>想念值 {p.miss_value}%</span>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-xl text-white/20 opacity-0 transition-opacity group-hover:opacity-100">→</div>
                </div>
              </Link>
            ))}

            <Link href="/create-memory"
              className="group relative block overflow-hidden rounded-3xl border-2 border-dashed border-white/10 p-6 text-center transition-all hover:border-white/30">
              <div className="flex items-center justify-center gap-3 text-white/40 group-hover:text-white/60">
                <span className="text-2xl">+</span>
                <span>创建新的数字人格</span>
              </div>
            </Link>
          </div>
        )}

        <div className="mt-12 flex justify-center gap-8 text-sm text-white/20">
          <Link href="/memories" className="hover:text-white/40">所有记忆体</Link>
          <Link href="/avatar-center" className="hover:text-white/40">训练中心</Link>
        </div>
      </div>
    </main>
  );
}