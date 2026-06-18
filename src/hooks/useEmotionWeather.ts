"use client";
import { useMemo } from "react";

export type EmotionWeather = "calm" | "rainy" | "warm" | "nostalgic" | "heavy";

export interface WeatherProfile {
  weather: EmotionWeather;
  intensity: number;        // 0-1
  colorTone: string;        // CSS hue
  lightBehavior: string;    // "pulse" | "steady" | "flicker" | "drift"
  bgPalette: { bg: string; bloom: string; fog: string; particle: string };
}

const WEATHER_PRESETS: Record<EmotionWeather, WeatherProfile> = {
  calm: {
    weather: "calm", intensity: 0.3,
    colorTone: "#6078A0", lightBehavior: "steady",
    bgPalette: { bg: "#060810", bloom: "rgba(60,80,120,", fog: "rgba(20,30,50,", particle: "rgba(120,150,190," },
  },
  rainy: {
    weather: "rainy", intensity: 0.6,
    colorTone: "#5060A0", lightBehavior: "flicker",
    bgPalette: { bg: "#04060e", bloom: "rgba(40,50,100,", fog: "rgba(15,20,45,", particle: "rgba(90,110,170," },
  },
  warm: {
    weather: "warm", intensity: 0.7,
    colorTone: "#C89850", lightBehavior: "pulse",
    bgPalette: { bg: "#08060c", bloom: "rgba(180,140,90,", fog: "rgba(50,30,10,", particle: "rgba(220,190,140," },
  },
  nostalgic: {
    weather: "nostalgic", intensity: 0.5,
    colorTone: "#A08060", lightBehavior: "drift",
    bgPalette: { bg: "#07060c", bloom: "rgba(150,110,70,", fog: "rgba(40,25,10,", particle: "rgba(200,170,130," },
  },
  heavy: {
    weather: "heavy", intensity: 0.8,
    colorTone: "#404080", lightBehavior: "pulse",
    bgPalette: { bg: "#04040c", bloom: "rgba(50,40,80,", fog: "rgba(20,15,35,", particle: "rgba(100,80,140," },
  },
};

// 简单情绪分类：基于关键词密度
function analyzeStory(text: string): EmotionWeather {
  const lower = text.toLowerCase();
  const signals: Record<EmotionWeather, number> = { calm: 0, rainy: 0, warm: 0, nostalgic: 0, heavy: 0 };

  // 暖色系词
  const warmWords = ["温暖", "阳光", "爱", "笑", "开心", "幸福", "家", "饭", "热", "warm", "love", "happy"];
  for (const w of warmWords) if (lower.includes(w)) signals.warm += 1;

  // 雨天系词
  const rainyWords = ["雨", "泪", "离开", "冷", "失去", "病", "冬天", "暗", "rain", "sad", "cry", "alone"];
  for (const w of rainyWords) if (lower.includes(w)) signals.rainy += 1;

  // 怀旧词
  const nostalgicWords = ["从前", "记得", "以前", "小时候", "老", "过去", "回忆", "旧", "照片", "memory", "old", "once"];
  for (const w of nostalgicWords) if (lower.includes(w)) signals.nostalgic += 1;

  // 沉重词
  const heavyWords = ["战争", "苦难", "艰难", "困苦", "贫穷", "饥饿", "逃", "死", "痛", "war", "pain", "suffer"];
  for (const w of heavyWords) if (lower.includes(w)) signals.heavy += 1;

  // 平静默认值
  signals.calm = 1;

  // 取最高信号
  let best: EmotionWeather = "calm";
  let bestScore = 0;
  for (const [key, score] of Object.entries(signals)) {
    if (score > bestScore) { bestScore = score; best = key as EmotionWeather; }
  }
  return best;
}

export default function useEmotionWeather(lifeStory: string | null): WeatherProfile {
  return useMemo(() => {
    if (!lifeStory) return WEATHER_PRESETS.calm;
    const weather = analyzeStory(lifeStory);
    const preset = WEATHER_PRESETS[weather];
    // 根据文本长度微调强度
    const intensity = Math.min(1, preset.intensity + lifeStory.length * 0.0005);
    return { ...preset, intensity };
  }, [lifeStory]);
}