"use client";

import { useEffect, useRef, useState } from "react";

const ACCOUNT_EXPORT_TIMEOUT_MS = 12_000;

export function AccountDataExportPanel() {
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const download = async () => {
    if (downloading) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, ACCOUNT_EXPORT_TIMEOUT_MS);
    activeRequest.current = controller;
    setDownloading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/export", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (activeRequest.current !== controller) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (response.status === 403 && body.error === "REAUTH_REQUIRED") {
          setMessage("为保护你的资料，请重新完成登录，并在 5 分钟内返回此页下载副本。");
        } else {
          setMessage(body.error ?? "暂时无法生成资料副本，请稍后重试。");
        }
        return;
      }
      const blob = await response.blob();
      if (activeRequest.current !== controller) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "memoryai-account-data-export.json";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("资料副本已开始下载。媒体和已审批视频仍由各自的 Owner 访问边界保护。");
    } catch {
      if (activeRequest.current !== controller) return;
      setMessage(timedOut
        ? "下载资料副本超时，无法确认是否已经开始下载。为避免重复暴露，忆见不会自动重试；请先查看本机下载列表，必要时由你手动重新下载。"
        : "网络连接中断，无法确认资料副本是否已经开始下载。为避免重复暴露，忆见不会自动重试；请先查看本机下载列表，必要时由你手动重新下载。");
    } finally {
      globalThis.clearTimeout(timer);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setDownloading(false);
      }
    }
  };

  return <main>
    <h1>下载我的资料副本</h1>
    <p>副本包含你拥有的 TA、对话、媒体元数据、同意记录以及最小订单和退款摘要。它不包含登录凭据、Provider 请求、对象存储路径、签名链接或内部审计资料。</p>
    <p>为避免他人拿到已登录设备后导出敏感内容，请在重新登录后的 5 分钟内下载。</p>
    {message ? <p role="status">{message}</p> : null}
    <button type="button" disabled={downloading} onClick={() => void download()}>
      {downloading ? "正在生成资料副本…" : "下载 JSON 资料副本"}
    </button>
  </main>;
}
