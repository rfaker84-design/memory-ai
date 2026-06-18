"use client";

/* =========================================================================
   Emotion Flow System — State Manager
   ========================================================================= */

export type EmotionState = "memory" | "presence" | "dialogue" | "reflection";

type Listener = (from: EmotionState, to: EmotionState) => void;

const listeners = new Set<Listener>();

let current: EmotionState = "memory";
let previous: EmotionState = "memory";

export const EmotionFlow = {
  get current(): EmotionState {
    return current;
  },

  get previous(): EmotionState {
    return previous;
  },

  transition(to: EmotionState) {
    if (to === current) return;
    previous = current;
    current = to;
    listeners.forEach((fn) => fn(previous, to));
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /* ---- Transition variants for Framer Motion ---- */
  variants: {
    enter: (to: EmotionState) => ({
      opacity: 0,
      y: to === "dialogue" ? 12 : to === "reflection" ? -8 : 0,
      filter: "blur(6px)",
      scale: to === "presence" ? 1.02 : 0.99,
    }),
    center: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
    },
    exit: (from: EmotionState) => ({
      opacity: 0,
      y: from === "dialogue" ? -8 : 0,
      filter: "blur(4px)",
      transition: { duration: 0.35 },
    }),
  },

  /* ---- Timing per state ---- */
  timing: {
    enter: 0.5,
    exit: 0.35,
  },

  /* ---- Label map ---- */
  labels: {
    memory: "记忆态",
    presence: "存在态",
    dialogue: "对话态",
    reflection: "回忆态",
  } as Record<EmotionState, string>,

  /* ---- Description map ---- */
  descriptions: {
    memory: "你在想TA",
    presence: "TA在这里",
    dialogue: "正在交流",
    reflection: "回忆浮现",
  } as Record<EmotionState, string>,
};