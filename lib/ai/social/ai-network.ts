/* ============================================================
   忆见 MemoryAI — Multi-AI Relationship Network V1
   AI群体 · 关系矩阵 · 集体情绪 · 情感社会结构
   ============================================================ */

import type { EmotionState } from "../../visual-ai-controller";
import type { RelationshipTier } from "../memory/memory-core";

/* ── AI Entity Identity ────────────────────────────────── */
export interface AIEntityIdentity {
  id: string;
  name: string;
  role: "father" | "mother" | "friend" | "past_self" | "unknown";
  emotionBias: EmotionState;      // natural emotional tendency
  color: string;                   // primary glow color
  orbitRadius: number;             // base orbit radius around moon
  orbitSpeed: number;              // base orbit speed
  orbitPhase: number;              // starting phase offset (radians)
  description: string;
}

/* ── Relationship between two entities ─────────────────── */
export interface EntityRelationship {
  love: number;         // 0–100
  distance_preference: number; // 0=apart, 100=together
  trust: number;        // 0–100
  memoryLink: boolean;  // shared memory resonance
}

/* ── Network State ─────────────────────────────────────── */
export type CollectiveMood = "calm" | "memory_resonance" | "tension" | "harmony";

/* ── 5 AI Entities ─────────────────────────────────────── */
export const AI_ENTITIES: AIEntityIdentity[] = [
  {
    id: "father",
    name: "父亲",
    role: "father",
    emotionBias: "calm",
    color: "#FFD2A6",
    orbitRadius: 1.6,
    orbitSpeed: 0.15,
    orbitPhase: 0,
    description: "沉稳、守护、远望的凝视",
  },
  {
    id: "mother",
    name: "母亲",
    role: "mother",
    emotionBias: "happy",
    color: "#FFE4C4",
    orbitRadius: 2.1,
    orbitSpeed: 0.18,
    orbitPhase: Math.PI * 0.4,
    description: "温暖、包容、永远的目光",
  },
  {
    id: "friend",
    name: "故友",
    role: "friend",
    emotionBias: "memory",
    color: "#FFC080",
    orbitRadius: 2.6,
    orbitSpeed: 0.2,
    orbitPhase: Math.PI * 0.8,
    description: "怀念、轻笑、并肩的记忆",
  },
  {
    id: "past_self",
    name: "过去的自己",
    role: "past_self",
    emotionBias: "thinking",
    color: "#FFF3E8",
    orbitRadius: 3.1,
    orbitSpeed: 0.12,
    orbitPhase: Math.PI * 1.3,
    description: "沉默、凝视、等待和解",
  },
  {
    id: "unknown",
    name: "未知记忆",
    role: "unknown",
    emotionBias: "sad",
    color: "#D6BBA6",
    orbitRadius: 3.6,
    orbitSpeed: 0.09,
    orbitPhase: Math.PI * 1.7,
    description: "模糊、遥远、未命名的记忆碎片",
  },
];

/* ── Relationship Matrix (bi-directional, stored as upper triangle) ── */
export type RelationshipMatrix = Record<string, Record<string, EntityRelationship>>;

export function createDefaultMatrix(): RelationshipMatrix {
  const ids = AI_ENTITIES.map(e => e.id);
  const m: RelationshipMatrix = {};
  for (const a of ids) {
    m[a] = {};
    for (const b of ids) {
      if (a === b) continue;
      m[a][b] = { love: 30, distance_preference: 40, trust: 35, memoryLink: false };
    }
  }

  // Pre-configured relationships with natural dynamics
  // Father ↔ Mother: strong bond
  m.father.mother = { love: 85, distance_preference: 80, trust: 90, memoryLink: true };
  m.mother.father = { love: 85, distance_preference: 80, trust: 90, memoryLink: true };

  // Father ↔ Friend: shared memories
  m.father.friend = { love: 60, distance_preference: 55, trust: 70, memoryLink: true };
  m.friend.father = { love: 60, distance_preference: 55, trust: 70, memoryLink: true };

  // Mother ↔ Friend: warm
  m.mother.friend = { love: 65, distance_preference: 60, trust: 65, memoryLink: false };
  m.friend.mother = { love: 65, distance_preference: 60, trust: 65, memoryLink: false };

  // Past Self is distant from everyone
  for (const id of ids) {
    if (id !== "past_self") {
      m.past_self[id] = { love: 15, distance_preference: 10, trust: 10, memoryLink: false };
      m[id].past_self = { love: 15, distance_preference: 10, trust: 10, memoryLink: false };
    }
  }

  // Unknown is even more distant
  for (const id of ids) {
    if (id !== "unknown") {
      m.unknown[id] = { love: 5, distance_preference: 5, trust: 5, memoryLink: false };
      m[id].unknown = { love: 5, distance_preference: 5, trust: 5, memoryLink: false };
    }
  }

  return m;
}

