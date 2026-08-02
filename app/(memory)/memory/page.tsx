"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MemoryTheme as T } from "@/src/lib/design-system/memory-theme";

type Memory = { id: string; name: string; relationship: string | null };

export default function PickupIndexPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/memories", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("MEMORIES_UNAVAILABLE");
        const value = await response.json();
        if (!controller.signal.aborted) {
          setMemories(Array.isArray(value) ? value : []);
          setState("ready");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);

  return <main style={{ minHeight: "calc(100dvh - var(--nav-height,64px))", padding: "28px 20px 96px", background: T.colors.bg }}>
    <p style={{ margin: 0, color: T.colors.textFaint, fontSize: 12, letterSpacing: "0.08em" }}>用户主动确认式资料</p>
    <h1 style={{ margin: "6px 0 10px", color: T.colors.text, fontSize: 28 }}>把想起的事留在这里。</h1>
    <p style={{ margin: "0 0 24px", color: T.colors.textMuted, lineHeight: 1.7 }}>你说，忆见帮你整理。只有经过你确认，才会成为TA可以引用的记忆。</p>
    {state === "loading" && <p>正在读取你的 TA…</p>}
    {state === "error" && <p role="alert">暂时无法读取 TA，请稍后重试。</p>}
    {state === "ready" && memories.length === 0 && <section style={{ padding: 20, borderRadius: T.radius.lg, background: T.colors.card }}><p>先创建 TA，才能将资料关联到对应的相伴对象。</p><button type="button" onClick={() => router.push("/create-memory")}>创建 TA</button></section>}
    {state === "ready" && memories.map((memory) => <section key={memory.id} style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, margin: "0 0 12px", padding: 16, border: `1px solid ${T.colors.border}`, borderRadius: T.radius.lg, background: T.colors.card, color: T.colors.text, minHeight: 64 }}>
      <span aria-hidden="true" style={{ display: "grid", width: 42, height: 42, placeItems: "center", borderRadius: "50%", background: T.colors.primarySoft, color: T.colors.primary, fontWeight: 700 }}>{memory.name.slice(0, 1)}</span>
      <span style={{ flex: 1 }}><strong style={{ display: "block" }}>{memory.name}</strong><small style={{ color: T.colors.textFaint }}>{memory.relationship || "关系待补充"}</small></span>
      <button type="button" onClick={() => router.push(`/memory/${memory.id}/pickup`)}>从一件小事说起</button>
      <button type="button" onClick={() => router.push(`/memory/${memory.id}/pickup?from=photo`)}>从一张照片说起</button>
    </section>)}
  </main>;
}
