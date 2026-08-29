"use client";

import { type CSSProperties, type RefObject, useCallback, useEffect, useRef, useState } from "react";

import styles from "./GuestExperience.module.css";

export type HomeStory = {
  slug: string;
  label: string;
  desktopPosition: string;
  mobilePosition: string;
};

/** Public, synthetic-only artwork. No Owner data is used by this surface. */
export const HOME_STORIES: readonly HomeStory[] = [
  { slug: "elderly-woman", label: "窗边的母亲", desktopPosition: "68% 50%", mobilePosition: "68% 48%" },
  { slug: "elderly-man", label: "安静的父亲", desktopPosition: "61% 50%", mobilePosition: "62% 48%" },
  { slug: "child-drawing", label: "窗边写字的孩子", desktopPosition: "58% 50%", mobilePosition: "58% 48%" },
  { slug: "young-woman", label: "熟悉的伴侣", desktopPosition: "60% 50%", mobilePosition: "60% 48%" },
  { slug: "younger-man", label: "记忆里的家人或朋友", desktopPosition: "67% 50%", mobilePosition: "67% 48%" },
];

const FADE_OUT_MS = 340;
const FADE_IN_MS = 440;
const PREPARE_WINDOW_MS = 2_000;
const PREPARE_TIMEOUT_MS = 8_000;
const END_WINDOW_SECONDS = 0.82;
const VISIBLE_OPACITY = 0.92;
const VEIL_OPACITY = 0.4;

type VideoSlot = 0 | 1;
type CarouselPhase = "idle" | "preparing" | "fading-out" | "fading-in" | "settling";
type VideoFrameCapable = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: unknown) => number) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type HomeCarouselProps = {
  reducedMotion: boolean;
  onActiveStoryChange: (story: HomeStory) => void;
};

function otherSlot(slot: VideoSlot): VideoSlot {
  return slot === 0 ? 1 : 0;
}

function assetPath(story: HomeStory, extension: "mp4" | "poster.webp") {
  return `/home-hero-assets/${story.slug}.${extension}`;
}

function shouldUseStaticHero() {
  const hints = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return hints.connection?.saveData === true
    || (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2)
    || navigator.hardwareConcurrency <= 2;
}

function focalStyle(story: HomeStory): CSSProperties {
  return {
    "--story-desktop-position": story.desktopPosition,
    "--story-mobile-position": story.mobilePosition,
  } as CSSProperties;
}

function waitForCurrentData(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer: number | undefined;
    let settled = false;
    const clean = () => {
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("canplay", ready);
      signal.removeEventListener("abort", aborted);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clean();
      resolve();
    };
    const aborted = () => {
      if (settled) return;
      settled = true;
      clean();
      reject(new DOMException("Carousel preparation cancelled", "AbortError"));
    };
    const ready = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
    };

    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    video.addEventListener("loadeddata", ready);
    video.addEventListener("canplay", ready);
    timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      clean();
      reject(new Error("Carousel next video was not ready"));
    }, PREPARE_TIMEOUT_MS);
    ready();
  });
}

function seek(video: HTMLVideoElement, time: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer: number | undefined;
    let settled = false;
    const clean = () => {
      video.removeEventListener("seeked", done);
      signal.removeEventListener("abort", aborted);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      clean();
      resolve();
    };
    const aborted = () => {
      if (settled) return;
      settled = true;
      clean();
      reject(new DOMException("Carousel seek cancelled", "AbortError"));
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    video.addEventListener("seeked", done, { once: true });
    timer = window.setTimeout(done, 700);
    video.currentTime = time;
    if (Math.abs(video.currentTime - time) < 0.01) window.requestAnimationFrame(done);
  });
}

function waitForDecodedFrame(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const frameVideo = video as VideoFrameCapable;
    let frameHandle: number | undefined;
    let timer: number | undefined;
    let settled = false;
    const clean = () => {
      signal.removeEventListener("abort", aborted);
      if (frameHandle !== undefined) frameVideo.cancelVideoFrameCallback?.(frameHandle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      clean();
      resolve();
    };
    const aborted = () => {
      if (settled) return;
      settled = true;
      clean();
      reject(new DOMException("Carousel frame decoding cancelled", "AbortError"));
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    if (frameVideo.requestVideoFrameCallback) {
      frameHandle = frameVideo.requestVideoFrameCallback(() => done());
    } else {
      // The fallback is deliberately not a guessed timer: loaded data plus a
      // completed seek establishes a decoded frame for browsers without rVFC.
      window.requestAnimationFrame(() => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime >= 0.04) done();
      });
    }
    timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      clean();
      reject(new Error("Carousel next video did not decode a frame"));
    }, 1_200);
  });
}

