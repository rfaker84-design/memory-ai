"use client";

import { useMemo } from "react";

import { useMotion } from "./useMotion";
import { useReducedMotion } from "./useReducedMotion";

export type RevealMotionResult = {
  initial: {
    opacity: number;
    transform: string;
  };
  target: {
    opacity: number;
    transform: string;
  };
  transition: {
    duration: string;
    transitionTimingFunction: string;
  };
};

export function useRevealMotion(): RevealMotionResult {
  const runtime = useMotion();
  const reduced = useReducedMotion();
  const reveal = runtime.config.reveal;

  return useMemo(() => {
    if (reduced) {
      return {
        initial: {
          opacity: reveal.target.opacity,
          transform: `translateY(${reveal.target.translateY}px) scale(${reveal.target.scale})`,
        },
        target: {
          opacity: reveal.target.opacity,
          transform: `translateY(${reveal.target.translateY}px) scale(${reveal.target.scale})`,
        },
        transition: {
          duration: `${runtime.config.reduced.revealDuration}ms`,
          transitionTimingFunction: reveal.ease,
        },
      };
    }

    return {
      initial: {
        opacity: reveal.initial.opacity,
        transform: `translateY(${reveal.initial.translateY}px) scale(${reveal.initial.scale})`,
      },
      target: {
        opacity: reveal.target.opacity,
        transform: `translateY(${reveal.target.translateY}px) scale(${reveal.target.scale})`,
      },
      transition: {
        duration: `${reveal.duration}ms`,
        transitionTimingFunction: reveal.ease,
      },
    };
  }, [reduced, reveal, runtime.config.reduced.revealDuration]);
}
