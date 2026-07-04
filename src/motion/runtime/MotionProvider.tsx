"use client";

import { ReactNode, useEffect, useMemo } from "react";

import { memoryMotionConfig, type MemoryMotionConfig } from "../config/motion.config";
import { MotionClock } from "./MotionClock";
import { MotionContext, type MotionRuntime, type MotionRuntimeSnapshot } from "./MotionContext";
import { MotionReduced } from "./MotionReduced";
import { MotionScroll } from "./MotionScroll";
import { MotionVelocity } from "./MotionVelocity";

export type MotionProviderProps = {
  children: ReactNode;
  config?: MemoryMotionConfig;
};

const createRuntime = (config: MemoryMotionConfig): MotionRuntime => {
  const clock = new MotionClock();
  const scroll = new MotionScroll();
  const velocity = new MotionVelocity(config.scroll.velocityClamp);
  const reduced = new MotionReduced();
  const listeners = new Set<() => void>();
  let runtimeUnsubscribe: Array<() => void> | null = null;

  const emit = () => listeners.forEach((listener) => listener());

  const attachRuntimeSubscriptions = () => {
    if (runtimeUnsubscribe) return;

    runtimeUnsubscribe = [
      clock.subscribe((frame) => {
        velocity.update(scroll.getSnapshot(), frame);
        emit();
      }),
      scroll.subscribe(() => emit()),
      reduced.subscribe(() => emit()),
    ];
  };

  const detachRuntimeSubscriptions = () => {
    if (!runtimeUnsubscribe) return;

    runtimeUnsubscribe.forEach((unsubscribe) => unsubscribe());
    runtimeUnsubscribe = null;
  };

  const getSnapshot = (): MotionRuntimeSnapshot => ({
    frame: clock.getSnapshot(),
    scroll: scroll.getSnapshot(),
    velocity: velocity.getSnapshot(),
    reducedMotion: reduced.getSnapshot(),
  });

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    attachRuntimeSubscriptions();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        detachRuntimeSubscriptions();
      }
    };
  };

  return {
    clock,
    scroll,
    velocity,
    reduced,
    config,
    getSnapshot,
    subscribe,
  };
};

export function MotionProvider({ children, config = memoryMotionConfig }: MotionProviderProps) {
  const runtime = useMemo(() => createRuntime(config), [config]);

  useEffect(() => {
    runtime.reduced.start();
    runtime.scroll.start();

    if (config.clock.autoStart) {
      runtime.clock.start();
    }

    return () => {
      runtime.clock.stop();
      runtime.scroll.stop();
      runtime.reduced.stop();
    };
  }, [config.clock.autoStart, runtime]);

  return <MotionContext.Provider value={runtime}>{children}</MotionContext.Provider>;
}
