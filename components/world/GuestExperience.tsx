"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "../../src/motion";
import { PublicProductNavigation } from "./PublicProductNavigation";
import styles from "./GuestExperience.module.css";

type HomeStory = { slug: string; label: string };

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
const PLAYBACK_PROGRESS_TIMEOUT_MS = 1_200;
const DISCLOSURE = "AI生成示例 · 使用虚构示例资料 · 不代表真实人物或其真实表达";

type PerformanceNavigator = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
type VideoSlot = 0 | 1;
type CarouselPhase = "idle" | "preparing" | "crossfading" | "settling";
type PreparedSlot = { slot: VideoSlot; storyIndex: number; operation: number };
type VideoFrameCapable = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
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

function otherSlot(slot: VideoSlot): VideoSlot { return slot === 0 ? 1 : 0; }

function waitForDecodedFirstFrame(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let frameHandle: number | undefined;
    let settled = false;
    const frameVideo = video as VideoFrameCapable;
    const cleanup = () => {
      video.removeEventListener("loadeddata", confirm);
      video.removeEventListener("canplay", confirm);
      signal.removeEventListener("abort", abort);
      if (frameHandle !== undefined) frameVideo.cancelVideoFrameCallback?.(frameHandle);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Carousel preparation cancelled", "AbortError"));
    };
    const confirm = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      // `loadeddata` is the compatibility fallback. Where the browser offers
      // video frame callbacks, a decoded frame is required before preparing.
      if (!frameVideo.requestVideoFrameCallback) {
        if (Number.isFinite(video.currentTime)) finish();
        return;
      }
      if (frameHandle !== undefined) frameVideo.cancelVideoFrameCallback?.(frameHandle);
      frameHandle = frameVideo.requestVideoFrameCallback(() => finish());
    };

    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    video.addEventListener("loadeddata", confirm);
    video.addEventListener("canplay", confirm);
    confirm();
  });
}

function waitForPlaybackProgress(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const startTime = video.currentTime;
    let frameId: number | undefined;
    let timeoutId: number | undefined;
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("timeupdate", confirm);
      signal.removeEventListener("abort", abort);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Carousel playback cancelled", "AbortError"));
    };
    const stalled = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Hidden carousel video did not advance"));
    };
    const confirm = () => {
      if (!video.paused && video.currentTime > startTime + 0.02) { finish(); return; }
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(confirm);
    };

    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    video.addEventListener("timeupdate", confirm);
    timeoutId = window.setTimeout(stalled, PLAYBACK_PROGRESS_TIMEOUT_MS);
    confirm();
  });
}

type GuestExperienceProps = { onLogin: () => void; onStart: () => void; showLogin?: boolean };

/**
 * The approved public homepage: five separate synthetic people, one at a
 * time. A slot is never recycled during a dissolve. Its lifecycle is fixed:
 * idle -> preparing -> crossfading -> settling -> idle.
 */
