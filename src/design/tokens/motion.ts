export const MemoryMotion = {
  duration: {
    press: 90,
    exit: 220,
    feedback: 240,
    enter: 520,
    reveal: 720,
  },
  ease: {
    standard: "cubic-bezier(0.16, 1, 0.3, 1)",
    softOut: "cubic-bezier(0.22, 1, 0.36, 1)",
    linear: "linear",
  },
  reveal: {
    initial: { opacity: 0, translateY: 24, scale: 0.985 },
    target: { opacity: 1, translateY: 0, scale: 1 },
    staggerMin: 40,
    staggerMax: 70,
  },
  pageTransition: {
    exit: { opacity: 0, scale: 0.992, duration: 220 },
    enter: { opacity: 1, scale: 1, duration: 520 },
  },
  touch: {
    pressScale: 0.97,
    releaseScale: 1,
  },
} as const;

export type MemoryMotionToken = typeof MemoryMotion;
