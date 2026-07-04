"use client";

import { useSyncExternalStore } from "react";

import { useMotion } from "./useMotion";

export function useMotionClock() {
  const runtime = useMotion();

  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().frame,
    () => runtime.getSnapshot().frame
  );
}
