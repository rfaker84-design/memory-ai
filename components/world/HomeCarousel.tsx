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

const DISSOLVE_MS = 1_000;
const HANDOFF_LEAD_SECONDS = 1.05;
const HOME_ASSET_VERSION = "home-v2";

type Layer = "a" | "b";
type LayerStories = Record<Layer, number>;

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

/**
 * This deliberately keeps the pre-interaction-video homepage dissolve small:
 * two fixed media elements, one current film and one paused next film. A layer
 * is never remounted while it is becoming visible, so its first frame flows
 * straight into playback instead of restarting at the end of the dissolve.
 */
export function HomeCarousel({ reducedMotion, playbackActive, onActiveStoryChange }: HomeCarouselProps) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [activeLayer, setActiveLayer] = useState<Layer>("a");
  const [layerStories, setLayerStories] = useState<LayerStories>({ a: 0, b: 1 });
  const [nextReady, setNextReady] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const handoffRef = useRef(false);

  const nextLayer = otherLayer(activeLayer);
  const activeIndex = layerStories[activeLayer];
  const nextIndex = layerStories[nextLayer];
  const activeStory = HOME_STORIES[activeIndex];

  const videoForLayer = useCallback((layer: Layer) => (
    layer === "a" ? videoARef.current : videoBRef.current
  ), []);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Start the opening film and immediately prepare the second one. This runs
  // while the brand launch is still above the page, not at the last second.
  useEffect(() => {
    if (!videoEnabled) return;
    const current = videoForLayer(activeLayer);
    if (!current) return;
    current.muted = true;
    current.playsInline = true;
    current.loop = true;
    current.preload = "auto";
    if (!playbackActive) {
      current.pause();
      current.currentTime = 0;
      current.load();
      return;
    }
    void current.play().catch(() => undefined);
  }, [activeLayer, playbackActive, videoEnabled, videoForLayer]);

  // The hidden layer must stay at frame zero. `loadeddata` is enough for an
  // opening frame; waiting for a fully buffered film is unnecessary and slow
  // on mobile Safari.
  useEffect(() => {
    if (!videoEnabled) return;
    const next = videoForLayer(nextLayer);
    if (!next) return;

    let cancelled = false;
    const markReady = () => {
      if (cancelled || next.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      next.pause();
      next.currentTime = 0;
      setNextReady(true);
      next.removeEventListener("loadeddata", markReady);
      next.removeEventListener("canplay", markReady);
    };

    setNextReady(false);
    next.pause();
    next.currentTime = 0;
    next.muted = true;
    next.playsInline = true;
    next.loop = true;
    next.preload = "auto";
    next.addEventListener("loadeddata", markReady);
    next.addEventListener("canplay", markReady);
    next.load();
    markReady();

    return () => {
      cancelled = true;
      next.removeEventListener("loadeddata", markReady);
      next.removeEventListener("canplay", markReady);
    };
  }, [nextIndex, nextLayer, videoEnabled, videoForLayer]);

  const finishDissolve = useCallback(() => {
    if (!mountedRef.current || !handoffRef.current) return;
    const previousLayer = activeLayer;
    const promotedLayer = otherLayer(previousLayer);
    const previousVideo = videoForLayer(previousLayer);

    previousVideo?.pause();
    if (previousVideo) previousVideo.currentTime = 0;

    // The already-playing next layer becomes current before the hidden old
    // layer receives the following film. The visible film is never rebuilt.
    setActiveLayer(promotedLayer);
    setLayerStories((current) => ({
      ...current,
      [previousLayer]: (nextIndex + 1) % HOME_STORIES.length,
    }));
    setNextReady(false);
    setDissolving(false);
    handoffRef.current = false;
    onActiveStoryChange(HOME_STORIES[nextIndex]);
  }, [activeLayer, nextIndex, onActiveStoryChange, videoForLayer]);

  const beginDissolve = useCallback(async () => {
    if (!videoEnabled || !nextReady || dissolving || handoffRef.current) return;
    const next = videoForLayer(nextLayer);
    if (!next || next.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    handoffRef.current = true;
    next.pause();
    next.currentTime = 0;
    try {
      await next.play();
    } catch {
      next.pause();
      next.currentTime = 0;
      setNextReady(false);
      handoffRef.current = false;
      return;
    }
    if (!mountedRef.current) return;

    if (reducedMotion) {
      finishDissolve();
      return;
    }
    setDissolving(true);
  }, [dissolving, finishDissolve, nextLayer, nextReady, reducedMotion, videoEnabled, videoForLayer]);

  const onCurrentTimeUpdate = useCallback((layer: Layer, video: HTMLVideoElement) => {
    if (!playbackActive || layer !== activeLayer || dissolving || !nextReady || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime <= HANDOFF_LEAD_SECONDS) void beginDissolve();
  }, [activeLayer, beginDissolve, dissolving, nextReady, playbackActive]);

  const videoClassName = (layer: Layer) => {
    const current = layer === activeLayer;
    return [
      styles.video,
      !current ? styles.videoIncoming : "",
      dissolving && current ? styles.videoOutgoing : "",
      dissolving && !current ? styles.videoIncomingVisible : "",
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
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      onTimeUpdate={(event) => onCurrentTimeUpdate(layer, event.currentTarget)}
      onTransitionEnd={(event) => {
        if (layer === nextLayer && event.propertyName === "opacity" && dissolving) finishDissolve();
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
      data-carousel-dissolving={dissolving ? "true" : "false"}
      data-video-enabled={videoEnabled ? "true" : "false"}
      data-dissolve-duration-ms={DISSOLVE_MS}
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
      {videoEnabled && renderVideo("a", HOME_STORIES[layerStories.a])}
      {videoEnabled && renderVideo("b", HOME_STORIES[layerStories.b])}
      <span className={styles.mediaVeil} />
    </div>
  );
}
