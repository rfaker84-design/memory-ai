"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MemoryTheme as T } from "@/src/lib/design-system/memory-theme";
import { fetchPickupIndexMemories, PickupIndexRequestError } from "@/src/components/memory/pickupIndexRequest";

type Memory = { id: string; name: string; relationship: string | null };

export default function PickupIndexPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "timeout">("loading");

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const response = await fetchPickupIndexMemories(fetch, signal);
      if (!response.ok) throw new Error("MEMORIES_UNAVAILABLE");
      const value = await response.json();
      if (!signal?.aborted) {
        setMemories(Array.isArray(value) ? value : []);
        setState("ready");
      }
    } catch (error) {
      if (!signal?.aborted) setState(error instanceof PickupIndexRequestError ? "timeout" : "error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return <main style={{ minHeight: "calc(100dvh - var(--nav-height,64px))", padding: "28px 20px 96px", background: T.colors.bg }}>
    <p style={{ margin: 0, color: T.colors.textFaint, fontSize: 12, letterSpacing: "0.08em" }}>用户主动确认式资料</p>
    <h1 style={{ margin: "6px 0 10px", color: T.colors.text, fontSize: 28 }}>把想起的事留在这里。</h1>
    <p style={{ margin: "0 0 24px", color: T.colors.textMuted, lineHeight: 1.7 }}>你说，忆见帮你整理。只有经过你确认，才会成为TA可以引用的记忆。</p>
    {state === "loading" && <p role="status" aria-live="polite">正在读取你的 TA…</p>}
    {(state === "error" || state === "timeout") && <section role="alert"><p>{state === "timeout" ? "读取等待过久，尚未修改任何资料。" : "暂时无法读取 TA。"}</p><button type="button" style={{ minHeight: 44 }} onClick={() => void load()}>重试</button></section>}
    {state === "ready" && memories.length === 0 && <section style={{ padding: 20, borderRadius: T.radius.lg, background: T.colors.card }}><p>先创建 TA，才能将资料关联到对应的相伴对象。</p><button type="button" style={{ minHeight: 44 }} onClick={() => router.push("/create-memory")}>创建 TA</button></section>}
    {state === "ready" && memories.map((memory) => <section key={memory.id} style={{ display: "flex", width: "100%", flexWrap: "wrap", alignItems: "center", gap: 12, margin: "0 0 12px", padding: 16, border: `1px solid ${T.colors.border}`, borderRadius: T.radius.lg, background: T.colors.card, color: T.colors.text, minHeight: 64 }}>
      <span aria-hidden="true" style={{ display: "grid", width: 42, height: 42, placeItems: "center", borderRadius: "50%", background: T.colors.primarySoft, color: T.colors.primary, fontWeight: 700 }}>{memory.name.slice(0, 1)}</span>
      <span style={{ flex: "1 1 160px", minWidth: 0 }}><strong style={{ display: "block", overflowWrap: "anywhere" }}>{memory.name}</strong><small style={{ color: T.colors.textFaint }}>{memory.relationship || "关系待补充"}</small></span>
      <div style={{ display: "flex", flex: "1 1 100%", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={{ minHeight: 44 }} onClick={() => router.push(`/memory/${memory.id}/pickup`)}>从一件小事说起</button>
        <button type="button" style={{ minHeight: 44 }} onClick={() => router.push(`/memory/${memory.id}/pickup?from=photo`)}>从一张照片说起</button>
      </div>
    </section>)}
  </main>;
}
