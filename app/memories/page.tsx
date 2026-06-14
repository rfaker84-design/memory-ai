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

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMemories = async () => {
      const phone = window.localStorage.getItem("yijian_phone");

      if (!phone) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .eq("user_phone", phone)
        .order("created_at", { ascending: false });

      if (error) {
        alert("加载失败：" + error.message);
        setLoading(false);
        return;
      }

      setMemories(data || []);
      setLoading(false);
    };

    loadMemories();
  }, []);

  const deleteMemory = async (id: string) => {
    const phone = window.localStorage.getItem("yijian_phone");
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

    setMemories((prev) => prev.filter((item) => item.id !== id));
  };

  if (loading) return <main className="p-8">加载中...</main>;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">我的记忆体</h1>

          <Link
            href="/create-memory"
            className="rounded-lg bg-black px-5 py-3 text-white"
          >
            创建记忆体
          </Link>
        </div>

        {memories.length === 0 ? (
          <p className="text-neutral-500">你还没有创建任何记忆体。</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {memories.map((memory) => (
              <div key={memory.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <Link href={`/memories/${memory.id}`}>
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
                  <p className="mt-1 text-neutral-500">
                    关系：{memory.relationship}
                  </p>
                </Link>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/memories/${memory.id}`}
                    className="rounded-lg bg-black px-4 py-2 text-sm text-white"
                  >
                    查看
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
        )}
      </div>
    </main>
  );
}
