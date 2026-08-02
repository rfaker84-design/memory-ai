"use client";

import { FormEvent, use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { loadOwnedMemory, OwnedMemoryRequestError } from "@/src/components/memory/ownedMemoryClient";
import { fetchPickupRequest } from "@/src/components/memory/pickupRequestClient";
import { pickupDeleteWasPersisted, pickupEditWasPersisted } from "../../pickupRecovery";

type Pickup = { id: string; originalText: string; organizedText: string; createdAt: string; updatedAt: string };
type PageState = "loading" | "ready" | "not-found" | "error";

function requestKey(): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `pickup-${value}`;
}

function organizationDraft(originalText: string): string {
  const sentences = originalText.trim().split(/(?<=[。！？!?])/u).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.length > 1 ? sentences.map((sentence) => `- ${sentence}`).join("\n") : originalText.trim();
}

function recordedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "记录时间待同步" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PickupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memoryId } = use(params);
  const searchParams = useSearchParams();
  const startsFromPhoto = searchParams.get("from") === "photo";
  const [state, setState] = useState<PageState>("loading");
  const [name, setName] = useState("");
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [originalText, setOriginalText] = useState("");
  const [organizedText, setOrganizedText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [followUpAsked, setFollowUpAsked] = useState(false);
  const [editing, setEditing] = useState<Pickup | null>(null);
  const pendingRequestKey = useRef<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<Pickup[]> => {
    const [memory, response] = await Promise.all([
      loadOwnedMemory(memoryId, signal),
      fetchPickupRequest(`/api/memories/${encodeURIComponent(memoryId)}/pickups`, {}, signal),
    ]);
    if (!response.ok) throw new Error("PICKUPS_UNAVAILABLE");
    const body = await response.json() as { pickups?: Pickup[] };
    setName(memory.name);
    const next = Array.isArray(body.pickups) ? body.pickups : [];
    setPickups(next);
    return next;
  }, [memoryId]);

  const initialize = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      await load(signal);
      if (!signal?.aborted) setState("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setState(error instanceof OwnedMemoryRequestError && error.status === 404 ? "not-found" : "error");
    }
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void initialize(controller.signal);
    return () => controller.abort();
  }, [initialize]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing) return saveEdit();
    if (!confirmed || !originalText.trim() || !organizedText.trim() || submitting) return;
    setSubmitting(true); setMessage("");
    try {
      const response = await fetchPickupRequest(`/api/memories/${encodeURIComponent(memoryId)}/pickups`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": pendingRequestKey.current ??= requestKey() },
        body: JSON.stringify({ originalText, organizedText, confirmed: true }),
      });
      if (!response.ok) throw new Error("PICKUP_CONFIRM_FAILED");
      const body = await response.json() as { pickup: Pickup };
      setPickups((current) => [body.pickup, ...current.filter((entry) => entry.id !== body.pickup.id)]);
      setOriginalText(""); setOrganizedText(""); setConfirmed(false);
      pendingRequestKey.current = null;
      setMessage("已经替你收好了。这条资料现在可作为可追溯来源使用。");
    } catch {
      setMessage("暂时无法保存；原话和整理稿仍留在当前页面，未自动重试。");
    } finally { setSubmitting(false); }
  };

  const saveEdit = async () => {
    if (!editing || !originalText.trim() || !organizedText.trim()) return;
    setSubmitting(true); setMessage("");
    try {
      const response = await fetchPickupRequest(`/api/memories/${encodeURIComponent(memoryId)}/pickups/${encodeURIComponent(editing.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ originalText, organizedText }),
      });
      if (!response.ok) throw new Error("PICKUP_EDIT_FAILED");
      const body = await response.json() as { pickup: Pickup };
      setPickups((current) => current.map((entry) => entry.id === body.pickup.id ? body.pickup : entry));
      setEditing(null); setOriginalText(""); setOrganizedText(""); setConfirmed(false);
      setMessage("已更新确认资料。");
    } catch {
      const recovered = await load().catch(() => null);
      const target = { id: editing.id, originalText: originalText.trim(), organizedText: organizedText.trim() };
      if (recovered && pickupEditWasPersisted(recovered, target)) {
        setEditing(null); setOriginalText(""); setOrganizedText(""); setConfirmed(false);
        setMessage("更新已在服务端保存，不会重复提交。");
      } else setMessage("暂时无法确认更新结果；未自动重试，请稍后查看或手动重试。");
    } finally { setSubmitting(false); }
  };

  const remove = async (pickup: Pickup) => {
    if (!window.confirm("删除后，这条资料将不再作为 TA 可引用来源。确定删除吗？")) return;
    setMessage("");
    try {
      const response = await fetchPickupRequest(`/api/memories/${encodeURIComponent(memoryId)}/pickups/${encodeURIComponent(pickup.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("PICKUP_DELETE_FAILED");
      setPickups((current) => current.filter((entry) => entry.id !== pickup.id));
      setMessage("已删除，这条资料不会再被引用。");
    } catch {
      const recovered = await load().catch(() => null);
      if (recovered && pickupDeleteWasPersisted(recovered, pickup.id)) {
        setMessage("删除已在服务端完成，不会重复提交。");
      } else setMessage("暂时无法确认删除结果；未自动重试，请稍后查看或手动重试。");
    }
  };

  if (state !== "ready") return <main style={{ maxWidth: 720, margin: "0 auto", padding: 28 }}><p>{state === "not-found" ? "找不到这位 TA。" : state === "error" ? "拾忆暂时无法打开。" : "正在打开拾忆…"}</p>{state === "error" && <button type="button" onClick={() => void initialize()}>重新读取</button>}<Link href="/memory">返回拾忆</Link></main>;

  return <main style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 96px", lineHeight: 1.7 }}>
    <Link href="/memory">返回拾忆</Link>
    <p style={{ margin: "24px 0 0", fontSize: 13 }}>忆见整理助手 · 为 {name} 整理资料</p>
    <h1>把想起的事留在这里。</h1>
    <p>你说，忆见帮你整理。只有经过你确认，才会成为TA可以引用的记忆。忆见不是 TA，不会从普通聊天自动收集资料，也不会猜测空缺。</p>
    {startsFromPhoto && <p role="note">从一张照片说起：看着你手边的照片，把想起的事写下来。此页面不会读取相册、麦克风或录音。</p>}
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label>你的原话<textarea value={originalText} onChange={(event) => { pendingRequestKey.current = null; setOriginalText(event.currentTarget.value); }} maxLength={8000} rows={5} required /></label>
      {!followUpAsked && originalText.trim() && <button type="button" onClick={() => setFollowUpAsked(true)}>忆见可以追问一件事</button>}
      {followUpAsked && <p role="note">忆见想确认一件事：这件事大约发生在什么时候？你可以直接补充在原话里。每次整理最多提出这一项追问。</p>}
      <button type="button" onClick={() => { pendingRequestKey.current = null; setOrganizedText(organizationDraft(originalText)); }} disabled={!originalText.trim()}>按原话分段整理草稿</button>
      <label>整理稿（请核对后编辑）<textarea value={organizedText} onChange={(event) => { pendingRequestKey.current = null; setOrganizedText(event.currentTarget.value); }} maxLength={8000} rows={6} required /></label>
      {!editing && <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} /> 我确认原话与整理稿准确，允许忆见将此资料作为可追溯的回复来源。</label>}
      <button type="submit" disabled={(editing ? !originalText.trim() || !organizedText.trim() : !confirmed) || submitting}>{submitting ? "正在保存…" : editing ? "保存编辑" : "确认并保存"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <h2 style={{ marginTop: 36 }}>已确认资料</h2>
    {pickups.length === 0 && <p>还没有已确认资料。</p>}
    {pickups.map((pickup) => <article key={pickup.id} style={{ borderTop: "1px solid #ddd", padding: "20px 0" }}>
      <h3>原话</h3><p style={{ whiteSpace: "pre-wrap" }}>{pickup.originalText}</p>
      <h3>整理稿</h3><p style={{ whiteSpace: "pre-wrap" }}>{pickup.organizedText}</p>
      <p style={{ color: "#666", fontSize: 13 }}>来源：你的主动讲述 · 叙述者：你 · 记录于 {recordedAt(pickup.createdAt)}</p>
      <button type="button" onClick={() => { setEditing(pickup); setOriginalText(pickup.originalText); setOrganizedText(pickup.organizedText); setConfirmed(true); }}>编辑</button>{" "}
      <button type="button" onClick={() => void remove(pickup)}>删除</button>
    </article>)}
    {editing && <section aria-label="编辑已确认资料" style={{ position: "sticky", bottom: 12, padding: 16, border: "1px solid #bda", background: "#fff" }}>
      <p>正在编辑已确认资料。修改后请保存；未保存不会影响当前资料。</p>
      <button type="button" onClick={() => void saveEdit()} disabled={submitting}>保存编辑</button>{" "}
      <button type="button" onClick={() => { setEditing(null); setOriginalText(""); setOrganizedText(""); setConfirmed(false); }}>取消编辑</button>
    </section>}
  </main>;
}
