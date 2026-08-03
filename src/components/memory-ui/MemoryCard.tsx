"use client";

import type { CSSProperties, HTMLAttributes, KeyboardEvent } from "react";

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
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...props
}: MemoryCardProps) {
  const press = usePressMotion();
  const revealMotion = useRevealMotion();
  const reducedMotion = useReducedMotion();
  const keyboardInteractive = interactive && typeof onClick === "function";

  const activateOnKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.currentTarget.click();
  };

  return (
    <div
      {...props}
      {...(interactive ? press.props : {})}
      onClick={onClick}
      onKeyDown={keyboardInteractive ? activateOnKeyboard : onKeyDown}
      role={keyboardInteractive ? role ?? "button" : role}
      tabIndex={keyboardInteractive ? tabIndex ?? 0 : tabIndex}
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

