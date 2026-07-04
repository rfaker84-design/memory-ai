"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { MemoryButton as MemoryButtonTokens, MemoryOpacity, MemoryRadius, MemorySpacing, MemorySurface, MemoryTypography } from "../../design";
import { usePressMotion, useReducedMotion } from "../../motion";

type MemoryButtonVariant = "primary" | "secondary" | "ghost";

export type MemoryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: MemoryButtonVariant;
  loading?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
};

const variantStyles: Record<MemoryButtonVariant, CSSProperties> = {
  primary: MemoryButtonTokens.variants.primary,
  secondary: MemoryButtonTokens.variants.quiet,
  ghost: MemoryButtonTokens.variants.ghost,
};

export function MemoryButton({
  variant = "primary",
  loading = false,
  disabled,
  leftSlot,
  rightSlot,
  children,
  style,
  ...props
}: MemoryButtonProps) {
  const press = usePressMotion();
  const reducedMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      {...(!isDisabled ? press.props : {})}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{
        minHeight: MemoryButtonTokens.base.minHeight,
        paddingInline: MemoryButtonTokens.base.paddingInline,
        borderRadius: MemoryButtonTokens.base.borderRadius,
        border: variant === "ghost" ? "none" : `1px solid ${MemorySurface.border.warm}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: MemorySpacing.sm,
        fontFamily: MemoryTypography.fontFamily.zh,
        fontSize: MemoryButtonTokens.base.fontSize,
        fontWeight: MemoryButtonTokens.base.fontWeight,
        lineHeight: MemoryTypography.lineHeight.compact,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? MemoryOpacity.disabled : MemoryOpacity.full,
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        transitionProperty: reducedMotion ? "opacity" : "transform, opacity, background, box-shadow",
        transitionDuration: press.style.transitionDuration,
        transitionTimingFunction: press.style.transitionTimingFunction,
        transform: isDisabled ? "scale(1)" : press.style.transform,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {loading ? <span aria-hidden="true">…</span> : leftSlot}
      <span>{children}</span>
      {!loading ? rightSlot : null}
    </button>
  );
}

