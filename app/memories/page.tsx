"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  created_at: string;
};

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMemories = async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        alert("读取失败：" + error.message);
        setLoading(false);
        return;
      }

      setMemories(data || []);
      setLoading(false);
    };

    fetchMemories();
  }, []);

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold text-neutral-900">
          我的亲人记忆体
        </h1>

        <p className="mb-8 text-neutral-600">
          这里保存着你创建的亲人故事，后续将用于 AI 记忆聊天。
        </p>

        {loading ? (
          <p>加载中...</p>
        ) : memories.length === 0 ? (
          <p>还没有创建记忆体。</p>
        ) : (
          <div className="grid gap-4">
            {memories.map((memory) => (
              <a
                key={memory.id}
                href={`/memories/${memory.id}`}
                className="block rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <h2 className="text-xl font-semibold">{memory.name}</h2>

                <p className="mt-1 text-neutral-500">
                  关系：{memory.relationship}
                </p>

                <p className="mt-4 whitespace-pre-wrap text-neutral-700">
                  {memory.life_story || "暂无人生故事"}
                </p>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
