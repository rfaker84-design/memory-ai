"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  photo_url: string | null;
  voice_sample_url: string | null;
  voice_clone_status: string | null;
  avatar_status: string | null;
  avatar_video_url: string | null;
};

export default function AvatarCenterPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loadingId, setLoadingId] = useState("");

  const loadMemories = async () => {
    const phone = localStorage.getItem("yijian_phone");

    if (!phone) {
      window.location.href = "/login";
      return;
    }

    const { data } = await supabase
      .from("memories")
      .select("*")
      .eq("user_phone", phone)
      .order("created_at", { ascending: false });

    setMemories((data || []) as Memory[]);
  };

  useEffect(() => {
    loadMemories();
  }, []);

  const startVoiceTraining = async (memoryId: string) => {
    setLoadingId(memoryId);

    const res = await fetch("/api/start-voice-training", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memory_id: memoryId }),
    });

    const data = await res.json();

    setLoadingId("");

    if (!res.ok) {
      alert(data.error || "启动声音训练失败");
      return;
    }

    alert("声音训练任务已创建");
    await loadMemories();
  };

  const startAvatarGeneration = async (memoryId: string) => {
    setLoadingId(memoryId);

    const res = await fetch("/api/start-avatar-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memory_id: memoryId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoadingId("");
      alert(data.error || "启动数字人生成失败");
      return;
    }

    const providerRes = await fetch("/api/avatar-provider", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id: data.job_id }),
    });

    const providerData = await providerRes.json();

    setLoadingId("");

    if (!providerRes.ok) {
      alert(providerData.error || "数字人适配层启动失败");
      return;
    }

    alert("数字人生成任务已进入处理队列");
    await loadMemories();
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">数字人训练中心</h1>

          <Link href="/memories" className="rounded-lg bg-black px-5 py-3 text-white">
            返回我的记忆体
          </Link>
        </div>

        {memories.length === 0 ? (
          <p className="text-neutral-500">暂无数字人格。</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {memories.map((memory) => (
              <div key={memory.id} className="rounded-2xl bg-white p-6 shadow-sm">
                {memory.photo_url ? (
                  <img
                    src={memory.photo_url}
                    alt={memory.name}
                    className="mb-4 h-52 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="mb-4 flex h-52 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                    暂无照片
                  </div>
                )}

                <h2 className="text-2xl font-bold">{memory.name}</h2>
                <p className="mt-1 text-neutral-500">{memory.relationship}</p>

                <div className="mt-6 space-y-3 rounded-xl bg-neutral-50 p-4">
                  <p>
                    声音样本：
                    <span className="font-semibold">
                      {memory.voice_sample_url ? "已上传" : "未上传"}
                    </span>
                  </p>

                  <p>
                    声音克隆：
                    <span className="font-semibold">
                      {memory.voice_clone_status || "not_started"}
                    </span>
                  </p>

                  <p>
                    数字人状态：
                    <span className="font-semibold">
                      {memory.avatar_status || "pending"}
                    </span>
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={() => startVoiceTraining(memory.id)}
                    disabled={loadingId === memory.id || !memory.voice_sample_url}
                    className="rounded-lg bg-black px-5 py-3 text-white disabled:opacity-50"
                  >
                    {loadingId === memory.id ? "处理中..." : "开始声音训练"}
                  </button>

                  <button
                    onClick={() => startAvatarGeneration(memory.id)}
                    disabled={loadingId === memory.id || !memory.photo_url}
                    className="rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
                  >
                    {loadingId === memory.id ? "处理中..." : "开始生成数字人"}
                  </button>
                </div>

                {memory.avatar_video_url && (
                  <div className="mt-6 rounded-xl bg-neutral-100 p-4">
                    <p className="mb-2 font-semibold">数字人视频</p>
                    <video controls src={memory.avatar_video_url} className="w-full rounded-xl" />
                  </div>
                )}

                <Link href={`/memory-chat/${memory.id}`} className="mt-4 block text-blue-600">
                  进入聊天 →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
