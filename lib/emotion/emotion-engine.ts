/* ============================================================
   忆见 MemoryAI — Emotion Engine V1
   情绪中枢：AI存在体 / 用户交互 / 空闲时间 → 统一情绪输出
   ============================================================ */

import type { EmotionState, VisualPreset } from "../visual-ai-controller";
import { EMOTION_PRESETS } from "../visual-ai-controller";

/* ── Emotion Source ─────────────────────────────────────── */
export type EmotionSource = "ai_entity" | "user_interaction" | "idle_timer" | "narrative";

export interface EmotionChange {
  emotion: EmotionState;
  source: EmotionSource;
  timestamp: number;
  intensity: number; // 0-1, higher = stronger signal
}

/* ── Listener type ──────────────────────────────────────── */
export type EmotionListener = (change: EmotionChange) => void;

/* ── Emotion Engine State ────────────────────────────────── */
const state = {
  current: "calm" as EmotionState,
  previous: "calm" as EmotionState,
  source: "narrative" as EmotionSource,
  intensity: 0.5,
  lastChange: Date.now(),
  idleSeconds: 0,
  listeners: [] as EmotionListener[],
  userNearEntity: false,
  userClickedEntity: false,
  entitySpeechActive: false,
};

/* ── Subscribe / Unsubscribe ─────────────────────────────── */
export function onEmotionChange(fn: EmotionListener): () => void {
  state.listeners.push(fn);
  return () => { state.listeners = state.listeners.filter(l => l !== fn); };
}

function notify(change: EmotionChange) {
  state.listeners.forEach(fn => { try { fn(change); } catch {} });
}

/* ── Core: Set Emotion ───────────────────────────────────── */
export function setEmotion(
  emotion: EmotionState,
  source: EmotionSource,
  intensity = 0.5
): void {
  if (state.current === emotion && state.source === source) return;
  state.previous = state.current;
  state.current = emotion;
  state.source = source;
  state.intensity = Math.max(0, Math.min(1, intensity));
  state.lastChange = Date.now();

  const change: EmotionChange = {
    emotion,
    source,
    timestamp: state.lastChange,
    intensity: state.intensity,
  };

  console.log(
    `[EmotionEngine] ${source} → ${emotion} (intensity: ${state.intensity.toFixed(2)})`
  );
  notify(change);
}

/* ── Getters ──────────────────────────────────────────────── */
export function getEmotion(): EmotionState {
  return state.current;
}

export function getEmotionPreset(): VisualPreset {
  return EMOTION_PRESETS[state.current];
}

export function getEmotionMetadata(): Readonly<{
  current: EmotionState;
  previous: EmotionState;
  source: EmotionSource;
  intensity: number;
  lastChange: number;
  idleSeconds: number;
}> {
  return {
    current: state.current,
    previous: state.previous,
    source: state.source,
    intensity: state.intensity,
    lastChange: state.lastChange,
    idleSeconds: state.idleSeconds,
  };
}

/* ── User Interaction Triggers ───────────────────────────── */

/** Call when user enters/nears the entity in 3D space */
export function onUserNearEntity(distance: number): void {
  const wasNear = state.userNearEntity;
  state.userNearEntity = distance < 3.5;
  if (!wasNear && state.userNearEntity) {
    setEmotion("happy", "user_interaction", 0.7);
  }
}

/** Call when user clicks the entity */
export function onUserClickEntity(): void {
  state.userClickedEntity = true;
  setEmotion("happy", "user_interaction", 0.9);
  setTimeout(() => { state.userClickedEntity = false; }, 3000);
}

/** Call when user hovers over entity (prolonged gaze) */
export function onUserGazeEntity(duration: number): void {
  if (duration > 3 && state.current !== "thinking") {
    setEmotion("thinking", "user_interaction", 0.6);
  }
}

/** Call when user is idle (no interaction) */
export function onUserIdle(seconds: number): void {
  state.idleSeconds = seconds;
  if (seconds > 30 && state.current !== "sad" && state.source !== "ai_entity") {
    setEmotion("sad", "idle_timer", 0.4);
  }
}

/** Call when user returns from idle */
export function onUserReturn(): void {
  state.idleSeconds = 0;
  if (state.source === "idle_timer") {
    setEmotion("calm", "user_interaction", 0.5);
  }
}

/* ── AI Entity Triggers ──────────────────────────────────── */

/** AI entity changes its internal emotion */
export function onAIEntityEmotionChange(emotion: EmotionState, intensity = 0.7): void {
  setEmotion(emotion, "ai_entity", intensity);
}

/** AI entity starts/stops speaking */
export function onAIEntitySpeech(active: boolean): void {
  state.entitySpeechActive = active;
}

export function isEntitySpeaking(): boolean {
  return state.entitySpeechActive;
}

/* ── Event Helpers ───────────────────────────────────────── */

/** Get elapsed seconds since last emotion change */
export function getSecondsSinceChange(): number {
  return (Date.now() - state.lastChange) / 1000;
}

/** Map distance to emotion intensity (closer = higher) */
export function distanceToIntensity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - (distance - 1.5) / 6));
}

/* ── Visual preset that blends entity emotion with current  ─ */
export function getBlendedPreset(entityEmotion: EmotionState): VisualPreset {
  const base = EMOTION_PRESETS[state.current];
  const entity = EMOTION_PRESETS[entityEmotion];
  const t = state.intensity;

  // Blend: entity emotion has more weight when intensity is high
  return {
    fogDensity: base.fogDensity * (1 - t) + entity.fogDensity * t,
    fogColor: base.fogColor,
    ambientIntensity: base.ambientIntensity * (1 - t) + entity.ambientIntensity * t,
    bloomIntensity: base.bloomIntensity * (1 - t) + entity.bloomIntensity * t,
    pointLightBoost: base.pointLightBoost * (1 - t) + entity.pointLightBoost * t,
    lightColor: base.lightColor,
    cameraSpeed: base.cameraSpeed * (1 - t) + entity.cameraSpeed * t,
    cameraFloatAmp: base.cameraFloatAmp * (1 - t) + entity.cameraFloatAmp * t,
    particleOpacity: base.particleOpacity * (1 - t) + entity.particleOpacity * t,
    description: `blended: ${state.current}(${(1-t).toFixed(1)}) + ${entityEmotion}(${t.toFixed(1)})`,
  };
}
