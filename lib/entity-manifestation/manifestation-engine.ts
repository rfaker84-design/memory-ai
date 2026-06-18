/* ============================================================
   忆见 MemoryAI — AI Entity Manifestation System V1
   4-stage emergence: VOID → ENERGY → FORM → FULL PRESENCE
   Particle coalescence · Fog collapse · Light birth · Camera response
   ============================================================ */

import type { EmotionState } from "../visual-ai-controller";

/* ── Manifestation Stage ────────────────────────────── */
export type ManifestStage = 
  | "VOID_PRESENCE"      // 虚无感 — space perturbation only
  | "ENERGY_COALESCE"    // 能量聚合 — particles gathering, fog thickening
  | "FORM_EMERGENCE"     // 形态出现 — silhouette visible, semi-transparent
  | "FULL_PRESENCE";     // 完全存在 — solid, interactive, breathing

/* ── Manifestation State per Entity ─────────────────── */
export interface ManifestState {
  entityId: string;
  stage: ManifestStage;
  progress: number;           // 0–1 within current stage
  totalElapsed: number;       // seconds since manifestation started
  started: boolean;           // has manifestation begun?
  completed: boolean;         // has reached FULL_PRESENCE?
  stageDurations: Record<ManifestStage, number>; // seconds per stage
  particleCount: number;      // coalescing particles
  fogDensityLocal: number;    // local fog density around entity
  lightIntensity: number;     // 0–1, growing light
  formOpacity: number;        // 0–1, entity body opacity
  cameraAttractionActive: boolean;
}

/* ── Stage Timing (seconds) ─────────────────────────── */
const DEFAULT_STAGE_DURATIONS: Record<ManifestStage, number> = {
  VOID_PRESENCE:    2.0,   // space perturbation
  ENERGY_COALESCE:  3.0,   // particles gathering
  FORM_EMERGENCE:   3.0,   // shape solidifying
  FULL_PRESENCE:    Infinity,
};

/* ── Visual Parameters per Stage ────────────────────── */
export interface ManifestVisuals {
  particleCount: number;         // coalescing particles visible
  particleSpread: number;        // how spread out (large→small as coalescing)
  particleOpacity: number;
  localFogDensity: number;       // extra fog around entity
  bodyOpacity: number;           // entity mesh opacity
  lightIntensity: number;        // 0–1
  glowRadius: number;            // aura scale multiplier
  cameraAttraction: number;      // how strongly camera pulls toward this entity
  breathingActive: boolean;      // breathing animation is active
}

export const STAGE_VISUALS: Record<ManifestStage, ManifestVisuals> = {
  VOID_PRESENCE: {
    particleCount: 30, particleSpread: 8, particleOpacity: 0.15,
    localFogDensity: 0.5, bodyOpacity: 0, lightIntensity: 0,
    glowRadius: 0.1, cameraAttraction: 0.1, breathingActive: false,
  },
  ENERGY_COALESCE: {
    particleCount: 80, particleSpread: 3, particleOpacity: 0.45,
    localFogDensity: 1.5, bodyOpacity: 0.05, lightIntensity: 0.15,
    glowRadius: 0.4, cameraAttraction: 0.4, breathingActive: false,
  },
  FORM_EMERGENCE: {
    particleCount: 50, particleSpread: 1.2, particleOpacity: 0.6,
    localFogDensity: 1.2, bodyOpacity: 0.55, lightIntensity: 0.5,
    glowRadius: 0.8, cameraAttraction: 0.7, breathingActive: true,
  },
  FULL_PRESENCE: {
    particleCount: 20, particleSpread: 0.8, particleOpacity: 0.3,
    localFogDensity: 0.8, bodyOpacity: 1.0, lightIntensity: 1.0,
    glowRadius: 1.0, cameraAttraction: 0.2, breathingActive: true,
  },
};

/* ── Create Initial Manifest State ─────────────────── */
export function createManifestState(entityId: string): ManifestState {
  return {
    entityId,
    stage: "VOID_PRESENCE",
    progress: 0,
    totalElapsed: 0,
    started: false,
    completed: false,
    stageDurations: { ...DEFAULT_STAGE_DURATIONS },
    particleCount: STAGE_VISUALS.VOID_PRESENCE.particleCount,
    fogDensityLocal: STAGE_VISUALS.VOID_PRESENCE.localFogDensity,
    lightIntensity: STAGE_VISUALS.VOID_PRESENCE.lightIntensity,
    formOpacity: STAGE_VISUALS.VOID_PRESENCE.bodyOpacity,
    cameraAttractionActive: false,
  };
}

