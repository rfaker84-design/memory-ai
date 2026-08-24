"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Memory = { id: string; name: string };
type Job = { id: string; status: string; saveAllowed: boolean; artifactAvailable: boolean; manualReviewRequired: boolean };
type Share = { publicId: string; title: string; jobId: string; watermarkDownloadEnabled: boolean };

async function boundedFetch(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController(); const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); } finally { globalThis.clearTimeout(timer); }
}

export default function VideoShareSettingsPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]); const [memoryId, setMemoryId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]); const [shares, setShares] = useState<Share[]>([]); const [title, setTitle] = useState("");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const [assistanceBlocked, setAssistanceBlocked] = useState(false);
  const load = useCallback(async (id: string) => {
    if (!id) return; setNotice("");
    const [jobResponse, shareResponse] = await Promise.all([boundedFetch(`/api/memories/${encodeURIComponent(id)}/first-presence-video`, { credentials: "include", cache: "no-store" }, 12_000), boundedFetch(`/api/memories/${encodeURIComponent(id)}/video-shares`, { credentials: "include", cache: "no-store" }, 12_000)]);
    if (!jobResponse.ok || !shareResponse.ok) { setNotice("暂时无法读取影像分享状态；未创建、撤销或修改任何分享。请稍后再试。"); return; }
    const jobBody = await jobResponse.json() as { jobs?: Job[] }; const shareBody = await shareResponse.json() as { shares?: Share[] };
    setJobs(Array.isArray(jobBody.jobs) ? jobBody.jobs : []); setShares(Array.isArray(shareBody.shares) ? shareBody.shares : []);
  }, []);
  useEffect(() => { boundedFetch("/api/memories", { credentials: "include", cache: "no-store" }, 12_000).then(async r => r.ok ? r.json() : []).then((data: unknown) => { const list = Array.isArray(data) ? data as Memory[] : []; setMemories(list); const first = list[0]?.id ?? ""; setMemoryId(first); if (first) void load(first); }).catch(() => setNotice("暂时无法读取你的 TA；未修改任何分享。")); }, [load]);
  const select = (id: string) => { setMemoryId(id); setTitle(""); void load(id); };
  const create = async (jobId: string) => { if (!memoryId || !title.trim() || busy) return; setBusy(jobId); setNotice(""); setAssistanceBlocked(false); try { const r = await boundedFetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, title: title.trim() }) }, 20_000); if (!r.ok) { const body = await r.json().catch(() => ({})) as { error?: string }; if (r.status === 409 && body.error === "UNDERSTANDING_ASSISTANCE_REQUIRED") { setNotice("\u8fd9\u9879\u64cd\u4f5c\u5df2\u6682\u65f6\u505c\u6b62\u3002\u4f60\u53ef\u4ee5\u5148\u518d\u770b\u4e00\u6b21\u8bf4\u660e\uff0c\u6682\u65f6\u4e0d\u5206\u4eab\uff0c\u6216\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9\uff1b\u5fc6\u89c1\u4e0d\u4f1a\u66ff\u4f60\u5224\u65ad\uff0c\u4e5f\u4e0d\u4f1a\u81ea\u52a8\u8054\u7cfb\u4efb\u4f55\u4eba\u3002"); setAssistanceBlocked(true); return; } setNotice("分享结果尚未确认；请不要重复提交，刷新此页后再核对。 "); return; } setTitle(""); await load(memoryId); } catch { setNotice("分享结果尚未确认；请不要重复提交，刷新此页后再核对。"); } finally { setBusy(null); } };
  const revoke = async (share: Share) => { if (!memoryId || busy || !window.confirm(`撤销“${share.title}”的公开链接？撤销后将立即不可查看。`)) return; setBusy(share.publicId); setNotice(""); try { const r = await boundedFetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(share.publicId)}`, { method: "DELETE", credentials: "include" }, 20_000); if (!r.ok) { setNotice("撤销结果尚未确认；请不要重复点击，刷新此页后再核对。"); return; } await load(memoryId); } catch { setNotice("撤销结果尚未确认；请不要重复点击，刷新此页后再核对。"); } finally { setBusy(null); } };
  const setWatermarkDownload = async (share: Share, enabled: boolean) => { if (!memoryId || busy) return; setBusy(`watermark-${share.publicId}`); setNotice(""); try { const r = await boundedFetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(share.publicId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ watermarkDownloadEnabled: enabled }) }, 20_000); if (!r.ok) { setNotice("Watermark-download setting was not confirmed. Refresh before trying again."); return; } await load(memoryId); } catch { setNotice("Watermark-download setting was not confirmed. Refresh before trying again."); } finally { setBusy(null); } };
  const downloadWatermarked = async (share: Share) => { if (!memoryId || busy || !share.watermarkDownloadEnabled) return; setBusy(`download-${share.publicId}`); setNotice(""); try { const r = await boundedFetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(share.publicId)}/download`, { credentials: "include", cache: "no-store" }, 120_000); if (!r.ok || r.headers.get("content-type") !== "video/mp4") { setNotice("Watermarked video was not confirmed; no file was delivered."); return; } const objectUrl = URL.createObjectURL(await r.blob()); const link = document.createElement("a"); link.href = objectUrl; link.download = "memoryai-watermarked-video.mp4"; link.click(); URL.revokeObjectURL(objectUrl); setNotice("A watermarked AI Generated | MemoryAI copy was handed to your device. Device save status is controlled by the browser."); } catch { setNotice("Watermarked video was not confirmed; no file was delivered."); } finally { setBusy(null); } };
  const approved = jobs.filter(job => job.status === "succeeded" && job.saveAllowed && job.artifactAvailable && !job.manualReviewRequired);
  const control = { minHeight: 44, padding: "0 12px" };
  return <main style={{ minHeight: "100dvh", padding: "24px 16px 96px", maxWidth: 640, margin: "auto" }}>
    <button type="button" style={control} onClick={() => router.push("/continuity")}>返回我的</button><h1>影像分享</h1><p>仅已人工审核通过的 AI 纪念影像可创建公开只读链接。链接默认不被搜索收录，撤销后立即失效。</p>
    <label>选择 TA<select style={control} value={memoryId} onChange={event => select(event.target.value)}>{memories.map(memory => <option key={memory.id} value={memory.id}>{memory.name}</option>)}</select></label>
    <section><h2>创建分享</h2><label>分享标题<input style={control} value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /></label>{approved.length ? approved.map(job => <button key={job.id} style={control} type="button" disabled={!title.trim() || busy !== null} onClick={() => void create(job.id)}>{busy === job.id ? "正在确认…" : "为此已审核影像创建链接"}</button>) : <p>此 TA 暂无可分享的已审核影像。</p>}</section>
    <section><h2>当前链接</h2>{shares.length ? shares.map(share => <article key={share.publicId}><strong>{share.title}</strong><p>公开只读，不提供下载。</p><button style={control} type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/video-share/${share.publicId}`).then(() => setNotice("链接已复制。"), () => setNotice("未能复制链接；未修改分享状态。"))}>复制链接</button><button style={control} type="button" disabled={busy !== null} onClick={() => void revoke(share)}>{busy === share.publicId ? "正在确认…" : "撤销链接"}</button></article>) : <p>尚无活跃分享链接。</p>}</section>
    <section><h2>影像下载设置</h2><p>公开链接始终仅供观看。你可以为已审核影像单独开启带 AI 标识的临时下载，不会创建长期副本。</p>{shares.map(share => <article key={`watermark-${share.publicId}`}><strong>{share.title}</strong><button style={control} type="button" disabled={busy !== null} onClick={() => void setWatermarkDownload(share, !share.watermarkDownloadEnabled)}>{busy === `watermark-${share.publicId}` ? "正在确认…" : share.watermarkDownloadEnabled ? "关闭临时下载" : "开启临时下载"}</button>{share.watermarkDownloadEnabled ? <button style={control} type="button" disabled={busy !== null} onClick={() => void downloadWatermarked(share)}>{busy === `download-${share.publicId}` ? "正在准备…" : "下载带 AI 标识的副本"}</button> : null}</article>)}</section>
    {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
    {assistanceBlocked ? <p><Link href="/settings/understanding-assistance">{"\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9"}</Link></p> : null}
  </main>;
}
