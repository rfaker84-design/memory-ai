import { MemoryMotion } from "../../design";

export const memoryMotionConfig = {
  clock: {
    autoStart: true,
  },
  scroll: {
    velocityClamp: 2400,
  },
  spring: {
    stiffness: 180,
    damping: 24,
    mass: 1,
    precision: 0.001,
  },
  press: {
    scale: MemoryMotion.touch.pressScale,
    duration: MemoryMotion.duration.press,
    releaseDuration: MemoryMotion.duration.feedback,
    ease: MemoryMotion.ease.standard,
  },
  reveal: {
    initial: MemoryMotion.reveal.initial,
    target: MemoryMotion.reveal.target,
    duration: MemoryMotion.duration.reveal,
    ease: MemoryMotion.ease.standard,
    staggerMin: MemoryMotion.reveal.staggerMin,
    staggerMax: MemoryMotion.reveal.staggerMax,
  },
  reduced: {
    revealDuration: 1,
    pressScale: 0.99,
    disableScrollVelocityEffects: true,
  },
} as const;

export type MemoryMotionConfig = typeof memoryMotionConfig;
