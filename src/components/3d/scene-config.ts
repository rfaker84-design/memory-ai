/* 忆见 MemoryAI — 3D Scene Config */

export const COLORS = {
  bg: "#05070A",
  gold: "#FFD2A6",
  warmGold: "#FFB37C",
  white: "#FFF3E8",
  fog: "#1A1410",
} as const;

export const GATE = {
  width: 2.4,
  height: 3.6,
  depth: 0.12,
  frameWidth: 0.08,
  gap: 0.06,
  emissiveIntensity: 1.8,
} as const;

export const CAMERA = {
  startZ: 7.5,
  endZ: 0.8,
  startY: 0.4,
  endY: 0.6,
  fov: 45,
} as const;

export const TIMELINE = {
  titleFade: 0.4,
  doorGlow: 1.0,
  doorOpen: 1.8,
  dollyStart: 2.2,
  silhouettes: 2.6,
  passThrough: 3.4,
  bloomExit: 4.0,
  total: 4.8,
} as const;