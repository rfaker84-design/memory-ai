"use client";

import { useCallback, useMemo, useState } from "react";

import { useMotion } from "./useMotion";
import { useReducedMotion } from "./useReducedMotion";

export type PressMotionProps = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
};

export type PressMotionResult = {
  pressed: boolean;
  style: {
    transform: string;
    transitionDuration: string;
    transitionTimingFunction: string;
  };
  props: PressMotionProps;
};

export function usePressMotion(): PressMotionResult {
  const runtime = useMotion();
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const press = runtime.config.press;

  const release = useCallback(() => setPressed(false), []);
  const props = useMemo(
    () => ({
      onPointerDown: () => setPressed(true),
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
    }),
    [release]
  );

  const scale = reduced
    ? pressed
      ? runtime.config.reduced.pressScale
      : 1
    : pressed
      ? press.scale
      : 1;

  return {
    pressed,
    style: {
      transform: `scale(${scale})`,
      transitionDuration: `${pressed ? press.duration : press.releaseDuration}ms`,
      transitionTimingFunction: press.ease,
    },
    props,
  };
}
