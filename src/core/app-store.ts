/* ============================================================
   忆见 MemoryAI — App Store (Single World State)
   Mode: boot / select / world / dialogue
   No route changes. All state-driven.
   ============================================================ */

import type { EmotionState } from "../../lib/visual-ai-controller";

/* ── App Mode ──────────────────────────────────────────── */
export type AppMode = "boot" | "select" | "world" | "dialogue";

/* ── Memory Entity ─────────────────────────────────────── */
export interface MemoryEntity {
  id: string;
  name: string;
  relationship: string | null;
  emotionState: EmotionState;
}

/* ── App State ─────────────────────────────────────────── */
export interface AppState {
  mode: AppMode;
  selectedEntity: MemoryEntity | null;
  entities: MemoryEntity[];
  emotion: EmotionState;
  bootProgress: number;       // 0–1
  error: string | null;
}

/* ── Listeners ─────────────────────────────────────────── */
type Listener = (state: AppState) => void;
const listeners: Listener[] = [];

/* ── Internal State ────────────────────────────────────── */
let state: AppState = {
  mode: "boot",
  selectedEntity: null,
  entities: [],
  emotion: "calm",
  bootProgress: 0,
  error: null,
};

/* ── Get State ─────────────────────────────────────────── */
export function getAppState(): Readonly<AppState> {
  return state;
}

/* ── Set Mode ──────────────────────────────────────────── */
export function setMode(mode: AppMode): void {
  state = { ...state, mode };
  notify();
}

/* ── Select Entity ─────────────────────────────────────── */
export function selectEntity(entity: MemoryEntity | null): void {
  state = { ...state, selectedEntity: entity, mode: entity ? "dialogue" : "select" };
  notify();
}

/* ── Set Entities ──────────────────────────────────────── */
export function setEntities(entities: MemoryEntity[]): void {
  state = { ...state, entities };
  if (entities.length > 0 && state.mode === "boot") {
    state = { ...state, mode: "select" };
  }
  notify();
}

/* ── Set Emotion ───────────────────────────────────────── */
export function setAppEmotion(emotion: EmotionState): void {
  state = { ...state, emotion };
  notify();
}

/* ── Set Error ─────────────────────────────────────────── */
export function setAppError(error: string | null): void {
  state = { ...state, error };
  notify();
}

/* ── Boot Progress ─────────────────────────────────────── */
export function setBootProgress(progress: number): void {
  state = { ...state, bootProgress: Math.min(1, Math.max(0, progress)) };
  if (progress >= 1 && state.mode === "boot") {
    state = { ...state, mode: "select" };
  }
  notify();
}

/* ── Subscribe ─────────────────────────────────────────── */
export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/* ── Notify ────────────────────────────────────────────── */
function notify(): void {
  const s = { ...state };
  for (const fn of listeners) {
    try { fn(s); } catch {}
  }
}
