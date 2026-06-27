"use client";

import {useCallback, useEffect, useRef} from "react";

type BackgroundLayerProps = {
  src?: string;
  poster?: string;
};

export default function BackgroundLayer({
  src = "/films/waiting.mp4",
  poster = "/experience/waiting-preview.jpg",
}: BackgroundLayerProps) {
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
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
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
          opacity: 0.9,
          background:
            "radial-gradient(circle at 50% 42%, rgba(248,238,212,0.16), transparent 34%), linear-gradient(180deg, #08090d 0%, #06070a 56%, #090807 100%)",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.08) 34%, rgba(0,0,0,0.18) 58%, rgba(0,0,0,0.64) 100%), radial-gradient(circle at 50% 54%, transparent 0%, rgba(0,0,0,0.18) 58%, rgba(0,0,0,0.36) 100%)",
        }}
      />
    </>
  );
}
