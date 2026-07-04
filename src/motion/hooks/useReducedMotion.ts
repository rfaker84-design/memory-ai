"use client";

import { useSyncExternalStore } from "react";

import { useMotion } from "./useMotion";

export function useReducedMotion(): boolean {
  const runtime = useMotion();

  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().reducedMotion,
    () => runtime.getSnapshot().reducedMotion
  );
}
