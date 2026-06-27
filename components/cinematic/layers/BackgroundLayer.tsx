"use client";

import {useCallback, useEffect, useRef} from "react";

type BackgroundLayerProps = {
  src?: string;
};

export default function BackgroundLayer({src = "/films/waiting.mp4"}: BackgroundLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playIfPaused = useCallback(() => {
    const video = videoRef.current;

    if (!video || !video.paused) {
      return;
    }

    void video.play().catch(() => {
      // Keep the cinematic shell stable if the browser temporarily blocks autoplay.
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
      loop
      preload="auto"
      onCanPlay={playIfPaused}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        background: "#000000",
      }}
    />
  );
}
