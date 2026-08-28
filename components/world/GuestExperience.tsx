"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "../../src/motion";
import { PublicProductNavigation } from "./PublicProductNavigation";
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
const TRANSITION_START_REMAINING_SECONDS = 1.1;
const DISCLOSURE = "AI生成示例 · 使用虚构示例资料 · 不代表真实人物或其真实表达";

type PerformanceNavigator = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

type VideoSlot = 0 | 1;

function shouldUseStaticHero() {
  const hints = navigator as PerformanceNavigator;
  return hints.connection?.saveData === true
    || (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2)
    || navigator.hardwareConcurrency <= 2;
}

function assetPath(story: HomeStory, extension: "mp4" | "poster.webp") {
  return `/home-hero-assets/${story.slug}.${extension}`;
}

function otherSlot(slot: VideoSlot): VideoSlot {
  return slot === 0 ? 1 : 0;
}

type GuestExperienceProps = {
  onLogin: () => void;
  onStart: () => void;
  showLogin?: boolean;
};

/**
 * The approved public homepage: five separate synthetic people, one at a
 * time. Two persistent video slots keep the next film decoded off-screen
 * before a restrained dissolve begins. This surface never reads Owner data.
 */
export function GuestExperience({ onLogin, onStart, showLogin = true }: GuestExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [frontSlot, setFrontSlot] = useState<VideoSlot>(0);
  const [slotStories, setSlotStories] = useState<[number, number]>([0, 1]);
  const [crossfading, setCrossfading] = useState(false);
  const [holdingLastFrame, setHoldingLastFrame] = useState(false);
  const firstVideoRef = useRef<HTMLVideoElement>(null);
  const secondVideoRef = useRef<HTMLVideoElement>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitioningRef = useRef(false);
  const nextVideoFailedRef = useRef(false);

  const videoRefs = useMemo(() => [firstVideoRef, secondVideoRef] as const, []);
  const backSlot = otherSlot(frontSlot);
  const activeStory = HOME_STORIES[slotStories[frontSlot]];

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  const clearTransitionTimers = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
  }, []);

  const freezeCurrentFrame = useCallback(() => {
    const currentVideo = videoRefs[frontSlot].current;
    if (!currentVideo) return;

    currentVideo.pause();
    if (Number.isFinite(currentVideo.duration) && currentVideo.duration > 0) {
      currentVideo.currentTime = Math.max(0, currentVideo.duration - 0.04);
    }
    setHoldingLastFrame(true);
  }, [frontSlot, videoRefs]);

  const beginCrossfade = useCallback(async (holdIfNotReady = false) => {
    if (!videoEnabled || transitioningRef.current) return;

    const nextSlot = otherSlot(frontSlot);
    const nextVideo = videoRefs[nextSlot].current;
    if (nextVideoFailedRef.current || !nextVideo || nextVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (holdIfNotReady) freezeCurrentFrame();
      return;
    }

    transitioningRef.current = true;
    clearTransitionTimers();
    try {
      nextVideo.pause();
      nextVideo.currentTime = 0;
      await nextVideo.play();
    } catch {
      transitioningRef.current = false;
      if (holdIfNotReady) freezeCurrentFrame();
      return;
    }

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      setHoldingLastFrame(false);
      setCrossfading(true);
    });

    const followingIndex = (slotStories[nextSlot] + 1) % HOME_STORIES.length;
    transitionTimerRef.current = window.setTimeout(() => {
      const oldVideo = videoRefs[frontSlot].current;
      oldVideo?.pause();
      if (oldVideo) oldVideo.currentTime = 0;

      setSlotStories((current) => {
        const next = [...current] as [number, number];
        next[frontSlot] = followingIndex;
        return next;
      });
      setFrontSlot(nextSlot);
      setCrossfading(false);
      setHoldingLastFrame(false);
      transitioningRef.current = false;
      transitionTimerRef.current = null;
    }, CROSSFADE_MS);
  }, [clearTransitionTimers, freezeCurrentFrame, frontSlot, slotStories, videoEnabled, videoRefs]);

  // The hidden slot is deliberately loaded as soon as its source changes, not
  // at the end of the current movie. This keeps mobile bandwidth to two files.
  useEffect(() => {
    if (!videoEnabled) return;
    const preparedVideo = videoRefs[backSlot].current;
    if (!preparedVideo) return;
    nextVideoFailedRef.current = false;
    preparedVideo.pause();
    preparedVideo.currentTime = 0;
    preparedVideo.load();
  }, [backSlot, slotStories, videoEnabled, videoRefs]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTransitionTimers();
        if (crossfading) {
          videoRefs[backSlot].current?.pause();
          setCrossfading(false);
          transitioningRef.current = false;
        }
        return;
      }

      const currentVideo = videoRefs[frontSlot].current;
      if (!currentVideo || !videoEnabled) return;
      if (currentVideo.ended) freezeCurrentFrame();
      else void currentVideo.play().catch(() => undefined);
      videoRefs[backSlot].current?.load();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [backSlot, clearTransitionTimers, crossfading, freezeCurrentFrame, frontSlot, videoEnabled, videoRefs]);

  useEffect(() => () => clearTransitionTimers(), [clearTransitionTimers]);

  const handleCurrentTimeUpdate = useCallback((video: HTMLVideoElement) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || crossfading || holdingLastFrame) return;
    if (video.duration - video.currentTime <= TRANSITION_START_REMAINING_SECONDS) {
      void beginCrossfade();
    }
  }, [beginCrossfade, crossfading, holdingLastFrame]);

  return (
    <main className={styles.experience} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <div className={styles.media} aria-hidden="true">
        <img className={styles.poster} src={assetPath(activeStory, "poster.webp")} alt="" />
        {videoEnabled && ([0, 1] as const).map((slot) => {
          const isFront = slot === frontSlot;
          const isIncoming = crossfading && slot === backSlot;
          const story = HOME_STORIES[slotStories[slot]];
          const videoClass = [
            styles.video,
            isFront ? styles.videoFront : styles.videoBack,
            crossfading && isFront ? styles.videoOutgoing : "",
            isIncoming ? styles.videoIncomingVisible : "",
          ].filter(Boolean).join(" ");

          return (
            <video
              key={`slot-${slot}`}
              ref={videoRefs[slot]}
              className={videoClass}
              src={assetPath(story, "mp4")}
              poster={assetPath(story, "poster.webp")}
              autoPlay={isFront}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              onCanPlay={() => {
                if (slot === backSlot && holdingLastFrame) void beginCrossfade(true);
              }}
              onLoadedData={() => {
                if (slot === backSlot && holdingLastFrame) void beginCrossfade(true);
              }}
              onTimeUpdate={(event) => {
                if (slot === frontSlot) handleCurrentTimeUpdate(event.currentTarget);
              }}
              onEnded={() => {
                if (slot !== frontSlot || crossfading) return;
                freezeCurrentFrame();
                void beginCrossfade(true);
              }}
              onError={() => {
                if (slot === frontSlot) setVideoEnabled(false);
                else {
                  nextVideoFailedRef.current = true;
                  if (crossfading) {
                    clearTransitionTimers();
                    const currentVideo = videoRefs[frontSlot].current;
                    if (currentVideo) void currentVideo.play().catch(() => undefined);
                    setCrossfading(false);
                    transitioningRef.current = false;
                  }
                }
              }}
            />
          );
        })}
        <span className={`${styles.crossfadeVeil} ${crossfading ? styles.crossfadeVeilVisible : ""}`} />
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
      <PublicProductNavigation active="home" overMedia />
      <p className={styles.srOnly} aria-live="polite">正在展示：{activeStory.label}</p>
    </main>
  );
}
