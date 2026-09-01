"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

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

const FADE_MS = 450;
const HANDOFF_LEAD_SECONDS = 0.85;
const MINIMUM_PREBUFFER_SECONDS = 4;
const HOME_ASSET_VERSION = "home-v2";

type Layer = "a" | "b";
type LayerStories = Record<Layer, number>;
type TransitionPhase = "steady" | "fade-out" | "waiting" | "fade-in";

type HomeCarouselProps = {
  reducedMotion: boolean;
  playbackActive: boolean;
  onActiveStoryChange: (story: HomeStory) => void;
};

function assetPath(story: HomeStory, extension: "mp4" | "poster.webp") {
  return `/home-hero-assets/${story.slug}.${HOME_ASSET_VERSION}.${extension}`;
}

function otherLayer(layer: Layer): Layer {
  return layer === "a" ? "b" : "a";
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

function isReadyForHandoff(video: HTMLVideoElement) {
  if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
  if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

  const requiredEnd = Math.min(MINIMUM_PREBUFFER_SECONDS, Math.max(0, video.duration - 0.15));
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (video.buffered.start(index) <= 0.05 && video.buffered.end(index) >= requiredEnd) return true;
  }
  return video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
}

/**
 * Two fixed video elements are retained for cheap preloading, but only one is
 * ever playing. The current person fades completely into a person-free warm
 * plate before the next person starts and fades in. Videos never loop.
 */
