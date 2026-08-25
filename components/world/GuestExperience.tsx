"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../../src/motion";
import styles from "./GuestExperience.module.css";

type HomeStory = {
  slug: string;
  label: string;
};

/** Public, synthetic-only artwork. No Owner data is used by this surface. */
const HOME_STORIES: readonly HomeStory[] = [
  { slug: "elderly-woman", label: "窗边的母亲" },
  { slug: "elderly-man", label: "安静的父亲" },
  { slug: "child-drawing", label: "窗边写字的孩子" },
  { slug: "young-woman", label: "熟悉的伴侣" },
  { slug: "younger-man", label: "记忆里的家人或朋友" },
];

const CROSSFADE_MS = 1_000;
const DISCLOSURE = "AI生成示例 · 使用虚构示例资料 · 不代表真实人物或其真实表达";

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
  onLogin: () => void;
  onStart: () => void;
  showLogin?: boolean;
};

/**
 * The approved public homepage: five separate synthetic people, one at a
 * time, quietly crossfading. It is intentionally presentation-only: no
 * session storage, Owner reads, analytics write, or public demo flow.
 */
export function GuestExperience({ onLogin, onStart, showLogin = true }: GuestExperienceProps) {
  const reducedMotion = useReducedMotion();
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

  const activeStory = HOME_STORIES[activeIndex];
  const incomingStory = incomingIndex === null ? null : HOME_STORIES[incomingIndex];

  return (
    <main className={styles.experience} data-reduced-motion={reducedMotion ? "true" : "false"}>
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
        {showLogin && <button className={styles.loginAction} type="button" onClick={onLogin}>登录</button>}
      </header>

      <section className={styles.heroInvitation} aria-label="开始创建">
        <button className={styles.heroPrimaryAction} type="button" onClick={onStart}>创建 TA</button>
      </section>

      <p className={styles.heroDisclosure} role="note">{DISCLOSURE}</p>
      <p className={styles.srOnly} aria-live="polite">正在展示：{activeStory.label}</p>
    </main>
  );
}
