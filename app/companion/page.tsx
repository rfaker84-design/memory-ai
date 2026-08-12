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
import { CompanionMotionBackground } from "@/src/components/companion/CompanionMotionBackground";
import { useQuietCompanionPresence } from "@/src/components/first-presence/quietCompanionPresence";
import { loadOwnedMediaUrl } from "@/src/components/memory/ownedMemoryClient";
import { memoryCollectionTitle } from "@/src/components/memory/memoryCollectionState";
import { fetchPickupRequestJson } from "@/src/components/memory/pickupRequestClient";
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

type CompanionPickup = {
  id: string;
  organizedText: string;
  createdAt: string;
  updatedAt?: string;
  photoAssetId?: string | null;
};

function pickupPreview(value: string): string {
  const normalized = value.replace(/^[-•]\s*/gmu, "").replace(/\s+/gu, " ").trim();
  return normalized.length > 82 ? `${normalized.slice(0, 82)}…` : normalized;
}

function pickupDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间待同步"
    : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

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
  const [latestPickup, setLatestPickup] = useState<CompanionPickup | null>(null);
  const [pickupImageUrl, setPickupImageUrl] = useState<string | null>(null);
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
      setLatestPickup(null);
      setPickupImageUrl(null);
      setState("ready");
      const [ownedUrl, pickupResult] = await Promise.all([
        selected.photoAssetId ? loadOwnedMediaUrl(selected.photoAssetId, signal).catch(() => null) : Promise.resolve(null),
        fetchPickupRequestJson(`/api/memories/${encodeURIComponent(selected.id)}/pickups`, {}, signal).catch(() => null),
      ]);
      if (signal?.aborted) return;
      if (ownedUrl) setPortraitUrl(ownedUrl);
      if (pickupResult?.response.ok) {
        const pickups = (pickupResult.body as { pickups?: unknown }).pickups;
        const candidate = Array.isArray(pickups) ? pickups[0] as Partial<CompanionPickup> | undefined : undefined;
        if (candidate && typeof candidate.id === "string" && typeof candidate.organizedText === "string" && typeof candidate.createdAt === "string") {
          const recent: CompanionPickup = {
            id: candidate.id,
            organizedText: candidate.organizedText,
            createdAt: candidate.createdAt,
            updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : candidate.createdAt,
            photoAssetId: typeof candidate.photoAssetId === "string" ? candidate.photoAssetId : null,
          };
          setLatestPickup(recent);
          if (recent.photoAssetId) {
            const recentImage = await loadOwnedMediaUrl(recent.photoAssetId, signal).catch(() => null);
            if (!signal?.aborted && recentImage) setPickupImageUrl(recentImage);
          }
        }
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
    return <section className={styles.statusPage} aria-label="相伴空间"><p role="status">还没有可以进入相伴的人物。</p><button type="button" onClick={() => router.replace("/create-memory")}>开始</button></section>;
  }

  if (state === "error" || state === "timeout" || !memory) {
    return <section className={styles.statusPage} aria-label="陪伴空间"><p role="alert">{state === "timeout" ? "读取等待过久，没有创建或修改任何内容。" : "陪伴空间暂时无法打开。"}</p><button type="button" onClick={() => void load()}>重新读取</button></section>;
  }

  const disclosure = companionVisitGreeting(memory.name, visitState).disclosure;
  const relationship = companionRelationship(memory.relationship);
  const chatRoute = `/memory-chat/${encodeURIComponent(memory.id)}`;
  const pickupRoute = `/memory/${encodeURIComponent(memory.id)}/pickup`;
  const sourcesRoute = `/memory/${encodeURIComponent(memory.id)}/sources`;

  return (
    <div className={styles.space} data-presence={presence} data-visit={visitState}>
      <section className={styles.hero} aria-labelledby="companion-space-title">
        <div className={styles.heroMedia} aria-hidden="true">
          {portraitUrl
            ? (
                <CompanionMotionBackground
                  className={styles.heroMotion}
                  memoryId={memory.id}
                  portraitUrl={portraitUrl}
                  variant="idle"
                  motionEnabled={presence !== "static"}
                />
              )
            : <span className={styles.heroFallback}>{memory.name.slice(0, 1)}</span>}
          <span className={styles.heroVeil} />
        </div>

        <header className={styles.heroHeader}>
          <strong>忆见</strong>
          <span>AI 纪念陪伴 · 基于你确认的资料</span>
        </header>

        <div className={styles.heroCopy}>
          <h1 id="companion-space-title">想对 {memory.name} 说的话，<br />就从这里开始</h1>
          <p><strong>{memory.name}</strong><span>{relationship}</span></p>
        </div>
      </section>

      <section className={styles.paper} aria-label={`${memory.name}的相伴入口`}>
        <section className={styles.chatInvitation} aria-labelledby="companion-chat-title">
          <p id="companion-chat-title">我们聊聊</p>
          <button type="button" onClick={() => router.push(chatRoute)}>
            <span>今天想从哪件小事说起？</span>
            <small>进入聊天</small>
          </button>
        </section>

        <section className={styles.recent} aria-labelledby="recent-companion-title">
          <header>
            <h2 id="recent-companion-title">最近拾忆</h2>
            <button type="button" onClick={() => router.push("/memory")}>查看全部</button>
          </header>
          {latestPickup ? (
            <button className={`${styles.memoryPreview} ${pickupImageUrl ? styles.memoryPreviewWithImage : ""}`} type="button" onClick={() => router.push(sourcesRoute)}>
              {pickupImageUrl && <img src={pickupImageUrl} alt="这条拾忆所关联的照片" />}
              <span>
                <strong>{memoryCollectionTitle(latestPickup.organizedText)}</strong>
                <small>{pickupPreview(latestPickup.organizedText)}</small>
                <time dateTime={latestPickup.updatedAt ?? latestPickup.createdAt}>{pickupDate(latestPickup.updatedAt ?? latestPickup.createdAt)} · 由你确认</time>
              </span>
            </button>
          ) : (
            <button className={styles.memoryEmpty} type="button" onClick={() => router.push(pickupRoute)}>
              <strong>从一件记得的小事开始</strong>
              <span>只有你确认的内容，才会留在拾忆里。</span>
            </button>
          )}
          <button className={styles.videoOpportunity} type="button" onClick={() => router.push(companionVideoEntry(memory.id))}>
            <span>影像机会</span>
            <small>进入现有流程查看条件</small>
          </button>
        </section>

        <button className={styles.composer} type="button" onClick={() => router.push(chatRoute)}>
          <span>说点想让 {memory.name} 知道的话…</span>
          <strong>进入</strong>
        </button>
        <p id="today-companion-disclosure" className={styles.disclosure}>{disclosure}</p>
        <p className={styles.safetyNote}>忆见不会替代真实的人际关系，也不会把生成内容当作真人的真实表达。</p>
      </section>
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
