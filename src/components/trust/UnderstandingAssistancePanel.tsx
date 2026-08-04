"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { UNDERSTANDING_ASSISTANCE_VERSION, assistanceExplanation, type UnderstandingAssistanceState } from "@/features/understanding-assistance/understanding-assistance";

const empty: UnderstandingAssistanceState = { enabled: false, confirmationVersion: null, updatedAt: null };

function validState(value: unknown): UnderstandingAssistanceState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  return typeof state.enabled === "boolean"
    && (state.confirmationVersion === UNDERSTANDING_ASSISTANCE_VERSION || state.confirmationVersion === null)
    && (typeof state.updatedAt === "string" || state.updatedAt === null)
    ? state as UnderstandingAssistanceState
    : null;
}

export function UnderstandingAssistancePanel() {
  const [state, setState] = useState<UnderstandingAssistanceState>(empty);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable">("loading");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPhase("loading"); setNotice("");
    try {
      const response = await fetch("/api/account/understanding-assistance", { credentials: "same-origin", cache: "no-store" });
      const next = validState(await response.json().catch(() => null));
      if (!response.ok || !next) throw new Error("UNDERSTANDING_ASSISTANCE_READ_FAILED");
      setState(next); setPhase("ready");
    } catch { setPhase("unavailable"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = async () => {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/account/understanding-assistance", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": `understanding-assistance-${crypto.randomUUID()}` },
        body: JSON.stringify({ confirmation: "ENABLE_UNDERSTANDING_ASSISTANCE", confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION }),
      });
      const next = validState(await response.json().catch(() => null));
      if (!response.ok || !next) throw new Error("UNDERSTANDING_ASSISTANCE_ENABLE_FAILED");
      setState(next); setPhase("ready");
      setNotice("已暂停购买、退款、公开分享、完整导出、删除和其他高风险授权变更。查看资料和免费聊天不会受影响。");
    } catch { setNotice("暂时无法确认保护状态；没有改变任何设置。"); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/account/understanding-assistance", {
        method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "REVOKE_UNDERSTANDING_ASSISTANCE" }),
      });
      const next = validState(await response.json().catch(() => null));
      if (!response.ok || !next) throw new Error("UNDERSTANDING_ASSISTANCE_REVOKE_FAILED");
      setState(next); setPhase("ready");
      setNotice("已撤回这项协助保护；忆见没有联系任何家人或联系人。");
    } catch { setNotice("暂时无法确认撤回结果；现有保护状态没有被当作已改变。"); }
    finally { setBusy(false); }
  };

  return <main style={{ maxWidth: 680, margin: "0 auto", padding: 24 }}>
    <p>忆见理解与协助</p>
    <h1>需要更多解释或他人协助</h1>
    <p>{assistanceExplanation}</p>
    <p>这不是诊断，也不会因为悲伤、年龄、错别字、表达速度或情绪而自动开启。</p>
    <section aria-label="理解与协助选项">
      <h2>再给我解释一次</h2>
      <p>高风险操作会涉及付款、退款、权益、公开范围或资料删除。开启保护后，这些操作会先暂停；免费聊天和查看资料仍可正常使用。</p>
      <h2>暂时不操作</h2>
      <p>你可以直接离开此页。没有任何操作会被自动提交。</p>
      <h2>请可信任的人协助</h2>
      <p>只有你主动前往陪伴安全设置并建立双方明确同意的联系人关系后，才会保存联系人授权；忆见不会自动通知或联系任何人。</p>
      <Link href="/settings/companion">前往陪伴安全设置</Link>
    </section>
    {phase === "loading" && <p role="status">正在读取保护状态…</p>}
    {phase === "unavailable" && <><p role="alert">暂时无法读取保护状态；没有假定它已开启或撤回。</p><button type="button" onClick={() => void refresh()}>重新读取</button></>}
    {phase === "ready" && (state.enabled
      ? <><p role="status">保护已开启。确认版本：{state.confirmationVersion}。</p><button type="button" disabled={busy} onClick={() => void revoke()}>{busy ? "正在确认" : "撤回保护"}</button></>
      : <button type="button" disabled={busy} onClick={() => void enable()}>{busy ? "正在确认" : "开启高风险操作保护"}</button>)}
    {notice && <p role="status">{notice}</p>}
  </main>;
}

