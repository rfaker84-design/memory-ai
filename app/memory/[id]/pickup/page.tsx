"use client";

import { ButtonHTMLAttributes, FormEvent, use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { loadOwnedMediaUrl, loadOwnedMemory, OwnedMemoryRequestError } from "@/src/components/memory/ownedMemoryClient";
import { consumeChatPickupDraft } from "@/src/components/memory/pickupDraftHandoff";
import { fetchPickupRequest, fetchPickupRequestJson } from "@/src/components/memory/pickupRequestClient";
import { memoryCollectionTitle } from "@/src/components/memory/memoryCollectionState";
import { pickupDeleteWasPersisted, pickupEditWasPersisted } from "../../pickupRecovery";
import styles from "./page.module.css";

type Pickup = { id: string; originalText: string; organizedText: string; photoAssetId?: string | null; createdAt: string; updatedAt: string };
type PickupPhotoSource = { id: string; mimeType: string; sizeBytes: number; createdAt: string };
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

function TouchButton({ style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ minHeight: 44, padding: "8px 12px", ...style }} />;
}

export default function PickupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memoryId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const startsFromPhoto = searchParams.get("from") === "photo";
  const startsFromChat = searchParams.get("from") === "chat";
  const [state, setState] = useState<PageState>("loading");
  const [name, setName] = useState("");
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [photoSources, setPhotoSources] = useState<PickupPhotoSource[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [selectedPhotoAssetId, setSelectedPhotoAssetId] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState("");
  const [organizedText, setOrganizedText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [followUpAsked, setFollowUpAsked] = useState(false);
  const [editing, setEditing] = useState<Pickup | null>(null);
  const pendingRequestKey = useRef<string | null>(null);
  const chatDraftConsumed = useRef(false);

  const load = useCallback(async (signal?: AbortSignal): Promise<Pickup[]> => {
    const photoSourceRequest = startsFromPhoto
      ? fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/pickup-photo-sources`, {}, signal)
      : Promise.resolve(null);
    const [memory, result, photoSourceResult] = await Promise.all([
      loadOwnedMemory(memoryId, signal),
      fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/pickups`, {}, signal),
      photoSourceRequest,
    ]);
    const { response, body } = result;
    if (!response.ok) throw new Error("PICKUPS_UNAVAILABLE");
    if (photoSourceResult && !photoSourceResult.response.ok) throw new Error("PICKUP_PHOTO_SOURCES_UNAVAILABLE");
    const pickupsBody = body as { pickups?: Pickup[] };
    setName(memory.name);
    const next = Array.isArray(pickupsBody.pickups) ? pickupsBody.pickups : [];
    setPickups(next);
    if (photoSourceResult) {
      const photoBody = photoSourceResult.body as { photos?: PickupPhotoSource[] };
      const photos = Array.isArray(photoBody.photos) ? photoBody.photos : [];
      setPhotoSources(photos);
      const urls = await Promise.all(photos.map(async (photo) => [photo.id, await loadOwnedMediaUrl(photo.id, signal).catch(() => null)] as const));
      if (!signal?.aborted) setPhotoUrls(Object.fromEntries(urls.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    } else {
      setPhotoSources([]);
      setPhotoUrls({});
      setSelectedPhotoAssetId(null);
    }
    return next;
  }, [memoryId, startsFromPhoto]);

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

  useEffect(() => {
    if (!startsFromChat || chatDraftConsumed.current) return;
    chatDraftConsumed.current = true;
    const selected = consumeChatPickupDraft(memoryId);
    if (!selected) {
      setMessage("没有保留任何聊天内容。请返回聊天，重新主动选择“保存这一刻”；普通聊天不会自动进入拾忆。");
      return;
    }
    setOriginalText(selected.originalText);
    setOrganizedText(organizationDraft(selected.originalText));
    setMessage("忆见已根据你主动选择的聊天原话整理草稿。当前仍是 draft；只有你确认后才会保存。");
  }, [memoryId, startsFromChat]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing) return saveEdit();
    if (!confirmed || !originalText.trim() || !organizedText.trim() || submitting) return;
    setSubmitting(true); setMessage("");
    try {
      const { response, body } = await fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/pickups`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": pendingRequestKey.current ??= requestKey() },
        body: JSON.stringify({ originalText, organizedText, confirmed: true, ...(selectedPhotoAssetId ? { photoAssetId: selectedPhotoAssetId } : {}) }),
      });
      if (!response.ok) throw new Error("PICKUP_CONFIRM_FAILED");
      const pickup = (body as { pickup: Pickup }).pickup;
      setPickups((current) => [pickup, ...current.filter((entry) => entry.id !== pickup.id)]);
      setOriginalText(""); setOrganizedText(""); setConfirmed(false); setSelectedPhotoAssetId(null);
      pendingRequestKey.current = null;
      setMessage("已经替你收好了。这条资料现在可作为可追溯来源使用。");
      router.push("/memory");
    } catch {
      setMessage("暂时无法保存；原话和整理稿仍留在当前页面，未自动重试。");
    } finally { setSubmitting(false); }
  };

  const saveEdit = async () => {
    if (!editing || !originalText.trim() || !organizedText.trim()) return;
    setSubmitting(true); setMessage("");
    try {
      const { response, body } = await fetchPickupRequestJson(`/api/memories/${encodeURIComponent(memoryId)}/pickups/${encodeURIComponent(editing.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ originalText, organizedText }),
      });
      if (!response.ok) throw new Error("PICKUP_EDIT_FAILED");
      const pickup = (body as { pickup: Pickup }).pickup;
      setPickups((current) => current.map((entry) => entry.id === pickup.id ? pickup : entry));
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

  if (state !== "ready") return <main className={styles.statusPage}><div className={styles.stars} aria-hidden="true" /><p role={state === "error" ? "alert" : "status"} aria-live={state === "error" ? undefined : "polite"}>{state === "not-found" ? "找不到这位 TA。" : state === "error" ? "拾忆暂时无法打开。" : "正在打开拾忆…"}</p>{state === "error" && <TouchButton type="button" onClick={() => void initialize()}>重新读取</TouchButton>}<Link href="/memory">返回拾忆</Link></main>;

  return <main className={styles.page}>
    <div className={styles.stars} aria-hidden="true" />
    <Link className={styles.back} href="/memory">返回拾忆</Link>
    <header className={styles.intro}>
      <p>忆见整理助手 · 为 {name} 整理资料</p>
      <h1>把想起的事<br />留在这里。</h1>
      <span>你说，忆见帮你整理。只有经过你确认，才会成为 TA 可以引用的记忆。忆见不是 TA，不会从普通聊天自动收集资料，也不会猜测空缺。</span>
    </header>
    {startsFromChat && <section className={styles.draftNotice} aria-label="聊天拾忆草稿状态">
      <strong>draft · 未保存</strong>
      <p>{originalText ? "这段原话来自你刚才主动选择的聊天内容。请核对整理稿，再决定是否确认。" : "没有带入聊天原话；普通聊天没有被自动保存。"}</p>
    </section>}
    {startsFromPhoto && <section className={styles.photoSource} aria-labelledby="pickup-photo-source-heading">
      <h2 id="pickup-photo-source-heading">从一张照片说起</h2>
      <p role="note">只展示你为当前 TA 已上传的照片。选择一张后，只会在你确认保存时记录为来源；页面不会读取相册、麦克风或录音。</p>
      {photoSources.length === 0 ? <p role="status">还没有可选的已上传照片。你可以先从一件小事说起，也可在创建人物资料时再添加照片。</p> : <fieldset>
        <legend>选择一张照片作为来源</legend>
        <div className={styles.photoGrid}>
          {photoSources.map((photo) => <TouchButton className={`${styles.photoChoice} ${selectedPhotoAssetId === photo.id ? styles.photoChoiceSelected : ""}`} key={photo.id} type="button" aria-pressed={selectedPhotoAssetId === photo.id} onClick={() => setSelectedPhotoAssetId(photo.id)}>
            {photoUrls[photo.id] ? <img src={photoUrls[photo.id]} alt="可作为拾忆来源的已上传照片" /> : <span aria-hidden="true">照片加载中</span>}
            <small>{selectedPhotoAssetId === photo.id ? "已选择：保存时关联" : "点击选择为来源"}</small>
          </TouchButton>)}
        </div>
      </fieldset>}
    </section>}
    {!editing && <form className={styles.draftForm} onSubmit={submit}>
      <div className={styles.formHeading}><span>draft</span><h2>整理一段记忆</h2><p>草稿只停留在当前页面；确认前不会写入正式拾忆。</p></div>
      <label>你的原话<textarea value={originalText} onChange={(event) => { pendingRequestKey.current = null; setOriginalText(event.currentTarget.value); }} maxLength={8000} rows={5} required /></label>
      {!followUpAsked && originalText.trim() && <TouchButton type="button" onClick={() => setFollowUpAsked(true)}>忆见可以追问一件事</TouchButton>}
      {followUpAsked && <p role="note">忆见想确认一件事：这件事大约发生在什么时候？你可以直接补充在原话里。每次整理最多提出这一项追问。</p>}
      <TouchButton type="button" onClick={() => { pendingRequestKey.current = null; setOrganizedText(organizationDraft(originalText)); }} disabled={!originalText.trim()}>按原话分段整理草稿</TouchButton>
      <label>整理稿（请核对后编辑）<textarea value={organizedText} onChange={(event) => { pendingRequestKey.current = null; setOrganizedText(event.currentTarget.value); }} maxLength={8000} rows={6} required /></label>
      <label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} /> <span>我确认原话与整理稿准确，允许忆见将此资料作为可追溯的回复来源。</span></label>
      <TouchButton className={styles.confirmAction} type="submit" disabled={!confirmed || submitting || (startsFromPhoto && photoSources.length > 0 && !selectedPhotoAssetId)}>{submitting ? "正在保存…" : "确认并保存"}</TouchButton>
    </form>}
    {message && <p className={styles.message} role="status">{message}</p>}
    <section className={styles.confirmedList} aria-labelledby="confirmed-pickups-title">
    <div className={styles.confirmedHeading}><span>confirmed</span><h2 id="confirmed-pickups-title">已确认的忆</h2></div>
    {pickups.length === 0 && <p className={styles.confirmedEmpty}>还没有已确认资料。普通聊天和未确认草稿不会出现在这里。</p>}
    {pickups.map((pickup) => <article className={styles.confirmedCard} key={pickup.id}>
      <div className={styles.cardMeta}><span>已确认</span><time dateTime={pickup.createdAt}>{recordedAt(pickup.createdAt)}</time></div>
      <h3>{memoryCollectionTitle(pickup.organizedText)}</h3>
      <p className={styles.organizedText}>{pickup.organizedText}</p>
      <dl><div><dt>来源</dt><dd>你的主动讲述与明确确认</dd></div><div><dt>叙述者</dt><dd>你</dd></div><div><dt>状态</dt><dd>confirmed · TA 可引用</dd></div></dl>
      <details><summary>查看你的原话</summary><p>{pickup.originalText}</p></details>
      {pickup.photoAssetId && <p className={styles.photoProvenance}>附带来源：你确认选择的已上传照片</p>}
      <div className={styles.cardActions}>
      <TouchButton type="button" onClick={() => { setEditing(pickup); setOriginalText(pickup.originalText); setOrganizedText(pickup.organizedText); setConfirmed(true); }}>编辑</TouchButton>{" "}
      <TouchButton type="button" onClick={() => void remove(pickup)}>删除</TouchButton>
      </div>
    </article>)}
    </section>
    {editing && <section className={styles.editDialog} role="dialog" aria-modal="true" aria-label="编辑已确认资料">
      <p>正在编辑已确认资料。修改后请保存；未保存不会影响当前资料。</p>
      <form onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
        <label>你的原话<textarea value={originalText} onChange={(event) => setOriginalText(event.currentTarget.value)} maxLength={8000} rows={4} required /></label>
        <label>整理稿<textarea value={organizedText} onChange={(event) => setOrganizedText(event.currentTarget.value)} maxLength={8000} rows={5} required /></label>
        <div><TouchButton type="submit" disabled={submitting || !originalText.trim() || !organizedText.trim()}>保存编辑</TouchButton>{" "}
        <TouchButton type="button" onClick={() => { setEditing(null); setOriginalText(""); setOrganizedText(""); setConfirmed(false); }}>取消编辑</TouchButton></div>
      </form>
    </section>}
  </main>;
}
