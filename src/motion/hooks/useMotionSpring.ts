"use client";

import { useEffect, useMemo, useState } from "react";

import { MotionSpring, type MotionSpringOptions, type MotionSpringSnapshot } from "../runtime/MotionSpring";
import { useMotion } from "./useMotion";
import { useMotionClock } from "./useMotionClock";

export function useMotionSpring(
  target: number,
  options?: Partial<MotionSpringOptions>
): MotionSpringSnapshot {
  const runtime = useMotion();
  const frame = useMotionClock();
  const spring = useMemo(
    () =>
      new MotionSpring(target, {
        ...runtime.config.spring,
        ...options,
      }),
    [options, runtime.config.spring, target]
  );
  const [snapshot, setSnapshot] = useState(() => spring.getSnapshot());

  useEffect(() => {
    spring.setTarget(target);
  }, [spring, target]);

  useEffect(() => {
    setSnapshot(spring.step(frame.delta));
  }, [frame.delta, spring]);

  return snapshot;
}
