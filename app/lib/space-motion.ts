/* =========================================================================
   Space Motion — unified animation system for the Memory Room
   ========================================================================= */

import type { TargetAndTransition, Transition } from "framer-motion";

/* ---- Camera moves (page transitions) ---- */

export const cameraEnterInitial: TargetAndTransition = {
  opacity: 0,
  scale: 1.02,
  filter: "blur(10px)",
};

export const cameraEnter: TargetAndTransition = {
  opacity: 1,
  scale: 1,
  filter: "blur(0px)",
};

export const cameraExit: TargetAndTransition = {
  opacity: 0,
  scale: 0.98,
  filter: "blur(4px)",
};

export const cameraFloatInitial: TargetAndTransition = {
  opacity: 0,
  y: 12,
  filter: "blur(6px)",
};

export const cameraFloat: TargetAndTransition = {
  opacity: 1,
  y: 0,
  filter: "blur(0px)",
};

/* ---- Timing ---- */

export const spaceTiming = {
  pageEnter: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1.0] as [number, number, number, number] } satisfies Transition,
  pageExit: { duration: 0.4, ease: "easeInOut" } satisfies Transition,
  reveal: { duration: 0.5, ease: "easeOut" } satisfies Transition,
  slowReveal: { duration: 0.8, ease: "easeOut" } satisfies Transition,
};

/* ---- UI reveals ---- */

export const uiRevealInitial: TargetAndTransition = {
  opacity: 0,
  y: 8,
  filter: "blur(4px)",
};

export const uiReveal: TargetAndTransition = {
  opacity: 1,
  y: 0,
  filter: "blur(0px)",
};

/* ---- Floating (ambient) ---- */

export const breatheAnim: TargetAndTransition = {
  opacity: [0.30, 0.50, 0.30],
  transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
};

export const floatCardAnim: TargetAndTransition = {
  y: [0, -3, 0],
  transition: { duration: 7, repeat: Infinity, ease: "easeInOut" },
};