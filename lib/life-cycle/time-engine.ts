/* ============================================================
   忆见 MemoryAI — Time Engine V1
   时间流 · 记忆衰减 · 关系老化 · 世界节奏
   ============================================================ */

import type { EmotionState } from "../visual-ai-controller";

/* ── Time State ───────────────────────────────────────── */
export interface TimeState {
  totalElapsed: number;        // total seconds since universe birth
  sessionElapsed: number;      // seconds in current session
  lastInteraction: number;     // timestamp of last user interaction
  dayCycle: number;            // 0-1, simulates day rhythm
  phaseCount: number;          // how many phase changes have occurred
  currentPhase: "dawn" | "day" | "dusk" | "night";
}

/* ── Decay Parameters ─────────────────────────────────── */
export interface DecayRates {
  memoryDecayPerMinute: number;    // how fast memory fades without interaction
  trustDecayPerMinute: number;     // how fast trust erodes
  emotionStability: number;        // 0-1, higher = emotions change slower
  relationshipDriftPerMinute: number; // how fast relationships drift
}

export const DEFAULT_DECAY: DecayRates = {
  memoryDecayPerMinute: 0.08,
  trustDecayPerMinute: 0.04,
  emotionStability: 0.7,
  relationshipDriftPerMinute: 0.02,
};

/* ── Create Time State ────────────────────────────────── */
export function createTimeState(): TimeState {
  return {
    totalElapsed: 0,
    sessionElapsed: 0,
    lastInteraction: Date.now(),
    dayCycle: 0,
    phaseCount: 0,
    currentPhase: "dawn",
  };
}

/* ── Update Time ──────────────────────────────────────── */
export function updateTime(state: TimeState, deltaSeconds: number): TimeState {
  state.totalElapsed += deltaSeconds;
  state.sessionElapsed += deltaSeconds;

  // Simulated day cycle (15 real minutes = 1 full day)
  const DAY_MINUTES = 15 * 60; // 15 min real = 1 day
  state.dayCycle = (state.totalElapsed % DAY_MINUTES) / DAY_MINUTES;

  // Phase based on day cycle
  if (state.dayCycle < 0.25) state.currentPhase = "dawn";
  else if (state.dayCycle < 0.5) state.currentPhase = "day";
  else if (state.dayCycle < 0.75) state.currentPhase = "dusk";
  else state.currentPhase = "night";

  return state;
}

/* ── Compute Decay ────────────────────────────────────── */
export function computeDecay(
  value: number,
  minutesSinceInteraction: number,
  rate: number,
): number {
  const decay = rate * minutesSinceInteraction;
  return Math.max(0, value - decay);
}

/* ── Phase → Visual Modifier ──────────────────────────── */
export interface PhaseVisualModifier {
  ambientMul: number;
  fogMul: number;
  lightWarmth: number;
}

export function phaseToVisual(phase: TimeState["currentPhase"]): PhaseVisualModifier {
  switch (phase) {
    case "dawn":  return { ambientMul: 0.7, fogMul: 1.1, lightWarmth: 0.5 };
    case "day":   return { ambientMul: 1.0, fogMul: 1.0, lightWarmth: 1.0 };
    case "dusk":  return { ambientMul: 0.8, fogMul: 1.15, lightWarmth: 0.7 };
    case "night": return { ambientMul: 0.4, fogMul: 1.3, lightWarmth: 0.3 };
  }
}

/* ── Interaction tracking ─────────────────────────────── */
export function recordInteraction(state: TimeState): TimeState {
  state.lastInteraction = Date.now();
  return state;
}

export function minutesSinceInteraction(state: TimeState): number {
  return (Date.now() - state.lastInteraction) / 60000;
}
