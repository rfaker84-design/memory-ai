"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { recordTrustConsent, revokeCrisisSupportConsent } from "@/src/components/trust/trustConsentClient";
import { fetchCompanionSettings } from "@/src/components/trust/companionSettingsClient";

export default function CompanionSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unauthenticated" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setMessage("");
    try {
      const response = await fetchCompanionSettings(signal);
      const body = await response.json().catch(() => ({})) as { crisisSupportEnabled?: unknown; error?: unknown };
      if (signal?.aborted) return;
      if (response.ok) {
        setEnabled(body.crisisSupportEnabled === true);
        setLoadState("ready");
      } else if (response.status === 401 || body.error === "UNAUTHENTICATED") {
        setLoadState("unauthenticated");
        setMessage("登录状态已失效。请重新登录后查看或变更危机支持预授权。");
      } else {
        setLoadState("unavailable");
        setMessage("无法读取当前设置，未会假称已开启或变更授权。请稍后重试。");
      }
    } catch {
      if (signal?.aborted) return;
      setLoadState("unavailable");
      setMessage("无法读取当前设置，未会假称已开启或变更授权。请稍后重试。");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const change = async () => {
    if (loadState !== "ready" || busy) return;
    setBusy(true); setMessage("");
    try {
      if (enabled) { await revokeCrisisSupportConsent(); setEnabled(false); setMessage("已撤销危机支持预授权。"); }
      else { await recordTrustConsent("crisis_support_escalation"); setEnabled(true); setMessage("已预授权：即时风险时可创建不含原文的内部支持队列。"); }
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "UNAUTHENTICATED") {
        setLoadState("unauthenticated");
        setMessage("登录状态已失效。请重新登录后再变更危机支持预授权。");
      } else {
        setMessage("暂时无法更新设置；不会假称已变更。请稍后重试。");
      }
    }
    finally { setBusy(false); }
  };
  return <main style={{ padding: 24, maxWidth: 680 }}>
    <h1>陪伴安全设置</h1>
    <p>忆见始终不会代替紧急服务。此选项需由你明确开启；开启后，检测到即时风险时只创建不含聊天原文的内部支持队列，不代表已经联系任何外部人员。</p>
    {loadState === "loading" && <p role="status" aria-live="polite">正在读取当前设置…</p>}
    {loadState === "unauthenticated" && <p role="alert">{message}<Link className="ml-2 underline" href="/login">前往登录</Link></p>}
    {loadState === "unavailable" && <><p role="alert">{message}</p><button type="button" onClick={() => void load()}>重新读取</button></>}
    {loadState === "ready" && <button type="button" onClick={() => void change()} disabled={busy}>{busy ? "正在更新…" : enabled ? "撤销危机支持预授权" : "预授权内部危机支持"}</button>}
    {message && loadState === "ready" && <p role="status">{message}</p>}
  </main>;
}
