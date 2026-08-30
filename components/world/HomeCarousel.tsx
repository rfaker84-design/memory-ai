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

// This is the approved original homepage dissolve: no veil, no cut, and no
// extra stage between two people.
const CROSSFADE_MS = 1_000;
const END_WINDOW_SECONDS = 1.05;
const HOME_ASSET_VERSION = "home-v2";

type HomeCarouselProps = {
  reducedMotion: boolean;
  onActiveStoryChange: (story: HomeStory) => void;
};

function assetPath(story: HomeStory, extension: "mp4" | "poster.webp") {
  return `/home-hero-assets/${story.slug}.${HOME_ASSET_VERSION}.${extension}`;
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
 * The original approved dissolve, with one safety addition: the hidden video
 * is only ever preloaded at time zero. A transition is not allowed until it
 * reports that it can play, so a slow network simply lets the current person
 * continue looping rather than exposing an empty layer.
 */
export function HomeCarousel({ reducedMotion, onActiveStoryChange }: HomeCarouselProps) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(1);
  const [incomingReady, setIncomingReady] = useState(false);
  const [crossfading, setCrossfading] = useState(false);
  const activeVideoRef = useRef<HTMLVideoElement>(null);
  const incomingVideoRef = useRef<HTMLVideoElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const transitionInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  useLayoutEffect(() => {
    if (!videoEnabled) return;
    const video = activeVideoRef.current;
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    void video.play().catch(() => undefined);
  }, [activeIndex, videoEnabled]);

  useEffect(() => {
    if (!videoEnabled || incomingIndex === null) return;
    const video = incomingVideoRef.current;
    if (!video) return;

    // This is preload only. The incoming film never plays while hidden.
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
    return () => {
      detachReadyListeners();
    };
  }, [incomingIndex, videoEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const completeTransition = useCallback((nextIndex: number) => {
    if (!mountedRef.current) return;
    setActiveIndex(nextIndex);
    onActiveStoryChange(HOME_STORIES[nextIndex]);
    setIncomingIndex((nextIndex + 1) % HOME_STORIES.length);
    setIncomingReady(false);
    setCrossfading(false);
    transitionInFlightRef.current = false;
  }, [onActiveStoryChange]);

  const beginTransition = useCallback(async () => {
    if (!videoEnabled || !incomingReady || crossfading || transitionInFlightRef.current || incomingIndex === null) return;
    const incomingVideo = incomingVideoRef.current;
    if (!incomingVideo || incomingVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    // Set the opening beat immediately before visibility changes. There is no
    // hidden playback, seeking to a later frame, or pre-transition text swap.
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
      completeTransition(incomingIndex);
      return;
    }

    setCrossfading(true);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      completeTransition(incomingIndex);
    }, CROSSFADE_MS);
  }, [completeTransition, crossfading, incomingIndex, incomingReady, reducedMotion, videoEnabled]);

  const onActiveTimeUpdate = useCallback((video: HTMLVideoElement) => {
    if (crossfading || !incomingReady || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime <= END_WINDOW_SECONDS) void beginTransition();
  }, [beginTransition, crossfading, incomingReady]);

  const activeStory = HOME_STORIES[activeIndex];
  const incomingStory = incomingIndex === null ? null : HOME_STORIES[incomingIndex];

  return (
    <div
      className={styles.media}
      aria-hidden="true"
      data-home-carousel="true"
      data-carousel-phase={crossfading ? "dissolving" : incomingReady ? "ready" : "preloading"}
      data-carousel-visible-index={activeIndex + 1}
      data-carousel-next-ready={incomingReady ? "true" : "false"}
      data-video-enabled={videoEnabled ? "true" : "false"}
    >
      <img className={styles.poster} style={focalStyle(activeStory)} src={assetPath(activeStory, "poster.webp")} alt="" />
      {videoEnabled && (
        <video
          key={`active-${activeStory.slug}`}
          ref={activeVideoRef}
          className={`${styles.video} ${crossfading ? styles.videoOutgoing : ""}`}
          style={focalStyle(activeStory)}
          data-carousel-layer="active"
          data-carousel-story={activeStory.slug}
          src={assetPath(activeStory, "mp4")}
          poster={assetPath(activeStory, "poster.webp")}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onTimeUpdate={(event) => onActiveTimeUpdate(event.currentTarget)}
          onError={() => setVideoEnabled(false)}
        />
      )}
      {videoEnabled && incomingStory && (
        <video
          key={`incoming-${incomingStory.slug}`}
          ref={incomingVideoRef}
          className={`${styles.video} ${styles.videoIncoming} ${crossfading ? styles.videoIncomingVisible : ""}`}
          style={focalStyle(incomingStory)}
          data-carousel-layer="incoming"
          data-carousel-story={incomingStory.slug}
          src={assetPath(incomingStory, "mp4")}
          poster={assetPath(incomingStory, "poster.webp")}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onError={() => setIncomingReady(false)}
        />
      )}
      <span className={styles.mediaVeil} />
    </div>
  );
}
