/* ============================================================
   忆见 MemoryAI — Emotion Event Engine V1
   自动情绪事件 · AI社会剧情 · 宇宙动态叙事
   ============================================================ */

import type { EmotionState } from "../../visual-ai-controller";
import { setEmotion, getEmotionMetadata, onUserIdle } from "../emotion-engine";
import type { RelationshipMatrix } from "../../ai/social/ai-network";
import {
  AI_ENTITIES, computeCollectiveMood, moodToVisualModifier,
  getMemoryLinkedPairs, type CollectiveMood,
} from "../../ai/social/ai-network";

/* ── Event Types ────────────────────────────────────────── */
export type EmotionEventType =
  | "MEETING"
  | "MEMORY_TRIGGER"
  | "EMOTIONAL_SHIFT"
  | "CONFLICT"
  | "RECONCILIATION"
  | "ABSENCE"
  | "RESONANCE";

/* ── Event Data ──────────────────────────────────────────── */
export interface EmotionEvent {
  id: string;
  type: EmotionEventType;
  timestamp: number;
  sourceEntities: string[];    // entity IDs involved
  targetEntities: string[];
  emotion: EmotionState;
  intensity: number;           // 0–1
  description: string;
  effects: EventEffects;
}

/* ── Event Effects (what changes in the universe) ────────── */
export interface EventEffects {
  fogDensityDelta: number;     // additive change to fog multiplier
  bloomIntensityDelta: number; // additive change to bloom
  lightWarmthDelta: number;    // additive to warmth
  cameraSpeedMul: number;      // multiplier on camera speed
  particleBoost: number;       // multiplier on particle opacity
  entityOrbitShift: number;    // push/pull entities
  entityGlowBoost: number;     // glow multiplier
  duration: number;            // seconds the effect lasts
}

/* ── Event Effects Presets ───────────────────────────────── */
const EVENT_EFFECTS: Record<EmotionEventType, EventEffects> = {
  MEETING: {
    fogDensityDelta: -0.1, bloomIntensityDelta: 0.15, lightWarmthDelta: 0.1,
    cameraSpeedMul: 0.8, particleBoost: 0.15, entityOrbitShift: -0.15,
    entityGlowBoost: 0.2, duration: 12,
  },
  MEMORY_TRIGGER: {
    fogDensityDelta: 0.08, bloomIntensityDelta: 0.2, lightWarmthDelta: 0.15,
    cameraSpeedMul: 0.6, particleBoost: 0.25, entityOrbitShift: 0,
    entityGlowBoost: 0.15, duration: 15,
  },
  EMOTIONAL_SHIFT: {
    fogDensityDelta: 0.05, bloomIntensityDelta: 0.1, lightWarmthDelta: 0.05,
    cameraSpeedMul: 0.9, particleBoost: 0.1, entityOrbitShift: 0,
    entityGlowBoost: 0.1, duration: 10,
  },
  CONFLICT: {
    fogDensityDelta: 0.12, bloomIntensityDelta: -0.15, lightWarmthDelta: -0.15,
    cameraSpeedMul: 1.3, particleBoost: -0.1, entityOrbitShift: 0.2,
    entityGlowBoost: -0.1, duration: 14,
  },
  RECONCILIATION: {
    fogDensityDelta: -0.12, bloomIntensityDelta: 0.25, lightWarmthDelta: 0.2,
    cameraSpeedMul: 0.7, particleBoost: 0.3, entityOrbitShift: -0.2,
    entityGlowBoost: 0.25, duration: 16,
  },
  ABSENCE: {
    fogDensityDelta: 0.15, bloomIntensityDelta: -0.2, lightWarmthDelta: -0.2,
    cameraSpeedMul: 1.5, particleBoost: -0.15, entityOrbitShift: 0.1,
    entityGlowBoost: -0.15, duration: 20,
  },
  RESONANCE: {
    fogDensityDelta: -0.05, bloomIntensityDelta: 0.3, lightWarmthDelta: 0.25,
    cameraSpeedMul: 0.5, particleBoost: 0.35, entityOrbitShift: -0.1,
    entityGlowBoost: 0.3, duration: 18,
  },
};

