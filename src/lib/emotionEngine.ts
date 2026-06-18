// emotionEngine.ts — Unified Emotion State Engine
// Single source of truth for emotion across all modules

import type { Emotion } from "./volc";

export interface EmotionState {
  type: Emotion;
  intensity: number;       // 0-1, how strongly the emotion is felt
  lastUpdated: number;     // Date.now()
  source: "chat" | "system" | "user" | "init";
}

export interface EmotionHistoryEntry {
  ts: number;
  type: Emotion;
  intensity: number;
  source: string;
}

const STORAGE_KEY = "yj_emo_state";
const HISTORY_KEY = "yj_emo_history";
const MAX_HISTORY = 50;

function ssr(): boolean { return typeof window === "undefined"; }

// ─── Read current state ──────────────────────────────────────
export function getEmotionState(): EmotionState {
  if (ssr()) return { type: "calm", intensity: 0.5, lastUpdated: Date.now(), source: "init" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EmotionState;
  } catch {}
  return { type: "calm", intensity: 0.5, lastUpdated: Date.now(), source: "init" };
}

// ─── Write state ─────────────────────────────────────────────
function saveState(state: EmotionState): void {
  if (ssr()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ─── Update emotion ──────────────────────────────────────────
export function updateEmotion(
  type: Emotion,
  intensity: number = 0.5,
  source: EmotionState["source"] = "chat",
): EmotionState {
  const prev = getEmotionState();

  // Smooth transition: don't jump instantly, blend
  const blendFactor = 0.6;
  const newIntensity = prev.intensity * (1 - blendFactor) + intensity * blendFactor;

  const state: EmotionState = {
    type,
    intensity: Math.round(newIntensity * 100) / 100,
    lastUpdated: Date.now(),
    source,
  };

  saveState(state);
  appendHistory(state);
  return state;
}

// ─── History ─────────────────────────────────────────────────
function appendHistory(state: EmotionState): void {
  if (ssr()) return;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: EmotionHistoryEntry[] = raw ? JSON.parse(raw) : [];
    history.push({ ts: state.lastUpdated, type: state.type, intensity: state.intensity, source: state.source });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export function getEmotionHistory(): EmotionHistoryEntry[] {
  if (ssr()) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── UI mapping ──────────────────────────────────────────────
export const EMOTION_UI: Record<Emotion, { glow: string; bg: string; label: string; labelZh: string }> = {
  warm: {
    glow: "rgba(255,170,80,",
    bg: "radial-gradient(ellipse at 50% 30%, rgba(200,140,60,0.12) 0%, transparent 55%)",
    label: "warm",
    labelZh: "温暖",
  },
  calm: {
    glow: "rgba(130,180,230,",
    bg: "radial-gradient(ellipse at 50% 30%, rgba(100,120,180,0.08) 0%, transparent 55%)",
    label: "calm",
    labelZh: "平静",
  },
  sad: {
    glow: "rgba(140,150,170,",
    bg: "radial-gradient(ellipse at 50% 30%, rgba(120,130,150,0.06) 0%, transparent 55%)",
    label: "sad",
    labelZh: "思念",
  },
  nostalgic: {
    glow: "rgba(210,160,100,",
    bg: "radial-gradient(ellipse at 50% 30%, rgba(180,140,80,0.1) 0%, transparent 55%)",
    label: "nostalgic",
    labelZh: "怀旧",
  },
};

// ─── TTS voice parameters by emotion ─────────────────────────
export const EMOTION_TTS: Record<Emotion, { speed: number; pitch: number; volume: number }> = {
  warm:   { speed: 1.0,  pitch: 1.05, volume: 1.0 },
  calm:   { speed: 0.95, pitch: 1.0,  volume: 1.0 },
  sad:    { speed: 0.85, pitch: 0.92, volume: 0.9 },
  nostalgic: { speed: 0.88, pitch: 0.95, volume: 0.95 },
};
