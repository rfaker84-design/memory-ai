"use client";
import { useEffect, useRef } from "react";

import { beginForegroundAudio } from "../features/soundscape/SoundscapeMediaBridge";

export default function useNarration(text: string) {
  const playedRef = useRef(false);
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    let endForeground: () => void = () => undefined;
    const trySpeak = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN"; u.rate = 0.75; u.pitch = 0.9; u.volume = 0.45;
      endForeground();
      endForeground = beginForegroundAudio("system_voice");
      u.onend = endForeground;
      u.onerror = endForeground;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };
    // iOS requires user gesture
    const onInteraction = () => { trySpeak(); document.removeEventListener("click", onInteraction); document.removeEventListener("touchend", onInteraction); };
    document.addEventListener("click", onInteraction);
    document.addEventListener("touchend", onInteraction);
    trySpeak();
    return () => { endForeground(); window.speechSynthesis.cancel(); document.removeEventListener("click", onInteraction); document.removeEventListener("touchend", onInteraction); };
  }, [text]);
}
