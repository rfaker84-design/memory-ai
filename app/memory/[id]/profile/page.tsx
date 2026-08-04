"use client";

import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { loadOwnedMemory, OwnedMemoryRequestError } from "@/src/components/memory/ownedMemoryClient";

type ProfileDraft = {
  name: string;
  relationship: string;
  personalityProfile: string;
  speechStyle: string;
  catchPhrases: string;
  lifeStory: string;
};

type PageState = "loading" | "ready" | "not-found" | "unavailable";

function draftFromMemory(memory: Awaited<ReturnType<typeof loadOwnedMemory>>): ProfileDraft {
  return {
    name: memory.name,
    relationship: memory.relationship,
    personalityProfile: memory.personalityProfile ?? "",
    speechStyle: memory.speechStyle ?? "",
    catchPhrases: memory.catchPhrases ?? "",
    lifeStory: memory.lifeStory ?? "",
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

/** Owner-only editor for the same formal Memory DTO used by companion chat. */
export default function MemoryProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memoryId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<PageState>("loading");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setNotice("");
    try {
      const memory = await loadOwnedMemory(memoryId, signal);
      if (signal?.aborted) return;
      setDraft(draftFromMemory(memory));
      setState("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setState(error instanceof OwnedMemoryRequestError && error.status === 404 ? "not-found" : "unavailable");
    }
  }, [memoryId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const update = (field: keyof ProfileDraft, value: string) => {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving || !draft.name.trim() || !draft.relationship.trim()) return;
    setSaving(true);
    setNotice("");
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          relationship: draft.relationship.trim(),
          personalityProfile: nullable(draft.personalityProfile),
          speechStyle: nullable(draft.speechStyle),
          catchPhrases: nullable(draft.catchPhrases),
          lifeStory: nullable(draft.lifeStory),
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object") {
        setNotice("资料尚未收到服务端保存确认；请刷新后核对，再由你决定是否重试。");
        return;
      }
      setDraft(draftFromMemory(body as Awaited<ReturnType<typeof loadOwnedMemory>>));
      setNotice("TA 资料已保存；只会影响之后的对话和影像，不会改写历史内容。");
    } catch {
      setNotice("资料保存结果尚未确认；请刷新后核对。系统不会假称已保存。");
    } finally {
      globalThis.clearTimeout(timer);
      setSaving(false);
    }
  };

  if (state === "loading") return <main><p role="status">正在读取 TA 资料…</p></main>;
  if (state === "not-found") return <main><h1>未找到这位 TA</h1><button type="button" onClick={() => router.replace("/memory-world")}>返回相伴</button></main>;
  if (state === "unavailable" || !draft) return <main><h1>暂时无法读取 TA 资料</h1><p role="alert">尚未修改任何资料。</p><button type="button" onClick={() => void load()}>重新读取</button></main>;

  return <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 48px" }}>
    <button type="button" onClick={() => router.replace("/memory-world")}>返回相伴</button>
    <h1>编辑 TA 资料</h1>
    <p>只填写你已确认的资料。保存后只影响未来对话与影像，不会补全未知经历或改写历史内容。</p>
    <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
      <label>名称<input required value={draft.name} onChange={(event) => update("name", event.currentTarget.value)} /></label>
      <label>与你的关系<input required value={draft.relationship} onChange={(event) => update("relationship", event.currentTarget.value)} /></label>
      <label>性格<textarea value={draft.personalityProfile} onChange={(event) => update("personalityProfile", event.currentTarget.value)} /></label>
      <label>表达习惯<textarea value={draft.speechStyle} onChange={(event) => update("speechStyle", event.currentTarget.value)} /></label>
      <label>常说的话<textarea value={draft.catchPhrases} onChange={(event) => update("catchPhrases", event.currentTarget.value)} /></label>
      <label>已确认的共同经历<textarea value={draft.lifeStory} onChange={(event) => update("lifeStory", event.currentTarget.value)} /></label>
      <button type="submit" disabled={saving || !draft.name.trim() || !draft.relationship.trim()}>{saving ? "正在确认保存…" : "保存 TA 资料"}</button>
    </form>
    {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
  </main>;
}
