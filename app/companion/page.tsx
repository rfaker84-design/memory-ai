"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  COMPANION_PRIMARY_KEY,
  selectPrimaryCompanion,
} from "@/src/components/companion/companionHomeState";
import {
  COMPANION_VISIT_MARKER,
  companionRelationship,
  companionVisitGreeting,
  companionVisitStorageKey,
  companionVideoEntry,
  resolveCompanionVisitState,
  type CompanionVisitState,
} from "@/src/components/companion/companionSpaceState";
import {
  CompanionHomeRequestError,
  fetchCompanionHomeMemoriesJson,
} from "@/src/components/companion/companionHomeRequest";
import { useQuietCompanionPresence } from "@/src/components/first-presence/quietCompanionPresence";
import { loadOwnedMediaUrl } from "@/src/components/memory/ownedMemoryClient";
import { MotionProvider, useReducedMotion } from "@/src/motion";

import styles from "./page.module.css";

type CompanionMemory = {
  id: string;
  name: string;
  relationship?: string | null;
  photoUrl?: string | null;
  photoAssetId?: string | null;
};

type CompanionState = "loading" | "unauthenticated" | "empty" | "ready" | "error" | "timeout";

function readPresentationValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePresentationValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Presentation preferences must never block the Owner-scoped page.
  }
}

function CompanionContent() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const presence = useQuietCompanionPresence({ reducedMotion, replying: false });
  const [state, setState] = useState<CompanionState>("loading");
  const [memory, setMemory] = useState<CompanionMemory | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [visitState, setVisitState] = useState<CompanionVisitState>("first_visit");

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const { response, body } = await fetchCompanionHomeMemoriesJson(fetch, signal);
      if (signal?.aborted) return;
      if (response.status === 401) {
        setState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("COMPANION_LIST_UNAVAILABLE");
      const memories = Array.isArray(body) ? body as CompanionMemory[] : [];
      const selected = selectPrimaryCompanion(
        memories,
        readPresentationValue(COMPANION_PRIMARY_KEY),
      );
      if (!selected) {
        setState("empty");
        return;
      }

      // Local storage remains presentation-only: selection happens only after
      // the server has returned this Owner's current memories.
      writePresentationValue(COMPANION_PRIMARY_KEY, selected.id);
      const visitStorageKey = companionVisitStorageKey(selected.id);
      const nextVisitState = resolveCompanionVisitState(readPresentationValue(visitStorageKey));
      setVisitState(nextVisitState);
      if (nextVisitState === "first_visit") {
        writePresentationValue(visitStorageKey, COMPANION_VISIT_MARKER);
      }
      setMemory(selected);
      setPortraitUrl(selected.photoUrl ?? null);
      setState("ready");
      if (selected.photoAssetId) {
        const ownedUrl = await loadOwnedMediaUrl(selected.photoAssetId, signal).catch(() => null);
        if (!signal?.aborted && ownedUrl) setPortraitUrl(ownedUrl);
      }
    } catch (error) {
      if (signal?.aborted) return;
      setState(error instanceof CompanionHomeRequestError ? "timeout" : "error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state === "loading") {
    return <section className={styles.statusPage} aria-label="陪伴空间"><p role="status" aria-live="polite">正在打开陪伴空间…</p></section>;
  }

  if (state === "unauthenticated") {
    return <section className={styles.statusPage} aria-label="陪伴空间"><p role="alert">请先登录，再进入属于你的陪伴空间。</p><button type="button" onClick={() => router.replace("/login")}>前往登录</button></section>;
  }

  if (state === "empty") {
    return <section className={styles.statusPage} aria-label="陪伴空间"><p role="status">还没有可以进入陪伴的 TA。</p><button type="button" onClick={() => router.replace("/create-memory")}>开始回忆</button></section>;
  }

  if (state === "error" || state === "timeout" || !memory) {
    return <section className={styles.statusPage} aria-label="陪伴空间"><p role="alert">{state === "timeout" ? "读取等待过久，没有创建或修改任何内容。" : "陪伴空间暂时无法打开。"}</p><button type="button" onClick={() => void load()}>重新读取</button></section>;
  }

  const greeting = companionVisitGreeting(memory.name, visitState);
  const relationship = companionRelationship(memory.relationship);
  const chatRoute = `/memory-chat/${encodeURIComponent(memory.id)}`;

  return (
    <div className={styles.space} data-presence={presence} data-visit={visitState}>
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.horizon} aria-hidden="true" />

      <header className={styles.identityBar}>
        <div className={styles.miniPortrait} aria-hidden="true">
          {portraitUrl ? <img src={portraitUrl} alt="" /> : <span>{memory.name.slice(0, 1)}</span>}
        </div>
        <div>
          <p>{memory.name}</p>
          <span>{relationship}</span>
        </div>
        <span className={styles.aiIdentity}>AI 纪念陪伴</span>
      </header>

      <section className={styles.presence} aria-labelledby="companion-space-title">
        <p className={styles.eyebrow}>TA 在这里</p>
        <h1 id="companion-space-title">和 {memory.name}<br />安静地待一会儿</h1>

        <figure className={styles.portraitScene}>
          <span className={styles.portraitHalo} aria-hidden="true" />
          <span className={styles.orbit} aria-hidden="true"><i /><i /><i /></span>
          {portraitUrl
            ? <img className={styles.portrait} src={portraitUrl} alt={`${memory.name} 的照片`} />
            : <div className={styles.portraitFallback} role="img" aria-label={`${memory.name} 的静态形象`}>{memory.name.slice(0, 1)}</div>}
          <figcaption>{memory.name}<span>{relationship}</span></figcaption>
        </figure>
      </section>

      <section className={styles.today} aria-labelledby="today-companion-title">
        <p className={styles.greetingLabel}>{greeting.label}</p>
        <h2 id="today-companion-title">{greeting.title}</h2>
        <blockquote aria-describedby="today-companion-disclosure">{greeting.message}</blockquote>
        <p id="today-companion-disclosure" className={styles.disclosure}>{greeting.disclosure}</p>
      </section>

      <section className={styles.recent} aria-labelledby="recent-companion-title">
        <p>最近一次交流</p>
        <h2 id="recent-companion-title">上次停留的地方</h2>
        <span>当前没有可安全展示的只读摘要。进入聊天后会恢复真实记录；这里不会为预览创建会话，也不会用示例内容替代。</span>
        <button className={styles.sourceLink} type="button" onClick={() => router.push(`/memory/${encodeURIComponent(memory.id)}/sources`)}>查看已确认资料</button>
      </section>

      <nav className={styles.nextSteps} aria-label="陪伴空间入口">
        <button className={styles.primaryAction} type="button" onClick={() => router.push(chatRoute)}>
          <span>陪 TA 聊聊</span><small>进入现有正式聊天；不可用时会明确说明，不会伪造回复</small>
        </button>
        <button type="button" onClick={() => router.push(`/memory/${encodeURIComponent(memory.id)}/pickup`)}>
          <span>看看拾忆</span><small>主动讲述，只有确认后才会成为 TA 可引用的记忆</small>
        </button>
        <button type="button" onClick={() => router.push(companionVideoEntry(memory.id))}>
          <span>查看影像机会</span><small>生成新的影像前，正式入口会核验照片、完整对话与可用影像机会；条件不足时会说明原因</small>
        </button>
      </nav>

      <p className={styles.safetyNote}>忆见不会替代身边真实的人际关系。你可以随时离开，也可以把今天的感受告诉信任的人。</p>
    </div>
  );
}

export default function CompanionPage() {
  return (
    <MotionProvider>
      <CompanionContent />
    </MotionProvider>
  );
}
