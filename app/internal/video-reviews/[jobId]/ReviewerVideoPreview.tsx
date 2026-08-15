"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

type Playback = { url: string; expiresAt: string };

export function ReviewerVideoPreview({ jobId }: { jobId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeAt = useRef(0);
  const refreshes = useRef(0);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [state, setState] = useState<"loading" | "playing" | "unavailable">("loading");

  const refreshPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime)) resumeAt.current = video.currentTime;
    try {
      const response = await fetch(`/api/internal/video-reviews/${encodeURIComponent(jobId)}/browser-playback`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      const candidate = body && typeof body === "object" ? (body as { playback?: Playback }).playback : undefined;
      if (!response.ok || !candidate || typeof candidate.url !== "string") throw new Error("preview unavailable");
      setPlayback(candidate);
      setState("loading");
    } catch {
      setState("unavailable");
    }
  }, [jobId]);

  useEffect(() => {
    void refreshPlayback();
  }, [refreshPlayback]);

  const resume = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (resumeAt.current > 0 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(resumeAt.current, Math.max(0, video.duration - 0.1));
    }
    void video.play().then(() => setState("playing")).catch(() => setState("unavailable"));
  }, []);

  const handleError = useCallback(() => {
    if (refreshes.current >= 2) {
      setState("unavailable");
      return;
    }
    refreshes.current += 1;
    void refreshPlayback();
  }, [refreshPlayback]);

  return (
    <section className={styles.preview} aria-label="待审视频预览">
      <video
        ref={videoRef}
        className={styles.video}
        src={playback?.url}
        autoPlay
        muted
        playsInline
        controls
        preload="auto"
        onLoadedMetadata={resume}
        onCanPlay={resume}
        onPlaying={() => {
          refreshes.current = 0;
          setState("playing");
        }}
        onError={handleError}
      />
      {state === "loading" && <p className={styles.status}>正在加载受控预览…</p>}
      {state === "unavailable" && <p className={styles.status}>预览暂不可用，请重新打开此审核页面。</p>}
    </section>
  );
}
