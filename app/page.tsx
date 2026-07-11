"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import SplashScreen from "../src/components/SplashScreen";
import {
  MemoryActionRow,
  MemoryAvatar,
  MemoryButton,
  MemoryCard,
  MemoryHero,
  MemorySection,
  MemorySurface,
} from "../src/components/memory-ui";
import { MemoryMotion, MemoryRadius, MemoryShadow, MemorySpacing, MemorySurface as SurfaceToken, MemoryTypography, MemoryZIndex } from "../src/design";
import { MotionProvider, useMotionScroll, useMotionSpring, useReducedMotion } from "../src/motion";

type HomeMemory = {
  id: string;
  name: string;
  relationship?: string | null;
  lifeStory?: string | null;
  life_story?: string | null;
  personalityProfile?: string | null;
  personality_profile?: string | null;
  speechStyle?: string | null;
  speech_style?: string | null;
  catchPhrases?: string | null;
  catch_phrases?: string | null;
  photoUrl?: string | null;
  photo_url?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

type HomeStatus = "boot" | "loading" | "unauthenticated" | "empty" | "ready" | "error";

type HomeSnapshot = {
  phone: string;
  memories: HomeMemory[];
  status: HomeStatus;
  error?: string;
};

const SPLASH_KEY = "memoryai:sprint14:splash-seen";
const safeBottom = "calc(112px + env(safe-area-inset-bottom, 0px))";

const getMemoryPhoto = (memory?: HomeMemory | null) => memory?.photoUrl ?? memory?.photo_url ?? null;
const getLifeStory = (memory?: HomeMemory | null) => memory?.lifeStory ?? memory?.life_story ?? "";
const getPersonality = (memory?: HomeMemory | null) => memory?.personalityProfile ?? memory?.personality_profile ?? "";
const getSpeechStyle = (memory?: HomeMemory | null) => memory?.speechStyle ?? memory?.speech_style ?? "";
const getCatchPhrases = (memory?: HomeMemory | null) => memory?.catchPhrases ?? memory?.catch_phrases ?? "";

function computeCompleteness(memory?: HomeMemory | null) {
  if (!memory) return 0;

  const fields = [
    memory.name,
    memory.relationship,
    getLifeStory(memory),
    getPersonality(memory),
    getSpeechStyle(memory),
    getCatchPhrases(memory),
    getMemoryPhoto(memory),
  ];

  return Math.round((fields.filter((field) => Boolean(String(field ?? "").trim())).length / fields.length) * 100);
}

function HomePageContent() {
  const reducedMotion = useReducedMotion();
  const scroll = useMotionScroll();
  const heroDepth = useMotionSpring(reducedMotion ? 0 : scroll.progressY * -16);
  const [snapshot, setSnapshot] = useState<HomeSnapshot>({ phone: "", memories: [], status: "boot" });
  const [navigating, setNavigating] = useState<string | null>(null);

  const activeMemory = snapshot.memories[0] ?? null;
  const completeness = computeCompleteness(activeMemory);
  const isBusy = snapshot.status === "boot" || snapshot.status === "loading";

  const loadHome = useCallback(async () => {
    if (typeof window === "undefined") return;

    const phone = localStorage.getItem("yijian_phone") || localStorage.getItem("yj_phone") || "";

    if (!phone) {
      setSnapshot({ phone: "", memories: [], status: "unauthenticated" });
      return;
    }

    setSnapshot((current) => ({ ...current, phone, status: "loading", error: undefined }));

    try {
      const response = await fetch(`/api/memories?userId=${encodeURIComponent(phone)}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "记忆读取失败");
      }

      const memories = Array.isArray(data) ? (data as HomeMemory[]) : [];
      setSnapshot({
        phone,
        memories,
        status: memories.length > 0 ? "ready" : "empty",
      });
    } catch (error) {
      setSnapshot({
        phone,
        memories: [],
        status: "error",
        error: error instanceof Error ? error.message : "首页加载失败",
      });
    }
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const navigateOnce = useCallback(
    (key: string, href: string) => {
      if (navigating) return;
      setNavigating(key);
      if (typeof window !== "undefined" && window.location.pathname === href) {
        setNavigating(null);
        return;
      }
      window.location.assign(href);
    },
    [navigating]
  );

  const goCreate = () => navigateOnce("create", "/create-memory");
  const goMemoryWorld = () => navigateOnce("memory", "/memory-world");
  const goProfile = () => navigateOnce("profile", "/continuity");
  const goChat = () => {
    if (!activeMemory?.id) {
      goCreate();
      return;
    }
    navigateOnce("chat", `/memory-chat/${activeMemory.id}`);
  };

  const heroTitle = "让重要的人，继续被听见。";
  const heroDescription = "保存 TA 的声音、记忆与性格，在熟悉的对话中再次相见。";

  const capabilityItems = useMemo(
    () => [
      { label: "记忆", ready: Boolean(getLifeStory(activeMemory) || getCatchPhrases(activeMemory)) },
      { label: "声音", ready: Boolean(getSpeechStyle(activeMemory)) },
      { label: "形象", ready: Boolean(getMemoryPhoto(activeMemory)) },
    ],
    [activeMemory]
  );

  return (
    <MemorySurface
      variant="background"
      style={{
        minHeight: "100dvh",
        overflowX: "hidden",
        background: `radial-gradient(circle at 50% 18%, rgba(196,168,130,0.16), transparent 34%), ${SurfaceToken.background.base}`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: MemoryZIndex.atmosphere,
          background: "radial-gradient(circle at 50% 28%, rgba(232,199,165,0.13), transparent 24%), radial-gradient(circle at 24% 8%, rgba(196,168,130,0.08), transparent 26%)",
          opacity: reducedMotion ? 0.58 : 0.82,
        }}
      />

      <main
        style={{
          position: "relative",
          zIndex: MemoryZIndex.content,
          minHeight: "100dvh",
          paddingBottom: safeBottom,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: MemorySpacing.lg,
            padding: `calc(${MemorySpacing.lg} + env(safe-area-inset-top, 0px)) ${MemorySpacing.pageXMobile} ${MemorySpacing.sm}`,
          }}
        >
          <div>
            <div style={{ color: SurfaceToken.content.primary, fontFamily: MemoryTypography.fontFamily.zh, fontSize: MemoryTypography.size.bodyLarge, fontWeight: MemoryTypography.weight.medium }}>忆见</div>
            <div style={{ marginTop: 2, color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.caption }}>AI 亲人陪伴入口</div>
          </div>
          <button
            type="button"
            onClick={activeMemory ? goChat : goCreate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: MemorySpacing.sm,
              minHeight: 44,
              border: `1px solid ${SurfaceToken.border.subtle}`,
              borderRadius: MemoryRadius.full,
              background: "rgba(247,239,228,0.05)",
              color: SurfaceToken.content.secondary,
              padding: `${MemorySpacing.xs} ${MemorySpacing.sm}`,
              cursor: "pointer",
            }}
          >
            <MemoryAvatar image={getMemoryPhoto(activeMemory)} initials={activeMemory?.name || "忆"} presence={activeMemory ? "quiet" : "none"} size={32} />
            <span style={{ maxWidth: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeMemory?.name || "创建 TA"}</span>
          </button>
        </header>

        <MemoryHero
          media={
            <div
              style={{
                position: "relative",
                display: "grid",
                placeItems: "center",
                minHeight: 178,
                transform: `translateY(${heroDepth.value}px)`,
                transition: reducedMotion ? "none" : `transform ${MemoryMotion.duration.feedback}ms ${MemoryMotion.ease.standard}`,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  width: 172,
                  height: 172,
                  borderRadius: MemoryRadius.full,
                  background: "radial-gradient(circle, rgba(232,199,165,0.22), rgba(196,168,130,0.08) 42%, transparent 70%)",
                  filter: reducedMotion ? "none" : "blur(2px)",
                  boxShadow: MemoryShadow.glowSoft,
                }}
              />
              <MemoryAvatar image={getMemoryPhoto(activeMemory)} initials={activeMemory?.name || "忆见"} presence={activeMemory ? "online" : "quiet"} size={112} />
            </div>
          }
          eyebrow={snapshot.status === "ready" ? `欢迎回来，${activeMemory?.name || "TA"} 在这里` : "MemoryAI"}
          title={heroTitle}
          description={heroDescription}
          actions={
            <MemoryActionRow>
              <MemoryButton
                variant="primary"
                href={activeMemory ? `/memory-chat/${activeMemory.id}` : "/create-memory"}
                style={{ flex: "1 1 164px" }}
              >
                {activeMemory ? "继续对话" : "创建 TA"}
              </MemoryButton>
              <MemoryButton variant="secondary" href="/memory-world" style={{ flex: "1 1 164px" }}>
                进入记忆空间
              </MemoryButton>
            </MemoryActionRow>
          }
          style={{ paddingTop: MemorySpacing["2xl"], paddingBottom: MemorySpacing["3xl"] }}
        />

        <MemorySection
          title={snapshot.status === "ready" ? "存在体状态" : snapshot.status === "error" ? "暂时没有连上" : "从一个人开始"}
          description={
            snapshot.status === "ready"
              ? "资料越完整，对话越接近熟悉的语气。"
              : snapshot.status === "error"
                ? snapshot.error || "读取失败，请稍后重试。"
                : "创建第一位重要的人，慢慢保存 TA 的声音、记忆与性格。"
          }
          action={snapshot.status === "error" ? <MemoryButton variant="ghost" onClick={() => void loadHome()}>重试</MemoryButton> : undefined}
        >
          {isBusy ? <HomeSkeleton /> : null}
          {snapshot.status === "error" ? <HomeError onRetry={() => void loadHome()} /> : null}
          {snapshot.status === "empty" || snapshot.status === "unauthenticated" ? <EmptyState /> : null}
          {snapshot.status === "ready" && activeMemory ? (
            <PresenceCard memory={activeMemory} completeness={completeness} capabilityItems={capabilityItems} />
          ) : null}
        </MemorySection>

        <MemorySection title="核心入口" description="每个入口都指向真实路由；没有记忆时会先引导创建。">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: MemorySpacing.md }}>
            <ActionCard title="开始 / 继续对话" desc={activeMemory ? `和 ${activeMemory.name} 说说话` : "先创建 TA，再开始对话"} onClick={goChat} disabledReason={!activeMemory ? "需要先创建 TA" : undefined} />
            <ActionCard title="创建或完善 TA" desc="补充声音、记忆与性格" onClick={goCreate} />
            <ActionCard title="进入记忆空间" desc="查看已保存的记忆世界" onClick={goMemoryWorld} />
            <ActionCard title="声音与形象进度" desc={activeMemory ? "查看当前资料完整度" : "创建后可查看进度"} onClick={activeMemory ? goProfile : goCreate} disabledReason={!activeMemory ? "暂无记忆体" : undefined} />
          </div>
        </MemorySection>

        <MemorySection title="最近记忆" description="只展示你已经真实创建的记忆。">
          {snapshot.status === "ready" ? (
            <div style={{ display: "grid", gap: MemorySpacing.md }}>
              {snapshot.memories.slice(0, 3).map((memory) => (
                <MemoryCard key={memory.id} interactive reveal onClick={() => navigateOnce(`memory-${memory.id}`, `/memory-chat/${memory.id}`)}>
                  <div style={{ display: "flex", alignItems: "center", gap: MemorySpacing.md }}>
                    <MemoryAvatar image={getMemoryPhoto(memory)} initials={memory.name} presence="quiet" size={48} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.bodyLarge }}>{memory.name}</div>
                      <div style={{ marginTop: 4, color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.meta }}>{memory.relationship || "关系待补充"}</div>
                    </div>
                  </div>
                </MemoryCard>
              ))}
            </div>
          ) : (
            <MemoryCard depth="flat" style={{ color: SurfaceToken.content.muted }}>暂无最近记忆。创建 TA 后，这里会出现真实记录。</MemoryCard>
          )}
        </MemorySection>

        <MemorySection title="AI 陪伴入口" description="当你准备好，可以从一次安静的对话开始。">
          <MemoryCard depth="elevated" reveal>
            <div style={{ display: "grid", gap: MemorySpacing.lg }}>
              <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.bodyLarge }}>不是把思念变成工具，而是给它一个可以被回应的地方。</div>
              <MemoryActionRow>
            <MemoryButton variant="primary" href={activeMemory ? `/memory-chat/${activeMemory.id}` : "/create-memory"}>
              {activeMemory ? "继续对话" : "创建 TA"}
            </MemoryButton>
            <MemoryButton variant="ghost" href="/memory-world">记忆空间</MemoryButton>
              </MemoryActionRow>
            </div>
          </MemoryCard>
        </MemorySection>
      </main>

      <HomeBottomNav activeMemoryId={activeMemory?.id} navigating={navigating} onNavigate={navigateOnce} />
    </MemorySurface>
  );
}

function HomeSkeleton() {
  return (
    <MemoryCard depth="soft">
      <div style={{ display: "grid", gap: MemorySpacing.md }}>
        {[0, 1, 2].map((item) => (
          <div key={item} style={{ height: item === 0 ? 18 : 12, width: item === 0 ? "56%" : "86%", borderRadius: MemoryRadius.full, background: "rgba(247,239,228,0.08)" }} />
        ))}
      </div>
    </MemoryCard>
  );
}

function EmptyState() {
  return (
    <MemoryCard depth="soft" reveal>
      <div style={{ display: "grid", gap: MemorySpacing.md }}>
        <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.bodyLarge }}>还没有创建亲人数字档案。</div>
        <div style={{ color: SurfaceToken.content.muted, lineHeight: MemoryTypography.lineHeight.normal }}>可以先从名字、关系和一段难忘的记忆开始，不需要一次填完。</div>
        <MemoryButton variant="primary" href="/create-memory">创建 TA</MemoryButton>
      </div>
    </MemoryCard>
  );
}

function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <MemoryCard depth="soft">
      <div style={{ display: "grid", gap: MemorySpacing.md }}>
        <div style={{ color: SurfaceToken.state.warning }}>数据暂时没有回来。</div>
        <MemoryButton variant="secondary" onClick={onRetry}>重新加载</MemoryButton>
      </div>
    </MemoryCard>
  );
}

function PresenceCard({ memory, completeness, capabilityItems }: { memory: HomeMemory; completeness: number; capabilityItems: Array<{ label: string; ready: boolean }> }) {
  return (
    <MemoryCard depth="elevated" reveal>
      <div style={{ display: "grid", gap: MemorySpacing.lg }}>
        <div style={{ display: "flex", alignItems: "center", gap: MemorySpacing.md }}>
          <MemoryAvatar image={getMemoryPhoto(memory)} initials={memory.name} presence="online" size={56} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.title }}>{memory.name}</div>
            <div style={{ color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.meta }}>{memory.relationship || "关系待补充"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: MemorySpacing.sm }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: SurfaceToken.content.secondary, fontSize: MemoryTypography.size.meta }}>
            <span>资料完整度</span><span>{completeness}%</span>
          </div>
          <div style={{ height: 6, borderRadius: MemoryRadius.full, background: "rgba(247,239,228,0.08)", overflow: "hidden" }}>
            <div style={{ width: `${completeness}%`, height: "100%", borderRadius: MemoryRadius.full, background: SurfaceToken.accent.gold }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: MemorySpacing.sm }}>
          {capabilityItems.map((item) => (
            <div key={item.label} style={{ minHeight: 44, borderRadius: MemoryRadius.md, border: `1px solid ${SurfaceToken.border.subtle}`, display: "grid", placeItems: "center", color: item.ready ? SurfaceToken.accent.gold : SurfaceToken.content.muted, fontSize: MemoryTypography.size.caption }}>
              {item.label} · {item.ready ? "已记录" : "待完善"}
            </div>
          ))}
        </div>
        <MemoryActionRow>
          <MemoryButton variant="primary" href={`/memory-chat/${memory.id}`}>继续对话</MemoryButton>
          <MemoryButton variant="secondary" href="/create-memory">完善 TA</MemoryButton>
        </MemoryActionRow>
      </div>
    </MemoryCard>
  );
}

function ActionCard({ title, desc, disabledReason, onClick }: { title: string; desc: string; disabledReason?: string; onClick: () => void }) {
  return (
    <MemoryCard interactive reveal onClick={onClick} style={{ minHeight: 128, padding: MemorySpacing.lg }}>
      <div style={{ display: "grid", gap: MemorySpacing.sm }}>
        <div style={{ color: SurfaceToken.content.primary, fontSize: MemoryTypography.size.body }}>{title}</div>
        <div style={{ color: SurfaceToken.content.muted, fontSize: MemoryTypography.size.caption, lineHeight: MemoryTypography.lineHeight.normal }}>{desc}</div>
        {disabledReason && <div style={{ color: SurfaceToken.accent.gold, fontSize: MemoryTypography.size.caption }}>{disabledReason}</div>}
      </div>
    </MemoryCard>
  );
}

function HomeBottomNav({ activeMemoryId, navigating, onNavigate }: { activeMemoryId?: string; navigating: string | null; onNavigate: (key: string, href: string) => void }) {
  const items = [
    { key: "home", label: "首页", href: "/" },
    { key: "chat", label: "聊天", href: activeMemoryId ? `/memory-chat/${activeMemoryId}` : "/create-memory" },
    { key: "memory", label: "记忆", href: "/memory-world" },
    { key: "profile", label: "我的", href: "/continuity" },
  ];

  return (
    <nav
      aria-label="主要导航"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: MemoryZIndex.navigation,
        display: "flex",
        justifyContent: "center",
        gap: MemorySpacing.sm,
        padding: `${MemorySpacing.sm} ${MemorySpacing.lg} calc(${MemorySpacing.md} + env(safe-area-inset-bottom, 0px))`,
        background: "rgba(5,5,5,0.86)",
        borderTop: `1px solid ${SurfaceToken.border.subtle}`,
        backdropFilter: "blur(18px)",
      }}
    >
      {items.map((item) => {
        const active = item.key === "home";
        return (
          <button
            key={item.key}
            type="button"
            disabled={Boolean(navigating)}
            onClick={() => onNavigate(item.key, item.href)}
            style={{
              minWidth: 64,
              minHeight: 46,
              border: "none",
              borderRadius: MemoryRadius.full,
              background: active ? "rgba(196,168,130,0.14)" : "transparent",
              color: active ? SurfaceToken.accent.gold : SurfaceToken.content.muted,
              fontSize: MemoryTypography.size.caption,
              cursor: navigating ? "wait" : "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function HomePage() {
  const [splashChecked, setSplashChecked] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const seen = window.sessionStorage.getItem(SPLASH_KEY) === "1";
    setShowSplash(!seen);
    setSplashChecked(true);
  }, []);

  const completeSplash = () => {
    window.sessionStorage.setItem(SPLASH_KEY, "1");
    setShowSplash(false);
  };

  if (!splashChecked) {
    return <div style={{ minHeight: "100dvh", background: "#000000" }} />;
  }

  return (
    <MotionProvider>
      {showSplash ? <SplashScreen onComplete={completeSplash} /> : null}
      <HomePageContent />
    </MotionProvider>
  );
}
