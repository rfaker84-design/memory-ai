// V4 场景配置类型定义

export type EmotionType = "warm" | "sad" | "peaceful" | "nostalgic";

export interface SceneConfig {
  emotion: EmotionType;
  colorPalette: string[];
  intensity: number;
  memorySymbols: string[];
  narration: string;
}

export interface EmotionAnalysis {
  emotion: EmotionType;
  colorPalette: string[];
  intensity: number;
  memorySymbols: string[];
}

// 颜色预设映射
export const EMOTION_PALETTES: Record<EmotionType, { bg: string; stars: string; door: string; glow: string; accent: string }> = {
  warm:     { bg: "#0C0B1E", stars: "rgba(255,245,215,", door: "rgba(255,185,90,",  glow: "rgba(255,200,120,", accent: "#FFD58A" },
  sad:      { bg: "#060810", stars: "rgba(180,190,220,", door: "rgba(160,180,210,", glow: "rgba(140,160,200,", accent: "#A0B4D0" },
  peaceful:  { bg: "#080C18", stars: "rgba(190,210,235,", door: "rgba(170,200,225,", glow: "rgba(150,190,220,", accent: "#AAC8E1" },
  nostalgic: { bg: "#0A0818", stars: "rgba(255,220,180,", door: "rgba(255,160,100,",  glow: "rgba(255,140,80,",  accent: "#FFA564" },
};

// 情绪对应的呼吸频率
export const EMOTION_BREATH: Record<EmotionType, { frequency: number; amplitude: number }> = {
  warm:     { frequency: 2.5, amplitude: 0.5 },
  sad:      { frequency: 1.5, amplitude: 0.3 },
  peaceful:  { frequency: 3.0, amplitude: 0.4 },
  nostalgic: { frequency: 2.0, amplitude: 0.6 },
};

// 情绪对应的星星密度
export const EMOTION_STAR_DENSITY: Record<EmotionType, { far: number; mid: number; near: number }> = {
  warm:     { far: 150, mid: 80, near: 40 },
  sad:      { far: 60,  mid: 30, near: 15 },
  peaceful:  { far: 100, mid: 50, near: 25 },
  nostalgic: { far: 120, mid: 60, near: 35 },
};