"use client";
import { useState, useEffect, useRef } from "react";

interface Fragment {
  text: string;
  x: number;
  y: number;
  id: number;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/[。！？；\n.!?;]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4 && s.length <= 40);
}

function seededRandom(s: number) {
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export default function useMemoryFragments(lifeStory: string | null) {
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const sentences = useRef<string[]>([]);
  const idCounter = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rnd = useRef(seededRandom(Date.now() % 10000));

  useEffect(() => {
    if (!lifeStory) return;
    sentences.current = splitIntoSentences(lifeStory);
    if (!sentences.current.length) return;

    // 初始显示 2 句
    const initial: Fragment[] = [];
    for (let i = 0; i < Math.min(2, sentences.current.length); i++) {
      initial.push({
        text: sentences.current[i],
        x: 15 + rnd.current() * 55,
        y: 20 + rnd.current() * 50,
        id: idCounter.current++,
      });
    }
    setFragments(initial);

    // 每 3-6 秒随机替换一句
    timerRef.current = setInterval(() => {
      const sentence = sentences.current[Math.floor(rnd.current() * sentences.current.length)];
      setFragments(prev => {
        const next = prev.length >= 4 ? prev.slice(1) : [...prev];
        next.push({
          text: sentence,
          x: 10 + rnd.current() * 60,
          y: 15 + rnd.current() * 55,
          id: idCounter.current++,
        });
        return next;
      });
    }, 3500 + Math.random() * 3000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lifeStory]);

  return fragments;
}