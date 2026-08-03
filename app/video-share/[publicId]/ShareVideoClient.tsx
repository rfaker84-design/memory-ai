"use client";

import { useEffect, useState } from "react";

type State = { title: string } | "unavailable" | "loading";

export default function ShareVideoClient({ publicId }: { publicId: string }) {
  const [state, setState] = useState<State>("loading");
  useEffect(() => {
    const controller = new AbortController(); const timer = globalThis.setTimeout(() => controller.abort(), 12_000);
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
    <p>AI 生成纪念影像</p>
    <h1>{state.title}</h1>
    <video src={`/api/video-shares/${encodeURIComponent(publicId)}/playback`} controls playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture aria-label="AI 生成纪念影像，只可在线播放" />
    <p>这是 AI 生成的纪念影像，仅供在线播放；请尊重其中所涉及的个人隐私。</p>
    <a href={`/report?publicShare=${encodeURIComponent(publicId)}`}>投诉或举报此分享</a>
    <a href="/">了解忆见</a>
  </main>;
}
