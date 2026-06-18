"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Props = {
  avatarUrl: string | null;
  audioUrl: string | null;
  onEnded?: () => void;
};

export default function DigitalAvatar({ avatarUrl, audioUrl, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!avatarUrl || !videoRef.current) return;

    const video = videoRef.current;
    video.src = avatarUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    const playVideo = async () => {
      try {
        await video.play();
        setPlaying(true);
      } catch {
        // Autoplay blocked — user gesture needed
      }
    };
    playVideo();
  }, [avatarUrl]);

  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;

    const audio = audioRef.current;
    audio.src = audioUrl;

    const playAudio = async () => {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        // Autoplay blocked
      }
    };

    // Delay audio slightly so video appears first
    const t = setTimeout(playAudio, 600);

    const onAudioEnded = () => {
      setPlaying(false);
      onEnded?.();
    };
    audio.addEventListener("ended", onAudioEnded);

    return () => {
      clearTimeout(t);
      audio.removeEventListener("ended", onAudioEnded);
    };
  }, [audioUrl, onEnded]);

  if (!avatarUrl && !audioUrl) return null;

  return (
    <div className="relative w-full h-full">
      {/* Video layer */}
      {avatarUrl && (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          loop
          muted
          playsInline
        />
      )}

      {/* Audio layer (hidden) */}
      {audioUrl && <audio ref={audioRef} preload="auto" />}

      {/* Speaking indicator */}
      {playing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-4 left-0 right-0 text-center"
        >
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ fontSize: 14, color: "#D6BFA3", fontWeight: 300, letterSpacing: "0.06em" }}
          >
            TA正在对你说话…
          </motion.p>
        </motion.div>
      )}
    </div>
  );
}