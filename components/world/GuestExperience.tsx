"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../../src/motion";
import styles from "./GuestExperience.module.css";

type GuestStage = "entry" | "awakening" | "companion";

type HomeStory = {
  slug: string;
  label: string;
};

const DISCLOSURE = "AI生成示例 · 使用虚构示例资料 · 不代表真实人物或其真实表达 · 不会上传或保存，也不会产生账号或正式人物记录";

const HOME_STORIES: readonly HomeStory[] = [
  { slug: "elderly-woman", label: "窗边的母亲" },
  { slug: "elderly-man", label: "安静的父亲" },
  { slug: "child-drawing", label: "窗边写字的孩子" },
  { slug: "young-woman", label: "熟悉的伴侣" },
  { slug: "younger-man", label: "记忆里的家人或朋友" },
];

const CROSSFADE_MS = 1_000;

type PerformanceNavigator = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

function shouldUseStaticHero() {
  const hints = navigator as PerformanceNavigator;
  return hints.connection?.saveData === true
    || (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2)
    || navigator.hardwareConcurrency <= 2;
}

function assetPath(story: HomeStory, extension: "mp4" | "poster.webp") {
  return `/home-hero-assets/${story.slug}.${extension}`;
}

type GuestExperienceProps = {
  authenticated?: boolean;
  people?: readonly HomePerson[];
  onLogin: () => void;
  onStart?: () => void;
  onOpenPerson?: (id: string) => void;
};

export type HomePerson = {
  id: string;
  name: string;
  image: string | null;
};

