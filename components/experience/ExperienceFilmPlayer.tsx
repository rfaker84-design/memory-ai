"use client";

import {useCallback, useEffect, useRef} from "react";

type ExperienceFilmPlayerProps = {
  src: string;
  loop?: boolean;
  onEnded?: () => void;
  className?: string;
};

export default function ExperienceFilmPlayer({
  src,
  loop = false,
  onEnded,
  className,
}: ExperienceFilmPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playIfPaused = useCallback(() => {
    const video = videoRef.current;

    if (!video || !video.paused) {
      return;
    }

    void video.play().catch(() => {
      // Browser autoplay policies can still block playback in some contexts.
      // The player retries on canplay, focus, pageshow, and visibility changes.
    });
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        playIfPaused();
      }
    };

    window.addEventListener("focus", playIfPaused);
    window.addEventListener("pageshow", playIfPaused);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", playIfPaused);
      window.removeEventListener("pageshow", playIfPaused);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [playIfPaused]);

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      muted
      playsInline
      preload="auto"
      loop={loop}
      onCanPlay={playIfPaused}
      onEnded={onEnded}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        backgroundColor: "#000000",
        display: "block",
      }}
    />
  );
}
