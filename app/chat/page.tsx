"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  photo_url: string | null;
};

export default function ChatPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMemories = async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        alert("读取记忆体失败：" + error.message);
        setLoading(false);
        return;
      }

      setMemories(data || []);
      setLoading(false);
    };

    loadMemories();
  }, []);

  if (loading) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">选择记忆体聊天</h1>
            <p className="mt-2 text-neutral-500">
              选择一位亲人，进入 AI 记忆陪伴对话。
            </p>
          </div>

          <Link
            href="/create-memory"
            className="rounded-lg bg-black px-5 py-3 text-white"
          >
            创建记忆体
          </Link>
        </div>

        {memories.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-neutral-500 shadow-sm">
            还没有记忆体。先创建一位亲人的记忆体，再开始聊天。
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {memories.map((memory) => (
              <div key={memory.id} className="rounded-2xl bg-white p-4 shadow-sm">
                {memory.photo_url ? (
                  <img
                    src={memory.photo_url}
                    alt={memory.name}
                    className="mb-4 h-40 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="mb-4 flex h-40 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                    暂无照片
                  </div>
                )}

                <h2 className="text-xl font-semibold">{memory.name}</h2>
                <p className="mt-1 text-neutral-500">关系：{memory.relationship}</p>
                <p className="mt-3 line-clamp-3 text-sm text-neutral-600">
                  {memory.life_story || "暂无人生故事"}
                </p>

                <Link
                  href={`/memory-chat/${memory.id}`}
                  className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm text-white"
                >
                  开始聊天
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
