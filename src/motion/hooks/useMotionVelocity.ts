"use client";

import { useSyncExternalStore } from "react";

import { useMotion } from "./useMotion";

export function useMotionVelocity() {
  const runtime = useMotion();

  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().velocity,
    () => runtime.getSnapshot().velocity
  );
}
