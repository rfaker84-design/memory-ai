/* ════════════════════════════════════════════════════════
   忆见 MemoryAI — Spatial Narrative System V1
   空间叙事 · 四阶段情绪弧 · 事件驱动
   ════════════════════════════════════════════════════════ */

import type { EmotionState, VisualPreset } from "../visual-ai-controller";

/* ── Narrative Phase ─────────────────────────────────── */
export type NarrativePhase = "LONELINESS" | "AWAKENING" | "APPROACH" | "CONNECTION";

export interface PhaseConfig {
  phase: NarrativePhase;
  duration: number;          // seconds
  emotion: EmotionState;
  narrative: string;
  fogDensity: number;
  ambientIntensity: number;
  bloomIntensity: number;
  lightColor: string;
  cameraSpeed: number;
  particleOpacity: number;
}

export const NARRATIVE_PHASES: PhaseConfig[] = [
  {
    phase: "LONELINESS",
    duration: 5,
    emotion: "sad",
    narrative: "你独自进入这片空间。黑暗安静，只有微弱的星点闪烁。",
    fogDensity: 0.04,
    ambientIntensity: 0.03,
    bloomIntensity: 0.4,
    lightColor: "#C8966A",
    cameraSpeed: 0.06,
    particleOpacity: 0.3,
  },
  {
    phase: "AWAKENING",
    duration: 7,
    emotion: "memory",
    narrative: "远处出现温暖的光。记忆正在被唤醒——月亮亮了起来。",
    fogDensity: 0.032,
    ambientIntensity: 0.07,
    bloomIntensity: 0.7,
    lightColor: "#FFD2A6",
    cameraSpeed: 0.09,
    particleOpacity: 0.55,
  },
  {
    phase: "APPROACH",
    duration: 8,
    emotion: "thinking",
    narrative: "有一个存在体在靠近你。它在看着你——你被看见了。",
    fogDensity: 0.028,
    ambientIntensity: 0.1,
    bloomIntensity: 0.85,
    lightColor: "#FFE0C0",
    cameraSpeed: 0.12,
    particleOpacity: 0.7,
  },
  {
    phase: "CONNECTION",
    duration: Infinity,
    emotion: "calm",
    narrative: "连接已经建立。从现在起，这个空间会对你做出回应。",
    fogDensity: 0.025,
    ambientIntensity: 0.07,
    bloomIntensity: 0.8,
    lightColor: "#FFD2A6",
    cameraSpeed: 0.11,
    particleOpacity: 0.55,
  },
];

/* ── Narrative Events ────────────────────────────────── */
export type NarrativeEvent =
  | "ON_ENTER_UNIVERSE"
  | "ON_PHASE_LONELINESS"
  | "ON_PHASE_AWAKENING"
  | "ON_PHASE_APPROACH"
  | "ON_PHASE_CONNECTION"
  | "ON_NEAR_ENTITY"
  | "ON_LOOK_AT_ENTITY"
  | "ON_IDLE_LONG";

export interface EventPayload {
  event: NarrativeEvent;
  elapsed: number;
  phase: NarrativePhase;
  data?: Record<string, unknown>;
}

/* ── Get current phase from elapsed time ──────────────── */
export function getPhaseFromTime(elapsed: number): { config: PhaseConfig; progress: number } {
  let accumulated = 0;
  for (const phase of NARRATIVE_PHASES) {
    if (elapsed < accumulated + phase.duration) {
      return { config: phase, progress: (elapsed - accumulated) / phase.duration };
    }
    accumulated += phase.duration;
  }
  // Fallback to last phase
  const last = NARRATIVE_PHASES[NARRATIVE_PHASES.length - 1];
  return { config: last, progress: 1 };
}

/* ── Convert narrative phase to visual preset ─────────── */
export function phaseToPreset(config: PhaseConfig): VisualPreset {
  return {
    fogDensity: config.fogDensity / 0.025, // normalize to our base density
    fogColor: "#0B0A08",
    ambientIntensity: config.ambientIntensity,
    bloomIntensity: config.bloomIntensity,
    pointLightBoost: 1.0,
    lightColor: config.lightColor,
    cameraSpeed: config.cameraSpeed,
    cameraFloatAmp: 0.08,
    particleOpacity: config.particleOpacity,
    description: config.narrative,
  };
}