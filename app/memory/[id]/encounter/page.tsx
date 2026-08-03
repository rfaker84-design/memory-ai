"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { loadOwnedMemory, loadOwnedMediaUrl } from "@/src/components/memory/ownedMemoryClient";
import { fetchPickupRequestJson } from "@/src/components/memory/pickupRequestClient";
import { AiGeneratedLabel } from "@/src/components/safety/AiGeneratedLabel";

type VideoJob = {
  id: string;
  intent: "initial_preview" | "additional_generation";
  status: string;
  artifactAvailable: boolean;
  manualReviewRequired: boolean;
};

type EncounterState =
  | { status: "loading" }
  | { status: "ready"; name: string; portraitUrl: string | null; playbackUrl: string | null }
  | { status: "error" };

/**
 * This page is presentation-only: it never creates a generation or submits a
 * provider request. It can play only an already approved owner artifact.
 */
export default function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memoryId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<EncounterState>({ status: "loading" });
  const [playbackComplete, setPlaybackComplete] = useState(false);
  const leaveTimer = useRef<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    setPlaybackComplete(false);
    try {
        const [memory, jobsResult] = await Promise.all([
          loadOwnedMemory(memoryId, signal),
          fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/first-presence-video`, {}, signal),
        ]);
        const { response: jobsResponse, body: jobsBody } = jobsResult;
        if (!jobsResponse.ok) throw new Error("VIDEO_LIST_UNAVAILABLE");
        const jobs = jobsBody as { jobs?: VideoJob[] };
        const preview = Array.isArray(jobs.jobs)
          ? jobs.jobs.find((job) => job.intent === "initial_preview" && job.status === "succeeded" && job.artifactAvailable && !job.manualReviewRequired)
          : undefined;
        let portraitUrl = memory.photoUrl ?? null;
        if (memory.photoAssetId) portraitUrl = await loadOwnedMediaUrl(memory.photoAssetId, signal).catch(() => portraitUrl);
        let playbackUrl: string | null = null;
        if (preview) {
          const { response: playbackResponse, body: playbackBody } = await fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/first-presence-video/${encodeURIComponent(preview.id)}/playback`, {}, signal);
          if (playbackResponse.ok) {
            const playback = playbackBody as { playback?: { url?: unknown; saveAllowed?: unknown } };
            if (typeof playback.playback?.url === "string" && playback.playback.saveAllowed === false) playbackUrl = playback.playback.url;
          }
        }
        if (!signal?.aborted) setState({ status: "ready", name: memory.name, portraitUrl, playbackUrl });
    } catch {
      if (!signal?.aborted) setState({ status: "error" });
    }
  }, [memoryId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [load]);

  const continueToChat = () => router.replace(`/memory-chat/${encodeURIComponent(memoryId)}`);
  const afterPlayback = () => {
    // Keep the last frame briefly visible, then enter the disclosed chat.
    setPlaybackComplete(true);
    leaveTimer.current = window.setTimeout(continueToChat, 720);
  };

  if (state.status === "loading") return <main><p role="status" aria-live="polite">正在准备这次遇见…</p></main>;
  if (state.status === "error") return <main><p role="alert">暂时无法打开遇见页面。</p><button type="button" style={{ minHeight: 44 }} onClick={() => void load()}>重新读取</button><button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>直接进入相伴</button></main>;

  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#090807", color: "#fff" }}>
    <section style={{ width: "min(100%, 520px)", display: "grid", gap: 16 }}>
      <p style={{ margin: 0, color: "#d6b675" }}>AI纪念陪伴</p>
      <AiGeneratedLabel confirmedSources />
      <h1 style={{ margin: 0 }}>与 {state.name} 的第一次遇见</h1>
      {playbackComplete && <p role="status" aria-live="polite">影像播放结束，正在进入相伴。</p>}
      {state.playbackUrl ? <video src={state.playbackUrl} autoPlay playsInline controls={false} controlsList="nodownload noremoteplayback" disablePictureInPicture onEnded={afterPlayback} style={{ width: "100%", borderRadius: 20, background: "#15120e" }} aria-label={`${state.name} 的首次相遇影像`} /> : <>
        {state.portraitUrl ? <img src={state.portraitUrl} alt={`${state.name} 的照片`} style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 20 }} /> : <div role="img" aria-label={`${state.name} 的静态形象`} style={{ minHeight: 360, display: "grid", placeItems: "center", borderRadius: 20, background: "#15120e" }}>{state.name}</div>}
        <p>遇见影像暂时还不能播放。不会在这里创建生成任务；你可以先进入相伴。</p>
        <button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>进入相伴</button>
      </>}
      {state.playbackUrl && <button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>稍后再看，进入相伴</button>}
    </section>
  </main>;
}
