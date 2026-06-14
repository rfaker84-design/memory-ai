"use client";

import { useCallback, useEffect, useState } from "react";
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

type AvatarJob = {
  id: string;
  memory_id: string;
  job_type: "voice_clone" | "avatar_video" | "talking_avatar_video" | string;
  provider: string | null;
  provider_job_id: string | null;
  status: string | null;
  progress: number | null;
  output_url: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type JobsByMemoryId = Record<string, AvatarJob[]>;

const statusLabel: Record<string, string> = {
  pending: "等待中",
  processing: "处理中",
  training: "训练中",
  generating: "生成中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  not_started: "未开始",
};

function formatStatus(status?: string | null) {
  if (!status) return "未开始";
  return statusLabel[status] || status;
}

function getLatestJob(jobs: AvatarJob[] | undefined, jobType: string) {
  return jobs?.find((job) => job.job_type === jobType) || null;
}

function JobStatus({ job }: { job: AvatarJob | null }) {
  if (!job) {
    return <p className="text-sm text-neutral-500">暂无任务</p>;
  }

  const progress = Math.max(0, Math.min(100, job.progress ?? 0));

  return (
    <div className="mt-2 rounded-lg border bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{formatStatus(job.status)}</span>
        <span className="text-neutral-500">{job.provider || "unknown"}</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-black transition-all duration-500"
          style={{ width: progress + "%" }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-neutral-500">
        <span>进度 {progress}%</span>
        {job.provider_job_id && <span>任务号 {job.provider_job_id}</span>}
      </div>

      {job.error_message && (
        <p className="mt-2 rounded bg-red-50 p-2 text-red-700">
          {job.error_message}
        </p>
      )}

      {job.output_url && (
        <a
          href={job.output_url}
          target="_blank"
          className="mt-2 inline-block text-blue-600"
        >
          查看输出文件
        </a>
      )}
    </div>
  );
}

export default function AvatarCenterPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [jobsByMemoryId, setJobsByMemoryId] = useState<JobsByMemoryId>({});
  const [loadingId, setLoadingId] = useState("");

  const loadJobs = useCallback(async (items: Memory[]) => {
    const entries = await Promise.all(
      items.map(async (memory) => {
        const res = await fetch("/api/jobs?memory_id=" + memory.id);
        if (!res.ok) return [memory.id, []] as const;
        const data = (await res.json()) as { jobs?: AvatarJob[] };
        return [memory.id, data.jobs || []] as const;
      })
    );
    setJobsByMemoryId(Object.fromEntries(entries));
  }, []);

  const loadMemories = useCallback(async () => {
    const phone = localStorage.getItem("yijian_phone");
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
      alert("加载数字人格失败：" + error.message);
      return;
    }
    const items = (data || []) as Memory[];
    setMemories(items);
    await loadJobs(items);
  }, [loadJobs]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    const hasActiveJobs = Object.values(jobsByMemoryId).some((jobs) =>
      jobs.some(
        (job) =>
          job.status === "pending" ||
          job.status === "processing" ||
          job.status === "training" || job.status === "generating" ||
          job.status === "generating"
      )
    );
    if (!hasActiveJobs || memories.length === 0) return;
    const interval = setInterval(() => { loadJobs(memories); }, 10000);
    return () => clearInterval(interval);
  }, [jobsByMemoryId, memories, loadJobs]);

  const startVoiceTraining = async (memoryId: string) => {
    setLoadingId(memoryId);
    const res = await fetch("/api/start-voice-training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory_id: memoryId }),
    });
    const data = await res.json();
    setLoadingId("");
    if (!res.ok) {
      alert(data.error || "启动声音训练失败");
      return;
    }
    alert("声音克隆任务已进入处理队列");
    await loadMemories();
  };

  const startAvatarGeneration = async (memoryId: string) => {
    setLoadingId(memoryId);
    const res = await fetch("/api/start-avatar-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory_id: memoryId }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "启动数字人生成失败");
      return;
    }
    const providerRes = await fetch("/api/avatar-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          <div>
            <h1 className="text-3xl font-bold">数字人训练中心</h1>
            <p className="mt-2 text-neutral-500">管理声音克隆、数字人生成和任务进度。</p>
          </div>
          <Link href="/memories" className="rounded-lg bg-black px-5 py-3 text-white">返回我的记忆体</Link>
        </div>
        {memories.length === 0 ? (
          <p className="text-neutral-500">暂无数字人格。</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {memories.map((memory) => {
              const jobs = jobsByMemoryId[memory.id] || [];
              const voiceJob = getLatestJob(jobs, "voice_clone");
              const avatarJob = getLatestJob(jobs, "avatar_video");
              return (
                <div key={memory.id} className="rounded-2xl bg-white p-6 shadow-sm">
                  {memory.photo_url ? (
                    <img src={memory.photo_url} alt={memory.name} className="mb-4 h-52 w-full rounded-xl object-cover" />
                  ) : (
                    <div className="mb-4 flex h-52 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">暂无照片</div>
                  )}
                  <h2 className="text-2xl font-bold">{memory.name}</h2>
                  <p className="mt-1 text-neutral-500">{memory.relationship}</p>
                  <div className="mt-6 space-y-3 rounded-xl bg-neutral-50 p-4">
                    <p>声音样本：<span className="font-semibold">{memory.voice_sample_url ? "已上传" : "未上传"}</span></p>
                    <p>声音克隆：<span className="font-semibold">{formatStatus(memory.voice_clone_status)}</span></p>
                    <JobStatus job={voiceJob} />
                    <p>数字人状态：<span className="font-semibold">{formatStatus(memory.avatar_status)}</span></p>
                    <JobStatus job={avatarJob} />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => startVoiceTraining(memory.id)} disabled={loadingId === memory.id || !memory.voice_sample_url} className="rounded-lg bg-black px-5 py-3 text-white disabled:opacity-50">
                      {loadingId === memory.id ? "处理中..." : "开始声音克隆"}
                    </button>
                    <button onClick={() => startAvatarGeneration(memory.id)} disabled={loadingId === memory.id || !memory.photo_url} className="rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50">
                      {loadingId === memory.id ? "处理中..." : "开始生成数字人"}
                    </button>
                  </div>
                  {memory.avatar_video_url && (
                    <div className="mt-6 rounded-xl bg-neutral-100 p-4">
                      <p className="mb-2 font-semibold">数字人视频</p>
                      <video controls src={memory.avatar_video_url} className="w-full rounded-xl" />
                    </div>
                  )}
                  <Link href={"/memory-chat/" + memory.id} className="mt-4 block text-blue-600">进入聊天 →</Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
