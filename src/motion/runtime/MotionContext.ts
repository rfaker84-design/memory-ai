import { createContext } from "react";

import type { MemoryMotionConfig } from "../config/motion.config";
import type { MotionClock, MotionFrame } from "./MotionClock";
import type { MotionScroll, MotionScrollSnapshot } from "./MotionScroll";
import type { MotionVelocity, MotionVelocitySnapshot } from "./MotionVelocity";
import type { MotionReduced } from "./MotionReduced";

export type MotionRuntimeSnapshot = {
  frame: MotionFrame;
  scroll: MotionScrollSnapshot;
  velocity: MotionVelocitySnapshot;
  reducedMotion: boolean;
};

export type MotionRuntime = {
  clock: MotionClock;
  scroll: MotionScroll;
  velocity: MotionVelocity;
  reduced: MotionReduced;
  config: MemoryMotionConfig;
  getSnapshot: () => MotionRuntimeSnapshot;
  subscribe: (listener: () => void) => () => void;
};

export const MotionContext = createContext<MotionRuntime | null>(null);