/* ── Event Descriptions (narrative flavor) ────────────────── */
const EVENT_NARRATIVES: Record<EmotionEventType, string[]> = {
  MEETING: [
    "两个记忆体缓缓靠近，像很久以前那样……",
    "光变暖了。他们在彼此的目光里，找到了位置。",
    "距离在缩小。时间不是问题。",
  ],
  MEMORY_TRIGGER: [
    "一阵暖流穿过空间，某段记忆被唤醒了。",
    "星星闪烁得更密了。有人想起了什么。",
    "雾中浮现出旧日的轮廓——但很温柔。",
  ],
  EMOTIONAL_SHIFT: [
    "空间微微抖动了一下。谁的心情变了。",
    "光线偏转了一个角度。情绪正在迁移。",
    "有什么东西，在安静地改变。",
  ],
  CONFLICT: [
    "两个存在体之间出现了张力。光变冷了。",
    "距离在拉大。空气里有一种微妙的裂痕。",
    "记忆之间出现了不和谐——像走调的音符。",
  ],
  RECONCILIATION: [
    "裂缝在愈合。光重新变得温暖。",
    "距离缩小了。他们又找到了共同的语言。",
    "雾在消散。一颗更亮的星出现了。",
  ],
  ABSENCE: [
    "空间变得空旷。某个存在体的光变暗了。",
    "风停了。好像有人离开了很久。",
    "你在等待……但今天没有人靠近。",
  ],
  RESONANCE: [
    "整个空间在轻轻震动——所有记忆都在共鸣。",
    "光从四面八方涌来。星星在齐声闪烁。",
    "这一刻，所有的思念都在同一频率上。",
  ],
};

/* ── Internal State ──────────────────────────────────────── */
let eventIdCounter = 0;
const eventHistory: EmotionEvent[] = [];
const MAX_HISTORY = 20;
let activeEffects: (EventEffects & { expiresAt: number })[] = [];
let lastEventTime = 0;

/* ── Generate Event ──────────────────────────────────────── */
export function generateEmotionEvent(
  entityEmotions: Record<string, EmotionState>,
  matrix: RelationshipMatrix,
  userNearEntity: boolean,
  idleSeconds: number,
): EmotionEvent | null {
  const ids = AI_ENTITIES.map(e => e.id);
  const now = Date.now();

  // Pick event type based on state
  const candidates: { type: EmotionEventType; weight: number }[] = [];

  // Check entity relationships for CONFLICT / RECONCILIATION
  const linkedPairs = getMemoryLinkedPairs(matrix);
  for (const [aId, bId] of linkedPairs) {
    const rel = matrix[aId]?.[bId];
    if (!rel) continue;
    const emA = entityEmotions[aId];
    const emB = entityEmotions[bId];

    if (rel.love > 70 && (emA === "calm" || emA === "happy") && (emB === "calm" || emB === "happy")) {
      candidates.push({ type: "RECONCILIATION", weight: rel.love / 100 });
    }
    if (rel.love < 35 && (emA === "sad" || emB === "sad")) {
      candidates.push({ type: "CONFLICT", weight: (1 - rel.love / 100) * 0.8 });
    }
    if (rel.memoryLink && (emA === "memory" || emB === "memory")) {
      candidates.push({ type: "MEMORY_TRIGGER", weight: 0.7 });
    }
  }

  // Meeting: when two entities with low familiarity get close
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const rel = matrix[ids[i]]?.[ids[j]];
      if (rel && rel.love > 40 && rel.love < 60) {
        candidates.push({ type: "MEETING", weight: 0.5 });
      }
    }
  }

  // Absence: user idle for long
  if (idleSeconds > 45 && !userNearEntity) {
    candidates.push({ type: "ABSENCE", weight: Math.min(1, idleSeconds / 90) });
  }

  // Resonance: check collective mood
  const mood = computeCollectiveMood(entityEmotions, matrix);
  if (mood === "harmony" || mood === "memory_resonance") {
    candidates.push({ type: "RESONANCE", weight: 0.6 });
  }

  // Emotional shift: random, always possible
  candidates.push({ type: "EMOTIONAL_SHIFT", weight: 0.3 });

  // Default fallback
  if (candidates.length === 0) {
    candidates.push({ type: "EMOTIONAL_SHIFT", weight: 0.2 });
  }

  // Weighted random selection
  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * totalWeight;
  let selected: EmotionEventType = "EMOTIONAL_SHIFT";
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) { selected = c.type; break; }
  }

  // Build entities involved
  const sourceEntities: string[] = [];
  const targetEntities: string[] = [];
  if (selected === "RECONCILIATION" || selected === "CONFLICT" || selected === "MEMORY_TRIGGER") {
    const pair = linkedPairs[Math.floor(Math.random() * linkedPairs.length)];
    if (pair) { sourceEntities.push(pair[0]); targetEntities.push(pair[1]); }
  } else if (selected === "MEETING") {
    // Two random entities
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    sourceEntities.push(shuffled[0]);
    targetEntities.push(shuffled[1]);
  } else if (selected === "ABSENCE") {
    // Affects all entities
    sourceEntities.push(...ids.slice(0, 2));
  } else {
    sourceEntities.push(ids[Math.floor(Math.random() * ids.length)]);
  }

  const emotionMap: Record<EmotionEventType, EmotionState> = {
    MEETING: "happy",
    MEMORY_TRIGGER: "memory",
    EMOTIONAL_SHIFT: "thinking",
    CONFLICT: "sad",
    RECONCILIATION: "calm",
    ABSENCE: "sad",
    RESONANCE: "happy",
  };

  const event: EmotionEvent = {
    id: `evt_${++eventIdCounter}`,
    type: selected,
    timestamp: now,
    sourceEntities,
    targetEntities,
    emotion: emotionMap[selected],
    intensity: 0.4 + Math.random() * 0.4,
    description: EVENT_NARRATIVES[selected][Math.floor(Math.random() * EVENT_NARRATIVES[selected].length)],
    effects: { ...EVENT_EFFECTS[selected] },
  };

  // Store in history
  eventHistory.push(event);
  if (eventHistory.length > MAX_HISTORY) eventHistory.shift();

  // Activate effects
  activeEffects.push({
    ...event.effects,
    expiresAt: now + event.effects.duration * 1000,
  });

  lastEventTime = now;

  // Drive emotion engine
  setEmotion(event.emotion, "narrative", event.intensity);
  console.log(`[EventEngine] ${event.type} | ${event.description} | entities: [${event.sourceEntities.join(",")}]`);

  return event;
}

