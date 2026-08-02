"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MemoryAvatar, MemoryButton, MemoryCard, MemorySection, MemorySurface } from "../../src/components/memory-ui";
import { MemoryRadius, MemorySpacing, MemorySurface as SurfaceToken, MemoryTypography, MemoryZIndex } from "../../src/design";
import { MotionProvider } from "../../src/motion";
import {
  COMPANION_DAILY_GREETING_KEY,
  COMPANION_PRIMARY_KEY,
  companionDay,
  dailyGreetingMarker,
  isDailyCompanionGreetingDue,
  selectPrimaryCompanion,
} from "../../src/components/companion/companionHomeState";

type MemoryWorldItem = {
  id: string;
  name: string;
  relationship?: string | null;
  lifeStory?: string | null;
  photoUrl?: string | null;
};

type MemoryWorldState = "loading" | "unauthenticated" | "empty" | "ready" | "error";

function MemoryWorldContent() {
  const router = useRouter();
  const [state, setState] = useState<MemoryWorldState>("loading");
  const [memories, setMemories] = useState<MemoryWorldItem[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [dailyGreetingVisible, setDailyGreetingVisible] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/memories", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (response.status === 401) {
        setState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error(data?.error || "load failed");
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
    } catch {
      setState("error");
    }
  }, []);

  const primary = selectPrimaryCompanion(memories, primaryId);
  const choosePrimary = (memory: MemoryWorldItem) => {
    setPrimaryId(memory.id);
    window.localStorage.setItem(COMPANION_PRIMARY_KEY, memory.id);
    setDailyGreetingVisible(false);
  };

  useEffect(() => {
    void load();
  }, [load]);

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
        <button onClick={() => router.push("/")} style={{ minHeight: 44, border: "none", background: "transparent", color: SurfaceToken.content.muted, cursor: "pointer" }}>← 返回首页</button>
        <h1 style={{ margin: `${MemorySpacing.lg} 0 ${MemorySpacing.sm}`, color: SurfaceToken.content.primary, fontFamily: MemoryTypography.fontFamily.zh, fontSize: MemoryTypography.size.hero, lineHeight: MemoryTypography.lineHeight.compact }}>记忆空间</h1>
        <p style={{ margin: 0, color: SurfaceToken.content.secondary, lineHeight: MemoryTypography.lineHeight.normal }}>这里只展示你已经真实创建的记忆体。</p>
      </header>

      <MemorySection>
        {state === "loading" && <MemoryCard>正在整理记忆空间…</MemoryCard>}
        {state === "error" && <MemoryCard><div style={{ display: "grid", gap: MemorySpacing.md }}><span>暂时无法读取记忆。</span><MemoryButton variant="secondary" onClick={() => void load()}>重试</MemoryButton></div></MemoryCard>}
        {(state === "empty" || state === "unauthenticated") && (
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
                  <div style={{ display: "flex", alignItems: "center", gap: MemorySpacing.lg }}>
                    <MemoryAvatar image={primary.photoUrl} initials={primary.name} presence="quiet" size={96} />
                    <div><div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.title }}>{primary.name}</div><div style={{ color: SurfaceToken.content.muted, marginTop: 4 }}>{primary.relationship || "关系待补充"}</div></div>
                  </div>
                  {dailyGreetingVisible && <p role="status" style={{ margin: 0, color: SurfaceToken.content.secondary, lineHeight: MemoryTypography.lineHeight.normal }}>忆见提示：今天也可以慢慢说一件你想起的小事。</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: MemorySpacing.sm }}>
                    <MemoryButton variant="primary" onClick={() => router.push(`/memory/${primary.id}/encounter`)}>遇见</MemoryButton>
                    <MemoryButton variant="secondary" onClick={() => router.push(`/memory-chat/${primary.id}`)}>稍后再看</MemoryButton>
                  </div>
                </div>
              </MemoryCard>
            )}
            {memories.length > 1 && <section aria-label="切换主 TA" style={{ display: "grid", gap: MemorySpacing.sm }}>
              <p style={{ margin: 0, color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.meta }}>手动切换或设为主 TA</p>
              <div style={{ display: "flex", gap: MemorySpacing.sm, overflowX: "auto", paddingBottom: 2 }}>{memories.map((memory) => <button key={`primary-${memory.id}`} type="button" onClick={() => choosePrimary(memory)} aria-pressed={primary?.id === memory.id} style={{ minHeight: 44, whiteSpace: "nowrap", borderRadius: MemoryRadius.full, border: `1px solid ${primary?.id === memory.id ? SurfaceToken.accent.gold : SurfaceToken.border.subtle}`, background: "transparent", color: primary?.id === memory.id ? SurfaceToken.accent.gold : SurfaceToken.content.secondary, padding: "0 14px", cursor: "pointer" }}>{primary?.id === memory.id ? `${memory.name} · 主 TA` : `设 ${memory.name} 为主 TA`}</button>)}</div>
            </section>}
            {memories.map((memory) => (
              <MemoryCard key={memory.id} interactive reveal onClick={() => router.push(`/memory-chat/${memory.id}`)}>
                <div style={{ display: "flex", gap: MemorySpacing.md, alignItems: "center" }}>
                  <MemoryAvatar image={memory.photoUrl} initials={memory.name} presence="quiet" size={52} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.bodyLarge }}>{memory.name}</div>
                    <div style={{ marginTop: 4, color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.meta }}>{memory.relationship || "关系待补充"}</div>
                  </div>
                </div>
              </MemoryCard>
            ))}
          </div>
        )}
      </MemorySection>

      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: MemoryZIndex.navigation, display: "flex", justifyContent: "center", gap: MemorySpacing.sm, padding: `${MemorySpacing.sm} ${MemorySpacing.lg} calc(${MemorySpacing.md} + env(safe-area-inset-bottom, 0px))`, background: "rgba(5,5,5,0.86)", borderTop: `1px solid ${SurfaceToken.border.subtle}` }}>
        {[{ label: "相伴", href: "/memory-world" }, { label: "拾忆", href: "/memory" }, { label: "我的", href: "/continuity" }].map((item) => (
          <button key={item.label} onClick={() => router.push(item.href)} style={{ minWidth: 64, minHeight: 46, border: "none", borderRadius: MemoryRadius.full, background: item.href === "/memory-world" ? "rgba(196,168,130,0.14)" : "transparent", color: item.href === "/memory-world" ? SurfaceToken.accent.gold : SurfaceToken.content.muted, cursor: "pointer" }}>{item.label}</button>
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