export function GuestExperience({ onLogin, onStart, showLogin = true }: GuestExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [frontSlot, setFrontSlot] = useState<VideoSlot>(0);
  const [slotStories, setSlotStories] = useState<[number, number]>([0, 1]);
  const [phase, setPhase] = useState<CarouselPhase>("idle");
  const firstVideoRef = useRef<HTMLVideoElement>(null);
  const secondVideoRef = useRef<HTMLVideoElement>(null);
  const frontSlotRef = useRef<VideoSlot>(0);
  const slotStoriesRef = useRef<[number, number]>([0, 1]);
  const phaseRef = useRef<CarouselPhase>("idle");
  const preparedRef = useRef<PreparedSlot | null>(null);
  const operationRef = useRef(0);
  const transitionRef = useRef<{ operation: number; incoming: VideoSlot } | null>(null);
  const preparationAbortRef = useRef<AbortController | null>(null);
  const settleFrameRef = useRef<number | null>(null);

  const videoRefs = useMemo(() => [firstVideoRef, secondVideoRef] as const, []);
  const activeStory = HOME_STORIES[slotStories[frontSlot]];
  const backSlot = otherSlot(frontSlot);
  const crossfading = phase === "crossfading";

  const setCarouselPhase = useCallback((nextPhase: CarouselPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const cancelPendingWork = useCallback(() => {
    operationRef.current += 1;
    preparationAbortRef.current?.abort();
    preparationAbortRef.current = null;
    if (settleFrameRef.current !== null) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
  }, []);

  const setSlotStoryAfterSettling = useCallback((slot: VideoSlot, storyIndex: number) => {
    const story = HOME_STORIES[storyIndex];
    const video = videoRefs[slot].current;
    const nextStories = [...slotStoriesRef.current] as [number, number];
    nextStories[slot] = storyIndex;
    slotStoriesRef.current = nextStories;
    setSlotStories(nextStories);

    // This only runs from the post-transition settling frame. It therefore
    // cannot replace pixels while the outgoing layer is still visible.
    if (video) {
      video.pause();
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.loop = false;
      video.src = assetPath(story, "mp4");
      video.poster = assetPath(story, "poster.webp");
      video.currentTime = 0;
      video.load();
    }
  }, [videoRefs]);

  const prepareSlot = useCallback(async (slot: VideoSlot, storyIndex: number) => {
    cancelPendingWork();
    const operation = operationRef.current;
    const controller = new AbortController();
    preparationAbortRef.current = controller;
    preparedRef.current = null;
    setCarouselPhase("preparing");
    const video = videoRefs[slot].current;
    if (!video) { setCarouselPhase("idle"); return; }

    try {
      const story = HOME_STORIES[storyIndex];
      const expectedSource = assetPath(story, "mp4");
      if (video.getAttribute("src") !== expectedSource) {
        setSlotStoryAfterSettling(slot, storyIndex);
      } else {
        video.pause();
        video.currentTime = 0;
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.load();
      }

      await waitForDecodedFirstFrame(video, controller.signal);
      if (operation !== operationRef.current || controller.signal.aborted) return;

      // A poster or readyState alone is insufficient. Verify that the hidden
      // element advances, then park it back at the decoded first frame.
      await video.play();
      await waitForPlaybackProgress(video, controller.signal);
      video.pause();
      video.currentTime = 0;
      await waitForDecodedFirstFrame(video, controller.signal);
      if (operation !== operationRef.current || controller.signal.aborted) return;

      preparedRef.current = { slot, storyIndex, operation };
      setCarouselPhase("idle");
    } catch {
      if (operation !== operationRef.current || controller.signal.aborted) return;
      preparedRef.current = null;
      setCarouselPhase("idle");
    } finally {
      if (preparationAbortRef.current === controller) preparationAbortRef.current = null;
    }
  }, [cancelPendingWork, setCarouselPhase, setSlotStoryAfterSettling, videoRefs]);

  const prepareNextStory = useCallback(() => {
    if (!videoEnabled || phaseRef.current !== "idle") return;
    const currentSlot = frontSlotRef.current;
    const hiddenSlot = otherSlot(currentSlot);
    const nextStoryIndex = (slotStoriesRef.current[currentSlot] + 1) % HOME_STORIES.length;
    const prepared = preparedRef.current;
    if (prepared?.slot === hiddenSlot && prepared.storyIndex === nextStoryIndex) return;
    void prepareSlot(hiddenSlot, nextStoryIndex);
  }, [prepareSlot, videoEnabled]);

  const settleCrossfade = useCallback((operation: number, outgoing: VideoSlot, incoming: VideoSlot) => {
    if (operation !== operationRef.current || phaseRef.current !== "crossfading") return;
    setCarouselPhase("settling");
    transitionRef.current = null;
    frontSlotRef.current = incoming;
    setFrontSlot(incoming);
    preparedRef.current = null;

    // React first commits the new visible slot. Only the following frame
    // recycles the fully invisible old slot with the next-next source.
    settleFrameRef.current = window.requestAnimationFrame(() => {
      settleFrameRef.current = null;
      if (operation !== operationRef.current || phaseRef.current !== "settling") return;
      const followingStoryIndex = (slotStoriesRef.current[incoming] + 1) % HOME_STORIES.length;
      setSlotStoryAfterSettling(outgoing, followingStoryIndex);
      void prepareSlot(outgoing, followingStoryIndex);
    });
  }, [prepareSlot, setCarouselPhase, setSlotStoryAfterSettling]);

  const beginCrossfade = useCallback(async () => {
    if (!videoEnabled || phaseRef.current !== "idle") return;
    const outgoing = frontSlotRef.current;
    const incoming = otherSlot(outgoing);
    const incomingStoryIndex = slotStoriesRef.current[incoming];
    const prepared = preparedRef.current;
    if (prepared?.slot !== incoming || prepared.storyIndex !== incomingStoryIndex) {
      prepareNextStory();
      return;
    }

    const nextVideo = videoRefs[incoming].current;
    if (!nextVideo || nextVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      preparedRef.current = null;
      prepareNextStory();
      return;
    }

    setCarouselPhase("preparing");
    const operation = operationRef.current;
    const controller = new AbortController();
    preparationAbortRef.current = controller;
    try {
      nextVideo.currentTime = 0;
      await nextVideo.play();
      await waitForPlaybackProgress(nextVideo, controller.signal);
      if (operation !== operationRef.current || controller.signal.aborted) return;

      // The outgoing element is neither paused nor reassigned here. If the
      // hidden stream misses an end window, the visible video simply loops.
      transitionRef.current = { operation, incoming };
      setCarouselPhase("crossfading");
    } catch {
      if (operation !== operationRef.current || controller.signal.aborted) return;
      nextVideo.pause();
      nextVideo.currentTime = 0;
      preparedRef.current = null;
      setCarouselPhase("idle");
      prepareNextStory();
    } finally {
      if (preparationAbortRef.current === controller) preparationAbortRef.current = null;
    }
  }, [prepareNextStory, setCarouselPhase, videoEnabled, videoRefs]);

  const handleCurrentTimeUpdate = useCallback((slot: VideoSlot, video: HTMLVideoElement) => {
    if (slot !== frontSlotRef.current || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime > TRANSITION_START_REMAINING_SECONDS) return;
    if (phaseRef.current === "idle") void beginCrossfade();
  }, [beginCrossfade]);

  const handleTransitionEnd = useCallback((slot: VideoSlot, event: React.TransitionEvent<HTMLVideoElement>) => {
    if (event.propertyName !== "opacity" || phaseRef.current !== "crossfading") return;
    const transition = transitionRef.current;
    if (!transition || transition.incoming !== slot || event.currentTarget !== videoRefs[slot].current) return;
    settleCrossfade(transition.operation, otherSlot(slot), slot);
  }, [settleCrossfade, videoRefs]);

  const suspendForHiddenDocument = useCallback(() => {
    cancelPendingWork();
    videoRefs[0].current?.pause();
    videoRefs[1].current?.pause();
    transitionRef.current = null;
    preparedRef.current = null;
    setCarouselPhase("idle");
  }, [cancelPendingWork, setCarouselPhase, videoRefs]);

  useEffect(() => { setVideoEnabled(!reducedMotion && !shouldUseStaticHero()); }, [reducedMotion]);

  useEffect(() => {
    if (!videoEnabled) return;
    const frame = window.requestAnimationFrame(prepareNextStory);
    return () => window.cancelAnimationFrame(frame);
  }, [prepareNextStory, videoEnabled]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) { suspendForHiddenDocument(); return; }
      const currentVideo = videoRefs[frontSlotRef.current].current;
      if (!videoEnabled || !currentVideo) return;
      void currentVideo.play().catch(() => undefined);
      prepareNextStory();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [prepareNextStory, suspendForHiddenDocument, videoEnabled, videoRefs]);

  useEffect(() => () => cancelPendingWork(), [cancelPendingWork]);

  return (
    <main
      className={styles.experience}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-carousel-phase={phase}
      style={{ "--home-transition-duration": `${CROSSFADE_MS}ms` } as CSSProperties}
    >
      <div className={styles.media} aria-hidden="true">
        <img className={styles.poster} src={assetPath(activeStory, "poster.webp")} alt="" />
        {videoEnabled && ([0, 1] as const).map((slot) => {
          const isFront = slot === frontSlot;
          const isIncoming = crossfading && slot === backSlot;
          const story = HOME_STORIES[slotStories[slot]];
          const videoClass = [styles.video, isFront ? styles.videoFront : styles.videoBack, crossfading && isFront ? styles.videoOutgoing : "", isIncoming ? styles.videoIncomingVisible : ""].filter(Boolean).join(" ");
          return (
            <video key={`slot-${slot}`} ref={videoRefs[slot]} className={videoClass}
              data-carousel-slot={slot} data-carousel-story={story.slug}
              src={assetPath(story, "mp4")} poster={assetPath(story, "poster.webp")}
              autoPlay={isFront} loop={isFront} muted playsInline preload="auto" disablePictureInPicture
              onTimeUpdate={(event) => handleCurrentTimeUpdate(slot, event.currentTarget)}
              onTransitionEnd={(event) => handleTransitionEnd(slot, event)}
              onError={() => {
                if (slot === frontSlotRef.current) setVideoEnabled(false);
                else {
                  preparedRef.current = null;
                  if (phaseRef.current === "crossfading") {
                    cancelPendingWork();
                    transitionRef.current = null;
                    setCarouselPhase("idle");
                    void videoRefs[frontSlotRef.current].current?.play().catch(() => undefined);
                  } else {
                    setCarouselPhase("idle");
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
