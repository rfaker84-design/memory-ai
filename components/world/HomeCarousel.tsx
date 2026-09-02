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

// The approved one-second dissolve is deliberately split in half. The old
// person reaches zero before the next person begins, so two faces never mix.
const FADE_MS = 500;
const HANDOFF_LEAD_SECONDS = 0.8;
const HOME_ASSET_VERSION = "home-v2";

type Layer = "a" | "b";
type LayerStories = Record<Layer, number>;
type Handoff = "steady" | "fading-out" | "fading-in";

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
 * Starting only after the complete short film is buffered prevents the cold
 * cache stall previously seen during the first person's opening movement.
 */
function isReadyForContinuousPlayback(video: HTMLVideoElement) {
  if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
  if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

  const requiredEnd = Math.max(0, video.duration - 0.12);
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (video.buffered.start(index) <= 0.05 && video.buffered.end(index) >= requiredEnd) return true;
  }
  return video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
}

/**
 * The homepage keeps two stable DOM layers. One film plays; the other only
 * preloads from frame zero while paused. The handoff is intentionally a small
 * three-step sequence, not a competing multi-stage playback controller.
 */
export function HomeCarousel({ reducedMotion, playbackActive, onActiveStoryChange }: HomeCarouselProps) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [filmStarted, setFilmStarted] = useState(false);
  const [activeLayer, setActiveLayer] = useState<Layer>("a");
  const [layerStories, setLayerStories] = useState<LayerStories>({ a: 0, b: 1 });
  const [nextReady, setNextReadyState] = useState(false);
  const [handoff, setHandoffState] = useState<Handoff>("steady");
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const openingStartedRef = useRef(false);
  const handoffRef = useRef<Handoff>("steady");
  const handoffLockedRef = useRef(false);
  const nextReadyRef = useRef(false);
  const promotedLayerRef = useRef<Layer | null>(null);
  const fadeFrameRef = useRef<number | null>(null);

  const nextLayer = otherLayer(activeLayer);
  const activeIndex = layerStories[activeLayer];
  const nextIndex = layerStories[nextLayer];
  const activeStory = HOME_STORIES[activeIndex];

  const videoForLayer = useCallback((layer: Layer) => (
    layer === "a" ? videoARef.current : videoBRef.current
  ), []);

  const setHandoff = useCallback((value: Handoff) => {
    handoffRef.current = value;
    setHandoffState(value);
  }, []);

  const setNextReady = useCallback((value: boolean) => {
    nextReadyRef.current = value;
    setNextReadyState(value);
  }, []);

  const clearFadeFrame = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearFadeFrame();
    };
  }, [clearFadeFrame]);

  // The opening film waits behind its matching home-v2 poster until it can
  // play continuously from zero. It does not autoplay while half-buffered.
  useEffect(() => {
    if (!videoEnabled || !playbackActive || openingStartedRef.current) return;
    const opening = videoForLayer("a");
    if (!opening) return;

    let cancelled = false;
    const startOpening = async () => {
      if (cancelled || openingStartedRef.current || !isReadyForContinuousPlayback(opening)) return;
      opening.muted = true;
      opening.playsInline = true;
      opening.loop = false;
      opening.currentTime = 0;
      try {
        await opening.play();
      } catch {
        return;
      }
      if (cancelled) {
        opening.pause();
        return;
      }
      openingStartedRef.current = true;
      setFilmStarted(true);
    };

    opening.pause();
    opening.currentTime = 0;
    opening.preload = "auto";
    opening.load();
    opening.addEventListener("loadeddata", startOpening);
    opening.addEventListener("canplay", startOpening);
    opening.addEventListener("canplaythrough", startOpening);
    opening.addEventListener("progress", startOpening);
    void startOpening();

    return () => {
      cancelled = true;
      opening.removeEventListener("loadeddata", startOpening);
      opening.removeEventListener("canplay", startOpening);
      opening.removeEventListener("canplaythrough", startOpening);
      opening.removeEventListener("progress", startOpening);
    };
  }, [playbackActive, videoEnabled, videoForLayer]);

  // Prepare exactly one following film. It remains paused at frame zero and
  // does not take part in rendering or playback until the outgoing film is gone.
  useEffect(() => {
    if (!videoEnabled || handoff !== "steady") return;
    const next = videoForLayer(nextLayer);
    if (!next) return;

    let cancelled = false;
    const markReady = () => {
      if (cancelled || !isReadyForContinuousPlayback(next)) return;
      next.pause();
      next.currentTime = 0;
      setNextReady(true);
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
  }, [handoff, nextIndex, nextLayer, setNextReady, videoEnabled, videoForLayer]);

  useEffect(() => {
    if (playbackActive) return;
    openingStartedRef.current = false;
    handoffLockedRef.current = false;
    promotedLayerRef.current = null;
    clearFadeFrame();
    setHandoff("steady");
    setFilmStarted(false);
    videoARef.current?.pause();
    videoBRef.current?.pause();
  }, [clearFadeFrame, playbackActive, setHandoff]);

  const showPosterFallback = useCallback(() => {
    const current = videoForLayer(activeLayer);
    current?.pause();
    clearFadeFrame();
    setFilmStarted(false);
    setHandoff("steady");
    handoffLockedRef.current = false;
  }, [activeLayer, clearFadeFrame, setHandoff, videoForLayer]);

  const promotePreparedFilm = useCallback(async () => {
    if (!mountedRef.current || handoffRef.current !== "fading-out" || !nextReadyRef.current) {
      showPosterFallback();
      return;
    }
    const outgoing = videoForLayer(activeLayer);
    const incoming = videoForLayer(nextLayer);
    if (!outgoing || !incoming || !isReadyForContinuousPlayback(incoming)) {
      showPosterFallback();
      return;
    }

    // The outgoing layer has reached the explicit invisibility threshold.
    clearFadeFrame();
    outgoing.pause();
    incoming.pause();
    incoming.currentTime = 0;
    // Do not await play(): some browsers resolve it a frame or two later.
    // Moving the prepared layer into the same render keeps a decoded poster or
    // first frame over the media area instead of exposing the page background.
    const playback = incoming.play();
    promotedLayerRef.current = nextLayer;
    setActiveLayer(nextLayer);
    setHandoff("fading-in");
    void playback.catch(() => {
      if (!mountedRef.current) return;
      incoming.pause();
      incoming.currentTime = 0;
      incoming.load();
      setNextReady(false);
      setFilmStarted(false);
      setHandoff("steady");
      handoffLockedRef.current = false;
    });
  }, [activeLayer, clearFadeFrame, nextLayer, setHandoff, setNextReady, showPosterFallback, videoForLayer]);

  const beginHandoff = useCallback(() => {
    if (!videoEnabled || !playbackActive || !openingStartedRef.current) return;
    if (handoffRef.current !== "steady" || handoffLockedRef.current || !nextReadyRef.current) return;
    handoffLockedRef.current = true;
    setHandoff("fading-out");

    const waitUntilOutgoingIsInvisible = () => {
      const outgoing = videoForLayer(activeLayer);
      if (!outgoing || handoffRef.current !== "fading-out") return;
      const opacity = Number(getComputedStyle(outgoing).opacity);
      if (Number.isFinite(opacity) && opacity <= 0.02) {
        fadeFrameRef.current = null;
        void promotePreparedFilm();
        return;
      }
      fadeFrameRef.current = window.requestAnimationFrame(waitUntilOutgoingIsInvisible);
    };
    fadeFrameRef.current = window.requestAnimationFrame(waitUntilOutgoingIsInvisible);
  }, [activeLayer, playbackActive, promotePreparedFilm, setHandoff, videoEnabled, videoForLayer]);

  const completeHandoff = useCallback(() => {
    if (!mountedRef.current || handoffRef.current !== "fading-in") return;
    const promotedLayer = promotedLayerRef.current;
    if (!promotedLayer || promotedLayer !== activeLayer) return;

    const recycledLayer = otherLayer(promotedLayer);
    const recycledVideo = videoForLayer(recycledLayer);
    recycledVideo?.pause();
    if (recycledVideo) recycledVideo.currentTime = 0;

    const promotedIndex = layerStories[promotedLayer];
    setLayerStories((stories) => ({
      ...stories,
      [recycledLayer]: (stories[promotedLayer] + 1) % HOME_STORIES.length,
    }));
    promotedLayerRef.current = null;
    clearFadeFrame();
    setNextReady(false);
    setHandoff("steady");
    handoffLockedRef.current = false;
    onActiveStoryChange(HOME_STORIES[promotedIndex]);
  }, [activeLayer, clearFadeFrame, layerStories, onActiveStoryChange, setHandoff, setNextReady, videoForLayer]);

  const onCurrentTimeUpdate = useCallback((layer: Layer, video: HTMLVideoElement) => {
    if (!playbackActive || layer !== activeLayer || handoffRef.current !== "steady") return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime <= HANDOFF_LEAD_SECONDS) beginHandoff();
  }, [activeLayer, beginHandoff, playbackActive]);

  const videoClassName = (layer: Layer) => [
    styles.video,
    layer === activeLayer ? styles.videoCurrent : styles.videoNext,
    layer === activeLayer && handoff === "fading-out" ? styles.videoFadingOut : "",
  ].filter(Boolean).join(" ");

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
      onEnded={() => {
        if (layer !== activeLayer || handoffRef.current !== "steady") return;
        if (nextReadyRef.current) beginHandoff();
        else showPosterFallback();
      }}
      onTransitionEnd={(event) => {
        if (event.propertyName !== "opacity") return;
        if (layer === activeLayer && handoffRef.current === "fading-out") void promotePreparedFilm();
        if (layer === activeLayer && handoffRef.current === "fading-in") completeHandoff();
      }}
      onError={() => {
        if (layer === activeLayer) showPosterFallback();
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
      data-carousel-handoff={handoff}
      data-video-enabled={videoEnabled ? "true" : "false"}
      data-film-started={filmStarted ? "true" : "false"}
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
      {videoEnabled && renderVideo("a", HOME_STORIES[layerStories.a])}
      {videoEnabled && renderVideo("b", HOME_STORIES[layerStories.b])}
      <span className={styles.mediaVeil} />
    </div>
  );
}