function waitForOpacity(video: HTMLVideoElement, targetOpacity: number, signal: AbortSignal, duration: number) {
  return new Promise<void>((resolve, reject) => {
    let timer: number | undefined;
    let settled = false;
    const clean = () => {
      video.removeEventListener("transitionend", ended);
      signal.removeEventListener("abort", aborted);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      clean();
      resolve();
    };
    const aborted = () => {
      if (settled) return;
      settled = true;
      clean();
      reject(new DOMException("Carousel opacity transition cancelled", "AbortError"));
    };
    const ended = (event: TransitionEvent) => {
      if (event.target !== video || event.propertyName !== "opacity") return;
      done();
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    video.addEventListener("transitionend", ended);
    // The timeout is a guarded browser fallback; it is only accepted once the
    // actual computed value has reached the requested opacity.
    timer = window.setTimeout(() => {
      const computed = Number.parseFloat(window.getComputedStyle(video).opacity);
      if (Math.abs(computed - targetOpacity) <= 0.02) done();
      else aborted();
    }, duration + 220);
  });
}

/**
 * The homepage keeps exactly two physical videos: the visible person and the
 * fully paused, decoded next person. The controller never replaces the
 * outgoing source while either fade is active.
 */
export function HomeCarousel({ reducedMotion, onActiveStoryChange }: HomeCarouselProps) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [slotStories, setSlotStories] = useState<[number, number]>([0, 1]);
  const [visibleSlot, setVisibleSlot] = useState<VideoSlot>(0);
  const [posterStoryIndex, setPosterStoryIndex] = useState(0);
  const [phase, setPhase] = useState<CarouselPhase>("idle");
  const [opacity, setOpacity] = useState<[number, number]>([VISIBLE_OPACITY, 0]);
  const [veilOpacity, setVeilOpacity] = useState(0);
  const [nextReady, setNextReady] = useState(false);
  const firstVideoRef = useRef<HTMLVideoElement>(null);
  const secondVideoRef = useRef<HTMLVideoElement>(null);
  const veilRef = useRef<HTMLSpanElement>(null);
  const videoRefs = useRef<[RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>]>([firstVideoRef, secondVideoRef]);
  const slotStoriesRef = useRef<[number, number]>([0, 1]);
  const visibleSlotRef = useRef<VideoSlot>(0);
  const phaseRef = useRef<CarouselPhase>("idle");
  const opacityRef = useRef<[number, number]>([VISIBLE_OPACITY, 0]);
  const preparedRef = useRef<{ slot: VideoSlot; storyIndex: number; run: number } | null>(null);
  const warmAbortRef = useRef<AbortController | null>(null);
  const transitionAbortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const mountedRef = useRef(true);

  const setPhaseSafe = useCallback((next: CarouselPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const setOpacityForSlot = useCallback((slot: VideoSlot, value: number) => {
    const next = [...opacityRef.current] as [number, number];
    next[slot] = value;
    opacityRef.current = next;
    const video = videoRefs.current[slot].current;
    if (video) video.style.opacity = String(value);
    if (mountedRef.current) setOpacity(next);
  }, []);

  const setVeil = useCallback((value: number) => {
    if (veilRef.current) veilRef.current.style.opacity = String(value);
    if (mountedRef.current) setVeilOpacity(value);
  }, []);

  const cancelWarm = useCallback(() => {
    warmAbortRef.current?.abort();
    warmAbortRef.current = null;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const assignSource = useCallback((slot: VideoSlot, storyIndex: number) => {
    const story = HOME_STORIES[storyIndex];
    const video = videoRefs.current[slot].current;
    const nextStories = [...slotStoriesRef.current] as [number, number];
    nextStories[slot] = storyIndex;
    slotStoriesRef.current = nextStories;
    if (mountedRef.current) setSlotStories(nextStories);
    if (!video) return;
    video.pause();
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;
    video.src = assetPath(story, "mp4");
    video.poster = assetPath(story, "poster.webp");
    video.load();
  }, []);

  const warmSlot = useCallback(async (slot: VideoSlot, storyIndex: number) => {
    if (!videoEnabled || phaseRef.current === "fading-out" || phaseRef.current === "fading-in") return;
    const currentPrepared = preparedRef.current;
    if (currentPrepared?.slot === slot && currentPrepared.storyIndex === storyIndex) return;
    cancelWarm();
    const controller = new AbortController();
    const run = ++runRef.current;
    warmAbortRef.current = controller;
    preparedRef.current = null;
    setNextReady(false);
    setPhaseSafe("preparing");
    const video = videoRefs.current[slot].current;
    if (!video) return;

    try {
      if (slotStoriesRef.current[slot] !== storyIndex) assignSource(slot, storyIndex);
      else {
        video.pause();
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        // The server-rendered current+next tags have already asked the
        // browser to preload. Calling load() here would abort that early
        // transfer, so only create a request when there is none at all.
        if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
      }
      await waitForCurrentData(video, controller.signal);
      if (controller.signal.aborted || run !== runRef.current) return;
      await seek(video, 0.05, controller.signal);
      await video.play();
      await waitForDecodedFrame(video, controller.signal);
      video.pause();
      await seek(video, 0, controller.signal);
      if (controller.signal.aborted || run !== runRef.current) return;
      preparedRef.current = { slot, storyIndex, run };
      if (mountedRef.current) setNextReady(true);
      setPhaseSafe("idle");
    } catch {
      if (controller.signal.aborted || run !== runRef.current) return;
      preparedRef.current = null;
      if (mountedRef.current) setNextReady(false);
      setPhaseSafe("idle");
      // A slow next asset never freezes the visible person. Retry preparation
      // in the background; the visible video stays looping until it is ready.
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void warmSlot(slot, storyIndex);
      }, 900);
    } finally {
      if (warmAbortRef.current === controller) warmAbortRef.current = null;
    }
  }, [assignSource, cancelWarm, setPhaseSafe, videoEnabled]);

  const warmFollowingStory = useCallback(() => {
    const current = visibleSlotRef.current;
    const hidden = otherSlot(current);
    const followingIndex = (slotStoriesRef.current[current] + 1) % HOME_STORIES.length;
    void warmSlot(hidden, followingIndex);
  }, [warmSlot]);

  const startTransition = useCallback(async () => {
    if (!videoEnabled || phaseRef.current !== "idle") return;
    const outgoing = visibleSlotRef.current;
    const incoming = otherSlot(outgoing);
    const incomingStoryIndex = slotStoriesRef.current[incoming];
    const prepared = preparedRef.current;
    const outgoingVideo = videoRefs.current[outgoing].current;
    const incomingVideo = videoRefs.current[incoming].current;
    if (!outgoingVideo || !incomingVideo || prepared?.slot !== incoming || prepared.storyIndex !== incomingStoryIndex) {
      warmFollowingStory();
      return;
    }
    if (incomingVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || incomingVideo.currentTime >= 0.2) {
      preparedRef.current = null;
      if (mountedRef.current) setNextReady(false);
      warmFollowingStory();
      return;
    }

    const controller = new AbortController();
    transitionAbortRef.current?.abort();
    transitionAbortRef.current = controller;
    const run = ++runRef.current;
    cancelWarm();
    preparedRef.current = null;
    if (mountedRef.current) setNextReady(false);
    setPhaseSafe("fading-out");
    outgoingVideo.loop = false;
    window.requestAnimationFrame(() => {
      if (!controller.signal.aborted && run === runRef.current) {
        setOpacityForSlot(outgoing, 0);
        setVeil(VEIL_OPACITY);
      }
    });

    try {
      await waitForOpacity(outgoingVideo, 0, controller.signal, FADE_OUT_MS);
      if (controller.signal.aborted || run !== runRef.current) return;

      // Only after the outgoing layer is fully transparent may the incoming
      // person start. This prevents a Safari double-face dissolve.
      visibleSlotRef.current = incoming;
      if (mountedRef.current) {
        setVisibleSlot(incoming);
        setPosterStoryIndex(incomingStoryIndex);
      }
      onActiveStoryChange(HOME_STORIES[incomingStoryIndex]);
      incomingVideo.currentTime = 0;
      incomingVideo.loop = true;
      await incomingVideo.play();
      if (controller.signal.aborted || run !== runRef.current) return;
      setPhaseSafe("fading-in");
      window.requestAnimationFrame(() => {
        if (!controller.signal.aborted && run === runRef.current) {
          setOpacityForSlot(incoming, VISIBLE_OPACITY);
          setVeil(0);
        }
      });
      await waitForOpacity(incomingVideo, VISIBLE_OPACITY, controller.signal, FADE_IN_MS);
      if (controller.signal.aborted || run !== runRef.current) return;

      // This is deliberately after both transitionend boundaries. The old
      // layer has remained source-stable through the entire visual handoff.
      setPhaseSafe("settling");
      const followingIndex = (incomingStoryIndex + 1) % HOME_STORIES.length;
      assignSource(outgoing, followingIndex);
      setOpacityForSlot(outgoing, 0);
      setPhaseSafe("idle");
      void warmSlot(outgoing, followingIndex);
    } catch {
      if (controller.signal.aborted || run !== runRef.current) return;
      // Preserve the visible person instead of holding a failed handoff frame.
      setOpacityForSlot(outgoing, VISIBLE_OPACITY);
      setOpacityForSlot(incoming, 0);
      setVeil(0);
      outgoingVideo.loop = true;
      void outgoingVideo.play().catch(() => undefined);
      setPhaseSafe("idle");
      warmFollowingStory();
    } finally {
      if (transitionAbortRef.current === controller) transitionAbortRef.current = null;
    }
  }, [assignSource, cancelWarm, onActiveStoryChange, setOpacityForSlot, setPhaseSafe, setVeil, videoEnabled, warmFollowingStory, warmSlot]);

  const onTimeUpdate = useCallback((slot: VideoSlot, video: HTMLVideoElement) => {
    if (slot !== visibleSlotRef.current || phaseRef.current !== "idle") return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime <= END_WINDOW_SECONDS) void startTransition();
  }, [startTransition]);

  useEffect(() => {
    const enabled = !reducedMotion && !shouldUseStaticHero();
    setVideoEnabled(enabled);
  }, [reducedMotion]);

  useEffect(() => {
    if (!videoEnabled) return;
    const startFrame = window.requestAnimationFrame(() => {
      const first = videoRefs.current[0].current;
      if (!first) return;
      first.muted = true;
      first.playsInline = true;
      first.preload = "auto";
      first.loop = true;
      void first.play().catch(() => undefined);
      // First playback and next-video preheat begin together, not at the end.
      void warmSlot(1, 1);
    });
    return () => window.cancelAnimationFrame(startFrame);
  }, [videoEnabled, warmSlot]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelWarm();
        transitionAbortRef.current?.abort();
        videoRefs.current[0].current?.pause();
        videoRefs.current[1].current?.pause();
        return;
      }
      const visible = visibleSlotRef.current;
      const hidden = otherSlot(visible);
      setOpacityForSlot(visible, VISIBLE_OPACITY);
      setOpacityForSlot(hidden, 0);
      setVeil(0);
      setPhaseSafe("idle");
      const current = videoRefs.current[visible].current;
      if (current && videoEnabled) {
        current.loop = true;
        void current.play().catch(() => undefined);
        warmFollowingStory();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelWarm, setOpacityForSlot, setPhaseSafe, setVeil, videoEnabled, warmFollowingStory]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelWarm();
      transitionAbortRef.current?.abort();
    };
  }, [cancelWarm]);

  const posterStory = HOME_STORIES[posterStoryIndex];
  return (
    <div
      className={styles.media}
      aria-hidden="true"
      data-home-carousel="true"
      data-carousel-phase={phase}
      data-carousel-visible-index={slotStories[visibleSlot] + 1}
      data-carousel-next-ready={nextReady ? "true" : "false"}
      data-carousel-prewarm-window-ms={PREPARE_WINDOW_MS}
      data-video-enabled={videoEnabled ? "true" : "false"}
    >
      <img className={styles.poster} style={focalStyle(posterStory)} src={assetPath(posterStory, "poster.webp")} alt="" />
      {([0, 1] as const).map((slot) => {
        const story = HOME_STORIES[slotStories[slot]];
        return (
          <video
            key={`home-carousel-slot-${slot}`}
            ref={videoRefs.current[slot]}
            className={styles.video}
            style={{
              ...focalStyle(story),
              opacity: videoEnabled ? opacity[slot] : 0,
              transitionDuration: `${phase === "fading-in" && slot === visibleSlot ? FADE_IN_MS : FADE_OUT_MS}ms`,
            }}
            data-carousel-slot={slot}
            data-carousel-story={story.slug}
            data-carousel-layer={slot === visibleSlot ? "visible" : "hidden"}
            src={assetPath(story, "mp4")}
            poster={assetPath(story, "poster.webp")}
            autoPlay={slot === 0 && videoEnabled}
            loop={slot === visibleSlot && videoEnabled}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            onTimeUpdate={(event) => onTimeUpdate(slot, event.currentTarget)}
            onError={() => {
              if (slot === visibleSlotRef.current) setVideoEnabled(false);
              else {
                preparedRef.current = null;
                if (mountedRef.current) setNextReady(false);
              }
            }}
          />
        );
      })}
      <span ref={veilRef} className={styles.crossfadeVeil} style={{ opacity: veilOpacity, transitionDuration: `${phase === "fading-in" ? FADE_IN_MS : FADE_OUT_MS}ms` }} />
      <span className={styles.mediaVeil} />
    </div>
  );
}

