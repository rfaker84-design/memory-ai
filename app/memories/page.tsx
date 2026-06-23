"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050506] px-5 pb-28 pt-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,225,190,0.12),transparent_30%),linear-gradient(180deg,#070707,#020203)]" />

      <section className="relative z-10 mx-auto max-w-[430px]">
        <p className="text-xs tracking-[0.4em] text-white/38">MEMORIES</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-[0.18em]">记忆</h1>
            <p className="mt-4 text-sm leading-7 text-white/52">
              保存照片、声音、故事和重要片段，让 AI 陪伴体只从被授权的记忆中成长。
            </p>
          </div>
        </div>

        <Link
          href="/create-memory"
          className="mt-7 flex h-13 items-center justify-center rounded-2xl bg-white text-sm tracking-[0.18em] text-black"
        >
          创建新的记忆
        </Link>

        {loading ? (
          <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.052] p-5 text-sm text-white/50 backdrop-blur-2xl">
            加载中...
          </div>
        ) : memories.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.052] p-5 backdrop-blur-2xl">
            <p className="text-lg font-light">还没有记忆体</p>
            <p className="mt-3 text-sm leading-7 text-white/48">
              可以从一张照片、一段声音，或一段想念开始。
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.052] p-4 backdrop-blur-2xl"
              >
                <Link href={`/memories/${memory.id}`} className="flex gap-4">
                  {memory.photo_url ? (
                    <img
                      src={memory.photo_url}
                      alt={memory.name}
                      className="h-20 w-20 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-xs text-white/36">
                      暂无照片
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl font-light">{memory.name}</h2>
                    <p className="mt-2 text-sm text-white/45">关系：{memory.relationship}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-3/5 rounded-full bg-white/65" />
                    </div>
                  </div>
                </Link>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/memories/${memory.id}`}
                    className="flex h-10 flex-1 items-center justify-center rounded-2xl bg-white text-sm text-black"
                  >
                    查看
                  </Link>

                  <button
                    onClick={() => deleteMemory(memory.id)}
                    className="h-10 rounded-2xl border border-white/10 px-5 text-sm text-white/62"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
