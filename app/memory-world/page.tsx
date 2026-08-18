"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MemoryAvatar, MemoryBottomSheet, MemoryButton, MemoryCard, MemorySection, MemorySurface } from "../../src/components/memory-ui";
import { MemoryRadius, MemorySpacing, MemorySurface as SurfaceToken, MemoryTypography } from "../../src/design";
import { MotionProvider } from "../../src/motion";
import {
  COMPANION_DAILY_GREETING_KEY,
  COMPANION_POSITION_KEY,
  clearCompanionPrimaryPreference,
  companionDay,
  dailyCompanionGreeting,
  dailyGreetingMarker,
  isDailyCompanionGreetingDue,
  persistCompanionPrimaryPreference,
  restoreCompanionPosition,
  resolveCompanionPrimaryPreference,
  serializeCompanionPosition,
} from "../../src/components/companion/companionHomeState";
import { CompanionHomeRequestError, fetchCompanionHomeMemoriesJson } from "../../src/components/companion/companionHomeRequest";
import { loadOwnedMediaUrl } from "../../src/components/memory/ownedMemoryClient";
import styles from "./page.module.css";

type MemoryWorldItem = {
  id: string;
  userId?: string | null;
  name: string;
  relationship?: string | null;
  lifeStory?: string | null;
  photoUrl?: string | null;
  photoAssetId?: string | null;
};

type MemoryWorldState = "loading" | "unauthenticated" | "empty" | "ready" | "error" | "timeout";

