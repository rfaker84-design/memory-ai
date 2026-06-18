// V5 记忆世界类型定义

export type WorldType = "home" | "street" | "dream" | "memory_void";
export type Weather = "sunny" | "rainy" | "snowy" | "foggy" | "warm_light";
export type TimeOfDay = "morning" | "afternoon" | "night" | "memory_time";
export type SceneEmotion = "warm" | "sad" | "nostalgic" | "peaceful";
export type TransitionType = "fade" | "light_merge" | "memory_flow";

// AI 生成的世界配置
export interface WorldConfig {
  world_type: WorldType;
  atmosphere: {
    weather: Weather;
    time: TimeOfDay;
  };
  scenes: WorldScene[];
  transitions: TransitionType[];
}

export interface WorldScene {
  id: number;
  title: string;
  description: string;
  emotion: SceneEmotion;
  duration: number; // seconds
  narration: string;
}

// 氛围 → 视觉渲染参数
export interface AtmosphereRender {
  bgGradient: string;
  particleColor: string;
  particleDirection: "up" | "down" | "drift";
  particleSpeed: number;
  lightColor: string;
  lightIntensity: number;
  blur: number;
  overlayColor: string;
}

// 世界类型 → 背景结构
export interface WorldStructure {
  perspectiveOrigin: string;
  depthLayers: { color: string; scale: number; opacity: number; speed: number }[];
  geometryHint: "room" | "corridor" | "void" | "floating";
  vanishingPoint: { x: number; y: number };
}

// ============================================================
// 预设映射表
// ============================================================

export const ATMOSPHERE_RENDER: Record<Weather, AtmosphereRender> = {
  sunny: {
    bgGradient: "linear-gradient(180deg, #1a1040 0%, #2d1b4e 30%, #4a2c3e 60%, #6b3a2e 100%)",
    particleColor: "rgba(255,210,140,",
    particleDirection: "up",
    particleSpeed: 0.6,
    lightColor: "rgba(255,200,120,",
    lightIntensity: 0.7,
    blur: 0,
    overlayColor: "rgba(40,20,10,0.15)",
  },
  rainy: {
    bgGradient: "linear-gradient(180deg, #0a0e1a 0%, #141e2e 35%, #1a2840 65%, #0d1525 100%)",
    particleColor: "rgba(140,170,210,",
    particleDirection: "down",
    particleSpeed: 1.4,
    lightColor: "rgba(120,150,200,",
    lightIntensity: 0.35,
    blur: 1,
    overlayColor: "rgba(10,15,30,0.25)",
  },
  snowy: {
    bgGradient: "linear-gradient(180deg, #1a1c28 0%, #252838 30%, #2a3040 60%, #1e2230 100%)",
    particleColor: "rgba(220,225,240,",
    particleDirection: "down",
    particleSpeed: 0.5,
    lightColor: "rgba(200,210,230,",
    lightIntensity: 0.45,
    blur: 0.5,
    overlayColor: "rgba(30,32,44,0.2)",
  },
  foggy: {
    bgGradient: "linear-gradient(180deg, #181c26 0%, #1e2230 30%, #222638 60%, #1a1e28 100%)",
    particleColor: "rgba(190,195,210,",
    particleDirection: "drift",
    particleSpeed: 0.25,
    lightColor: "rgba(180,185,200,",
    lightIntensity: 0.3,
    blur: 4,
    overlayColor: "rgba(24,28,40,0.35)",
  },
  warm_light: {
    bgGradient: "linear-gradient(180deg, #0c0b1e 0%, #1a1030 30%, #2a1535 60%, #1a0e25 100%)",
    particleColor: "rgba(255,220,160,",
    particleDirection: "up",
    particleSpeed: 0.4,
    lightColor: "rgba(255,185,110,",
    lightIntensity: 0.8,
    blur: 0,
    overlayColor: "rgba(30,15,10,0.1)",
  },
};

export const WORLD_STRUCTURES: Record<WorldType, WorldStructure> = {
  home: {
    perspectiveOrigin: "50% 30%",
    depthLayers: [
      { color: "rgba(20,15,35,", scale: 1, opacity: 0.9, speed: 0 },
      { color: "rgba(25,18,40,", scale: 1.3, opacity: 0.5, speed: 0.3 },
      { color: "rgba(30,20,45,", scale: 1.8, opacity: 0.25, speed: 0.6 },
    ],
    geometryHint: "room",
    vanishingPoint: { x: 50, y: 28 },
  },
  street: {
    perspectiveOrigin: "50% 35%",
    depthLayers: [
      { color: "rgba(15,18,30,", scale: 1, opacity: 0.9, speed: 0 },
      { color: "rgba(20,22,35,", scale: 1.4, opacity: 0.55, speed: 0.4 },
      { color: "rgba(25,28,42,", scale: 2.0, opacity: 0.3, speed: 0.8 },
    ],
    geometryHint: "corridor",
    vanishingPoint: { x: 50, y: 32 },
  },
  dream: {
    perspectiveOrigin: "50% 40%",
    depthLayers: [
      { color: "rgba(12,10,28,", scale: 1, opacity: 0.85, speed: 0 },
      { color: "rgba(18,14,38,", scale: 1.2, opacity: 0.4, speed: 0.2 },
      { color: "rgba(22,16,44,", scale: 1.5, opacity: 0.2, speed: 0.5 },
    ],
    geometryHint: "floating",
    vanishingPoint: { x: 50, y: 38 },
  },
  memory_void: {
    perspectiveOrigin: "50% 50%",
    depthLayers: [
      { color: "rgba(6,6,20,", scale: 1, opacity: 0.95, speed: 0 },
      { color: "rgba(10,10,30,", scale: 1.6, opacity: 0.35, speed: 0.5 },
      { color: "rgba(14,14,40,", scale: 2.5, opacity: 0.15, speed: 1.0 },
    ],
    geometryHint: "void",
    vanishingPoint: { x: 50, y: 50 },
  },
};

// 时间 → 光线滤镜
export const TIME_FILTERS: Record<TimeOfDay, { brightness: number; colorTemp: string; shadowOpacity: number }> = {
  morning:   { brightness: 1.1, colorTemp: "rgba(255,240,220,0.08)", shadowOpacity: 0.1 },
  afternoon: { brightness: 1.0, colorTemp: "rgba(255,250,240,0.04)", shadowOpacity: 0.15 },
  night:     { brightness: 0.7, colorTemp: "rgba(20,25,60,0.35)", shadowOpacity: 0.4 },
  memory_time: { brightness: 0.85, colorTemp: "rgba(30,20,50,0.2)", shadowOpacity: 0.25 },
};