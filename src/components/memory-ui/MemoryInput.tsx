"use client";

import type { CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { MemoryRadius, MemoryShadow, MemorySpacing, MemorySurface, MemoryTypography } from "../../design";
import { useReducedMotion } from "../../motion";

type NativeInputProps = InputHTMLAttributes<HTMLInputElement>;
type NativeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export type MemoryInputProps = (NativeInputProps | NativeTextareaProps) & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  multiline?: boolean;
};

export function MemoryInput({ label, hint, error, multiline = false, style, ...props }: MemoryInputProps) {
  const reduced = useReducedMotion();
  const controlStyle: CSSProperties = {
    width: "100%",
    minHeight: multiline ? 144 : 52,
    borderRadius: MemoryRadius.control,
    border: `1px solid ${error ? MemorySurface.state.danger : MemorySurface.border.subtle}`,
    background: "rgba(247, 239, 228, 0.055)",
    boxShadow: error ? MemoryShadow.focus : MemoryShadow.insetSurface,
    color: MemorySurface.content.primary,
    fontFamily: MemoryTypography.fontFamily.zh,
    fontSize: MemoryTypography.size.body,
    lineHeight: MemoryTypography.lineHeight.normal,
    padding: `${MemorySpacing.md} ${MemorySpacing.lg}`,
    outline: "none",
    resize: multiline ? "vertical" : undefined,
    transitionProperty: reduced ? "border-color" : "border-color, box-shadow, background",
    transitionDuration: "180ms",
    transitionTimingFunction: "ease-out",
    ...style,
  };

  return (
    <label style={{ display: "grid", gap: MemorySpacing.sm, width: "100%" }}>
      {label && (
        <span style={{ color: MemorySurface.content.secondary, fontSize: MemoryTypography.size.meta }}>
          {label}
        </span>
      )}
      {multiline ? (
        <textarea {...(props as NativeTextareaProps)} style={controlStyle} />
      ) : (
        <input {...(props as NativeInputProps)} style={controlStyle} />
      )}
      {(hint || error) && (
        <span style={{ color: error ? MemorySurface.state.danger : MemorySurface.content.muted, fontSize: MemoryTypography.size.caption }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}