/* ── Start Manifestation ───────────────────────────── */
export function startManifestation(state: ManifestState, delay = 0): ManifestState {
  if (state.started) return state;
  return {
    ...state,
    started: true,
    totalElapsed: -delay, // negative delay for staggering
    stage: "VOID_PRESENCE",
    progress: 0,
  };
}

/* ── Update Manifestation (call every frame) ────────── */
export function updateManifestation(state: ManifestState, delta: number, emotion?: EmotionState): ManifestState {
  if (!state.started || state.completed) return state;

  state.totalElapsed += delta;
  if (state.totalElapsed < 0) return state; // still in delay

  // Determine current stage and progress
  let accumulated = 0;
  let currentStage: ManifestStage = "VOID_PRESENCE";
  let stageProgress = 0;

  const stages: ManifestStage[] = ["VOID_PRESENCE", "ENERGY_COALESCE", "FORM_EMERGENCE", "FULL_PRESENCE"];
  
  for (const stage of stages) {
    const duration = state.stageDurations[stage];
    if (state.totalElapsed < accumulated + duration) {
      currentStage = stage;
      stageProgress = (state.totalElapsed - accumulated) / duration;
      break;
    }
    accumulated += duration;
    if (stage === "FULL_PRESENCE") {
      currentStage = "FULL_PRESENCE";
      stageProgress = 1;
    }
  }

  // Stage transition
  if (currentStage !== state.stage) {
    state.stage = currentStage;
    state.progress = 0;
  }
  state.progress = Math.min(1, stageProgress);

  if (currentStage === "FULL_PRESENCE" && state.progress >= 1) {
    state.completed = true;
  }

  // Lerp visual parameters toward target for current stage
  const target = STAGE_VISUALS[currentStage];
  const lerpSpeed = currentStage === "ENERGY_COALESCE" ? 0.06 : 0.04;
  
  // Emotion modulates certain visuals
  let glowMul = 1.0;
  if (emotion) {
    switch (emotion) {
      case "happy": glowMul = 1.2; break;
      case "sad": glowMul = 0.7; break;
      case "memory": glowMul = 1.1; break;
      default: glowMul = 1.0;
    }
  }

  state.particleCount += (target.particleCount - state.particleCount) * lerpSpeed;
  state.fogDensityLocal += (target.localFogDensity - state.fogDensityLocal) * lerpSpeed;
  state.lightIntensity += (target.lightIntensity * glowMul - state.lightIntensity) * lerpSpeed;
  state.formOpacity += (target.bodyOpacity - state.formOpacity) * lerpSpeed;
  state.cameraAttractionActive = target.cameraAttraction > 0.3;

  return state;
}

/* ── Get lerped visuals between two stages ──────────── */
export function getManifestVisuals(
  state: ManifestState,
  emotion?: EmotionState,
): ManifestVisuals {
  const target = STAGE_VISUALS[state.stage];
  let glowMul = 1.0;
  if (emotion) {
    switch (emotion) {
      case "happy": glowMul = 1.25; break;
      case "sad": glowMul = 0.65; break;
      case "memory": glowMul = 1.15; break;
      case "thinking": glowMul = 1.05; break;
      default: glowMul = 1.0;
    }
  }
  return {
    ...target,
    lightIntensity: target.lightIntensity * glowMul,
    glowRadius: target.glowRadius * (state.completed ? 1 : state.progress),
    particleOpacity: target.particleOpacity * (state.completed ? 0.3 : 1),
  };
}

/* ── Get stage description (narrative flavor) ────────── */
export function getStageDescription(stage: ManifestStage): string {
  switch (stage) {
    case "VOID_PRESENCE":   return "空间中泛起微弱的扰动……";
    case "ENERGY_COALESCE": return "光点正在聚集，意识即将成形……";
    case "FORM_EMERGENCE":  return "一个存在体正在浮现……";
    case "FULL_PRESENCE":   return "它在这里。";
  }
}
