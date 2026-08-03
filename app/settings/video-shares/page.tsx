"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Memory = { id: string; name: string };
type Job = { id: string; status: string; artifactAvailable: boolean; manualReviewRequired: boolean };
type Share = { publicId: string; title: string; jobId: string };

export default function VideoShareSettingsPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]); const [memoryId, setMemoryId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]); const [shares, setShares] = useState<Share[]>([]); const [title, setTitle] = useState("");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (id: string) => {
    if (!id) return; setNotice("");
    const [jobResponse, shareResponse] = await Promise.all([fetch(`/api/memories/${encodeURIComponent(id)}/first-presence-video`, { credentials: "include", cache: "no-store" }), fetch(`/api/memories/${encodeURIComponent(id)}/video-shares`, { credentials: "include", cache: "no-store" })]);
    if (!jobResponse.ok || !shareResponse.ok) { setNotice("暂时无法读取影像分享状态；未创建、撤销或修改任何分享。请稍后再试。"); return; }
    const jobBody = await jobResponse.json() as { jobs?: Job[] }; const shareBody = await shareResponse.json() as { shares?: Share[] };
    setJobs(Array.isArray(jobBody.jobs) ? jobBody.jobs : []); setShares(Array.isArray(shareBody.shares) ? shareBody.shares : []);
  }, []);
  useEffect(() => { fetch("/api/memories", { credentials: "include", cache: "no-store" }).then(async r => r.ok ? r.json() : []).then((data: unknown) => { const list = Array.isArray(data) ? data as Memory[] : []; setMemories(list); const first = list[0]?.id ?? ""; setMemoryId(first); if (first) void load(first); }).catch(() => setNotice("暂时无法读取你的 TA；未修改任何分享。")); }, [load]);
  const select = (id: string) => { setMemoryId(id); setTitle(""); void load(id); };
  const create = async (jobId: string) => { if (!memoryId || !title.trim() || busy) return; setBusy(jobId); setNotice(""); try { const r = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, title: title.trim() }) }); if (!r.ok) { setNotice("分享结果尚未确认；请不要重复提交，刷新此页后再核对。 "); return; } setTitle(""); await load(memoryId); } catch { setNotice("分享结果尚未确认；请不要重复提交，刷新此页后再核对。"); } finally { setBusy(null); } };
  const revoke = async (share: Share) => { if (!memoryId || busy || !window.confirm(`撤销“${share.title}”的公开链接？撤销后将立即不可查看。`)) return; setBusy(share.publicId); setNotice(""); try { const r = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(share.publicId)}`, { method: "DELETE", credentials: "include" }); if (!r.ok) { setNotice("撤销结果尚未确认；请不要重复点击，刷新此页后再核对。"); return; } await load(memoryId); } catch { setNotice("撤销结果尚未确认；请不要重复点击，刷新此页后再核对。"); } finally { setBusy(null); } };
  const approved = jobs.filter(job => job.status === "succeeded" && job.artifactAvailable && !job.manualReviewRequired);
  return <main style={{ minHeight: "100dvh", padding: "24px 16px 96px", maxWidth: 640, margin: "auto" }}>
    <button type="button" onClick={() => router.push("/continuity")}>返回我的</button><h1>影像分享</h1><p>仅已人工审核通过的 AI 纪念影像可创建公开只读链接。链接默认不被搜索收录，撤销后立即失效。</p>
    <label>选择 TA<select value={memoryId} onChange={event => select(event.target.value)}>{memories.map(memory => <option key={memory.id} value={memory.id}>{memory.name}</option>)}</select></label>
    <section><h2>创建分享</h2><label>分享标题<input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /></label>{approved.length ? approved.map(job => <button key={job.id} type="button" disabled={!title.trim() || busy !== null} onClick={() => void create(job.id)}>{busy === job.id ? "正在确认…" : "为此已审核影像创建链接"}</button>) : <p>此 TA 暂无可分享的已审核影像。</p>}</section>
    <section><h2>当前链接</h2>{shares.length ? shares.map(share => <article key={share.publicId}><strong>{share.title}</strong><p>公开只读，不提供下载。</p><button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/video-share/${share.publicId}`).then(() => setNotice("链接已复制。"), () => setNotice("未能复制链接；未修改分享状态。"))}>复制链接</button><button type="button" disabled={busy !== null} onClick={() => void revoke(share)}>{busy === share.publicId ? "正在确认…" : "撤销链接"}</button></article>) : <p>尚无活跃分享链接。</p>}</section>
    {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
  </main>;
}
