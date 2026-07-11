"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MemoryAvatar, MemoryButton, MemoryCard, MemorySection, MemorySurface } from "../../src/components/memory-ui";
import { MemoryRadius, MemorySpacing, MemorySurface as SurfaceToken, MemoryTypography, MemoryZIndex } from "../../src/design";
import { MotionProvider } from "../../src/motion";

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

  const load = useCallback(async () => {
    const phone = localStorage.getItem("yijian_phone") || localStorage.getItem("yj_phone") || "";
    if (!phone) {
      setState("unauthenticated");
      return;
    }

    setState("loading");
    try {
      const response = await fetch(`/api/memories?userId=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "load failed");
      const list = Array.isArray(data) ? data : [];
      setMemories(list);
      setState(list.length > 0 ? "ready" : "empty");
    } catch {
      setState("error");
    }
  }, []);

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
        {[{ label: "首页", href: "/" }, { label: "聊天", href: memories[0]?.id ? `/memory-chat/${memories[0].id}` : "/create-memory" }, { label: "记忆", href: "/memory-world" }, { label: "我的", href: "/continuity" }].map((item) => (
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
