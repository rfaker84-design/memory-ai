"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MemoryAvatar, MemoryBottomSheet, MemoryButton, MemoryCard, MemorySection, MemorySurface } from "../../src/components/memory-ui";
import { MemoryRadius, MemorySpacing, MemorySurface as SurfaceToken, MemoryTypography, MemoryZIndex } from "../../src/design";
import { MotionProvider } from "../../src/motion";
import {
  COMPANION_DAILY_GREETING_KEY,
  COMPANION_POSITION_KEY,
  COMPANION_PRIMARY_KEY,
  companionDay,
  dailyCompanionGreeting,
  dailyGreetingMarker,
  isDailyCompanionGreetingDue,
  restoreCompanionPosition,
  selectPrimaryCompanion,
  serializeCompanionPosition,
} from "../../src/components/companion/companionHomeState";
import { CompanionHomeRequestError, fetchCompanionHomeMemoriesJson } from "../../src/components/companion/companionHomeRequest";

type MemoryWorldItem = {
  id: string;
  name: string;
  relationship?: string | null;
  lifeStory?: string | null;
  photoUrl?: string | null;
};

type MemoryWorldState = "loading" | "unauthenticated" | "empty" | "ready" | "error" | "timeout";

function MemoryWorldContent() {
  const router = useRouter();
  const [state, setState] = useState<MemoryWorldState>("loading");
  const [memories, setMemories] = useState<MemoryWorldItem[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [primarySelectorOpen, setPrimarySelectorOpen] = useState(false);
  const [dailyGreetingVisible, setDailyGreetingVisible] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearConfirmationId, setClearConfirmationId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const restoredPosition = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const { response, body: data } = await fetchCompanionHomeMemoriesJson(fetch, signal);
      if (signal?.aborted) return;
      if (response.status === 401) {
        setState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error(typeof data === "object" && data !== null && typeof (data as Record<string, unknown>).error === "string" ? (data as Record<string, string>).error : "load failed");
      const list = Array.isArray(data) ? data : [];
      const primary = selectPrimaryCompanion(list, window.localStorage.getItem(COMPANION_PRIMARY_KEY));
      setMemories(list);
      setPrimaryId(primary?.id ?? null);
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

  const primary = selectPrimaryCompanion(memories, primaryId);
  const choosePrimary = (memory: MemoryWorldItem) => {
    setPrimaryId(memory.id);
    window.localStorage.setItem(COMPANION_PRIMARY_KEY, memory.id);
    setDailyGreetingVisible(false);
    setPrimarySelectorOpen(false);
  };

  const deleteMemory = async (memory: MemoryWorldItem) => {
    if (deletingId || deleteConfirmationId !== memory.id) return;
    setDeletingId(memory.id);
    setDeleteMessage(null);
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
        if (body.error === "MEMORY_MEDIA_NOT_CLEAN") {
          setDeleteMessage("这位 TA 的素材仍在清理中，尚未删除。请先完成素材删除并等待清理确认。");
        } else if (body.error === "UNAUTHENTICATED") {
          setDeleteMessage("登录状态已失效；尚未删除任何 TA。请重新登录后再确认。");
        } else {
          setDeleteMessage("暂时无法确认是否已删除。请不要重复点击；刷新列表后再核对。");
        }
        return;
      }
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      if (window.localStorage.getItem(COMPANION_PRIMARY_KEY) === memory.id) {
        window.localStorage.removeItem(COMPANION_PRIMARY_KEY);
      }
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
      style={{
        minHeight: "100dvh",
        paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        background: `radial-gradient(circle at 50% 18%, rgba(196,168,130,0.13), transparent 32%), ${SurfaceToken.background.base}`,
      }}
    >
      <header style={{ padding: `calc(${MemorySpacing["2xl"]} + env(safe-area-inset-top, 0px)) ${MemorySpacing.pageXMobile} ${MemorySpacing.lg}`, position: "relative", zIndex: MemoryZIndex.content }}>
        <button type="button" onClick={() => router.push("/")} style={{ minHeight: 44, border: "none", background: "transparent", color: SurfaceToken.content.muted, cursor: "pointer" }}>← 返回首页</button>
        <h1 style={{ margin: `${MemorySpacing.lg} 0 ${MemorySpacing.sm}`, color: SurfaceToken.content.primary, fontFamily: MemoryTypography.fontFamily.zh, fontSize: MemoryTypography.size.hero, lineHeight: MemoryTypography.lineHeight.compact }}>记忆空间</h1>
        <p style={{ margin: 0, color: SurfaceToken.content.secondary, lineHeight: MemoryTypography.lineHeight.normal }}>这里只展示你已经真实创建的记忆体。</p>
      </header>

      <MemorySection>
        {state === "loading" && <MemoryCard role="status" aria-live="polite">正在整理记忆空间…</MemoryCard>}
        {(state === "error" || state === "timeout") && <MemoryCard role="alert" aria-live="assertive"><div style={{ display: "grid", gap: MemorySpacing.md }}><span>{state === "timeout" ? "读取等待过久，没有创建或修改任何资料。" : "暂时无法读取记忆。"}</span><MemoryButton variant="secondary" onClick={() => void load()}>重试</MemoryButton></div></MemoryCard>}
        {state === "unauthenticated" && (
          <MemoryCard depth="elevated">
            <div style={{ display: "grid", gap: MemorySpacing.md }}>
              <span style={{ color: SurfaceToken.content.primary }}>请先登录，再查看或创建你的 TA。</span>
              <span style={{ color: SurfaceToken.content.muted, lineHeight: MemoryTypography.lineHeight.normal }}>当前没有读取或修改任何资料。</span>
              <MemoryButton href="/login" variant="primary">前往登录</MemoryButton>
            </div>
          </MemoryCard>
        )}
        {state === "empty" && (
          <MemoryCard depth="elevated">
            <div style={{ display: "grid", gap: MemorySpacing.md }}>
              <span style={{ color: SurfaceToken.content.primary }}>还没有可进入的记忆空间。</span>
              <span style={{ color: SurfaceToken.content.muted, lineHeight: MemoryTypography.lineHeight.normal }}>先创建 TA，记忆空间会随着资料逐步形成。</span>
              <MemoryButton variant="primary" onClick={() => router.push("/create-memory")}>创建 TA</MemoryButton>
            </div>
          </MemoryCard>
        )}
        {state === "ready" && (
          <div style={{ display: "grid", gap: MemorySpacing.md }}>
            {primary && (
              <MemoryCard depth="elevated">
                <div style={{ display: "grid", gap: MemorySpacing.md }}>
                  <span style={{ color: SurfaceToken.accent.gold, fontSize: MemoryTypography.size.meta, letterSpacing: "0.08em" }}>AI纪念陪伴 · 主 TA</span>
                  <button type="button" onClick={() => setPrimarySelectorOpen(true)} aria-haspopup="dialog" aria-expanded={primarySelectorOpen} aria-label={`切换主 TA，当前为 ${primary.name}`} style={{ display: "flex", alignItems: "center", gap: MemorySpacing.lg, padding: 0, border: "none", background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left", minHeight: 44 }}>
                    <MemoryAvatar image={primary.photoUrl} initials={primary.name} presence="quiet" size={96} />
                    <div><div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.title }}>{primary.name}</div><div style={{ color: SurfaceToken.content.muted, marginTop: 4 }}>{primary.relationship || "关系待补充"}</div></div>
                  </button>
                  {dailyGreetingVisible && <p role="status" style={{ margin: 0, color: SurfaceToken.content.secondary, lineHeight: MemoryTypography.lineHeight.normal }}>{dailyCompanionGreeting(primary.name)}</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: MemorySpacing.sm }}>
                    <MemoryButton variant="primary" onClick={() => router.push(`/memory/${primary.id}/encounter`)}>遇见</MemoryButton>
                    <MemoryButton variant="secondary" onClick={() => router.push(`/memory-chat/${primary.id}`)}>稍后再看</MemoryButton>
                    <MemoryButton variant="secondary" onClick={() => router.push(`/memory/${primary.id}/profile`)}>编辑 TA 资料</MemoryButton>
                  </div>
                </div>
              </MemoryCard>
            )}
            {primary && memories.length > 1 && primarySelectorOpen && <MemoryBottomSheet open title="切换主 TA" description="选择后，相伴首页会以这位 TA 为主。" footer={<MemoryButton variant="secondary" onClick={() => setPrimarySelectorOpen(false)}>取消</MemoryButton>}>
              <div style={{ display: "grid", gap: MemorySpacing.sm }}>
                {memories.map((memory) => <button key={`primary-${memory.id}`} type="button" onClick={() => choosePrimary(memory)} aria-pressed={primary.id === memory.id} style={{ minHeight: 44, borderRadius: MemoryRadius.full, border: `1px solid ${primary.id === memory.id ? SurfaceToken.accent.gold : SurfaceToken.border.subtle}`, background: "transparent", color: primary.id === memory.id ? SurfaceToken.accent.gold : SurfaceToken.content.secondary, padding: "0 14px", cursor: "pointer", textAlign: "left" }}>{primary.id === memory.id ? `${memory.name} · 当前主 TA` : `设 ${memory.name} 为主 TA`}</button>)}
              </div>
            </MemoryBottomSheet>}
            {memories.map((memory) => (
              <MemoryCard key={memory.id} interactive reveal onClick={() => router.push(`/memory-chat/${memory.id}`)}>
                <div style={{ display: "flex", gap: MemorySpacing.md, alignItems: "center" }}>
                  <MemoryAvatar image={memory.photoUrl} initials={memory.name} presence="quiet" size={52} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.bodyLarge }}>{memory.name}</div>
                    <div style={{ marginTop: 4, color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.meta }}>{memory.relationship || "关系待补充"}</div>
                  </div>
                </div>
                {deleteConfirmationId === memory.id ? <section aria-label={`删除 ${memory.name} 确认`} style={{ display: "grid", gap: MemorySpacing.sm, marginTop: MemorySpacing.md }} onClick={(event) => event.stopPropagation()}>
                  <p style={{ margin: 0, color: SurfaceToken.content.secondary, lineHeight: MemoryTypography.lineHeight.normal }}>确认删除 {memory.name}？此操作不可恢复；系统会先核验素材已完成清理。</p>
                  <div style={{ display: "flex", gap: MemorySpacing.sm, flexWrap: "wrap" }}>
                    <MemoryButton variant="primary" onClick={() => void deleteMemory(memory)} disabled={deletingId === memory.id}>{deletingId === memory.id ? "正在确认…" : "确认删除 TA"}</MemoryButton>
                    <MemoryButton variant="secondary" onClick={() => setDeleteConfirmationId(null)} disabled={deletingId === memory.id}>取消</MemoryButton>
                  </div>
                </section> : <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteConfirmationId(memory.id); setDeleteMessage(null); }} style={{ minHeight: 44, marginTop: MemorySpacing.md, border: `1px solid ${SurfaceToken.border.subtle}`, borderRadius: MemoryRadius.full, background: "transparent", color: SurfaceToken.content.muted, cursor: "pointer", padding: "0 14px" }}>删除 TA</button>}
                {clearConfirmationId === memory.id ? <section aria-label={`清除 ${memory.name} 聊天记录确认`} style={{ display: "grid", gap: MemorySpacing.sm, marginTop: MemorySpacing.md }} onClick={(event) => event.stopPropagation()}>
                  <p style={{ margin: 0, color: SurfaceToken.content.secondary }}>确认清除与 {memory.name} 的聊天记录？此操作不可恢复，已清除内容不会再显示或用于后续相伴。</p>
                  <div style={{ display: "flex", gap: MemorySpacing.sm }}><MemoryButton variant="primary" disabled={clearingId === memory.id} onClick={() => void clearChatHistory(memory)}>{clearingId === memory.id ? "正在确认…" : "确认清除记录"}</MemoryButton><MemoryButton variant="secondary" disabled={clearingId === memory.id} onClick={() => setClearConfirmationId(null)}>取消</MemoryButton></div>
                </section> : <button type="button" onClick={(event) => { event.stopPropagation(); setClearConfirmationId(memory.id); setDeleteMessage(null); }} style={{ minHeight: 44, marginTop: MemorySpacing.sm, border: "none", background: "transparent", color: SurfaceToken.content.muted, cursor: "pointer", padding: "0 14px" }}>清除聊天记录</button>}
              </MemoryCard>
            ))}
            {deleteMessage ? <p role="status" aria-live="polite" style={{ margin: 0, color: SurfaceToken.content.secondary }}>{deleteMessage}</p> : null}
          </div>
        )}
      </MemorySection>

      <nav aria-label="主导航" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: MemoryZIndex.navigation, display: "flex", justifyContent: "center", gap: MemorySpacing.sm, padding: `${MemorySpacing.sm} ${MemorySpacing.lg} calc(${MemorySpacing.md} + env(safe-area-inset-bottom, 0px))`, background: "rgba(5,5,5,0.86)", borderTop: `1px solid ${SurfaceToken.border.subtle}` }}>
        {[{ label: "相伴", href: "/memory-world" }, { label: "拾忆", href: "/memory" }, { label: "我的", href: "/continuity" }].map((item) => (
          <button key={item.label} type="button" onClick={() => router.push(item.href)} aria-current={item.href === "/memory-world" ? "page" : undefined} style={{ minWidth: 64, minHeight: 46, border: "none", borderRadius: MemoryRadius.full, background: item.href === "/memory-world" ? "rgba(196,168,130,0.14)" : "transparent", color: item.href === "/memory-world" ? SurfaceToken.accent.gold : SurfaceToken.content.muted, cursor: "pointer" }}>{item.label}</button>
        ))}
      </nav>
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
