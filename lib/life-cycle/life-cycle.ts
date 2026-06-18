/* ============================================================
   忆见 MemoryAI — Life Cycle System V1
   AI出生·成长·冲突·和解·淡化 · 关系生命周期 · 世界状态
   ============================================================ */

import type { EmotionState } from "../visual-ai-controller";
import type { RelationshipMatrix, CollectiveMood } from "../ai/social/ai-network";
import { AI_ENTITIES } from "../ai/social/ai-network";
import type { TimeState, DecayRates } from "./time-engine";
import { DEFAULT_DECAY, minutesSinceInteraction, computeDecay, phaseToVisual } from "./time-engine";

/* ── AI Entity Lifecycle ─────────────────────────────── */
export type EntityLifeStage = "BIRTH" | "GROWTH" | "STABLE" | "CONFLICT" | "RECONCILE" | "FADING";

/* ── Relationship Lifecycle ───────────────────────────── */
export type RelationshipStage = "UNKNOWN" | "ACQUAINTED" | "FRIEND" | "CLOSE" | "DISTANT" | "FORGOTTEN";

/* ── World State ──────────────────────────────────────── */
export type WorldState = "CALM_WORLD" | "MEMORY_WORLD" | "TENSION_WORLD" | "HARMONY_WORLD" | "EMPTY_WORLD";

/* ── Entity Lifecycle Data ────────────────────────────── */
export interface EntityLifecycle {
  entityId: string;
  stage: EntityLifeStage;
  stageEnteredAt: number;          // totalElapsed when entered this stage
  daysInStage: number;             // sim days in current stage
  interactionsInStage: number;
  conflictsInStage: number;
  opacity: number;                 // 0-1, visual opacity (FADING → 0)
  glowMultiplier: number;          // 0-2, visual glow
  transparency: number;            // 0-1, entity transparency (FADING → 1)
}

/* ── Visual Effects per Life Stage ────────────────────── */
export interface StageVisualEffect {
  opacity: number;
  glowMul: number;
  orbitRadiusMul: number;
  breathingSpeedMul: number;
  particleLocalBoost: number;
}

export const STAGE_VISUALS: Record<EntityLifeStage, StageVisualEffect> = {
  BIRTH:     { opacity: 0.5, glowMul: 0.6,  orbitRadiusMul: 1.4, breathingSpeedMul: 0.5, particleLocalBoost: 0.3 },
  GROWTH:    { opacity: 0.8, glowMul: 1.1,  orbitRadiusMul: 1.1, breathingSpeedMul: 1.2, particleLocalBoost: 0.6 },
  STABLE:    { opacity: 1.0, glowMul: 1.0,  orbitRadiusMul: 1.0, breathingSpeedMul: 1.0, particleLocalBoost: 0.5 },
  CONFLICT:  { opacity: 0.85, glowMul: 0.7, orbitRadiusMul: 1.3, breathingSpeedMul: 1.5, particleLocalBoost: 0.2 },
  RECONCILE: { opacity: 0.9, glowMul: 1.3,  orbitRadiusMul: 0.85, breathingSpeedMul: 0.8, particleLocalBoost: 0.8 },
  FADING:    { opacity: 0.3, glowMul: 0.3,  orbitRadiusMul: 1.6, breathingSpeedMul: 0.3, particleLocalBoost: 0.1 },
};

/* ── Create Entity Lifecycle ──────────────────────────── */
export function createEntityLifecycle(entityId: string, totalElapsed: number): EntityLifecycle {
  return {
    entityId,
    stage: "BIRTH",
    stageEnteredAt: totalElapsed,
    daysInStage: 0,
    interactionsInStage: 0,
    conflictsInStage: 0,
    opacity: 0.5,
    glowMultiplier: 0.6,
    transparency: 0.5,
  };
}

/* ── Update Entity Lifecycle ─────────────────────────── */
export function updateEntityLifecycle(
  lc: EntityLifecycle,
  time: TimeState,
  entityEmotion: EmotionState,
  trustLevel: number,
  interactionCount: number,
  decay: DecayRates = DEFAULT_DECAY,
): EntityLifecycle {
  const minsSince = minutesSinceInteraction(time);
  const simDays = time.totalElapsed / (15 * 60); // 15 min = 1 day
  lc.daysInStage = simDays - lc.stageEnteredAt / (15 * 60);

  // Determine next stage
  let nextStage: EntityLifeStage = lc.stage;

  switch (lc.stage) {
    case "BIRTH":
      // After ~5 interactions → GROWTH
      if (interactionCount >= 5 && trustLevel > 15) nextStage = "GROWTH";
      break;
    case "GROWTH":
      // After ~15 interactions + trust > 40 → STABLE
      if (interactionCount >= 15 && trustLevel > 40) nextStage = "STABLE";
      // If time decay pushes trust down → CONFLICT
      if (minsSince > 10 && trustLevel < 25) nextStage = "CONFLICT";
      break;
    case "STABLE":
      // Conflict event count → CONFLICT
      if (lc.conflictsInStage >= 2) nextStage = "CONFLICT";
      // Long idle → FADING
      if (minsSince > 20 && interactionCount < 20) nextStage = "FADING";
      break;
    case "CONFLICT":
      // Enough interactions → RECONCILE
      if (lc.interactionsInStage >= 5 && trustLevel > 30) nextStage = "RECONCILE";
      // Prolonged conflict → FADING
      if (lc.daysInStage > 3 && trustLevel < 15) nextStage = "FADING";
      break;
    case "RECONCILE":
      // Stabilized → STABLE
      if (lc.interactionsInStage >= 8 && trustLevel > 50) nextStage = "STABLE";
      // Disturbance → CONFLICT
      if (lc.conflictsInStage >= 1) nextStage = "CONFLICT";
      break;
    case "FADING":
      // Re-engagement → RECONCILE
      if (interactionCount > lc.interactionsInStage + 5 && minsSince < 5) nextStage = "RECONCILE";
      break;
  }

  // Stage transition
  if (nextStage !== lc.stage) {
    console.log(`[LifeCycle] ${lc.entityId}: ${lc.stage} → ${nextStage} (trust:${trustLevel} int:${interactionCount})`);
    lc.stage = nextStage;
    lc.stageEnteredAt = time.totalElapsed;
    lc.daysInStage = 0;
    lc.interactionsInStage = 0;
    lc.conflictsInStage = 0;
  }

  // Apply stage visuals (lerp toward target)
  const target = STAGE_VISUALS[lc.stage];
  const lerpSpeed = 0.03;
  lc.opacity += (target.opacity - lc.opacity) * lerpSpeed;
  lc.glowMultiplier += (target.glowMul - lc.glowMultiplier) * lerpSpeed;
  lc.transparency = 1 - lc.opacity;

  return lc;
}

