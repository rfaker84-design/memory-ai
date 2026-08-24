"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  buildConfirmedMemoryCollection,
  type ConfirmedMemoryCollectionItem,
  type PickupCollectionMemory,
  type PickupCollectionRecord,
} from "@/src/components/memory/memoryCollectionState";
import { fetchPickupIndexMemories, PickupIndexRequestError } from "@/src/components/memory/pickupIndexRequest";
import { fetchPickupRequestJson } from "@/src/components/memory/pickupRequestClient";
import styles from "./page.module.css";

type PageState = "loading" | "ready" | "unauthenticated" | "error" | "timeout";

function recordedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "记录时间待同步"
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(date);
}

export default function PickupIndexPage() {
  const [memories, setMemories] = useState<PickupCollectionMemory[]>([]);
  const [collection, setCollection] = useState<ConfirmedMemoryCollectionItem[]>([]);
  const [state, setState] = useState<PageState>("loading");

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const { response, body: value } = await fetchPickupIndexMemories(fetch, signal);
      if (response.status === 401) {
        if (!signal?.aborted) setState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("MEMORIES_UNAVAILABLE");
      const nextMemories = Array.isArray(value) ? value as PickupCollectionMemory[] : [];
      const pickupResults = await Promise.all(nextMemories.map(async (memory) => {
        const { response: pickupResponse, body } = await fetchPickupRequestJson(
          `/api/memories/${encodeURIComponent(memory.id)}/pickups`,
          { credentials: "same-origin" },
          signal,
        );
        if (!pickupResponse.ok) throw new Error("PICKUPS_UNAVAILABLE");
        const pickups = (body as { pickups?: PickupCollectionRecord[] }).pickups;
        return [memory.id, Array.isArray(pickups) ? pickups : []] as const;
      }));
      if (!signal?.aborted) {
        setMemories(nextMemories);
        setCollection(buildConfirmedMemoryCollection(nextMemories, new Map(pickupResults)));
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

  return <main className={styles.page}>
    <div className={styles.stars} aria-hidden="true" />
    <header className={styles.intro}>
      <p>拾忆 · 只收藏你确认过的片刻</p>
      <h1>把想起的事，<br />安静地收在这里。</h1>
      <span>你说，忆见帮你整理。只有经过你确认，才会成为 TA 可以引用的记忆；普通聊天不会自动写进来。</span>
    </header>

    {state === "loading" && <p className={styles.status} role="status" aria-live="polite">正在打开你的记忆收藏…</p>}
    {state === "unauthenticated" && <section className={styles.status} role="alert"><p>请先登录，再查看或整理已确认记忆。当前没有读取或修改任何资料。</p><Link href="/login">前往登录</Link></section>}
    {(state === "error" || state === "timeout") && <section className={styles.status} role="alert"><p>{state === "timeout" ? "读取等待过久，尚未修改任何资料。" : "拾忆暂时没有打开，尚未修改任何资料。"}</p><button type="button" onClick={() => void load()}>重新读取</button></section>}

    {state === "ready" && memories.length === 0 && <section className={styles.empty}>
      <p>先创建一位 TA，再把记忆安静地交给忆见整理。</p>
      <Link href="/create-memory">开始回忆</Link>
    </section>}

    {state === "ready" && memories.length > 0 && <>
      <section className={styles.capture} aria-labelledby="capture-title">
        <div>
          <p>用户主动动作</p>
          <h2 id="capture-title">保存这一刻</h2>
          <span>可以从聊天中的一句原话开始，也可以现在主动讲述。草稿不会进入拾忆，直到你亲自确认。</span>
        </div>
        <div className={styles.captureChoices}>
          {memories.map((memory) => <article key={memory.id}>
            <span aria-hidden="true">{Array.from(memory.name).slice(0, 1)}</span>
            <div><strong>{memory.name}</strong><small>{memory.relationship || "一位重要的人"}</small></div>
            <div className={styles.captureActions}>
              <Link href={`/memory/${encodeURIComponent(memory.id)}/pickup`}>从一件小事说起</Link>
              <Link href={`/memory/${encodeURIComponent(memory.id)}/pickup?from=photo`}>从一张照片说起</Link>
            </div>
          </article>)}
        </div>
      </section>

      <section className={styles.collection} aria-labelledby="collection-title">
        <div className={styles.collectionHeading}>
          <div><p>已经确认的忆</p><h2 id="collection-title">珍贵片刻</h2></div>
          <span>{collection.length} 条</span>
        </div>
        {collection.length === 0 ? <div className={styles.collectionEmpty}>
          <p>这里还没有已确认的记忆。</p>
          <span>未确认草稿和普通聊天都不会出现在这里。</span>
        </div> : <div className={styles.memoryList}>
          {collection.map((item) => <article className={styles.memoryCard} key={`${item.memoryId}:${item.id}`}>
            <div className={styles.memoryMeta}>
              <span>已确认</span>
              <time dateTime={item.createdAt}>{recordedAt(item.createdAt)}</time>
            </div>
            <h3>{item.title}</h3>
            <p className={styles.organizedText}>{item.organizedText}</p>
            <dl>
              <div><dt>关于</dt><dd>{item.memoryName}{item.relationship ? ` · ${item.relationship}` : ""}</dd></div>
              <div><dt>来源</dt><dd>你的主动讲述与明确确认{item.photoAssetId ? " · 已确认照片" : ""}</dd></div>
              <div><dt>状态</dt><dd>已核对 · 可用于相伴</dd></div>
            </dl>
            <details><summary>查看你的原话</summary><p>{item.originalText}</p></details>
            <div className={styles.memoryActions}>
              <Link href={`/memory/${encodeURIComponent(item.memoryId)}/pickup`}>编辑或删除</Link>
              <Link href={`/memory/${encodeURIComponent(item.memoryId)}/sources`}>查看来源</Link>
            </div>
          </article>)}
        </div>}
      </section>
    </>}
  </main>;
}
