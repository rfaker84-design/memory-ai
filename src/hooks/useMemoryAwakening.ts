"use client";
import { useState, useEffect, useRef } from "react";

export interface AwakeningFragment {
  text: string;
  id: number;
  layer: "surface" | "emotional" | "deep";
  position: { x: number; y: number };
}

function splitIntoLayers(text: string): { surface: string[]; emotional: string[]; deep: string[] } {
  const sentences = text
    .split(/[。！？；\n.!?;]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4 && s.length <= 50);

  // 表层：客观/事实性内容（前30%）
  const surfaceCount = Math.max(1, Math.ceil(sentences.length * 0.3));
  const surface = sentences.slice(0, surfaceCount);

  // 情绪层：包含情感词汇
  const emotionalKeywords = ["爱", "喜欢", "温暖", "开心", "幸福", "笑", "哭", "想", "念", "感动", "怀念", "记得"];
  const emotional = sentences.filter(s =>
    emotionalKeywords.some(k => s.includes(k)) && !surface.includes(s)
  );

  // 深层：剩余 → 这些是最个人的记忆
  const used = new Set([...surface, ...emotional]);
  const deep = sentences.filter(s => !used.has(s));

  return { surface, emotional, deep };
}

function seededRandom(s: number) {
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export default function useMemoryAwakening(lifeStory: string | null, intensity: number) {
  const [fragments, setFragments] = useState<AwakeningFragment[]>([]);
  const layers = useRef<{ surface: string[]; emotional: string[]; deep: string[] }>({ surface: [], emotional: [], deep: [] });
  const currentLayer = useRef<"surface" | "emotional" | "deep">("surface");
  const idCounter = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rnd = useRef(seededRandom(Date.now() % 10000));
  const revealedAll = useRef(false);

  useEffect(() => {
    if (!lifeStory) return;
    layers.current = splitIntoLayers(lifeStory);
    currentLayer.current = "surface";
    revealedAll.current = false;

    const initial: AwakeningFragment[] = [];
    const showCount = Math.min(3, (layers.current.surface.length || 1));
    for (let i = 0; i < showCount; i++) {
      const text = layers.current.surface[i] || layers.current.surface[0];
      if (text) {
        initial.push({
          text, id: idCounter.current++,
          layer: "surface",
          position: { x: 15 + rnd.current() * 55, y: 20 + rnd.current() * 50 },
        });
      }
    }
    setFragments(initial);

    // 逐层递进
    const baseInterval = 3500 - intensity * 1500;

    timerRef.current = setInterval(() => {
      setFragments(prev => {
        const next = prev.length >= 5 ? prev.slice(1) : [...prev];

        // 决定当前层
        const layerData = layers.current;
        const surfaceDone = layerData.surface.every(s => prev.some(p => p.text === s));

        if (surfaceDone && currentLayer.current === "surface") {
          currentLayer.current = "emotional";
        }

        const emotionalDone = layerData.emotional.length > 0
          ? layerData.emotional.every(s => prev.some(p => p.text === s))
          : true;

        if (emotionalDone && currentLayer.current === "emotional") {
          currentLayer.current = "deep";
        }

        const deepDone = layerData.deep.length > 0
          ? layerData.deep.every(s => prev.some(p => p.text === s))
          : true;

        const activeLayer = currentLayer.current;
        const pool = layerData[activeLayer];
        const unusedFromPool = pool.filter(s => !prev.some(p => p.text === s));

        let sentence: string;
        if (unusedFromPool.length > 0) {
          sentence = unusedFromPool[Math.floor(rnd.current() * unusedFromPool.length)];
        } else if (activeLayer === "deep" && deepDone) {
          // 所有句子都用过 → 循环
          const allSentences = [...layerData.surface, ...layerData.emotional, ...layerData.deep];
          sentence = allSentences[Math.floor(rnd.current() * allSentences.length)];
        } else {
          sentence = pool[Math.floor(rnd.current() * pool.length)];
        }

        next.push({
          text: sentence, id: idCounter.current++,
          layer: activeLayer,
          position: { x: 10 + rnd.current() * 60, y: 15 + rnd.current() * 55 },
        });

        return next;
      });
    }, baseInterval);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lifeStory, intensity]);

  return fragments;
}