"use client";

import type { CSSProperties, HTMLAttributes } from "react";

import { MemoryCard as MemoryCardTokens, MemoryMotion, MemoryOpacity, MemorySurface } from "../../design";
import { usePressMotion, useRevealMotion, useReducedMotion } from "../../motion";

type MemoryCardDepth = "flat" | "soft" | "elevated";

export type MemoryCardProps = HTMLAttributes<HTMLDivElement> & {
  depth?: MemoryCardDepth;
  interactive?: boolean;
  reveal?: boolean;
};

const depthStyles: Record<MemoryCardDepth, CSSProperties> = {
  flat: {
    background: "transparent",
    boxShadow: "none",
    borderColor: MemorySurface.border.subtle,
  },
  soft: MemoryCardTokens.base,
  elevated: MemoryCardTokens.elevated,
};

export function MemoryCard({
  depth = "soft",
  interactive = false,
  reveal = false,
  style,
  children,
  ...props
}: MemoryCardProps) {
  const press = usePressMotion();
  const revealMotion = useRevealMotion();
  const reducedMotion = useReducedMotion();

  return (
    <div
      {...props}
      {...(interactive ? press.props : {})}
      style={{
        borderStyle: "solid",
        borderWidth: 1,
        color: MemorySurface.content.primary,
        opacity: reveal ? revealMotion.target.opacity : MemoryOpacity.full,
        transform: interactive
          ? press.style.transform
          : reveal && !reducedMotion
            ? revealMotion.target.transform
            : undefined,
        transitionProperty: reducedMotion ? "opacity" : "transform, opacity, box-shadow, background",
        transitionDuration: reveal
          ? revealMotion.transition.duration
          : interactive
            ? press.style.transitionDuration
            : `${MemoryMotion.duration.feedback}ms`,
        transitionTimingFunction: reveal
          ? revealMotion.transition.transitionTimingFunction
          : press.style.transitionTimingFunction,
        cursor: interactive ? "pointer" : undefined,
        WebkitTapHighlightColor: "transparent",
        ...depthStyles[depth],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

