"use client";

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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

const CROSSFADE_MS = 1_000;
const END_WINDOW_SECONDS = 1.05;
const HOME_ASSET_VERSION = "home-v2";

type Layer = "a" | "b";
type LayerStories = Record<Layer, number>;

type HomeCarouselProps = {
  reducedMotion: boolean;
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
 * Two permanent video layers implement the approved 3ab dissolve. The incoming
 * layer is never remounted at transition completion: it carries on playing
 * continuously after becoming visible. Only the hidden, outgoing layer receives
 * the following story and remains paused at its opening frame.
 */
export function HomeCarousel({ reducedMotion, onActiveStoryChange }: HomeCarouselProps) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [activeLayer, setActiveLayer] = useState<Layer>("a");
  const [layerStories, setLayerStories] = useState<LayerStories>({ a: 0, b: 1 });
  const [incomingReady, setIncomingReady] = useState(false);
  const [crossfading, setCrossfading] = useState(false);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const transitionInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const incomingLayer = otherLayer(activeLayer);
  const activeIndex = layerStories[activeLayer];
  const incomingIndex = layerStories[incomingLayer];
  const activeStory = HOME_STORIES[activeIndex];
  const incomingStory = HOME_STORIES[incomingIndex];

  const videoForLayer = useCallback((layer: Layer) => (
    layer === "a" ? videoARef.current : videoBRef.current
  ), []);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  // The visible layer is the only normally playing layer. This effect does not
  // reset time, so an incoming film remains continuous when it becomes active.
  useLayoutEffect(() => {
    if (!videoEnabled) return;
    const video = videoForLayer(activeLayer);
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    void video.play().catch(() => undefined);
  }, [activeLayer, videoEnabled, videoForLayer]);

  // Preload exactly one following film. It stays paused at frame zero until the
  // visible film is ready to dissolve; it never plays while hidden.
  useEffect(() => {
    if (!videoEnabled) return;
    const video = videoForLayer(incomingLayer);
    if (!video) return;

    setIncomingReady(false);
    video.pause();
    video.currentTime = 0;
    video.preload = "auto";
    video.load();

    let prepared = false;
    const detachReadyListeners = () => {
      video.removeEventListener("loadeddata", markReadyAtOpening);
      video.removeEventListener("canplay", markReadyAtOpening);
    };
    const markReadyAtOpening = () => {
      if (prepared || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      prepared = true;
      video.pause();
      video.currentTime = 0;
      setIncomingReady(true);
      detachReadyListeners();
    };

    video.addEventListener("loadeddata", markReadyAtOpening);
    video.addEventListener("canplay", markReadyAtOpening);
    markReadyAtOpening();
    return detachReadyListeners;
  }, [incomingIndex, incomingLayer, videoEnabled, videoForLayer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const completeTransition = useCallback((nextLayer: Layer, nextIndex: number) => {
    if (!mountedRef.current) return;

    const outgoingLayer = otherLayer(nextLayer);
    const outgoingVideo = videoForLayer(outgoingLayer);
    outgoingVideo?.pause();
    if (outgoingVideo) outgoingVideo.currentTime = 0;

    // First make the already-playing incoming DOM node active. Only then does
    // the hidden node receive the following person at time zero.
    setActiveLayer(nextLayer);
    setLayerStories((previous) => ({
      ...previous,
      [outgoingLayer]: (nextIndex + 1) % HOME_STORIES.length,
    }));
    setIncomingReady(false);
    setCrossfading(false);
    transitionInFlightRef.current = false;
    onActiveStoryChange(HOME_STORIES[nextIndex]);
  }, [onActiveStoryChange, videoForLayer]);

  const beginTransition = useCallback(async () => {
    if (!videoEnabled || !incomingReady || crossfading || transitionInFlightRef.current) return;
    const incomingVideo = videoForLayer(incomingLayer);
    if (!incomingVideo || incomingVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    transitionInFlightRef.current = true;
    incomingVideo.currentTime = 0;
    incomingVideo.loop = true;
    try {
      await incomingVideo.play();
    } catch {
      incomingVideo.pause();
      incomingVideo.currentTime = 0;
      setIncomingReady(false);
      transitionInFlightRef.current = false;
      return;
    }
    if (!mountedRef.current) return;

    if (reducedMotion) {
      completeTransition(incomingLayer, incomingIndex);
      return;
    }

    setCrossfading(true);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      completeTransition(incomingLayer, incomingIndex);
    }, CROSSFADE_MS);
  }, [completeTransition, crossfading, incomingIndex, incomingLayer, incomingReady, reducedMotion, videoEnabled, videoForLayer]);

  const onActiveTimeUpdate = useCallback((layer: Layer, video: HTMLVideoElement) => {
    if (layer !== activeLayer || crossfading || !incomingReady || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime <= END_WINDOW_SECONDS) void beginTransition();
  }, [activeLayer, beginTransition, crossfading, incomingReady]);

  const layerClassName = (layer: Layer) => {
    const isActive = layer === activeLayer;
    return [
      styles.video,
      !isActive ? styles.videoIncoming : "",
      crossfading && isActive ? styles.videoOutgoing : "",
      crossfading && !isActive ? styles.videoIncomingVisible : "",
    ].filter(Boolean).join(" ");
  };

  const renderLayer = (layer: Layer, story: HomeStory) => (
    <video
      ref={layer === "a" ? videoARef : videoBRef}
      className={layerClassName(layer)}
      style={focalStyle(story)}
      data-carousel-layer={layer}
      data-carousel-role={layer === activeLayer ? "active" : "incoming"}
      data-carousel-story={story.slug}
      src={assetPath(story, "mp4")}
      poster={assetPath(story, "poster.webp")}
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      onTimeUpdate={(event) => onActiveTimeUpdate(layer, event.currentTarget)}
      onError={() => {
        if (layer === activeLayer) setVideoEnabled(false);
        else setIncomingReady(false);
      }}
    />
  );

  return (
    <div
      className={styles.media}
      aria-hidden="true"
      data-home-carousel="true"
      data-carousel-phase={crossfading ? "dissolving" : incomingReady ? "ready" : "preloading"}
      data-carousel-visible-index={activeIndex + 1}
      data-carousel-active-layer={activeLayer}
      data-carousel-next-ready={incomingReady ? "true" : "false"}
      data-video-enabled={videoEnabled ? "true" : "false"}
    >
      <img className={styles.poster} style={focalStyle(activeStory)} src={assetPath(activeStory, "poster.webp")} alt="" />
      {videoEnabled && renderLayer("a", HOME_STORIES[layerStories.a])}
      {videoEnabled && renderLayer("b", HOME_STORIES[layerStories.b])}
      <span className={styles.mediaVeil} />
    </div>
  );
}
