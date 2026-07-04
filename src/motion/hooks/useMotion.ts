"use client";

import { useContext } from "react";

import { MotionContext } from "../runtime/MotionContext";

export function useMotion() {
  const runtime = useContext(MotionContext);

  if (!runtime) {
    throw new Error("useMotion must be used within MotionProvider");
  }

  return runtime;
}