export function GuestExperience({
  authenticated = false,
  people = [],
  onLogin,
  onStart = onLogin,
  onOpenPerson,
}: GuestExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<GuestStage>("entry");
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null);
  const [crossfading, setCrossfading] = useState(false);
  const incomingVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  const advanceStory = useCallback(() => {
    if (!videoEnabled) return;
    setIncomingIndex((current) => current === null
      ? (activeIndex + 1) % HOME_STORIES.length
      : current);
  }, [activeIndex, videoEnabled]);

  useEffect(() => {
    if (incomingIndex === null) return;

    let active = true;
    let settleTimer = 0;
    let frame = 0;
    const incomingVideo = incomingVideoRef.current;

    const settleToStatic = () => {
      if (!active) return;
      setActiveIndex(incomingIndex);
      setIncomingIndex(null);
      setCrossfading(false);
      setVideoEnabled(false);
    };

    const begin = async () => {
      if (!incomingVideo) {
        settleToStatic();
        return;
      }
      incomingVideo.currentTime = 0;
      try {
        await incomingVideo.play();
      } catch {
        settleToStatic();
        return;
      }
      if (!active) return;
      frame = window.requestAnimationFrame(() => setCrossfading(true));
      settleTimer = window.setTimeout(() => {
        if (!active) return;
        setActiveIndex(incomingIndex);
        setIncomingIndex(null);
        setCrossfading(false);
      }, CROSSFADE_MS);
    };

    void begin();
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [incomingIndex]);

  useEffect(() => {
    if (stage !== "awakening") return;
    const timer = window.setTimeout(
      () => setStage("companion"),
      reducedMotion ? 120 : 2_200,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, stage]);

  const activeStory = HOME_STORIES[activeIndex];
  const incomingStory = incomingIndex === null ? null : HOME_STORIES[incomingIndex];

  return (
    <main className={styles.experience} data-stage={stage} data-reduced-motion={reducedMotion ? "true" : "false"}>
      {stage === "entry" ? (
        <>
          <div className={styles.media} aria-hidden="true">
            <img className={styles.poster} src={assetPath(activeStory, "poster.webp")} alt="" />
            {videoEnabled && (
              <video
                key={`active-${activeStory.slug}`}
                className={`${styles.video} ${crossfading ? styles.videoOutgoing : ""}`}
                src={assetPath(activeStory, "mp4")}
                poster={assetPath(activeStory, "poster.webp")}
                autoPlay
                muted
                playsInline
                preload={activeIndex === 0 ? "auto" : "metadata"}
                disablePictureInPicture
                onTimeUpdate={(event) => {
                  const video = event.currentTarget;
                  if (incomingIndex === null && video.duration - video.currentTime <= 1.05) advanceStory();
                }}
                onEnded={() => incomingIndex === null && advanceStory()}
                onError={() => setVideoEnabled(false)}
              />
            )}
            {videoEnabled && incomingStory && (
              <video
                key={`incoming-${incomingStory.slug}`}
                ref={incomingVideoRef}
                className={`${styles.video} ${styles.videoIncoming} ${crossfading ? styles.videoIncomingVisible : ""}`}
                src={assetPath(incomingStory, "mp4")}
                poster={assetPath(incomingStory, "poster.webp")}
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
              />
            )}
            <span className={styles.mediaVeil} />
          </div>

          <header className={styles.heroHeader}>
            <span className={styles.heroWordmark}>忆见</span>
            {!authenticated && <button className={styles.loginAction} type="button" onClick={onLogin}>登录</button>}
          </header>

          {authenticated && people.length > 0 ? (
            <section className={styles.peopleInvitation} aria-label="你记住的人">
              <div className={styles.peopleList}>
                {people.map((person) => (
                  <button
                    className={styles.personAction}
                    key={person.id}
                    type="button"
                    aria-label={`${person.name}，进入相伴`}
                    onClick={() => onOpenPerson?.(person.id)}
                  >
                    <span className={styles.personPortrait}>
                      {person.image
                        ? <img src={person.image} alt={`${person.name}的照片`} />
                        : <span aria-hidden="true">{person.name.slice(0, 1)}</span>}
                    </span>
                    <strong>{person.name}</strong>
                  </button>
                ))}
                {people.length < 3 && (
                  <button className={styles.addPersonAction} type="button" aria-label="开始记录另一个人" onClick={onStart}>＋</button>
                )}
              </div>
            </section>
          ) : (
            <section className={styles.heroInvitation} aria-labelledby="guest-entry-title">
              <p className={styles.invitationLine} id="guest-entry-title">把想念，放在一个温柔的地方。</p>
              <button className={styles.heroPrimaryAction} type="button" onClick={onStart}>开始</button>
              {!authenticated && <button className={styles.heroSecondaryAction} type="button" onClick={() => setStage("awakening")}>体验一次遇见</button>}
            </section>
          )}

          <p className={styles.heroDisclosure} role="note">{DISCLOSURE}</p>
          <p className={styles.srOnly} aria-live="polite">正在展示：{activeStory.label}</p>
        </>
      ) : (
        <>
          <div className={styles.stars} aria-hidden="true" />
          <div className={styles.ambientLight} aria-hidden="true" />

          <header className={styles.header}>
            <span className={styles.wordmark}>忆见</span>
            <span className={styles.mode}>公开体验</span>
          </header>

          <p className={styles.disclosure} role="note">{DISCLOSURE}</p>

          {stage === "awakening" && (
            <section className={styles.awakening} role="status" aria-live="polite" aria-labelledby="guest-awakening-title">
              <div className={styles.awakeningPortrait} role="img" aria-label="虚构示例 TA 的抽象轮廓">
                <span>TA</span>
                <i /><i /><i /><i />
              </div>
              <p className={styles.eyebrow}>视觉效果示例 · 未生成真实视频</p>
              <h1 id="guest-awakening-title">正在唤醒一段示例记忆…</h1>
              <div className={styles.awakeningCopy} aria-hidden="true">
                <span>正在整理虚构示例资料…</span>
                <span>正在让熟悉的轮廓慢慢出现…</span>
              </div>
            </section>
          )}

          {stage === "companion" && (
            <section className={styles.companion} aria-labelledby="guest-companion-title">
              <p className={styles.eyebrow}>陪伴空间示例</p>
              <div className={styles.companionPortrait} role="img" aria-label="虚构示例 TA 的抽象轮廓"><span>TA</span></div>
              <h1 id="guest-companion-title">示例 TA，已经在这里。</h1>
              <p className={styles.relationship}>亲人关系 · 虚构示例</p>
              <div className={styles.dailyGreeting}>
                <span>今天的一句示例问候</span>
                <blockquote>“今天过得怎么样？如果愿意，就从一件小事说起。”</blockquote>
                <small>预设 AI 示例文案 · 未调用 AI 服务 · 不是任何真实人物的留言</small>
              </div>
              <p className={styles.companionCopy}>正式使用时，陪伴空间只会读取你登录后拥有并确认的 TA 资料。</p>
              <div className={styles.conversionInvitation}>
                <p>体验到这里</p>
                <h2>把想念留在这里</h2>
                <span>当你愿意开始时，再登录并留下真实资料。刚才的虚构示例不会保存，也不会带入你的 TA。</span>
              </div>
              <div className={styles.actions}>
                <button className={styles.primaryAction} type="button" onClick={onStart}>开始</button>
                <button className={styles.secondaryAction} type="button" onClick={() => setStage("entry")}>重新体验</button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