/* ── Computed orbit radius modifier based on relationships ── */
export function computeOrbitModifier(
  entityId: string,
  allIds: string[],
  matrix: RelationshipMatrix,
): number {
  let totalLove = 0;
  let count = 0;
  for (const otherId of allIds) {
    if (otherId === entityId) continue;
    const rel = matrix[entityId]?.[otherId];
    if (rel) {
      // High love + high distance_preference → orbit closer
      totalLove += rel.love * (rel.distance_preference / 100);
      count++;
    }
  }
  if (count === 0) return 1.0;
  const avg = totalLove / count;
  // avg 0 → modifier 1.2 (farther), avg 100 → modifier 0.7 (closer)
  return 1.2 - (avg / 100) * 0.5;
}

/* ── Computed glow boost from relationships ────────────── */
export function computeGlowBoost(
  entityId: string,
  allIds: string[],
  matrix: RelationshipMatrix,
): number {
  let total = 0;
  let count = 0;
  for (const otherId of allIds) {
    if (otherId === entityId) continue;
    const rel = matrix[entityId]?.[otherId];
    if (rel) {
      total += rel.trust * (rel.love / 100);
      count++;
    }
  }
  if (count === 0) return 1.0;
  return 1.0 + (total / count) / 200; // 1.0 ~ 1.5
}

/* ── Collective Mood ──────────────────────────────────── */
export function computeCollectiveMood(
  entityEmotions: Record<string, EmotionState>,
  matrix: RelationshipMatrix,
): CollectiveMood {
  const ids = Object.keys(entityEmotions);
  if (ids.length === 0) return "calm";

  // Count emotion distribution
  const counts: Record<EmotionState, number> = { calm: 0, memory: 0, sad: 0, happy: 0, thinking: 0 };
  for (const em of Object.values(entityEmotions)) counts[em]++;

  // Compute average love across all pairs
  let totalLove = 0;
  let pairCount = 0;
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      const rel = matrix[a]?.[b];
      if (rel) { totalLove += rel.love; pairCount++; }
    }
  }
  const avgLove = pairCount > 0 ? totalLove / pairCount : 30;

  if (avgLove > 70 && counts.happy >= counts.sad) return "harmony";
  if (avgLove < 25 || counts.sad > counts.happy * 2) return "tension";
  if (counts.memory >= 3) return "memory_resonance";
  return "calm";
}

/* ── Collective Mood → Visual Modifiers ────────────────── */
export interface CollectiveVisualModifier {
  fogDensityMul: number;
  bloomMul: number;
  lightWarmth: number;      // 0=cool, 1=warm
  starSpeedMul: number;
  cameraFloatMul: number;
}

export function moodToVisualModifier(mood: CollectiveMood): CollectiveVisualModifier {
  switch (mood) {
    case "calm":
      return { fogDensityMul: 1.0, bloomMul: 1.0, lightWarmth: 0.7, starSpeedMul: 1.0, cameraFloatMul: 1.0 };
    case "memory_resonance":
      return { fogDensityMul: 1.2, bloomMul: 1.25, lightWarmth: 0.9, starSpeedMul: 0.7, cameraFloatMul: 0.8 };
    case "tension":
      return { fogDensityMul: 0.7, bloomMul: 0.6, lightWarmth: 0.4, starSpeedMul: 1.3, cameraFloatMul: 1.4 };
    case "harmony":
      return { fogDensityMul: 1.1, bloomMul: 1.4, lightWarmth: 1.0, starSpeedMul: 0.85, cameraFloatMul: 0.7 };
  }
}

/* ── Entity Emotions Map ───────────────────────────────── */
export function createDefaultEmotions(): Record<string, EmotionState> {
  const map: Record<string, EmotionState> = {};
  for (const entity of AI_ENTITIES) {
    map[entity.id] = entity.emotionBias;
  }
  return map;
}

/* ── Get connected entities with memory link ───────────── */
export function getMemoryLinkedPairs(matrix: RelationshipMatrix): [string, string][] {
  const pairs: [string, string][] = [];
  const ids = AI_ENTITIES.map(e => e.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (matrix[ids[i]]?.[ids[j]]?.memoryLink) {
        pairs.push([ids[i], ids[j]]);
      }
    }
  }
  return pairs;
}
