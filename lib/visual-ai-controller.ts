/* ════════════════════════════════════════════════════════
   忆见 MemoryAI — AI Visual Auto-Tuning Controller
   Emotion → Fog / Light / Bloom / Camera / Particles
   ════════════════════════════════════════════════════════ */

export type EmotionState = "calm" | "memory" | "sad" | "happy" | "thinking";

/* ── Visual Preset per Emotion ───────────────────────── */
export interface VisualPreset {
  fogDensity: number;       // fog far distance multiplier
  fogColor: string;
  ambientIntensity: number;
  bloomIntensity: number;
  pointLightBoost: number;  // multiplier on base intensity
  lightColor: string;
  cameraSpeed: number;      // dolly speed multiplier
  cameraFloatAmp: number;   // Y-float amplitude
  particleOpacity: number;
  description: string;
}

export const EMOTION_PRESETS: Record<EmotionState, VisualPreset> = {
  calm: {
    fogDensity: 1.0,
    fogColor: "#0B0A08",
    ambientIntensity: 0.07,
    bloomIntensity: 0.8,
    pointLightBoost: 1.0,
    lightColor: "#FFD2A6",
    cameraSpeed: 0.11,
    cameraFloatAmp: 0.12,
    particleOpacity: 0.55,
    description: "soft warm glow, stable slow drift",
  },
  memory: {
    fogDensity: 0.85,
    fogColor: "#1A1410",
    ambientIntensity: 0.13,
    bloomIntensity: 0.95,
    pointLightBoost: 1.3,
    lightColor: "#FFD2A6",
    cameraSpeed: 0.08,
    cameraFloatAmp: 0.08,
    particleOpacity: 0.7,
    description: "thicker warm haze, golden bloom, slow push-in",
  },
  sad: {
    fogDensity: 0.65,
    fogColor: "#0E0C09",
    ambientIntensity: 0.06,
    bloomIntensity: 0.55,
    pointLightBoost: 0.7,
    lightColor: "#C8966A",
    cameraSpeed: 0.06,
    cameraFloatAmp: 0.05,
    particleOpacity: 0.35,
    description: "dim amber, thicker fog, slight pull-back feel",
  },
  happy: {
    fogDensity: 1.15,
    fogColor: "#0B0A08",
    ambientIntensity: 0.15,
    bloomIntensity: 1.15,
    pointLightBoost: 1.6,
    lightColor: "#FFE0C0",
    cameraSpeed: 0.14,
    cameraFloatAmp: 0.18,
    particleOpacity: 0.75,
    description: "bright warm gold, high bloom, gentle float boost",
  },
  thinking: {
    fogDensity: 1.0,
    fogColor: "#0B0A08",
    ambientIntensity: 0.07,
    bloomIntensity: 0.8,
    pointLightBoost: 1.0,
    lightColor: "#FFF3E8",
    cameraSpeed: 0.10,
    cameraFloatAmp: 0.14,
    particleOpacity: 0.75,
    description: "pulsing warm white, micro camera oscillation",
  },
};

/* ── Lerp helper ─────────────────────────────────────── */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(Math.max(t, 0), 1);
}

export function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const aR = (ah >> 16) & 0xff, aG = (ah >> 8) & 0xff, aB = ah & 0xff;
  const bR = (bh >> 16) & 0xff, bG = (bh >> 8) & 0xff, bB = bh & 0xff;
  const r = Math.round(aR + (bR - aR) * t);
  const g = Math.round(aG + (bG - aG) * t);
  const bl = Math.round(aB + (bB - aB) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/* ── Active visual state (lerped toward target) ──────── */
export function lerpPreset(current: VisualPreset, target: VisualPreset, t: number): VisualPreset {
  return {
    fogDensity: lerp(current.fogDensity, target.fogDensity, t),
    fogColor: lerpColor(current.fogColor, target.fogColor, t),
    ambientIntensity: lerp(current.ambientIntensity, target.ambientIntensity, t),
    bloomIntensity: lerp(current.bloomIntensity, target.bloomIntensity, t),
    pointLightBoost: lerp(current.pointLightBoost, target.pointLightBoost, t),
    lightColor: lerpColor(current.lightColor, target.lightColor, t),
    cameraSpeed: lerp(current.cameraSpeed, target.cameraSpeed, t),
    cameraFloatAmp: lerp(current.cameraFloatAmp, target.cameraFloatAmp, t),
    particleOpacity: lerp(current.particleOpacity, target.particleOpacity, t),
    description: target.description,
  };
}