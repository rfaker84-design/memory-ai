"use client";

import React from "react";
import { colors, radius } from "../../../styles/design-tokens";

/* =========================================================================
   AppInput — Apple-style input
   Blur background · rounded · no layout shift
   ========================================================================= */

interface AppInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
  multiline?: boolean;
  style?: React.CSSProperties;
}

export default function AppInput({
  value,
  onChange,
  onKeyDown,
  placeholder = "",
  type = "text",
  multiline = false,
  style,
}: AppInputProps) {
  const baseStyle: React.CSSProperties = {
    width: "100%",
    padding: "0 16px",
    borderRadius: radius.input,
    border: `0.5px solid ${colors.border}`,
    background: colors.surface,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 1.5,
    outline: "none",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    transition: "border-color 0.2s, box-shadow 0.2s",
    ...style,
  };

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          ...baseStyle,
          padding: "14px 16px",
          resize: "vertical",
          minHeight: 88,
          fontFamily: "inherit",
        }}
      />
    );
  }

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={{
        ...baseStyle,
        height: 48,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = colors.borderPrimary;
        e.currentTarget.style.boxShadow = `0 0 0 1px ${colors.primarySoft}`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}
