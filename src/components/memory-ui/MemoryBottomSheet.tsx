"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { MemoryRadius, MemoryShadow, MemorySpacing, MemorySurface, MemoryTypography, MemoryZIndex } from "../../design";
import { useRevealMotion, useReducedMotion } from "../../motion";

export type MemoryBottomSheetProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
};

export function MemoryBottomSheet({ open = true, title, description, footer, style, children, ...props }: MemoryBottomSheetProps) {
  const reveal = useRevealMotion();
  const reduced = useReducedMotion();

  return (
    <div
      {...props}
      role="dialog"
      aria-modal="true"
      data-open={open}
      style={{
        position: "fixed",
        insetInline: 0,
        bottom: 0,
        zIndex: MemoryZIndex.modal,
        padding: MemorySpacing.lg,
        paddingBottom: `calc(${MemorySpacing.lg} + ${MemorySpacing.safeBottom})`,
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
        transform: open
          ? "translateY(0)"
          : reduced
            ? "translateY(0)"
            : "translateY(24px)",
        transitionProperty: reduced ? "opacity" : "transform, opacity",
        transitionDuration: reveal.transition.duration,
        transitionTimingFunction: reveal.transition.transitionTimingFunction,
        ...style,
      }}
    >
      <div
        style={{
          marginInline: "auto",
          maxWidth: 640,
          borderRadius: `${MemoryRadius.sheet} ${MemoryRadius.sheet} ${MemoryRadius.lg} ${MemoryRadius.lg}`,
          border: `1px solid ${MemorySurface.border.warm}`,
          background: MemorySurface.background.elevated,
          boxShadow: MemoryShadow.ambient,
          padding: MemorySpacing["2xl"],
          color: MemorySurface.content.primary,
        }}
      >
        {(title || description) && (
          <header style={{ marginBottom: MemorySpacing.lg }}>
            {title && (
              <h2 style={{ margin: 0, fontFamily: MemoryTypography.fontFamily.zh, fontSize: MemoryTypography.size.title }}>
                {title}
              </h2>
            )}
            {description && (
              <p style={{ margin: `${MemorySpacing.sm} 0 0`, color: MemorySurface.content.muted, lineHeight: MemoryTypography.lineHeight.normal }}>
                {description}
              </p>
            )}
          </header>
        )}
        <div>{children}</div>
        {footer && <footer style={{ marginTop: MemorySpacing.xl }}>{footer}</footer>}
      </div>
    </div>
  );
}