export function HomeCarousel({ reducedMotion, playbackActive, onActiveStoryChange }: HomeCarouselProps) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [activeLayer, setActiveLayer] = useState<Layer>("a");
  const [layerStories, setLayerStories] = useState<LayerStories>({ a: 0, b: 1 });
  const [nextReady, setNextReadyState] = useState(false);
  const [phase, setPhaseState] = useState<TransitionPhase>("steady");
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const handoffRef = useRef(false);
  const phaseRef = useRef<TransitionPhase>("steady");
  const nextReadyRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextLayer = otherLayer(activeLayer);
  const activeIndex = layerStories[activeLayer];
  const nextIndex = layerStories[nextLayer];
  const activeStory = HOME_STORIES[activeIndex];

  const videoForLayer = useCallback((layer: Layer) => (
    layer === "a" ? videoARef.current : videoBRef.current
  ), []);

  const setPhase = useCallback((value: TransitionPhase) => {
    phaseRef.current = value;
    setPhaseState(value);
  }, []);

  const setNextReady = useCallback((value: boolean) => {
    nextReadyRef.current = value;
    setNextReadyState(value);
  }, []);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTransitionTimer();
    };
  }, [clearTransitionTimer]);

  // The visible film is the only film allowed to play. It never loops.
  useEffect(() => {
    if (!videoEnabled) return;
    const current = videoForLayer(activeLayer);
    if (!current) return;
    current.muted = true;
    current.playsInline = true;
    current.loop = false;
    current.preload = "auto";

    if (!playbackActive) {
      clearTransitionTimer();
      handoffRef.current = false;
      setPhase("steady");
      current.pause();
      current.currentTime = 0;
      current.load();
      return;
    }

    if (phaseRef.current === "steady") void current.play().catch(() => undefined);
  }, [activeLayer, clearTransitionTimer, playbackActive, setPhase, videoEnabled, videoForLayer]);

  // The hidden layer may buffer its opening frame, but it remains paused at 0.
  useEffect(() => {
    if (!videoEnabled) return;
    const next = videoForLayer(nextLayer);
    if (!next) return;

    let cancelled = false;
    const markReady = () => {
      if (cancelled || !isReadyForHandoff(next)) return;
      next.pause();
      next.currentTime = 0;
      setNextReady(true);
      next.removeEventListener("loadeddata", markReady);
      next.removeEventListener("canplay", markReady);
      next.removeEventListener("canplaythrough", markReady);
      next.removeEventListener("progress", markReady);
    };

    setNextReady(false);
    next.pause();
    next.currentTime = 0;
    next.muted = true;
    next.playsInline = true;
    next.loop = false;
    next.preload = "auto";
    next.addEventListener("loadeddata", markReady);
    next.addEventListener("canplay", markReady);
    next.addEventListener("canplaythrough", markReady);
    next.addEventListener("progress", markReady);
    next.load();
    markReady();

    return () => {
      cancelled = true;
      next.removeEventListener("loadeddata", markReady);
      next.removeEventListener("canplay", markReady);
      next.removeEventListener("canplaythrough", markReady);
      next.removeEventListener("progress", markReady);
    };
  }, [nextIndex, nextLayer, setNextReady, videoEnabled, videoForLayer]);

  const finishFadeOut = useCallback(() => {
    if (!mountedRef.current || phaseRef.current !== "fade-out") return;
    clearTransitionTimer();
    const current = videoForLayer(activeLayer);
    current?.pause();
    if (current && Number.isFinite(current.duration) && current.duration > 0) {
      current.currentTime = Math.min(current.currentTime, Math.max(0, current.duration - 0.04));
    }
    setPhase("waiting");
  }, [activeLayer, clearTransitionTimer, setPhase, videoForLayer]);

  const finishFadeIn = useCallback(() => {
    if (!mountedRef.current || phaseRef.current !== "fade-in" || !handoffRef.current) return;
    clearTransitionTimer();

    const previousLayer = activeLayer;
    const promotedLayer = otherLayer(previousLayer);
    const previousVideo = videoForLayer(previousLayer);
    previousVideo?.pause();
    if (previousVideo) previousVideo.currentTime = 0;

    setActiveLayer(promotedLayer);
    setLayerStories((current) => ({
      ...current,
      [previousLayer]: (nextIndex + 1) % HOME_STORIES.length,
    }));
    setNextReady(false);
    setPhase("steady");
    handoffRef.current = false;
    onActiveStoryChange(HOME_STORIES[nextIndex]);
  }, [activeLayer, clearTransitionTimer, nextIndex, onActiveStoryChange, setNextReady, setPhase, videoForLayer]);

  const beginFadeOut = useCallback(() => {
    if (!videoEnabled || !playbackActive || phaseRef.current !== "steady") return;
    setPhase("fade-out");
    clearTransitionTimer();
    transitionTimerRef.current = setTimeout(finishFadeOut, FADE_MS + 120);
  }, [clearTransitionTimer, finishFadeOut, playbackActive, setPhase, videoEnabled]);

  const startIncoming = useCallback(async () => {
    if (!mountedRef.current || phaseRef.current !== "waiting" || handoffRef.current || !nextReadyRef.current) return;
    const next = videoForLayer(nextLayer);
    if (!next || !isReadyForHandoff(next)) return;

    handoffRef.current = true;
    next.pause();
    next.currentTime = 0;
    try {
      await next.play();
    } catch {
      handoffRef.current = false;
      setNextReady(false);
      next.pause();
      next.currentTime = 0;
      next.load();
      return;
    }
    if (!mountedRef.current || phaseRef.current !== "waiting") {
      next.pause();
      handoffRef.current = false;
      return;
    }

    // The outgoing film is already fully transparent and paused here.
    setPhase("fade-in");
    clearTransitionTimer();
    transitionTimerRef.current = setTimeout(finishFadeIn, FADE_MS + 120);
  }, [clearTransitionTimer, finishFadeIn, nextLayer, setNextReady, setPhase, videoForLayer]);

  useEffect(() => {
    if (phase === "waiting" && nextReady) void startIncoming();
  }, [nextReady, phase, startIncoming]);

  const onCurrentTimeUpdate = useCallback((layer: Layer, video: HTMLVideoElement) => {
    if (!playbackActive || layer !== activeLayer || phaseRef.current !== "steady" || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime <= HANDOFF_LEAD_SECONDS) beginFadeOut();
  }, [activeLayer, beginFadeOut, playbackActive]);

  const videoClassName = (layer: Layer) => {
    const current = layer === activeLayer;
    return [
      styles.video,
      current ? styles.videoCurrent : styles.videoNext,
      current && phase !== "steady" ? styles.videoOutgoing : "",
      !current && phase === "fade-in" ? styles.videoIncomingVisible : "",
    ].filter(Boolean).join(" ");
  };

  const renderVideo = (layer: Layer, story: HomeStory) => (
    <video
      ref={layer === "a" ? videoARef : videoBRef}
      className={videoClassName(layer)}
      style={focalStyle(story)}
      data-carousel-layer={layer}
      data-carousel-role={layer === activeLayer ? "current" : "next"}
      data-carousel-story={story.slug}
      src={assetPath(story, "mp4")}
      poster={assetPath(story, "poster.webp")}
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      onTimeUpdate={(event) => onCurrentTimeUpdate(layer, event.currentTarget)}
      onCanPlay={(event) => {
        if (layer === nextLayer && isReadyForHandoff(event.currentTarget)) setNextReady(true);
      }}
      onCanPlayThrough={(event) => {
        if (layer === nextLayer && isReadyForHandoff(event.currentTarget)) setNextReady(true);
      }}
      onProgress={(event) => {
        if (layer === nextLayer && isReadyForHandoff(event.currentTarget)) setNextReady(true);
      }}
      onEnded={() => {
        if (layer === activeLayer) beginFadeOut();
      }}
      onTransitionEnd={(event) => {
        if (event.propertyName !== "opacity") return;
        if (layer === activeLayer && phaseRef.current === "fade-out") finishFadeOut();
        if (layer === nextLayer && phaseRef.current === "fade-in") finishFadeIn();
      }}
      onError={() => {
        if (layer === activeLayer) setVideoEnabled(false);
        else setNextReady(false);
      }}
    />
  );

  return (
    <div
      className={styles.media}
      aria-hidden="true"
      data-home-carousel="true"
      data-carousel-visible-index={activeIndex + 1}
      data-carousel-active-layer={activeLayer}
      data-carousel-next-ready={nextReady ? "true" : "false"}
      data-carousel-phase={phase}
      data-video-enabled={videoEnabled ? "true" : "false"}
      data-fade-duration-ms={FADE_MS}
    >
      <img
        className={styles.poster}
        style={focalStyle(activeStory)}
        src={assetPath(activeStory, "poster.webp")}
        alt=""
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
      <span className={styles.transitionPlate} />
      {videoEnabled && renderVideo("a", HOME_STORIES[layerStories.a])}
      {videoEnabled && renderVideo("b", HOME_STORIES[layerStories.b])}
      <span className={styles.mediaVeil} />
    </div>
  );
}
