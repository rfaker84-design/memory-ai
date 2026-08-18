"use client";

import { useEffect, useState } from "react";

type State = { title: string } | "unavailable" | "loading";

export default function ShareVideoClient({ publicId }: { publicId: string }) {
  const [state, setState] = useState<State>("loading");
  useEffect(() => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      controller.abort();
      setState("unavailable");
    }, 12_000);
    fetch(`/api/video-shares/${encodeURIComponent(publicId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: unknown) => {
        const title = body && typeof body === "object" && "share" in body && typeof (body as { share?: { title?: unknown } }).share?.title === "string"
          ? (body as { share: { title: string } }).share.title : null;
        setState(title ? { title } : "unavailable");
      }).catch(() => { if (!controller.signal.aborted) setState("unavailable"); });
    return () => { globalThis.clearTimeout(timer); controller.abort(); };
  }, [publicId]);

  if (state === "loading") return <main aria-busy="true" aria-live="polite"><p>正在打开分享内容…</p></main>;
  if (state === "unavailable") return <main><h1>此分享内容已不可查看</h1><p role="alert">它可能已被所有者撤销或删除。</p></main>;
  return <main>
    <p data-memoryai-logo="true" aria-label="忆见 Logo">忆见 <span aria-hidden="true">MemoryAI</span></p>
    <p>AI生成 · 基于你确认的信息</p>
    <h1>{state.title}</h1>
    <div style={{ position: "relative" }}>
      <video src={`/api/video-shares/${encodeURIComponent(publicId)}/playback`} controls playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture aria-label="AI生成影像，只可在线播放" />
      <span data-ai-generated-overlay="true" aria-hidden="true" style={{ position: "absolute", top: 12, right: 12, pointerEvents: "none", borderRadius: 999, padding: "4px 8px", background: "rgba(9,8,7,0.78)", color: "#fff", fontSize: 12 }}>AI生成</span>
    </div>
    <p>这段影像由 AI 根据你提供的照片生成，不代表真实发生过的画面。</p>
    <a href={`/report?publicShare=${encodeURIComponent(publicId)}&reason=not_like_ta`}>这不像TA</a>
    <a href={`/report?publicShare=${encodeURIComponent(publicId)}`}>投诉或举报此分享</a>
    <a href="/">了解忆见</a>
  </main>;
}
