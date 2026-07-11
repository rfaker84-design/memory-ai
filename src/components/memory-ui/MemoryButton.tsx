"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from "react";

import { MemoryButton as MemoryButtonTokens, MemoryOpacity, MemoryRadius, MemorySpacing, MemorySurface, MemoryTypography } from "../../design";
import { usePressMotion, useReducedMotion } from "../../motion";

type MemoryButtonVariant = "primary" | "secondary" | "ghost";

export type MemoryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: MemoryButtonVariant;
  loading?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  href?: string;
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
  href,
  children,
  style,
  ...props
}: MemoryButtonProps) {
  const press = usePressMotion();
  const reducedMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  const content = (
    <>
      {loading ? <span aria-hidden="true">…</span> : leftSlot}
      <span>{children}</span>
      {!loading ? rightSlot : null}
    </>
  );

  const sharedStyle: CSSProperties = {
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
    textDecoration: "none",
    ...variantStyles[variant],
    ...style,
  };

  if (href) {
    const anchorProps = props as AnchorHTMLAttributes<HTMLAnchorElement>;
    const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>) => {
      anchorProps.onClick?.(event);
      if (event.defaultPrevented || isDisabled) return;

      event.preventDefault();
      window.location.assign(href);
    };

    return (
      <a
        {...anchorProps}
        href={isDisabled ? undefined : href}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        onClick={handleAnchorClick}
        style={{ ...sharedStyle, transform: "scale(1)" }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      {...props}
      {...(!isDisabled ? press.props : {})}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={sharedStyle}
    >
      {content}
    </button>
  );
}

