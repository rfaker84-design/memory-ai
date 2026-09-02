"use client";

import { useEffect, useRef, useState } from "react";

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
  { slug: "younger-man", label: "眼镜男士", desktopPosition: "67% 50%", mobilePosition: "67% 48%" },
];

export const HOME_MASTER_ASSET_VERSION = "home-master-v1";
export const HOME_MASTER_SEGMENT_SECONDS = 8.083333;

type MasterVariant = "desktop" | "mobile";

type HomeCarouselProps = {
  reducedMotion: boolean;
  onActiveStoryChange: (story: HomeStory) => void;
};

function masterAssetPath(variant: MasterVariant, extension: "mp4" | "poster.webp") {
  return `/home-hero-assets/${HOME_MASTER_ASSET_VERSION}.${variant}.${extension}`;
}

function shouldUseStaticHero() {
  const hints = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return hints.connection?.saveData === true
    || (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2)
    || navigator.hardwareConcurrency <= 2;
}

function chooseMasterVariant(): MasterVariant {
  return window.matchMedia("(max-aspect-ratio: 3 / 4)").matches ? "mobile" : "desktop";
}

export function masterStoryIndexAt(time: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  return Math.min(HOME_STORIES.length - 1, Math.floor(time / HOME_MASTER_SEGMENT_SECONDS));
}

/**
 * The approved five films are encoded into one continuous, faststart master.
 * There is deliberately only one real player: a slow network can never leave
 * the visible person waiting for another independent MP4 to be decoded.
 */
export function HomeCarousel({ reducedMotion, onActiveStoryChange }: HomeCarouselProps) {
  const [variant, setVariant] = useState<MasterVariant | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(max-aspect-ratio: 3 / 4)");
    const updateVariant = () => setVariant(chooseMasterVariant());
    updateVariant();
    media.addEventListener("change", updateVariant);
    return () => media.removeEventListener("change", updateVariant);
  }, []);

  useEffect(() => {
    setVideoEnabled(!reducedMotion && !shouldUseStaticHero());
  }, [reducedMotion]);

  useEffect(() => {
    onActiveStoryChange(HOME_STORIES[activeIndex]);
  }, [activeIndex, onActiveStoryChange]);

  const updateActiveStory = (currentTime: number) => {
    const nextIndex = masterStoryIndexAt(currentTime);
    if (nextIndex === activeIndexRef.current) return;
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  const hasVideo = videoEnabled && variant !== null;
  const posterDesktop = masterAssetPath("desktop", "poster.webp");
  const posterMobile = masterAssetPath("mobile", "poster.webp");

  return (
    <div
      className={styles.media}
      aria-hidden="true"
      data-home-carousel="true"
      data-carousel-player="single-master"
      data-carousel-visible-index={activeIndex + 1}
      data-master-variant={variant ?? "pending"}
      data-video-enabled={hasVideo ? "true" : "false"}
    >
      <picture className={styles.poster} data-master-poster="true">
        <source media="(max-aspect-ratio: 3 / 4)" srcSet={posterMobile} />
        <img src={posterDesktop} alt="" />
      </picture>
      {hasVideo && (
        <video
          className={styles.video}
          data-carousel-role="active"
          data-carousel-story={HOME_STORIES[activeIndex].slug}
          src={masterAssetPath(variant, "mp4")}
          poster={masterAssetPath(variant, "poster.webp")}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onCanPlay={(event) => {
            void event.currentTarget.play().catch(() => undefined);
          }}
          onTimeUpdate={(event) => updateActiveStory(event.currentTarget.currentTime)}
          onError={() => setVideoEnabled(false)}
        />
      )}
    </div>
  );
}
