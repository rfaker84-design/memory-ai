"use client";

import { useSyncExternalStore } from "react";

import { useMotion } from "./useMotion";

export function useMotionScroll() {
  const runtime = useMotion();

  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().scroll,
    () => runtime.getSnapshot().scroll
  );
}
