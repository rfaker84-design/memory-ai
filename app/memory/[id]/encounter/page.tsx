"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { loadOwnedMemory, loadOwnedMediaUrl, OwnedMemoryRequestError } from "@/src/components/memory/ownedMemoryClient";
import { fetchPickupRequestJson, PickupRequestError } from "@/src/components/memory/pickupRequestClient";
import { AiGeneratedLabel } from "@/src/components/safety/AiGeneratedLabel";
import { useQuietCompanionPresence } from "@/src/components/first-presence/quietCompanionPresence";
import { useReducedMotion } from "@/src/motion";
import { reportProductInteraction } from "@/src/components/product-metrics/productInteractionClient";

type VideoJob = {
  id: string;
  intent: "initial_preview" | "additional_generation";
  status: string;
  artifactAvailable: boolean;
  manualReviewRequired: boolean;
};

type EncounterState =
  | { status: "loading" }
  | { status: "ready"; name: string; portraitUrl: string | null; playbackUrl: string | null; playbackJobId: string | null }
  | { status: "unauthenticated" }
  | { status: "timeout" }
  | { status: "error" };

function encounterViewedKey(memoryId: string): string {
  return `memoryai.initial-encounter-viewed:${memoryId}`;
}

/**
 * This page is presentation-only: it never creates a generation or submits a
 * provider request. It can play only an already approved owner artifact.
 */
export default function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memoryId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<EncounterState>({ status: "loading" });
  const [playbackComplete, setPlaybackComplete] = useState(false);
  const [encounterViewed, setEncounterViewed] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const playbackLastTime = useRef(0);
  const playbackWatchedSeconds = useRef(0);
  const playback3sRecorded = useRef(false);
  const reducedMotion = useReducedMotion();
  const presence = useQuietCompanionPresence({ reducedMotion, replying: false });
  const useStaticEncounter = presence === "static";

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    setPlaybackComplete(false);
    const viewed = typeof window !== "undefined" && window.localStorage.getItem(encounterViewedKey(memoryId)) === "viewed";
    setEncounterViewed(viewed);
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
        if (preview && !viewed) {
          const { response: playbackResponse, body: playbackBody } = await fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/first-presence-video/${encodeURIComponent(preview.id)}/encounter-playback`, { method: "POST" }, signal);
          if (playbackResponse.ok) {
            const encounter = playbackBody as { encounter?: { status?: unknown; playback?: { url?: unknown; saveAllowed?: unknown } } };
            if (encounter.encounter?.status === "claimed" && typeof encounter.encounter.playback?.url === "string" && encounter.encounter.playback.saveAllowed === false) {
              playbackUrl = encounter.encounter.playback.url;
            } else if (encounter.encounter?.status === "already_viewed") {
              setEncounterViewed(true);
            }
          }
        }
        if (!signal?.aborted) setState({ status: "ready", name: memory.name, portraitUrl, playbackUrl, playbackJobId: preview?.id ?? null });
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof OwnedMemoryRequestError && error.status === 401) setState({ status: "unauthenticated" });
      else if (error instanceof OwnedMemoryRequestError && error.status === 408 || error instanceof PickupRequestError) setState({ status: "timeout" });
      else setState({ status: "error" });
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
  const markEncounterViewed = () => {
    window.localStorage.setItem(encounterViewedKey(memoryId), "viewed");
    setEncounterViewed(true);
  };
  const observePlayback = (video: HTMLVideoElement, playbackJobId: string | null) => {
    const current = video.currentTime;
    const delta = current - playbackLastTime.current;
    playbackLastTime.current = current;
    if (delta <= 0 || delta > 1.5 || playback3sRecorded.current) return;
    playbackWatchedSeconds.current += delta;
    if (playbackWatchedSeconds.current < 3 || !playbackJobId) return;
    playback3sRecorded.current = true;
    reportProductInteraction({
      eventName: "first_presence_video_played_3s",
      idempotencyKey: `metrics:v1:first-presence-played-3s:${playbackJobId}`,
      memoryId,
      properties: { elapsed_ms: 3000, job_id: playbackJobId },
    });
  };
  const afterPlayback = () => {
    // Keep the last frame briefly visible, then enter the disclosed chat.
    setPlaybackComplete(true);
    leaveTimer.current = window.setTimeout(continueToChat, 720);
  };

  if (state.status === "loading") return <main><p role="status" aria-live="polite">正在加载</p></main>;
  if (state.status === "unauthenticated") return <main><p role="alert">请先登录，再打开属于你的遇见页面。当前没有读取、创建或播放任何内容。</p><Link href="/login">前往登录</Link></main>;
  if (state.status === "timeout") return <main><p role="alert">读取等待过久，尚未创建或修改任何内容。</p><button type="button" style={{ minHeight: 44 }} onClick={() => void load()}>重新读取</button><button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>直接进入相伴</button></main>;
  if (state.status === "error") return <main><p role="alert">暂时无法打开遇见页面。</p><button type="button" style={{ minHeight: 44 }} onClick={() => void load()}>重新读取</button><button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>直接进入相伴</button></main>;

  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#090807", color: "#fff" }}>
    <section style={{ width: "min(100%, 520px)", display: "grid", gap: 16 }}>
      <p style={{ margin: 0, color: "#d6b675" }}>AI生成 · 基于你确认的信息</p>
      <AiGeneratedLabel confirmedSources />
      <h1 style={{ margin: 0 }}>与 {state.name} 的第一次遇见</h1>
      {playbackComplete && <p role="status" aria-live="polite">影像播放结束，正在进入相伴。</p>}
      {state.playbackUrl && !useStaticEncounter && !encounterViewed ? <div style={{ position: "relative" }}>
        <video src={state.playbackUrl} autoPlay playsInline controls={false} controlsList="nodownload noremoteplayback" disablePictureInPicture onPlay={(event) => { playbackLastTime.current = event.currentTarget.currentTime; markEncounterViewed(); }} onSeeking={(event) => { playbackLastTime.current = event.currentTarget.currentTime; }} onTimeUpdate={(event) => observePlayback(event.currentTarget, state.playbackJobId)} onEnded={afterPlayback} style={{ width: "100%", borderRadius: 20, background: "#15120e" }} aria-label={`${state.name} 的首次相遇影像`} />
        <span data-ai-generated-overlay="true" aria-hidden="true" style={{ position: "absolute", top: 12, right: 12, pointerEvents: "none", borderRadius: 999, padding: "4px 8px", background: "rgba(9,8,7,0.78)", color: "#fff", fontSize: 12 }}>AI生成</span>
      </div> : <>
        {state.portraitUrl ? <img src={state.portraitUrl} alt={`${state.name} 的照片`} style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 20 }} /> : <div role="img" aria-label={`${state.name} 的静态形象`} style={{ minHeight: 360, display: "grid", placeItems: "center", borderRadius: 20, background: "#15120e" }}>{state.name}</div>}
        <p>{encounterViewed ? "这段首次相遇影像已经播放过一次。现在可以回到相伴继续聊天。" : useStaticEncounter ? "当前设备已减少动态效果；首次相遇影像不会自动播放。你可以先进入相伴。" : "遇见影像暂时还不能播放。不会在这里创建生成任务；你可以先进入相伴。"}</p>
        <button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>进入相伴</button>
      </>}
      {state.playbackUrl && <button type="button" style={{ minHeight: 44 }} onClick={continueToChat}>稍后再看，进入相伴</button>}
    </section>
  </main>;
}