function MemoryWorldContent() {
  const router = useRouter();
  const [state, setState] = useState<MemoryWorldState>("loading");
  const [memories, setMemories] = useState<MemoryWorldItem[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [primarySelectorOpen, setPrimarySelectorOpen] = useState(false);
  const [dailyGreetingVisible, setDailyGreetingVisible] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearConfirmationId, setClearConfirmationId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [assistanceBlocked, setAssistanceBlocked] = useState(false);
  const [primaryPortraitUrl, setPrimaryPortraitUrl] = useState<string | null>(null);
  const restoredPosition = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const { response, body: data } = await fetchCompanionHomeMemoriesJson(fetch, signal);
      if (signal?.aborted) return;
      if (response.status === 401) {
        setMemories([]);
        setOwnerId(null);
        setPrimaryId(null);
        setPrimaryPortraitUrl(null);
        setDailyGreetingVisible(false);
        setState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error(typeof data === "object" && data !== null && typeof (data as Record<string, unknown>).error === "string" ? (data as Record<string, string>).error : "load failed");
      const list = Array.isArray(data) ? data as MemoryWorldItem[] : [];
      const nextOwnerId = typeof list[0]?.userId === "string" && list[0].userId.trim()
        ? list[0].userId
        : null;
      const selection = nextOwnerId
        ? resolveCompanionPrimaryPreference(list, nextOwnerId, window.localStorage)
        : null;
      const primary = selection?.memory ?? null;
      setMemories(list);
      setOwnerId(nextOwnerId);
      setPrimaryId(primary?.id ?? null);
      setPrimarySelectorOpen(Boolean(selection?.needsExplicitChoice));
      if (primary) {
        const day = companionDay();
        const due = isDailyCompanionGreetingDue(
          window.localStorage.getItem(COMPANION_DAILY_GREETING_KEY),
          day,
          primary.id,
        );
        setDailyGreetingVisible(due);
        if (due) window.localStorage.setItem(COMPANION_DAILY_GREETING_KEY, dailyGreetingMarker(day, primary.id));
      }
      setState(list.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (signal?.aborted) return;
      setState(error instanceof CompanionHomeRequestError ? "timeout" : "error");
    }
  }, []);

  const primary = primaryId ? memories.find((memory) => memory.id === primaryId) ?? null : null;

  useEffect(() => {
    const controller = new AbortController();
    setPrimaryPortraitUrl(primary?.photoUrl ?? null);
    if (!primary?.photoAssetId) return () => controller.abort();
    void loadOwnedMediaUrl(primary.photoAssetId, controller.signal)
      .then((url) => setPrimaryPortraitUrl(url))
      .catch(() => {
        if (!controller.signal.aborted) setPrimaryPortraitUrl(primary.photoUrl ?? null);
      });
    return () => controller.abort();
  }, [primary?.id, primary?.photoAssetId, primary?.photoUrl]);

  const choosePrimary = (memory: MemoryWorldItem) => {
    if (!ownerId) return;
    setPrimaryId(memory.id);
    persistCompanionPrimaryPreference(window.localStorage, ownerId, memory.id);
    setDailyGreetingVisible(false);
    setPrimarySelectorOpen(false);
  };

  const enterCompanion = (memory: MemoryWorldItem) => {
    if (ownerId) persistCompanionPrimaryPreference(window.localStorage, ownerId, memory.id);
    router.push("/companion");
  };

  const deleteMemory = async (memory: MemoryWorldItem) => {
    if (deletingId || deleteConfirmationId !== memory.id) return;
    setDeletingId(memory.id);
    setDeleteMessage(null);
    setAssistanceBlocked(false);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(memory.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE_MEMORY" }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        if (response.status === 409 && body.error === "UNDERSTANDING_ASSISTANCE_REQUIRED") {
          setDeleteMessage("\u8fd9\u9879\u64cd\u4f5c\u5df2\u6682\u65f6\u505c\u6b62\u3002\u4f60\u53ef\u4ee5\u5148\u518d\u770b\u4e00\u6b21\u8bf4\u660e\uff0c\u6682\u65f6\u4e0d\u5220\u9664 TA\uff0c\u6216\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9\uff1b\u5fc6\u89c1\u4e0d\u4f1a\u66ff\u4f60\u5224\u65ad\uff0c\u4e5f\u4e0d\u4f1a\u81ea\u52a8\u8054\u7cfb\u4efb\u4f55\u4eba\u3002");
          setAssistanceBlocked(true);
        } else if (body.error === "MEMORY_MEDIA_NOT_CLEAN") {
          setDeleteMessage("这位 TA 的素材仍在清理中，尚未删除。请先完成素材删除并等待清理确认。");
        } else if (body.error === "UNAUTHENTICATED") {
          setDeleteMessage("登录状态已失效；尚未删除任何 TA。请重新登录后再确认。");
        } else {
          setDeleteMessage("暂时无法确认是否已删除。请不要重复点击；刷新列表后再核对。");
        }
        return;
      }
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      if (ownerId) clearCompanionPrimaryPreference(window.localStorage, ownerId, memory.id);
      if (primaryId === memory.id) {
        setPrimaryId(null);
        setDailyGreetingVisible(false);
      }
      setDeleteConfirmationId(null);
      setDeleteMessage(`${memory.name} 已删除。`);
    } catch {
      setDeleteMessage("删除结果尚未确认。请不要重复点击；刷新列表后再核对。");
    } finally {
      globalThis.clearTimeout(timer);
      setDeletingId(null);
    }
  };

  const clearChatHistory = async (memory: MemoryWorldItem) => {
    if (clearingId || clearConfirmationId !== memory.id) return;
    setClearingId(memory.id); setDeleteMessage(null);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(memory.id)}/chat-session`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_chat_history", confirmation: "CLEAR_CHAT_HISTORY" }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setDeleteMessage("暂时无法确认聊天记录是否已清除。请不要重复点击；进入相伴后再核对。");
        return;
      }
      setClearConfirmationId(null);
      setDeleteMessage(`${memory.name} 的聊天记录已清除；不会再用于后续相伴。`);
    } catch {
      setDeleteMessage("清除结果尚未确认。请不要重复点击；进入相伴后再核对。");
    } finally { globalThis.clearTimeout(timer); setClearingId(null); }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (state !== "ready" || restoredPosition.current) return;
    restoredPosition.current = true;
    const position = restoreCompanionPosition(
      window.localStorage.getItem(COMPANION_POSITION_KEY),
      companionDay(),
    );
    if (position === null) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: position, behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    const persistPosition = () => {
      window.localStorage.setItem(
        COMPANION_POSITION_KEY,
        serializeCompanionPosition(companionDay(), window.scrollY),
      );
    };
    window.addEventListener("pagehide", persistPosition);
    return () => {
      persistPosition();
      window.removeEventListener("pagehide", persistPosition);
    };
  }, []);

  return (
    <MemorySurface
      variant="background"
      className={styles.world}
    >
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.ambientLight} aria-hidden="true" />
      <header className={styles.topBar}>
        <button type="button" onClick={() => router.push("/")} aria-label="返回首页">忆见</button>
        <span>AI生成 · 基于你确认的信息</span>
      </header>

      <MemorySection className={styles.content} style={state === "ready" ? { padding: 0 } : undefined}>
        {state === "loading" && <MemoryCard role="status" aria-live="polite">正在加载</MemoryCard>}
        {(state === "error" || state === "timeout") && <MemoryCard role="alert" aria-live="assertive"><div style={{ display: "grid", gap: MemorySpacing.md }}><span>{state === "timeout" ? "读取等待过久，没有创建或修改任何资料。" : "暂时无法读取记忆。"}</span><MemoryButton variant="secondary" onClick={() => void load()}>重试</MemoryButton></div></MemoryCard>}
        {state === "unauthenticated" && (
          <MemoryCard depth="elevated">
            <div style={{ display: "grid", gap: MemorySpacing.md }}>
              <span style={{ color: SurfaceToken.content.primary }}>请先登录，再查看或创建你的 TA。</span>
              <span style={{ color: SurfaceToken.content.muted, lineHeight: MemoryTypography.lineHeight.normal }}>当前没有读取或修改任何资料。</span>
              <MemoryButton href="/login" variant="primary">前往登录</MemoryButton>
              <MemoryButton href="/" variant="secondary">先看看忆见的公开体验</MemoryButton>
            </div>
          </MemoryCard>
        )}
        {state === "empty" && (
          <MemoryCard depth="elevated">
            <div style={{ display: "grid", gap: MemorySpacing.md }}>
              <span style={{ color: SurfaceToken.content.primary }}>还没有可进入的记忆空间。</span>
              <span style={{ color: SurfaceToken.content.muted, lineHeight: MemoryTypography.lineHeight.normal }}>先添加一位人物，再补充相关资料。</span>
              <MemoryButton variant="primary" onClick={() => router.push("/create-memory")}>开始</MemoryButton>
            </div>
          </MemoryCard>
        )}
        {state === "ready" && (
          <div className={styles.readyWorld}>
            {primary && (
              <section className={styles.hero} aria-labelledby="memory-world-welcome">
                <div className={styles.heroCopy}>
                  <p className={styles.identity}>AI生成 · 基于你确认的信息</p>
                  <h1 id="memory-world-welcome">你好，<em>{primary.name}</em><br />已经在这里。</h1>
                  <p className={styles.relationship}>{primary.relationship ? `你记忆中的${primary.relationship}` : "一位对你很重要的人"}</p>
                </div>
                <div className={styles.portraitSpace}>
                  <span className={styles.portraitGlow} aria-hidden="true" />
                  <span className={styles.portraitStars} aria-hidden="true"><i /><i /><i /><i /></span>
                  {memories.length > 1 ? (
                    <button type="button" className={styles.portraitButton} onClick={() => setPrimarySelectorOpen(true)} aria-haspopup="dialog" aria-expanded={primarySelectorOpen} aria-label={`切换主 TA，当前为 ${primary.name}`}>
                      <MemoryAvatar className={styles.heroPortrait} image={primaryPortraitUrl} initials={primary.name} alt={`${primary.name} 的照片`} size={252} />
                    </button>
                  ) : (
                    <MemoryAvatar className={styles.heroPortrait} image={primaryPortraitUrl} initials={primary.name} alt={`${primary.name} 的照片`} size={252} />
                  )}
                </div>
                {dailyGreetingVisible && <p role="status" className={styles.greeting}>{dailyCompanionGreeting(primary.name)}</p>}
                <div className={styles.heroActions}>
                  <MemoryButton variant="primary" onClick={() => enterCompanion(primary)}>进入陪伴</MemoryButton>
                  <button type="button" onClick={() => router.push(`/memory/${primary.id}/encounter`)}>看看首次相遇</button>
                  <button type="button" onClick={() => router.push(`/memory/${primary.id}/profile`)}>整理 TA 资料</button>
                </div>
              </section>
            )}
            {memories.length > 1 && primarySelectorOpen && <MemoryBottomSheet open title="切换主人物" description="选择后，相伴首页会以这位人物为主。" footer={<MemoryButton variant="secondary" onClick={() => setPrimarySelectorOpen(false)}>取消</MemoryButton>}>
              <div style={{ display: "grid", gap: MemorySpacing.sm }}>
                {memories.map((memory) => <button key={`primary-${memory.id}`} type="button" onClick={() => choosePrimary(memory)} aria-pressed={primary?.id === memory.id} style={{ minHeight: 44, borderRadius: MemoryRadius.full, border: `1px solid ${primary?.id === memory.id ? SurfaceToken.accent.gold : SurfaceToken.border.subtle}`, background: "transparent", color: primary?.id === memory.id ? SurfaceToken.accent.gold : SurfaceToken.content.secondary, padding: "0 14px", cursor: "pointer", textAlign: "left" }}>{primary?.id === memory.id ? `${memory.name} · 当前主人物` : `设 ${memory.name} 为主人物`}</button>)}
              </div>
            </MemoryBottomSheet>}
            <section className={styles.management} aria-labelledby="memory-world-management">
              <div className={styles.managementHeading}>
                <p id="memory-world-management">你的相伴</p>
                <span>轻触 TA 可以继续上次的陪伴</span>
              </div>
              {memories.map((memory) => (
              <MemoryCard key={memory.id} interactive reveal onClick={() => enterCompanion(memory)}>
                <div style={{ display: "flex", gap: MemorySpacing.md, alignItems: "center" }}>
                  <MemoryAvatar image={memory.id === primary?.id ? primaryPortraitUrl : memory.photoUrl} initials={memory.name} presence="quiet" size={52} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.bodyLarge }}>{memory.name}</div>
                    <div style={{ marginTop: 4, color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.meta }}>{memory.relationship || "关系待补充"}</div>
                  </div>
                </div>
                {deleteConfirmationId === memory.id ? <section aria-label={`删除 ${memory.name} 确认`} style={{ display: "grid", gap: MemorySpacing.sm, marginTop: MemorySpacing.md }} onClick={(event) => event.stopPropagation()}>
                  <p style={{ margin: 0, color: SurfaceToken.content.secondary, lineHeight: MemoryTypography.lineHeight.normal }}>确认删除 {memory.name}？此操作不可恢复；系统会先核验素材已完成清理。</p>
                  <div style={{ display: "flex", gap: MemorySpacing.sm, flexWrap: "wrap" }}>
                  <MemoryButton variant="primary" onClick={() => void deleteMemory(memory)} disabled={deletingId === memory.id}>{deletingId === memory.id ? "正在确认…" : "确认删除人物"}</MemoryButton>
                    <MemoryButton variant="secondary" onClick={() => setDeleteConfirmationId(null)} disabled={deletingId === memory.id}>取消</MemoryButton>
                  </div>
                </section> : <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteConfirmationId(memory.id); setDeleteMessage(null); }} style={{ minHeight: 44, marginTop: MemorySpacing.md, border: `1px solid ${SurfaceToken.border.subtle}`, borderRadius: MemoryRadius.full, background: "transparent", color: SurfaceToken.content.muted, cursor: "pointer", padding: "0 14px" }}>删除人物</button>}
                {clearConfirmationId === memory.id ? <section aria-label={`清除 ${memory.name} 聊天记录确认`} style={{ display: "grid", gap: MemorySpacing.sm, marginTop: MemorySpacing.md }} onClick={(event) => event.stopPropagation()}>
                  <p style={{ margin: 0, color: SurfaceToken.content.secondary }}>确认清除与 {memory.name} 的聊天记录？此操作不可恢复，已清除内容不会再显示或用于后续相伴。</p>
                  <div style={{ display: "flex", gap: MemorySpacing.sm }}><MemoryButton variant="primary" disabled={clearingId === memory.id} onClick={() => void clearChatHistory(memory)}>{clearingId === memory.id ? "正在确认…" : "确认清除记录"}</MemoryButton><MemoryButton variant="secondary" disabled={clearingId === memory.id} onClick={() => setClearConfirmationId(null)}>取消</MemoryButton></div>
                </section> : <button type="button" onClick={(event) => { event.stopPropagation(); setClearConfirmationId(memory.id); setDeleteMessage(null); }} style={{ minHeight: 44, marginTop: MemorySpacing.sm, border: "none", background: "transparent", color: SurfaceToken.content.muted, cursor: "pointer", padding: "0 14px" }}>清除聊天记录</button>}
              </MemoryCard>
              ))}
              {deleteMessage ? <p role="status" aria-live="polite" style={{ margin: 0, color: SurfaceToken.content.secondary }}>{deleteMessage}</p> : null}
              {assistanceBlocked ? <button type="button" onClick={() => router.push("/settings/understanding-assistance")} style={{ minHeight: 44, border: "none", background: "transparent", color: SurfaceToken.content.primary, cursor: "pointer", padding: 0 }}>{"\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9"}</button> : null}
            </section>
          </div>
        )}
      </MemorySection>

    </MemorySurface>
  );
}

export default function MemoryWorldPage() {
  return (
    <MotionProvider>
      <MemoryWorldContent />
    </MotionProvider>
  );
}