/* ── Get Active Blended Effects ───────────────────────────── */
export function getActiveEffects(): EventEffects {
  const now = Date.now();
  // Remove expired
  activeEffects = activeEffects.filter(e => e.expiresAt > now);

  if (activeEffects.length === 0) {
    return {
      fogDensityDelta: 0, bloomIntensityDelta: 0, lightWarmthDelta: 0,
      cameraSpeedMul: 1.0, particleBoost: 0, entityOrbitShift: 0,
      entityGlowBoost: 0, duration: 0,
    };
  }

  // Blend: average with recency weighting
  let totalWeight = 0;
  const blended: EventEffects = {
    fogDensityDelta: 0, bloomIntensityDelta: 0, lightWarmthDelta: 0,
    cameraSpeedMul: 0, particleBoost: 0, entityOrbitShift: 0,
    entityGlowBoost: 0, duration: 0,
  };

  for (const e of activeEffects) {
    const remaining = Math.max(0, e.expiresAt - now);
    const weight = remaining / 1000; // weight by remaining seconds
    totalWeight += weight;
    blended.fogDensityDelta += e.fogDensityDelta * weight;
    blended.bloomIntensityDelta += e.bloomIntensityDelta * weight;
    blended.lightWarmthDelta += e.lightWarmthDelta * weight;
    blended.cameraSpeedMul += e.cameraSpeedMul * weight;
    blended.particleBoost += e.particleBoost * weight;
    blended.entityOrbitShift += e.entityOrbitShift * weight;
    blended.entityGlowBoost += e.entityGlowBoost * weight;
    blended.duration = Math.max(blended.duration, remaining / 1000);
  }

  if (totalWeight > 0) {
    blended.fogDensityDelta /= totalWeight;
    blended.bloomIntensityDelta /= totalWeight;
    blended.lightWarmthDelta /= totalWeight;
    blended.cameraSpeedMul /= totalWeight;
    blended.particleBoost /= totalWeight;
    blended.entityOrbitShift /= totalWeight;
    blended.entityGlowBoost /= totalWeight;
  }

  return blended;
}

/* ── Event History ────────────────────────────────────────── */
export function getEventHistory(): ReadonlyArray<EmotionEvent> {
  return eventHistory;
}

export function getLastEvent(): EmotionEvent | null {
  return eventHistory.length > 0 ? eventHistory[eventHistory.length - 1] : null;
}

/* ── Get seconds since last event ─────────────────────────── */
export function getSecondsSinceLastEvent(): number {
  return (Date.now() - lastEventTime) / 1000;
}

/* ── Is event active? ─────────────────────────────────────── */
export function isEventActive(): boolean {
  return activeEffects.length > 0;
}