/* ── Relationship Stage ───────────────────────────────── */
export function computeRelationshipStage(
  love: number,
  trust: number,
  interactionCount: number,
  minsSince: number,
): RelationshipStage {
  if (minsSince > 30 && love < 10) return "FORGOTTEN";
  if (love > 80 && trust > 80) return "CLOSE";
  if (love > 50 && trust > 50) return "FRIEND";
  if (love > 20 || trust > 20) return "ACQUAINTED";
  if (minsSince > 15 && love < 15) return "DISTANT";
  if (love < 10 && trust < 10) return "UNKNOWN";
  return "ACQUAINTED";
}

/* ── Relationship Stage → Modifier ────────────────────── */
export interface RelationshipStageModifier {
  orbitCloseness: number;  // 1=normal, 0.5=closer, 1.5=farther
  lightLinkStrength: number; // 0-1
  emotionSyncRate: number;   // how fast emotions sync
}

export function relationshipStageModifier(stage: RelationshipStage): RelationshipStageModifier {
  switch (stage) {
    case "UNKNOWN":     return { orbitCloseness: 1.5, lightLinkStrength: 0,   emotionSyncRate: 0 };
    case "ACQUAINTED":  return { orbitCloseness: 1.2, lightLinkStrength: 0.2, emotionSyncRate: 0.1 };
    case "FRIEND":      return { orbitCloseness: 1.0, lightLinkStrength: 0.5, emotionSyncRate: 0.3 };
    case "CLOSE":       return { orbitCloseness: 0.8, lightLinkStrength: 0.9, emotionSyncRate: 0.6 };
    case "DISTANT":     return { orbitCloseness: 1.6, lightLinkStrength: 0.1, emotionSyncRate: 0.05 };
    case "FORGOTTEN":   return { orbitCloseness: 1.8, lightLinkStrength: 0,   emotionSyncRate: 0 };
  }
}

/* ── World State ──────────────────────────────────────── */
export function computeWorldState(
  lifecycleMap: Record<string, EntityLifecycle>,
  collectiveMood: CollectiveMood,
  time: TimeState,
): WorldState {
  const stages = Object.values(lifecycleMap).map(lc => lc.stage);
  const fadingCount = stages.filter(s => s === "FADING").length;
  const conflictCount = stages.filter(s => s === "CONFLICT").length;
  const reconcileCount = stages.filter(s => s === "RECONCILE").length;
  const total = stages.length;

  if (fadingCount >= total * 0.5) return "EMPTY_WORLD";
  if (conflictCount >= total * 0.3) return "TENSION_WORLD";
  if (collectiveMood === "harmony" && reconcileCount >= 2) return "HARMONY_WORLD";
  if (collectiveMood === "memory_resonance") return "MEMORY_WORLD";
  return "CALM_WORLD";
}

/* ── World State → Universe Visual Modifier ───────────── */
export interface WorldVisualModifier {
  fogDensityMul: number;
  bloomMul: number;
  ambientMul: number;
  particleMul: number;
  colorShift: string;
}

export function worldStateToVisual(ws: WorldState): WorldVisualModifier {
  switch (ws) {
    case "CALM_WORLD":
      return { fogDensityMul: 1.0, bloomMul: 1.0, ambientMul: 1.0, particleMul: 1.0, colorShift: "#0B0A08" };
    case "MEMORY_WORLD":
      return { fogDensityMul: 1.1, bloomMul: 1.2, ambientMul: 1.1, particleMul: 1.3, colorShift: "#1A1410" };
    case "TENSION_WORLD":
      return { fogDensityMul: 1.3, bloomMul: 0.6, ambientMul: 0.7, particleMul: 0.6, colorShift: "#0E0C09" };
    case "HARMONY_WORLD":
      return { fogDensityMul: 0.85, bloomMul: 1.4, ambientMul: 1.3, particleMul: 1.5, colorShift: "#0B0A08" };
    case "EMPTY_WORLD":
      return { fogDensityMul: 1.5, bloomMul: 0.3, ambientMul: 0.4, particleMul: 0.3, colorShift: "#060608" };
  }
}
